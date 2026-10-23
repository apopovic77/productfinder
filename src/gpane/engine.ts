/**
 * GPANE — Engine (Main Entry Point)
 *
 * Two modes:
 * 1. Taxonomy mode (default when taxonomy config exists):
 *    Fixed navigation tree. User clicks through predefined categories.
 *    When tree ends or user picks a dimension manually → switches to GPANE mode.
 *
 * 2. GPANE mode (auto-scoring):
 *    Scores all dimensions and recommends the best pivot.
 *    Activated when no taxonomy, tree leaf reached, or user picks dimension.
 *
 * IRON RULE: No product is ever lost through pivoting.
 */

import type { Product } from '../types/Product';
import type {
  PropertyAnalysis,
  ScoredDimension,
  Bucket,
  Constraint,
  FocusEntry,
  PivotState,
  GPANEConfig,
  TaxonomyNode,
  NavigationEntry,
} from './types';
import { DEFAULT_CONFIG, getProductValue } from './types';
import { analyzeProperties } from './analyzer';
import { buildBuckets, canSubsplit } from './bucketer';
import { scoreDimensions } from './scorer';

/** Bis zu dieser Produktzahl reicht eine Gruppe mit mind. zwei Produkten. */
const SMALL_LEVEL_MAX = 12;
/** Von Hand waehlbare Dimension: hoechstens so viele Gruppen. */
const MANUAL_MAX_GROUPS = 40;
/** Bei gleicher Gruppierung gewinnt die Dimension weiter vorne. */
const PARTITION_PREFERENCE = ['product_line', 'design_group', 'color_base'];

// ============================================================================
// GPANE Engine
// ============================================================================

export type EngineMode = 'taxonomy' | 'gpane';

export class GPANEEngine {
  private _config: GPANEConfig;
  private _allProducts: Product[] = [];
  /** Zusaetzlicher Filter (z. B. Groesse), der die Navigation nicht zuruecksetzt. */
  private _productFilter: ((p: Product) => boolean) | null = null;
  private _dimensions: PropertyAnalysis[] = [];
  private _constraints: Constraint[] = [];
  private _focusStack: FocusEntry[] = [];
  private _dimensionHistory: string[] = [];
  private _activeDimension: ScoredDimension | null = null;
  private _buckets: Bucket[] = [];
  private _scoredDimensions: ScoredDimension[] = [];

  // Taxonomy state
  private _mode: EngineMode = 'gpane';
  private _skipTaxonomy = false;

  /**
   * Prescribed grouping order for the current entry (issue #260 follow-up,
   * owner decision 2026-08-23). The taxonomy tree ends exactly where the
   * catalog entry dialog drops the dealer (MX -> Helme etc.); below that,
   * pure scoring picked "Design" (one group per model) or "Preis" first.
   * A dealer reads a category the way the B2B shop lays it out: series or
   * line, then model, then colour. This list is consulted depth by depth;
   * scoring only takes over where the prescription yields nothing usable.
   */
  private _groupingPath: string[] = [];
  /**
   * Dynamic prescription (owner 2026-08-26): below a catalog-category root
   * the order depends on WHICH category was entered (helmets: line > design
   * > colour; gear: type > line > …). The resolver sees the focus stack and
   * returns the full path, or null to fall back to the static path.
   */
  private _groupingResolver: ((focus: FocusEntry[]) => string[] | null) | null = null;

  setGroupingResolver(resolver: ((focus: FocusEntry[]) => string[] | null) | null): void {
    this._groupingResolver = resolver;
  }

  private _effectiveGroupingPath(): string[] {
    return this._groupingResolver?.(this._focusStack) ?? this._taxonomyGroupingPath() ?? this._groupingPath;
  }

  /**
   * Gruppierung aus dem Taxonomie-Baum (Voll-Modus hat keine Katalog-
   * Kategorie, die sie vorgibt). Die Taxonomie-Ebenen belegen die ersten
   * Tiefen des Fokus-Stacks, die Vorgabe beginnt dahinter.
   */
  private _taxonomyGroupingPath(): string[] | null {
    for (let i = this._taxonomyPath.length - 1; i >= 0; i--) {
      const grouping = this._taxonomyPath[i].grouping;
      if (grouping?.length) {
        return [...Array(this._taxonomyPath.length).fill('__taxonomy__'), ...grouping];
      }
    }
    return null;
  }

