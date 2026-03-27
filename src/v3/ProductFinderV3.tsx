/**
 * ProductFinder v3 — Pure Arcturian Engine
 *
 * No PivotLayouter, no GPANE. Just products in 3D space
 * using Arcturian's generateLayout() and MorphShader.
 *
 * Route: /v3
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createUniforms, applyShaderToMaterial, generateLayout,
  MAX_PARTICLES, CameraLight, SmoothZoomControls, ClickPicker,
} from '@arcturian';
import type { MorphShaderUniforms } from '@arcturian/core/MorphShader';
import type { LayoutShape, LayoutResult } from '@arcturian/tessellation/layouts';
import type { FlyTarget } from '@arcturian/core/types';

const STORAGE_API = (import.meta as any).env?.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';
const ONEAL_API = (import.meta as any).env?.VITE_ONEAL_API_BASE || 'https://gsgbot.arkturian.com/oneal-api/v1';
const API_KEY = (import.meta as any).env?.VITE_ONEAL_API_KEY || 'oneal_demo_token';

interface ProductInfo {
  id: number;
  name: string;
  storageId: number | null;
}

// ============================================================
// Atlas Loader — builds canvas texture from product images
// ============================================================
class SimpleAtlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  cols: number;
  rows: number;
  cellSize: number;

  constructor(cols: number, rows: number, cellSize: number) {
    this.cols = cols; this.rows = rows; this.cellSize = cellSize;
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * cellSize;
    this.canvas.height = rows * cellSize;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#222';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  async loadTile(index: number, storageId: number) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `${STORAGE_API}/storage/media/${storageId}?width=${this.cellSize}&format=webp&quality=80&trim=true`;
      await img.decode();
      this.ctx.drawImage(img, col * this.cellSize, row * this.cellSize, this.cellSize, this.cellSize);
      this.texture.needsUpdate = true;
    } catch { /* skip failed */ }
  }

  getUV(index: number): [number, number, number, number] {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const su = 1 / this.cols;
    const sv = 1 / this.rows;
    return [col / this.cols, 1 - (row + 1) / this.rows, su, sv];
  }
}

