import { LayoutNode } from './LayoutNode';
import { SmartGridLayoutStrategy, type GridConfig } from './SmartGridLayoutStrategy';
import { MasonryLayoutStrategy } from './MasonryLayoutStrategy';
import { WeightScalePolicy, type ScaleContext } from './ScalePolicy';

export type SimpleLayoutMode = 'grid' | 'masonry';

export type SimpleLayoutConfig<T> = {
  mode: SimpleLayoutMode;
  gridConfig: GridConfig;
  access: { weight(item: T): number | undefined };
  scale: WeightScalePolicy;
};

/**
 * SimpleLayouter - No grouping, just one big layout
 * 
 * Unlike PivotLayouter (which groups by category), this lays out
 * ALL products in a single viewport using either:
 * - Smart Grid: Perfect matrix with auto-calculated size
 * - Masonry: Dense packing with varied sizes
 */
export class SimpleLayouter<T> {
  constructor(private config: SimpleLayoutConfig<T>) {}

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }) {
    if (nodes.length === 0) return;

    // Calculate weight context for scaling
    const weights: number[] = [];
    nodes.forEach(n => { 
      const w = this.config.access.weight(n.data); 
      if (typeof w === 'number') weights.push(w); 
    });
    const ctx: ScaleContext = { 
      weightMin: weights.length ? Math.min(...weights) : undefined, 
      weightMax: weights.length ? Math.max(...weights) : undefined, 
      clampMin: 0.8, 
      clampMax: 1.4 
    };

    const deriveScale = (n: LayoutNode<T>) => this.config.scale.computeScale(n.data as any, ctx);

    if (this.config.mode === 'masonry') {
      // Masonry layout - dense packing with varied sizes
      const masonry = new MasonryLayoutStrategy<T>(this.config.gridConfig);
      masonry.layout(view.width, view.height, nodes, deriveScale);
    } else {
      // Smart grid layout - perfect matrix
      const grid = new SmartGridLayoutStrategy<T>(this.config.gridConfig);
      grid.layout(view.width, view.height, nodes, deriveScale);
    }
  }
}

