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
import { ACTIVE_PIVOT_PROFILE } from '../config/pivot';

export type LayoutMode = 'grid' | 'masonry' | 'compact' | 'large' | 'pivot';

const PIVOT_PROFILE = ACTIVE_PIVOT_PROFILE;

const createOrderMap = (items: readonly string[] = []): Map<string, number> =>
  new Map(items.map((label, index) => [label, index] as [string, number]));

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

  private static readonly PRESENTATION_ORDER = createOrderMap(PIVOT_PROFILE.presentationCategoryOrder);

  constructor() {
    this.pivotConfig = this.createDefaultPivotConfig();
    this.layouter = this.createLayouter(this.mode);
    this.engine = new LayoutEngine<Product>(this.layouter);
    this.drillDownService.setPriceBucketConfig(this.priceBucketConfig);

    const presentationOrder = new Map<string, number>(LayoutService.PRESENTATION_ORDER ?? []);
    this.dimensionOrders.set('category:presentation', presentationOrder);
    this.drillDownService.setDimensionOrder('category:presentation', presentationOrder);

    const familyOrder = new Map<string, number>();
    this.dimensionOrders.set('attribute:product_family', familyOrder);
    this.drillDownService.setDimensionOrder('attribute:product_family', familyOrder);

    this.applyAnimationDuration();
  }

  private createLayouter(mode: LayoutMode): SimpleLayouter<Product> | PivotLayouter<Product> {
    if (mode === 'pivot') {
      // Ensure dynamic group key stays in sync with drill-down dimension
      this.pivotConfig = {
        ...this.pivotConfig,
        groupKey: (p: Product) => this.drillDownService.getGroupKey(p),
        groupSort: (a: string, b: string) => {
          const comparator = this.drillDownService.getGroupComparator();
          return comparator(a, b);
        },
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
      groupSort: (a: string, b: string) => {
        const comparator = this.drillDownService.getGroupComparator();
        return comparator(a, b);
      },
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
      groupSort: (a: string, b: string) => {
        const comparator = this.drillDownService.getGroupComparator();
        return comparator(a, b);
      },
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
          // Update pivot config with hero mode state for 'auto' scale resolution
          this.pivotConfig = {
            ...this.pivotConfig,
            isHeroMode: false,
            groupSort: (a: string, b: string) => {
              const comparator = this.drillDownService.getGroupComparator();
              return comparator(a, b);
            }
          };
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
      orientation,
      groupSort: (a: string, b: string) => {
        const comparator = this.drillDownService.getGroupComparator();
        return comparator(a, b);
      }
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

    const ensureOrder = (dimension: GroupDimension, key: string, product: Product) => {
      if (!key) return;
      let map = this.dimensionOrders.get(dimension);
      if (!map) {
        if (dimension === 'category:presentation') {
          map = new Map<string, number>(LayoutService.PRESENTATION_ORDER ?? []);
        } else {
          map = new Map<string, number>();
        }
        this.dimensionOrders.set(dimension, map);
        this.drillDownService.setDimensionOrder(dimension, map);
      }
      if (!map.has(key)) {
        let index = map.size;
        if (dimension === 'category:presentation' && LayoutService.PRESENTATION_ORDER) {
          index = LayoutService.PRESENTATION_ORDER.get(key) ?? index;
        } else if (dimension === 'attribute:product_family') {
          const category =
            product.getAttributeValue<string>('presentation_category') ??
            product.category?.[0] ??
            '';
          const orderList =
            PIVOT_PROFILE.getProductFamilyOrderForCategory?.(category) ??
            PIVOT_PROFILE.productFamilyOrders?.[category] ??
            [];
          const preferredIndex = orderList.indexOf(key);
          if (preferredIndex >= 0) {
            index = preferredIndex;
          }
        }
        map.set(key, index);
        this.dimensionOrders.set(dimension, map);
        this.drillDownService.setDimensionOrder(dimension, map);
      }
    };

    for (const product of source) {
      for (const dimension of orderedDims) {
        const value = this.drillDownService.resolveValue(product, dimension);
        ensureOrder(dimension, value, product);
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
   *
   * @param viewportWidth - Viewport width (optional, for fixed bounds mode)
   * @param viewportHeight - Viewport height (optional, for fixed bounds mode)
   */
  getContentBounds(viewportWidth?: number, viewportHeight?: number): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number; maxItemHeight?: number } | null {
    const nodes = this.engine.all();
    if (nodes.length === 0) {
      return null;
    }

    // Hero Mode: Dynamic bounds based on actual content (allows vertical centering)
    const isHeroMode = this.isPivotHeroMode();
    if (isHeroMode) {
      return this.calculateDynamicBounds(nodes, viewportWidth);
    }

    // Pivot Mode: Fixed bounds based on viewport (prevents unwanted centering)
    // This ensures the rubberband system always works with the same bounds,
    // regardless of how much content is currently visible
    if (this.mode === 'pivot' && viewportWidth && viewportHeight) {
      return this.calculateFixedBounds(nodes, viewportWidth, viewportHeight);
    }

    // Fallback: Dynamic bounds for other modes
    return this.calculateDynamicBounds(nodes);
  }

  /**
   * Calculate dynamic bounds based on actual content
   * Used in Hero Mode to allow vertical centering
   *
   * @param viewportWidth - Optional viewport width for Hero Mode bounds extension
   */
  private calculateDynamicBounds(nodes: any[], viewportWidth?: number): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number; maxItemHeight: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxItemHeight = 0;

    // Track first and last product for Hero Mode extension calculation
    let firstProduct: { x: number; w: number } | null = null;
    let lastProduct: { x: number; w: number } | null = null;

    // Include product nodes in bounds
    for (const node of nodes) {
      const x = node.posX.targetValue ?? node.posX.value ?? 0;
      const y = node.posY.targetValue ?? node.posY.value ?? 0;
      const w = node.width.targetValue ?? node.width.value ?? 0;
      const h = node.height.targetValue ?? node.height.value ?? 0;

      // Track first (leftmost) and last (rightmost) products
      if (!firstProduct || x < firstProduct.x) {
        firstProduct = { x, w };
      }
      if (!lastProduct || x + w > (lastProduct.x + lastProduct.w)) {
        lastProduct = { x, w };
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);

      // Track maximum item height for zoom limit calculation
      maxItemHeight = Math.max(maxItemHeight, h);
    }

    // Also include group headers in bounds (bucket buttons in pivot mode)
    const headers = this.getGroupHeaders();
    for (const header of headers) {
      minX = Math.min(minX, header.x);
      minY = Math.min(minY, header.y);
      maxX = Math.max(maxX, header.x + header.width);
      maxY = Math.max(maxY, header.y + header.height);
    }

    // Hero Mode: Extend bounds to allow first/last product center to reach viewport center
    if (viewportWidth && firstProduct && lastProduct) {
      // To center first product: its center must be at viewportWidth/2
      // This requires: minX = firstProductCenter - viewportWidth/2
      const firstProductCenter = firstProduct.x + firstProduct.w / 2;
      const requiredMinX = firstProductCenter - (viewportWidth / 2);

      // To center last product: its center must be at viewportWidth/2
      // This requires: maxX = lastProductCenter + viewportWidth/2
      const lastProductCenter = lastProduct.x + lastProduct.w / 2;
      const requiredMaxX = lastProductCenter + (viewportWidth / 2);

      // Set bounds to these exact values
      minX = requiredMinX;
      maxX = requiredMaxX;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      maxItemHeight
    };
  }

  /**
   * Calculate fixed bounds based on viewport size
   * Used in Pivot Mode to prevent vertical centering when few products are visible
   *
   * The bounds are always as large as the viewport, which prevents the rubberband
   * system from centering content vertically (since content < viewport = centering)
   */
  private calculateFixedBounds(nodes: any[], viewportWidth: number, viewportHeight: number): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number; maxItemHeight: number } {
    // First, get actual content bounds to determine horizontal extent
    let minX = Infinity;
    let maxX = -Infinity;
    let maxItemHeight = 0;

    for (const node of nodes) {
      const x = node.posX.targetValue ?? node.posX.value ?? 0;
      const w = node.width.targetValue ?? node.width.value ?? 0;
      const h = node.height.targetValue ?? node.height.value ?? 0;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + w);

      // Track maximum item height for zoom limit calculation
      maxItemHeight = Math.max(maxItemHeight, h);
    }

    // Include group headers in horizontal bounds
    const headers = this.getGroupHeaders();
    for (const header of headers) {
      minX = Math.min(minX, header.x);
      maxX = Math.max(maxX, header.x + header.width);
    }

    const actualWidth = maxX - minX;

    // Force bounds to be at least viewport size
    // This prevents vertical centering in pivot mode
    const width = Math.max(actualWidth, viewportWidth);

    // Vertical bounds: ALWAYS use viewport size (0 to viewportHeight)
    // This ensures content stays at its layout position (top or bottom aligned)
    // without being centered by the rubberband system
    return {
      minX,
      minY: 0,  // Always start at top
      maxX: minX + width,
      maxY: viewportHeight,  // Always end at viewport height
      width,
      height: viewportHeight,  // Height is always viewport height
      maxItemHeight
    };
  }
}
