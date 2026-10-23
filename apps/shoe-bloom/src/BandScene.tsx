/**
 * Band: Produkte in Reihen hintereinander (Layout 'band'), wischen mit Trägheit
 * (ScrollInertia), Bewegungsunschärfe über Nachzieh-Kopien, Fokus wie in der Blüte.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { bandSlot, computeBand, type BandOptions } from './layout/band';
import { focusLayout } from './layout/focus';
import { ScrollInertia } from './layout/ScrollInertia';
import type { Petal } from './BloomScene';

interface Props {
  items: Petal[];
  focus: number;
  onPick: (index: number) => void;
  /** Index des vordersten, mittigen Elements, wenn er wechselt. */
  onCurrent: (index: number) => void;
}

const GHOSTS = [0.05, 0.1, 0.16];
const ROWS = 3;

export function BandScene({ items, focus, onPick, onCurrent }: Props) {
  const textures = useTexture(items.map((p) => p.image));
  const { camera, gl, viewport } = useThree();
  const meshes = useRef<THREE.Mesh[]>([]);
  const ghosts = useRef<THREE.Mesh[][]>([]);
  const inertia = useMemo(() => new ScrollInertia({ friction: 1.8, snap: 1 }), []);
  const focusMix = useRef(0);
  const current = useRef(-1);
  const dragged = useRef(0);

  useEffect(() => {
    textures.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
  }, [textures]);

  // leicht erhöhte Kamera, Blick schräg nach unten ins Band
  useEffect(() => {
    const before = camera.position.clone();
    camera.position.set(0, 1.4, 9);
    camera.lookAt(0, 0.1, -2);
    return () => { camera.position.copy(before); camera.lookAt(0, 0, 0); };
  }, [camera]);

  const narrow = viewport.width < viewport.height;
  const opts: BandOptions = useMemo(() => {
    const height = narrow ? 1.0 : 1.25;
    return { spacing: height * 1.25, rows: ROWS, rowDepth: 4.5, rowShift: 0.5, rowSpeed: 1, wrap: true, axisYaw: narrow ? 0 : 28, yaw: narrow ? 0 : 18,
      origin: { x: 0, y: -0.8, z: 0.6 }, height, width: height * 0.75 };
  }, [narrow]);

  const sizes = useMemo(() => textures.map((t) => {
    const img = t.image as { width?: number; height?: number } | undefined;
    const aspect = img?.width && img?.height ? img.width / img.height : 0.75;
    return new THREE.Vector2((opts.height ?? 1) * aspect, opts.height ?? 1);
  }), [textures, opts]);

  // Wischen: Pixel → Plätze (vordere Reihe), Mausrad und Pfeiltasten schubsen
  useEffect(() => {
    const el = gl.domElement;
    let lastX = 0;
    let down = false;
    const pxPerSlot = () => (el.clientWidth / viewport.width) * (opts.spacing ?? 1.5) * 1.25;
    const onDown = (e: PointerEvent) => { down = true; lastX = e.clientX; dragged.current = 0; inertia.grab(); };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragged.current += Math.abs(dx);
      inertia.drag(-dx / pxPerSlot());
    };
    const onUp = () => { if (down) { down = false; inertia.release(); } };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); inertia.nudge((e.deltaX || e.deltaY) * 0.02); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') inertia.nudge(6);
      if (e.key === 'ArrowLeft') inertia.nudge(-6);
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl, inertia, opts, viewport.width]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (focus < 0) inertia.update(dt);
    const target = focus >= 0 ? 1 : 0;
    focusMix.current += (target - focusMix.current) * Math.min(dt * 5, 1);
    const f = focusMix.current;
    const band = computeBand(items.length, { ...opts, offset: inertia.value });
    const focused = focus >= 0 ? focusLayout(band, focus, {
      position: { x: narrow ? 0 : -0.6, y: narrow ? 0.9 : 0.2, z: 4.2 }, scale: narrow ? 1.2 : 1.5, recedeScale: 1, recedeDepth: -0.5, dim: 0.15,
    }) : null;
    const speed = Math.abs(inertia.velocity);
    const blur = Math.min(1, speed / 5) * (1 - f);
    let best = -1;
    let bestSlot = Infinity;
    band.forEach((r, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const slotInfo = bandSlot(i, items.length, { ...opts, offset: inertia.value });
      if (slotInfo.row === 0 && Math.abs(slotInfo.slot) < bestSlot) { bestSlot = Math.abs(slotInfo.slot); best = i; }
      const to = focused ? focused.results[i].target : r.target;
      m.position.lerpVectors(r.target.position, to.position, f);
      m.quaternion.slerpQuaternions(r.target.quaternion, to.quaternion, f);
      const s = 1 + (to.scale.x - 1) * f;
      m.scale.set(sizes[i].x * s, sizes[i].y * s, 1);
      // am Rand ausblenden, damit das Umlaufen nicht springt
      const edge = THREE.MathUtils.clamp(1 - (Math.abs(slotInfo.slot) - (Math.ceil(items.length / ROWS) / 2 - 1.5)) / 1.2, 0, 1);
      const emphasis = focused ? 1 + (focused.emphasis[i] - 1) * f : 1;
      const opacity = edge * emphasis * (1 - blur * 0.5);
      (m.material as THREE.MeshBasicMaterial).opacity = opacity;
      m.renderOrder = i === focus ? 1000 : 10 - slotInfo.row;
      (ghosts.current[i] ?? []).forEach((g, k) => {
        if (!g) return;
        g.visible = blur > 0.05;
        g.position.copy(m.position).x += inertia.velocity * (opts.spacing ?? 1.5) * GHOSTS[k];
        g.quaternion.copy(m.quaternion);
        g.scale.copy(m.scale);
        (g.material as THREE.MeshBasicMaterial).opacity = opacity * blur * (0.55 - k * 0.15);
        g.renderOrder = m.renderOrder - 1;
      });
    });
    if (best !== current.current) { current.current = best; onCurrent(best); }
  });

  return (
    <group>
      {items.map((p, i) => (
        <group key={p.key}>
          <mesh
            ref={(m) => { if (m) meshes.current[i] = m; }}
            onClick={(e) => { e.stopPropagation(); if (dragged.current < 8) onPick(i); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = ''; }}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={textures[i]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          {GHOSTS.map((_, k) => (
            <mesh key={k} visible={false} raycast={() => null}
                  ref={(g) => { if (g) { (ghosts.current[i] ??= [])[k] = g; } }}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={textures[i]} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
