/**
 * UI sound effects, fully synthesized via WebAudio — no assets, no network.
 * Quest-style feedback (owner 2026-08-23): a soft whoosh when the stage
 * slides to the next product, a low pop when the card opens.
 *
 * The AudioContext is created lazily inside the first play call, which is
 * always downstream of a user gesture (click/tap), so autoplay policies are
 * satisfied. Every effect degrades to silence on any error.
 */

const STORAGE_KEY = 'pf-sound-enabled';

class SoundService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _enabled: boolean;
  private realtimeOwned = false;
  private lastWhoosh = 0;

  constructor() {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    this._enabled = stored !== 'off';
  }

  get enabled(): boolean { return this._enabled; }

  setEnabled(on: boolean): void {
    this._enabled = on;
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  }

  /**
   * Suspend productfinder UI effects while the Realtime voice channel owns
   * audio. This is deliberately independent from the persisted user setting:
   * ending a voice session must restore the user's previous preference.
   */
  setRealtimeOwned(active: boolean): void {
    this.realtimeOwned = active;
    if (active && this.ctx?.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    }
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22; // quiet by design — feedback, not soundtrack
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Sliding to a neighbouring product: a short filtered-noise sweep.
   * `dir` pans it slightly so left/right feel different. Rate-limited —
   * a fast swipe across many products must not machine-gun.
   */
  whoosh(dir: 1 | -1 = 1): void {
    if (!this._enabled || this.realtimeOwned) return;
    const now = performance.now();
    if (now - this.lastWhoosh < 120) return;
    this.lastWhoosh = now;

    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    try {
      const dur = 0.28;
      const t0 = ctx.currentTime;

      // White-noise buffer, band-passed and swept downward = air movement.
      const frames = Math.ceil(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.1;
      filter.frequency.setValueAtTime(1400, t0);
      filter.frequency.exponentialRampToValueAtTime(320, t0 + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.8, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) pan.pan.value = 0.35 * dir;

      src.connect(filter);
      filter.connect(gain);
      if (pan) { gain.connect(pan); pan.connect(this.master); }
      else gain.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur);
    } catch { /* silence */ }
  }

  /** Card/dialog opens: one soft, low sine pop. */
  pop(): void {
    if (!this._enabled || this.realtimeOwned) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, t0);
      osc.frequency.exponentialRampToValueAtTime(190, t0 + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    } catch { /* silence */ }
  }

  /** Small confirmation tick (add to cart, chip select). */
  tick(): void {
    if (!this._enabled || this.realtimeOwned) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1150, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    } catch { /* silence */ }
  }
}

export const soundService = new SoundService();
