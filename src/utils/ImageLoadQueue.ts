import { imageCache } from './IndexedDBImageCache';

/**
 * Generic Image Load Queue
 *
 * Features:
 * - Configurable concurrency (parallel vs sequential)
 * - Priority queue
 * - Request cancellation by group or ID
 * - Progress callbacks
 * - Pause/Resume support
 * - IndexedDB cache for instant loading
 *
 * Usage:
 * ```typescript
 * const queue = new ImageLoadQueue({ maxConcurrent: 3 });
 *
 * queue.add({
 *   id: 'product-123',
 *   url: 'https://...',
 *   group: 'product-images',
 *   priority: 1,
 *   metadata: { productId: '123' }
 * }).then(img => {
 *   console.log('Loaded!', img);
 * });
 *
 * // Cancel all requests for a group
 * queue.cancelGroup('product-images');
 * ```
 */

/**
 * Error for HTTP statuses that will never succeed on retry (404/410).
 * Carries the status so queue logic can skip fallback + retries.
 */
export class PermanentImageError extends Error {
  constructor(url: string, public readonly status: number) {
    super(`Image permanently unavailable (HTTP ${status}): ${url}`);
    this.name = 'PermanentImageError';
  }
}

export type LoadMode = 'parallel' | 'sequential';

export interface ImageLoadRequest<T = any> {
  id: string;                    // Unique identifier
  url: string;                   // Image URL
  group?: string;                // Optional group for batch operations
  priority?: number;             // Lower number = higher priority (default: 0)
  metadata?: T;                  // Custom metadata
}

export interface ImageLoadResult<T = any> {
  id: string;
  url: string;
  image: HTMLImageElement;
  metadata?: T;
  loadTime: number;              // Time taken to load (ms)
}

export interface ImageLoadError<T = any> {
  id: string;
  url: string;
  error: Error;
  metadata?: T;
}

export interface ImageLoadQueueConfig {
  maxConcurrent?: number;        // Max parallel requests (default: 6)
  mode?: LoadMode;               // 'parallel' or 'sequential' (default: 'parallel')
  timeout?: number;              // Request timeout in ms (default: 30000)
  retryCount?: number;           // Retry failed requests (default: 0)
  retryDelay?: number;           // Delay between retries in ms (default: 1000)
  priorityInterruptThreshold?: number; // Cancel active if new priority < active priority * threshold (default: 0.2)
  shouldLoad?: <T>(request: ImageLoadRequest<T>) => boolean; // Validation function called before each load
  loader?: (url: string, timeout: number) => Promise<HTMLImageElement>; // Test/custom transport injection
}

interface QueuedRequest<T = any> {
  request: ImageLoadRequest<T>;
  resolve: (result: ImageLoadResult<T>) => void;
  reject: (error: ImageLoadError<T>) => void;
  startTime?: number;
  retries: number;
  aborted: boolean;
  abortController?: AbortController;
}

/**
 * Large LOD/hero images are intentionally not persisted. Loading them through
 * fetch first therefore adds no cache value and, on storage origins without a
 * matching CORS response, causes a failed request followed by an identical
 * <img> retry. Send those URLs straight through the browser image loader.
 */
export function shouldUsePersistentImageCache(url: string): boolean {
  try {
    const width = new URL(url).searchParams.get('width');
    return width === null || Number.parseInt(width, 10) <= 300;
  } catch {
    return true;
  }
}

export class ImageLoadQueue<T = any> {
  private config: Required<Omit<ImageLoadQueueConfig, 'shouldLoad' | 'loader'>> & {
    shouldLoad?: <T>(request: ImageLoadRequest<T>) => boolean;
    loader?: (url: string, timeout: number) => Promise<HTMLImageElement>;
  };
  private queue: QueuedRequest<T>[] = [];
  private activeRequests = new Map<string, QueuedRequest<T>>();
  private deadUrls = new Set<string>();
  private paused = false;
  private processScheduled = false;

  // Event callbacks
  public onLoad?: (result: ImageLoadResult<T>) => void;
  public onError?: (error: ImageLoadError<T>) => void;
  public onProgress?: (loaded: number, total: number) => void;

