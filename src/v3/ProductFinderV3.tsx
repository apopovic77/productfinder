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
  atlasRegistry, LodManager,
} from '@arcturian';
import type { MorphShaderUniforms } from '@arcturian/core/MorphShader';
import type { LayoutShape, LayoutResult } from '@arcturian/tessellation/layouts';
import type { FlyTarget } from '@arcturian/core/types';

const STORAGE_API = '/storage-api';
const ONEAL_API = '/oneal-api/v1';
const API_KEY = 'oneal_demo_token';

interface ProductInfo {
  id: number;
  name: string;
  storageId: number | null;
}

// ============================================================
// Static Atlas — loads pre-generated atlas PNG/JPG files
// ============================================================
class StaticAtlas {
  textures: THREE.Texture[] = [];
  cols: number;
  rows: number;
  tilesPerPage: number;
  totalTiles: number;
  ready = false;

  constructor(public tier: number, public pageCount: number, cols: number, rows: number, totalTiles: number) {
    this.cols = cols;
    this.rows = rows;
    this.tilesPerPage = cols * rows;
    this.totalTiles = totalTiles;
  }

  async load(basePath: string, format: 'png' | 'jpg' = 'png') {
    const loader = new THREE.TextureLoader();
    const loadTex = (url: string): Promise<THREE.Texture> => new Promise((resolve, reject) => {
      loader.load(url, (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        resolve(tex);
      }, undefined, reject);
    });

    console.log(`[StaticAtlas] Loading ${this.pageCount} pages (${this.tier}px ${format})...`);
    for (let i = 0; i < this.pageCount; i++) {
      const url = `${basePath}/${this.tier}/atlas_${i}.${format}`;
      try {
        const tex = await loadTex(url);
        this.textures.push(tex);
        console.log(`[StaticAtlas] Page ${i} loaded`);
      } catch (e) {
        console.warn(`[StaticAtlas] Page ${i} failed:`, e);
        this.textures.push(new THREE.Texture());
      }
    }
    this.ready = true;
    console.log(`[StaticAtlas] All ${this.textures.length} pages loaded`);
  }

  getUV(globalIndex: number): { pageIndex: number; u: number; v: number; su: number; sv: number } {
    const pageIndex = Math.floor(globalIndex / this.tilesPerPage);
    const localIndex = globalIndex % this.tilesPerPage;
    const col = localIndex % this.cols;
    const row = Math.floor(localIndex / this.cols);
    const su = 1 / this.cols;
    const sv = 1 / this.rows;
    return {
      pageIndex,
      u: col / this.cols,
      v: 1 - (row + 1) / this.rows,
      su,
      sv,
    };
  }

  dispose() {
    for (const t of this.textures) t.dispose();
  }
}