// ============================================================
// Scene — Arcturian InstancedMesh + MorphShader
// ============================================================
function ArcturianScene({
  products, shape, shapeSize, gapFactor, tileAspect,
}: {
  products: ProductInfo[];
  shape: LayoutShape;
  shapeSize: number;
  gapFactor: number;
  tileAspect: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const flyTargetRef = useRef<FlyTarget>({ active: false, position: new THREE.Vector3(), lookAt: new THREE.Vector3() });

  // Atlas
  const atlas = useMemo(() => {
    const cols = Math.ceil(Math.sqrt(products.length));
    return new SimpleAtlas(cols, cols, 128);
  }, [products.length]);

  // Load images
  useEffect(() => {
    products.forEach((p, i) => {
      if (p.storageId) atlas.loadTile(i, p.storageId);
    });
  }, [products, atlas]);

  // Uniforms
  const uniforms = useMemo<MorphShaderUniforms>(() => {
    const u = createUniforms();
    u.uUseAtlas.value = 1.0;
    u.uAtlasFaceMode.value = 1.0; // front + back
    u.uAtlasTexture.value = atlas.texture;
    u.uColor1.value.set('#1a1a2e');
    u.uColor2.value.set('#2a2a4e');
    u.uColorMix.value = 0.0;
    u.uLayoutMix.value = 1.0;
    return u;
  }, [atlas]);

  // Geometry with Arcturian attributes
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

  // Shader injection
  const onBeforeCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => {
    applyShaderToMaterial(shader, uniforms);
  }, [uniforms]);

  // Copy attribute helper
  const copyAttr = (from: string, to: string) => {
    const f = geometry.getAttribute(from) as THREE.InstancedBufferAttribute;
    const t = geometry.getAttribute(to) as THREE.InstancedBufferAttribute;
    (t.array as Float32Array).set(f.array as Float32Array);
    t.needsUpdate = true;
  };

  // Apply layout from Arcturian generateLayout
  const applyLayout = useCallback((results: LayoutResult[], animate: boolean) => {
    const count = Math.min(results.length, MAX_PARTICLES);

    if (animate) {
      copyAttr('aLayout', 'aOldLayout');
      copyAttr('aQuaternion', 'aOldQuaternion');
      copyAttr('aTarget', 'aOldTarget');
    }

    const aLayout = geometry.getAttribute('aLayout') as THREE.InstancedBufferAttribute;
    const aQuaternion = geometry.getAttribute('aQuaternion') as THREE.InstancedBufferAttribute;
    const aTarget = geometry.getAttribute('aTarget') as THREE.InstancedBufferAttribute;
    const aTarget2 = geometry.getAttribute('aTarget2') as THREE.InstancedBufferAttribute;
    const aUVOffset = geometry.getAttribute('aUVOffset') as THREE.InstancedBufferAttribute;

    for (let i = 0; i < count; i++) {
      const r = results[i];
      const pos = r.target.position;
      const quat = r.target.quaternion;
      const morph = r.target.morph;

      aLayout.setXYZW(i, pos.x, pos.y, pos.z, r.target.scale.x);
      aQuaternion.setXYZW(i, quat.x, quat.y, quat.z, quat.w);

      if (morph) {
        aTarget.setXYZW(i, morph.sizeX, morph.depth, morph.trapezoidX, morph.trapezoidY);
        const oldTrapZ = (aTarget2.array as Float32Array)[i * 4] || 0;
        const oldSizeY = (aTarget2.array as Float32Array)[i * 4 + 1] || morph.sizeY;
        aTarget2.setXYZW(i, morph.trapezoidZ, morph.sizeY, oldTrapZ, oldSizeY);
      }

      // Atlas UV
      const [u, v, su, sv] = atlas.getUV(i);
      aUVOffset.setXYZW(i, u, v, su, sv);

      if (!animate) {
        // Init old = current (no transition on first load)
        const aOldLayout = geometry.getAttribute('aOldLayout') as THREE.InstancedBufferAttribute;
        const aOldQuat = geometry.getAttribute('aOldQuaternion') as THREE.InstancedBufferAttribute;
        const aOldTarget = geometry.getAttribute('aOldTarget') as THREE.InstancedBufferAttribute;
        aOldLayout.setXYZW(i, pos.x, pos.y, pos.z, r.target.scale.x);
        aOldQuat.setXYZW(i, quat.x, quat.y, quat.z, quat.w);
        if (morph) aOldTarget.setXYZW(i, morph.sizeX, morph.depth, morph.trapezoidX, morph.trapezoidY);
      }
    }

    // Hide unused
    for (let i = count; i < MAX_PARTICLES; i++) {
      aLayout.setXYZW(i, 0, 0, 0, 0);
    }

    aLayout.needsUpdate = true;
    aQuaternion.needsUpdate = true;
    aTarget.needsUpdate = true;
    aTarget2.needsUpdate = true;
    aUVOffset.needsUpdate = true;
    geometry.getAttribute('aOldLayout').needsUpdate = true;
    geometry.getAttribute('aOldQuaternion').needsUpdate = true;
    geometry.getAttribute('aOldTarget').needsUpdate = true;

    if (meshRef.current) meshRef.current.count = count;
    if (animate) uniforms.uLayoutMix.value = 0;
  }, [geometry, atlas, uniforms]);

  // Generate + apply layout when shape/params change
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (products.length === 0) return;

    const results = generateLayout({
      particleCount: products.length,
      shape,
      mode: 'fixedShapeSize',
      targetRadius: shapeSize,
      baseParticleSize: new THREE.Vector2(0.1, 0.1),
      gapFactor,
      tileAspect,
      galleryRedux: 0.3,
    });

    applyLayout(results, !isFirstRender.current);
    isFirstRender.current = false;
  }, [products.length, shape, shapeSize, gapFactor, tileAspect, applyLayout]);

  // Animate transition
  useFrame((_, delta) => {
    if (uniforms.uLayoutMix.value < 1.0) {
      uniforms.uLayoutMix.value = Math.min(1.0, uniforms.uLayoutMix.value + delta / 1.2);
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[geometry, undefined!, MAX_PARTICLES]} frustumCulled={false}>
        <meshStandardMaterial
          onBeforeCompile={onBeforeCompile}
          roughness={0.6}
          metalness={0.1}
        />
      </instancedMesh>

      <CameraLight intensity={2.5} />
      <SmoothZoomControls flyTargetRef={flyTargetRef} />
      <ClickPicker meshRef={meshRef} flyTargetRef={flyTargetRef} particleCount={products.length} />
    </>
  );
}

