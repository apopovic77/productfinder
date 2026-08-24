/**
 * GPANE Pivot Service
 *
 * Drop-in replacement for PivotDrillDownService.
 * Wraps GPANEEngine and provides the same API that LayoutService expects.
 *
 * Two modes:
 * - Taxonomy: follows predefined navigation tree (oneal.eu menu)
 * - GPANE: auto-scored dimensions (when tree ends or user picks dimension)
 */

import type { Product } from '../types/Product';
import { PivotGroup } from '../layout/PivotGroup';
import type {
  GPANEConfig,
  Bucket,
  TaxonomyNode,
} from './types';
import { getProductValue } from './types';
import { GPANEEngine } from './engine';
import type { EngineMode } from './engine';
import { PivotDimension } from '../domain/PivotDimension';
import type {
  PivotAnalysisResult,
  PivotDimensionDefinition,
  PivotDimensionKind,
} from '../services/PivotDimensionAnalyzer';

export type GroupDimension = string;

export type PriceBucketConfig = {
  mode: string;
  bucketCount: number;
};

type DrillDownFilter = {
  dimension: GroupDimension;
  value: string;
  range?: { min: number; max: number; inclusiveMax: boolean };
};

export type DrillDownState = {
  dimension: GroupDimension;
  filters: DrillDownFilter[];
};

const HERO_THRESHOLD = 40; // Owner-Feedback 02.08.: nach Preis-Klick Produkte zeigen, keine weitere Dimension

/**
 * GPANE-backed pivot service.
 * Implements the same public API as PivotDrillDownService.
 */
export class GpanePivotService {
  private engine: GPANEEngine;
  private gpaneConfig: GPANEConfig;
  private _products: Product[] = [];
  private _loaded = false;
  private _heroThreshold = HERO_THRESHOLD;
  private _heroModeActive = false;
  private _userSelectedDimension = false;

  // Caches for LayoutService compatibility
  private _currentBuckets: Bucket[] = [];
  private _groupMap: Map<string, Product[]> = new Map();
  private _productGroupKey: Map<string, string> = new Map();

  // Compatibility: dimension order for sorting
  private _dimensionOrder = new Map<GroupDimension, Map<string, number>>();

  // Old model bridge: keep dimension definitions for compatibility
  private _legacyDimensions: PivotDimensionDefinition[] = [];
  private _legacyDimensionByKey = new Map<GroupDimension, PivotDimensionDefinition>();

  constructor(config: GPANEConfig) {
    this.gpaneConfig = config;
    this.engine = new GPANEEngine(config);
  }

  // ==========================================================================
  // Model / Initialization (called by LayoutService.setPivotModel)
  // ==========================================================================

  setModel(analysis: PivotAnalysisResult | null): void {
    // Store legacy dimensions for compatibility
    this._legacyDimensions = analysis?.dimensions ?? [];
    this._legacyDimensionByKey.clear();
    for (const d of this._legacyDimensions) {
      this._legacyDimensionByKey.set(d.key, d);
    }
    // Engine gets loaded when products change (via sync), not here
  }

  /** Prescribed grouping order for the current catalog entry (see CatalogCategoryConfig.grouping). */
  setGroupingPath(keys: string[]): void {
    this.engine.setGroupingPath(keys);
  }

  /** Dimensions decided upstream (catalog entry) must never be offered. */
  setLockedDimensions(keys: string[]): void {
    this.engine.setHiddenKeys(keys);
    // A lock only exists when an upstream dialog already navigated; the
    // taxonomy root would re-ask the same question, so skip it.
    this.engine.setSkipTaxonomy(keys.length > 0);
  }

  setHeroThreshold(threshold: number): void {
    this._heroThreshold = Math.max(1, Math.floor(threshold));
  }

  setPriceBucketConfig(_config: PriceBucketConfig): void {
    // GPANE handles bucketing internally — config is part of GPANEConfig.maxBuckets
  }

  setDimensionOrder(dimension: GroupDimension, order: Map<string, number>): void {
    this._dimensionOrder.set(dimension, order);
  }

