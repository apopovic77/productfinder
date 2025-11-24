import { loadShopifyConfig } from './config';
import { ShopifyClient } from './ShopifyClient';
import { ProductNormalizer } from './ProductNormalizer';
import { MediaSyncService } from './MediaSyncService';
import { ProductRepository } from './ProductRepository';
import type { ProductData } from '../../src/types/Product';

export interface SyncStats {
  products: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export class SyncOrchestrator {
  private readonly client: ShopifyClient;
  private readonly normalizer: ProductNormalizer;
  private readonly mediaService: MediaSyncService;
  private readonly repository: ProductRepository;

  constructor() {
    const config = loadShopifyConfig();
    this.client = new ShopifyClient(config);
    this.normalizer = new ProductNormalizer();
    this.mediaService = new MediaSyncService();
    this.repository = new ProductRepository();
  }

  async runFullSync(): Promise<SyncStats> {
    const startedAt = new Date();
    const products: ProductData[] = [];

    let cursor: string | undefined;
    let pageIndex = 0;

    do {
      pageIndex += 1;
      const page = await this.client.fetchProductsPage(cursor);
      for (const edge of page.edges) {
        const normalized = this.normalizer.normalize(edge.node);
        await this.attachMediaStorageIds(normalized);
        products.push(normalized);
      }
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor ?? undefined : undefined;
      this.log(`Fetched page ${pageIndex}, total products: ${products.length}`);
    } while (cursor);

    this.log('Saving normalized products to repository…');
    await this.repository.save(products);
    this.mediaService.saveCache();

    const finishedAt = new Date();
    return {
      products: products.length,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  }

  private async attachMediaStorageIds(product: ProductData): Promise<void> {
    if (!product.media?.length) return;

    const queue = [...product.media];
    const concurrency = 5;
    const workers: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i += 1) {
      workers.push((async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item?.src) continue;
          const storageId = await this.mediaService.ensureStorageId(item.src);
          if (storageId) {
            item.storage_id = storageId;
          }
        }
      })());
    }

    await Promise.all(workers);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[ShopifySync ${timestamp}] ${message}`);
  }
}