  setGroupingPath(keys: string[]): void {
    const changed = keys.join('>') !== this._groupingPath.join('>');
    this._groupingPath = [...keys];
    // Category as prescribed root: every category is a column, none may
    // fall into "Sonstige" — lift the bucket cap for this one dimension.
    const overrides = { ...(this._config.overrides ?? {}) };
    for (const key of ['category_primary', 'catalog_category']) {
      if (keys.includes(key)) overrides[key] = { ...(overrides[key] ?? {}), bucketCount: 64 };
    }
    this._config = { ...this._config, overrides };
    // The prescription is consulted when a level is entered. If the engine
    // already loaded (products arrive before the catalog entry is applied),
    // the root keeps its scored pick — "Preis" instead of the category the
    // entry asked for (owner 2026-08-26, ?catview=pivot). Re-pick at root.
    if (changed && this._mode === 'gpane' && this._focusStack.length === 0 && this._allProducts.length > 0) {
      this._selectInitialDimension();
    }
  }

  /**
   * Dimension the prescription wants at the current depth, if it splits the
   * visible products into at least two real groups. Returns null when the
   * path is exhausted or the dimension is degenerate here (one value, or
   * a value on fewer than two products) — then scoring decides.
   */
  /**
   * Does this dimension split the given products into at least two groups
   * of two or more? Shared by the grouping prescription and the dimension
   * menu: a dimension with one bucket (e.g. "Körperteil" on helmets — always
   * "Kopf") is not a choice, it is a no-op that costs the dealer a click.
   */
  splitsProducts(key: string, products: Product[], manual = false): boolean {
    // Numeric dimensions (price) are grouped as RANGES by the bucketer, so
    // the raw-value singleton test below would reject them although the
    // actual grouping is fine (owner 2026-08-23: "warum fehlt Preis?").
    const scored = this._scoredDimensions.find(d => d.key === key);
    const strategy = scored?.recommendedStrategy ?? '';
    if (scored?.dataType === 'numeric_continuous' || scored?.dataType === 'numeric_discrete' || strategy.startsWith('range_')) {
      // Ask the actual bucketer: 17 helmets at (almost) one price passed a
      // distinct-values test, but the range boundaries collapse to a single
      // bucket — the pick then fell through to the hero row instead of a
      // price pivot (owner 2026-08-24, 120559).
      if (!scored) return false;
      const trial = buildBuckets(products, scored, this._config);
      const real = trial.filter(b => !b.isUnknown && b.count >= 1);
      return real.length >= 2;
    }
    const groups = new Map<string, number>();
    for (const prod of products) {
      const v = getProductValue(prod, key);
      // Mehrfachwerte zaehlen je Wert (ein Helm steht in jeder seiner Groessen)
      for (const item of Array.isArray(v) ? v : [v]) {
        const k = item === null || item === undefined || item === '' ? '' : String(item);
        if (k) groups.set(k, (groups.get(k) ?? 0) + 1);
      }
    }
    // Von Hand waehlbar (owner 2026-10-23: "Farbe sollte auch waehlbar
    // sein", ZEBRA-Stiefel in 12 Farben): mindestens zwei Gruppen, keine
    // Nulloperation, nicht ausufernd. Die strengen Regeln unten gelten nur
    // fuer die automatische Wahl.
    if (manual) {
      if (groups.size < 2 || groups.size > MANUAL_MAX_GROUPS) return false;
      return ![...groups.values()].every(n => n === products.length);
    }
    let real = 0, singles = 0;
    for (const n of groups.values()) { if (n >= 2) real++; else singles += n; }
    // Kleine Ebenen: eine echte Gruppe plus Einzelstuecke trennt sinnvoll
    // (RAINWEAR: 5 Jacken, 1 Hose — owner 2026-10-22). Der Einzelstueck-
    // Anteil unten haelt Listen (Brillen-Designs) weiter draussen.
    const small = products.length <= SMALL_LEVEL_MAX;
    if (groups.size < 2 || real < (small ? 1 : 2)) return false;
    // Steht jedes Produkt in jeder Gruppe (3SRS: jeder Helm in jeder Groesse),
    // trennt die Dimension nichts, wie eine Eigenschaft, die keiner hat: eine
    // Nulloperation, nicht waehlbar (owner 2026-10-22).
    if ([...groups.values()].every(n => n === products.length)) return false;
    // A level where most products would stand alone is a list, not a
    // grouping — it fills the stage with one-helmet columns or, capped by
    // maxBuckets, stuffs everything into "Sonstige" (owner report
    // 2026-08-23, storage 120478: 3SRS has 65 designs, 42 of them with a
    // single product). Skip it; the next level (colour) groups properly.
    if (singles > products.length * 0.4) return false;
    // More groups than the stage can show as columns is the same failure
    // from the other side: the overflow lands in "Sonstige". A prescribed
    // level is exempt: the catalog entry asked for exactly this split
    // (23 MX categories as root, ?catview=pivot) and lifts the bucket cap.
    if (!this._effectiveGroupingPath().includes(key) && groups.size > this._config.maxBuckets * 1.5) return false;
    return true;
  }