  // ==========================================================================
  // Product Loading (called when products change)
  // ==========================================================================

  loadProducts(products: Product[]): void {
    // Only load engine ONCE with the initial product set.
    // After that, navigation state (taxonomy path, focus stack, mode) must be preserved.
    // onDataChanged() calls sync() which calls this on every click — we must not reset.
    if (this._loaded) return;

    this._loaded = true;
    this._products = products;
    this.engine.load(products);
    this._rebuildGroupCache();
  }

  /**
   * Force reload with new products (e.g. after API re-fetch or filter change).
   */
  forceReload(products: Product[]): void {
    this._loaded = true;
    this._products = products;
    this.engine.load(products);
    this._rebuildGroupCache();
  }

  // ==========================================================================
  // Dimension Selection
  // ==========================================================================

  setDimension(dimension: GroupDimension): void {
    this._userSelectedDimension = true;
    this.engine.pivotTo(dimension);
    this._rebuildGroupCache();
  }

  setGroupingDimension(dimension: GroupDimension): void {
    this.setDimension(dimension);
  }

  getDimension(): GroupDimension {
    if (this.engine.mode === 'taxonomy') {
      return '__taxonomy__';
    }
    return this.engine.activeDimension?.key || '__taxonomy__';
  }

  getHierarchy(): GroupDimension[] {
    // Return available dimensions as the "hierarchy"
    return this.engine.scoredDimensions.map(d => d.key);
  }

  getAvailableDimensions(_products: Product[]): GroupDimension[] {
    // Only dimensions that divide what is on screen. Owner report 2026-08-23
    // (storage 120460): "Körperteil" was offered on 42 MX helmets and put
    // all of them under one header, KOPF. A dimension with one column is
    // not selectable — it is not a grouping.
    return this.engine.usefulDimensions.map(d => d.key);
  }

  canUseDimension(dimension: GroupDimension): boolean {
    if (dimension === '__taxonomy__') return true;
    if (dimension === 'poster:group') return false; // not supported in GPANE
    return this.engine.usefulDimensions.some(d => d.key === dimension);
  }

  // ==========================================================================
  // Drill-Down / Navigation
  // ==========================================================================

  drillDown(value: string): boolean {
    if (this.engine.mode === 'taxonomy') {
      // Find taxonomy node by label
      const node = this.engine.currentTaxonomyNodes.find(n => n.label === value);
      if (node) {
        this.engine.taxonomyDrillDown(node.slug);
        this._rebuildGroupCache();
        return true;
      }
    }

    // GPANE mode: focus on bucket
    this.engine.focusBucket(value);
    this._rebuildGroupCache();
    return true;
  }

  drillUp(): boolean {
    if (!this.canDrillUp()) return false;
    this.engine.unfocus();
    this._rebuildGroupCache();
    return true;
  }

  reset(): void {
    this._userSelectedDimension = false;
    this.engine.reset();
    this._rebuildGroupCache();
  }

  canDrillDown(): boolean {
    return this._currentBuckets.length > 0;
  }

  canDrillUp(): boolean {
    return this.engine.canUnfocus;
  }

  // ==========================================================================
  // Filter / State
  // ==========================================================================

  getFilters(): DrillDownFilter[] {
    // Map focus stack to DrillDownFilter format
    const state = this.engine.getState();
    return state.focusStack.map(entry => ({
      dimension: entry.dimension,
      value: entry.bucketLabel,
    }));
  }

  getBreadcrumbs(): string[] {
    // Group names only. "2SRS nach Design › 2SRS Helmet RUSH nach design"
    // told the dealer which dimension the engine used — developer info that
    // doubled the trail's width and collided with the search field
    // (design 2026-08-23). A crumb repeats its parent as prefix when the
    // child's label starts with it ("2SRS" › "2SRS Helmet RUSH"); strip it
    // so the trail reads "2SRS › Helmet RUSH".
    const crumbs = ['Alle'];
    let prev = '';
    for (const entry of this.engine.navigationStack) {
      let label = entry.label;
      if (prev && label.toLowerCase().startsWith(prev.toLowerCase() + ' ')) {
        label = label.slice(prev.length).trim();
      }
      crumbs.push(label);
      prev = entry.label;
    }
    return crumbs;
  }

