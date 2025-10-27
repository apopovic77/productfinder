import { LayoutNode } from './LayoutNode';
import { PivotLayouter } from './PivotLayouter';

export class LayoutEngine<T> {
  private nodes = new Map<string, LayoutNode<T>>();
  constructor(private layouter: PivotLayouter<T>) {}
  sync(items: T[], idOf: (t: T) => string) {
    const keep = new Set<string>();
    for (const it of items) {
      const id = idOf(it);
      keep.add(id);
      if (!this.nodes.has(id)) this.nodes.set(id, new LayoutNode<T>(id, it));
      else this.nodes.get(id)!.data = it;
    }
    for (const id of Array.from(this.nodes.keys())) if (!keep.has(id)) this.nodes.delete(id);
  }
  layout(view: { width: number; height: number }) {
    this.layouter.compute(Array.from(this.nodes.values()), view);
  }
  all(): LayoutNode<T>[] { return Array.from(this.nodes.values()); }
}




