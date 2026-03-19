import { LayoutNode } from './LayoutNode';
import type { ILayouter } from './LayoutEngine';
import type { GroupHeaderInfo } from './PivotLayouter';

export type LaneConfig<T> = {
  groupKey: (t: T) => string;
  groupSort?: (a: string, b: string) => number;
  itemSort?: (a: T, b: T) => number;
  subGroupKey?: (t: T) => string; // clusters items within a lane
  laneHeight?: number;
  laneGap?: number;
  itemGap?: number;
  subGroupGap?: number; // larger gap between sub-groups
  headerHeight?: number;
  paddingX?: number;
  paddingTop?: number;
};

/**
 * LaneLayouter — Netflix/Shop style layout.
 * Groups arranged as horizontal lanes stacked vertically.
 * Each lane shows products in a single horizontal row.
 */
export class LaneLayouter<T> implements ILayouter<T> {
  private groupHeaders: GroupHeaderInfo[] = [];

  constructor(private config: LaneConfig<T>) {}

  getGroupHeaders(): GroupHeaderInfo[] {
    return this.groupHeaders;
  }

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    if (!nodes.length) {
      this.groupHeaders = [];
      return;
    }

    this.groupHeaders = [];

    // Group nodes
    const groups = new Map<string, LayoutNode<T>[]>();
    for (const n of nodes) {
      const key = this.config.groupKey(n.data);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }

    const keys = Array.from(groups.keys());
    if (this.config.groupSort) keys.sort(this.config.groupSort);

    const paddingX = this.config.paddingX ?? 32;
    const paddingTop = this.config.paddingTop ?? 24;
    const headerHeight = this.config.headerHeight ?? 48;
    const laneGap = this.config.laneGap ?? 32;
    const itemGap = this.config.itemGap ?? 16;

    // Calculate item size: fit nicely in lane height
    const laneHeight = this.config.laneHeight ?? Math.min(220, (view.height - paddingTop) / 3);
    const itemSize = laneHeight - headerHeight;

    let offsetY = paddingTop;

    for (const key of keys) {
      const list = groups.get(key)!;
      if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));

      const itemY = offsetY + headerHeight + 16; // margin between header and items
      const subGroupGap = this.config.subGroupGap ?? itemGap * 2.5;
      const subGroupKeyFn = this.config.subGroupKey;

      // Position items horizontally, with larger gaps between sub-groups
      let offsetX = paddingX;
      let prevSubGroup: string | null = null;

      for (const node of list) {
        // Add extra gap when sub-group changes
        if (subGroupKeyFn) {
          const subGroup = subGroupKeyFn(node.data);
          if (prevSubGroup !== null && subGroup !== prevSubGroup) {
            offsetX += subGroupGap - itemGap; // add difference
          }
          prevSubGroup = subGroup;
        }

        node.posX.targetValue = offsetX;
        node.posY.targetValue = itemY;
        node.width.targetValue = itemSize;
        node.height.targetValue = itemSize;
        node.scale.targetValue = 1;
        node.opacity.targetValue = 1;

        offsetX += itemSize + itemGap;
      }

      // Header width = content width (not full screen)
      const contentWidth = Math.max(itemSize, offsetX - paddingX - itemGap);
      this.groupHeaders.push({
        key,
        label: `${key} (${list.length})`,
        x: paddingX,
        y: offsetY,
        width: Math.min(contentWidth, 300),
        height: headerHeight,
      });

      offsetY += laneHeight + laneGap + 16; // extra bottom margin
    }
  }
}
