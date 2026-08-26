import { describe, expect, it, vi } from 'vitest';
import { APP_COMMAND_KEY } from '../../../libs/realtime-agent-web-core/dist/index.js';
import {
  ProductFinderRealtimeBffClient,
  ProductFinderRealtimeBffError,
} from './ProductFinderRealtimeBffClient';

const context = {
  brand: "O'Neal",
  language: 'de',
  collection_year: 2027,
  entry_selection: { sport_id: 'MX', category_id: 'protection' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProductFinderRealtimeBffClient', () => {
  it('mints through the BFF without browser credentials and normalizes the response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      client_secret: { value: 'ek_test' },
      model: 'gpt-realtime',
      session_id: 'session-1',
      tools: ['find_products', 'refine_search'],
    }));
    const client = new ProductFinderRealtimeBffClient({
      sessionEndpoint: '/v1/realtime/session',
      toolEndpoint: '/v1/realtime/tool',
      fetchImpl,
    });

    await expect(client.mintSession(context)).resolves.toEqual({
      clientSecret: 'ek_test',
      model: 'gpt-realtime',
      sessionId: 'session-1',
      tools: ['find_products', 'refine_search'],
    });
    expect(fetchImpl).toHaveBeenCalledWith('/v1/realtime/session', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(context),
    }));
    const request = (fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit])?.[1];
    expect(JSON.stringify(request)).not.toMatch(/authorization|api.?key|principal|internal.?key/i);
  });

  it('rejects a mint that advertises a tool outside the read-only allowlist', async () => {
    const client = new ProductFinderRealtimeBffClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        clientSecret: 'ek_test',
        model: 'gpt-realtime',
        sessionId: 'session-1',
        tools: ['find_products', 'prepare_cart'],
      })),
    });

    await expect(client.mintSession(context)).rejects.toMatchObject({
      code: 'invalid_session_response',
      status: 502,
    });
  });

  it('rejects an incomplete tool contract instead of silently losing refinement', async () => {
    const client = new ProductFinderRealtimeBffClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        clientSecret: 'ek_test',
        model: 'gpt-realtime',
        sessionId: 'session-1',
        tools: ['find_products'],
      })),
    });

    await expect(client.mintSession(context)).rejects.toMatchObject({
      code: 'invalid_session_response',
      status: 502,
    });
  });

  it('dispatches an allowed tool for the minted session and preserves the app command', async () => {
    const commandResult = {
      status: 'matches',
      count: 4,
      [APP_COMMAND_KEY]: {
        name: 'show_product_results',
        args: { selection_token: 'st_1' },
      },
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        clientSecret: 'ek_test',
        model: 'gpt-realtime',
        sessionId: 'session-1',
        tools: ['find_products', 'refine_search'],
      }))
      .mockResolvedValueOnce(jsonResponse(commandResult));
    const client = new ProductFinderRealtimeBffClient({
      sessionEndpoint: '/v1/realtime/session',
      toolEndpoint: '/v1/realtime/tool',
      fetchImpl,
    });
    await client.mintSession(context);

    await expect(client.executeTool({
      name: 'find_products',
      args: { sport: ['MX'] },
      callId: 'call-1',
      sessionId: 'session-1',
    })).resolves.toEqual(commandResult);
    expect(fetchImpl).toHaveBeenLastCalledWith('/v1/realtime/tool', expect.objectContaining({
      body: JSON.stringify({
        name: 'find_products',
        args: { sport: ['MX'] },
        callId: 'call-1',
        sessionId: 'session-1',
      }),
    }));
  });

  it('fails closed before the network for an unauthorized tool or foreign session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      clientSecret: 'ek_test',
      model: 'gpt-realtime',
      sessionId: 'session-1',
      tools: ['find_products', 'refine_search'],
    }));
    const client = new ProductFinderRealtimeBffClient({ fetchImpl });
    await client.mintSession(context);

    await expect(client.executeTool({
      name: 'prepare_cart', args: {}, callId: 'call-1', sessionId: 'session-1',
    })).rejects.toBeInstanceOf(ProductFinderRealtimeBffError);
    await expect(client.executeTool({
      name: 'find_products', args: {}, callId: 'call-2', sessionId: 'foreign',
    })).rejects.toMatchObject({ code: 'realtime_session_mismatch' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('propagates the structured budget denial without converting it to empty results', async () => {
    const client = new ProductFinderRealtimeBffClient({
      fetchImpl: vi.fn(async () => jsonResponse({
        error: 'budget_exceeded',
        window: 'daily',
        used_eur: 3,
        limit_eur: 3,
        resets_at: '2026-08-27T00:00:00+02:00',
      }, 403)),
    });

    await expect(client.mintSession(context)).rejects.toMatchObject({
      code: 'budget_exceeded',
      status: 403,
    });
  });
});
