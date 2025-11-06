/**
 * Global Shared Image Queue
 *
 * Single sequential queue shared across the entire application
 * to ensure truly sequential image loading.
 */

import { ImageLoadQueue } from './ImageLoadQueue';

// Single global queue instance for ALL image loading in the app
export const globalImageQueue = new ImageLoadQueue({
  maxConcurrent: 1,
  mode: 'sequential',
  timeout: 30000,
  retryCount: 1,
  priorityInterruptThreshold: 0.2, // Allow high priority requests to interrupt low priority
});

// For debugging: expose queue stats
if (typeof window !== 'undefined') {
  (window as any).__imageQueue = globalImageQueue;
}
