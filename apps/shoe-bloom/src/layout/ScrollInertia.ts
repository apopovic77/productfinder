/**
 * ScrollInertia — eindimensionales Wischen mit Trägheit und Einrasten.
 *
 * Kandidat für die Wave-Engine (ohne React): `grab()`, `drag(delta)`, `release()` aus den
 * Zeiger-Ereignissen, `update(dt)` je Frame. Nach dem Loslassen gleitet der Wert mit der
 * letzten Geschwindigkeit weiter, wird über `friction` gebremst und rastet zuletzt auf
 * einem Vielfachen von `snap` ein (Feder). `velocity` taugt für Bewegungsunschärfe.
 */
export interface ScrollInertiaOptions {
  /** Bremsung je Sekunde (exponentiell). Default 2.5. */
  friction?: number;
  /** Raster zum Einrasten (0 = aus). Default 1. */
  snap?: number;
  /** Federstärke beim Einrasten. Default 40. */
  spring?: number;
  /** Unter dieser Geschwindigkeit rastet es ein. Default 1.5. */
  snapBelow?: number;
}

export class ScrollInertia {
  value = 0;
  velocity = 0;
  private dragging = false;
  private samples: { t: number; v: number }[] = [];

  constructor(private opts: ScrollInertiaOptions = {}) {}

  grab(now = performance.now()): void {
    this.dragging = true;
    this.velocity = 0;
    this.samples = [{ t: now, v: this.value }];
  }

  drag(delta: number, now = performance.now()): void {
    this.value += delta;
    this.samples.push({ t: now, v: this.value });
    while (this.samples.length > 2 && now - this.samples[0].t > 100) this.samples.shift();
  }

  release(now = performance.now()): void {
    this.dragging = false;
    const first = this.samples[0];
    const dt = first ? (now - first.t) / 1000 : 0;
    this.velocity = first && dt > 0.005 ? (this.value - first.v) / dt : 0;
  }

  /** Schubs ohne Ziehen (Pfeiltaste, Mausrad). */
  nudge(velocity: number): void {
    this.velocity += velocity;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  update(dt: number): void {
    if (this.dragging || dt <= 0) return;
    const friction = this.opts.friction ?? 2.5;
    const snap = this.opts.snap ?? 1;
    this.value += this.velocity * dt;
    this.velocity *= Math.exp(-friction * dt);
    if (snap > 0 && Math.abs(this.velocity) < (this.opts.snapBelow ?? 1.5)) {
      const target = Math.round(this.value / snap) * snap;
      const k = this.opts.spring ?? 40;
      // kritisch gedämpfte Feder zum Raster
      this.velocity += ((target - this.value) * k - this.velocity * 2 * Math.sqrt(k)) * dt;
    }
  }
}
