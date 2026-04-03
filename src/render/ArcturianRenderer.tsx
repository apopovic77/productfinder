/**
 * ArcturianRenderer — GPU Instanced Renderer for ProductFinder v1
 *
 * Drop-in alternative to CanvasRenderer. Renders the same LayoutNodes
 * from the LayoutEngine but via Arcturian's MorphShader + InstancedMesh.
 *
 * Mounted as a React component that overlays/replaces the Canvas element.
 * Reads LayoutNodes from the controller and writes to GPU buffers.
 */
import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createUniforms, applyShaderToMaterial, MAX_PARTICLES, CameraLight, ClickPicker, SmoothZoomControls, atlasRegistry, LodManager } from '@arcturian';
import { ParticleAnimator } from '@arcturian/core/ParticleAnimator';
import type { FlyTarget } from '@arcturian/core/types';
import type { MorphShaderUniforms } from '@arcturian/core/MorphShader';
import type { LayoutNode } from '../layout/LayoutNode';
import type { Product } from '../types/Product';
import type { GroupHeaderInfo } from '../layout/PivotLayouter';

const ATLAS_ID = 'oneal_pf';

// ============================================================
// 3D Bucket Buttons — text on planes, clickable
// ============================================================
function createTextTexture(text: string, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, width, height);

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(height * 0.45)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), width / 2, height / 2, width - 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function BucketButton({ label, x, y, width, height, onClick }: {
  label: string; x: number; y: number; width: number; height: number; onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const texture = useMemo(() => createTextTexture(label, 512, 128), [label]);
  const [hovered, setHovered] = useState(false);

  return (
    <mesh
      ref={meshRef}
      position={[x + width / 2, -(y + height / 2), 0.1]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        color={hovered ? '#3388ff' : '#ffffff'}
        toneMapped={false}
      />
    </mesh>
  );
}

function BucketButtons({ getHeaders, onBucketClick }: {
  getHeaders: () => GroupHeaderInfo[];
  onBucketClick: (label: string) => void;
}) {
  const [headers, setHeaders] = useState<GroupHeaderInfo[]>([]);

  useFrame(function updateHeaders() {
    const h = getHeaders();
    if (h.length !== headers.length) setHeaders([...h]);
  });

  return (
    <>
      {headers.map(h => (
        <BucketButton
          key={h.key}
          label={h.label}
          x={h.x}
          y={h.y}
          width={h.width}
          height={h.height}
          onClick={() => onBucketClick(h.label)}
        />
      ))}
    </>
  );
}

// ============================================================
// GPU Scene — reads LayoutNodes and renders via InstancedMesh
// ============================================================
function GPUScene({
  getNodes,
  getHeaders,
  productToAtlasIndex,
  flyTargetRef,
  onBucketClick,
  spotlightNodeId,
  animator,
}: {
  getNodes: () => LayoutNode<Product>[];
  getHeaders: () => GroupHeaderInfo[];
  productToAtlasIndex: Map<string, number>;
  flyTargetRef: React.MutableRefObject<FlyTarget>;
  onBucketClick: (label: string) => void;
  spotlightNodeId: string | null;
  animator: ParticleAnimator;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Register atlas in Arcturian AtlasRegistry
  useMemo(function registerAtlas() {
    if (atlasRegistry.has(ATLAS_ID)) atlasRegistry.remove(ATLAS_ID);
    atlasRegistry.register({
      id: ATLAS_ID,
      tileCount: 2603,
      lods: [
        { urls: ['/atlas/64/atlas_0.png'], rows: 64, cols: 64, tilesPerAtlas: 4096 },
        { urls: ['/atlas/128/atlas_0.png', '/atlas/128/atlas_1.png', '/atlas/128/atlas_2.png'], rows: 32, cols: 32, tilesPerAtlas: 1024 },
        { urls: Array.from({ length: 11 }, (_, i) => `/atlas/256/atlas_${i}.png`), rows: 16, cols: 16, tilesPerAtlas: 256 },
      ],
    });
  }, []);

  // Uniforms
  const uniforms = useRef<MorphShaderUniforms>(null!);
  if (!uniforms.current) {
    uniforms.current = createUniforms();
    uniforms.current.uUseAtlas.value = 1.0;
    uniforms.current.uAtlasFaceMode.value = 2.0;
    uniforms.current.uColor1.value.set('#ffffff');
    uniforms.current.uColor2.value.set('#ffffff');
    uniforms.current.uLayoutMix.value = 1.0;
    (uniforms.current as any).uAlphaEnabled.value = 1.0;
    uniforms.current.uLodThreshold.value = 800;
    uniforms.current.uLod2Threshold.value = 300;
  }

  // Load LOD 0 + LOD 1 textures
  useEffect(function loadAtlasTextures() {
    const entry = atlasRegistry.get(ATLAS_ID);
    if (!entry) return;
    const loader = new THREE.TextureLoader();
    const loadTex = (url: string): Promise<THREE.Texture> => new Promise((resolve) => {
      loader.load(url, (t) => {
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        t.generateMipmaps = false;
        resolve(t);
      });
    });

    // LOD 0
    loadTex(entry.lods[0].urls[0]).then(tex => {
      uniforms.current.uAtlasTexture.value = tex;
    });

    // LOD 1
    const lod1 = entry.lods[1];
    const targets = [uniforms.current.uAtlasLod1_0, uniforms.current.uAtlasLod1_1, uniforms.current.uAtlasLod1_2, uniforms.current.uAtlasLod1_3];
    lod1.urls.forEach((url, i) => {
      if (i < 4) {
        loadTex(url).then(tex => {
          targets[i].value = tex;
          uniforms.current.uLodEnabled.value = 1.0;
          uniforms.current.uLod1Cols.value = lod1.cols;
          uniforms.current.uLod1TilesPerAtlas.value = lod1.tilesPerAtlas;
        });
      }
    });
  }, []);

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
    // Add ParticleAnimator uniforms
    Object.assign(shader.uniforms, animator.getUniforms());
  }, [animator]);

  // Write static attributes ONCE (UVs, quaternions)
  const staticWritten = useRef(false);
  const lastNodeCount = useRef(0);

  // Sync LayoutNodes → GPU buffers
  useFrame(function syncBuffers(_, delta) {
    if (delta > 0.05) console.warn(`[Perf] Frame drop: ${(delta*1000).toFixed(0)}ms`);
    const nodes = getNodes();
    if (!nodes || nodes.length === 0) return;

    const count = Math.min(nodes.length, MAX_PARTICLES);
    const aLayout = geometry.getAttribute('aLayout') as THREE.InstancedBufferAttribute;

    // Write static attributes only once or when node count changes
    if (!staticWritten.current || count !== lastNodeCount.current) {
      const aQuaternion = geometry.getAttribute('aQuaternion') as THREE.InstancedBufferAttribute;
      const aTarget = geometry.getAttribute('aTarget') as THREE.InstancedBufferAttribute;
      const aTarget2 = geometry.getAttribute('aTarget2') as THREE.InstancedBufferAttribute;
      const aUVOffset = geometry.getAttribute('aUVOffset') as THREE.InstancedBufferAttribute;

      for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const side = Math.min(node.width.targetValue ?? 0, node.height.targetValue ?? 0);

        aQuaternion.setXYZW(i, 0, 0, 0, 1);
        aTarget.setXYZW(i, side, 1, 0, 0);
        aTarget2.setXYZW(i, 0, side, 0, side);

        const atlasIdx = productToAtlasIndex.get(node.id) ?? 0;
        const lod0Cols = 64;
        const col = atlasIdx % lod0Cols;
        const row = Math.floor(atlasIdx / lod0Cols);
        const su = 1 / lod0Cols;
        aUVOffset.setXYZW(i, col * su, 1 - (row + 1) * su, su, su);
      }

      // Hide remaining
      for (let i = count; i < lastNodeCount.current; i++) {
        aLayout.setXYZW(i, 0, 0, 0, 0);
      }

      aQuaternion.needsUpdate = true;
      aTarget.needsUpdate = true;
      aTarget2.needsUpdate = true;
      aUVOffset.needsUpdate = true;

      lastNodeCount.current = count;
      staticWritten.current = true;
    }

    // Positions update every frame (InterpolatedProperty animates on CPU)
    let dirty = false;
    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      const x = node.posX.value ?? 0;
      const y = -(node.posY.value ?? 0);
      const opacity = node.opacity.value ?? 1;
      const scale = node.scale.value ?? 1;

      const oldX = aLayout.getX(i);
      const oldY = aLayout.getY(i);
      if (Math.abs(x - oldX) > 0.01 || Math.abs(y - oldY) > 0.01) {
        dirty = true;
      }

      aLayout.setXYZW(i, x, y, 0, opacity > 0.01 ? scale : 0);
    }

    if (dirty || !staticWritten.current) {
      aLayout.needsUpdate = true;
    }

    if (meshRef.current) meshRef.current.count = count;

    // uTime for ParticleAnimator
    (uniforms.current as any).uTime.value = performance.now() / 1000;
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[geometry, undefined!, MAX_PARTICLES]} frustumCulled={false}>
        <meshStandardMaterial
          onBeforeCompile={onBeforeCompile}
          roughness={0.8}
          metalness={0.0}
          transparent
          alphaTest={0.01}
        />
      </instancedMesh>
      <CameraLight intensity={2.0} />
      <LodManager meshRef={meshRef} activeAtlasId={ATLAS_ID} particleCount={getNodes().length} uniforms={uniforms.current} />
      <BucketButtons getHeaders={getHeaders} onBucketClick={onBucketClick} />
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
  onBucketClick?: (label: string) => void;
  width: number;
  height: number;
}

