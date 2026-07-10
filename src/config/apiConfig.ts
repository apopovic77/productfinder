/**
 * Central API configuration — single source of truth for all backend
 * base URLs and access keys (issue #257).
 *
 * Before this module the same env-lookups + fallbacks were duplicated in
 * 12+ files with drifting fallback values (absolute vs. relative paths,
 * one file even hardcoded the key with no env override).
 *
 * Note on the key fallback: the O'Neal read key is a public client-side
 * access gate, not a secret — any value shipped in a browser bundle is
 * visible by definition. Central env-first lookup keeps deployments
 * overridable; the fallback keeps dev/preview builds working without .env.
 */

export const ONEAL_API_BASE: string =
  import.meta.env.VITE_ONEAL_API_BASE || 'https://gsgbot.arkturian.com/oneal-api/v1';

export const ONEAL_API_KEY: string =
  import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

export const STORAGE_API_BASE: string =
  import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';

export const STORAGE_API_KEY: string =
  import.meta.env.VITE_STORAGE_API_KEY || 'oneal_demo_token';

export const DISPATCH_BASE: string =
  import.meta.env.VITE_DISPATCH_BASE || 'https://cloud-api.oneal.arkturian.com/api/queue';
