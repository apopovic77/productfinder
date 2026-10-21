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
  public figureHeaders: Array<{ x: number; y: number; text: string; raw: string; maxWidth?: number }> = [];

  constructor(private config: OutfitConfig<T>) {}

  /** Wie viele verschiedene Slots die Produkte belegen: ab 3 lohnt die Figur. */
  static distinctSlots<T>(items: T[], slotOf: (item: T) => OutfitSlot | null): number {
    return new Set(items.map(slotOf).filter(Boolean)).size;
  }

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }): void {
    // Figuren: je Schluessel, darin je Slot die Produkte; mehrere Produkte im
    // selben Slot ergeben weitere Figuren desselben Schluessels.
    const figures: Array<{ key: string; slots: Map<OutfitSlot, LayoutNode<T>> }> = [];
    const loose: LayoutNode<T>[] = [];
    // Eigene Figur je Schluessel (Marke) nur, wenn jede fuer sich eine
    // Ausruestung ergibt (>= 3 Koerperstellen); sonst eine gemeinsame Figur
    const slotsByKey = new Map<string, Set<OutfitSlot>>();
    for (const node of nodes) {
      const slot = this.config.slotOf(node.data);
      if (!slot) continue;
      const k = this.config.figureOf(node.data);
      if (!slotsByKey.has(k)) slotsByKey.set(k, new Set());
      slotsByKey.get(k)!.add(slot);
    }
    const splitByKey = slotsByKey.size > 1 && [...slotsByKey.values()].every(s => s.size >= 3);
    const singleKey = slotsByKey.size === 1 ? [...slotsByKey.keys()][0] : 'Ausrüstung';
    for (const node of nodes) {
      const slot = this.config.slotOf(node.data);
      if (!slot) { loose.push(node); continue; }
      // Spiegelkopien stehen fuer die andere Seite, nicht als eigenes Teil
      if (node.id.endsWith('@@mirror')) continue;
      const key = splitByKey ? this.config.figureOf(node.data) : singleKey;
      let fig = figures.find(f => f.key === key && !f.slots.has(slot));
      if (!fig) { fig = { key, slots: new Map() }; figures.push(fig); }
      fig.slots.set(slot, node);
    }

    const count = Math.max(1, figures.length);
    const headerH = 46;
    const pad = 40;
    // Figurhoehe: so gross wie die Seite erlaubt, Breite einer Figur ~ 0,5 x Hoehe
    const usableH = Math.max(200, view.height - pad * 2 - headerH);
    const byWidth = (view.width - pad * 2) / count / 0.55;
    const figH = Math.max(220, Math.min(usableH, byWidth));
    const pxPerCm = figH / FIGURE_CM;
    const figW = figH * 0.55;
    const totalW = count * figW;
    const startX = Math.max(pad, (view.width - totalW) / 2);
    const top = Math.max(pad, (view.height - figH - headerH) / 2) + headerH;
    const groundY = top + figH;

    this.figureHeaders = [];
    figures.forEach((fig, i) => {
      const axisX = startX + figW * (i + 0.5);
      const first = fig.slots.values().next().value as LayoutNode<T> | undefined;
      const youth = first ? this.config.isYouth(first.data) : false;
      this.figureHeaders.push({ x: axisX - figW / 2 + 12, y: top - 14, text: fig.key.toUpperCase(), raw: fig.key, maxWidth: figW });
      for (const [slot, node] of fig.slots) {
        const spec = OUTFIT_SLOTS[slot];
        const k = youth ? spec.youth : 1;
        // reale Hoehe des Produkts; ein Bild mit Rand bekommt die Box um den
        // Rand groesser, damit das Produkt selbst die richtige Hoehe hat
        const pad = Math.max(1, Math.min(2, this.config.contentScaleY?.(node.data) ?? 1));
        const h = spec.h * k * pxPerCm * pad;
        const aspect = this.config.imageAspect?.(node.data) || 0;
        // Einzelteil oder Paar: Stiefel/Knie von vorn als Paar breit (B/H > 0,8)
        const single = (slot === 'glove') || ((slot === 'boot' || slot === 'knee' || slot === 'elbow') && aspect > 0 && aspect < 0.8);
        const sideX = slot === 'glove' ? spec.x : slot === 'boot' ? 0.06 : slot === 'knee' ? 0.06 : spec.x;
        const w = h * (single ? Math.min(spec.maxAspect, 0.9) : spec.maxAspect);
        const cy = groundY - spec.anchorY * figH;
        const place = (n: LayoutNode<T>, cx: number, visible: boolean) => {
          n.posX.targetValue = cx - w / 2;
          n.posY.targetValue = cy - h / 2;
          n.width.targetValue = w;
          n.height.targetValue = h;
          n.scale.targetValue = 1;
          n.opacity.targetValue = visible ? 1 : 0;
        };
        const mirror = nodes.find(m => m.id === `${node.id}@@mirror`);
        if (single && sideX) {
          // Original rechts (Betrachter links ist die rechte Koerperseite),
          // gespiegelte Kopie auf der anderen Seite
          place(node, axisX - sideX * figH, true);
          if (mirror) place(mirror, axisX + sideX * figH, true);
        } else {
          place(node, axisX + (single ? spec.x : 0) * figH, true);
          if (mirror) place(mirror, axisX, false);
        }
      }
    });

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
