import { LayoutNode } from './LayoutNode';
import type { GroupHeaderInfo } from './PivotLayouter';

export type PosterRowDefinition = {
  key: string;
  label: string;
  height: number;
};

export type PosterLayoutConfig<T> = {
  rows: PosterRowDefinition[];
  margin: number;
  columnGap: number;
  rowGap: number;
  groupKey: (item: T) => string;
};

const HEADER_HEIGHT = 28;
const HEADER_LABEL_GAP = 8;
const MIN_CELL_WIDTH = 48;

export class PosterLayouter<T> {
  private headers: GroupHeaderInfo[] = [];

  constructor(private readonly config: PosterLayoutConfig<T>) {}

  getGroupHeaders(): GroupHeaderInfo[] {
    return this.headers;
  }

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    this.headers = [];
    if (!nodes.length) {
      return;
    }

    const margin = this.config.margin;
    const columnGap = this.config.columnGap;
    const rowGap = this.config.rowGap;
    const usableWidth = Math.max(1, view.width - margin * 2);

    const grouped = new Map<string, LayoutNode<T>[]>();
    for (const node of nodes) {
      const key = this.config.groupKey(node.data) || 'poster_other';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(node);
    }

    let currentY = margin;

    for (const row of this.config.rows) {
      const rowNodes = grouped.get(row.key);
      if (!rowNodes || !rowNodes.length) {
        continue;
      }

      grouped.delete(row.key);

      const headerY = currentY;
      this.headers.push({
        key: row.key,
        label: row.label,
        x: margin,
        y: headerY,
        width: usableWidth,
        height: HEADER_HEIGHT,
      });

      const rowTop = headerY + HEADER_HEIGHT + HEADER_LABEL_GAP;
      const count = rowNodes.length;
      const totalGap = columnGap * Math.max(0, count - 1);
      const cellWidth = Math.max(
        MIN_CELL_WIDTH,
        (usableWidth - totalGap) / Math.max(1, count),
      );

      for (let index = 0; index < rowNodes.length; index++) {
        const node = rowNodes[index];
        const x = margin + index * (cellWidth + columnGap);
        node.posX.value = x;
        node.posY.value = rowTop;
        node.width.value = cellWidth;
        node.height.value = row.height;
        node.scale.value = 1;
        node.opacity.value = 1;
      }

      currentY = rowTop + row.height + rowGap;
    }

    if (!grouped.size) {
      return;
    }

    // Layout any remaining groups in a final row block
    const remainingNodes: LayoutNode<T>[] = [];
    for (const nodesOfGroup of grouped.values()) {
      remainingNodes.push(...nodesOfGroup);
    }
    if (!remainingNodes.length) {
      return;
    }

    const leftoverKey = 'poster_other';
    const leftoverLabel = 'Weitere Produkte';
    this.headers.push({
      key: leftoverKey,
      label: leftoverLabel,
      x: margin,
      y: currentY,
      width: usableWidth,
      height: HEADER_HEIGHT,
    });

    const rowTop = currentY + HEADER_HEIGHT + HEADER_LABEL_GAP;
    const totalGap = columnGap * Math.max(0, remainingNodes.length - 1);
    const cellWidth = Math.max(
      MIN_CELL_WIDTH,
      (usableWidth - totalGap) / Math.max(1, remainingNodes.length),
    );
    const cellHeight =
      this.config.rows[this.config.rows.length - 1]?.height ?? 160;

    for (let index = 0; index < remainingNodes.length; index++) {
      const node = remainingNodes[index];
      const x = margin + index * (cellWidth + columnGap);
      node.posX.value = x;
      node.posY.value = rowTop;
      node.width.value = cellWidth;
      node.height.value = cellHeight;
      node.scale.value = 1;
      node.opacity.value = 1;
    }
  }
}