  constructor(config: ImageLoadQueueConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 6,
      mode: config.mode ?? 'parallel',
      timeout: config.timeout ?? 30000,
      retryCount: config.retryCount ?? 0,
      retryDelay: config.retryDelay ?? 1000,
      priorityInterruptThreshold: config.priorityInterruptThreshold ?? 0.2,
      shouldLoad: config.shouldLoad,
      loader: config.loader,
    };
  }

  /**
   * Add image to load queue
   */
  // Cache-hit fast path: decodes run locally and need no network fairness,
  // so they bypass the queue entirely. Without this, several hundred CACHED
  // thumbnails still waited behind maxConcurrent=6 slots on every reload and
  // the grid showed its loading spinners for seconds (owner 2026-08-23). A
  // small semaphore keeps parallel blob decodes from janking the main thread.
  private static fastPathActive = 0;
  private static readonly FAST_PATH_LIMIT = 16;
  private static fastPathWaiters: Array<() => void> = [];

  private async tryCacheFastPath(request: ImageLoadRequest<T>): Promise<ImageLoadResult<T> | null> {
    try {
      const cachedBlob = await imageCache.get(request.url);
      if (!cachedBlob) return null;
      while ((ImageLoadQueue as any).fastPathActive >= (ImageLoadQueue as any).FAST_PATH_LIMIT) {
        await new Promise<void>(res => (ImageLoadQueue as any).fastPathWaiters.push(res));
      }
      (ImageLoadQueue as any).fastPathActive++;
      try {
        const image = await this.blobToImage(cachedBlob);
        return { id: request.id, url: request.url, image, metadata: request.metadata } as ImageLoadResult<T>;
      } finally {
        (ImageLoadQueue as any).fastPathActive--;
        const next = (ImageLoadQueue as any).fastPathWaiters.shift();
        if (next) next();
      }
    } catch {
      return null; // fall back to the normal queued load
    }
  }

  add(request: ImageLoadRequest<T>): Promise<ImageLoadResult<T>> {
    return new Promise((resolve, reject) => {
      // Fast path first — only enqueue when the cache misses.
      void this.tryCacheFastPath(request).then(fast => {
        if (fast) { resolve(fast); return; }
        this.enqueue(request, resolve, reject);
      });
    });
  }

  private enqueue(
    request: ImageLoadRequest<T>,
    resolve: (r: ImageLoadResult<T>) => void,
    reject: (e: any) => void,
  ): void {
    {
      const queued: QueuedRequest<T> = {
        request: {
          ...request,
          priority: request.priority ?? 0,
        },
        resolve,
        reject,
        retries: 0,
        aborted: false,
      };

      const newPriority = request.priority ?? 0;

      // Priority interruption for a sequential queue: replace the current job.
      if (this.config.mode === 'sequential' && this.config.priorityInterruptThreshold > 0) {
        for (const [id, active] of this.activeRequests.entries()) {
          const activePriority = active.request.priority ?? 0;
          const threshold = activePriority * this.config.priorityInterruptThreshold;

          // If new priority is much lower (higher priority) than active, interrupt
          if (newPriority < threshold && activePriority > 0) {
            this.cancel(id);
          }
        }
      }

      // A parallel queue can still have every slot occupied by low-value work
      // when a user selects a product. In that case, free exactly one slot for
      // the new high-priority request. Cancelling only the least important
      // active request avoids a six-request restart storm while guaranteeing
      // that priority-0 hero media does not wait behind neighbouring products.
      if (
        this.config.mode === 'parallel'
        && this.config.priorityInterruptThreshold > 0
        && this.activeRequests.size >= this.config.maxConcurrent
      ) {
        const interruptible = Array.from(this.activeRequests.entries())
          .filter(([, active]) => {
            const activePriority = active.request.priority ?? 0;
            return activePriority > 0
              && newPriority < activePriority * this.config.priorityInterruptThreshold;
          })
          .sort(([, a], [, b]) => (b.request.priority ?? 0) - (a.request.priority ?? 0));

        const leastImportant = interruptible[0];
        if (leastImportant) this.cancel(leastImportant[0]);
      }

      this.insertByPriority(queued);

      // Batch all requests created in the same render turn before taking a
      // concurrency slot. Otherwise the first six layout nodes start
      // immediately and a later, more central visible node cannot overtake
      // them even though it has the better priority.
      this.scheduleProcessQueue();
    }
  }

  /**
   * Raise or lower the priority of a request that has not started yet.
   * Active network requests are deliberately not restarted.
   */
  reprioritize(id: string, priority: number): boolean {
    const index = this.queue.findIndex(queued => queued.request.id === id);
    if (index === -1) return false;

    const [queued] = this.queue.splice(index, 1);
    queued.request.priority = priority;
    this.insertByPriority(queued);
    this.scheduleProcessQueue();
    return true;
  }

  /**
   * Cancel specific request by ID
   */
  cancel(id: string): boolean {
    // Remove from queue
    const queueIndex = this.queue.findIndex(q => q.request.id === id);
    if (queueIndex !== -1) {
      const queued = this.queue.splice(queueIndex, 1)[0];
      queued.aborted = true;
      queued.reject({
        id: queued.request.id,
        url: queued.request.url,
        error: new Error('Request cancelled'),
        metadata: queued.request.metadata,
      });
      return true;
    }

    // Cancel active request
    const active = this.activeRequests.get(id);
    if (active) {
      active.aborted = true;
      active.abortController?.abort();
      this.activeRequests.delete(id);
      active.reject({
        id: active.request.id,
        url: active.request.url,
        error: new Error('Request cancelled'),
        metadata: active.request.metadata,
      });
      this.scheduleProcessQueue();
      return true;
    }

    return false;
  }

  /**
   * Cancel all requests in a group
   */
  cancelGroup(group: string): number {
    let cancelled = 0;

    // Cancel queued requests
    const toCancel = this.queue.filter(q => q.request.group === group);
    toCancel.forEach(queued => {
      if (this.cancel(queued.request.id)) {
        cancelled++;
      }
    });

    // Cancel active requests
    for (const [id, active] of this.activeRequests.entries()) {
      if (active.request.group === group && this.cancel(id)) {
        cancelled++;
      }
    }

    return cancelled;
  }

  /**
   * Cancel all requests
   */
  cancelAll(): number {
    const totalQueued = this.queue.length;
    const totalActive = this.activeRequests.size;

    // Cancel all queued
    while (this.queue.length > 0) {
      const queued = this.queue.shift()!;
      queued.aborted = true;
      queued.reject({
        id: queued.request.id,
        url: queued.request.url,
        error: new Error('All requests cancelled'),
        metadata: queued.request.metadata,
      });
    }

    // Cancel all active
    for (const [id, active] of this.activeRequests.entries()) {
      active.aborted = true;
      active.abortController?.abort();
      active.reject({
        id: active.request.id,
        url: active.request.url,
        error: new Error('All requests cancelled'),
        metadata: active.request.metadata,
      });
    }
    this.activeRequests.clear();

    return totalQueued + totalActive;
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.paused = false;
    this.scheduleProcessQueue();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const summarizeGroups = (requests: QueuedRequest<T>[]) => requests.reduce<Record<string, number>>(
      (groups, queued) => {
        const group = queued.request.group ?? 'ungrouped';
        groups[group] = (groups[group] ?? 0) + 1;
        return groups;
      },
      {},
    );
    const active = Array.from(this.activeRequests.values());
    return {
      queued: this.queue.length,
      active: this.activeRequests.size,
      paused: this.paused,
      mode: this.config.mode,
      maxConcurrent: this.config.maxConcurrent,
      queuedByGroup: summarizeGroups(this.queue),
      activeByGroup: summarizeGroups(active),
      nextPriorities: this.queue.slice(0, 12).map(item => item.request.priority ?? 0),
      activePriorities: active.map(item => item.request.priority ?? 0),
    };
  }

  /**
   * Clear completed requests and reset queue
   */
  clear(): void {
    this.cancelAll();
    this.queue = [];
    this.activeRequests.clear();
  }

  private insertByPriority(queued: QueuedRequest<T>): void {
    const priority = queued.request.priority ?? 0;
    const insertIndex = this.queue.findIndex(
      candidate => (candidate.request.priority ?? 0) > priority
    );

    if (insertIndex === -1) this.queue.push(queued);
    else this.queue.splice(insertIndex, 0, queued);
  }

  private scheduleProcessQueue(): void {
    if (this.processScheduled || this.paused) return;
    this.processScheduled = true;
    queueMicrotask(() => {
      this.processScheduled = false;
      this.processQueue();
    });
  }

  /**
   * Process queue and start loading images
   */
  private processQueue(): void {
    if (this.paused) return;

    // Sequential mode: Only start next if nothing active, max 1 at a time
    if (this.config.mode === 'sequential') {
      if (this.activeRequests.size > 0) {
        return; // Wait for current request to finish
      }

      // Start exactly 1 request (skip stale requests)
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!;

        if (queued.aborted) continue;

        // Validate request before loading
        if (this.config.shouldLoad && !this.config.shouldLoad(queued.request)) {
          queued.aborted = true;
          queued.reject({
            id: queued.request.id,
            url: queued.request.url,
            error: new Error('Request no longer relevant'),
            metadata: queued.request.metadata,
          });
          continue; // Try next request
        }

        // Valid request - start loading
        this.startLoad(queued);
        break;
      }
      return;
    }

    // Parallel mode: Start up to maxConcurrent (skip stale requests)
    while (
      this.queue.length > 0 &&
      this.activeRequests.size < this.config.maxConcurrent
    ) {
      const queued = this.queue.shift()!;

      if (queued.aborted) continue;

      // Validate request before loading
      if (this.config.shouldLoad && !this.config.shouldLoad(queued.request)) {
        queued.aborted = true;
        queued.reject({
          id: queued.request.id,
          url: queued.request.url,
          error: new Error('Request no longer relevant'),
          metadata: queued.request.metadata,
        });
        continue; // Try next request
      }

      this.startLoad(queued);
    }
  }

  /**
   * Start loading a single image
   */
  private async startLoad(queued: QueuedRequest<T>): Promise<void> {
    const { request } = queued;

    queued.startTime = Date.now();
    queued.abortController = new AbortController();
    this.activeRequests.set(request.id, queued);

    try {
      const image = this.config.loader
        ? await this.config.loader(request.url, this.config.timeout)
        : await this.loadImage(request.url, this.config.timeout, queued.abortController);

      // Check if request was cancelled
      if (queued.aborted || !this.activeRequests.has(request.id)) {
        return;
      }

      const result: ImageLoadResult<T> = {
        id: request.id,
        url: request.url,
        image,
        metadata: request.metadata,
        loadTime: Date.now() - queued.startTime!,
      };

      this.activeRequests.delete(request.id);
      queued.resolve(result);

      if (this.onLoad) {
        this.onLoad(result);
      }

      this.emitProgress();
      this.scheduleProcessQueue();

    } catch (error) {
      if (queued.aborted) return;

      // Retry logic — pointless for permanent (404/410) failures
      const isPermanent = error instanceof PermanentImageError;
      if (!isPermanent && queued.retries < this.config.retryCount) {
        queued.retries++;
        this.activeRequests.delete(request.id);

        // Re-add to queue with delay
        setTimeout(() => {
          if (!queued.aborted) {
            // A retry retains its original priority. `unshift` used to let a
            // failed background request jump ahead of newly visible images.
            this.insertByPriority(queued);
            this.scheduleProcessQueue();
          }
        }, this.config.retryDelay);

        return;
      }

      // Max retries reached or no retries configured
      const loadError: ImageLoadError<T> = {
        id: request.id,
        url: request.url,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: request.metadata,
      };

      this.activeRequests.delete(request.id);
      queued.reject(loadError);

      if (this.onError) {
        this.onError(loadError);
      }

      this.emitProgress();
      this.scheduleProcessQueue();
    }
  }

  /**
   * Load a single image with timeout and IndexedDB cache
   *
   * Flow:
   * 1. Check IndexedDB cache first
   * 2. Cache HIT: Return instantly (0ms network time!)
   * 3. Cache MISS: Fetch from network, cache blob, return image
   *
   * CORS is now enabled on share.arkturian.com/proxy.php
   */
  private async loadImage(
    url: string,
    timeout: number,
    abortController: AbortController,
  ): Promise<HTMLImageElement> {
    // Known-dead URL (404/410 seen this session) — reject without network
    if (this.deadUrls.has(url)) {
      throw new PermanentImageError(url, 404);
    }

    if (!shouldUsePersistentImageCache(url)) {
      return this.loadImageWithImgTag(url, timeout, abortController.signal);
    }

    // Step 1: Try IndexedDB cache first
    try {
      const cachedBlob = await imageCache.get(url);

      if (abortController.signal.aborted) {
        throw new DOMException('Request cancelled', 'AbortError');
      }

      if (cachedBlob) {
        // Cache HIT - convert blob to Image instantly!
        return this.blobToImage(cachedBlob);
      }
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      // Cache read failed - fall back to network
      console.warn('[ImageLoadQueue] Cache read failed:', error);
    }

    // Step 2: Cache MISS - fetch from network with caching enabled
    try {
      return await this.loadImageWithFetch(url, timeout, abortController);
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      if (error instanceof PermanentImageError) {
        // 404/410: the resource does not exist — an <img> fallback or retry
        // would just repeat the same request (issue #262)
        this.deadUrls.add(url);
        throw error;
      }
      // Fetch failed (CORS or network error) - fall back to <img> tag
      console.warn('[ImageLoadQueue] Fetch failed, using <img> fallback:', error);
      return this.loadImageWithImgTag(url, timeout, abortController.signal);
    }
  }

  /**
   * Load image using fetch() - enables caching but requires CORS
   */
  private async loadImageWithFetch(
    url: string,
    timeout: number,
    abortController: AbortController,
  ): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let fetchAborted = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        fetchAborted = true;
      };

      timer = setTimeout(() => {
        cleanup();
        abortController.abort();
        reject(new Error(`Image load timeout: ${url}`));
      }, timeout);

      // Fetch as blob to enable caching
      fetch(url, { mode: 'cors', signal: abortController.signal })
        .then(response => {
          if (!response.ok) {
            if (response.status === 404 || response.status === 410) {
              throw new PermanentImageError(url, response.status);
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.blob();
        })
        .then(async blob => {
          if (fetchAborted) return;

          // Cache ONLY thumbnails (≤300px width) to save IndexedDB space
          // High-res images (1300px) are NOT cached (too large, rarely reused)
          const shouldCache = this.shouldCacheImage(url, blob);
          if (shouldCache) {
            await imageCache.set(url, blob).catch(err => {
              console.warn('[ImageLoadQueue] Failed to cache image:', err);
            });
          }

          // Convert blob to Image
          const img = await this.blobToImage(blob);
          cleanup();
          resolve(img);
        })
        .catch(error => {
          if (fetchAborted) return;
          cleanup();
          // Permanent errors pass through untouched so callers can detect them
          if (error instanceof PermanentImageError) {
            reject(error);
          } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            // Mark CORS errors specially
            reject(new Error(`CORS error: ${url}`));
          } else {
            reject(new Error(`Failed to load image: ${url} - ${error.message}`));
          }
        });
    });
  }

  /**
   * Load image using <img> tag - works cross-origin but can't cache
   */
  private loadImageWithImgTag(
    url: string,
    timeout: number,
    signal: AbortSignal,
  ): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        img.src = '';
        reject(new DOMException('Request cancelled', 'AbortError'));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      img.onload = () => {
        cleanup();
        resolve(img);
      };

      img.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load image: ${url}`));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Image load timeout: ${url}`));
      }, timeout);

      img.src = url;
    });
  }

  /**
   * Decide whether to cache an image based on size
   * Only cache thumbnails (≤300px) to save IndexedDB space
   */
  private shouldCacheImage(url: string, blob: Blob): boolean {
    try {
      // Extract width from URL (e.g., "width=130")
      const urlObj = new URL(url);
      const width = urlObj.searchParams.get('width');

      if (width) {
        const widthNum = parseInt(width, 10);
        // Cache only thumbnails (≤300px width)
        if (widthNum <= 300) {
          return true;
        }
      }

      // Also check blob size: cache only if < 50KB
      if (blob.size < 50 * 1024) {
        return true;
      }

      return false;
    } catch (error) {
      // If URL parsing fails, cache small blobs only
      return blob.size < 50 * 1024;
    }
  }

  /**
   * Convert Blob to HTMLImageElement
   *
   * Note: We do NOT revoke the blob URL to avoid race conditions with parallel loading.
   * This creates a small memory leak, but it's acceptable for thumbnails (~3-5KB each).
   * The browser will clean up URLs when the page is closed.
   */
  private blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);

      img.onload = () => {
        // DO NOT REVOKE - causes race conditions with parallel loading
        resolve(img);
      };

      img.onerror = () => {
        // On error, we can safely revoke (won't be used anyway)
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to decode image blob'));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Emit progress event
   */
  private emitProgress(): void {
    if (this.onProgress) {
      const total = this.queue.length + this.activeRequests.size;
      const loaded = 0; // We don't track completed count in this simple version
      this.onProgress(loaded, total);
    }
  }
}
