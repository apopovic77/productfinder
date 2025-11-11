/**
 * Global Shared Image Queue
 *
 * Parallel queue shared across the entire application.
 * With IndexedDB cache, parallel loading is MUCH faster (instant for cache hits).
 */

import { ImageLoadQueue } from './ImageLoadQueue';

// Single global queue instance for ALL image loading in the app
export const globalImageQueue = new ImageLoadQueue({
  maxConcurrent: 6,  // Load 6 images in parallel (instant from cache!)
  mode: 'parallel',
  timeout: 30000,
  retryCount: 1,
  priorityInterruptThreshold: 0.2, // Allow high priority requests to interrupt low priority
});

// For debugging: expose queue stats
if (typeof window !== 'undefined') {
  (window as any).__imageQueue = globalImageQueue;
}
