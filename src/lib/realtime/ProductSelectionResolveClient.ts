import type { ProductSummary } from 'arkturian-oneal-sdk';

export interface ProductSelectionResolveResponse {
  expires_at: string;
  count: number;
  results: readonly ProductSummary[];
}

export class ProductSelectionResolveError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ProductSelectionResolveError';
    this.status = status;
    this.code = code;
  }
}

export interface ProductSelectionResolveClientOptions {
  endpoint: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

/** Read-only browser capability for a server-owned selection snapshot. */
export class ProductSelectionResolveClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly request: typeof globalThis.fetch;

  constructor(options: ProductSelectionResolveClientOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async resolveSelection(
    selectionToken: string,
    sessionId: string,
  ): Promise<ProductSelectionResolveResponse> {
    const response = await this.request(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'x-realtime-session-id': sessionId,
      },
      body: JSON.stringify({ selection_token: selectionToken }),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const detail = body?.detail;
      const code = typeof detail === 'string'
        ? detail
        : typeof (detail as { code?: unknown } | null)?.code === 'string'
          ? (detail as { code: string }).code
          : `selection_resolve_${response.status}`;
      throw new ProductSelectionResolveError(response.status, code);
    }
    if (!body || !Array.isArray(body.results)
      || typeof body.count !== 'number'
      || !Number.isInteger(body.count)
      || body.count !== body.results.length
      || typeof body.expires_at !== 'string'
      || body.results.some(result => (
        !result
        || typeof result !== 'object'
        || typeof (result as { id?: unknown }).id !== 'number'
        || typeof (result as { product_code?: unknown }).product_code !== 'string'
      ))) {
      throw new ProductSelectionResolveError(502, 'selection_resolve_invalid_response');
    }
    return {
      expires_at: body.expires_at,
      count: body.count,
      results: body.results as unknown as ProductSummary[],
    };
  }
}
