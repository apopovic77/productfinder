/**
 * Darstellung über die Wave-Engine: ein instanziertes Morph-Partikel je Produktkachel
 * (createMorphGeometry + MorphShader), Bilder aus einem Atlas (aUVOffset je Instanz),
 * Layouts aus der Engine ('plane' als Fläche, 'radialFan' als Blüte), Wechsel über morphTo
 * mit Storyboard, Feldwelle im Shader (uFieldAnimStrength) und Bewegungsunschärfe im
 * Shader (uBlurVelocity/uBlurStrength). Die Kamera fährt in der Fläche auf einer festen
 * Achse (x), gewischt mit Trägheit.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyShaderToMaterial, computeLayout, computeRadialFan, createMorphGeometry, createMorphMesh, createUniforms, focusLayout,
  morphTo,
  type LayoutResult,
} from '@arkturian/wave-engine';
import { ScrollInertia } from '../layout/ScrollInertia';
import { buildImageAtlas, type ImageAtlas } from './atlas';

/** wall = Fläche V1 (frontal, Wand); floor = Fläche Perspektive (am Boden, Kamera schräg von oben). */
export type EngineView = 'bloom' | 'wall' | 'floor';

interface Props {
  /** Bild je Produkt (Index = Produkt). */
  images: string[];
  /** Produkte, deren Bild gespiegelt in den Atlas kommt (nach Bilddaten, nicht geraten). */
  mirrored?: Set<number>;
  /** Produkt je Instanz der Fläche; die ersten images.length Instanzen sind die Produkte selbst. */
  instanceProduct: number[];
  view: EngineView;
  /** Produkte, die in der Blüte als Blätter erscheinen (Reihenfolge = Blätter). */
  bloomProducts: number[];
  /** Instanz im Fokus oder -1. */
  focus: number;
  onPick: (instance: number) => void;
  /** Instanz in der Bildmitte der Fläche, wenn sie wechselt. */
  onCurrent?: (instance: number) => void;
  onReady?: () => void;
}

const SHUTTER = 1 / 24; // Belichtungszeit der Unschärfe in Sekunden
const BLOOM_TILE = 2.7;
/** Halbe Kantenlänge der Fläche je nach Anzahl: Kachelgröße bleibt etwa gleich (196 Kacheln ≈ 9). */
const wallRadius = (count: number) => 0.65 * Math.sqrt(count);
const FLOOR_SPACING = 2.6; // Abstand der Rasterpunkte (Kachel = 1)
const FLOOR_ROWS = 3; // Reihen nach hinten, die Spalten ergeben sich aus der Anzahl

function hidden(): LayoutResult {
  return {
    target: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(0, 0, 0),
      size: new THREE.Vector2(1, 1), trapezoid: new THREE.Vector2(),
      morph: { sizeX: 1, sizeY: 1, depth: 0.01, trapezoidX: 0, trapezoidY: 0, trapezoidZ: 0 } },
    current: null as unknown as LayoutResult['current'],
  };
}

function flatTile(r: LayoutResult, size: number): LayoutResult {
  r.target.size.set(size, size);
  r.target.morph = { sizeX: size, sizeY: size, depth: 0.01, trapezoidX: 0, trapezoidY: 0, trapezoidZ: 0 };
  return r;
}

