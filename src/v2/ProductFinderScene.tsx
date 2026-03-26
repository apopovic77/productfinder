/**
 * ProductFinder v2 — GPU Instanced Scene
 *
 * Renders products as GPU-instanced textured quads.
 * Positions from PivotLayouter, images from DynamicAtlas.
 */
import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DynamicAtlas } from './render/DynamicAtlas';
import { PivotLayoutAdapter, type LayoutItem } from './render/PivotLayoutAdapter';

import vertexShader from './shaders/productfinder.vert?raw';
import fragmentShader from './shaders/productfinder.frag?raw';

const MAX_INSTANCES = 8192;
const ATLAS_COLS = 36;
const ATLAS_ROWS = 36;
const ATLAS_CELL_SIZE = 128; // 128px tiles → 4608×4608 canvas (~80MB GPU)

interface ProductFinderSceneProps {
  layoutItems: LayoutItem[];
  onProductClick?: (id: string) => void;
  onProductHover?: (id: string | null) => void;
  transitionDuration?: number;
}

export function ProductFinderScene({
  layoutItems,
  onProductClick,
  onProductHover,
  transitionDuration = 0.8,
}: ProductFinderSceneProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera, gl } = useThree();

  const atlas = useMemo(() => new DynamicAtlas(ATLAS_COLS, ATLAS_ROWS, ATLAS_CELL_SIZE), []);
  const adapter = useMemo(() => new PivotLayoutAdapter(MAX_INSTANCES), []);

  const uniforms = useMemo(() => ({
    uLayoutMix: { value: 1.0 },
    uAtlasTexture: { value: atlas.texture },
  }), [atlas]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [uniforms]);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aLayout', adapter.layoutAttr);
    geo.setAttribute('aOldLayout', adapter.oldLayoutAttr);
    geo.setAttribute('aTarget', adapter.targetAttr);
    geo.setAttribute('aOldTarget', adapter.oldTargetAttr);
    geo.setAttribute('aUVOffset', adapter.uvOffsetAttr);
    geo.setAttribute('aOpacity', adapter.opacityAttr);
    geo.setAttribute('aAnimOffset', adapter.animOffsetAttr);
    return geo;
  }, [adapter]);

  // Apply layout when items change
  useEffect(() => {
    if (layoutItems.length === 0) return;

    adapter.applyLayout(layoutItems, atlas);
    uniforms.uLayoutMix.value = 0;

    // Load images
    const STORAGE_API = (import.meta as any).env?.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';
    for (const item of layoutItems) {
      if (item.storageId && !atlas.isTileLoaded(item.atlasIndex) && !atlas.isTileLoading(item.atlasIndex)) {
        const url = `${STORAGE_API}/storage/media/${item.storageId}?width=${ATLAS_CELL_SIZE}&format=webp&quality=80&trim=true`;
        atlas.setTile(item.atlasIndex, url);
      }
    }
  }, [layoutItems, adapter, atlas, uniforms]);

  // Animation loop
  useFrame((_, delta) => {
    if (uniforms.uLayoutMix.value < 1.0) {
      uniforms.uLayoutMix.value = Math.min(1.0, uniforms.uLayoutMix.value + delta / transitionDuration);
    }
    if (meshRef.current) {
      meshRef.current.count = adapter.count;
    }
  });

  // Interaction via canvas events (registered in parent)
  useEffect(() => {
    const canvas = gl.domElement;

    const handleMove = (e: PointerEvent) => {
      if (!onProductHover || !(camera instanceof THREE.OrthographicCamera)) return;
      const rect = canvas.getBoundingClientRect();
      const hitId = adapter.hitTest(e.clientX - rect.left, e.clientY - rect.top, camera, rect.width, rect.height);
      onProductHover(hitId);
      canvas.style.cursor = hitId ? 'pointer' : 'default';
    };

    const handleClick = (e: MouseEvent) => {
      if (!onProductClick || !(camera instanceof THREE.OrthographicCamera)) return;
      const rect = canvas.getBoundingClientRect();
      const hitId = adapter.hitTest(e.clientX - rect.left, e.clientY - rect.top, camera, rect.width, rect.height);
      if (hitId) onProductClick(hitId);
    };

    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('click', handleClick);
    return () => {
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [gl, camera, adapter, onProductClick, onProductHover]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
    />
  );
}
