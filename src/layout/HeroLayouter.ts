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

  /**
   * PROTOTYP Poster-Grid (owner 2026-08-25, A1-B2B-Plakat 120618-120622):
   * Overview als Modell-Bloecke mit ueberlappenden Colorway-Stapeln statt
   * uniformem Raster. Aktivierung via ?poster=1 (LayoutService).
   */
  public posterMode = false;
  /** Typo-Header pro Modell-Block, gezeichnet vom CanvasRenderer (world coords). */
  public posterHeaders: Array<{ x: number; y: number; text: string; maxWidth?: number }> = [];

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
      if (this.posterMode) {
        this.computePosterGrid(nodes, view);
        return;
      }
      this.posterHeaders = [];
      this.computeOverviewGrid(nodes, view);
      return;
    }
    this.posterHeaders = [];
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
   * Poster-Grid (Prototyp): Gruppierung nach Produktlinie (Fallback Design),
   * pro Gruppe ein Typo-Header und ein horizontal ueberlappender Stapel —
   * die Colorways teilen die Silhouette, Ueberlappung verdeckt nur
   * redundante Form (A1-Plakat-Prinzip). Draw-Order = Array-Order, also
   * liegt innerhalb eines Stapels das rechte Produkt oben.
   */
  private computePosterGrid(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    const pad = 48;
    const headerH = 46;
    const shelfGapX = 56;
    const shelfGapY = 44;
    const advance = 0.36; // sichtbarer Anteil je ueberlapptem Produkt
    const cellAspect = 0.9;

    const attr = (node: LayoutNode<T>, key: string): string => {
      const data: any = node.data;
      const v = data?.attributes?.[key]?.value ?? data?.raw?.properties?.[key];
      return typeof v === 'string' && v.trim() ? v.trim() : '';
    };
    // Gruppierschluessel nach Trennschaerfe (wie die Pivot-Engine): die
    // erste Dimension, die tatsaechlich splittet — eine Ebene tiefer ist
    // product_line uniform, dann traegt design_group die Poster-Bloecke.
    const candidates = ['product_line', 'design_group', 'color_base', 'color_name'];
    let groupKey = '';
    for (const candidate of candidates) {
      const distinct = new Set(nodes.map(node => attr(node, candidate)).filter(Boolean));
      if (distinct.size >= 2) { groupKey = candidate; break; }
    }
    const groups = new Map<string, LayoutNode<T>[]>();
    for (const node of nodes) {
      const key = (groupKey && attr(node, groupKey)) || 'WEITERE';
      const list = groups.get(key);
      if (list) list.push(node); else groups.set(key, [node]);
    }

    // Zellgroesse iterativ verkleinern bis die Blöcke die Seite fuellen,
    // ohne sie zu sprengen; darunter scrollt die Overview vertikal weiter.
    let cellH = Math.min(280, Math.max(150, view.height * 0.32));
    const layoutOnce = (h: number) => {
      const w = h * cellAspect;
      // Ueberbreite Gruppen in zeilen-fuellende Teilstapel brechen —
      // Header nur am ersten Teil.
      const maxPerShelf = Math.max(1, Math.floor(((view.width - pad * 2) / w - 1) / advance) + 1);
      const shelves: Array<{ key: string; nodes: LayoutNode<T>[]; showHeader: boolean }> = [];
      for (const [key, list] of groups) {
        for (let i = 0; i < list.length; i += maxPerShelf) {
          shelves.push({ key, nodes: list.slice(i, i + maxPerShelf), showHeader: i === 0 });
        }
      }
      const rows: Array<Array<{ key: string; nodes: LayoutNode<T>[]; shelfW: number; showHeader: boolean }>> = [[]];
      let cursorX = pad;
      for (const shelf of shelves) {
        // Shelfbreite = Stapel ODER Headertext (18px-Versalien ~ 11px/Zeichen)
        // — sonst laufen die Header benachbarter Ein-Produkt-Gruppen ineinander.
        const stackW = w * (1 + (shelf.nodes.length - 1) * advance);
        const shelfW = shelf.showHeader
          ? Math.max(stackW, Math.min(shelf.key.length * 11, stackW + 160))
          : stackW;
        if (cursorX > pad && cursorX + shelfW > view.width - pad) {
          rows.push([]);
          cursorX = pad;
        }
        rows[rows.length - 1].push({ key: shelf.key, nodes: shelf.nodes, shelfW, showHeader: shelf.showHeader });
        cursorX += shelfW + shelfGapX;
      }
      const totalH = rows.length * (headerH + h + shelfGapY) - shelfGapY;
      return { rows, totalH, w };
    };
    let plan = layoutOnce(cellH);
    while (plan.totalH > view.height - pad * 2 && cellH > 140) {
      cellH -= 16;
      plan = layoutOnce(cellH);
    }

    this.posterHeaders = [];
    const startY = Math.max(24, (view.height - plan.totalH) / 2);
    let y = startY;
    for (const row of plan.rows) {
      const rowW = row.reduce((sum, shelf) => sum + shelf.shelfW, 0) + (row.length - 1) * shelfGapX;
      let x = Math.max(pad, (view.width - rowW) / 2);
      for (const shelf of row) {
        if (shelf.showHeader) {
          this.posterHeaders.push({ x, y: y + headerH - 14, text: shelf.key.toUpperCase(), maxWidth: shelf.shelfW + shelfGapX * 0.5 });
        }
        for (let i = 0; i < shelf.nodes.length; i++) {
          const node = shelf.nodes[i];
          node.posX.targetValue = x + i * plan.w * advance;
          node.posY.targetValue = y + headerH;
          node.width.targetValue = plan.w;
          node.height.targetValue = cellH;
          node.scale.targetValue = 1;
          node.opacity.targetValue = 1;
        }
        x += shelf.shelfW + shelfGapX;
      }
      y += headerH + cellH + shelfGapY;
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
