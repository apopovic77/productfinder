import type { Product } from '../types/Product';
import { ProductLayoutAccessors } from '../layout/Accessors';
import { WeightScalePolicy } from '../layout/ScalePolicy';
import { SimpleLayouter, type SimpleLayoutConfig } from '../layout/SimpleLayouter';
import { PivotLayouter, type PivotConfig, type Orientation } from '../layout/PivotLayouter';
import { PivotGroup } from '../layout/PivotGroup';
import { ShelfLayoutStrategy } from '../layout/ShelfLayoutStrategy';
import { LayoutEngine } from '../layout/LayoutEngine';
// deep imports: the package barrel re-exports three-dependent types (Vector3/Color)
import { Vector2 } from 'arkturian-typescript-utils/dist/types/Vector2';
import { GpanePivotService, type GroupDimension, type PriceBucketConfig } from '../gpane/GpanePivotService';
import { ONEAL_TAXONOMY } from '../gpane';
// Legacy import kept for type compatibility
import type { PriceBucketMode } from '../types/pivot';
import { HeroLayouter } from '../layout/HeroLayouter';
import type { PivotAnalysisResult, PivotDimensionDefinition } from './PivotDimensionAnalyzer';
import { ACTIVE_PIVOT_PROFILE } from '../config/pivot';
import { PosterLayouter, type PosterRowDefinition } from '../layout/PosterLayouter';
import type { PosterLayoutConfig } from '../layout/PosterLayouter';
import { LaneLayouter } from '../layout/LaneLayouter';
import { CANVAS_PADDING_CONFIG } from '../config/CanvasPaddingConfig';

export type LayoutMode = 'grid' | 'masonry' | 'compact' | 'large' | 'pivot' | 'poster' | 'lanes';

const PIVOT_PROFILE = ACTIVE_PIVOT_PROFILE;

const createOrderMap = (items: readonly string[] = []): Map<string, number> =>
  new Map(items.map((label, index) => [label, index] as [string, number]));

export class LayoutService {
  private mode: LayoutMode = 'pivot'; // Start with pivot layout!
  private engine: LayoutEngine<Product>;
  private layouter: SimpleLayouter<Product> | PivotLayouter<Product> | HeroLayouter<Product> | PosterLayouter<Product> | LaneLayouter<Product>;
  private heroLayouter: HeroLayouter<Product> | null = null;
  private access = new ProductLayoutAccessors();
  private scalePolicy = new WeightScalePolicy();
  
  // GPANE pivot service (replaces PivotDrillDownService)
  private drillDownService: GpanePivotService;
  private pivotGroups: PivotGroup[] = [];
  private pivotConfig: PivotConfig<Product>;
  private animationDuration = 0.4;
  private priceBucketConfig: PriceBucketConfig = { mode: 'static', bucketCount: 5 };
  private lastKnownPositions = new Map<string, { x: number; y: number; w: number; h: number }>();
  private dimensionOrders = new Map<GroupDimension, Map<string, number>>();
  private displayOrderIds: string[] = [];
  private nodeToGroup = new Map<string, string>();
  private pivotModel: PivotAnalysisResult | null = null;
  private previousPivotDimension: GroupDimension | null = null;
  private readonly posterRows: PosterRowDefinition[] = [
    {
      key: 'poster_apparel',
      label: 'TRAIL & ENDURO PANTS · JERSEYS · JACKETS',
      height: 150,
    },
    {
      key: 'poster_shoes',
      label: 'PINNED SHOES · ELEMENT SHOES · CASUAL FOOTWEAR',
      height: 130,
    },
    {
      key: 'poster_gloves',
      label: 'GLOVES · PALM SAVER · WINTER & ELITE',
      height: 130,
    },
    {
      key: 'poster_protectors',
      label: 'PROTECTIVE GEAR · JACKETS · SLEEVES · PADS',
      height: 160,
    },
    {
      key: 'poster_accessories',
      label: 'SOCKS · BAGS · LIFESTYLE ACCESSORIES',
      height: 130,
    },
    {
      key: 'poster_goggles',
      label: 'GOGGLES · LENSES · ACCESSORIES',
      height: 120,
    },
  ];

