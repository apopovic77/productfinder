import * as THREE from 'three';
import { buildMediaUrl } from '../utils/MediaUrlBuilder';

/**
 * ProductAtlas — runtime texture atlas for the GPU grid (issue #260).
 *
 * Replaces the prebuilt /atlas/{64,128,256}/atlas_N.png files the Arcturian
 * renderer used to load: those were 30 MB for two files, covered 2,603 of
 * the products at build time, and thirteen of the fifteen expected files
 * did not exist at all — the web server answered 200 + index.html and the
 * renderer textured helmets with an HTML page without complaining.
 *
 * The atlas lives on the GPU and is filled tile by tile as products become
 * visible. It grows with the catalog because it never has to be rebuilt:
 * a product gets a slot the first time it is asked for, and the slot is
 * uploaded when the storage image arrives.
 *
 * Upload strategy — the part that decides whether this is fast or useless:
 * the atlas is a 8192² RGBA texture, 256 MB. Re-uploading it whole for
 * every loaded image (what a CanvasTexture with needsUpdate does) cost a
 * full texture transfer per product; under a software rasteriser that was
 * one frame per second, and on a phone it would throttle the first paint
 * to the speed of the memory bus. Instead each tile is uploaded alone with
 * texSubImage2D (three: copyTextureToTexture with dstPosition), 64 KB each.
 * The big texture is allocated once, empty.
 *
 * Also unlike the v2 DynamicAtlas: aspect ratio is preserved (helmets are
 * wider than tall, boots taller than wide — drawImage into a square
 * stretched both), and loading is prioritised by a caller-supplied order
 * so visible tiles arrive first.
 */

export const ATLAS_COLS = 64;
export const ATLAS_ROWS = 64;
export const ATLAS_CELL = 128; // px — 8192² texture, inside every WebGL2 limit incl. iOS
export const ATLAS_CAPACITY = ATLAS_COLS * ATLAS_ROWS; // 4096; catalog has ~2,650 products with images

const MAX_CONCURRENT_LOADS = 12;

type SlotState = 'empty' | 'loading' | 'painted' | 'ready' | 'failed';

export class ProductAtlas {
  /** The GPU atlas. Allocated empty; tiles are sub-uploaded into it. */
  readonly texture: THREE.DataTexture;

  private slotByProduct = new Map<string, number>();
  private state: SlotState[] = new Array(ATLAS_CAPACITY).fill('empty');
  private nextSlot = 0;

  private queue: { productId: string; storageId: number; priority: number }[] = [];
  private queued = new Set<string>();
  private queueDirty = false;
  private inFlight = 0;

  /** Tiles painted to their scratch canvas and waiting for a GPU upload. */
  private pendingUploads: { slot: number; tex: THREE.CanvasTexture }[] = [];

