import type { LayoutNode } from './LayoutNode';

/**
 * Outfit-Ansicht (Issue #2547, owner 2026-10-21): Liefert die Smart Search
 * eine Ausruestung, stehen die Teile nicht als Haufen nebeneinander, sondern
 * an ihrer Stelle an einer unsichtbaren Figur, in realen Groessenverhaeltnissen
 * (Ghost-Mannequin). Masse, Anker und Ebenen: OnealProductKatalog, Post #5544
 * (Richtwerte fuer Erwachsene M/L, Bezugsfigur 180 cm, aufrecht von vorn).
 *
 * Skaliert wird ueber die Hoehe: die Knoten-Hoehe ist die reale Hoehe des
 * Teils, die Breite grosszuegig; das Bild wird darin eingepasst (contain) und
 * steht damit in der richtigen Hoehe, egal ob Front-, 45°- oder Seitenansicht.
 */

export type OutfitSlot =
  | 'helmet' | 'goggle' | 'jersey' | 'jacket' | 'pants' | 'glove' | 'boot'
  | 'chest' | 'back_shirt' | 'elbow' | 'knee' | 'kidney_belt' | 'neckbrace';

type SlotSpec = {
  /** reale Hoehe in cm */
  h: number;
  /** Mitte des Teils ueber dem Boden, Anteil der Koerperhoehe */
  anchorY: number;
  /** seitlicher Versatz von der Achse, Anteil der Koerperhoehe (Teil steht dann rechts) */
  x: number;
  /** Ebene, groesser = weiter vorn */
  z: number;
  youth: number;
  /** maximales Seitenverhaeltnis B/H der Box */
  maxAspect: number;
};

export const OUTFIT_SLOTS: Record<OutfitSlot, SlotSpec> = {
  helmet:      { h: 30,  anchorY: 0.92, x: 0,    z: 10, youth: 0.92, maxAspect: 1.4 },
  goggle:      { h: 10,  anchorY: 0.93, x: 0,    z: 11, youth: 0.9,  maxAspect: 3.4 },
  jersey:      { h: 75,  anchorY: 0.68, x: 0,    z: 4,  youth: 0.78, maxAspect: 1.1 },
  jacket:      { h: 78,  anchorY: 0.67, x: 0,    z: 4,  youth: 0.78, maxAspect: 1.1 },
  pants:       { h: 105, anchorY: 0.33, x: 0,    z: 5,  youth: 0.78, maxAspect: 0.7 },
  glove:       { h: 25,  anchorY: 0.44, x: 0.14, z: 9,  youth: 0.8,  maxAspect: 0.8 },
  boot:        { h: 42,  anchorY: 0.12, x: 0,    z: 6,  youth: 0.8,  maxAspect: 1.2 },
  chest:       { h: 50,  anchorY: 0.70, x: 0,    z: 7,  youth: 0.8,  maxAspect: 1.1 },
  back_shirt:  { h: 60,  anchorY: 0.68, x: 0,    z: 1,  youth: 0.8,  maxAspect: 1.0 },
  elbow:       { h: 28,  anchorY: 0.62, x: 0.13, z: 3,  youth: 0.8,  maxAspect: 1.3 },
  knee:        { h: 40,  anchorY: 0.25, x: 0,    z: 3,  youth: 0.8,  maxAspect: 1.3 },
  kidney_belt: { h: 23,  anchorY: 0.57, x: 0,    z: 2,  youth: 0.85, maxAspect: 1.7 },
  neckbrace:   { h: 15,  anchorY: 0.82, x: 0,    z: 8,  youth: 0.85, maxAspect: 3.0 },
};

const FIGURE_CM = 180;

export type OutfitConfig<T> = {
  /** Slot eines Produkts, null = gehoert nicht an die Figur */
  slotOf: (item: T) => OutfitSlot | null;
  /** Figur, zu der ein Produkt gehoert (z. B. Marke); eine Figur je Schluessel */
  figureOf: (item: T) => string;
  isYouth: (item: T) => boolean;
  /**
   * Bildhoehe / Produkthoehe des aktuell geladenen Bildes (freier Rand oben
   * und unten); 1 = Bild ist freigestellt. Damit stimmt die reale Hoehe.
   */
  contentScaleY?: (item: T) => number;
  /** Seitenverhaeltnis B/H des geladenen Bildes, 0 = unbekannt */
  imageAspect?: (item: T) => number;
  onLayout?: (nodes: LayoutNode<T>[]) => void;
};