  /** Dimensions that actually divide the currently visible products. */
  get usefulDimensions(): ScoredDimension[] {
    const products = this._getVisibleProducts();
    return this._scoredDimensions.filter(d => this.splitsProducts(d.key, products));
  }

  /**
   * Dimensionen, die der Nutzer von Hand waehlen kann (lockerer als die
   * Automatik). Bilden zwei Dimensionen auf dieser Ebene genau dieselben
   * Gruppen (Design = Produktlinie bei Stiefeln), steht nur eine im Menue,
   * bevorzugt die vorne in PARTITION_PREFERENCE (owner 2026-10-23).
   */
  get selectableDimensions(): ScoredDimension[] {
    const products = this._getVisibleProducts();
    const candidates = this._scoredDimensions.filter(d => this.splitsProducts(d.key, products, true));
    const rank = (key: string) => {
      const i = PARTITION_PREFERENCE.indexOf(key);
      return i === -1 ? PARTITION_PREFERENCE.length : i;
    };
    const ordered = [...candidates].sort((a, b) => rank(a.key) - rank(b.key));
    const seen = new Set<string>();
    const keep = new Set<string>();
    for (const dim of ordered) {
      const signature = this._partitionSignature(dim.key, products);
      if (signature && seen.has(signature)) continue;
      if (signature) seen.add(signature);
      keep.add(dim.key);
    }
    // Serie und Modell sind fuer den Nutzer eine Art der Einteilung: teilt
    // die Serie (product_line), steht das Modell (design_group) nicht extra
    // im Menue; innerhalb einer Serie uebernimmt das Modell (owner 2026-10-23)
    if (keep.has('product_line')) keep.delete('design_group');
    return candidates.filter(d => keep.has(d.key));
  }

  /** Welche Produkte zusammen in einer Gruppe landen, unabhaengig von den Namen. */
  private _partitionSignature(key: string, products: Product[]): string {
    const scored = this._scoredDimensions.find(d => d.key === key);
    if (!scored || scored.dataType === 'multi_value') return '';
    const groups = new Map<string, string[]>();
    for (const bucket of buildBuckets(products, scored, this._config)) {
      if (bucket.isUnknown) continue;
      groups.set(bucket.label, [...bucket.objectIds].map(String).sort());
    }
    return [...groups.values()].map(ids => ids.join(',')).sort().join('|');
  }

  private _prescribedDimension(products: Product[]): ScoredDimension | null {
    const depth = this._focusStack.length;
    const path = this._effectiveGroupingPath();
    for (let i = depth; i < path.length; i++) {
      const key = path[i];
      const dim = this._scoredDimensions.find(d => d.key === key);
      if (!dim) continue;
      // The level must actually divide: at least two groups that each hold
      // two or more products. cardinality alone lied twice in the audit —
      // "Design" under 3SRS had two values, one of them empty (one group,
      // a wasted click), and goggles designs carried colours in their
      // names (one product per group, a list).
      if (!this.splitsProducts(key, products)) continue;
      return dim;
    }
    return null;
  }
  private _heroMode = false;
  private _taxonomyPath: TaxonomyNode[] = [];
  private _navigationStack: NavigationEntry[] = [];  // single source of truth for breadcrumbs
  private _currentTaxonomyNodes: TaxonomyNode[] = [];  // nodes shown as buckets