export function EngineScene({ images, mirrored, instanceProduct, view, bloomProducts, focus, onPick, onCurrent, onReady }: Props) {
  const { camera, gl, size: canvasSize } = useThree();
  const count = instanceProduct.length;
  const [atlas, setAtlas] = useState<ImageAtlas | null>(null);
  const uniforms = useMemo(() => createUniforms(), []);
  const mesh = useMemo(() => {
    // Mesh-Variante der Engine: InstancedBufferGeometry ohne instanceMatrix (4 Attribut-Slots frei), die
    // Positionen kommen aus den Engine-Attributen; ausgeblendete Instanzen haben Maßstab 0.
    const geometry = createMorphGeometry({ maxInstances: count, instancing: 'geometry' }) as THREE.InstancedBufferGeometry;
    const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, depthWrite: true });
    // Unschärfe-Pfad als Compile-Option; eigener Cache-Schlüssel, damit three das Programm nicht mit einem
    // Morph-Material ohne Unschärfe teilt (gleiche onBeforeCompile-Quelle)
    material.onBeforeCompile = (shader) => applyShaderToMaterial(shader, uniforms, { motionBlur: true });
    material.customProgramCacheKey = () => 'wave-morph-blur';
    return createMorphMesh(geometry, material);
  }, [count, uniforms]);
  const inertia = useMemo(() => new ScrollInertia({ friction: 1.6, snap: 0 }), []);
  const current = useRef<LayoutResult[]>([]);
  const currentInstance = useRef(-1);
  const camTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const panAxis = useRef(0);

  // Atlas aus den Produktbildern, UV-Kachel je Instanz
  useEffect(() => {
    let alive = true;
    buildImageAtlas(images, { mirror: mirrored }).then((a) => {
      if (!alive) return;
      const uv = mesh.geometry.getAttribute('aUVOffset') as THREE.InstancedBufferAttribute;
      instanceProduct.forEach((p, i) => uv.setXYZW(i, ...a.uv(p)));
      uv.needsUpdate = true;
      uniforms.uAtlasTexture.value = a.texture;
      uniforms.uUseAtlas.value = 1;
      uniforms.uAtlasFaceMode.value = 0; // Atlas auf allen Seiten: die schmalen Kanten treffen transparente Ränder und fallen weg
      uniforms.uWaveSpeed.value = 1.1;
      uniforms.uWaveAmplitude.value = 0.18;
      uniforms.uBreathingStrength.value = 0; // Atmen skaliert um den Ursprung, für eine Fläche ungeeignet
      setAtlas(a);
      onReady?.();
    });
    return () => { alive = false; };
  }, [images, mirrored, instanceProduct, mesh, uniforms, onReady]);

  // Fläche: integriertes Layout 'plane', quadratische Kacheln
  const wall = useMemo(() => {
    const raw = computeLayout('plane', { count, options: { radius: wallRadius(count), size: 1 } });
    const xs = [...new Set(raw.map((r) => r.target.position.x.toFixed(3)))].map(Number).sort((a, b) => a - b);
    const step = xs.length > 1 ? xs[1] - xs[0] : 1;
    return raw.map((r) => flatTile(r, step * 0.94));
  }, [count]);
  // Fläche Perspektive: Flächen-Layouter der Engine ('plane_grid_a' = Layouters.planeGrid aus
  // @arkturian/typescript-utils, Port der ModernLayouters aus 3dPresenter2), alles über Optionen je Aufruf:
  // flach am Boden (planeTilt 0), World Up (aufrecht), aligned, feste Abstände, Reihen nach hinten.
  // Am Boden zeigen die Kacheln mit World Up zur Kamera (+z), flip180 ist hier nicht nötig.
  const floor = useMemo(() => computeLayout('plane_grid_a', {
    count,
    options: { radius: 3, size: 1, planeTilt: 0, upMode: 'world', orientation: 'aligned',
      spacingMode: 'margin', spacing: FLOOR_SPACING, gridRows: FLOOR_ROWS },
  }), [count]);
  const floorFront = useMemo(() => Math.max(...floor.map((r) => r.target.position.z)), [floor]);
  const floorBounds = useMemo(() => {
    const xs = floor.map((r) => r.target.position.x);
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }, [floor]);
  const wallBounds = useMemo(() => {
    const xs = wall.map((r) => r.target.position.x);
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }, [wall]);

  const bloom = useMemo(() => {
    const n = bloomProducts.length;
    const full = n >= 7;
    const spread = full ? 360 : Math.min(48 * Math.max(n - 1, 1), 200);
    const fan = computeRadialFan(n, {
      radius: BLOOM_TILE * 0.42, startAngle: full ? 90 : 90 + spread / 2, spread, direction: 'cw', outwardAxis: 'y',
      width: BLOOM_TILE, height: BLOOM_TILE, depthStep: 0.02, pivot: { x: 0, y: full ? 0 : -1.1, z: 0 },
    });
    const out: LayoutResult[] = Array.from({ length: count }, hidden);
    bloomProducts.forEach((p, j) => { out[p] = flatTile(fan[j], BLOOM_TILE); });
    return out;
  }, [bloomProducts, count]);

  // Morph bei Wechsel von Ansicht, Blättern oder Fokus
  const lastView = useRef<EngineView | null>(null);
  const lastBloom = useRef<number[] | null>(null);
  useEffect(() => {
    if (!atlas) return;
    const base = view === 'wall' ? wall : view === 'floor' ? floor : bloom;
    const panX = camTarget.current.x;
    const focusPos = view === 'wall' ? { x: panX - 0.8, y: 0.1, z: 3.2 }
      : view === 'floor' ? { x: panAxis.current, y: 0.6, z: floorFront + 3 }
      : { x: 0, y: 0.15, z: 1.6 };
    const { results } = focusLayout(base, focus, {
      position: focusPos, scale: view === 'wall' ? 2.2 : view === 'floor' ? 1.5 : 1.35, recedeScale: view === 'bloom' ? 0.8 : 1,
      recedeDepth: view === 'bloom' ? -1.4 : 0, dim: 1,
    });
    const viewChanged = lastView.current !== view || lastBloom.current !== bloomProducts;
    morphTo(mesh, uniforms, results, viewChanged
      ? { duration: lastView.current === null ? 1.2 : 1.8, story: 'cinematic', enter: 'grow', exit: 'shrink' }
      : { duration: 0.7, story: 'direct' });
    current.current = results;
    lastView.current = view;
    lastBloom.current = bloomProducts;
  }, [atlas, view, wall, floor, floorFront, bloom, focus, mesh, uniforms, bloomProducts]);

  // Wischen: nur in der Fläche und ohne Fokus, auf der x-Achse
  useEffect(() => {
    const el = gl.domElement;
    let down = false, lastX = 0, moved = 0, startX = 0, startY = 0;
    const panning = view !== 'bloom';
    const worldPerPx = () => {
      const dist = view === 'floor' ? 6 : 10.5;
      const h = 2 * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2)) * dist;
      return h / el.clientHeight;
    };
    const onDown = (e: PointerEvent) => {
      down = true; lastX = startX = e.clientX; startY = e.clientY; moved = 0;
      if (panning && focus < 0) inertia.grab();
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved = Math.max(moved, Math.hypot(e.clientX - startX, e.clientY - startY));
      if (panning && focus < 0) inertia.drag(-dx * worldPerPx());
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      if (panning && focus < 0) inertia.release();
      if (moved < 8) pick(e.clientX, e.clientY);
    };
    const pick = (cx: number, cy: number) => {
      const rect = el.getBoundingClientRect();
      const v = new THREE.Vector3();
      let best = -1, bestD = Infinity;
      current.current.forEach((r, i) => {
        if (r.target.scale.x === 0) return;
        v.copy(r.target.position).applyMatrix4(mesh.matrixWorld).project(camera);
        if (v.z > 1) return;
        const sx = (v.x + 1) / 2 * rect.width, sy = (1 - v.y) / 2 * rect.height;
        // halbe Kachel in Pixeln als Trefferradius, vordere zuerst
        const edge = v.clone().copy(r.target.position).add(new THREE.Vector3(r.target.size.x * r.target.scale.x * 0.55, 0, 0))
          .applyMatrix4(mesh.matrixWorld).project(camera);
        const radius = Math.abs((edge.x - v.x) / 2 * rect.width);
        const d = Math.hypot(sx - (cx - rect.left), sy - (cy - rect.top));
        if (d < radius && d - r.target.position.z * 40 < bestD) { bestD = d - r.target.position.z * 40; best = i; }
      });
      onPick(best);
    };
    const onWheel = (e: WheelEvent) => {
      if (!panning || focus >= 0) return;
      e.preventDefault();
      inertia.nudge((e.deltaX || e.deltaY) * 0.01);
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, inertia, view, focus, mesh, onPick]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    uniforms.uTime.value = state.clock.elapsedTime;
    const narrow = canvasSize.width < canvasSize.height;
    if (view !== 'bloom') {
      inertia.update(dt);
      // an den Rändern der Fläche zurückfedern
      const bounds = view === 'floor' ? floorBounds : wallBounds;
      const lo = bounds.min + 2, hi = bounds.max - 2;
      if (!inertia.isDragging && (inertia.value < lo || inertia.value > hi)) {
        const bound = inertia.value < lo ? lo : hi;
        inertia.velocity += ((bound - inertia.value) * 30 - inertia.velocity * 8) * dt;
      }
      if (view === 'wall') {
        camTarget.current.set(inertia.value + (narrow ? 1.5 : 3.4), 0.6, narrow ? 13 : 10.5);
        lookTarget.current.set(inertia.value, 0, 0);
      } else {
        // leicht schräg von oben auf den Boden, Blick in die Reihen hinein
        // flache Fläche am Boden, Kamera leicht schräg von oben, Blick in die Reihen
        camTarget.current.set(inertia.value, narrow ? 2.2 : 1.6, floorFront + (narrow ? 8 : 6));
        lookTarget.current.set(inertia.value, 0, floorFront - 4);
      }
      panAxis.current = inertia.value;
    } else {
      inertia.velocity = 0;
      camTarget.current.set(0, 0, narrow ? 13 : 9.5);
      lookTarget.current.set(0, 0, 0);
    }
    camera.position.lerp(camTarget.current, Math.min(dt * 4, 1));
    const look = new THREE.Vector3().copy(lookTarget.current);
    camera.lookAt(look);
    // Unschärfe aus der Kamerafahrt: die Kacheln bewegen sich relativ zur Kamera entgegen
    const vx = view !== 'bloom' ? inertia.velocity : 0;
    uniforms.uBlurVelocity.value.set(-vx, 0, 0);
    uniforms.uBlurStrength.value = Math.abs(vx) > 0.05 ? SHUTTER * 2.5 : 0;
    // Feldwelle: in der Fläche voll, in der Blüte leise, im Fokus aus
    const field = focus >= 0 ? 0 : view === 'bloom' ? 0.25 : 1;
    uniforms.uFieldAnimStrength.value += (field - uniforms.uFieldAnimStrength.value) * Math.min(dt * 2, 1);
    // Wand: Welle in die Tiefe; Boden: die Schuhe heben und senken sich als Welle quer über die Reihen
    if (view === 'floor') uniforms.uWaveDir.value.set(0.45, 0.89, 0);
    else uniforms.uWaveDir.value.set(0.55, 0.1, 0.83);
    if (view !== 'bloom' && onCurrent) {
      let best = -1, bestD = Infinity;
      (view === 'floor' ? floor : wall).forEach((r, i) => {
        const d = view === 'floor'
          ? Math.abs(r.target.position.x - inertia.value) + Math.abs(r.target.position.z - floorFront) * 10
          : Math.hypot(r.target.position.x - inertia.value, r.target.position.y);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== currentInstance.current) { currentInstance.current = best; onCurrent(best); }
    }
  });

  return <primitive object={mesh} />;
}
