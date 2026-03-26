/**
 * ImageLoadPipeline — Prioritized Async Image Loader
 *
 * Manages image loading across atlas tiers with priority based on
 * screen-space size and distance from viewport center.
 *
 * T0 (64px) loads immediately for all visible products.
 * T1 (128px) loads when screenSize > T1_THRESHOLD.
 * T2 (256px) loads when screenSize > T2_THRESHOLD.
 */
import type { MultiTierAtlas, TierLevel } from './MultiTierAtlas';

const T1_THRESHOLD = 100; // px screen size for T1
const T2_THRESHOLD = 300; // px screen size for T2
const MAX_CONCURRENT = 6;
const SCAN_INTERVAL = 500; // ms

interface ProductVisibility {
  id: string;
  storageId: number;
  screenSize: number; // max(screenWidth, screenHeight) in pixels
}

export class ImageLoadPipeline {
  private _atlas: MultiTierAtlas;
  private _activeLoads = 0;
  private _queue: Array<{ productId: string; storageId: number; tier: TierLevel; priority: number }> = [];
  private _scanInterval: number | null = null;
  private _visibleProducts: ProductVisibility[] = [];

  constructor(atlas: MultiTierAtlas) {
    this._atlas = atlas;
  }

  /** Update which products are visible and their screen sizes. */
  updateVisibility(products: ProductVisibility[]): void {
    this._visibleProducts = products;
  }

  /** Run one scan cycle: determine what needs loading, enqueue. */
  scan(): void {
    this._queue = [];

    for (const p of this._visibleProducts) {
      if (!p.storageId) continue;

      // T0: always load
      if (!this._atlas.isLoaded(p.id, 0)) {
        this._enqueue(p.id, p.storageId, 0, 1000 - p.screenSize);
      }

      // T1: when zoomed in enough
      if (p.screenSize > T1_THRESHOLD && !this._atlas.isLoaded(p.id, 1)) {
        this._enqueue(p.id, p.storageId, 1, 500 - p.screenSize);
      }

      // T2: when zoomed in close
      if (p.screenSize > T2_THRESHOLD && !this._atlas.isLoaded(p.id, 2)) {
        this._enqueue(p.id, p.storageId, 2, 0 - p.screenSize);
      }
    }

    // Sort by priority (lower = higher priority)
    this._queue.sort((a, b) => a.priority - b.priority);

    // Process queue
    this._processQueue();
  }

  /** Start periodic scanning. */
  start(): void {
    if (this._scanInterval) return;
    this._scanInterval = window.setInterval(() => this.scan(), SCAN_INTERVAL);
  }

  /** Stop scanning. */
  stop(): void {
    if (this._scanInterval) {
      clearInterval(this._scanInterval);
      this._scanInterval = null;
    }
  }

  private _enqueue(productId: string, storageId: number, tier: TierLevel, priority: number): void {
    this._queue.push({ productId, storageId, tier, priority });
  }

  private async _processQueue(): Promise<void> {
    while (this._queue.length > 0 && this._activeLoads < MAX_CONCURRENT) {
      const item = this._queue.shift()!;
      this._activeLoads++;

      this._atlas.loadProduct(item.productId, item.storageId, item.tier)
        .finally(() => {
          this._activeLoads--;
        });
    }
  }
}
