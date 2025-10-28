import type { Product } from '../types/Product';
import { ProductLayoutAccessors } from '../layout/Accessors';
import { WeightScalePolicy } from '../layout/ScalePolicy';
import { SimpleLayouter, type SimpleLayoutConfig } from '../layout/SimpleLayouter';
import { PivotLayouter, type PivotConfig } from '../layout/PivotLayouter';
import { PivotGroup } from '../layout/PivotGroup';
import { ShelfLayoutStrategy } from '../layout/ShelfLayoutStrategy';
import { LayoutEngine } from '../layout/LayoutEngine';
import { PivotDrillDownService, type GroupDimension, type PriceBucketConfig, type PriceBucketMode } from './PivotDrillDownService';

export type LayoutMode = 'grid' | 'masonry' | 'compact' | 'large' | 'pivot';

export class LayoutService {
  private mode: LayoutMode = 'pivot'; // Start with pivot layout!
  private engine: LayoutEngine<Product>;
  private layouter: SimpleLayouter<Product> | PivotLayouter<Product>;
  private access = new ProductLayoutAccessors();
  private scalePolicy = new WeightScalePolicy();
  
  // Pivot drill-down service
  private drillDownService = new PivotDrillDownService();
  private pivotGroups: PivotGroup[] = [];
  private pivotConfig: PivotConfig<Product>;
  private animationDuration = 0.4;
  private priceBucketConfig: PriceBucketConfig = { mode: 'static', bucketCount: 5 };

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
      orientation: 'rows',
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
      scale: this.scalePolicy
    };
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
    // Update layouter on existing engine to preserve nodes!
    this.engine.setLayouter(this.layouter);
    this.applyAnimationDuration();
  }

  getMode(): LayoutMode {
    return this.mode;
  }

  getEngine(): LayoutEngine<Product> {
    return this.engine;
  }

  layout(width: number, height: number): void {
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
  
  canUsePivotDimension(dimension: GroupDimension): boolean {
    return this.drillDownService.canUseDimension(dimension);
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
    return this.layouter.getGroupHeaders();
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
  
  /**
   * Override sync to update pivot groups
   */
  sync(products: Product[]): void {
    // Apply drill-down filters
    const filtered = this.mode === 'pivot' 
      ? this.drillDownService.filterProducts(products)
      : products;
    
    this.engine.sync(filtered, p => p.id);
    this.applyAnimationDuration();
    
    if (this.mode === 'pivot') {
      this.updatePivotGroups();
    }
  }
}
