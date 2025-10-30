import type { Product } from '../types/Product';
import { ProductLayoutAccessors } from '../layout/Accessors';
import { WeightScalePolicy } from '../layout/ScalePolicy';
import { SimpleLayouter, type SimpleLayoutConfig } from '../layout/SimpleLayouter';
import { PivotLayouter, type PivotConfig, type Orientation } from '../layout/PivotLayouter';
import { PivotGroup } from '../layout/PivotGroup';
import { ShelfLayoutStrategy } from '../layout/ShelfLayoutStrategy';
import { LayoutEngine } from '../layout/LayoutEngine';
import { Vector2 } from 'arkturian-typescript-utils';
import { PivotDrillDownService, type GroupDimension, type PriceBucketConfig, type PriceBucketMode } from './PivotDrillDownService';
import { HeroLayouter } from '../layout/HeroLayouter';
import type { PivotAnalysisResult, PivotDimensionDefinition } from './PivotDimensionAnalyzer';

export type LayoutMode = 'grid' | 'masonry' | 'compact' | 'large' | 'pivot';

export class LayoutService {
  private mode: LayoutMode = 'pivot'; // Start with pivot layout!
  private engine: LayoutEngine<Product>;
  private layouter: SimpleLayouter<Product> | PivotLayouter<Product> | HeroLayouter<Product>;
  private heroLayouter: HeroLayouter<Product> | null = null;
  private access = new ProductLayoutAccessors();
  private scalePolicy = new WeightScalePolicy();
  
  // Pivot drill-down service
  private drillDownService = new PivotDrillDownService();
  private pivotGroups: PivotGroup[] = [];
  private pivotConfig: PivotConfig<Product>;
  private animationDuration = 0.4;
  private priceBucketConfig: PriceBucketConfig = { mode: 'static', bucketCount: 5 };
  private lastKnownPositions = new Map<string, { x: number; y: number; w: number; h: number }>();
  private dimensionOrders = new Map<GroupDimension, Map<string, number>>();
  private displayOrderIds: string[] = [];
  private nodeToGroup = new Map<string, string>();
  private pivotModel: PivotAnalysisResult | null = null;

  constructor() {
    this.pivotConfig = this.createDefaultPivotConfig();
    this.layouter = this.createLayouter(this.mode);
    this.engine = new LayoutEngine<Product>(this.layouter);
    this.drillDownService.setPriceBucketConfig(this.priceBucketConfig);
    this.applyAnimationDuration();
  }

  private createLayouter(mode: LayoutMode): SimpleLayouter<Product> | PivotLayouter<Product> {
    if (mode === 'pivot') {
      // Ensure dynamic group key stays in sync with drill-down dimension
      this.pivotConfig = {
        ...this.pivotConfig,
        groupKey: (p: Product) => this.drillDownService.getGroupKey(p),
        access: this.access,
        scale: this.scalePolicy
      };
      return new PivotLayouter<Product>(this.pivotConfig);
    }
    
    // Grid/Masonry layouts
    const config = this.createGridConfig(mode);
    return new SimpleLayouter<Product>(config);
  }
  
  private createDefaultPivotConfig(): PivotConfig<Product> {
    return {
      orientation: 'columns',
      flow: 'ltr',
      groupKey: (p: Product) => this.drillDownService.getGroupKey(p),
      frameGap: 40,
      framePadding: 20,
      itemGap: 12,
      rowBaseHeight: 150,
      minCellSize: 80,
      maxCellSize: 220,
      smallGroupThreshold: 8,
      innerLayoutType: 'shelf',
      access: this.access,
      scale: this.scalePolicy,
      onGroupLayout: (_group, nodes) => {
        for (const node of nodes) {
          this.nodeToGroup.set(node.id, _group);
          this.displayOrderIds.push(node.id);
        }
      }
    };
  }

  private createHeroLayouter(): HeroLayouter<Product> {
    return new HeroLayouter<Product>({
      spacing: Math.max(24, this.pivotConfig.itemGap ?? 12),
      targetHeightRatio: 0.8,
      minHeight: this.pivotConfig.minCellSize ?? 120,
      horizontalPadding: this.pivotConfig.framePadding ?? 40,
      onLayout: nodes => {
        this.displayOrderIds = [];
        this.nodeToGroup.clear();
        for (const node of nodes) {
          this.displayOrderIds.push(node.id);
          const key = this.drillDownService.getGroupKey(node.data);
          this.nodeToGroup.set(node.id, key);
        }
      }
    });
  }
  