  constructor() {
    // Zero-filled = fully transparent: an unloaded product is invisible
    // rather than a coloured placeholder block, matching the Canvas2D grid.
    const data = new Uint8Array(ATLAS_COLS * ATLAS_CELL * ATLAS_ROWS * ATLAS_CELL * 4);
    this.texture = new THREE.DataTexture(data, ATLAS_COLS * ATLAS_CELL, ATLAS_ROWS * ATLAS_CELL, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false; // DataTexture: row 0 is the BOTTOM of the texture
    this.texture.needsUpdate = true; // one full upload, of zeros, at creation
  }

  /** Slot for a product, allocating one on first use. -1 when the atlas is full. */
  slotFor(productId: string): number {
    const existing = this.slotByProduct.get(productId);
    if (existing !== undefined) return existing;
    if (this.nextSlot >= ATLAS_CAPACITY) return -1;
    const slot = this.nextSlot++;
    this.slotByProduct.set(productId, slot);
    return slot;
  }

  /**
   * UV rect for a slot as [u, v, w, h]. With flipY=false, texture v=0 is the
   * first pixel row we upload, so slot rows map straight to v without a flip.
   */
  uvFor(slot: number): [number, number, number, number] {
    const col = slot % ATLAS_COLS;
    const row = Math.floor(slot / ATLAS_COLS);
    const w = 1 / ATLAS_COLS;
    const h = 1 / ATLAS_ROWS;
    return [col * w, row * h, w, h];
  }

  isReady(productId: string): boolean {
    const slot = this.slotByProduct.get(productId);
    return slot !== undefined && this.state[slot] === 'ready';
  }

  /**
   * Ask for a product image. Lower priority number loads first; callers pass
   * e.g. distance from the viewport centre so visible tiles arrive before
   * off-screen ones. Safe to call every frame — duplicates are ignored.
   */
  request(productId: string, storageId: number, priority = 0): void {
    const slot = this.slotFor(productId);
    if (slot < 0) return;
    if (this.state[slot] !== 'empty') return;
    if (this.queued.has(productId)) return; // priority fixed at first request; cheap and good enough
    this.queued.add(productId);
    this.queue.push({ productId, storageId, priority });
    this.queueDirty = true;
  }

  /**
   * Call once per frame with the renderer. Starts pending loads (most urgent
   * first) and sub-uploads every tile that finished since the last frame.
   */
  tick(gl: THREE.WebGLRenderer): void {
    if (this.inFlight < MAX_CONCURRENT_LOADS && this.queue.length) {
      if (this.queueDirty) { this.queue.sort((a, b) => a.priority - b.priority); this.queueDirty = false; }
      while (this.inFlight < MAX_CONCURRENT_LOADS && this.queue.length) {
        const job = this.queue.shift()!;
        this.queued.delete(job.productId);
        void this.load(job.productId, job.storageId);
      }
    }
    if (this.pendingUploads.length) {
      const uploads = this.pendingUploads;
      this.pendingUploads = [];
      for (const { slot, tex } of uploads) {
        const col = slot % ATLAS_COLS;
        const row = Math.floor(slot / ATLAS_COLS);
        // 64 KB sub-upload at the slot's pixel origin; no full re-upload.
        gl.copyTextureToTexture(tex, this.texture, null, new THREE.Vector2(col * ATLAS_CELL, row * ATLAS_CELL));
        tex.dispose();
        this.state[slot] = 'ready';
      }
    }
  }

  private async load(productId: string, storageId: number): Promise<void> {
    const slot = this.slotByProduct.get(productId);
    if (slot === undefined || this.state[slot] !== 'empty') return;
    this.state[slot] = 'loading';
    this.inFlight++;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      // Cell-sized request; the storage service derives it from the master.
      img.src = buildMediaUrl({ storageId, width: ATLAS_CELL, quality: 80 });
      // onload, not decode(): decode() on a detached image can stay pending
      // in Chromium. A hard timeout keeps one stuck image from starving the queue.
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 15000);
        img.onload = () => { clearTimeout(t); resolve(); };
        img.onerror = () => { clearTimeout(t); reject(new Error('load error')); };
        if (img.complete && img.naturalWidth > 0) { clearTimeout(t); resolve(); }
      });
      this.pendingUploads.push({ slot, tex: this.paintTile(img) });
      this.state[slot] = 'painted';
    } catch {
      this.state[slot] = 'failed';
    } finally {
      this.inFlight--;
    }
  }

  /** Fit the image into a cell-sized scratch canvas, centred, aspect preserved, 4 px inset. */
  private paintTile(img: HTMLImageElement): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = ATLAS_CELL;
    c.height = ATLAS_CELL;
    const ctx = c.getContext('2d')!;
    const inset = 4;
    const box = ATLAS_CELL - inset * 2;
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const scale = Math.min(box / iw, box / ih);
    const dw = Math.max(1, Math.round(iw * scale));
    const dh = Math.max(1, Math.round(ih * scale));
    ctx.drawImage(img, inset + Math.round((box - dw) / 2), inset + Math.round((box - dh) / 2), dw, dh);
    const tex = new THREE.CanvasTexture(c);
    // Must match the destination: same orientation, same colour handling.
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    return tex;
  }

  get readyCount(): number {
    let n = 0;
    for (const s of this.state) if (s === 'ready') n++;
    return n;
  }

  dispose(): void {
    this.texture.dispose();
    for (const u of this.pendingUploads) u.tex.dispose();
    this.pendingUploads = [];
    this.queue = [];
    this.queued.clear();
  }
}
