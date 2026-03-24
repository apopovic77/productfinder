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
  private _taxonomyPath: TaxonomyNode[] = [];
  private _navigationStack: NavigationEntry[] = [];  // single source of truth for breadcrumbs
  private _currentTaxonomyNodes: TaxonomyNode[] = [];  // nodes shown as buckets

  constructor(config: Partial<GPANEConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
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

    if (this._config.taxonomy?.length) {
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

    if (this._config.taxonomy?.length) {
      this._mode = 'taxonomy';
      this._currentTaxonomyNodes = this._config.taxonomy;
      this._buildTaxonomyBuckets();
    } else {
      this._mode = 'gpane';
      this._rescore();
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
    if (this._config.taxonomy?.length) {
      this._mode = 'taxonomy';
      this._currentTaxonomyNodes = this._config.taxonomy;
      this._buildTaxonomyBuckets();
    } else {
      this._selectInitialDimension();
    }
  }

  removeConstraint(index: number): void {
    this._constraints.splice(index, 1);
    this._focusStack = [];
    this._taxonomyPath = [];
    this._analyze();
    if (this._config.taxonomy?.length) {
      this._mode = 'taxonomy';
      this._currentTaxonomyNodes = this._config.taxonomy;
      this._buildTaxonomyBuckets();
    } else {
      this._selectInitialDimension();
    }
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
  get navigationStack(): NavigationEntry[] { return this._navigationStack; }

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

    // Try to restore the requested dimension
    const restored = dimensionKey
      ? this._scoredDimensions.find(d => d.key === dimensionKey)
      : null;

    if (restored) {
      this._activeDimension = restored;
      this._buckets = buildBuckets(products, restored, this._config);
    } else if (this._scoredDimensions.length > 0) {
      const viable = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1);
      this._activeDimension = viable[0] || this._scoredDimensions[0];
      this._buckets = buildBuckets(products, this._activeDimension, this._config);
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
      this._activeDimension = this._scoredDimensions[0];
      this._buckets = buildBuckets(products, this._activeDimension, this._config);
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

    if (this._scoredDimensions.length > 0) {
      const viable = this._scoredDimensions.filter(d => d.entropy > 0 && d.cardinality > 1);
      this._activeDimension = viable[0] || this._scoredDimensions[0];
      this._buckets = buildBuckets(products, this._activeDimension, this._config);
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