  private updatePivotConfigFromGrid(gridConfig: { spacing: number; margin: number; minCellSize: number; maxCellSize: number }) {
    const padding = Math.max(0, Math.round(gridConfig.margin));
    const gap = Math.max(0, Math.round(gridConfig.spacing));
    const minCell = Math.max(5, Math.round(gridConfig.minCellSize));
    const maxCell = Math.max(minCell, Math.round(gridConfig.maxCellSize));
    
    this.pivotConfig = {
      ...this.pivotConfig,
      frameGap: padding,
      framePadding: Math.max(10, Math.floor(padding * 0.75)),
      itemGap: gap,
      rowBaseHeight: minCell,
      minCellSize: minCell,
      maxCellSize: maxCell,
      groupKey: (p: Product) => this.drillDownService.getGroupKey(p),
      access: this.access,
      scale: this.scalePolicy
    };
    
    this.layouter = new PivotLayouter<Product>(this.pivotConfig);
    this.heroLayouter = null;
    this.engine.setLayouter(this.layouter);
    this.applyAnimationDuration();
    this.updatePivotGroups();
  }

  private createGridConfig(mode: LayoutMode): SimpleLayoutConfig<Product> {
    switch (mode) {
      case 'masonry':
        return {
          mode: 'masonry',
          gridConfig: {
            spacing: 12,
            margin: 20,
            minCellSize: 100,
            maxCellSize: 250
          },
          access: this.access,
          scale: this.scalePolicy
        };
      case 'compact':
        return {
          mode: 'grid',
          gridConfig: {
            spacing: 8,
            margin: 15,
            minCellSize: 80,
            maxCellSize: 150
          },
          access: this.access,
          scale: this.scalePolicy
        };
      case 'large':
        return {
          mode: 'grid',
          gridConfig: {
            spacing: 20,
            margin: 30,
            minCellSize: 200,
            maxCellSize: 400
          },
          access: this.access,
          scale: this.scalePolicy
        };
      case 'grid':
      default:
        return {
          mode: 'grid',
          gridConfig: {
            spacing: 12,
            margin: 20,
            minCellSize: 120,
            maxCellSize: 250
          },
          access: this.access,
          scale: this.scalePolicy
        };
    }
  }

  setMode(mode: LayoutMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.layouter = this.createLayouter(mode);
    if (mode !== 'pivot') {
      this.heroLayouter = null;
    }
    // Update layouter on existing engine to preserve nodes!
    this.engine.setLayouter(this.layouter);
    this.applyAnimationDuration();
  }

  setPivotModel(model: PivotAnalysisResult | null): void {
    const previousState = this.drillDownService.getState();
    this.pivotModel = model;
    this.drillDownService.setModel(model);
    if (model) {
      this.drillDownService.setState(previousState);
    }
    this.pivotGroups = [];
  }

  getMode(): LayoutMode {
    return this.mode;
  }

  getEngine(): LayoutEngine<Product> {
    return this.engine;
  }

  layout(width: number, height: number): void {
    if (this.mode === 'pivot') {
      const heroActive = this.drillDownService.isHeroModeActive();
      if (heroActive) {
        if (!(this.layouter instanceof HeroLayouter)) {
          this.heroLayouter = this.createHeroLayouter();
          this.layouter = this.heroLayouter;
          this.engine.setLayouter(this.layouter);
          this.applyAnimationDuration();
        }
      } else {
        if (!(this.layouter instanceof PivotLayouter)) {
          this.layouter = new PivotLayouter<Product>(this.pivotConfig);
          this.engine.setLayouter(this.layouter);
          this.applyAnimationDuration();
        }
      }
      this.displayOrderIds = [];
      this.nodeToGroup.clear();
    }
    this.engine.layout({ width, height });
  }

  updateGridConfig(gridConfig: { spacing: number; margin: number; minCellSize: number; maxCellSize: number }): void {
    if (this.mode === 'pivot') {
      this.updatePivotConfigFromGrid(gridConfig);
      return;
    }
    
    const config = this.createGridConfig(this.mode);
    config.gridConfig = gridConfig;
    this.layouter = new SimpleLayouter<Product>(config);
    this.engine.setLayouter(this.layouter);
    this.applyAnimationDuration();
  }
  
  setAnimationDuration(duration: number): void {
    this.animationDuration = Math.max(0.05, duration);
    this.applyAnimationDuration();
  }
  