// ============================================================
// Scene — Arcturian InstancedMesh + MorphShader
// ============================================================
function ArcturianScene({
  products, shape, shapeSize, depth, gapFactor, tileAspect, atlasFormat, tileColor,
}: {
  products: ProductInfo[];
  shape: LayoutShape;
  shapeSize: number;
  depth: number;
  gapFactor: number;
  tileAspect: number;
  atlasFormat: 'png' | 'jpg';
  tileColor: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const flyTargetRef = useRef<FlyTarget>({ active: false, position: new THREE.Vector3(), lookAt: new THREE.Vector3() });

  // Register product atlas in Arcturian AtlasRegistry
  const atlasId = `oneal_products_${atlasFormat}`;
  useMemo(function registerAtlas() {
    // jpg → /atlas/jpg, png → /atlas (main folder has PNGs)
    const basePath = atlasFormat === 'jpg' ? '/atlas/jpg' : '/atlas';
    const ext = atlasFormat === 'jpg' ? 'jpg' : 'png';

    if (atlasRegistry.has(atlasId)) atlasRegistry.remove(atlasId);
    atlasRegistry.register({
      id: atlasId,
      tileCount: products.length,
      lods: [
        // LOD 0: 64px — 1 atlas, 64×64 grid = 4096 tiles
        { urls: [`${basePath}/64/atlas_0.${ext}`], rows: 64, cols: 64, tilesPerAtlas: 4096 },
        // LOD 1: 128px — 3 atlases, 32×32 grid = 1024 tiles each
        { urls: [0, 1, 2].map(i => `${basePath}/128/atlas_${i}.${ext}`), rows: 32, cols: 32, tilesPerAtlas: 1024 },
        // LOD 2: 256px — 11 atlases, 16×16 grid = 256 tiles each
        { urls: Array.from({ length: 11 }, (_, i) => `${basePath}/256/atlas_${i}.${ext}`), rows: 16, cols: 16, tilesPerAtlas: 256 },
      ],
    });
  }, [atlasFormat, products.length, atlasId]);

  // Uniforms — create ONCE
  const uniforms = useRef<MorphShaderUniforms>(null!);
  if (!uniforms.current) {
    uniforms.current = createUniforms();
    uniforms.current.uUseAtlas.value = 1.0;
    uniforms.current.uAtlasFaceMode.value = 1.0;
    uniforms.current.uColor1.value.set(tileColor);
    uniforms.current.uColor2.value.set(tileColor);
    uniforms.current.uColorMix.value = 0.0;
    uniforms.current.uLayoutMix.value = 1.0;
    (uniforms.current as any).uAlphaEnabled.value = 1.0;
    uniforms.current.uLod2Enabled.value = 0.0; // LodManager handles LOD 2
    uniforms.current.uLod2Threshold.value = 3.0;
    uniforms.current.uLodThreshold.value = 8.0;
  }

  // Load atlas textures (LOD 0 + LOD 1)
  const [atlasReady, setAtlasReady] = useState(false);
  useEffect(function loadAtlasTextures() {
    setAtlasReady(false);
    const entry = atlasRegistry.get(atlasId);
    if (!entry) return;
    const loader = new THREE.TextureLoader();
    const loadTex = (url: string): Promise<THREE.Texture> => new Promise((resolve) => {
      loader.load(url, (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        resolve(tex);
      });
    });

    // LOD 0 (64px)
    loadTex(entry.lods[0].urls[0]).then(tex => {
      uniforms.current.uAtlasTexture.value = tex;
      setAtlasReady(true);
      console.log('[Atlas] LOD 0 loaded');
    });

    // LOD 1 (128px) — up to 4 pages
    if (entry.lods[1]) {
      const lod1 = entry.lods[1];
      const targets = [uniforms.current.uAtlasLod1_0, uniforms.current.uAtlasLod1_1, uniforms.current.uAtlasLod1_2, uniforms.current.uAtlasLod1_3];
      lod1.urls.forEach((url, i) => {
        if (i < 4) {
          loadTex(url).then(tex => {
            targets[i].value = tex;
            uniforms.current.uLodEnabled.value = 1.0;
            uniforms.current.uLod1Cols.value = lod1.cols;
            uniforms.current.uLod1TilesPerAtlas.value = lod1.tilesPerAtlas;
            console.log(`[Atlas] LOD 1 page ${i} loaded`);
          });
        }
      });
    }
  }, [atlasId, atlasFormat]);

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
    applyShaderToMaterial(shader, uniforms.current);
  }, []);

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

      // Atlas UV — LOD 0 grid (64×64 = 4096 tiles, single atlas)
      const lod0Cols = 64;
      const col = i % lod0Cols;
      const row = Math.floor(i / lod0Cols);
      const su = 1 / lod0Cols;
      const sv = 1 / lod0Cols;
      aUVOffset.setXYZW(i, col * su, 1 - (row + 1) * sv, su, sv);

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
    if (animate) uniforms.current.uLayoutMix.value = 0;
  }, [geometry]);

  // Update tile color
  useEffect(function updateTileColor() {
    uniforms.current.uColor1.value.set(tileColor);
    uniforms.current.uColor2.value.set(tileColor);
  }, [tileColor]);

  // Generate + apply layout when shape/params change
  const isFirstRender = useRef(true);
  useEffect(function applyShapeLayout() {
    if (products.length === 0) return;

    const results = generateLayout({
      particleCount: products.length,
      shape,
      mode: 'fixedShapeSize',
      targetRadius: shapeSize,
      targetDepth: depth,
      baseParticleSize: new THREE.Vector2(0.1, 0.1),
      gapFactor,
      tileAspect,
      galleryRedux: 0.3,
    });

    // Override tile depth per morph config
    for (const r of results) {
      if (r.target.morph) r.target.morph.depth = depth;
      if (r.current.morph) r.current.morph.depth = depth;
    }

    applyLayout(results, !isFirstRender.current);
    isFirstRender.current = false;
  }, [products.length, shape, shapeSize, depth, gapFactor, tileAspect, applyLayout]);

  // Animate transition
  useFrame((_, delta) => {
    if (uniforms.current.uLayoutMix.value < 1.0) {
      uniforms.current.uLayoutMix.value = Math.min(1.0, uniforms.current.uLayoutMix.value + delta / 1.2);
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[geometry, undefined!, MAX_PARTICLES]} frustumCulled={false}>
        <meshStandardMaterial
          onBeforeCompile={onBeforeCompile}
          roughness={0.6}
          metalness={0.1}
          transparent
          alphaTest={0.01}
        />
      </instancedMesh>

      <CameraLight intensity={2.5} />
      <SmoothZoomControls flyTargetRef={flyTargetRef} />
      <ClickPicker meshRef={meshRef} flyTargetRef={flyTargetRef} particleCount={products.length} />
      <LodManager meshRef={meshRef} activeAtlasId={atlasId} particleCount={products.length} uniforms={uniforms.current} />
    </>
  );
}

