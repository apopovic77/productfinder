/**
 * band — Elemente als Band in Reihen hintereinander, verschiebbar über `offset`.
 *
 * Kandidat für die Wave-Engine (Layout 'band'). Generisch: Element i liegt in Reihe
 * i % rows auf Platz floor(i / rows); x = (Platz − offset) × spacing, jede Reihe um
 * `rowDepth` weiter hinten und um `rowShift` Plätze versetzt. Mit `wrap` laufen die
 * Plätze endlos um (Karussell). Die Perspektive macht die Kamera: vorn groß, hinten klein.
 */

import * as THREE from 'three';
import type { LayoutResult } from '@arkturian/wave-engine';

export interface BandOptions {
  /** Abstand zweier Plätze (Welteinheiten). Default 1.5. */
  spacing?: number;
  /** Anzahl Reihen. Default 1. */
  rows?: number;
  /** Abstand der Reihen in die Tiefe (−z). Default 3. */
  rowDepth?: number;
  /** Versatz je Reihe in Plätzen. Default 0.5. */
  rowShift?: number;
  /** Höhe je Reihe (+y). Default 0. */
  rowLift?: number;
  /** Verschiebung in Plätzen (Scrollposition). Default 0. */
  offset?: number;
  /** Endlos umlaufen. Default true. */
  wrap?: boolean;
  /** Reihen hinten schneller/langsamer: Faktor auf offset je Reihe (Parallaxe). Default 1. */
  rowSpeed?: number;
  /** Richtung des Bands in Grad um y: 0 = quer, >0 = rechts nach hinten (Flucht in die Tiefe). Default 0. */
  axisYaw?: number;
  /** Drehung der Elemente um y in Grad (z. B. Schuhe leicht zur Kamera). Default 0. */
  yaw?: number;
  /** Mitte des Bands. Default (0, 0, 0). */
  origin?: { x: number; y: number; z: number };
  width?: number;
  height?: number;
}

/** Platz-Koordinate (in Plätzen, 0 = Mitte) von Element i; Grundlage für „vorderstes Element“. */
export function bandSlot(index: number, count: number, opts: BandOptions = {}): { row: number; slot: number } {
  const rows = Math.max(1, opts.rows ?? 1);
  const row = index % rows;
  const perRow = Math.ceil(count / rows);
  let slot = Math.floor(index / rows) - (opts.offset ?? 0) * Math.pow(opts.rowSpeed ?? 1, row) + row * (opts.rowShift ?? 0.5);
  if (opts.wrap ?? true) slot = ((((slot + perRow / 2) % perRow) + perRow) % perRow) - perRow / 2;
  return { row, slot };
}

export function computeBand(count: number, opts: BandOptions = {}): LayoutResult[] {
  const spacing = opts.spacing ?? 1.5;
  const rowDepth = opts.rowDepth ?? 3;
  const o = opts.origin ?? { x: 0, y: 0, z: 0 };
  const width = opts.width ?? 1;
  const height = opts.height ?? 1;
  const yawA = ((opts.axisYaw ?? 0) * Math.PI) / 180;
  const axis = new THREE.Vector3(Math.cos(yawA), 0, -Math.sin(yawA));
  const back = new THREE.Vector3(Math.sin(yawA), 0, Math.cos(yawA)).multiplyScalar(-1);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((opts.yaw ?? 0) * Math.PI) / 180);
  const out: LayoutResult[] = [];
  for (let i = 0; i < count; i++) {
    const { row, slot } = bandSlot(i, count, opts);
    out.push({
      target: {
        position: new THREE.Vector3(o.x, o.y + row * (opts.rowLift ?? 0), o.z)
          .addScaledVector(axis, slot * spacing).addScaledVector(back, row * rowDepth),
        quaternion: q.clone(), scale: new THREE.Vector3(1, 1, 1), size: new THREE.Vector2(width, height),
        trapezoid: new THREE.Vector2(),
        morph: { sizeX: width, sizeY: height, depth: 0.05, trapezoidX: 0, trapezoidY: 0, trapezoidZ: 0 },
      },
      current: null as unknown as LayoutResult['current'],
    });
  }
  return out;
}
