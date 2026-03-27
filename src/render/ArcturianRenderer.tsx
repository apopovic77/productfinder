/**
 * ArcturianRenderer — GPU Instanced Renderer for ProductFinder v1
 *
 * Drop-in alternative to CanvasRenderer. Renders the same LayoutNodes
 * from the LayoutEngine but via Arcturian's MorphShader + InstancedMesh.
 *
 * Mounted as a React component that overlays/replaces the Canvas element.
 * Reads LayoutNodes from the controller and writes to GPU buffers.
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { createUniforms, applyShaderToMaterial, MAX_PARTICLES, CameraLight } from '@arcturian';
import type { MorphShaderUniforms } from '@arcturian/core/MorphShader';
import type { LayoutNode } from '../layout/LayoutNode';
import type { Product } from '../types/Product';
import type { GroupHeaderInfo } from '../layout/PivotLayouter';

// ============================================================
// Static Atlas (same as v3)
// ============================================================
class StaticAtlas {
  textures: THREE.Texture[] = [];
  cols: number;
  rows: number;
  tilesPerPage: number;
  ready = false;

  constructor(public tier: number, public pageCount: number, cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.tilesPerPage = cols * rows;
  }

  async load(basePath: string, format: 'png' | 'jpg' = 'png') {
    const loader = new THREE.TextureLoader();
    for (let i = 0; i < this.pageCount; i++) {
      try {
        const tex = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(`${basePath}/${this.tier}/atlas_${i}.${format}`, (t) => {
            t.minFilter = THREE.LinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.colorSpace = THREE.SRGBColorSpace;
            t.generateMipmaps = false;
            resolve(t);
          }, undefined, reject);
        });
        this.textures.push(tex);
      } catch {
        this.textures.push(new THREE.Texture());
      }
    }
    this.ready = true;
  }

  getUV(globalIndex: number): { u: number; v: number; su: number; sv: number } {
    const localIndex = globalIndex % this.tilesPerPage;
    const col = localIndex % this.cols;
    const row = Math.floor(localIndex / this.cols);
    const su = 1 / this.cols;
    const sv = 1 / this.rows;
    return { u: col / this.cols, v: 1 - (row + 1) / this.rows, su, sv };
  }

  dispose() { for (const t of this.textures) t.dispose(); }
}

// ============================================================
// GPU Scene — reads LayoutNodes and renders via InstancedMesh
// ============================================================
function GPUScene({
  getNodes,
  getHeaders,
  productToAtlasIndex,
}: {
  getNodes: () => LayoutNode<Product>[];
  getHeaders: () => GroupHeaderInfo[];
  productToAtlasIndex: Map<string, number>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Atlas
  const atlas = useMemo(() => new StaticAtlas(128, 3, 32, 32), []);
  useEffect(function loadAtlas() {
    atlas.load('/atlas/png', 'png');
  }, [atlas]);

  // Uniforms
  const uniforms = useRef<MorphShaderUniforms>(null!);
  if (!uniforms.current) {
    uniforms.current = createUniforms();
    uniforms.current.uUseAtlas.value = 1.0;
    uniforms.current.uAtlasFaceMode.value = 2.0; // front only (flat 2D)
    uniforms.current.uColor1.value.set('#ffffff');
    uniforms.current.uColor2.value.set('#ffffff');
    uniforms.current.uLayoutMix.value = 1.0;
    (uniforms.current as any).uAlphaEnabled.value = 1.0;
  }

  // Geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('aLayout', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aOldLayout', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aQuaternion', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aOldQuaternion', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aTarget', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aOldTarget', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aTarget2', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    geo.setAttribute('aUVOffset', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    return geo;
  }, []);

  const onBeforeCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => {
    applyShaderToMaterial(shader, uniforms.current);
  }, []);

  // Sync LayoutNodes → GPU buffers every frame
  useFrame(() => {
    const nodes = getNodes();
    if (!nodes || nodes.length === 0) return;

    const count = Math.min(nodes.length, MAX_PARTICLES);
    const aLayout = geometry.getAttribute('aLayout') as THREE.InstancedBufferAttribute;
    const aQuaternion = geometry.getAttribute('aQuaternion') as THREE.InstancedBufferAttribute;
    const aTarget = geometry.getAttribute('aTarget') as THREE.InstancedBufferAttribute;
    const aTarget2 = geometry.getAttribute('aTarget2') as THREE.InstancedBufferAttribute;
    const aUVOffset = geometry.getAttribute('aUVOffset') as THREE.InstancedBufferAttribute;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      const x = node.posX.value ?? 0;
      const y = -(node.posY.value ?? 0); // Flip Y
      const w = node.width.value ?? 0;
      const h = node.height.value ?? 0;
      const opacity = node.opacity.value ?? 1;
      const scale = node.scale.value ?? 1;

      // Position + scale
      aLayout.setXYZW(i, x, y, 0, opacity > 0.01 ? scale : 0);

      // Identity quaternion (2D)
      aQuaternion.setXYZW(i, 0, 0, 0, 1);

      // Size: sizeX, depth=0 (flat), no trapezoid
      aTarget.setXYZW(i, w, 0, 0, 0);
      aTarget2.setXYZW(i, 0, h, 0, h);

      // Atlas UV
      const atlasIdx = productToAtlasIndex.get(node.id) ?? 0;
      const uv = atlas.getUV(atlasIdx);
      aUVOffset.setXYZW(i, uv.u, uv.v, uv.su, uv.sv);
    }

    // Hide remaining
    for (let i = count; i < (meshRef.current?.count ?? 0); i++) {
      aLayout.setXYZW(i, 0, 0, 0, 0);
    }

    aLayout.needsUpdate = true;
    aQuaternion.needsUpdate = true;
    aTarget.needsUpdate = true;
    aTarget2.needsUpdate = true;
    aUVOffset.needsUpdate = true;

    if (meshRef.current) meshRef.current.count = count;

    // Set atlas texture
    if (atlas.ready && atlas.textures.length > 0) {
      uniforms.current.uAtlasTexture.value = atlas.textures[0];
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[geometry, undefined!, MAX_PARTICLES]} frustumCulled={false}>
        <meshStandardMaterial
          onBeforeCompile={onBeforeCompile}
          roughness={0.8}
          metalness={0.0}
          alphaTest={0.5}
        />
      </instancedMesh>
      <CameraLight intensity={2.0} />
    </>
  );
}

// ============================================================
// Public Component — replaces the <canvas> element
// ============================================================
export interface ArcturianRendererProps {
  getNodes: () => LayoutNode<Product>[];
  getHeaders: () => GroupHeaderInfo[];
  productToAtlasIndex: Map<string, number>;
  width: number;
  height: number;
}

export function ArcturianRendererComponent({
  getNodes, getHeaders, productToAtlasIndex, width, height,
}: ArcturianRendererProps) {
  // Calculate camera position from content bounds
  const nodes = getNodes();
  let centerX = 0, centerY = 0;
  if (nodes.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.posX.targetValue ?? 0;
      const y = -(n.posY.targetValue ?? 0);
      const w = n.width.targetValue ?? 0;
      const h = n.height.targetValue ?? 0;
      if (x < minX) minX = x;
      if (x + w > maxX) maxX = x + w;
      if (y - h < minY) minY = y - h;
      if (y > maxY) maxY = y;
    }
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
  }

  return (
    <Canvas
      orthographic
      camera={{ zoom: 1, position: [centerX, centerY, 100], near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width, height, position: 'absolute', top: 0, left: 0 }}
    >
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={0.8} />

      <GPUScene
        getNodes={getNodes}
        getHeaders={getHeaders}
        productToAtlasIndex={productToAtlasIndex}
      />

      <MapControls
        enableRotate={false}
        enableDamping
        dampingFactor={0.1}
        zoomSpeed={0.5}
        minZoom={0.1}
        maxZoom={20}
      />
    </Canvas>
  );
}