  setPriceBucketConfig(mode: PriceBucketMode, bucketCount: number): void {
    this.priceBucketConfig = { mode, bucketCount };
    this.drillDownService.setPriceBucketConfig(this.priceBucketConfig);
    if (this.mode === 'pivot') {
      this.updatePivotGroups();
    }
  }
  
  getPriceBucketConfig(): PriceBucketConfig {
    return { ...this.priceBucketConfig };
  }
  
  // === Pivot Drill-Down Methods ===
  
  /**
   * Set pivot grouping dimension (changes columns)
   */
  setPivotDimension(dimension: GroupDimension): void {
    if (this.mode !== 'pivot') return;
    const hasFilters = this.drillDownService.getFilters().length > 0;
    if (hasFilters) {
      this.drillDownService.setGroupingDimension(dimension);
    } else {
      this.drillDownService.setDimension(dimension);
    }
    this.updatePivotGroups();
  }
  
  /**
   * Get current pivot dimension
   */
  getPivotDimension(): GroupDimension {
    return this.drillDownService.getDimension();
  }
  
  getPivotDimensions(): GroupDimension[] {
    return this.drillDownService.getHierarchy();
  }

  getPivotDimensionDefinitions(): PivotDimensionDefinition[] {
    return this.pivotModel?.dimensions ?? [];
  }
  
  getAvailablePivotDimensions(): GroupDimension[] {
    if (this.mode !== 'pivot') return [];
    const products = this.engine.all().map(n => n.data);
    return this.drillDownService.getAvailableDimensions(products);
  }

  canUsePivotDimension(dimension: GroupDimension): boolean {
    return this.drillDownService.canUseDimension(dimension);
  }

  getPivotOrientation(): Orientation {
    return this.pivotConfig.orientation;
  }

  setPivotOrientation(orientation: Orientation): void {
    if (this.pivotConfig.orientation === orientation) return;
    this.pivotConfig = {
      ...this.pivotConfig,
      orientation
    };
    this.layouter = new PivotLayouter<Product>(this.pivotConfig);
    this.engine.setLayouter(this.layouter);
    this.updatePivotGroups();
  }
  
  /**
   * Drill down into a pivot group
   */
  drillDownPivot(value: string): void {
    if (this.mode !== 'pivot') return;
    if (this.drillDownService.drillDown(value)) {
      this.updatePivotGroups();
    }
  }
  
  /**
   * Drill up (remove last filter)
   */
  drillUpPivot(): void {
    if (this.mode !== 'pivot') return;
    if (this.drillDownService.drillUp()) {
      this.updatePivotGroups();
    }
  }
  
  /**
   * Reset pivot to top level
   */
  resetPivot(): void {
    if (this.mode !== 'pivot') return;
    this.drillDownService.reset();
    this.updatePivotGroups();
  }
  
  /**
   * Get pivot breadcrumbs
   */
  getPivotBreadcrumbs(): string[] {
    return this.drillDownService.getBreadcrumbs();
  }
  
  canDrillUpPivot(): boolean {
    return this.drillDownService.canDrillUp();
  }
  
  canDrillDownPivot(): boolean {
    return this.drillDownService.canDrillDown();
  }

  isPivotHeroMode(): boolean {
    return this.drillDownService.isHeroModeActive();
  }
  
  /**
   * Get pivot groups (for rendering)
   */
  getPivotGroups(): PivotGroup[] {
    return this.pivotGroups;
  }
  
  /**
   * Get group headers from pivot layouter (for rendering)
   */
  getGroupHeaders() {
    if (this.mode !== 'pivot' || !(this.layouter instanceof PivotLayouter)) {
      return [];
    }
    const headers = this.layouter.getGroupHeaders();
    if (!this.pivotGroups.length) {
      return headers;
    }
    const labelMap = new Map(this.pivotGroups.map(group => [group.key, group.label] as const));
    return headers.map(header => (
      labelMap.has(header.key)
        ? { ...header, label: labelMap.get(header.key)! }
        : header
    ));
  }
  
  /**
   * Update pivot groups based on current products and drill-down state
   */
  private updatePivotGroups(): void {
    const products = this.engine.all().map(n => n.data);
    this.pivotGroups = this.drillDownService.createGroups(products);
  }
  
  private applyAnimationDuration(): void {
    const duration = this.animationDuration;
    for (const node of this.engine.all()) {
      node.setAnimationDuration(duration);
    }
  }
  