  constructor(config: Partial<GPANEConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Hide attribute keys from dimension discovery, e.g. a dimension the
   * catalog entry has already decided. Takes effect on the next load().
   */
  /** Start in GPANE mode on next load() instead of at the taxonomy root. */
  setSkipTaxonomy(skip: boolean): void {
    this._skipTaxonomy = skip;
  }

  setHiddenKeys(keys: string[]): void {
    const overrides = { ...this._config.overrides };
    for (const k of Object.keys(overrides)) {
      if (overrides[k]?.hidden && overrides[k]?.__upstreamLock) delete overrides[k];
    }
    for (const k of keys) {
      overrides[k] = { ...(overrides[k] ?? {}), hidden: true, __upstreamLock: true };
    }
    this._config = { ...this._config, overrides };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  load(products: Product[]): void {
    this._allProducts = products;
    this._constraints = [];
    this._focusStack = [];
    this._dimensionHistory = [];
    this._taxonomyPath = [];
    this._navigationStack = [];

    // The taxonomy tree starts at MTB | MX. When the catalog entry has
    // already answered that question (sport -> category dialog), replaying
    // the tree's root is exactly the bug the owner reported: "I chose MOTO
    // and still see MX | MTB". Entry-driven sessions skip the tree and
    // start in GPANE mode, where locked dimensions are honoured.
    if (this._config.taxonomy?.length && !this._skipTaxonomy) {
      this._mode = 'taxonomy';
      this._currentTaxonomyNodes = this._config.taxonomy;
      this._buildTaxonomyBuckets();
    } else {
      this._mode = 'gpane';
      this._analyze();
      this._selectInitialDimension();
    }
  }

  updateConfig(config: Partial<GPANEConfig>): void {
    this._config = { ...this._config, ...config };
    this.load(this._allProducts);
  }

  // ==========================================================================
  // Taxonomy Navigation
  // ==========================================================================

  /**
   * Click a taxonomy node (e.g. "MTB" → "Helme" → "Full Face").
   * Drills into that node's children, or switches to GPANE mode if leaf.
   */
  taxonomyDrillDown(slug: string): void {
    if (this._mode !== 'taxonomy') return;

    const node = this._currentTaxonomyNodes.find(n => n.slug === slug);
    if (!node) return;

    // Geschwister der verlassenen Ebene fuer den Breadcrumb-Dropdown
    const siblings = this._buckets.filter(b => !b.isUnknown).map(b => b.label);

    this._taxonomyPath.push(node);

    const products = this._getVisibleProducts();
    const matchingIds = products.filter(p => node.match(p)).map(p => p.id);

    this._focusStack.push({
      dimension: '__taxonomy__',
      bucketLabel: node.label,
      objectIds: matchingIds,
    });

    // Eine Kategorie, deren Unterkategorien die Produkte nicht teilen (alle
    // 40 Street-/Adventure-Helme unter "Street"), ist keine Ebene: eine
    // einzige Gruppe, keine Spalten moeglich. Dann wie ein Blatt behandeln,
    // GPANE gruppiert (owner 2026-10-22, Protokoll 202610221752-9uu1).
    const remaining = this._getVisibleProducts();
    const childrenSplit = (node.children ?? [])
      .filter(child => remaining.some(p => child.match(p))).length >= 2;
    if (node.children?.length && childrenSplit) {
      this._currentTaxonomyNodes = node.children;
      this._buildTaxonomyBuckets();
      // Nav stack: taxonomy level
      this._navigationStack.push({
        label: node.label,
        source: 'taxonomy',
        dimensionKey: null,
        dimensionLabel: 'Taxonomie',
        objectIds: matchingIds,
        siblings,
      });
    } else {
      // Leaf → GPANE takes over
      this._switchToGpane();
      // Nav stack: taxonomy leaf but grouped by GPANE dimension
      this._navigationStack.push({
        label: node.label,
        source: 'gpane',
        dimensionKey: this._activeDimension?.key || null,
        dimensionLabel: this._activeDimension?.label || null,
        objectIds: matchingIds,
        siblings,
      });
    }
  }

  /**
   * Go back one taxonomy level.
   */
  taxonomyBack(): void {
    if (this._taxonomyPath.length === 0) return;

    this._taxonomyPath.pop();
    this._focusStack.pop();

    if (this._taxonomyPath.length === 0) {
      // Back to root
      this._mode = 'taxonomy';
      this._currentTaxonomyNodes = this._config.taxonomy || [];
      this._buildTaxonomyBuckets();
    } else {
      // Back to parent's children
      const parent = this._taxonomyPath[this._taxonomyPath.length - 1];
      if (parent.children?.length) {
        this._mode = 'taxonomy';
        this._currentTaxonomyNodes = parent.children;
        this._buildTaxonomyBuckets();
      } else {
        this._switchToGpane();
      }
    }
  }

  // ==========================================================================
  // Pivot Operations (GPANE Mode)
  // ==========================================================================

  /**
   * Switch to a different dimension.
   * If in taxonomy mode, this breaks out into GPANE mode.
   */
  pivotTo(dimensionKey: string): void {
    if (this._mode === 'taxonomy') {
      this._switchToGpane();
    }

    const dim = this._scoredDimensions.find(d => d.key === dimensionKey);
    if (!dim) return;

    this._activeDimension = dim;
    this._buckets = buildBuckets(this._getVisibleProducts(), dim, this._config);
    this._dimensionHistory.push(dimensionKey);

    // Update last nav entry to reflect the new dimension
    if (this._navigationStack.length > 0) {
      const last = this._navigationStack[this._navigationStack.length - 1];
      last.source = 'gpane';
      last.dimensionKey = dim.key;
      last.dimensionLabel = dim.label;
    }
  }

  focusBucket(bucketLabel: string): void {
    const bucket = this._buckets.find(b => b.label === bucketLabel);
    if (!bucket || bucket.isUnknown) return;

    // Geschwister JETZT sichern — _rescore() unten ersetzt _buckets durch
    // die Buckets der neuen Ebene (Breadcrumb-Dropdown, 2026-08-25).
    const siblings = this._buckets.filter(b => !b.isUnknown).map(b => b.label);

    const dimKey = this._activeDimension?.key || '__taxonomy__';

    this._focusStack.push({
      dimension: dimKey,
      bucketLabel,
      objectIds: bucket.objectIds,
    });

    if (this._mode === 'gpane') {
      this._rescore();

      // Nav stack: GPANE bucket focus
      this._navigationStack.push({
        label: bucketLabel,
        source: 'gpane',
        dimensionKey: this._activeDimension?.key || dimKey,
        dimensionLabel: this._activeDimension?.label || dimKey,
        objectIds: bucket.objectIds,
        siblings,
      });
    }
  }

  unfocus(): void {
    if (this._navigationStack.length === 0 && this._focusStack.length === 0) return;

    // Pop nav stack
    const poppedNav = this._navigationStack.pop();

    if (this._mode === 'gpane' && this._taxonomyPath.length > 0) {
      const left = this._focusStack.pop();

      if (this._focusStack.length < this._taxonomyPath.length) {
        // Going back INTO taxonomy — pop taxonomy path too
        this._taxonomyPath.pop();

        if (this._taxonomyPath.length === 0) {
          this._mode = 'taxonomy';
          this._currentTaxonomyNodes = this._config.taxonomy || [];
          this._buildTaxonomyBuckets();
        } else {
          const parent = this._taxonomyPath[this._taxonomyPath.length - 1];
          if (parent.children?.length) {
            this._mode = 'taxonomy';
            this._currentTaxonomyNodes = parent.children;
            this._buildTaxonomyBuckets();
          } else {
            this._switchToGpane();
          }
        }
      } else {
        // Still in GPANE — restore the dimension from the nav entry we're going BACK to
        const currentNav = this._navigationStack[this._navigationStack.length - 1];
        const restoreDim = levelDimension(left) || currentNav?.dimensionKey || null;
        this._switchToGpaneWithDimension(restoreDim);
      }
      return;
    }

    if (this._mode === 'taxonomy') {
      this.taxonomyBack();
      return;
    }

    // Pure GPANE mode (no taxonomy)
    const left = this._focusStack.pop();
    const currentNav = this._navigationStack[this._navigationStack.length - 1];
    // Die Dimension, in der die Ebene verlassen wurde (Groesse -> S -> zurueck
    // landete sonst ohne Gruppierung, owner 2026-10-22)
    const restoreDim = levelDimension(left) || currentNav?.dimensionKey || null;
    if (restoreDim) {
      this._switchToGpaneWithDimension(restoreDim);
    } else {
      this._rescore();
    }
  }

  /**
   * Full reset — back to taxonomy root (or GPANE initial).
   */
  reset(): void {
    this._focusStack = [];
    this._dimensionHistory = [];
    this._taxonomyPath = [];
    this._navigationStack = [];

    this._enterRoot(() => this._rescore());
  }

  /**
   * Root of the navigation: the taxonomy tree unless the session skips it
   * (catalog entry already answered "which sport"). Shared by load, reset
   * and the constraint paths — reset() used to re-enter the tree on its
   * own and "Alle" in an entry session showed MTB | MX | Frauen again
   * (2026-08-23).
   */
  private _enterRoot(gpaneInit: () => void): void {
    if (this._config.taxonomy?.length && !this._skipTaxonomy) {
      this._mode = 'taxonomy';
      this._currentTaxonomyNodes = this._config.taxonomy;
      this._buildTaxonomyBuckets();
    } else {
      this._mode = 'gpane';
      gpaneInit();
    }
  }

  // ==========================================================================
  // Constraint Operations
  // ==========================================================================

  addConstraint(constraint: Constraint): void {
    this._constraints.push(constraint);
    this._focusStack = [];
    this._taxonomyPath = [];
    this._analyze();
    this._enterRoot(() => this._selectInitialDimension());
  }

  removeConstraint(index: number): void {
    this._constraints.splice(index, 1);
    this._focusStack = [];
    this._taxonomyPath = [];
    this._analyze();
    this._enterRoot(() => this._selectInitialDimension());
  }

  clearConstraints(): void {
    this._constraints = [];
    this.reset();
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  getState(): PivotState {
    return {
      allObjects: this._allProducts,
      constraints: this._constraints,
      constrainedObjects: this._getConstrainedProducts(),
      focusStack: this._focusStack,
      focusedObjects: this._getFocusedProducts(),
      activeDimension: this._activeDimension,
      buckets: this._buckets,
      dimensionHistory: this._dimensionHistory,
      availableDimensions: this._scoredDimensions,
      navigationStack: this._navigationStack,
    };
  }

  get mode(): EngineMode { return this._mode; }
  get taxonomyPath(): TaxonomyNode[] { return this._taxonomyPath; }
  get currentTaxonomyNodes(): TaxonomyNode[] { return this._currentTaxonomyNodes; }
  get allProducts(): Product[] { return this._allProducts; }
  get constrainedProducts(): Product[] { return this._getConstrainedProducts(); }
  get focusedProducts(): Product[] { return this._getFocusedProducts(); }
  get activeDimension(): ScoredDimension | null { return this._activeDimension; }
  get buckets(): Bucket[] { return this._buckets; }
  get scoredDimensions(): ScoredDimension[] { return this._scoredDimensions; }
  get dimensions(): PropertyAnalysis[] { return this._dimensions; }
  get focusDepth(): number { return this._focusStack.length; }
  get config(): GPANEConfig { return this._config; }
  get productCount(): number { return this._allProducts.length; }
  get canUnfocus(): boolean { return this._focusStack.length > 0 || this._taxonomyPath.length > 0; }

  get isTaxonomy(): boolean { return this._mode === 'taxonomy'; }
  get isHeroMode(): boolean { return this._heroMode; }
  get navigationStack(): NavigationEntry[] { return this._navigationStack; }

  /**
   * Hero (bzw. flache Uebersicht) nur, wenn keine Dimension die Produkte
   * sinnvoll teilt. Vorher gewann Hero, sobald seine Bewertung ueber der
   * bestbewerteten Dimension lag — auch wenn diese gar nicht trennte oder nie
   * automatisch gewaehlt wird. RAINWEAR > Jacke zeigte so eine einzelne
   * Gruppe statt einer Gruppierung (owner 2026-10-22).
   */
  private _shouldUseHeroMode(products: Product[]): boolean {
    const count = products.length;
    if (count === 0 || count > this._config.heroThreshold) return false;
    if (this._prescribedDimension(products)) return false;
    const groupable = this._scoredDimensions.some(d =>
      d.entropy > 0 && d.cardinality > 1 && !isNeverAutoPicked(d) && this.splitsProducts(d.key, products));
    return !groupable;
  }

  canSubsplit(dimensionKey: string, bucketObjectIds: string[]): boolean {
    return canSubsplit(bucketObjectIds, this._allProducts, dimensionKey);
  }

  // ==========================================================================
  // Internal — Taxonomy
  // ==========================================================================

  /**
   * Build buckets from current taxonomy nodes.
   * Each node becomes a bucket with its matched product count.
   */
  private _buildTaxonomyBuckets(): void {
    const products = this._getVisibleProducts();
    this._activeDimension = null;

    this._buckets = this._currentTaxonomyNodes.map(node => {
      const matchingIds = products.filter(p => node.match(p)).map(p => p.id);
      return {
        label: node.label,
        count: matchingIds.length,
        objectIds: matchingIds,
        isUnknown: false,
        isOther: false,
        range: null,
      };
    }).filter(b => b.count > 0);  // hide empty taxonomy nodes

    // Eine Kategorie-Ebene mit nur einer Gruppe trennt nichts (Suche "kini":
    // nur "Kini Red Bull" auf der obersten Ebene, AI-Explorer 2026-10-22).
    // Dann gruppiert GPANE. Gilt fuer Wurzel und Zurueck; beim Hineinklicken
    // faengt taxonomyDrillDown den Fall schon vorher ab.
    if (this._buckets.length < 2 && products.length > 1) {
      this._switchToGpane();
      return;
    }

    // Also run analysis in background so dimensions are available for manual pivot
    this._analyze();
    const visible = this._getVisibleProducts();
    this._scoredDimensions = scoreDimensions(
      this._dimensions,
      visible,
      null,
      this._dimensionHistory,
      this._config
    );
  }

  /**
   * Switch from taxonomy to GPANE auto-scoring mode.
   */
  private _switchToGpane(): void {
    this._switchToGpaneWithDimension(null);
  }

  /**
   * Switch to GPANE mode, optionally restoring a specific dimension.
   * If dimensionKey is null, auto-picks the best dimension.
   * If dimensionKey is provided, restores that dimension (e.g. when going back).
   */
  private _switchToGpaneWithDimension(dimensionKey: string | null | undefined): void {
    this._mode = 'gpane';
    this._currentTaxonomyNodes = [];
    this._analyze();
    const products = this._getVisibleProducts();
    this._scoredDimensions = scoreDimensions(
      this._dimensions,
      products,
      null,
      this._dimensionHistory,
      this._config
    );

    // Zurueck auf eine Ebene, die gruppiert war: dieselbe Gruppierung wieder,
    // bevor die Hero-Pruefung entscheidet. Sonst kippte die Ebene nach dem
    // Hochgehen in die Hero-Reihe, weil sich die Bewertung ohne aktive
    // Dimension anders rechnet als beim Hineingehen (owner 2026-10-21,
    // B-22 -> PAINT -> zurueck, media 131764-131766).
    const restored = dimensionKey
      ? this._scoredDimensions.find(d => d.key === dimensionKey && this.splitsProducts(d.key, products))
      : null;
    if (restored) {
      this._heroMode = false;
      this._activeDimension = restored;
      this._buckets = buildBuckets(products, restored, this._config);
      return;
    }

    // Check if hero mode should win over pivoting
    if (this._shouldUseHeroMode(products)) {
      this._activeDimension = null;
      this._buckets = [];
      this._heroMode = true;
      return;
    }
    this._heroMode = false;

    if (this._scoredDimensions.length > 0) {
      const viable = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1 && !isNeverAutoPicked(d) && this.splitsProducts(d.key, products));
      this._activeDimension = this._prescribedDimension(products) || viable[0] || null;
      this._buckets = this._activeDimension ? buildBuckets(products, this._activeDimension, this._config) : [];
    } else {
      this._activeDimension = null;
      this._buckets = [];
    }
  }

  // ==========================================================================
  // Internal — GPANE
  // ==========================================================================

  private _analyze(): void {
    const products = this._getConstrainedProducts();
    this._dimensions = analyzeProperties(products, this._config);
  }

  private _selectInitialDimension(): void {
    const products = this._getVisibleProducts();
    this._scoredDimensions = scoreDimensions(
      this._dimensions,
      products,
      null,
      this._dimensionHistory,
      this._config
    );

    if (this._scoredDimensions.length > 0) {
      const viable0 = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1 && !isNeverAutoPicked(d) && this.splitsProducts(d.key, products));
      this._activeDimension = this._prescribedDimension(products) || viable0[0] || null;
      this._buckets = this._activeDimension ? buildBuckets(products, this._activeDimension, this._config) : [];
    } else {
      this._activeDimension = null;
      this._buckets = [];
    }
  }

  private _rescore(): void {
    const products = this._getVisibleProducts();
    const activeKey = this._activeDimension?.key || null;

    this._scoredDimensions = scoreDimensions(
      this._dimensions,
      products,
      activeKey,
      this._dimensionHistory,
      this._config
    );

    // Check hero mode
    if (this._shouldUseHeroMode(products)) {
      this._activeDimension = null;
      this._buckets = [];
      this._heroMode = true;
      return;
    }
    this._heroMode = false;

    if (this._scoredDimensions.length > 0) {
      const prescribed = this._prescribedDimension(products);
      // Scoring may only pick what actually groups (same rule as the
      // prescription) — else "Design" returns with 42 singletons and a
      // 68-item "Sonstige" the moment the prescription declines it.
      // Nothing groups -> no dimension -> the products show as a hero row.
      const viable = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1 && !isNeverAutoPicked(d) && this.splitsProducts(d.key, products));
      this._activeDimension = prescribed || viable[0] || null;
      this._buckets = this._activeDimension ? buildBuckets(products, this._activeDimension, this._config) : [];
    } else {
      this._activeDimension = null;
      this._buckets = [];
    }
  }

