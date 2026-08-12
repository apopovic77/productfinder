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
  // Priority-0 selection media may preempt one lower-priority visible image.
  priorityInterruptThreshold: 0.2,
});

// Background cache warming must never consume one of the six slots reserved
// for images the user can currently see. It gets its own deliberately small
// pool and may continue opportunistically after first paint.
export const backgroundImageQueue = new ImageLoadQueue({
  maxConcurrent: 2,
  mode: 'parallel',
  timeout: 30000,
  retryCount: 1,
  priorityInterruptThreshold: 0,
});

// High-resolution LOD upgrades are useful only after the 180px base image is
// visible. Keeping them out of the foreground queue prevents a previous
// zoom/pan from occupying all slots when a new viewport needs base thumbs.
export const lodImageQueue = new ImageLoadQueue({
  maxConcurrent: 2,
  mode: 'parallel',
  timeout: 30000,
  retryCount: 1,
  priorityInterruptThreshold: 0,
});

// For debugging: expose queue stats
if (typeof window !== 'undefined') {
  (window as any).__imageQueue = globalImageQueue;
  (window as any).__backgroundImageQueue = backgroundImageQueue;
  (window as any).__lodImageQueue = lodImageQueue;
}