  getState(): DrillDownState {
    return {
      dimension: this.getDimension(),
      filters: this.getFilters(),
    };
  }

  setState(_state: DrillDownState): void {
    // No-op. GPANE manages its own state internally.
    // The old PivotDrillDownService needed save/restore via setState,
    // but GPANE's engine keeps its state (taxonomy path, focus stack, mode)
    // across setPivotModel calls. Calling reset() here would destroy
    // the navigation state after every onDataChanged cycle.
  }

  // ==========================================================================
  // Grouping (the core output LayoutService needs)
  // ==========================================================================

  filterProducts(products: Product[]): Product[] {
    const focused = this.engine.focusedProducts;

    // MEMBERSHIP comes from the engine (focus stack), but the ORDER comes
    // from the caller: `products` is the filter-and-SORTED list from the
    // controller. Returning focusedProducts as-is froze everything in load
    // order and the Sort dropdown visibly did nothing (owner 2026-08-24).
    const orderIndex = new Map(products.map((p, i) => [p.id, i] as const));
    const ordered = focused.slice().sort(
      (a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );

    // In taxonomy mode: only show products that match current taxonomy nodes
    if (this.engine.mode === 'taxonomy' && this._currentBuckets.length > 0) {
      const matchedIds = new Set<string>();
      for (const bucket of this._currentBuckets) {
        for (const id of bucket.objectIds) matchedIds.add(id);
      }
      // Use focused products (respects focus stack), filtered to current nodes
      return ordered.filter(p => matchedIds.has(p.id));
    }

    return ordered;
  }

  groupProducts(products: Product[]): Map<string, Product[]> {
    // Use cached group map (rebuilt on every navigation action)
    const filtered = this.engine.focusedProducts;
    // Hero/overview only when nothing actually buckets: with an active
    // dimension that splits (Jacke|Hose, or a user pick from the menu) the
    // pivot must win — the old count-only fallback kept RAINWEAR in the
    // flat view even after choosing a dimension (owner 2026-08-24, 120554).
    const hasSplit = this._currentBuckets.length > 1;
    this._heroModeActive = !hasSplit && filtered.length > 0 && filtered.length <= this._heroThreshold;
    return this._groupMap;
  }

  createGroups(products: Product[]): PivotGroup[] {
    this.groupProducts(products); // ensure cache is fresh
    const groups: PivotGroup[] = [];

    for (const bucket of this._currentBuckets) {
      if (bucket.count === 0) continue;
      const group = new PivotGroup(
        bucket.label,
        bucket.label,
        this.engine.getState().focusStack.length
      );
      groups.push(group);
    }

    return groups;
  }

  getGroupKey(product: Product): string {
    return this._productGroupKey.get(product.id) || 'N/A';
  }

  isHeroModeActive(): boolean {
    // GPANE engine decides hero mode via scoring (competes with pivot dimensions)
    if (this.engine.isHeroMode) return true;
    // Fallback: old threshold-based check
    return this._heroModeActive;
  }

  // ==========================================================================
  // Compatibility Methods
  // ==========================================================================

  resolveValue(product: Product, dimension: GroupDimension): string {
    const val = getProductValue(product, dimension);
    if (val === null || val === undefined || val === '') return 'N/A';
    return String(val);
  }

  getGroupComparator(): (a: string, b: string) => number {
    // In taxonomy mode: preserve taxonomy node order (array index = sort order)
    if (this.engine.mode === 'taxonomy') {
      const nodeOrder = new Map<string, number>();
      this.engine.currentTaxonomyNodes.forEach((node, i) => {
        nodeOrder.set(node.label, i);
      });
      return (a: string, b: string) => {
        const oa = nodeOrder.get(a) ?? 999;
        const ob = nodeOrder.get(b) ?? 999;
        return oa - ob;
      };
    }

    // In GPANE mode: use bucket order from engine (already sorted by count/strategy)
    const bucketOrder = new Map<string, number>();
    this._currentBuckets.forEach((b, i) => {
      bucketOrder.set(b.label, i);
    });

    // Also layer in any explicit dimension orders
    const dim = this.getDimension();
    const dimOrder = this._dimensionOrder.get(dim);

    return (a: string, b: string) => {
      if (dimOrder) {
        const oa = dimOrder.get(a) ?? 999;
        const ob = dimOrder.get(b) ?? 999;
        if (oa !== ob) return oa - ob;
      }
      // Fall back to bucket order from GPANE
      const ba = bucketOrder.get(a) ?? 999;
      const bb = bucketOrder.get(b) ?? 999;
      if (ba !== bb) return ba - bb;
      // N/A always last
      if (a === 'N/A') return 1;
      if (b === 'N/A') return -1;
      if (a === 'Sonstige') return 1;
      if (b === 'Sonstige') return -1;
      return a.localeCompare(b, 'de');
    };
  }

  getDimensionsByRole(_role: PivotDimensionKind): PivotDimensionDefinition[] {
    return this.getDimensionDefinitions().filter(d => d.role === _role);
  }

  /**
   * Convert GPANE ScoredDimensions to PivotDimensionDefinition format.
   * This bridges GPANE's analysis to the UI's dimension picker.
   */
  getDimensionDefinitions(): PivotDimensionDefinition[] {
    return this.engine.scoredDimensions.map(dim => new PivotDimension({
      key: dim.key,
      label: dim.label,
      role: this._inferRole(dim.dataType),
      priority: dim.score.total,
      type: this._gpaneTypeToAttributeType(dim.dataType),
      source: { type: 'attribute', key: dim.key },
      coverage: dim.coverage,
      cardinality: dim.cardinality,
      entropy: dim.entropy,
      attributeKey: dim.key,
    }));
  }

  private _inferRole(dataType: string): PivotDimensionKind {
    switch (dataType) {
      case 'categorical': return 'category';
      case 'boolean': return 'category';
      case 'numeric_continuous': return 'metadata';
      case 'numeric_discrete': return 'metadata';
      case 'multi_value': return 'class';
      default: return 'metadata';
    }
  }

  private _gpaneTypeToAttributeType(dataType: string): 'string' | 'number' | 'boolean' | 'enum' | 'unknown' {
    switch (dataType) {
      case 'categorical': return 'enum';
      case 'numeric_continuous': return 'number';
      case 'numeric_discrete': return 'number';
      case 'boolean': return 'boolean';
      default: return 'string';
    }
  }

  // ==========================================================================
  // Engine Access (for direct GPANE features)
  // ==========================================================================

  get gpaneEngine(): GPANEEngine { return this.engine; }
  get mode(): EngineMode { return this.engine.mode; }

  // ==========================================================================
  // Internal
  // ==========================================================================

  /**
   * Rebuild the group cache from current engine buckets.
   * Called after every navigation action.
   */
  private _rebuildGroupCache(): void {
    this._currentBuckets = this.engine.buckets;
    this._groupMap = new Map();
    this._productGroupKey = new Map();

    const allProducts = this.engine.focusedProducts;
    const idToProduct = new Map<string, Product>();
    for (const p of allProducts) idToProduct.set(p.id, p);

    for (const bucket of this._currentBuckets) {
      const products: Product[] = [];
      for (const id of bucket.objectIds) {
        const p = idToProduct.get(id);
        if (p) {
          products.push(p);
          // First bucket wins for product→group mapping
          if (!this._productGroupKey.has(id)) {
            this._productGroupKey.set(id, bucket.label);
          }
        }
      }
      this._groupMap.set(bucket.label, products);
    }

    // Products not in any bucket → N/A
    for (const p of allProducts) {
      if (!this._productGroupKey.has(p.id)) {
        this._productGroupKey.set(p.id, 'N/A');
      }
    }

    // Check hero mode
    this._heroModeActive = allProducts.length > 0 && allProducts.length <= this._heroThreshold;
  }
}
