import * as THREE from 'three';
import type { DynamicAtlas } from './DynamicAtlas';

/**
 * Bridges PivotLayouter output → GPU instanced attributes.
 */
export interface LayoutItem {
  id: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  opacity: number;
  atlasIndex: number;
  storageId?: number;
}

export class PivotLayoutAdapter {
  private _capacity: number;
  private _count = 0;

  readonly layoutAttr: THREE.InstancedBufferAttribute;
  readonly oldLayoutAttr: THREE.InstancedBufferAttribute;
  readonly targetAttr: THREE.InstancedBufferAttribute;
  readonly oldTargetAttr: THREE.InstancedBufferAttribute;
  readonly uvOffsetAttr: THREE.InstancedBufferAttribute;
  readonly opacityAttr: THREE.InstancedBufferAttribute;
  readonly animOffsetAttr: THREE.InstancedBufferAttribute;

  // CPU cache for hit testing
  private _positions: Float32Array;
  private _sizes: Float32Array;
  private _ids: string[] = [];

  constructor(capacity: number) {
    this._capacity = capacity;
    this.layoutAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.oldLayoutAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.targetAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.oldTargetAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.uvOffsetAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.opacityAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.animOffsetAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this._positions = new Float32Array(capacity * 2);
    this._sizes = new Float32Array(capacity * 2);
  }

  get count(): number { return this._count; }
  get capacity(): number { return this._capacity; }

  /** Apply new layout. Copies current → old for smooth transition. */
  applyLayout(items: LayoutItem[], atlas: DynamicAtlas, clickOrigin?: { x: number; y: number }): void {
    const layoutArr = this.layoutAttr.array as Float32Array;
    const oldLayoutArr = this.oldLayoutAttr.array as Float32Array;
    const targetArr = this.targetAttr.array as Float32Array;
    const oldTargetArr = this.oldTargetAttr.array as Float32Array;
    const uvArr = this.uvOffsetAttr.array as Float32Array;
    const opacityArr = this.opacityAttr.array as Float32Array;
    const animArr = this.animOffsetAttr.array as Float32Array;

    // Current → old for transition
    oldLayoutArr.set(layoutArr);
    oldTargetArr.set(targetArr);

    this._count = Math.min(items.length, this._capacity);
    this._ids = [];

    for (let i = 0; i < this._count; i++) {
      const item = items[i];
      const i4 = i * 4;
      const i2 = i * 2;

      // aLayout: position.xy, z=0, scale=1
      layoutArr[i4] = item.posX;
      layoutArr[i4 + 1] = item.posY;
      layoutArr[i4 + 2] = 0;
      layoutArr[i4 + 3] = 1.0;

      // aTarget: sizeX, sizeY, 0, 0
      targetArr[i4] = item.width;
      targetArr[i4 + 1] = item.height;

      // aUVOffset from atlas
      const [u, v, su, sv] = atlas.getUV(item.atlasIndex);
      uvArr[i4] = u;
      uvArr[i4 + 1] = v;
      uvArr[i4 + 2] = su;
      uvArr[i4 + 3] = sv;

      opacityArr[i] = item.opacity;

      // Stagger: wave from click origin
      if (clickOrigin) {
        const dx = item.posX - clickOrigin.x;
        const dy = item.posY - clickOrigin.y;
        animArr[i] = Math.min(0.7, Math.sqrt(dx * dx + dy * dy) * 0.002);
      } else {
        animArr[i] = 0;
      }

      // CPU cache
      this._positions[i2] = item.posX;
      this._positions[i2 + 1] = item.posY;
      this._sizes[i2] = item.width;
      this._sizes[i2 + 1] = item.height;
      this._ids.push(item.id);
    }

    // Hide remaining
    for (let i = this._count; i < this._capacity; i++) {
      layoutArr[i * 4 + 3] = 0;
      opacityArr[i] = 0;
    }

    this.layoutAttr.needsUpdate = true;
    this.oldLayoutAttr.needsUpdate = true;
    this.targetAttr.needsUpdate = true;
    this.oldTargetAttr.needsUpdate = true;
    this.uvOffsetAttr.needsUpdate = true;
    this.opacityAttr.needsUpdate = true;
    this.animOffsetAttr.needsUpdate = true;
  }

  /** Screen-space hit test. Returns item ID or null. */
  hitTest(
    mouseX: number, mouseY: number,
    camera: THREE.OrthographicCamera,
    canvasWidth: number, canvasHeight: number
  ): string | null {
    const projected = new THREE.Vector3();
    for (let i = 0; i < this._count; i++) {
      const i2 = i * 2;
      const w = this._sizes[i2], h = this._sizes[i2 + 1];
      projected.set(this._positions[i2] + w / 2, this._positions[i2 + 1] - h / 2, 0);
      projected.project(camera);
      const sx = (projected.x + 1) / 2 * canvasWidth;
      const sy = (1 - projected.y) / 2 * canvasHeight;
      const hw = w * camera.zoom / 2;
      const hh = h * camera.zoom / 2;
      if (Math.abs(mouseX - sx) < hw && Math.abs(mouseY - sy) < hh) {
        return this._ids[i];
      }
    }
    return null;
  }

  getIndexById(id: string): number { return this._ids.indexOf(id); }
}