export class OutfitLayouter<T> {
  /** Ueberschriften je Figur (Weltkoordinaten), wie die Poster-Header */
  public figureHeaders: Array<{ x: number; y: number; text: string; raw: string; maxWidth?: number; static?: boolean }> = [];

  constructor(private config: OutfitConfig<T>) {}

  /** Wie viele verschiedene Slots die Produkte belegen: ab 3 lohnt die Figur. */
  static distinctSlots<T>(items: T[], slotOf: (item: T) => OutfitSlot | null): number {
    return new Set(items.map(slotOf).filter(Boolean)).size;
  }

  /**
   * Getragene Auswahl je Slot (Produkt-id). Weitere Treffer desselben Slots
   * stehen als Alternativen neben der Figur; ein Klick tauscht sie ein
   * (owner 2026-10-21, media 131893: "Oberteil aendern, Outfit aendert sich").
   */
  private worn = new Map<OutfitSlot, string>();
  private alternativeIds = new Set<string>();
  /** Produkt-ids an der Figur nach dem letzten Layout (fuer das Outfit-Bild). */
  public wornProductIds: string[] = [];

  /** Knoten ist eine Alternative neben der Figur (nicht getragen). */
  isAlternative(nodeId: string): boolean {
    return this.alternativeIds.has(nodeId);
  }

  /** Produkt an die Figur nehmen; gibt false zurueck, wenn es nicht passt. */
  wear(item: T, id: string): boolean {
    const slot = this.config.slotOf(item);
    if (!slot) return false;
    this.worn.set(slot, id);
    // Jersey und Jacke teilen sich den Oberkoerper
    if (slot === 'jersey') this.worn.delete('jacket');
    if (slot === 'jacket') this.worn.delete('jersey');
    return true;
  }

  resetSelection(): void {
    this.worn.clear();
  }

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    const idOf = (n: LayoutNode<T>) => n.id.replace(/@@mirror$/, '');
    const bySlot = new Map<OutfitSlot, LayoutNode<T>[]>();
    const loose: LayoutNode<T>[] = [];
    for (const node of nodes) {
      if (node.id.endsWith('@@mirror')) continue;
      const slot = this.config.slotOf(node.data);
      if (!slot) { loose.push(node); continue; }
      if (!bySlot.has(slot)) bySlot.set(slot, []);
      bySlot.get(slot)!.push(node);
    }
    // Getragen: gewaehltes Produkt, sonst das erste je Slot; Jersey vor Jacke
    const wornNodes = new Map<OutfitSlot, LayoutNode<T>>();
    for (const [slot, list] of bySlot) {
      const pick = list.find(n => idOf(n) === this.worn.get(slot)) ?? list[0];
      wornNodes.set(slot, pick);
    }
    if (wornNodes.has('jersey') && wornNodes.has('jacket')) {
      if (this.worn.has('jacket')) wornNodes.delete('jersey'); else wornNodes.delete('jacket');
    }
    const wornIds = new Set([...wornNodes.values()].map(n => n.id));
    this.wornProductIds = [...wornNodes.values()].map(idOf);
    const alternatives = [...bySlot.values()].flat().filter(n => !wornIds.has(n.id));
    this.alternativeIds = new Set(alternatives.map(n => n.id));

    const headerH = 46;
    const pad = 40;
    const altCol = alternatives.length ? 0.2 : 0;
    const usableH = Math.max(200, view.height - pad * 2 - headerH);
    const byWidth = (view.width - pad * 2) / (0.55 + altCol * 2 * 1.1);
    const figH = Math.max(220, Math.min(usableH, byWidth));
    const pxPerCm = figH / FIGURE_CM;
    const axisX = view.width / 2;
    const top = Math.max(pad, (view.height - figH - headerH) / 2) + headerH;
    const groundY = top + figH;

    const first = [...wornNodes.values()][0];
    const youth = first ? this.config.isYouth(first.data) : false;
    this.figureHeaders = [{ x: axisX - figH * 0.27, y: top - 14, text: 'AUSRÜSTUNG', raw: '', maxWidth: figH * 0.55, static: true }];

