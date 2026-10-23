/**
 * focusLayout — Layout-Modifikator: ein Element nach vorn, die übrigen zurück.
 *
 * Kandidat für die Wave-Engine (neben die Layouts, Absprache Post #5636). Generisch,
 * ohne Produktbezug: nimmt ein beliebiges LayoutResult[] und liefert ein neues, dazu
 * je Element eine Betonung (1 = im Fokus, `dim` = zurückgenommen) für Deckkraft o. Ä.
 */

import * as THREE from 'three';
import type { LayoutResult } from '@arkturian/wave-engine';

export interface FocusOptions {
  /** Ort des fokussierten Elements. Default (0, 0, 1). */
  position?: { x: number; y: number; z: number };
  /** Ausrichtung des fokussierten Elements. Default: keine Drehung. */
  quaternion?: THREE.Quaternion;
  /** Vergrößerung des fokussierten Elements. Default 1.6. */
  scale?: number;
  /** Verkleinerung der übrigen. Default 0.8. */
  recedeScale?: number;
  /** z-Versatz der übrigen (nach hinten). Default -0.8. */
  recedeDepth?: number;
  /** Betonung der übrigen. Default 0.3. */
  dim?: number;
}

export interface FocusResult {
  results: LayoutResult[];
  emphasis: number[];
}

function clone(r: LayoutResult): LayoutResult {
  const t = r.target;
  return {
    target: {
      position: t.position.clone(), quaternion: t.quaternion.clone(), scale: t.scale.clone(),
      size: t.size.clone(), trapezoid: t.trapezoid.clone(), morph: t.morph ? { ...t.morph } : undefined,
    },
    current: r.current,
  };
}

/** `index` außerhalb des Bereichs (z. B. -1): nichts im Fokus, alle unverändert. */
export function focusLayout(results: LayoutResult[], index: number, opts: FocusOptions = {}): FocusResult {
  const out = results.map(clone);
  if (index < 0 || index >= out.length) return { results: out, emphasis: out.map(() => 1) };
  const p = opts.position ?? { x: 0, y: 0, z: 1 };
  const recedeScale = opts.recedeScale ?? 0.8;
  const recedeDepth = opts.recedeDepth ?? -0.8;
  out.forEach((r, i) => {
    if (i === index) {
      r.target.position.set(p.x, p.y, p.z);
      r.target.quaternion.copy(opts.quaternion ?? new THREE.Quaternion());
      r.target.scale.multiplyScalar(opts.scale ?? 1.6);
    } else {
      r.target.position.z += recedeDepth;
      r.target.scale.multiplyScalar(recedeScale);
    }
  });
  return { results: out, emphasis: out.map((_, i) => (i === index ? 1 : opts.dim ?? 0.3)) };
}
