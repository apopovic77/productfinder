/**
 * MultiTierAtlas — 3-Tier Dynamic Texture Atlas System
 *
 * T0: 64×64   tiles (micro overview, all products at startup)
 * T1: 128×128 tiles (browse mode, on-demand)
 * T2: 256×256 tiles (zoom-in detail, on-demand, recycled)
 *
 * Each tier consists of one or more AtlasPage (4096×4096 canvas each).
 * Images are loaded asynchronously and painted into tile slots.
 */
import * as THREE from 'three';
import { STORAGE_API_BASE } from '../../config/apiConfig';

const MAX_CANVAS_SIZE = 4096;

export interface TileSlot {
  pageIndex: number;
  col: number;
  row: number;
  u: number;
  v: number;
  su: number;
  sv: number;
}

class AtlasPage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly capacity: number;

  private _used = 0;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.floor(MAX_CANVAS_SIZE / cellSize);
    this.rows = Math.floor(MAX_CANVAS_SIZE / cellSize);
    this.capacity = this.cols * this.rows;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols * cellSize;
    this.canvas.height = this.rows * cellSize;
    this.ctx = this.canvas.getContext('2d')!;

    // Dark placeholder
    this.ctx.fillStyle = '#12121a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
  }

  get isFull(): boolean { return this._used >= this.capacity; }
  get usedCount(): number { return this._used; }

  allocateSlot(): { localIndex: number; col: number; row: number } | null {
    if (this.isFull) return null;
    const idx = this._used++;
    return {
      localIndex: idx,
      col: idx % this.cols,
      row: Math.floor(idx / this.cols),
    };
  }

  paintImage(col: number, row: number, img: HTMLImageElement): void {
    const x = col * this.cellSize;
    const y = row * this.cellSize;
    this.ctx.clearRect(x, y, this.cellSize, this.cellSize);
    this.ctx.drawImage(img, x, y, this.cellSize, this.cellSize);
    this.texture.needsUpdate = true;
  }

  getUV(col: number, row: number): { u: number; v: number; su: number; sv: number } {
    const su = 1 / this.cols;
    const sv = 1 / this.rows;
    return {
      u: col / this.cols,
      v: 1 - (row / this.rows) - sv,
      su,
      sv,
    };
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export type TierLevel = 0 | 1 | 2;

class AtlasTier {
  readonly level: TierLevel;
  readonly cellSize: number;
  readonly quality: number;
  readonly pages: AtlasPage[] = [];

  // product ID → slot mapping
  private _slotMap = new Map<string, { pageIndex: number; col: number; row: number }>();
  private _loading = new Set<string>();
  private _loaded = new Set<string>();
  private _failed = new Set<string>();

  constructor(level: TierLevel, cellSize: number, quality: number) {
    this.level = level;
    this.cellSize = cellSize;
    this.quality = quality;
    // Start with one page
    this.pages.push(new AtlasPage(cellSize));
  }

  /** Allocate a slot for a product. Returns the slot info. */
  allocateSlot(productId: string): TileSlot | null {
    if (this._slotMap.has(productId)) {
      // Already allocated
      const existing = this._slotMap.get(productId)!;
      const page = this.pages[existing.pageIndex];
      const uv = page.getUV(existing.col, existing.row);
      return { pageIndex: existing.pageIndex, col: existing.col, row: existing.row, ...uv };
    }

    // Find page with space
    for (let pi = 0; pi < this.pages.length; pi++) {
      const slot = this.pages[pi].allocateSlot();
      if (slot) {
        this._slotMap.set(productId, { pageIndex: pi, col: slot.col, row: slot.row });
        const uv = this.pages[pi].getUV(slot.col, slot.row);
        return { pageIndex: pi, col: slot.col, row: slot.row, ...uv };
      }
    }

    // All pages full — create new page
    const newPage = new AtlasPage(this.cellSize);
    const pi = this.pages.length;
    this.pages.push(newPage);
    const slot = newPage.allocateSlot()!;
    this._slotMap.set(productId, { pageIndex: pi, col: slot.col, row: slot.row });
    const uv = newPage.getUV(slot.col, slot.row);
    return { pageIndex: pi, col: slot.col, row: slot.row, ...uv };
  }

  /** Load an image into a product's slot. */
  async loadTile(productId: string, storageId: number, storageApiUrl: string): Promise<boolean> {
    if (this._loading.has(productId) || this._loaded.has(productId)) return false;
    this._loading.add(productId);

    const slotInfo = this._slotMap.get(productId);
    if (!slotInfo) { this._loading.delete(productId); return false; }

    const url = `${storageApiUrl}/storage/media/${storageId}?width=${this.cellSize}&format=webp&quality=${this.quality}&trim=true`;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await img.decode();

      this.pages[slotInfo.pageIndex].paintImage(slotInfo.col, slotInfo.row, img);
      this._loading.delete(productId);
      this._loaded.add(productId);
      this._failed.delete(productId);
      return true;
    } catch {
      this._loading.delete(productId);
      this._failed.add(productId);
      return false;
    }
  }

  isLoaded(productId: string): boolean { return this._loaded.has(productId); }
  isLoading(productId: string): boolean { return this._loading.has(productId); }
  hasSlot(productId: string): boolean { return this._slotMap.has(productId); }

  getSlot(productId: string): TileSlot | null {
    const info = this._slotMap.get(productId);
    if (!info) return null;
    const uv = this.pages[info.pageIndex].getUV(info.col, info.row);
    return { pageIndex: info.pageIndex, col: info.col, row: info.row, ...uv };
  }

  get stats() {
    return {
      level: this.level,
      cellSize: this.cellSize,
      pages: this.pages.length,
      allocated: this._slotMap.size,
      loaded: this._loaded.size,
      loading: this._loading.size,
      failed: this._failed.size,
    };
  }

  dispose(): void {
    for (const page of this.pages) page.dispose();
  }
}

