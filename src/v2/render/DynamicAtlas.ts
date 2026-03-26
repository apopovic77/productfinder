import * as THREE from 'three';

/**
 * Dynamic Canvas Atlas for Product Images
 *
 * Builds a texture atlas at runtime on an offscreen canvas.
 * Images are loaded asynchronously and painted into tile slots.
 * Unloaded tiles show a placeholder color.
 */
export class DynamicAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly capacity: number;

  private _loadingTiles = new Set<number>();
  private _loadedTiles = new Set<number>();
  private _failedTiles = new Set<number>();

  constructor(cols: number, rows: number, cellSize: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.capacity = cols * rows;

    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * cellSize;
    this.canvas.height = rows * cellSize;
    this.ctx = this.canvas.getContext('2d')!;

    // Placeholder
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
  }

  /** UV offset + scale for a tile index: [u, v, scaleU, scaleV] */
  getUV(index: number): [number, number, number, number] {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const su = 1 / this.cols;
    const sv = 1 / this.rows;
    return [col / this.cols, 1 - (row / this.rows) - sv, su, sv];
  }

  /** Paint an image into a tile slot (async). */
  async setTile(index: number, imageUrl: string): Promise<boolean> {
    if (index < 0 || index >= this.capacity) return false;
    if (this._loadingTiles.has(index)) return false;

    this._loadingTiles.add(index);
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const x = col * this.cellSize;
    const y = row * this.cellSize;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      await img.decode();

      this.ctx.clearRect(x, y, this.cellSize, this.cellSize);
      this.ctx.drawImage(img, x, y, this.cellSize, this.cellSize);
      this.texture.needsUpdate = true;

      this._loadingTiles.delete(index);
      this._loadedTiles.add(index);
      this._failedTiles.delete(index);
      return true;
    } catch {
      this._loadingTiles.delete(index);
      this._failedTiles.add(index);
      return false;
    }
  }

  isTileLoaded(index: number): boolean { return this._loadedTiles.has(index); }
  isTileLoading(index: number): boolean { return this._loadingTiles.has(index); }
  get loadedCount(): number { return this._loadedTiles.size; }

  dispose(): void { this.texture.dispose(); }
}
