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
  /** Gruppe eines Knotens; Kopien bei Mehrfachwerten (Groesse) stehen in ihrer eigenen. */
  nodeGroupKey?: (node: LayoutNode<T>) => string;
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
  public posterHeaders: Array<{ x: number; y: number; text: string; raw: string; maxWidth?: number; static?: boolean }> = [];

  /**
   * Gruppen der Poster-View = Engine-Buckets der Ebene (LayoutService).
   * Damit ist der Gruppen-Klick eine echte Pivot-Action (drillDown auf
   * das Bucket-Label). Leer -> Fallback auf Attribut-Kandidaten.
   */
  public posterBuckets: Array<{ label: string; ids: Set<string> }> = [];
  /** Keine Gruppe mit mehr als einem Produkt: alle Produkte in einem Stapel. */
  public flatOverview = false;
  /** Ueberschrift der flachen Uebersicht: Name der Ebene, wie in der Gruppensicht (owner 2026-10-21, EX-SRS). */
  public flatTitle = '';

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
      // Flache Uebersicht immer als Plakat mit fester Zellgroesse: das
      // Raster zog wenige Produkte auf Bildschirmgroesse auf (media 131777).
      if (this.posterMode || this.flatOverview) {
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
  /**
   * Passt die Gruppenuebersicht ohne Scrollen auf die Seite? Rechnet das
   * Plakat durch, ohne Knoten zu verschieben.
   */
  posterFits(
    nodes: LayoutNode<T>[],
    view: { width: number; height: number },
    buckets: Array<{ label: string; ids: Set<string> }>,
  ): boolean {
    const saved = { buckets: this.posterBuckets, flat: this.flatOverview };
    this.posterBuckets = buckets;
    this.flatOverview = false;
    try {
      return this.computePosterGrid(nodes, view, true);
    } finally {
      this.posterBuckets = saved.buckets;
      this.flatOverview = saved.flat;
    }
  }

  private computePosterGrid(nodes: LayoutNode<T>[], view: { width: number; height: number }, measureOnly = false): boolean {
    const pad = 48;
    const headerH = 46;
    const shelfGapX = 56;
    const shelfGapY = 44;
    const advance = 0.36; // sichtbarer Anteil je ueberlapptem Produkt
    const cellAspect = 0.9;
    // Breite Produkte (Brustpanzer mit Schulterschalen, Helme von der Seite)
    // stiessen in der 0.9-Box seitlich an und wirkten neben schmalen
    // Nachbarn kleiner (owner 2026-10-21, Kinder › Protektoren › SPLIT).
    // Bis 1.2 bekommen sie eine breitere Box und damit volle Hoehe.
    const maxCellAspect = 1.2;
    const widthFactor = (node: LayoutNode<T>): number => {
      const img = (node.data as any)?.image;
      const r = img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
      return Number.isFinite(r) && r > cellAspect ? Math.min(r, maxCellAspect) / cellAspect : 1;
    };

    const attr = (node: LayoutNode<T>, key: string): string => {
      const data: any = node.data;
      const v = data?.attributes?.[key]?.value ?? data?.raw?.properties?.[key];
      return typeof v === 'string' && v.trim() ? v.trim() : '';
    };
    // Gleichmaessige Ueberlappung fuer alle Produkte; die unterschiedliche
    // Ueberlappung nach Design wirkte oft seltsam (owner 2026-10-21).
    // Das breitere der beiden Produkte bestimmt, wie weit das naechste rueckt.
    const step = (prev: LayoutNode<T>, next: LayoutNode<T>): number =>
      advance * Math.max(widthFactor(prev), widthFactor(next));
    const stackUnits = (list: LayoutNode<T>[]): number => {
      let units = list.length ? widthFactor(list[0]) : 1;
      for (let i = 1; i < list.length; i++) {
        units += step(list[i - 1], list[i]) + widthFactor(list[i]) - widthFactor(list[i - 1]);
      }
      return units;
    };
    const groups = new Map<string, LayoutNode<T>[]>();
    if (this.flatOverview) {
      groups.set(this.flatTitle, [...nodes]);
    } else if (this.posterBuckets.length >= 2) {
      // Gruppen = Engine-Buckets (Bucket-Reihenfolge, Rest -> WEITERE)
      // "N/A" (Produkte ohne Wert) ist fuer Haendler keine Gruppe — Rest.
      const labelOf = (label: string) => (label === 'N/A' ? 'WEITERE' : label);
      for (const bucket of this.posterBuckets) groups.set(labelOf(bucket.label), []);
      for (const node of nodes) {
        const id = String((node.data as any)?.id ?? '');
        const own = this.config.nodeGroupKey?.(node);
        const bucket = own && groups.has(labelOf(own))
          ? { label: own }
          : this.posterBuckets.find(item => item.ids.has(id));
        const key = bucket ? labelOf(bucket.label) : 'WEITERE';
        const list = groups.get(key);
        if (list) list.push(node); else groups.set(key, [node]);
      }
      for (const [key, list] of [...groups]) { if (!list.length) groups.delete(key); }
    } else {
      // Fallback: erste Dimension, die tatsaechlich splittet
      const candidates = ['product_line', 'design_group', 'color_base', 'color_name'];
      let groupKey = '';
      for (const candidate of candidates) {
        const distinct = new Set(nodes.map(node => attr(node, candidate)).filter(Boolean));
        if (distinct.size >= 2) { groupKey = candidate; break; }
      }
      for (const node of nodes) {
        const key = (groupKey && attr(node, groupKey)) || 'WEITERE';
        const list = groups.get(key);
        if (list) list.push(node); else groups.set(key, [node]);
      }
    }
    // Die Restgruppe entstand dort, wo das erste Produkt ohne Wert lag —
    // mitten zwischen den Modellen (owner 2026-09-28, media 128369). Ans Ende.
    const rest = groups.get('WEITERE');
    if (rest) {
      groups.delete('WEITERE');
      groups.set('WEITERE', rest);
    }

    // Zellgroesse iterativ verkleinern bis die Blöcke die Seite fuellen,
    // ohne sie zu sprengen; darunter scrollt die Overview vertikal weiter.
    // Gross starten, die Schleife unten verkleinert, bis alles auf die Seite
    // passt. Die fruehere Obergrenze 280px liess wenige Gruppen winzig in
    // der Seitenmitte stehen (owner 2026-10-22, RAINWEAR › Preis, media 131971).
    let cellH = Math.max(150, view.height * 0.55);
    const layoutOnce = (h: number) => {
      const w = h * cellAspect;
      // Ueberbreite Gruppen in zeilen-fuellende Teilstapel brechen —
      // Header nur am ersten Teil.
      const maxUnits = Math.max(1, (view.width - pad * 2) / w);
      const shelves: Array<{ key: string; nodes: LayoutNode<T>[]; showHeader: boolean }> = [];
      for (const [key, list] of groups) {
        let start = 0;
        while (start < list.length) {
          let end = start + 1;
          while (end < list.length && stackUnits(list.slice(start, end + 1)) <= maxUnits) end++;
          shelves.push({ key, nodes: list.slice(start, end), showHeader: start === 0 && key !== '' });
          start = end;
        }
      }
      const rows: Array<Array<{ key: string; nodes: LayoutNode<T>[]; shelfW: number; showHeader: boolean }>> = [[]];
      let cursorX = pad;
      for (const shelf of shelves) {
        // Shelfbreite = Stapel ODER Headertext (18px-Versalien ~ 11px/Zeichen)
        // — sonst laufen die Header benachbarter Ein-Produkt-Gruppen ineinander.
        const stackW = w * stackUnits(shelf.nodes);
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
      // Fortsetzungszeilen (reine Teilstapel ohne Header) ruecken enger an
      // ihre Gruppe: kein Header-Raum und kleinerer Zeilenabstand als
      // zwischen Gruppen (owner 2026-08-25, media 120662).
      const intraGapY = 14;
      let totalH = 0;
      rows.forEach((row, idx) => {
        const hasHeader = row.some(shelf => shelf.showHeader);
        totalH += (hasHeader ? headerH : intraGapY) + h;
        if (idx < rows.length - 1) {
          const nextHasHeader = rows[idx + 1].some(shelf => shelf.showHeader);
          totalH += nextHasHeader ? shelfGapY : 0;
        }
      });
      return { rows, totalH, w, intraGapY };
    };
    let plan = layoutOnce(cellH);
    while (plan.totalH > view.height - pad * 2 && cellH > 140) {
      cellH -= 16;
      plan = layoutOnce(cellH);
    }
    const fits = plan.totalH <= view.height - pad * 2;
    if (measureOnly) return fits;

    this.posterHeaders = [];
    const startY = Math.max(24, (view.height - plan.totalH) / 2);
    let y = startY;
    plan.rows.forEach((row, idx) => {
      const hasHeader = row.some(shelf => shelf.showHeader);
      const topSpace = hasHeader ? headerH : plan.intraGapY;
      const rowW = row.reduce((sum, shelf) => sum + shelf.shelfW, 0) + (row.length - 1) * shelfGapX;
      let x = Math.max(pad, (view.width - rowW) / 2);
      for (const shelf of row) {
        if (shelf.showHeader) {
          this.posterHeaders.push({ x, y: y + headerH - 14, text: shelf.key.toUpperCase(), raw: shelf.key, maxWidth: shelf.shelfW + shelfGapX * 0.5, static: this.flatOverview });
        }
        let offset = 0;
        for (let i = 0; i < shelf.nodes.length; i++) {
          const node = shelf.nodes[i];
          if (i > 0) offset += step(shelf.nodes[i - 1], node);
          node.posX.targetValue = x + offset * plan.w;
          node.posY.targetValue = y + topSpace;
          node.width.targetValue = plan.w * widthFactor(node);
          node.height.targetValue = cellH;
          node.scale.targetValue = 1;
          node.opacity.targetValue = 1;
        }
        x += shelf.shelfW + shelfGapX;
      }
      y += topSpace + cellH;
      if (idx < plan.rows.length - 1) {
        const nextHasHeader = plan.rows[idx + 1].some(shelf => shelf.showHeader);
        y += nextHasHeader ? shelfGapY : 0;
      }
    });
    this.config.onLayout?.(nodes);
    return fits;
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
