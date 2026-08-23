import { LayoutNode } from './LayoutNode';
import type { ILayouter } from './LayoutEngine';

export type HeroLayoutConfig<T> = {
  spacing: number;
  targetHeightRatio: number;
  /**
   * Share of the view width a single product may occupy (desktop hero
   * dock, design 2026-08-23): the product card sits in the right third,
   * so the hero must not grow under it. Undefined = height-driven only.
   */
  maxWidthRatio?: number;
  minHeight?: number;
  horizontalPadding?: number;
  onLayout?: (nodes: LayoutNode<T>[]) => void;
};

export class HeroLayouter<T> implements ILayouter<T> {
  constructor(private config: HeroLayoutConfig<T>) {}

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    if (!nodes.length) return;
    // Phone: the leaf level shows ALL its products as a full-page grid.
    // The bildfüllend hero row on a 390 px screen read as "one product
    // selected" although the user was still on the 10-product overview
    // (owner report 2026-08-23, storage 120526).
    if (view.width < 768) {
      this.computePhoneGrid(nodes, view);
      return;
    }
    const spacing = this.config.spacing ?? 24;
    const padding = Math.max(0, this.config.horizontalPadding ?? 60);
    const availableHeight = Math.max(1, view.height);
    const ratio = this.config.targetHeightRatio ?? 0.8;
    let targetHeight = Math.max(
      this.config.minHeight ?? 80,
      Math.min(availableHeight * ratio, availableHeight)
    );
    // Cap by width: a helmet is ~1.3x wider than tall, so 80 % of the height
    // can mean 70 % of the width — straight under the docked card.
    const maxWidth = this.config.maxWidthRatio ? view.width * this.config.maxWidthRatio : Infinity;
    const widestAspect = nodes.reduce((m, node) => {
      const img = (node.data as any)?.image;
      const r = img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.75;
      return Math.max(m, Math.min(3, Math.max(0.3, r)));
    }, 0.75);
    if (targetHeight * widestAspect > maxWidth) {
      targetHeight = Math.max(this.config.minHeight ?? 80, maxWidth / widestAspect);
    }

    const fallbackAspect = 0.75;
    const widths: number[] = [];
    const heights: number[] = [];

    for (const node of nodes) {
      let aspect = fallbackAspect;
      const data: any = node.data as any;
      const img = data?.image;
      if (img && img.naturalWidth && img.naturalHeight) {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (Number.isFinite(ratio) && ratio > 0.1) {
          aspect = Math.min(3, Math.max(0.3, ratio));
        }
      }
      heights.push(targetHeight);
      widths.push(targetHeight * aspect);
    }

    const totalWidth =
      widths.reduce((sum, w) => sum + w, 0) + Math.max(0, nodes.length - 1) * spacing;

    const startX =
      totalWidth + padding * 2 <= view.width
        ? Math.max(padding, (view.width - totalWidth) / 2)
        : padding;
    let currentX = startX;
    const centerY = view.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const width = widths[i];
      const height = heights[i];
      const x = currentX;
      const y = centerY - height / 2;

      // Use targetValue for smooth interpolation (continuous flow)
      node.posX.targetValue = x;
      node.posY.targetValue = y;
      node.width.targetValue = width;
      node.height.targetValue = height;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 1;

      currentX += width + spacing;
    }

    this.config.onLayout?.(nodes);
  }

  /** Full-page grid for narrow viewports: pick the column count whose cells
   *  best fill the page, centre the block. */
  private computePhoneGrid(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    const gap = 10;
    const pad = 14;
    const n = nodes.length;
    const cellAspect = 0.8; // product tiles slightly taller than wide
    // Smallest column count whose rows fit the page height — that yields the
    // biggest cells WITHOUT vertical overflow. Fallback: 4 columns, shrunk.
    let cols = Math.min(n, 4);
    let cellW = 0;
    for (let c = 1; c <= Math.min(n, 4); c++) {
      const rows = Math.ceil(n / c);
      const wCell = (view.width - pad * 2 - (c - 1) * gap) / c;
      const totalH = rows * (wCell / cellAspect) + (rows - 1) * gap;
      if (totalH <= view.height - pad * 2) { cols = c; cellW = wCell; break; }
    }
    if (!cellW) {
      const rows = Math.ceil(n / cols);
      cellW = Math.min(
        (view.width - pad * 2 - (cols - 1) * gap) / cols,
        ((view.height - pad * 2 - (rows - 1) * gap) / rows) * cellAspect,
      );
    }
    cellW = Math.max(40, cellW);
    const cellH = cellW / cellAspect;
    const rows = Math.ceil(n / cols);
    const gridW = cols * cellW + (cols - 1) * gap;
    const gridH = rows * cellH + (rows - 1) * gap;
    const startX = Math.max(pad, (view.width - gridW) / 2);
    const startY = Math.max(pad, (view.height - gridH) / 2);
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Last row centred when not full
      const inLastRow = row === rows - 1;
      const lastRowCount = n - (rows - 1) * cols;
      const rowOffset = inLastRow && lastRowCount < cols
        ? ((cols - lastRowCount) * (cellW + gap)) / 2 : 0;
      node.posX.targetValue = startX + rowOffset + col * (cellW + gap);
      node.posY.targetValue = startY + row * (cellH + gap);
      node.width.targetValue = cellW;
      node.height.targetValue = cellH;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 1;
    }
    this.config.onLayout?.(nodes);
  }
}