    // Aufgeloeste Figur (owner 2026-10-21): Reihenfolge und reale
    // Groessenverhaeltnisse bleiben, aber die Teile ueberlappen nicht mehr.
    // Mitte: Kopf bis Fuss untereinander mit Luft; seitlich: Handschuhe,
    // Ellbogen, Brille.
    const gap = figH * 0.02;
    type Piece = { slot: OutfitSlot; node: LayoutNode<T>; h: number; w: number; single: boolean };
    const pieces: Piece[] = [];
    for (const [slot, node] of wornNodes) {
      const spec = OUTFIT_SLOTS[slot];
      const k = youth ? spec.youth : 1;
      const padY = Math.max(1, Math.min(2, this.config.contentScaleY?.(node.data) ?? 1));
      const h = spec.h * k * pxPerCm * padY;
      const aspect = this.config.imageAspect?.(node.data) || 0;
      const single = (slot === 'glove') || ((slot === 'boot' || slot === 'knee' || slot === 'elbow') && aspect > 0 && aspect < 0.8);
      const w = h * (single ? Math.min(spec.maxAspect, 0.9) : (aspect > 0 ? Math.min(spec.maxAspect, aspect) : spec.maxAspect));
      pieces.push({ slot, node, h, w, single });
    }
    const sideSlots: OutfitSlot[] = ['glove', 'elbow', 'goggle'];
    const column = pieces.filter(p => !sideSlots.includes(p.slot))
      .sort((a, b) => OUTFIT_SLOTS[b.slot].anchorY - OUTFIT_SLOTS[a.slot].anchorY);
    const side = pieces.filter(p => sideSlots.includes(p.slot));
    // Paare (Stiefel, Knie als Einzelbild) brauchen Breite fuer zwei
    const pairW = (p: Piece) => (p.single && (p.slot === 'boot' || p.slot === 'knee') ? p.w * 2 + gap * 0.5 : p.w);
    const totalH = column.reduce((sum, p) => sum + p.h, 0) + Math.max(0, column.length - 1) * gap;
    const fit = Math.min(1, figH / Math.max(1, totalH));
    let y = groundY - figH + Math.max(0, (figH - totalH * fit) / 2);
    const colPos = new Map<OutfitSlot, { cy: number; w: number; h: number }>();
    const place = (n: LayoutNode<T>, cx: number, cy: number, w: number, h: number, visible = true) => {
      n.posX.targetValue = cx - w / 2;
      n.posY.targetValue = cy - h / 2;
      n.width.targetValue = w;
      n.height.targetValue = h;
      n.scale.targetValue = 1;
      n.opacity.targetValue = visible ? 1 : 0;
    };
    for (const p of column) {
      const h = p.h * fit, w = p.w * fit;
      const cy = y + h / 2;
      const mirror = nodes.find(m => m.id === `${p.node.id}@@mirror`);
      if (p.single && (p.slot === 'boot' || p.slot === 'knee')) {
        place(p.node, axisX - (w / 2 + gap * 0.25), cy, w, h);
        if (mirror) place(mirror, axisX + (w / 2 + gap * 0.25), cy, w, h);
      } else {
        place(p.node, axisX, cy, w, h);
        if (mirror) place(mirror, axisX, cy, w, h, false);
      }
      colPos.set(p.slot, { cy, w: pairW(p) * fit, h });
      y += h + gap;
    }
    // Seitlich: auf Hoehe ihres Bezugsteils, ausserhalb der breitesten Mitte
    const torso = colPos.get('jersey') ?? colPos.get('jacket') ?? colPos.get('chest');
    const legs = colPos.get('pants');
    const head = colPos.get('helmet');
    const widest = Math.max(0, ...[...colPos.values()].map(c => c.w));
    for (const p of side) {
      const h = p.h * fit, w = p.w * fit;
      const mirror = nodes.find(m => m.id === `${p.node.id}@@mirror`);
      if (p.slot === 'goggle') {
        if (head) place(p.node, axisX + head.w / 2 + gap + w / 2, head.cy, w, h);
        else place(p.node, axisX, groundY - OUTFIT_SLOTS.goggle.anchorY * figH, w, h);
        continue;
      }
      // Handschuhe auf Hoehe des Hosenbunds, Ellbogen auf Hoehe des Oberteils
      const ref = p.slot === 'glove' ? (legs ? legs.cy - legs.h / 2 + h / 2 : torso ? torso.cy + torso.h / 2 : groundY - OUTFIT_SLOTS.glove.anchorY * figH)
        : (torso ? torso.cy : groundY - OUTFIT_SLOTS.elbow.anchorY * figH);
      const dx = Math.max(widest, torso?.w ?? 0) / 2 + gap + w / 2;
      place(p.node, axisX - dx, ref, w, h);
      if (mirror) place(mirror, axisX + dx, ref, w, h);
    }

