/**
 * Blüte: freigestellte Produktbilder als Blätter um einen Drehpunkt (Layout 'radialFan'
 * der Wave-Engine), Aufblühen aus der Knospe, Fokus auf ein Blatt. Die Bilder sind
 * austauschbar: später Splats statt Billboards hinter derselben Layout-Schnittstelle.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { computeRadialFan, type LayoutResult } from '@arkturian/wave-engine';
import { focusLayout } from './layout/focus';
import { EASINGS, ObjectLayoutAnimator } from './layout/ObjectLayoutAnimator';

export interface Petal {
  key: string | number;
  image: string;
}

export type Phase = 'bud' | 'open';

interface Props {
  petals: Petal[];
  phase: Phase;
  focus: number;
  onPick: (index: number) => void;
}

const PETAL_HEIGHT = 2.1;

/** Fächer je nach Anzahl: wenige Blätter als Bogen nach oben, viele als voller Kranz. */
function fanOptions(count: number, viewportWidth: number, viewportHeight: number) {
  const full = count >= 7;
  const spread = full ? 360 : Math.min(48 * (count - 1), 200);
  const height = PETAL_HEIGHT * (full ? Math.max(0.6, 1 - (count - 7) * 0.035) : 1) * Math.min(1, viewportWidth / 6.2, viewportHeight / 5.4);
  return {
    count, height,
    opts: {
      radius: height * 0.62, startAngle: full ? 90 : 90 + spread / 2, spread, direction: 'cw' as const,
      outwardAxis: 'y' as const, height, width: height * 0.75, depthStep: 0.012, pivot: { x: 0, y: full ? 0 : -1.1, z: 0 },
    },
  };
}

export function BloomScene({ petals, phase, focus, onPick }: Props) {
  const textures = useTexture(petals.map((p) => p.image));
  const { viewport } = useThree();
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const animator = useMemo(
    () => new ObjectLayoutAnimator([], true, (i, v) => {
      const m = meshes.current[i];
      if (m) (m.material as THREE.MeshBasicMaterial).opacity = v;
    }),
    [],
  );

  useEffect(() => {
    textures.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
  }, [textures]);

  const layout = useMemo(() => {
    const { opts } = fanOptions(petals.length, viewport.width, viewport.height);
    const narrow = viewport.width < viewport.height;
    const fan = computeRadialFan(petals.length, opts);
    // Seitenverhältnis je Bild: Höhe bleibt, Breite aus dem Bild
    fan.forEach((r, i) => {
      const img = textures[i]?.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img?.height ? img.width / img.height : 0.75;
      r.target.size.set(opts.height * aspect, opts.height);
    });
    const bud: LayoutResult[] = fan.map((r) => {
      const c = { target: { ...r.target, position: new THREE.Vector3(0, opts.pivot.y, 0), scale: new THREE.Vector3(0.15, 0.15, 1) }, current: r.current };
      return c;
    });
    return { fan, bud, focusY: narrow ? viewport.height * 0.16 : 0.1, focusScale: narrow ? 1.25 : 1.45 };
  }, [petals.length, textures, viewport.width, viewport.height]);

  // Knospe nur bei neuen Blättern (nicht bei Größenänderung des Fensters), dann je nach Phase/Fokus animieren
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    animator.setObjects(meshes.current.slice(0, petals.length));
    animator.jump(layoutRef.current.bud, layoutRef.current.bud.map(() => 0));
  }, [animator, petals]);

  useEffect(() => {
    if (phase === 'bud') {
      animator.to(layout.bud, { duration: 0.45, stagger: 0.02, easing: EASINGS.inOutCubic, values: layout.bud.map(() => 0) });
      return;
    }
    const { results, emphasis } = focusLayout(layout.fan, focus, {
      position: { x: 0, y: layout.focusY, z: 1.2 }, scale: layout.focusScale, recedeScale: 0.75, recedeDepth: -1.2, dim: 0.22,
    });
    const order = focus >= 0 ? undefined : petals.map((_, i) => i);
    animator.to(results, {
      duration: focus >= 0 ? 0.75 : 1.1, stagger: focus >= 0 ? 0.015 : 0.07,
      easing: focus >= 0 ? EASINGS.inOutCubic : EASINGS.outBack, values: emphasis, order,
    });
    meshes.current.forEach((m, i) => { if (m) m.renderOrder = i === focus ? 1000 : i; });
  }, [animator, layout, phase, focus, petals]);

  useFrame((state, dt) => {
    animator.update(Math.min(dt, 0.05));
    if (group.current) {
      // leichtes Wiegen der offenen Blüte, ruhig im Fokus
      const target = focus >= 0 || phase === 'bud' ? 0 : Math.sin(state.clock.elapsedTime * 0.35) * 0.06;
      group.current.rotation.z += (target - group.current.rotation.z) * Math.min(dt * 2, 1);
    }
  });

  return (
    <group ref={group}>
      {petals.map((p, i) => (
        <mesh
          key={p.key}
          ref={(m) => { if (m) meshes.current[i] = m; }}
          onClick={(e) => { e.stopPropagation(); onPick(i); }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={textures[i]} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
