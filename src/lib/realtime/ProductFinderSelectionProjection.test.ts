import { describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from 'arkturian-oneal-sdk';
import type { Product } from '../../types/Product';
import { ProductFinderSelectionProjection } from './ProductFinderSelectionProjection';

const summary = (id: number): ProductSummary => ({ id, product_code: `P-${id}` });
const product = (id: string): Product => ({ id, name: id } as Product);

describe('ProductFinderSelectionProjection', () => {
  it('projects the exact server order and maps summaries missing from the loaded catalog', async () => {
    const loaded = product('2');
    const mapped = product('1');
    const setGlobalSearchProducts = vi.fn();
    const onSelectionProjected = vi.fn(async () => undefined);
    const projection = new ProductFinderSelectionProjection({
      controller: {
        getCatalogAllProducts: () => [loaded],
        setGlobalSearchProducts,
      } as never,
      resolver: {
        resolveSelection: vi.fn(async () => ({
          expires_at: '2026-08-25T19:00:00Z',
          count: 2,
          results: [summary(1), summary(2)],
        })),
      } as never,
      getSessionId: () => 'session-1',
      mapSummary: value => value.id === 1 ? mapped : null,
      onSelectionProjected,
    });

    await projection.showSelection('st_opaque');

    expect(setGlobalSearchProducts).toHaveBeenCalledWith([mapped, loaded]);
    expect(onSelectionProjected).toHaveBeenCalledWith(mapped);
  });

  it('fails closed without a minted session identity', async () => {
    const projection = new ProductFinderSelectionProjection({
      controller: {} as never,
      resolver: { resolveSelection: vi.fn() } as never,
      getSessionId: () => null,
      mapSummary: () => null,
    });

    await expect(projection.showSelection('st_opaque'))
      .rejects.toThrow('Realtime session identity is unavailable');
  });
});
