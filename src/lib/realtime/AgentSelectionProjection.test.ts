import { describe, expect, it } from 'vitest';
import type { Product } from '../../types/Product';
import { resolveAgentSelectionProducts } from './AgentSelectionProjection';

const product = (id: string): Product => ({ id, name: id } as Product);

describe('resolveAgentSelectionProducts', () => {
  it('preserves server ordering across the whole catalog', () => {
    const first = product('first');
    const second = product('second');

    expect(resolveAgentSelectionProducts([first, second], ['second', 'first'])).toEqual({
      applied: true,
      productIds: ['second', 'first'],
      missingProductIds: [],
      products: [second, first],
    });
  });

  it('rejects a silent partial result when one resolved ID is absent', () => {
    expect(resolveAgentSelectionProducts([product('known')], ['known', 'missing'])).toEqual({
      applied: false,
      productIds: ['known', 'missing'],
      missingProductIds: ['missing'],
      products: [],
    });
  });
});
