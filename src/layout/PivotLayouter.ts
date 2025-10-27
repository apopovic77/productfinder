import { LayoutNode } from './LayoutNode';
import { GridLayoutStrategy } from './GridLayoutStrategy';
import { WeightScalePolicy, ScaleContext } from './ScalePolicy';
import { Vector2 } from '@presenter/Vector2';

export type Orientation = 'rows' | 'columns';
export type Flow = 'ltr' | 'rtl' | 'ttb' | 'btt';

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
  innerFactory: () => GridLayoutStrategy<T>;
}

export class PivotLayouter<T> {
  constructor(private config: PivotConfig<T>) {}

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }) {
    if (nodes.length === 0) return;
    const groups = new Map<string, LayoutNode<T>[]>();
    for (const n of nodes) {
      const key = this.config.groupKey(n.data);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    const keys = Array.from(groups.keys());
    if (this.config.groupSort) keys.sort(this.config.groupSort);

    const inner = this.config.innerFactory();
    inner.spacingX = this.config.itemGap; inner.spacingY = this.config.itemGap;

    const weights: number[] = [];
    nodes.forEach(n => { const w = this.config.access.weight(n.data); if (typeof w === 'number') weights.push(w); });
    const ctx: ScaleContext = { weightMin: weights.length ? Math.min(...weights) : undefined, weightMax: weights.length ? Math.max(...weights) : undefined, clampMin: 0.8, clampMax: 1.4 };

    // columns orientation for v1
    const totalGap = this.config.frameGap * Math.max(0, keys.length - 1);
    const frameWidth = Math.max(0, (view.width - totalGap - 2 * this.config.framePadding) / Math.max(1, keys.length));
    const baseH = this.config.rowBaseHeight || 120;
    const deriveScale = (n: LayoutNode<T>) => this.config.scale.computeScale(n.data as any, ctx);

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