// ============================================================
// Page — loads products, provides shape controls
// ============================================================
const SHAPES: LayoutShape[] = ['gallery', 'sphere', 'ring', 'cube', 'box', 'cylinder', 'tube', 'torus', 'plane'];

export function ProductFinderV3() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [shape, setShape] = useState<LayoutShape>('gallery');
  const [shapeSize, setShapeSize] = useState(5);
  const [gapFactor, setGapFactor] = useState(0.95);
  const [tileAspect, setTileAspect] = useState(1.0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${ONEAL_API}/products?limit=2000`, {
          headers: { 'X-API-Key': API_KEY },
        });
        const data = await res.json();
        const items: ProductInfo[] = (data.results || []).map((p: any) => ({
          id: p.id,
          name: p.name_en || p.short_name || `Product ${p.id}`,
          storageId: p.storage?.id || null,
        }));
        setProducts(items);
      } catch (e) {
        console.error('Failed to load products:', e);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 60 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#050510']} />
        <ambientLight intensity={0.3} />

        {products.length > 0 && (
          <ArcturianScene
            products={products}
            shape={shape}
            shapeSize={shapeSize}
            gapFactor={gapFactor}
            tileAspect={tileAspect}
          />
        )}
      </Canvas>

      {/* Controls Overlay */}
      <div style={{
        position: 'absolute', top: 16, left: 16, color: '#fff',
        fontFamily: "'ITC Avant Garde Gothic', system-ui", fontSize: 13,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          ProductFinder <span style={{ color: '#ff6b6b' }}>v3</span>
          <span style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>Arcturian Engine</span>
        </div>
        <div style={{ opacity: 0.5, marginBottom: 16 }}>
          {loading ? 'Loading...' : `${products.length} products`}
        </div>

        {/* Shape Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 300 }}>
          {SHAPES.map(s => (
            <button key={s} onClick={() => setShape(s)} style={{
              background: s === shape ? 'rgba(255,107,107,0.3)' : 'rgba(255,255,255,0.06)',
              border: s === shape ? '1px solid rgba(255,107,107,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: s === shape ? '#ff6b6b' : '#888',
              padding: '5px 10px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
            }}>
              {s}
            </button>
          ))}
        </div>

        {/* Sliders */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, color: '#666' }}>
            Size: {shapeSize.toFixed(1)}
            <input type="range" min="1" max="20" step="0.5" value={shapeSize}
              onChange={e => setShapeSize(Number(e.target.value))}
              style={{ width: 160, display: 'block' }} />
          </label>
          <label style={{ fontSize: 11, color: '#666' }}>
            Gap: {gapFactor.toFixed(2)}
            <input type="range" min="0.5" max="1" step="0.01" value={gapFactor}
              onChange={e => setGapFactor(Number(e.target.value))}
              style={{ width: 160, display: 'block' }} />
          </label>
          <label style={{ fontSize: 11, color: '#666' }}>
            Aspect: {tileAspect.toFixed(1)}
            <input type="range" min="0.5" max="2" step="0.1" value={tileAspect}
              onChange={e => setTileAspect(Number(e.target.value))}
              style={{ width: 160, display: 'block' }} />
          </label>
        </div>
      </div>
    </div>
  );
}
