import { useEffect, useRef, useState } from 'react';
import { WEB_THUMBNAIL_WARMUP } from '../config/imagePresets';
import { fetchProducts } from '../data/ProductRepository';
import { globalImageQueue } from '../utils/GlobalImageQueue';
import { buildThumbnailUrl } from '../utils/MediaUrlBuilder';
import { imageCache } from '../utils/IndexedDBImageCache';

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/**
 * Fill the remainder of the persistent thumbnail cache without delaying the
 * first interactive render. All work goes through the shared queue at a lower
 * priority than visible images and LOD upgrades.
 */
async function warmRemainingThumbnails(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await wait(WEB_THUMBNAIL_WARMUP.backgroundStartDelayMs);

  for (let start = 0; start < urls.length; start += WEB_THUMBNAIL_WARMUP.backgroundBatchSize) {
    const batch = urls.slice(start, start + WEB_THUMBNAIL_WARMUP.backgroundBatchSize);
    const cached = await Promise.all(batch.map((url) => imageCache.get(url)));

    for (let index = 0; index < batch.length; index++) {
      if (cached[index]) continue;
      const url = batch[index];
      void globalImageQueue.add({
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
 * Preloads a bounded startup window directly into IndexedDB, then warms the
 * remaining product thumbnails in the background through the shared queue.
 *
 * When the CanvasRenderer later requests images via ImageLoadQueue,
 * they're instant cache HITs — no network wait, no placeholders.
 */
export function useProductPreloader() {
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
        const startTime = performance.now();
        const products = await fetchProducts({ limit: 10000 }); // API max; catalog has 6310+ products (issue #250)

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
        const startupUrls = urls.slice(0, WEB_THUMBNAIL_WARMUP.blockingCount);
        const backgroundUrls = urls.slice(startupUrls.length);
        const total = startupUrls.length;
        setState(s => ({ ...s, total }));

        // Check the startup window — parallel in chunks so the UI counter
        // updates while we work, instead of staying at 0/N until everything's done.
        let alreadyCached = 0;
        const toFetch: string[] = [];
        const CHECK_CHUNK = 64;

        for (let i = 0; i < startupUrls.length; i += CHECK_CHUNK) {
          const chunk = startupUrls.slice(i, i + CHECK_CHUNK);
          const results = await Promise.all(chunk.map((url) => imageCache.get(url)));
          for (let j = 0; j < chunk.length; j++) {
            if (results[j]) alreadyCached++;
            else toFetch.push(chunk[j]);
          }
          // progress reflects ready-images / total — same scale all the way
          // through, so the bar grows monotonically across both phases.
          setState({ isLoading: true, loaded: alreadyCached, total, progress: Math.round((alreadyCached / total) * 100) });
        }

        console.log(
          `[Preloader] startup ${alreadyCached}/${total} cached, ` +
          `${toFetch.length} to fetch; ${backgroundUrls.length} queued for background warmup`,
        );

        if (toFetch.length === 0) {
          setState({ isLoading: false, progress: 100, loaded: total, total });
          void warmRemainingThumbnails(backgroundUrls);
          return;
        }

        // Fetch in parallel batches
        const BATCH_SIZE = 12;
        let fetched = 0;

        for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
          const batch = toFetch.slice(i, i + BATCH_SIZE);

          await Promise.allSettled(
            batch.map(async (url) => {
              try {
                const res = await fetch(url, { mode: 'cors' });
                if (!res.ok) return;
                const blob = await res.blob();
                if (blob.size > 0) {
                  await imageCache.set(url, blob);
                  fetched++;
                }
              } catch { /* skip */ }
            })
          );

          const done = alreadyCached + fetched;
          setState({ isLoading: true, loaded: done, total, progress: Math.round((done / total) * 100) });
        }

        const elapsed = performance.now() - startTime;
        console.log(`[Preloader] Done: ${fetched} fetched, ${alreadyCached} cached, ${elapsed.toFixed(0)}ms`);
        setState({ isLoading: false, progress: 100, loaded: total, total });
        void warmRemainingThumbnails(backgroundUrls);

      } catch (error) {
        console.error('[Preloader] Failed:', error);
        setState(s => ({ ...s, isLoading: false, progress: 100 }));
      }
    }

    preloadToIndexedDB();
  }, []);

  return state;
}
