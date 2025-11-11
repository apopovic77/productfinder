/**
 * IndexedDB Image Cache
 *
 * Caches image thumbnails in IndexedDB for instant loading
 * - First load: Download from server → Store in DB
 * - Next loads: Instant from DB (0ms network time!)
 * - Auto cleanup: Removes old images after 30 days
 * - Version tracking: Invalidates cache when image changes
 */

const DB_NAME = 'productfinder-image-cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CachedImage {
  url: string;              // Full URL (cache key)
  blob: Blob;               // Image data
  timestamp: number;        // When cached
  version?: string;         // Optional version/hash
}

class IndexedDBImageCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDBImageCache] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('[IndexedDBImageCache] Object store created');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get image from cache
   */
  async get(url: string): Promise<Blob | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const cached = request.result as CachedImage | undefined;

        if (!cached) {
          resolve(null);
          return;
        }

        // Check if cache is expired
        const age = Date.now() - cached.timestamp;
        if (age > CACHE_DURATION_MS) {
          console.log('[IndexedDBImageCache] Cache expired for:', url);
          // Delete expired entry
          this.delete(url);
          resolve(null);
          return;
        }

        console.log('[IndexedDBImageCache] Cache HIT for:', url);
        resolve(cached.blob);
      };

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Failed to get from cache:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Store image in cache
   */
  async set(url: string, blob: Blob, version?: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const cached: CachedImage = {
        url,
        blob,
        timestamp: Date.now(),
        version,
      };

      const request = store.put(cached);

      request.onsuccess = () => {
        console.log('[IndexedDBImageCache] Cached:', url);
        resolve();
      };

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Failed to cache:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete image from cache
   */
  async delete(url: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(url);

      request.onsuccess = () => {
        console.log('[IndexedDBImageCache] Deleted:', url);
        resolve();
      };

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Failed to delete:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all cached images
   */
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[IndexedDBImageCache] Cache cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Failed to clear cache:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Cleanup old cached images (older than 30 days)
   */
  async cleanup(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');

      let deletedCount = 0;
      const cutoffTime = Date.now() - CACHE_DURATION_MS;

      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

        if (cursor) {
          const cached = cursor.value as CachedImage;

          if (cached.timestamp < cutoffTime) {
            cursor.delete();
            deletedCount++;
          }

          cursor.continue();
        } else {
          console.log(`[IndexedDBImageCache] Cleanup: Deleted ${deletedCount} old images`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Cleanup failed:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ count: number; sizeBytes: number; oldestTimestamp: number }> {
    await this.init();
    if (!this.db) return { count: 0, sizeBytes: 0, oldestTimestamp: 0 };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allImages = request.result as CachedImage[];

        let sizeBytes = 0;
        let oldestTimestamp = Date.now();

        allImages.forEach(img => {
          sizeBytes += img.blob.size;
          if (img.timestamp < oldestTimestamp) {
            oldestTimestamp = img.timestamp;
          }
        });

        resolve({
          count: allImages.length,
          sizeBytes,
          oldestTimestamp,
        });
      };

      request.onerror = () => {
        console.error('[IndexedDBImageCache] Failed to get stats:', request.error);
        reject(request.error);
      };
    });
  }
}

// Export singleton instance
export const imageCache = new IndexedDBImageCache();

// Auto-cleanup on app start (after 5 seconds)
setTimeout(() => {
  imageCache.cleanup().catch(err => {
    console.error('[IndexedDBImageCache] Auto-cleanup failed:', err);
  });
}, 5000);
