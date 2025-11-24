import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MediaMapping {
  sourceUrl: string;
  storageId: number;
  lastChecked: string; // ISO date
}

export interface StorageUploadResponse {
  id: number;
  file_url: string;
  mime_type: string;
}

export class MediaSyncService {
  private mapping: Map<string, MediaMapping> = new Map();
  private readonly cachePath: string;
  private readonly storageApiEndpoint: string;
  private readonly storageApiKey: string;

  constructor() {
    const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
    this.cachePath = path.join(root, 'scripts', 'shopify', '.media-cache.json');
    this.storageApiEndpoint = process.env.STORAGE_API_ENDPOINT || 'https://api-storage.arkturian.com';
    this.storageApiKey = process.env.STORAGE_API_KEY || '';

    this.loadCache();
  }

  /**
   * Ensure a Shopify image exists in Storage API and return its ID.
   * If cached, returns immediately. If not, uploads to Storage API.
   */
  async ensureStorageId(sourceUrl: string): Promise<number | undefined> {
    if (!sourceUrl) return undefined;

    // 1. Check cache
    const normalizedUrl = this.normalizeUrl(sourceUrl);
    const cached = this.mapping.get(normalizedUrl);
    if (cached) {
      return cached.storageId;
    }

    // 2. Upload if not cached
    try {
      const storageId = await this.uploadToStorage(sourceUrl);
      if (storageId) {
        this.updateCache(normalizedUrl, storageId);
        return storageId;
      }
    } catch (error) {
      console.warn(`Failed to sync media: ${sourceUrl}`, error);
    }
    return undefined;
  }

  private async uploadToStorage(url: string): Promise<number | undefined> {
    if (!this.storageApiKey) {
      return undefined;
    }

    // Download image stream
    const imageRes = await fetch(url);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch source image: ${imageRes.statusText}`);
    }
    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prepare form data for Storage API
    const filename = path.basename(new URL(url).pathname) || 'image.jpg';
    const formData = new FormData();
    const blob = new Blob([buffer]);
    formData.append('file', blob, filename);
    formData.append('visibility', 'public');

    // POST to Storage API
    const uploadRes = await fetch(`${this.storageApiEndpoint}/storage/objects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.storageApiKey}`,
        // Content-Type is set automatically by FormData with boundary
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Storage API upload failed (${uploadRes.status}): ${text}`);
    }

    const data = (await uploadRes.json()) as StorageUploadResponse;
    return data.id;
  }

  private loadCache() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const raw = fs.readFileSync(this.cachePath, 'utf-8');
        const list = JSON.parse(raw) as MediaMapping[];
        for (const item of list) {
          this.mapping.set(item.sourceUrl, item);
        }
      }
    } catch (e) {
      console.warn('Failed to load media cache, starting fresh.', e);
    }
  }

  saveCache() {
    try {
      const list = Array.from(this.mapping.values());
      fs.writeFileSync(this.cachePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save media cache.', e);
    }
  }

  private updateCache(url: string, storageId: number) {
    this.mapping.set(url, {
      sourceUrl: url,
      storageId,
      lastChecked: new Date().toISOString(),
    });
  }

  private normalizeUrl(url: string): string {
    // Remove query params (like ?v=...) to dedup same image versions
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }
}

