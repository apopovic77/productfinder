import { useEffect, useRef, useState } from 'react';
import { fetchProducts } from '../data/ProductRepository';
import { buildMediaUrl } from '../utils/MediaUrlBuilder';
import { imageCache } from '../utils/IndexedDBImageCache';

/**
 * Preloads all product thumbnails directly into IndexedDB cache.
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
        const urls: string[] = [];
        for (const product of products) {
          const storageId = product.primaryImage?.storage_id;
          if (!storageId) continue;
          urls.push(buildMediaUrl({ storageId, width: 130, quality: 75, trim: true }));
        }

        const total = urls.length;
        setState(s => ({ ...s, total }));

        // Check which are already cached — parallel in chunks so the UI counter
        // updates while we work, instead of staying at 0/N until everything's done.
        let alreadyCached = 0;
        const toFetch: string[] = [];
        const CHECK_CHUNK = 64;

        for (let i = 0; i < urls.length; i += CHECK_CHUNK) {
          const chunk = urls.slice(i, i + CHECK_CHUNK);
          const results = await Promise.all(chunk.map((url) => imageCache.get(url)));
          for (let j = 0; j < chunk.length; j++) {
            if (results[j]) alreadyCached++;
            else toFetch.push(chunk[j]);
          }
          // progress reflects ready-images / total — same scale all the way
          // through, so the bar grows monotonically across both phases.
          setState({ isLoading: true, loaded: alreadyCached, total, progress: Math.round((alreadyCached / total) * 100) });
        }

        console.log(`[Preloader] ${alreadyCached}/${total} cached, ${toFetch.length} to fetch`);

        if (toFetch.length === 0) {
          setState({ isLoading: false, progress: 100, loaded: total, total });
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

      } catch (error) {
        console.error('[Preloader] Failed:', error);
        setState(s => ({ ...s, isLoading: false, progress: 100 }));
      }
    }

    preloadToIndexedDB();
  }, []);

  return state;
}
