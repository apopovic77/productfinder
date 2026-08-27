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

/**
 * Productfinder-owned, same-origin Realtime BFF endpoints.
 *
 * These URLs are browser-visible by design; credentials are not. The BFF is
 * the only component allowed to hold the AuthApi principal JWT and AiApi host
 * credentials. Defaults follow the oneal-api-v2 `/v1` base used above.
 */
export const REALTIME_SESSION_ENDPOINT: string =
  import.meta.env.VITE_REALTIME_SESSION_ENDPOINT
  || `${ONEAL_API_BASE}/realtime/session`;

export const REALTIME_TOOL_ENDPOINT: string =
  import.meta.env.VITE_REALTIME_TOOL_ENDPOINT
  || `${ONEAL_API_BASE}/realtime/tool`;

export const REALTIME_USAGE_ENDPOINT: string =
  import.meta.env.VITE_REALTIME_USAGE_ENDPOINT
  || `${ONEAL_API_BASE}/realtime/usage`;

export const REALTIME_SESSION_END_ENDPOINT: string =
  import.meta.env.VITE_REALTIME_SESSION_END_ENDPOINT
  || `${ONEAL_API_BASE}/realtime/session/end`;

/** Display-only gate. The authoritative kill switch lives in the BFF. */
export const REALTIME_DEMO_ENABLED: boolean =
  import.meta.env.VITE_PRODUCTFINDER_REALTIME_ENABLED === 'true';
