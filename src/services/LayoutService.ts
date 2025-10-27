import type { Product } from '../types/Product';
import { ProductLayoutAccessors } from '../layout/Accessors';
import { WeightScalePolicy } from '../layout/ScalePolicy';
import { SimpleLayouter, type SimpleLayoutConfig } from '../layout/SimpleLayouter';
import { PivotLayouter, type PivotConfig } from '../layout/PivotLayouter';
import { ShelfLayoutStrategy } from '../layout/ShelfLayoutStrategy';
import { LayoutEngine } from '../layout/LayoutEngine';

export type LayoutMode = 'grid' | 'masonry' | 'compact' | 'large' | 'pivot';

export class LayoutService {
  private mode: LayoutMode = 'pivot'; // Start with pivot layout!
  private engine: LayoutEngine<Product>;
  private layouter: SimpleLayouter<Product> | PivotLayouter<Product>;
  private access = new ProductLayoutAccessors();
  private scalePolicy = new WeightScalePolicy();

  constructor() {
    this.layouter = this.createLayouter(this.mode);
    this.engine = new LayoutEngine<Product>(this.layouter);
  }

  private createLayouter(mode: LayoutMode): SimpleLayouter<Product> | PivotLayouter<Product> {
    if (mode === 'pivot') {
      // Pivot layout with horizontal shelves (categories)
      const pivotConfig: PivotConfig<Product> = {
        orientation: 'rows',
        flow: 'ltr',
        groupKey: (p: Product) => p.category?.[0] || 'Uncategorized',
        frameGap: 40,
        framePadding: 20,
        itemGap: 12,
        rowBaseHeight: 150,
        innerLayoutType: 'shelf',
        access: this.access,
        scale: this.scalePolicy
      };
      return new PivotLayouter<Product>(pivotConfig);
    }
    
    // Grid/Masonry layouts
    const config = this.createGridConfig(mode);
    return new SimpleLayouter<Product>(config);
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
  }

  getMode(): LayoutMode {
    return this.mode;
  }

  getEngine(): LayoutEngine<Product> {
    return this.engine;
  }

  sync(products: Product[]): void {
    this.engine.sync(products, p => p.id);
  }

  layout(width: number, height: number): void {
    this.engine.layout({ width, height });
  }

  updateGridConfig(gridConfig: { spacing: number; margin: number; minCellSize: number; maxCellSize: number }): void {
    // Only works for grid layouts, not pivot
    if (this.mode === 'pivot') return;
    
    // Recreate layouter with new grid config
    const config = this.createGridConfig(this.mode);
    config.gridConfig = gridConfig;
    this.layouter = new SimpleLayouter<Product>(config);
    this.engine.setLayouter(this.layouter);
  }
}