// ============================================================
// SmoothMouseCamera — translates camera toward mouse position on product plane
// ============================================================
function SmoothMouseCamera({ enabled, flyTargetRef, onDblClickWorld }: {
  enabled: boolean;
  flyTargetRef: React.MutableRefObject<FlyTarget>;
  onDblClickWorld?: (worldPos: THREE.Vector3) => void;
}) {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)); // z=0 plane
  const targetPos = useRef(new THREE.Vector3());
  const hasTarget = useRef(false);

  const zoomTarget = useRef(camera.position.z);
  const MIN_DIST = 50;
  const MAX_DIST = 5000;

  const dragging = useRef(false);
  const rotating = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const orbitAngles = useRef({ theta: 0, phi: Math.PI / 2 }); // azimuth, polar
  const orbitCenter = useRef(new THREE.Vector3());

  useEffect(function setupMouseListener() {
    if (!enabled) return;
    const canvas = gl.domElement;

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      hasTarget.current = true;

      // Left-click drag → pan camera on product plane
      if (dragging.current) {
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;

        const dist = camera.position.distanceTo(orbitCenter.current);
        const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
        const vFov = (fov * Math.PI) / 180;
        const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
        const pixelToWorld = visibleHeight / canvas.clientHeight;

        // Pan in camera-local right/up directions
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(new THREE.Vector3());
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        up.setFromMatrixColumn(camera.matrixWorld, 1);

        camera.position.addScaledVector(right, -dx * pixelToWorld);
        camera.position.addScaledVector(up, dy * pixelToWorld);
        orbitCenter.current.addScaledVector(right, -dx * pixelToWorld);
        orbitCenter.current.addScaledVector(up, dy * pixelToWorld);
      }

      // Middle-click drag → orbit camera around center
      if (rotating.current) {
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;

        orbitAngles.current.theta -= dx * 0.005;
        orbitAngles.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitAngles.current.phi - dy * 0.005));

        const dist = camera.position.distanceTo(orbitCenter.current);
        const { theta, phi } = orbitAngles.current;
        camera.position.set(
          orbitCenter.current.x + dist * Math.sin(phi) * Math.sin(theta),
          orbitCenter.current.y + dist * Math.cos(phi),
          orbitCenter.current.z + dist * Math.sin(phi) * Math.cos(theta),
        );
        camera.lookAt(orbitCenter.current);
      }

      lastMouse.current = { x: e.clientX, y: e.clientY };
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button === 0) { // left click → pan
        dragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      } else if (e.button === 1) { // middle click → orbit
        e.preventDefault();
        rotating.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'move';
      }
    }

    function onMouseUp() {
      dragging.current = false;
      rotating.current = false;
      canvas.style.cursor = 'default';
    }

    function onContextMenu(e: Event) {
      if (rotating.current) e.preventDefault();
    }

    function onDblClick(e: MouseEvent) {
      if (!onDblClickWorld) return;
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const worldPt = new THREE.Vector3();
      const hit = raycaster.current.ray.intersectPlane(plane.current, worldPt);
      if (hit) onDblClickWorld(worldPt);
    }

    function onMouseLeave() {
      hasTarget.current = false;
      dragging.current = false;
      rotating.current = false;
      canvas.style.cursor = 'default';
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
      zoomTarget.current = Math.max(MIN_DIST, Math.min(MAX_DIST, zoomTarget.current * delta));
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('dblclick', onDblClick);
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }, [enabled, gl, camera]);

  useFrame(function updateSmoothCamera() {
    if (!enabled) return;

    // Fly-to from ClickPicker (double-click)
    const fly = flyTargetRef.current;
    if (fly.active) {
      camera.position.lerp(fly.position, 0.08);
      if (camera.position.distanceTo(fly.position) < 1) {
        fly.active = false;
        zoomTarget.current = camera.position.z;
      }
      return;
    }

    // Zoom: move camera along vector (camera → mouse world pos on plane)
    const currentZ = camera.position.z;
    const dz = zoomTarget.current - currentZ;
    if (Math.abs(dz) > 0.5) {
      // Get mouse world position on product plane
      raycaster.current.setFromCamera(mouse.current, camera);
      const mouseWorld = new THREE.Vector3();
      const hit = raycaster.current.ray.intersectPlane(plane.current, mouseWorld);

      if (hit) {
        // Direction from camera to mouse world pos
        const dir = mouseWorld.clone().sub(camera.position).normalize();

        // Move along that direction (negative dz = zoom in = move toward mouse)
        const step = -dz * 0.1;
        camera.position.addScaledVector(dir, step);
      }
    }
  });

  return null;
}

