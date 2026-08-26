import { describe, expect, it, vi } from 'vitest';
import {
  ProductSelectionResolveClient,
  ProductSelectionResolveError,
} from './ProductSelectionResolveClient';

describe('ProductSelectionResolveClient', () => {
  it('sends only token plus the minted session header', async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({
        expires_at: '2026-08-25T19:00:00Z',
        count: 1,
        results: [{ id: 42, product_code: '0042' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new ProductSelectionResolveClient({
      endpoint: '/v1/realtime/selections/resolve',
      apiKey: 'public-compatibility-key',
      fetch: request as unknown as typeof fetch,
    });

    const result = await client.resolveSelection('st_opaque', 'session-1');

    expect(result.count).toBe(1);
    expect(request).toHaveBeenCalledWith('/v1/realtime/selections/resolve', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-realtime-session-id': 'session-1' }),
      body: JSON.stringify({ selection_token: 'st_opaque' }),
    }));
    expect(String(request.mock.calls[0]?.[1]?.body)).not.toContain('product_ids');
  });

  it('rejects count/order payloads that cannot be projected exactly', async () => {
    const client = new ProductSelectionResolveClient({
      endpoint: '/v1/realtime/selections/resolve',
      apiKey: 'compatibility-key',
      fetch: vi.fn(async () => new Response(JSON.stringify({
        expires_at: '2026-08-25T19:00:00Z',
        count: 2,
        results: [{ id: 42, product_code: '0042' }],
      }), { status: 200 })) as unknown as typeof fetch,
    });

    await expect(client.resolveSelection('st_opaque', 'session-1')).rejects.toEqual(
      expect.objectContaining({
        status: 502,
        code: 'selection_resolve_invalid_response',
      }) as ProductSelectionResolveError,
    );
  });
});
