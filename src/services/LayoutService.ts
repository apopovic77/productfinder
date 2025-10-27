import type { Product } from '../types/Product';
import { ProductLayoutAccessors } from '../layout/Accessors';
import { WeightScalePolicy } from '../layout/ScalePolicy';
import { GridLayoutStrategy } from '../layout/GridLayoutStrategy';
import { PivotLayouter, type PivotConfig } from '../layout/PivotLayouter';
import { LayoutEngine } from '../layout/LayoutEngine';

export type LayoutMode = 'grid' | 'list' | 'compact' | 'large';

export class LayoutService {
  private mode: LayoutMode = 'grid';
  private engine: LayoutEngine<Product>;
  private layouter: PivotLayouter<Product>;
  private access = new ProductLayoutAccessors();
  private scalePolicy = new WeightScalePolicy();

  constructor() {
    const config = this.createConfig(this.mode);
    this.layouter = new PivotLayouter<Product>(config);
    this.engine = new LayoutEngine<Product>(this.layouter);
  }

  private createConfig(mode: LayoutMode): PivotConfig<Product> {
    switch (mode) {
      case 'list':
        return {
          orientation: 'rows', flow: 'ltr',
          groupKey: () => 'all',
          frameGap: 12, framePadding: 12, itemGap: 12, rowBaseHeight: 180,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
      case 'compact':
        return {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 12, framePadding: 8, itemGap: 8, rowBaseHeight: 80,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
      case 'large':
        return {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 32, framePadding: 20, itemGap: 20, rowBaseHeight: 200,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
      case 'grid':
      default:
        return {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 24, framePadding: 12, itemGap: 12, rowBaseHeight: 120,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
    }
  }

  setMode(mode: LayoutMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    const config = this.createConfig(mode);
    this.layouter = new PivotLayouter<Product>(config);
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
}

