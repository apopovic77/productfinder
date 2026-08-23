/**
 * ArcturianRenderer — GPU grid renderer for the ProductFinder (issue #260).
 *
 * A drawing backend only. It reads the same LayoutNodes the Canvas2D
 * renderer reads and mirrors the same ViewportTransform — so zoom, pinch,
 * pan, bounds clamping, hit-testing and the pivot engine stay exactly
 * where they are. The hidden <canvas> keeps receiving every pointer event;
 * this component just paints what that state says.
 *
 * Why this shape (owner decision 2026-08-15, refined 2026-08-23):
 *  - Canvas2D cannot be sharp AND smooth on mobile: at devicePixelRatio 3
 *    it has to fill 9x the pixels for ~2,600 drawImage calls per frame.
 *    One instanced draw call does not care how many pixels a tile covers.
 *  - The previous GPU path had its own 3D camera (perspective, orbit,
 *    middle-drag). That would have meant rebuilding pinch and bounds
 *    checking a second time. An orthographic camera driven by the existing
 *    2D transform (screen = world * scale + offset) is an exact mirror.
 *  - Product images are flat. The old path drew lit BoxGeometry cubes;
 *    unlit quads are what the Canvas2D grid shows and cost a fraction.
 *
 * Images come from ProductAtlas, built at runtime from the catalog, so the
 * atlas grows with the product set instead of being baked at build time.
 */
import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LayoutNode } from '../layout/LayoutNode';
import type { Product } from '../types/Product';
import type { ViewportTransform } from '../utils/ViewportTransform';
import { ProductAtlas } from './ProductAtlas';

export interface ArcturianRendererProps {
  getNodes: () => LayoutNode<Product>[];
  /** The transform the Canvas2D grid and all input handlers use. */
  getViewport: () => ViewportTransform | null;
  /** CSS size of the stage; read per frame so resizes and rotation just work. */
  getSize: () => { width: number; height: number };
}

// Hard cap for the instance buffers; catalog is ~6,400 products.
const MAX_INSTANCES = 8192;

const VERT = /* glsl */ `
  attribute vec4 aRect;      // x, y (world, top-left), w, h
  attribute vec4 aUV;        // u, v, w, h in atlas space
  attribute float aOpacity;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    // Unit quad in [0,1]² → world rect. Y is flipped because layout space
    // grows downward (screen-like) while GL grows upward.
    vec2 p = aRect.xy + position.xy * aRect.zw;
    vUv = aUV.xy + vec2(uv.x, uv.y) * aUV.zw;
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p.x, -p.y, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    vec4 c = texture2D(uAtlas, vUv);
    if (c.a < 0.02) discard;
    gl_FragColor = vec4(c.rgb, c.a * vOpacity);
  }
`;