  /**
   * Filter auf der aktuellen Ebene setzen oder loeschen (Groessenfilter,
   * owner 2026-10-21). Anders als load() bleiben Ebene und Dimension; nur die
   * Gruppen werden mit den gefilterten Produkten neu gebildet.
   */
  setProductFilter(filter: ((p: Product) => boolean) | null): void {
    this._productFilter = filter;
    if (this._mode === 'taxonomy') {
      this._buildTaxonomyBuckets();
      return;
    }
    if (this._activeDimension) {
      this._buckets = buildBuckets(this._getVisibleProducts(), this._activeDimension, this._config);
    }
  }

  private _getConstrainedProducts(): Product[] {
    const base = this._productFilter ? this._allProducts.filter(this._productFilter) : this._allProducts;
    if (this._constraints.length === 0) return base;

    return base.filter(product => {
      for (const constraint of this._constraints) {
        if (!matchesConstraint(product, constraint)) return false;
      }
      return true;
    });
  }

  private _getFocusedProducts(): Product[] {
    const constrained = this._getConstrainedProducts();
    if (this._focusStack.length === 0) return constrained;

    const lastFocus = this._focusStack[this._focusStack.length - 1];
    const focusIds = new Set(lastFocus.objectIds);
    return constrained.filter(p => focusIds.has(p.id));
  }

