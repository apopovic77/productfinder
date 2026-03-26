/**
 * useBucketProjection — Projects bucket header positions to screen space
 *
 * Runs inside the R3F Canvas and updates the store with screen positions.
 * The HTML overlay layer reads these positions from the store.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useProductFinderStore } from '../store/useProductFinderStore';

export interface ScreenBucketHeader {
  key: string;
  label: string;
  screenX: number;
  screenY: number;
  screenWidth: number;
  visible: boolean;
}

// Store projected headers in a module-level ref (avoids re-renders)
let _projectedHeaders: ScreenBucketHeader[] = [];
let _onUpdate: ((headers: ScreenBucketHeader[]) => void) | null = null;

export function setProjectionCallback(cb: (headers: ScreenBucketHeader[]) => void) {
  _onUpdate = cb;
}

export function getProjectedHeaders(): ScreenBucketHeader[] {
  return _projectedHeaders;
}

/** Must be used inside <Canvas> */
export function BucketProjector() {
  const { camera, gl } = useThree();
  const service = useProductFinderStore(s => s._service);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 6 !== 0) return;

    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const groupHeaders = service.getGroupHeaders();

    const canvas = gl.domElement;
    const projected = new THREE.Vector3();
    const results: ScreenBucketHeader[] = [];

    for (const header of groupHeaders) {
      projected.set(header.x + header.width / 2, -(header.y + header.height / 2), 0);
      projected.project(camera);

      const sx = (projected.x + 1) / 2 * canvas.clientWidth;
      const sy = (1 - projected.y) / 2 * canvas.clientHeight;
      const sw = header.width * camera.zoom;

      results.push({
        key: header.key,
        label: header.label,
        screenX: sx,
        screenY: sy,
        screenWidth: sw,
        visible: sx > -200 && sx < canvas.clientWidth + 200 && sy > -100 && sy < canvas.clientHeight + 100,
      });
    }

    _projectedHeaders = results;
    _onUpdate?.(results);
  });

  return null;
}
