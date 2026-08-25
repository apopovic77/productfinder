import { useEffect, useRef, useState } from 'react';
import { WEB_THUMBNAIL_WARMUP } from '../config/imagePresets';
import { fetchProducts } from '../data/ProductRepository';
import { backgroundImageQueue, globalImageQueue } from '../utils/GlobalImageQueue';
import { buildThumbnailUrl } from '../utils/MediaUrlBuilder';
import { imageCache } from '../utils/IndexedDBImageCache';
import type { CatalogEntrySelection } from '../config/CatalogEntryConfig';
import { filterCatalogProducts } from '../utils/catalogEntry';

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForForegroundIdle(): Promise<void> {
  while (true) {
    const { active, queued } = globalImageQueue.getStats();
    if (active === 0 && queued === 0) return;
    await wait(250);
  }
}

/**
 * Fill the remainder of the persistent thumbnail cache without delaying the
 * first interactive render. All work goes through the shared queue at a lower
 * priority than visible images and LOD upgrades.
 */
async function warmRemainingThumbnails(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await wait(WEB_THUMBNAIL_WARMUP.backgroundStartDelayMs);

  for (let start = 0; start < urls.length; start += WEB_THUMBNAIL_WARMUP.backgroundBatchSize) {
    // Background warming is optional. Never start a new batch while the
    // foreground still has visible work after first paint or a later pan.
    await waitForForegroundIdle();
    const batch = urls.slice(start, start + WEB_THUMBNAIL_WARMUP.backgroundBatchSize);
    const cached = await Promise.all(batch.map((url) => imageCache.get(url)));

    for (let index = 0; index < batch.length; index++) {
      if (cached[index]) continue;
      const url = batch[index];
      void backgroundImageQueue.add({
        id: `background-prewarm-${start + index}`,
        url,
        group: 'background-prewarm',
        priority: WEB_THUMBNAIL_WARMUP.backgroundPriority,
      }).catch(() => undefined);
    }

    // Yield regularly so cache inspection/enqueueing never monopolizes the UI.
    await wait(WEB_THUMBNAIL_WARMUP.backgroundBatchDelayMs);
  }
}

/**
 * Loads the catalog contract for the splash screen, then warms thumbnails
 * opportunistically in a separate low-concurrency pool. No image is allowed
 * to block the first interactive Canvas render: the Canvas owns foreground
 * order because it is the only component that knows what is actually visible.
 */
export function useProductPreloader(brand: string | null, entrySelection: CatalogEntrySelection | null) {
  const hasStarted = useRef(false);
  const [state, setState] = useState({
    isLoading: true,
    progress: 0,
    loaded: 0,
    total: 0,
  });

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function preloadToIndexedDB() {
      try {
        const catalogProducts = await fetchProducts({ limit: 10000, brand: brand ?? undefined });
        const products = entrySelection ? filterCatalogProducts(catalogProducts, entrySelection) : catalogProducts;

        // Build URL list
        const urlSet = new Set<string>();
        for (const product of products) {
          const storageId = product.primaryImage?.storage_id;
          if (!storageId) continue;
          // Must be byte-identical to Product.imageUrl/LOD low tier. IndexedDB
          // uses the complete URL as its key, so a 130px preload cannot warm a
          // later 180px grid request (issue #841).
          urlSet.add(buildThumbnailUrl(storageId));
        }

        const urls = Array.from(urlSet);
        const total = products.length;
        setState({ isLoading: false, progress: 100, loaded: total, total });
        console.log(`[Preloader] Catalog ready; ${urls.length} thumbnails scheduled after first paint`);
        void warmRemainingThumbnails(urls);

      } catch (error) {
        console.error('[Preloader] Failed:', error);
        setState(s => ({ ...s, isLoading: false, progress: 100 }));
      }
    }

    preloadToIndexedDB();
  }, [brand, entrySelection?.sportId, entrySelection?.categoryId]);

  return state;
}