  private _getVisibleProducts(): Product[] {
    return this._getFocusedProducts();
  }
}

/**
 * Preis und Jahrgang waehlt die Engine nie selbst: Rainwear, Youth Goggles
 * und Kini Gloves standen als "< 90 € / >= 90 €" da, danach Rainwear als
 * "2017 / 2018 / 2024", obwohl beides nichts ueber die Produkte sagt (Review
 * 2026-10-21, Sonja Goldmann). Als Pivot von Hand bleiben beide waehlbar.
 */
/** Dimension der Ebene, aus der ein Fokus-Eintrag stammt (nicht die Taxonomie). */
function levelDimension(entry: { dimension: string } | undefined): string | null {
  return entry && entry.dimension !== '__taxonomy__' ? entry.dimension : null;
}

function isNeverAutoPicked(dim: ScoredDimension): boolean {
  const key = dim.key;
  // Mehrfachwerte (Groesse): ein Produkt stuende in mehreren Gruppen. Das ist
  // ein Filter auf Wunsch, keine Startsicht; bei RAINWEAR blieb Groesse mit
  // der schlechtesten Bewertung als einzige uebrig (owner 2026-10-22).
  if (dim.dataType === 'multi_value') return true;
  return key === 'price' || key.startsWith('price_') || key === 'model_year';
}

// ============================================================================
// Constraint Matching
// ============================================================================

function matchesConstraint(product: Product, constraint: Constraint): boolean {
  const value = getProductValue(product, constraint.dimension);

  switch (constraint.operator) {
    case 'eq':
      return value === constraint.value;
    case 'neq':
      return value !== constraint.value;
    case 'gt':
      return Number(value) > Number(constraint.value);
    case 'lt':
      return Number(value) < Number(constraint.value);
    case 'gte':
      return Number(value) >= Number(constraint.value);
    case 'lte':
      return Number(value) <= Number(constraint.value);
    case 'range': {
      const [min, max] = constraint.value as [number, number];
      const num = Number(value);
      return num >= min && num <= max;
    }
    case 'in':
      return Array.isArray(constraint.value)
        ? (constraint.value as unknown[]).includes(value)
        : false;
    default:
      return true;
  }
}
