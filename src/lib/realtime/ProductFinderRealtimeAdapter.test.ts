import { describe, expect, it, vi } from 'vitest';
import { APP_COMMAND_KEY } from '../../../libs/realtime-agent-web-core/dist/index.js';
import {
  ProductFinderRealtimeAdapter,
  SHOW_PRODUCT_RESULTS_COMMAND,
  parseShowProductResultsArgs,
} from './ProductFinderRealtimeAdapter';

describe('ProductFinderRealtimeAdapter', () => {
  it('hands audio ownership to the host for the full session lifecycle', () => {
    const setRealtimeOwned = vi.fn();
    const adapter = new ProductFinderRealtimeAdapter({
      selectionProjection: { showSelection: vi.fn() },
      audioOwnership: { setRealtimeOwned },
    });

    adapter.core.beginOpen();
    expect(setRealtimeOwned).toHaveBeenLastCalledWith(true);
    adapter.core.failOpen(new Error('test'));
    expect(setRealtimeOwned).toHaveBeenLastCalledWith(false);
  });

  it('projects only an opaque server selection token', async () => {
    const showSelection = vi.fn(async () => undefined);
    const adapter = new ProductFinderRealtimeAdapter({
      selectionProjection: { showSelection },
    });
    adapter.core.beginOpen({
      brand: "O'Neal",
      language: 'de',
      collection_year: 2027,
      entry_selection: { sport_id: 'mtb', category_id: 'helmets' },
    });
    adapter.core.markReady();

    const result = await adapter.core.runToolCall(
      { name: 'find_products', args: { sport: 'mtb' } },
      async () => ({
        status: 'matches',
        count: 4,
        [APP_COMMAND_KEY]: {
          name: SHOW_PRODUCT_RESULTS_COMMAND,
          args: { selection_token: 'selection-token-1' },
        },
      }),
    );

    expect(showSelection).toHaveBeenCalledWith('selection-token-1');
    expect(result.cleanResult).toEqual({ status: 'matches', count: 4 });
    expect(result.commandHandled).toBe(true);
  });

  it('rejects a command that smuggles product IDs from the model', async () => {
    const showSelection = vi.fn();
    const adapter = new ProductFinderRealtimeAdapter({
      selectionProjection: { showSelection },
    });
    adapter.core.beginOpen();
    adapter.core.markReady();

    const result = await adapter.core.runToolCall(
      { name: 'find_products', args: {} },
      async () => ({
        status: 'matches',
        [APP_COMMAND_KEY]: {
          name: SHOW_PRODUCT_RESULTS_COMMAND,
          args: { selection_token: 'selection-token-1', product_ids: ['invented'] },
        },
      }),
    );

    expect(showSelection).not.toHaveBeenCalled();
    expect(result.commandHandled).toBe(false);
  });

  it('validates token shape fail-closed', () => {
    expect(parseShowProductResultsArgs({ selection_token: ' token ' }))
      .toEqual({ selection_token: 'token' });
    expect(parseShowProductResultsArgs({ selection_token: '' })).toBeNull();
    expect(parseShowProductResultsArgs({ selection_token: 'x', price: 99 })).toBeNull();
  });
});
