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
      push_to_talk: true,
      turn_detection: null,
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
      pushToTalk: true,
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
        pushToTalk: true,
        turnDetection: null,
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
        pushToTalk: true,
        turnDetection: null,
      })),
    });

    await expect(client.mintSession(context)).rejects.toMatchObject({
      code: 'invalid_session_response',
      status: 502,
    });
  });

  it('accepts the three-tool cutover contract and projects cached focus before mint resolves', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        clientSecret: 'ek_test',
        model: 'gpt-realtime',
        sessionId: 'session-1',
        tools: ['find_products', 'refine_search', 'product_details'],
        pushToTalk: true,
        turnDetection: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ focused: true }));
    const client = new ProductFinderRealtimeBffClient({
      sessionEndpoint: '/v1/realtime/session',
      contextEndpoint: '/v1/realtime/context',
      fetchImpl,
    });
    await client.updateFocusedProduct(10407);

    await expect(client.mintSession(context)).resolves.toMatchObject({
      tools: ['find_products', 'refine_search', 'product_details'],
    });
    expect(fetchImpl.mock.calls[1]).toEqual([
      '/v1/realtime/context',
      expect.objectContaining({
        body: JSON.stringify({ sessionId: 'session-1', focusedProductId: 10407 }),
      }),
    ]);
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
        pushToTalk: true,
        turnDetection: null,
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

  it('validates closed product_details text separately from search results', async () => {
    const mint = {
      clientSecret: 'ek_test',
      model: 'gpt-realtime',
      sessionId: 'session-1',
      tools: ['find_products', 'refine_search', 'product_details'],
      pushToTalk: true,
      turnDetection: null,
    };
    const safeDetails = {
      status: 'details',
      name: 'Blade Polyacrylite Helm',
      line: 'Blade',
      category_label: 'Helme',
      features: ['Leichte Außenschale', 'Herausnehmbares Innenfutter'],
      material: 'ABS, EPS',
      sizes: ['S', 'M'],
      colors: ['Schwarz'],
      price_eur: [149.99, 169.99],
      target_group: 'Erwachsene',
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(mint))
      .mockResolvedValueOnce(jsonResponse(safeDetails));
    const client = new ProductFinderRealtimeBffClient({ fetchImpl });
    await client.mintSession(context);

    await expect(client.executeTool({
      name: 'product_details', args: {}, callId: 'detail-1', sessionId: 'session-1',
    })).resolves.toEqual(safeDetails);

    for (const unsafe of [
      { status: 'details', name: '<script>alert(1)</script>' },
      { status: 'details', material: 'Mehr unter https://example.test' },
      { status: 'details', product_id: 10407 },
      { status: 'matches', name: 'falscher Zustand' },
    ]) {
      const invalidClient = new ProductFinderRealtimeBffClient({
        fetchImpl: vi.fn()
          .mockResolvedValueOnce(jsonResponse(mint))
          .mockResolvedValueOnce(jsonResponse(unsafe)),
      });
      await invalidClient.mintSession(context);
      await expect(invalidClient.executeTool({
        name: 'product_details', args: {}, callId: 'detail-2', sessionId: 'session-1',
      })).rejects.toMatchObject({ status: 502 });
    }
  });

  it('rejects the real AiApi transport envelope if the BFF forgot to unwrap it', async () => {
    const innerResult = {
      status: 'matches',
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
        pushToTalk: true,
        turnDetection: null,
      }))
      .mockResolvedValueOnce(jsonResponse({
        call_id: 'call-1',
        tool: 'find_products',
        ok: true,
        result: innerResult,
      }));
    const client = new ProductFinderRealtimeBffClient({ fetchImpl });
    await client.mintSession(context);

    await expect(client.executeTool({
      name: 'find_products', args: {}, callId: 'call-1', sessionId: 'session-1',
    })).rejects.toMatchObject({
      code: 'transport_envelope_not_unwrapped',
      status: 502,
    });
  });

  it('fails closed for ok=false envelopes, top-level tokens, or matches without a command', async () => {
    const mint = {
      clientSecret: 'ek_test',
      model: 'gpt-realtime',
      sessionId: 'session-1',
      tools: ['find_products', 'refine_search'],
      pushToTalk: true,
      turnDetection: null,
    };
    const invalidResults = [
      {
        payload: { call_id: 'call-1', tool: 'find_products', ok: false, error: 'unavailable' },
        code: 'upstream_tool_failed',
      },
      {
        payload: { status: 'matches', selection_token: 'st_leak' },
        code: 'unsafe_tool_response',
      },
      {
        payload: { status: 'matches', count: 2 },
        code: 'missing_result_command',
      },
    ];

    for (const invalid of invalidResults) {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(jsonResponse(mint))
        .mockResolvedValueOnce(jsonResponse(invalid.payload));
      const client = new ProductFinderRealtimeBffClient({ fetchImpl });
      await client.mintSession(context);
      await expect(client.executeTool({
        name: 'find_products', args: {}, callId: 'call-1', sessionId: 'session-1',
      })).rejects.toMatchObject({ code: invalid.code, status: 502 });
    }
  });

  it('fails closed before the network for an unauthorized tool or foreign session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      clientSecret: 'ek_test',
      model: 'gpt-realtime',
      sessionId: 'session-1',
      tools: ['find_products', 'refine_search'],
      pushToTalk: true,
      turnDetection: null,
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

  it('reports official response.done token details through the browser-safe BFF port', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        clientSecret: 'ek_test',
        model: 'gpt-realtime',
        sessionId: 'session-1',
        tools: ['find_products', 'refine_search'],
        pushToTalk: true,
        turnDetection: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ accepted: true, deduped: false }));
    const client = new ProductFinderRealtimeBffClient({
      usageEndpoint: '/v1/realtime/usage',
      fetchImpl,
    });
    await client.mintSession(context);

    await expect(client.reportUsage({
      sessionId: 'session-1',
      usageEventId: 'resp_1',
      audioInputTokens: 11,
      audioOutputTokens: 22,
      textInputTokens: 33,
      textOutputTokens: 44,
      cachedTextInputTokens: 5,
      cachedAudioInputTokens: 7,
      durationSec: 0,
    })).resolves.toEqual({ accepted: true, deduped: false });
    expect(fetchImpl).toHaveBeenLastCalledWith('/v1/realtime/usage', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        sessionId: 'session-1',
        usageEventId: 'resp_1',
        audio_input_tokens: 11,
        audio_output_tokens: 22,
        text_input_tokens: 33,
        text_output_tokens: 44,
        cached_text_input_tokens: 5,
        cached_audio_input_tokens: 7,
        duration_sec: 0,
      }),
    }));
  });

  it('ends the minted session idempotently through the unload-safe BFF port', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        clientSecret: 'ek_test',
        model: 'gpt-realtime',
        sessionId: 'session-1',
        tools: ['find_products', 'refine_search'],
        pushToTalk: true,
        turnDetection: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ released: true }));
    const client = new ProductFinderRealtimeBffClient({
      sessionEndEndpoint: '/v1/realtime/session/end',
      fetchImpl,
    });
    await client.mintSession(context);

    await expect(client.endSession({ sessionId: 'session-1' })).resolves.toEqual({ released: true });
    expect(client.getSessionId()).toBeNull();
    expect(fetchImpl).toHaveBeenLastCalledWith('/v1/realtime/session/end', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ sessionId: 'session-1' }),
    }));
    await expect(client.endSession({ sessionId: 'session-1' })).rejects.toMatchObject({
      code: 'realtime_session_mismatch',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects usage and end reports for a foreign session before the network', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      clientSecret: 'ek_test',
      model: 'gpt-realtime',
      sessionId: 'session-1',
      tools: ['find_products', 'refine_search'],
      pushToTalk: true,
      turnDetection: null,
    }));
    const client = new ProductFinderRealtimeBffClient({ fetchImpl });
    await client.mintSession(context);

    await expect(client.reportUsage({
      sessionId: 'foreign',
      usageEventId: 'resp_1',
      audioInputTokens: 1,
      audioOutputTokens: 0,
      textInputTokens: 0,
      textOutputTokens: 0,
      cachedTextInputTokens: 0,
      cachedAudioInputTokens: 0,
      durationSec: 0,
    })).rejects.toMatchObject({ code: 'realtime_session_mismatch' });
    await expect(client.endSession({ sessionId: 'foreign' })).rejects.toMatchObject({
      code: 'realtime_session_mismatch',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
