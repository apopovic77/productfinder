import { LayoutNode } from './LayoutNode';
import { GridLayoutStrategy } from './GridLayoutStrategy';
import { ShelfLayoutStrategy } from './ShelfLayoutStrategy';
import { WeightScalePolicy, type ScaleContext } from './ScalePolicy';
import { Vector2 } from 'arkturian-typescript-utils';

export type Orientation = 'rows' | 'columns';
export type Flow = 'ltr' | 'rtl' | 'ttb' | 'btt';
export type InnerLayoutType = 'grid' | 'shelf';

export type PivotConfig<T> = {
  orientation: Orientation;
  flow: Flow;
  groupKey: (t: T) => string;
  groupSort?: (a: string, b: string) => number;
  itemSort?: (a: T, b: T) => number;
  frameGap: number;
  framePadding: number;
  itemGap: number;
  rowBaseHeight?: number;
  colBaseWidth?: number;
  access: { weight(item: T): number | undefined };
  scale: WeightScalePolicy;
  innerLayoutType?: InnerLayoutType;
  innerFactory?: () => GridLayoutStrategy<T>;
}

export class PivotLayouter<T> {
  constructor(private config: PivotConfig<T>) {}

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }) {
    if (nodes.length === 0) return;
    
    // Group products by category
    const groups = new Map<string, LayoutNode<T>[]>();
    for (const n of nodes) {
      const key = this.config.groupKey(n.data);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    const keys = Array.from(groups.keys());
    if (this.config.groupSort) keys.sort(this.config.groupSort);

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

    const baseH = this.config.rowBaseHeight || 120;
    const deriveScale = (n: LayoutNode<T>) => this.config.scale.computeScale(n.data as any, ctx);

    // Use shelf layout (Microsoft Pivot style)
    const innerLayoutType = this.config.innerLayoutType || 'shelf';
    
    if (innerLayoutType === 'shelf') {
      // SHELF LAYOUT: Horizontal groups (categories) with bottom-aligned products
      const shelf = new ShelfLayoutStrategy<T>();
      shelf.spacingX = this.config.itemGap;
      shelf.spacingY = this.config.itemGap;

      // Calculate frame width for each group
      // Each group gets equal width (can scroll horizontally)
      const frameWidth = Math.max(400, view.width * 0.8); // Min 400px per group
      
      let offsetX = this.config.framePadding;
      for (const k of keys) {
        const list = groups.get(k)!;
        if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
        
        // Layout this group as a shelf
        shelf.layout(
          offsetX, 
          view.height - this.config.framePadding, 
          frameWidth, 
          list, 
          baseH, 
          deriveScale
        );
        
        offsetX += frameWidth + this.config.frameGap;
      }
    } else {
      // GRID LAYOUT: Original grid-based layout
      const inner = this.config.innerFactory!();
      inner.spacingX = this.config.itemGap; 
      inner.spacingY = this.config.itemGap;

      const totalGap = this.config.frameGap * Math.max(0, keys.length - 1);
      const frameWidth = Math.max(0, (view.width - totalGap - 2 * this.config.framePadding) / Math.max(1, keys.length));

      let offsetX = this.config.framePadding;
      for (const k of keys) {
        const list = groups.get(k)!;
        if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
        const cols = inner.deriveCols(frameWidth, baseH);
        inner.layout(offsetX, view.height - this.config.framePadding, frameWidth, list, baseH, cols, deriveScale);
        offsetX += frameWidth + this.config.frameGap;
      }
    }
  }
}




