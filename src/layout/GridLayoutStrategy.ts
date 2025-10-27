import { Vector2 } from 'arkturian-typescript-utils';
import { LayoutNode } from './LayoutNode';

export class GridLayoutStrategy<T> {
  spacingX = 12;
  spacingY = 12;
  targetCols?: number;

  deriveCols(frameLen: number, estimatedCell: number): number {
    if (this.targetCols && this.targetCols > 0) return this.targetCols;
    return Math.max(1, Math.floor((frameLen + this.spacingX) / (estimatedCell + this.spacingX)));
  }

  layout(frameX: number, frameYBottom: number, frameWidth: number, nodes: LayoutNode<T>[], baseH: number, cols: number, scaleOf: (n: LayoutNode<T>) => number) {
    const cellLen = (frameWidth - this.spacingX * (cols - 1)) / cols;
    let x = frameX;
    let yBaseline = frameYBottom;
    let rowMax = 0;
    let colIndex = 0;
    for (const n of nodes) {
      const s = scaleOf(n);
      const h = baseH * s;
      const w = h;
      if (colIndex >= cols) {
        colIndex = 0;
        x = frameX;
        yBaseline -= (rowMax + this.spacingY);
        rowMax = 0;
      }
      n.setTargets(new Vector2(x, yBaseline - h), new Vector2(w, h), 1, s);
      n.zIndex = Math.floor((frameYBottom - yBaseline) / (baseH + this.spacingY));
      x += cellLen + this.spacingX;
      colIndex++;
      rowMax = Math.max(rowMax, h);
    }
  }
}




