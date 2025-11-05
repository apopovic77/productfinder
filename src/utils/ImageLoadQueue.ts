/**
 * Generic Image Load Queue
 *
 * Features:
 * - Configurable concurrency (parallel vs sequential)
 * - Priority queue
 * - Request cancellation by group or ID
 * - Progress callbacks
 * - Pause/Resume support
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
}

interface QueuedRequest<T = any> {
  request: ImageLoadRequest<T>;
  resolve: (result: ImageLoadResult<T>) => void;
  reject: (error: ImageLoadError<T>) => void;
  startTime?: number;
  retries: number;
  aborted: boolean;
}

export class ImageLoadQueue<T = any> {
  private config: Required<Omit<ImageLoadQueueConfig, 'shouldLoad'>> & { shouldLoad?: <T>(request: ImageLoadRequest<T>) => boolean };
  private queue: QueuedRequest<T>[] = [];
  private activeRequests = new Map<string, QueuedRequest<T>>();
  private paused = false;

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
    };
  }

  /**
   * Add image to load queue
   */
  add(request: ImageLoadRequest<T>): Promise<ImageLoadResult<T>> {
    return new Promise((resolve, reject) => {
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

      // Priority Interruption: Cancel active requests if new request has MUCH higher priority
      // (only in sequential mode where this makes sense)
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

      // Insert in priority order (lower priority number = higher priority)
      const insertIndex = this.queue.findIndex(
        q => (q.request.priority ?? 0) > (request.priority ?? 0)
      );

      if (insertIndex === -1) {
        this.queue.push(queued);
      } else {
        this.queue.splice(insertIndex, 0, queued);
      }

      this.processQueue();
    });
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
      this.activeRequests.delete(id);
      active.reject({
        id: active.request.id,
        url: active.request.url,
        error: new Error('Request cancelled'),
        metadata: active.request.metadata,
      });
      this.processQueue();
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
    this.processQueue();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queued: this.queue.length,
      active: this.activeRequests.size,
      paused: this.paused,
      mode: this.config.mode,
      maxConcurrent: this.config.maxConcurrent,
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
    this.activeRequests.set(request.id, queued);

    try {
      const image = await this.loadImage(request.url, this.config.timeout);

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
      this.processQueue();

    } catch (error) {
      // Retry logic
      if (queued.retries < this.config.retryCount) {
        queued.retries++;
        this.activeRequests.delete(request.id);

        // Re-add to queue with delay
        setTimeout(() => {
          if (!queued.aborted) {
            this.queue.unshift(queued);
            this.processQueue();
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
      this.processQueue();
    }
  }

  /**
   * Load a single image with timeout
   */
  private loadImage(url: string, timeout: number): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
      };

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