  private static readonly PRESENTATION_ORDER = createOrderMap(PIVOT_PROFILE.presentationCategoryOrder);

  constructor() {
    // Initialize GPANE-backed pivot service with O'Neal taxonomy
    this.drillDownService = new GpanePivotService({
      maxBuckets: 12,
      minCoverage: 0.5,
      scoring: { coverage: 0.25, diversity: 0.25, informationGain: 0.20, usability: 0.15, redundancy: 0.10, history: 0.05, fragmentation: 0.05 },
      overrides: {
        variant_colors: { hidden: true },
        variant_sizes: { hidden: true },
        // Count dimensions group by HOW MANY colours/sizes/variants a product
        // has (1, 2, 3 … 15). Never a buying question; they surfaced on level
        // two for gloves, gear and street helmets (pivot-tree audit 2026-08-23).
        family_size: { hidden: true },
        color_variant_count: { hidden: true },
        variant_count: { hidden: true },
        size_count: { hidden: true },
        has_image: { hidden: true },
        product_code: { hidden: true },
        family_name: { hidden: true },
        // Model names are categories, not prose. Auto-detected as text they
        // were bucketed by first word: "3SRS Helmet VISION" collapsed into
        // "3SRS" — one group for 65 designs, a wasted click (audit 2026-08-23).
        design_group: { label: 'Design', dataType: 'categorical' },
        // Flow-Varianten ohne Marken-Gate laden alle Marken — dann ist
        // Marke eine reguläre Pivot-Dimension (owner 2026-08-25).
        brand: { label: 'Marke', dataType: 'categorical' },
        product_line: { label: 'Produktlinie', dataType: 'categorical' },
        color_base: { label: 'Farbe', dataType: 'categorical' },
        garment_type: { label: 'Typ', dataType: 'categorical' },
        color_name: { label: 'Farbton', dataType: 'categorical' },
        is_spare: { label: 'Ersatzteil' },
        model_year: { label: 'Jahrgang', dataType: 'numeric_discrete' },
      },
      hierarchies: [{
        name: 'Product Hierarchy',
        levels: ['presentation_category', 'product_line', 'design_group'],
        bonusPerLevel: 0.3,
        strictOrder: false,
      }],
      domain: 'oneal',
      taxonomy: ONEAL_TAXONOMY,
      heroThreshold: 15,
    });

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

  private createLayouter(mode: LayoutMode): SimpleLayouter<Product> | PivotLayouter<Product> | PosterLayouter<Product> | LaneLayouter<Product> {
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
    if (mode === 'lanes') {
      return new LaneLayouter<Product>({
        groupKey: (p: Product) => this.drillDownService.getGroupKey(p),
        groupSort: (a: string, b: string) => {
          const comparator = this.drillDownService.getGroupComparator();
          return comparator(a, b);
        },
        subGroupKey: (p: Product) => (p.raw as any)?.design_group || p.name,
        itemSort: (a: Product, b: Product) => {
          const ga = (a.raw as any)?.design_group || a.name;
          const gb = (b.raw as any)?.design_group || b.name;
          return ga.localeCompare(gb);
        },
      });
    }
    if (mode === 'poster') {
      return this.createPosterLayouter();
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
      frameGap: CANVAS_PADDING_CONFIG.frameGap,
      framePadding: CANVAS_PADDING_CONFIG.paddingLeft,
      framePaddingTop: CANVAS_PADDING_CONFIG.paddingTop,
      framePaddingRight: CANVAS_PADDING_CONFIG.paddingRight,
      framePaddingBottom: CANVAS_PADDING_CONFIG.paddingBottom,
      framePaddingLeft: CANVAS_PADDING_CONFIG.paddingLeft,
      itemGap: CANVAS_PADDING_CONFIG.itemGap,
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

  private createPosterLayouter(): PosterLayouter<Product> {
    const config: PosterLayoutConfig<Product> = {
      rows: this.posterRows,
      margin: 48,
      columnGap: 18,
      rowGap: 36,
      groupKey: (product) => this.drillDownService.getGroupKey(product),
    };
    return new PosterLayouter<Product>(config);
  }

  private createHeroLayouter(): HeroLayouter<Product> {
    const desktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    return new HeroLayouter<Product>({
      // Desktop: wide gap so the neighbour peeks in at the edge (as in the
      // design) instead of sitting under the docked card. Phone: tight.
      spacing: desktop ? 360 : 100,
      targetHeightRatio: 0.8,
      // Desktop: the dark product card docks on the right (340 px + 96 px
      // margin); the hero stays in the left ~58 % so it never sits under it.
      maxWidthRatio: desktop ? 0.42 : undefined,
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
    const previousMode = this.mode;
    this.mode = mode;
    this.layouter = this.createLayouter(mode);
    if (mode === 'poster') {
      const currentDimension = this.drillDownService.getDimension();
      if (currentDimension !== 'poster:group' && this.drillDownService.canUseDimension('poster:group')) {
        this.previousPivotDimension = currentDimension;
        this.drillDownService.setDimension('poster:group');
      }
    } else if (previousMode === 'poster' && this.drillDownService.getDimension() === 'poster:group') {
      if (this.previousPivotDimension && this.drillDownService.canUseDimension(this.previousPivotDimension)) {
        this.drillDownService.setDimension(this.previousPivotDimension);
      }
    }
    if (mode !== 'pivot' && mode !== 'lanes') {
      this.heroLayouter = null;
    }
    // Update layouter on existing engine to preserve nodes!
    this.engine.setLayouter(this.layouter);
    this.applyAnimationDuration();
  }

  setLockedDimensions(keys: string[]): void {
    this.drillDownService.setLockedDimensions(keys);
  }

  setGroupingPath(keys: string[]): void {
    this.drillDownService.setGroupingPath(keys);
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

  setCellSizeOverride(size: number): void {
    this.pivotConfig = { ...this.pivotConfig, cellSizeOverride: size || undefined };
    if (this.layouter instanceof PivotLayouter) {
      (this.layouter as any).config = this.pivotConfig;
    }
    this._cellSizeOverrideActive = size > 0;
  }

  private _cellSizeOverrideActive = false;

  get hasCellSizeOverride(): boolean {
    return this._cellSizeOverrideActive;
  }

  setMinCellSize(size: number): void {
    this.pivotConfig = { ...this.pivotConfig, minCellSize: size || undefined };
    if (this.layouter instanceof PivotLayouter) {
      (this.layouter as any).config = this.pivotConfig;
    }
  }

  forceReloadPivot(products: Product[]): void {
    this.drillDownService.forceReload(products);
  }

  getMode(): LayoutMode {
    return this.mode;
  }

  getEngine(): LayoutEngine<Product> {
    return this.engine;
  }

  /**
   * Hero mode presents as an OVERVIEW grid first — root or drilled leaf.
   * Selecting a product enters the hero PRESENTATION: the very same nodes
   * animate from their grid slots into the side-by-side hero row (fluid
   * flow via the interpolated node targets, owner 2026-08-24). Closing the
   * card animates them back into the grid.
   */
  private _heroPresentation = false;

  setHeroPresentation(active: boolean): void {
    this._heroPresentation = active;
  }

  isHeroPresentation(): boolean {
    return this._heroPresentation;
  }

  isHeroRootOverview(): boolean {
    return this.isPivotHeroMode() && !this._heroPresentation;
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
        if (this.heroLayouter) this.heroLayouter.overviewMode = this.isHeroRootOverview();
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
    } else if (this.mode === 'lanes') {
      const heroActive = this.drillDownService.isHeroModeActive();
      if (heroActive) {
        if (!(this.layouter instanceof HeroLayouter)) {
          this.heroLayouter = this.createHeroLayouter();
          this.layouter = this.heroLayouter;
          this.engine.setLayouter(this.layouter);
          this.applyAnimationDuration();
        }
      } else {
        if (!(this.layouter instanceof LaneLayouter)) {
          this.layouter = this.createLayouter('lanes') as LaneLayouter<Product>;
          this.engine.setLayouter(this.layouter);
          this.applyAnimationDuration();
        }
      }
      this.displayOrderIds = [];
      this.nodeToGroup.clear();
    } else if (this.mode === 'poster') {
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
    if (this.mode === 'poster') {
      // Poster layout uses fixed sizing; ignore grid config updates.
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
    if (this.mode === 'pivot' || this.mode === 'lanes') {
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
    if (this.mode !== 'pivot' && this.mode !== 'lanes') return;
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
    // Use GPANE's scored dimensions converted to PivotDimensionDefinition format
    return this.drillDownService.getDimensionDefinitions();
  }
  
  getAvailablePivotDimensions(): GroupDimension[] {
    if (this.mode !== 'pivot' && this.mode !== 'lanes') return [];
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
    if (this.mode !== 'pivot' && this.mode !== 'lanes') return;

    // Cache positions BEFORE removing nodes — so they can return to same spot
    this.cacheCurrentNodePositions();

    // Get the products from the clicked bucket
    const currentNodes = this.engine.all();
    const groupProducts = currentNodes
      .filter(n => this.drillDownService.getGroupKey(n.data) === value)
      .map(n => n.data);

    if (this.drillDownService.drillDown(value)) {
      if (groupProducts.length > 0) {
        this.engine.sync(groupProducts, (p: Product) => p.id);
      }
      this.primeNewNodesFromCache();
      this.updatePivotGroups();
    }
  }
  
  /**
   * Drill up (remove last filter)
   */
  drillUpPivot(): void {
    if (this.mode !== 'pivot' && this.mode !== 'lanes') return;
    this.cacheCurrentNodePositions();
    if (this.drillDownService.drillUp()) {
      const filtered = this.drillDownService.filterProducts([]);
      this.engine.sync(filtered, (p: Product) => p.id);
      this.primeNewNodesFromCache();
      this.updatePivotGroups();
    }
  }

  /**
   * Reset pivot to top level
   */
  resetPivot(): void {
    if (this.mode !== 'pivot' && this.mode !== 'lanes') return;
    this.cacheCurrentNodePositions();
    this.drillDownService.reset();
    const filtered = this.drillDownService.filterProducts([]);
    this.engine.sync(filtered, (p: Product) => p.id);
    this.primeNewNodesFromCache();
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
    if (((this.mode === 'pivot' && this.layouter instanceof PivotLayouter) || (this.mode === 'lanes' && this.layouter instanceof LaneLayouter))) {
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
    if (this.mode === 'lanes' && this.layouter instanceof LaneLayouter) {
      const headers = this.layouter.getGroupHeaders();
      if (!this.pivotGroups.length) return headers;
      const labelMap = new Map(this.pivotGroups.map(group => [group.key, group.label] as const));
      return headers.map(header => (
        labelMap.has(header.key)
          ? { ...header, label: labelMap.get(header.key)! }
          : header
      ));
    }
    if (this.mode === 'poster' && this.layouter instanceof PosterLayouter) {
      return this.layouter.getGroupHeaders();
    }
    return [];
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
    // Load products into GPANE engine (uses canonical source if available, else all products)
    this.drillDownService.loadProducts(canonicalSource || products);

    if (canonicalSource) {
      this.updateCanonicalOrders(canonicalSource);
    }
    this.cacheCurrentNodePositions();
    // Apply drill-down filters
    const usePivot = this.mode === 'pivot' || this.mode === 'lanes';
    const filtered = usePivot
      ? this.drillDownService.filterProducts(products)
      : products;

    this.engine.sync(filtered, p => p.id);
    this.primeNewNodesFromCache();
    this.applyAnimationDuration();

    if (usePivot) {
      this.updatePivotGroups();
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
      return this.calculateDynamicBounds(nodes, viewportWidth, viewportHeight);
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
   * @param viewportHeight - Optional viewport height for Hero Mode bounds extension
   */
  private calculateDynamicBounds(nodes: any[], viewportWidth?: number, viewportHeight?: number): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number; maxItemHeight: number } {
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
    // (desktop hero row only — the phone leaf shows a fitted grid and the
    // extension would zoom the fit far out)
    const phoneGrid = typeof window !== 'undefined' && window.innerWidth < 768;
    const gridOverview = phoneGrid || this.isHeroRootOverview();
    if (viewportWidth && firstProduct && lastProduct && !gridOverview) {
      // Horizontal extension: To center first product: its center must be at viewportWidth/2
      // This requires: minX = firstProductCenter - viewportWidth/2
      const firstProductCenter = firstProduct.x + firstProduct.w / 2;
      // Dock margin: the desktop card sits right of the stage, so the hero
      // focal point is viewport-centre MINUS the dock shift (~276 px). With
      // a single product the clamp range collapsed to exact centring and
      // the card overlapped the helmet (issue #1304, 120561).
      const dockMargin = 320;
      const requiredMinX = firstProductCenter - (viewportWidth / 2) - dockMargin;

      // To center last product: its center must be at viewportWidth/2
      // This requires: maxX = lastProductCenter + viewportWidth/2
      const lastProductCenter = lastProduct.x + lastProduct.w / 2;
      const requiredMaxX = lastProductCenter + (viewportWidth / 2) + dockMargin;

      // Set horizontal bounds to these exact values
      minX = requiredMinX;
      maxX = requiredMaxX;
    }

    // Hero Mode: Also extend vertical bounds to allow vertical centering when zoomed out
    // (desktop hero row only — for the phone leaf grid this REPLACED the
    // 4700 px pannable range with the middle screenful: the view started
    // mid-grid and the rest was unreachable, 120530)
    if (viewportHeight && minY !== Infinity && maxY !== -Infinity && !gridOverview) {
      // Calculate current content vertical center
      const contentHeight = maxY - minY;
      const contentCenterY = minY + contentHeight / 2;

      // Extend bounds symmetrically around content center to allow full vertical centering
      // When zoomed out, content should be able to center vertically in viewport
      minY = contentCenterY - (viewportHeight / 2);
      maxY = contentCenterY + (viewportHeight / 2);
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
    let contentMinX = Infinity;
    let contentMaxX = -Infinity;
    let contentMinY = Infinity;
    let contentMaxY = -Infinity;
    let maxItemHeight = 0;

    for (const node of nodes) {
      const x = node.posX.targetValue ?? node.posX.value ?? 0;
      const y = node.posY.targetValue ?? node.posY.value ?? 0;
      const w = node.width.targetValue ?? node.width.value ?? 0;
      const h = node.height.targetValue ?? node.height.value ?? 0;

      contentMinX = Math.min(contentMinX, x);
      contentMaxX = Math.max(contentMaxX, x + w);
      contentMinY = Math.min(contentMinY, y);
      contentMaxY = Math.max(contentMaxY, y + h);
      maxItemHeight = Math.max(maxItemHeight, h);
    }

    // Include group headers in bounds
    const headers = this.getGroupHeaders();
    for (const header of headers) {
      contentMinX = Math.min(contentMinX, header.x);
      contentMaxX = Math.max(contentMaxX, header.x + header.width);
      contentMinY = Math.min(contentMinY, header.y);
      contentMaxY = Math.max(contentMaxY, header.y + header.height);
    }

    // Use actual content extent, expanded to at least viewport size
    const finalMinX = Math.min(0, contentMinX);
    const finalMinY = Math.min(0, contentMinY);
    const finalMaxX = Math.max(contentMaxX, viewportWidth);
    const finalMaxY = Math.max(contentMaxY, viewportHeight);

    return {
      minX: finalMinX,
      minY: finalMinY,
      maxX: finalMaxX,
      maxY: finalMaxY,
      width: finalMaxX - finalMinX,
      height: finalMaxY - finalMinY,
      maxItemHeight
    };
  }
}
