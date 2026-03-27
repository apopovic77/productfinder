/**
 * ProductFinder v2 — GPU Instanced Scene (Arcturian Engine)
 *
 * Uses Arcturian's MorphShader via onBeforeCompile.
 * Products are flat quads with atlas textures from MultiTierAtlas.
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createUniforms, applyShaderToMaterial, MAX_PARTICLES } from '@arcturian';
import type { MorphShaderUniforms } from '@arcturian/core/MorphShader';
import { MultiTierAtlas } from './render/MultiTierAtlas';
import { ImageLoadPipeline } from './render/ImageLoadPipeline';
import type { LayoutItem } from './render/PivotLayoutAdapter';

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
  transitionDuration = 0.6,
}: ProductFinderSceneProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera, gl } = useThree();
  const countRef = useRef(0);

  // Multi-tier atlas + image pipeline
  const atlas = useMemo(() => new MultiTierAtlas(), []);
  const pipeline = useMemo(() => {
    const p = new ImageLoadPipeline(atlas);
    p.start();
    return p;
  }, [atlas]);

  // Arcturian uniforms
  const uniforms = useMemo<MorphShaderUniforms>(() => {
    const u = createUniforms();
    u.uUseAtlas.value = 1.0;
    u.uAtlasFaceMode.value = 2.0; // front face only
    u.uColor1.value.set('#1a1a2e');
    u.uLayoutMix.value = 1.0;
    return u;
  }, []);

  // Geometry: BoxGeometry with Arcturian's 8 instanced attributes
  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const max = MAX_PARTICLES;
    geo.setAttribute('aLayout', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aOldLayout', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aQuaternion', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aOldQuaternion', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aTarget', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aOldTarget', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aTarget2', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    geo.setAttribute('aUVOffset', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
    return geo;
  }, []);

  // Material with Arcturian shader injection
  const onBeforeCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => {
    applyShaderToMaterial(shader, uniforms);
  }, [uniforms]);

  // CPU data for hit testing
  const cpuData = useRef<{ ids: string[]; positions: Float32Array; sizes: Float32Array }>({
    ids: [], positions: new Float32Array(0), sizes: new Float32Array(0),
  });

  // Write layout items to GPU buffers
  const applyLayout = useCallback((items: LayoutItem[]) => {
    if (!geometry) return;
    const count = Math.min(items.length, MAX_PARTICLES);

    const aLayout = geometry.getAttribute('aLayout') as THREE.InstancedBufferAttribute;
    const aOldLayout = geometry.getAttribute('aOldLayout') as THREE.InstancedBufferAttribute;
    const aQuaternion = geometry.getAttribute('aQuaternion') as THREE.InstancedBufferAttribute;
    const aOldQuaternion = geometry.getAttribute('aOldQuaternion') as THREE.InstancedBufferAttribute;
    const aTarget = geometry.getAttribute('aTarget') as THREE.InstancedBufferAttribute;
    const aOldTarget = geometry.getAttribute('aOldTarget') as THREE.InstancedBufferAttribute;
    const aTarget2 = geometry.getAttribute('aTarget2') as THREE.InstancedBufferAttribute;
    const aUVOffset = geometry.getAttribute('aUVOffset') as THREE.InstancedBufferAttribute;

    // Snapshot current → old
    (aOldLayout.array as Float32Array).set(aLayout.array as Float32Array);
    (aOldQuaternion.array as Float32Array).set(aQuaternion.array as Float32Array);
    (aOldTarget.array as Float32Array).set(aTarget.array as Float32Array);

    const ids: string[] = [];
    const positions = new Float32Array(count * 2);
    const sizes = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const item = items[i];

      // Position
      aLayout.setXYZW(i, item.posX, item.posY, 0, item.opacity > 0 ? 1.0 : 0.0);

      // Identity quaternion
      aQuaternion.setXYZW(i, 0, 0, 0, 1);

      // Size: sizeX=width, depth=0.01, no trapezoid
      aTarget.setXYZW(i, item.width, 0.01, 0, 0);

      // sizeY in aTarget2.y
      const oldSizeY = (aTarget2.array as Float32Array)[i * 4 + 1] || item.height;
      aTarget2.setXYZW(i, 0, item.height, 0, oldSizeY);

      // Atlas UV — allocate T0 slot and load
      if (item.storageId) {
        const slot = atlas.allocateSlot(item.id, 0);
        if (slot) {
          aUVOffset.setXYZW(i, slot.u, slot.v, slot.su, slot.sv);
        }
      }

      ids.push(item.id);
      positions[i * 2] = item.posX;
      positions[i * 2 + 1] = item.posY;
      sizes[i * 2] = item.width;
      sizes[i * 2 + 1] = item.height;
    }

    // Hide remaining
    for (let i = count; i < MAX_PARTICLES; i++) {
      aLayout.setXYZW(i, 0, 0, 0, 0);
    }

    // Update atlas texture uniform
    uniforms.uAtlasTexture.value = atlas.getTexture(0);

    aLayout.needsUpdate = true;
    aOldLayout.needsUpdate = true;
    aQuaternion.needsUpdate = true;
    aOldQuaternion.needsUpdate = true;
    aTarget.needsUpdate = true;
    aOldTarget.needsUpdate = true;
    aTarget2.needsUpdate = true;
    aUVOffset.needsUpdate = true;

    countRef.current = count;
    cpuData.current = { ids, positions, sizes };

    // Feed visibility to image pipeline
    pipeline.updateVisibility(items.map(item => ({
      id: item.id,
      storageId: item.storageId || 0,
      screenSize: 64, // Will be updated per frame
    })));
  }, [geometry, atlas, uniforms, pipeline]);

  // Apply layout when items change
  useEffect(() => {
    if (layoutItems.length === 0) return;
    applyLayout(layoutItems);
    uniforms.uLayoutMix.value = 0;
  }, [layoutItems, applyLayout, uniforms]);

  // Animation + LOD scan
  useFrame((_, delta) => {
    // Transition animation
    if (uniforms.uLayoutMix.value < 1.0) {
      uniforms.uLayoutMix.value = Math.min(1.0, uniforms.uLayoutMix.value + delta / transitionDuration);
    }

    if (meshRef.current) {
      meshRef.current.count = countRef.current;
    }

    // Update atlas texture (may have new tiles painted)
    uniforms.uAtlasTexture.value = atlas.getTexture(0);
  });

  // Hit test
  const hitTest = useCallback((clientX: number, clientY: number): string | null => {
    if (!(camera instanceof THREE.OrthographicCamera)) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { ids, positions, sizes } = cpuData.current;
    const projected = new THREE.Vector3();

    for (let i = 0; i < ids.length; i++) {
      const w = sizes[i * 2], h = sizes[i * 2 + 1];
      projected.set(positions[i * 2] + w / 2, positions[i * 2 + 1] - h / 2, 0);
      projected.project(camera);
      const sx = (projected.x + 1) / 2 * rect.width;
      const sy = (1 - projected.y) / 2 * rect.height;
      if (Math.abs(mx - sx) < w * camera.zoom / 2 && Math.abs(my - sy) < h * camera.zoom / 2) {
        return ids[i];
      }
    }
    return null;
  }, [camera, gl]);

  // Canvas interaction
  useEffect(() => {
    const canvas = gl.domElement;
    const handleMove = (e: PointerEvent) => {
      const id = hitTest(e.clientX, e.clientY);
      onProductHover?.(id);
      canvas.style.cursor = id ? 'pointer' : 'default';
    };
    const handleClick = (e: MouseEvent) => {
      const id = hitTest(e.clientX, e.clientY);
      if (id) onProductClick?.(id);
    };
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('click', handleClick);
    return () => {
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [gl, hitTest, onProductClick, onProductHover]);

  // Cleanup
  useEffect(() => {
    return () => {
      pipeline.stop();
      atlas.dispose();
    };
  }, [pipeline, atlas]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined!, MAX_PARTICLES]} frustumCulled={false}>
      <meshStandardMaterial
        onBeforeCompile={onBeforeCompile}
        roughness={0.8}
        metalness={0.0}
      />
    </instancedMesh>
  );
}