function CameraSetup({ getNodes, width, height, controlsRef }: {
  getNodes: () => LayoutNode<Product>[];
  width: number;
  height: number;
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  const initialized = useRef(false);

  useFrame(function fitCameraToContent() {
    if (initialized.current) return;
    const nodes = getNodes();
    if (nodes.length === 0) return;
    initialized.current = true;

    // Content bounds in pixel coordinates
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.posX.targetValue ?? 0;
      const y = n.posY.targetValue ?? 0;
      const w = n.width.targetValue ?? 0;
      const h = n.height.targetValue ?? 0;
      if (x < minX) minX = x;
      if (x + w > maxX) maxX = x + w;
      if (y < minY) minY = y;
      if (y + h > maxY) maxY = y + h;
    }

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const centerX = (minX + maxX) / 2;
    const centerY = -(minY + maxY) / 2;

    // Calculate distance to fit content in view
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    const vFov = (fov * Math.PI) / 180;
    const aspect = width / height || 1;
    const distH = contentH / (2 * Math.tan(vFov / 2));
    const distW = contentW / (2 * Math.tan(vFov / 2) * aspect);
    const dist = Math.max(distH, distW) * 1.1;

    camera.position.set(centerX, centerY, dist);
    camera.lookAt(centerX, centerY, 0);
    camera.updateProjectionMatrix();

    // Update OrbitControls target to content center
    if (controlsRef.current) {
      controlsRef.current.target.set(centerX, centerY, 0);
      controlsRef.current.update();
    }
  });

  return null;
}

