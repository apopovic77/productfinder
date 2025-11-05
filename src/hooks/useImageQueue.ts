import { useState, useEffect, useRef } from 'react';
import { ImageLoadQueue } from '../utils/ImageLoadQueue';

/**
 * React Hook for loading images through ImageLoadQueue
 *
 * Usage:
 * ```tsx
 * const { loadedImages, loading } = useImageQueue(urls, 'my-group');
 *
 * {urls.map((url, idx) => (
 *   <img src={loadedImages[idx] || placeholderUrl} />
 * ))}
 * ```
 */

interface UseImageQueueOptions {
  group?: string;
  priority?: number;
  maxConcurrent?: number;
  mode?: 'parallel' | 'sequential';
}

interface LoadedImage {
  url: string;
  image: HTMLImageElement | null;
  loading: boolean;
  error: Error | null;
}

// Shared queue instance for all thumbnail loading
const thumbnailQueue = new ImageLoadQueue<{ url: string; index: number }>({
  maxConcurrent: 1,
  mode: 'sequential',  // Sequential: load one image at a time to prevent browser connection limits
  timeout: 30000,
  retryCount: 1,
});

export function useImageQueue(
  urls: string[],
  options: UseImageQueueOptions = {}
): {
  loadedImages: Map<string, HTMLImageElement>;
  loading: boolean;
  error: Error | null;
} {
  const { group = 'default', priority = 0 } = options;
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const previousGroupRef = useRef<string | null>(null);

  useEffect(() => {
    // Cancel previous group if it changed
    if (previousGroupRef.current && previousGroupRef.current !== group) {
      thumbnailQueue.cancelGroup(previousGroupRef.current);
    }
    previousGroupRef.current = group;

    // Cancel current group when URLs change
    thumbnailQueue.cancelGroup(group);

    // Reset state
    setLoadedImages(new Map());
    setLoading(true);
    setError(null);

    if (urls.length === 0) {
      setLoading(false);
      return;
    }

    let loadedCount = 0;
    const newLoadedImages = new Map<string, HTMLImageElement>();

    // Add all URLs to queue
    urls.forEach((url, index) => {
      thumbnailQueue.add({
        id: `${group}-${index}`,
        url,
        group,
        priority: priority + index, // Maintain order within priority
        metadata: { url, index }
      }).then(result => {
        // Image loaded successfully
        newLoadedImages.set(url, result.image);
        loadedCount++;

        // Update state with new image
        setLoadedImages(new Map(newLoadedImages));

        // Check if all loaded
        if (loadedCount === urls.length) {
          setLoading(false);
        }
      }).catch(err => {
        // Image failed to load
        // Only log real errors, not cancelled requests
        if (err.error?.message !== 'Request cancelled' && err.error?.message !== 'Request no longer relevant') {
          console.warn('[useImageQueue] Failed to load:', url, err);
        }
        loadedCount++;

        // Check if all processed (even with errors)
        if (loadedCount === urls.length) {
          setLoading(false);
          setError(err.error);
        }
      });
    });

    // Cleanup: cancel pending requests when component unmounts or URLs change
    return () => {
      thumbnailQueue.cancelGroup(group);
    };
  }, [urls.join(','), group, priority]); // Depend on URL list and group

  return {
    loadedImages,
    loading,
    error
  };
}
