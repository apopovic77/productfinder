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

// ============================================================================
// GPANE Engine
// ============================================================================

export type EngineMode = 'taxonomy' | 'gpane';

export class GPANEEngine {
  private _config: GPANEConfig;
  private _allProducts: Product[] = [];
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

  setGroupingPath(keys: string[]): void {
    const changed = keys.join('>') !== this._groupingPath.join('>');
    this._groupingPath = [...keys];
    // Category as prescribed root: every category is a column, none may
    // fall into "Sonstige" — lift the bucket cap for this one dimension.
    if (keys.includes('category_primary')) {
      const overrides = { ...(this._config.overrides ?? {}) };
      overrides.category_primary = { ...(overrides.category_primary ?? {}), bucketCount: 64 };
      this._config = { ...this._config, overrides };
    }
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
  splitsProducts(key: string, products: Product[]): boolean {
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
      const k = v === null || v === undefined || v === '' ? '' : String(v);
      if (k) groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    let real = 0, singles = 0;
    for (const n of groups.values()) { if (n >= 2) real++; else singles += n; }
    if (real < 2) return false;
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
    if (!this._groupingPath.includes(key) && groups.size > this._config.maxBuckets * 1.5) return false;
    return true;
  }

  /** Dimensions that actually divide the currently visible products. */
  get usefulDimensions(): ScoredDimension[] {
    const products = this._getVisibleProducts();
    return this._scoredDimensions.filter(d => this.splitsProducts(d.key, products));
  }

  private _prescribedDimension(products: Product[]): ScoredDimension | null {
    const depth = this._focusStack.length;
    for (let i = depth; i < this._groupingPath.length; i++) {
      const key = this._groupingPath[i];
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

    if (node.children?.length) {
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
      this._focusStack.pop();

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
        const restoreDim = currentNav?.dimensionKey || null;
        this._switchToGpaneWithDimension(restoreDim);
      }
      return;
    }

    if (this._mode === 'taxonomy') {
      this.taxonomyBack();
      return;
    }

    // Pure GPANE mode (no taxonomy)
    this._focusStack.pop();
    const currentNav = this._navigationStack[this._navigationStack.length - 1];
    const restoreDim = currentNav?.dimensionKey || null;
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
   * Determine if hero mode should take over instead of further pivoting.
   * Hero competes with pivot dimensions via scoring:
   * - Few products → high hero score
   * - Low quality pivot dimensions → hero wins
   * - Deep drill level → hero more relevant
   */
  private _shouldUseHeroMode(products: Product[]): boolean {
    const count = products.length;
    const threshold = this._config.heroThreshold;

    // Too many products for hero
    if (count > threshold) return false;
    // No products
    if (count === 0) return false;

    // Hero score: inversely proportional to product count
    // At 1 product → 1.0, at threshold → 0.0
    const countScore = 1 - (count / threshold);

    // Drill depth bonus: deeper = more likely hero
    const depth = this._focusStack.length;
    const depthBonus = Math.min(0.3, depth * 0.1);

    // Dimension quality: how good is the best available pivot?
    const bestDimScore = this._scoredDimensions.length > 0
      ? this._scoredDimensions[0].score.total
      : 0;

    // Hero total score
    const heroScore = countScore + depthBonus;

    // Hero wins if it scores higher than the best dimension
    return heroScore > bestDimScore;
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

    // Check if hero mode should win over pivoting
    if (this._shouldUseHeroMode(products)) {
      this._activeDimension = null;
      this._buckets = [];
      this._heroMode = true;
      return;
    }
    this._heroMode = false;

    // Try to restore the requested dimension
    const restored = dimensionKey
      ? this._scoredDimensions.find(d => d.key === dimensionKey)
      : null;

    if (restored) {
      this._activeDimension = restored;
      this._buckets = buildBuckets(products, restored, this._config);
    } else if (this._scoredDimensions.length > 0) {
      const viable = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1 && this.splitsProducts(d.key, products));
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
      const viable0 = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1 && this.splitsProducts(d.key, products));
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
      const viable = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1 && this.splitsProducts(d.key, products));
      this._activeDimension = prescribed || viable[0] || null;
      this._buckets = this._activeDimension ? buildBuckets(products, this._activeDimension, this._config) : [];
    } else {
      this._activeDimension = null;
      this._buckets = [];
    }
  }

  private _getConstrainedProducts(): Product[] {
    if (this._constraints.length === 0) return this._allProducts;

    return this._allProducts.filter(product => {
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