export function ArcturianRendererComponent({
  getNodes, getHeaders, productToAtlasIndex, onBucketClick, width, height,
}: ArcturianRendererProps) {
  const controlsRef = useRef<any>(null);
  const flyTargetRef = useRef<FlyTarget>({ active: false, position: new THREE.Vector3(), lookAt: new THREE.Vector3() });
  const [spotlightNodeId, setSpotlightNodeId] = useState<string | null>(null);
  const animator = useMemo(() => new ParticleAnimator(), []);

  return (
    <Canvas
      camera={{ position: [0, 0, 1000], fov: 60, near: 1, far: 10000 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    >
      <color attach="background" args={['#ffffff']} />
      <ambientLight intensity={0.8} />

      <CameraSetup getNodes={getNodes} width={width} height={height} controlsRef={controlsRef} />

      <GPUScene
        getNodes={getNodes}
        getHeaders={getHeaders}
        productToAtlasIndex={productToAtlasIndex}
        flyTargetRef={flyTargetRef}
        onBucketClick={onBucketClick || (() => {})}
        spotlightNodeId={spotlightNodeId}
        animator={animator}
      />

      <SmoothMouseCamera
        enabled
        flyTargetRef={flyTargetRef}
        onDblClickWorld={(worldPos) => {
          const nodes = getNodes();
          let bestIdx = -1;
          let bestDist = Infinity;
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const nx = (n.posX.value ?? 0) + (n.width.value ?? 0) / 2;
            const ny = -(n.posY.value ?? 0) - (n.height.value ?? 0) / 2;
            const dx = worldPos.x - nx;
            const dy = worldPos.y - ny;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
          if (bestIdx >= 0) {
            const n = nodes[bestIdx];
            const nx = (n.posX.value ?? 0) + (n.width.value ?? 0) / 2;
            const ny = -(n.posY.value ?? 0) - (n.height.value ?? 0) / 2;
            const side = Math.min(n.width.value ?? 60, n.height.value ?? 60);

            // Fly camera to product
            flyTargetRef.current.active = true;
            flyTargetRef.current.position.set(nx, ny, side * 3);
            flyTargetRef.current.lookAt.set(nx, ny, 0);

            // Particle animation (when shader supports it)
            const currentTime = performance.now() / 1000;
            const alreadyAnimated = spotlightNodeId === n.id;
            if (alreadyAnimated) {
              animator.resetParticle(bestIdx);
              setSpotlightNodeId(null);
            } else {
              if (spotlightNodeId) {
                const prevIdx = nodes.findIndex(nd => nd.id === spotlightNodeId);
                if (prevIdx >= 0) animator.resetParticle(prevIdx);
              }
              animator.animateParticle(bestIdx, currentTime, {
                targetOffset: { x: 0, y: 0, z: 5 },
                duration: 1.0,
              });
              setSpotlightNodeId(n.id);
            }
          }
        }}
      />
    </Canvas>
  );
}
