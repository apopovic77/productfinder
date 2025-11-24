import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export interface ShopifyConfig {
  /** e.g. "my-shop.myshopify.com" */
  storeDomain: string;
  /** e.g. "2025-04" */
  apiVersion: string;
  /** Admin API access token */
  accessToken: string;
  /** Minimum budget we try to keep available before sending the next query */
  minAvailableBudget: number;
  /** Maximum retry attempts for transient failures */
  maxRetryAttempts: number;
  /** Optional ISO timestamp; only sync products updated since this date */
  updatedSince?: string;
}

const DEFAULTS: Omit<ShopifyConfig, 'storeDomain' | 'accessToken'> = {
  apiVersion: '2025-04',
  minAvailableBudget: 200,
  maxRetryAttempts: 5,
};

/**
 * Load Shopify configuration from environment variables or an optional `.env.local-shopify`
 * file (useful when invoking the sync script manually).
 */
export function loadShopifyConfig(overrides: Partial<ShopifyConfig> = {}): ShopifyConfig {
  hydrateEnvFromLocalFile();

  const storeDomain = overrides.storeDomain ?? process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = overrides.accessToken ?? process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!storeDomain) {
    throw new Error('Missing SHOPIFY_STORE_DOMAIN env variable (e.g. "my-shop.myshopify.com").');
  }

  if (!accessToken) {
    throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN env variable.');
  }

  const apiVersion = overrides.apiVersion ?? process.env.SHOPIFY_API_VERSION ?? DEFAULTS.apiVersion;
  const minAvailableBudget = overrides.minAvailableBudget
    ?? parseNumber(process.env.SHOPIFY_MIN_AVAILABLE_BUDGET, DEFAULTS.minAvailableBudget);
  const maxRetryAttempts = overrides.maxRetryAttempts
    ?? parseNumber(process.env.SHOPIFY_MAX_RETRY_ATTEMPTS, DEFAULTS.maxRetryAttempts);
  const updatedSince = overrides.updatedSince ?? process.env.SHOPIFY_UPDATED_SINCE;

  return {
    storeDomain: normalizeDomain(storeDomain),
    accessToken: accessToken.trim(),
    apiVersion,
    minAvailableBudget,
    maxRetryAttempts,
    updatedSince: updatedSince?.trim(),
  };
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim();
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * Optional helper: when running scripts manually we allow keeping secrets in
 * `.env.local-shopify` at repo root (ignored by git). This file follows simple
 * KEY=VALUE lines. If it does not exist we silently ignore.
 */
function hydrateEnvFromLocalFile(): void {
  const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const localEnvPath = path.join(root, '.env.local-shopify');
  if (!fs.existsSync(localEnvPath)) return;

  const contents = fs.readFileSync(localEnvPath, 'utf-8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!key) continue;
    const value = rest.join('=').trim();
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