function GridScene({ getNodes, getViewport, getSize }: ArcturianRendererProps) {
  const { camera, gl } = useThree();
  const atlas = useMemo(() => new ProductAtlas(), []);
  useEffect(() => () => atlas.dispose(), [atlas]);

  // Unit quad with instanced attributes. position is [0,1]² so the vertex
  // shader can place it with a top-left origin like the layout engine.
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    // Tile row 0 is uploaded first = texture v 0; world y grows downward and
    // position.y 0 is the tile's top edge, so v follows position.y directly.
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aRect', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4));
    g.setAttribute('aUV', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4));
    g.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    return g;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uAtlas: { value: atlas.texture } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // The vertex shader negates Y, which reverses the winding of the unit
    // quad: every instance faces away from the camera and default FrontSide
    // culling drops all of them. Two-sided is the honest setting for a flat
    // sprite anyway.
    side: THREE.DoubleSide,
  }), [atlas]);

  // Built imperatively: through the JSX reconciler the element arrived as a
  // plain Mesh with zero compiled programs (measured: scene child
  // "Mesh:ShaderMaterial", gl.info.programs.length === 0) and nothing was
  // ever drawn. A real InstancedMesh handed to <primitive> sidesteps that.
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    // Our shader places instances via aRect; the instance matrices must be
    // identity, not the zero-initialised default that collapses every vertex.
    const id = new THREE.Matrix4();
    for (let i = 0; i < MAX_INSTANCES; i++) m.setMatrixAt(i, id);
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }, [geometry, material]);
  const meshRef = useRef<THREE.InstancedMesh>(mesh);
  meshRef.current = mesh;
  const lastSize = useRef({ w: 0, h: 0 });

  useFrame(function drawGrid() {
    const vp = getViewport();
    const nodes = getNodes();
    if (!vp || !nodes) return;
    const { width, height } = getSize();
    if (lastSize.current.w !== width || lastSize.current.h !== height) {
      gl.setSize(width, height, false);
      lastSize.current = { w: width, h: height };
    }

    // The transform is not passive: update() runs the rubber-band clamp and
    // the zoom/pan interpolation every frame. CanvasRenderer called it from
    // its own loop; without it here the camera sat at offset 0/0 while the
    // Canvas2D grid had already been pulled into view (measured: oy 0 vs 861).
    vp.update();

    // ---- camera mirrors the 2D transform exactly --------------------------
    // Canvas2D: screen = world * scale + offset. An orthographic camera that
    // shows the world rect [(-offset)/scale, (-offset + css)/scale] produces
    // the same picture. Y negated because the vertex shader flips it.
    const cam = camera as THREE.OrthographicCamera;
    // R3F re-applies left/right/top/bottom from the canvas size (centred at
    // the origin) on every size change unless the camera is marked manual —
    // which silently replaced this frustum and left the grid off-screen.
    cam.manual = true;
    const s = vp.scale || 1;
    const left = -vp.offset.x / s;
    const top = -vp.offset.y / s;
    cam.left = left;
    cam.right = left + width / s;
    cam.top = -top;
    cam.bottom = -(top + height / s);
    cam.near = -10;
    cam.far = 10;
    cam.updateProjectionMatrix();

    // ---- instances ---------------------------------------------------------
    const aRect = geometry.getAttribute('aRect') as THREE.InstancedBufferAttribute;
    const aUV = geometry.getAttribute('aUV') as THREE.InstancedBufferAttribute;
    const aOpacity = geometry.getAttribute('aOpacity') as THREE.InstancedBufferAttribute;

    const viewL = left, viewT = top, viewR = left + width / s, viewB = top + height / s;
    const cx = (viewL + viewR) / 2, cy = (viewT + viewB) / 2;

    let count = 0;
    for (let i = 0; i < nodes.length && count < MAX_INSTANCES; i++) {
      const node = nodes[i];
      const opacity = node.opacity.value ?? 1;
      if (opacity <= 0.01) continue;
      const w = (node.width.value ?? 0) * (node.scale.value ?? 1);
      const h = (node.height.value ?? 0) * (node.scale.value ?? 1);
      if (w <= 0 || h <= 0) continue;
      // heroOffsetX is the card-fan spread when a product is selected;
      // Canvas2D adds it the same way (CanvasRenderer product loop).
      const x = (node.posX.value ?? 0) + ((node as any).heroOffsetX?.value ?? 0);
      const y = node.posY.value ?? 0;

      // Request the image; visible tiles first, nearer to centre first.
      const storageId = node.data?.primaryImage?.storage_id;
      if (!storageId) continue;
      const inView = x + w >= viewL && x <= viewR && y + h >= viewT && y <= viewB;
      const dist = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      atlas.request(node.id, storageId, inView ? dist : 1e9 + dist);
      if (!atlas.isReady(node.id)) continue;

      const slot = atlas.slotFor(node.id);
      const [u, v, uw, uh] = atlas.uvFor(slot);
      aRect.setXYZW(count, x, y, w, h);
      aUV.setXYZW(count, u, v, uw, uh);
      aOpacity.setX(count, opacity);
      count++;
    }

    aRect.needsUpdate = true;
    aUV.needsUpdate = true;
    aOpacity.needsUpdate = true;
    if (meshRef.current) meshRef.current.count = count;

    atlas.tick(gl);
  });

  return (
    <primitive object={mesh} />
  );
}

export function ArcturianRendererComponent(props: ArcturianRendererProps) {
  // Track the input canvas' box so the GL layer sits exactly underneath it,
  // insets included. Read once per animation frame — cheap, and it follows
  // sidebar toggles without a resize listener.
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const sync = () => {
      const host = hostRef.current;
      const input = host?.parentElement?.querySelector('canvas.pf-canvas') as HTMLElement | null;
      if (host && input) {
        const cs = getComputedStyle(input);
        host.style.left = cs.left; host.style.top = cs.top;
        host.style.width = `${input.clientWidth}px`; host.style.height = `${input.clientHeight}px`;
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={hostRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1 }}>
      <Canvas
        orthographic
        // Sharp on phones: that is the whole point of the GPU path. Capped at
        // 3 to stay inside the 8192² atlas budget on the largest iPads.
        dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3)}
        gl={{ alpha: true, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        style={{ background: 'transparent' }}
        frameloop="always"
      >
        <GridScene {...props} />
      </Canvas>
    </div>
  );
}
