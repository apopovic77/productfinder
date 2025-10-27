import type { Product } from '../types/Product';
import { ProductLayoutAccessors } from '../layout/Accessors';
import { WeightScalePolicy } from '../layout/ScalePolicy';
import { SimpleLayouter, type SimpleLayoutConfig } from '../layout/SimpleLayouter';
import { LayoutEngine } from '../layout/LayoutEngine';

export type LayoutMode = 'grid' | 'masonry' | 'compact' | 'large';

export class LayoutService {
  private mode: LayoutMode = 'grid';
  private engine: LayoutEngine<Product>;
  private layouter: SimpleLayouter<Product>;
  private access = new ProductLayoutAccessors();
  private scalePolicy = new WeightScalePolicy();

  constructor() {
    const config = this.createConfig(this.mode);
    this.layouter = new SimpleLayouter<Product>(config);
    this.engine = new LayoutEngine<Product>(this.layouter);
  }

  private createConfig(mode: LayoutMode): SimpleLayoutConfig<Product> {
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
    const config = this.createConfig(mode);
    this.layouter = new SimpleLayouter<Product>(config);
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
    // Recreate layouter with new grid config
    const config = this.createConfig(this.mode);
    config.gridConfig = gridConfig;
    this.layouter = new SimpleLayouter<Product>(config);
    this.engine.setLayouter(this.layouter);
  }
}

