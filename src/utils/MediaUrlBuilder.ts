/**
 * Media URL Builder
 * Handles construction of media URLs with trim parameter support
 */

import { APP_CONFIG } from '../config/AppConfig';

// Get storage API URL from environment or use default
const STORAGE_API_BASE = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';

export interface MediaUrlOptions {
  storageId: number;
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
  trim?: boolean;
  aspectRatio?: number;
}

/**
 * Build a media URL with all parameters including trim support
 */
export function buildMediaUrl(options: MediaUrlOptions): string {
  const {
    storageId,
    width,
    height,
    format = 'webp',
    quality = 85,
    trim = APP_CONFIG.media.useTrimmedImages,
    aspectRatio,
  } = options;

  const params = new URLSearchParams();

  if (width) params.set('width', width.toString());
  if (height) params.set('height', height.toString());
  params.set('format', format);
  params.set('quality', quality.toString());

  if (trim) params.set('trim', 'true');
  if (aspectRatio) params.set('aspect_ratio', aspectRatio.toString());

  return `${STORAGE_API_BASE}/storage/media/${storageId}?${params.toString()}`;
}

/**
 * Build a thumbnail URL (low resolution)
 */
export function buildThumbnailUrl(storageId: number, size: number = 130): string {
  return buildMediaUrl({
    storageId,
    width: size,
    height: size,
    quality: 75,
  });
}

/**
 * Build a high resolution URL
 */
export function buildHighResUrl(storageId: number, size: number = 1300): string {
  return buildMediaUrl({
    storageId,
    width: size,
    quality: 85,
  });
}
