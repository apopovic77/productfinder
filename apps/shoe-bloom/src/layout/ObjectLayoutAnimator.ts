/**
 * ObjectLayoutAnimator — bewegt beliebige Object3D zwischen zwei LayoutResult[].
 *
 * Kandidat für die Wave-Engine (Absprache Post #5636): ohne React und ohne gsap, der
 * Aufrufer ruft `update(seconds)` je Frame. Die Shader-Morphs der Engine wirken nur auf
 * Partikel; das hier gilt für Meshes, Sprites, Splats oder Gruppen.
 *
 * Je Objekt: Position (lerp), Drehung (slerp), Größe (Objektmaßstab = target.scale ×
 * target.size, wenn `applySize`), dazu ein freier Wert (z. B. Deckkraft) über `values`.
 * Staffelung: Objekt i startet `stagger × i` Sekunden später (Reihenfolge über `order`).
 */

import * as THREE from 'three';
import type { LayoutResult } from '@arkturian/wave-engine';

export type Easing = (t: number) => number;

export const EASINGS = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outBack: (t: number) => {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} satisfies Record<string, Easing>;

export interface AnimateOptions {
  /** Sekunden je Objekt. Default 0.8. */
  duration?: number;
  /** Versatz zwischen zwei Objekten in Sekunden. Default 0.05. */
  stagger?: number;
  easing?: Easing;
  /** Startreihenfolge (Indizes); Default 0, 1, 2 … */
  order?: number[];
  /** Zielwerte des freien Kanals je Objekt (z. B. Deckkraft). */
  values?: number[];
}

interface Track {
  fromPos: THREE.Vector3; toPos: THREE.Vector3;
  fromQuat: THREE.Quaternion; toQuat: THREE.Quaternion;
  fromScale: THREE.Vector3; toScale: THREE.Vector3;
  fromValue: number; toValue: number;
  delay: number;
}

export class ObjectLayoutAnimator {
  private tracks: Track[] = [];
  private elapsed = 0;
  private duration = 0.8;
  private easing: Easing = EASINGS.inOutCubic;
  readonly values: number[] = [];

  constructor(private objects: THREE.Object3D[], private applySize = true,
              private onValue?: (index: number, value: number) => void) {}

  setObjects(objects: THREE.Object3D[]): void {
    this.objects = objects;
  }

  private scaleOf(r: LayoutResult): THREE.Vector3 {
    const s = r.target.scale.clone();
    if (this.applySize) s.multiply(new THREE.Vector3(r.target.size.x, r.target.size.y, 1));
    return s;
  }

  /** Sofort an die Ziele setzen (ohne Animation). */
  jump(results: LayoutResult[], values?: number[]): void {
    this.to(results, { duration: 0, stagger: 0, values });
    this.update(0);
  }

  to(results: LayoutResult[], opts: AnimateOptions = {}): void {
    this.duration = opts.duration ?? 0.8;
    this.easing = opts.easing ?? EASINGS.inOutCubic;
    const stagger = opts.stagger ?? 0.05;
    const order = opts.order ?? this.objects.map((_, i) => i);
    const rank = new Map(order.map((idx, k) => [idx, k]));
    this.tracks = this.objects.map((o, i) => {
      const r = results[i] ?? results[results.length - 1];
      return {
        fromPos: o.position.clone(), toPos: r.target.position.clone(),
        fromQuat: o.quaternion.clone(), toQuat: r.target.quaternion.clone(),
        fromScale: o.scale.clone(), toScale: this.scaleOf(r),
        fromValue: this.values[i] ?? 0, toValue: opts.values?.[i] ?? this.values[i] ?? 1,
        delay: (rank.get(i) ?? i) * stagger,
      };
    });
    this.elapsed = 0;
  }

  /** true, solange noch etwas läuft. */
  update(dt: number): boolean {
    this.elapsed += dt;
    let running = false;
    this.tracks.forEach((t, i) => {
      const o = this.objects[i];
      if (!o) return;
      const raw = this.duration <= 0 ? 1 : Math.min(Math.max((this.elapsed - t.delay) / this.duration, 0), 1);
      if (raw < 1) running = true;
      const k = this.easing(raw);
      o.position.lerpVectors(t.fromPos, t.toPos, k);
      o.quaternion.slerpQuaternions(t.fromQuat, t.toQuat, Math.min(Math.max(k, 0), 1));
      o.scale.lerpVectors(t.fromScale, t.toScale, k);
      const v = t.fromValue + (t.toValue - t.fromValue) * Math.min(Math.max(k, 0), 1);
      this.values[i] = v;
      this.onValue?.(i, v);
    });
    return running;
  }
}