// ============================================================
// Page — loads products, provides shape controls
// ============================================================
const SHAPES: LayoutShape[] = ['gallery', 'sphere', 'ring', 'cube', 'box', 'cylinder', 'tube', 'torus', 'plane', 'helix', 'dna', 'galaxy', 'hexgrid'];

export function ProductFinderV3() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [shape, setShape] = useState<LayoutShape>('gallery');
  const [shapeSize, setShapeSize] = useState(5);
  const [gapFactor, setGapFactor] = useState(0.95);
  const [tileAspect, setTileAspect] = useState(1.0);
  const [atlasFormat, setAtlasFormat] = useState<'png' | 'jpg'>('png');
  const [tileColor, setTileColor] = useState('#ffffff');
  const [depth, setDepth] = useState(0);

  useEffect(function fetchProducts() {
    (async function fetchProductsAsync() {
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
    <div style={{ width: '100vw', height: '100vh', background: '#fff' }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 60 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#ffffff']} />
        <ambientLight intensity={0.3} />

        {products.length > 0 && (
          <ArcturianScene
            products={products}
            shape={shape}
            shapeSize={shapeSize}
            gapFactor={gapFactor}
            tileAspect={tileAspect}
            depth={depth}
            atlasFormat={atlasFormat}
            tileColor={tileColor}
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

        {/* Style Presets */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {[
            { label: 'Flat', depth: 0 },
            { label: 'Cards', depth: 0.05 },
            { label: 'Tiles', depth: 0.3 },
            { label: 'Blocks', depth: 1.0 },
          ].map(p => (
            <button key={p.label} onClick={() => setDepth(p.depth)} style={{
              background: Math.abs(depth - p.depth) < 0.01 ? 'rgba(255,200,50,0.3)' : 'rgba(255,255,255,0.06)',
              border: Math.abs(depth - p.depth) < 0.01 ? '1px solid rgba(255,200,50,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: Math.abs(depth - p.depth) < 0.01 ? '#ffc832' : '#888',
              padding: '5px 10px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Atlas Format Toggle */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {(['png', 'jpg'] as const).map(f => (
            <button key={f} onClick={() => setAtlasFormat(f)} style={{
              background: f === atlasFormat ? 'rgba(107,255,107,0.3)' : 'rgba(255,255,255,0.06)',
              border: f === atlasFormat ? '1px solid rgba(107,255,107,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: f === atlasFormat ? '#6bff6b' : '#888',
              padding: '5px 10px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
            }}>
              {f === 'png' ? 'PNG (Alpha)' : 'JPG (White BG)'}
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
            Depth: {depth.toFixed(3)}
            <input type="range" min="0.001" max="2" step="0.01" value={depth}
              onChange={e => setDepth(Number(e.target.value))}
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
          <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}>
            Tile Color:
            <input type="color" value={tileColor}
              onChange={e => setTileColor(e.target.value)}
              style={{ width: 40, height: 24, border: 'none', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{tileColor}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