    // Alternativen: Oberkoerper links, Beine/Fuesse/Haende rechts, auf Hoehe
    // ihres Slots; mehrere je Seite stapeln sich nach aussen
    const tile = figH * 0.16;
    const upper: OutfitSlot[] = ['helmet', 'goggle', 'jersey', 'jacket', 'chest', 'back_shirt', 'neckbrace'];
    const used = { left: [] as number[], right: [] as number[] };
    const sorted = [...alternatives].sort((a, b) => {
      const sa = OUTFIT_SLOTS[this.config.slotOf(a.data)!].anchorY;
      const sb = OUTFIT_SLOTS[this.config.slotOf(b.data)!].anchorY;
      return sb - sa;
    });
    for (const node of sorted) {
      const slot = this.config.slotOf(node.data)!;
      const side = upper.includes(slot) ? 'left' : 'right';
      const spec = OUTFIT_SLOTS[slot];
      let cy = groundY - spec.anchorY * figH;
      // nicht ueberlappen: unter die vorige Kachel derselben Seite ruecken
      const prev = used[side][used[side].length - 1];
      if (prev !== undefined && cy < prev + tile + 10) cy = prev + tile + 10;
      used[side].push(cy);
      const cx = side === 'left' ? axisX - figH * 0.45 : axisX + figH * 0.45;
      node.posX.targetValue = cx - tile / 2;
      node.posY.targetValue = cy - tile / 2;
      node.width.targetValue = tile;
      node.height.targetValue = tile;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 0.85;
      const mirror = nodes.find(m => m.id === `${node.id}@@mirror`);
      if (mirror) { mirror.posX.targetValue = cx - tile / 2; mirror.posY.targetValue = cy - tile / 2; mirror.width.targetValue = tile; mirror.height.targetValue = tile; mirror.opacity.targetValue = 0; }
    }
    if (alternatives.length) {
      this.figureHeaders.push({ x: axisX - figH * 0.45 - tile / 2, y: top - 14, text: 'ALTERNATIVEN', raw: '', maxWidth: tile * 2, static: true });
    }

    // Was an keine Figur gehoert (Kappen, Taschen ...), klein in einer Reihe darunter
    const looseH = Math.min(120, figH * 0.18);
    loose.forEach((node, i) => {
      node.posX.targetValue = pad + i * (looseH + 16);
      node.posY.targetValue = groundY + 24;
      node.width.targetValue = looseH;
      node.height.targetValue = looseH;
      node.scale.targetValue = 1;
      node.opacity.targetValue = 1;
    });

    this.config.onLayout?.(nodes);
  }

  /** Zeichenreihenfolge: hintere Ebenen zuerst. */
  zOf(item: T): number {
    const slot = this.config.slotOf(item);
    return slot ? OUTFIT_SLOTS[slot].z : 0;
  }
}

/**
 * Slot aus den Produktdaten: product_type, bei Protektoren body_part und Name
 * (Post #5544, Abschnitt Mapping).
 */
export function outfitSlotFrom(productType: string, bodyPart: string, name: string): OutfitSlot | null {
  const t = productType.toLowerCase();
  const n = name.toLowerCase();
  const b = bodyPart.toLowerCase();
  if (/visor|schirm|spare|ersatz|liner|cheek|shield/.test(n)) return null;
  if (t.includes('helm')) return 'helmet';
  if (t.includes('brille') || /goggle/.test(n)) return 'goggle';
  if (t.includes('jersey')) return 'jersey';
  if (t.includes('jacke') || t.includes('regen')) return 'jacket';
  if (t.includes('hose') || t.includes('short')) return 'pants';
  if (t.includes('handschuh')) return 'glove';
  if (t.includes('stiefel') || t.includes('schuh')) return 'boot';
  if (t.includes('protektor')) {
    if (/kidney|nieren/.test(n)) return 'kidney_belt';
    if (/neck|nacken/.test(n) || b.includes('kopf') || b.includes('hals')) return 'neckbrace';
    if (/knee|knie|shin/.test(n) || b.includes('bein') || b.includes('knie')) return 'knee';
    if (/elbow|ellbogen|ellenbogen/.test(n) || b.includes('arm')) return 'elbow';
    if (/shirt|back|rücken|ruecken/.test(n)) return 'back_shirt';
    return 'chest';
  }
  return null;
}
