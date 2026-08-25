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
  /**
   * Category ROOT on desktop: show every product as a page-filling grid
   * first — the bildfüllend hero row hid what the category contains
   * (owner 2026-08-24, 120552 RAINWEAR). Set by LayoutService per layout
   * pass; drilling deeper returns to the hero row.
   */
  public overviewMode = false;

  constructor(private config: HeroLayoutConfig<T>) {}

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    if (!nodes.length) return;
    // Phone: the leaf level shows ALL its products as a full-page grid.
    // The bildfüllend hero row on a 390 px screen read as "one product
    // selected" although the user was still on the 10-product overview
    // (owner report 2026-08-23, storage 120526).
    if (view.width < 768) {
      // Overview = the 2-column grid; the presentation falls through to
      // the SAME horizontal row as desktop — the phone hero swipes
      // left/right too (owner 2026-08-24).
      if (this.overviewMode) {
        this.computePhoneGrid(nodes, view);
        return;
      }
    }
    if (this.overviewMode) {
      this.computeOverviewGrid(nodes, view);
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
    const gap = 12;
    const pad = 16;
    // Room under every tile for its caption (name + price). Without it the
    // next row's helmets sat ON the text (owner 2026-08-23, 120530).
    const captionH = 48;
    const n = nodes.length;
    const cellAspect = 0.8; // product tiles slightly taller than wide
    // 1 or 2 products get one roomy row; everything else is a 2-column
    // grid that scrolls vertically when it outgrows the page. Cramming 17
    // helmets onto one screen made 84 px thumbnails (120530).
    const cols = Math.min(n, 2);
    const cellW = (view.width - pad * 2 - (cols - 1) * gap) / cols;
    const cellH = cellW / cellAspect;
    const rowStep = cellH + captionH + gap;
    const rows = Math.ceil(n / cols);
    const gridW = cols * cellW + (cols - 1) * gap;
    const gridH = rows * rowStep - gap;
    const startX = Math.max(pad, (view.width - gridW) / 2);
    // Centre vertically only when everything fits; otherwise start at the
    // top and let the user scroll.
    const startY = gridH + pad * 2 <= view.height
      ? Math.max(pad, (view.height - gridH) / 2)
      : pad;
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
      node.posY.targetValue = startY + row * rowStep;
      node.width.targetValue = cellW;
      node.height.targetValue = cellH;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 1;
    }
    this.config.onLayout?.(nodes);
  }

  /** Desktop category-root overview: all products in a page-filling grid. */
  private computeOverviewGrid(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    const gap = 24;
    const pad = 48;
    const captionH = 56;
    const n = nodes.length;
    const cellAspect = 0.85;
    // Column count from width, then shrink cells until the rows fit the
    // page — the overview should not scroll for typical category sizes.
    let cols = Math.max(3, Math.min(n, Math.floor((view.width - pad * 2) / 240)));
    let cellW = (view.width - pad * 2 - (cols - 1) * gap) / cols;
    let rows = Math.ceil(n / cols);
    const fitsH = (w: number, r: number) => r * (w / cellAspect + captionH) + (r - 1) * gap <= view.height - pad;
    while (!fitsH(cellW, rows) && cols < Math.min(n, 8)) {
      cols++;
      cellW = (view.width - pad * 2 - (cols - 1) * gap) / cols;
      rows = Math.ceil(n / cols);
    }
    if (!fitsH(cellW, rows)) {
      cellW = ((view.height - pad - (rows - 1) * gap) / rows - captionH) * cellAspect;
    }
    cellW = Math.max(90, cellW);
    const cellH = cellW / cellAspect;
    const rowStep = cellH + captionH + gap;
    const gridW = cols * cellW + (cols - 1) * gap;
    const gridH = rows * rowStep - gap;
    const startX = Math.max(pad, (view.width - gridW) / 2);
    const startY = Math.max(24, (view.height - gridH) / 2);
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inLastRow = row === rows - 1;
      const lastRowCount = n - (rows - 1) * cols;
      const rowOffset = inLastRow && lastRowCount < cols
        ? ((cols - lastRowCount) * (cellW + gap)) / 2 : 0;
      node.posX.targetValue = startX + rowOffset + col * (cellW + gap);
      node.posY.targetValue = startY + row * rowStep;
      node.width.targetValue = cellW;
      node.height.targetValue = cellH;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 1;
    }
    this.config.onLayout?.(nodes);
  }

  /**
   * Phone hero presentation: one product per "page", stacked VERTICALLY —
   * the phone pendant of the desktop hero row (owner 2026-08-24). The
   * selected product is centred in the band above the bottom sheet; swipes
   * and the arrows move up/down.
   */
  private computePhoneColumn(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    const cell = Math.min(view.width * 0.82, view.height * 0.4);
    const step = view.height * 0.52;
    const x = (view.width - cell) / 2;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      node.posX.targetValue = x;
      node.posY.targetValue = 40 + i * step;
      node.width.targetValue = cell;
      node.height.targetValue = cell;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 1;
    }
    this.config.onLayout?.(nodes);
  }
}