/**
 * MultiTierAtlas
 *
 * Manages three atlas tiers with different resolutions.
 * Products get assigned slots in the appropriate tier based on zoom level.
 */
export class MultiTierAtlas {
  readonly tiers: [AtlasTier, AtlasTier, AtlasTier];
  private _storageApiUrl: string;

  constructor(storageApiUrl?: string) {
    this._storageApiUrl = storageApiUrl ||
      STORAGE_API_BASE;

    this.tiers = [
      new AtlasTier(0, 64, 60),   // T0: micro
      new AtlasTier(1, 128, 75),  // T1: browse
      new AtlasTier(2, 256, 85),  // T2: detail
    ];
  }

  /** Get the primary texture for a tier (first page). */
  getTexture(tier: TierLevel): THREE.CanvasTexture {
    return this.tiers[tier].pages[0].texture;
  }

  /** Get all textures for a tier (multiple pages). */
  getTextures(tier: TierLevel): THREE.CanvasTexture[] {
    return this.tiers[tier].pages.map(p => p.texture);
  }

  /** Allocate a slot and start loading for a product. */
  async loadProduct(productId: string, storageId: number, tier: TierLevel): Promise<TileSlot | null> {
    const t = this.tiers[tier];
    const slot = t.allocateSlot(productId);
    if (!slot) return null;

    if (!t.isLoaded(productId) && !t.isLoading(productId)) {
      t.loadTile(productId, storageId, this._storageApiUrl);
    }

    return slot;
  }

  /** Allocate slot only (no loading). */
  allocateSlot(productId: string, tier: TierLevel): TileSlot | null {
    return this.tiers[tier].allocateSlot(productId);
  }

  /** Get existing slot for a product at a tier. */
  getSlot(productId: string, tier: TierLevel): TileSlot | null {
    return this.tiers[tier].getSlot(productId);
  }

  isLoaded(productId: string, tier: TierLevel): boolean {
    return this.tiers[tier].isLoaded(productId);
  }

  get stats() {
    return this.tiers.map(t => t.stats);
  }

  dispose(): void {
    for (const tier of this.tiers) tier.dispose();
  }
}