  getDisplayOrder(): Product[] {
    if (this.displayOrderIds.length === 0) {
      return this.engine.all().map(n => n.data);
    }
    const nodeMap = new Map<string, Product>();
    for (const node of this.engine.all()) {
      nodeMap.set(node.id, node.data);
    }
    return this.displayOrderIds
      .map(id => nodeMap.get(id))
      .filter((p): p is Product => Boolean(p));
  }
  
  getDisplayOrderForGroup(groupKey: string): Product[] {
    const all = this.getDisplayOrder();
    return all.filter(p => this.drillDownService.getGroupKey(p) === groupKey);
  }
  
  getGroupKeyForProduct(product: Product): string {
    const id = product.id;
    const mapped = this.nodeToGroup.get(id);
    if (mapped) return mapped;
    return this.drillDownService.getGroupKey(product);
  }

  private updateCanonicalOrders(source: Product[]): void {
    if (!this.pivotModel) return;
    const orderedDims = new Set(
      this.pivotModel.dimensions
        .filter(def => def.role === 'category' || def.role === 'class')
        .map(def => def.key)
    );
    if (!orderedDims.size) return;

    const ensureOrder = (dimension: GroupDimension, key: string) => {
      if (!key) return;
      let map = this.dimensionOrders.get(dimension);
      if (!map) {
        map = new Map<string, number>();
        this.dimensionOrders.set(dimension, map);
      }
      if (!map.has(key)) {
        map.set(key, map.size);
        this.drillDownService.setDimensionOrder(dimension, map);
      }
    };

    for (const product of source) {
      for (const dimension of orderedDims) {
        const value = this.drillDownService.resolveValue(product, dimension);
        ensureOrder(dimension, value);
      }
    }
  }
  
  /**
   * Override sync to update pivot groups
   */
  sync(products: Product[], canonicalSource?: Product[]): void {
    if (canonicalSource) {
      this.updateCanonicalOrders(canonicalSource);
    }
    this.cacheCurrentNodePositions();
    // Apply drill-down filters
    const filtered = this.mode === 'pivot' 
      ? this.drillDownService.filterProducts(products)
      : products;
    
    this.engine.sync(filtered, p => p.id);
    this.primeNewNodesFromCache();
    this.applyAnimationDuration();
    
    if (this.mode === 'pivot') {
      this.updatePivotGroups();
      // ensure display order matches current groups immediately
      this.displayOrderIds = [];
      this.nodeToGroup.clear();
      for (const node of this.engine.all()) {
        this.displayOrderIds.push(node.id);
        this.nodeToGroup.set(node.id, this.drillDownService.getGroupKey(node.data));
      }
    }
  }
  
  private cacheCurrentNodePositions(): void {
    for (const node of this.engine.all()) {
      const posX = node.posX.value ?? node.posX.targetValue ?? 0;
      const posY = node.posY.value ?? node.posY.targetValue ?? 0;
      const width = node.width.value ?? node.width.targetValue ?? 0;
      const height = node.height.value ?? node.height.targetValue ?? 0;
      this.lastKnownPositions.set(node.id, { x: posX, y: posY, w: width, h: height });
    }
  }
  
  private primeNewNodesFromCache(): void {
    for (const node of this.engine.all()) {
      if (node.isNew) {
        const cached = this.lastKnownPositions.get(node.id);
        if (cached) {
          node.prime(new Vector2(cached.x, cached.y), new Vector2(cached.w, cached.h));
        }
      }
    }
  }

  /**
   * Calculate content bounds from all layout nodes
   * Used for viewport bounds checking and fit-to-content scale
   */
  getContentBounds(): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } | null {
    const nodes = this.engine.all();
    if (nodes.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Include product nodes in bounds
    for (const node of nodes) {
      const x = node.posX.targetValue ?? node.posX.value ?? 0;
      const y = node.posY.targetValue ?? node.posY.value ?? 0;
      const w = node.width.targetValue ?? node.width.value ?? 0;
      const h = node.height.targetValue ?? node.height.value ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    // Also include group headers in bounds (bucket buttons in pivot mode)
    const headers = this.getGroupHeaders();
    for (const header of headers) {
      minX = Math.min(minX, header.x);
      minY = Math.min(minY, header.y);
      maxX = Math.max(maxX, header.x + header.width);
      maxY = Math.max(maxY, header.y + header.height);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}
