import { describe, expect, it } from 'vitest';
import { resolveCartLineSkus } from './cartSku';

const variants = [
  { sku: '0632-411', color: 'black/gray', size: 'XS', price: { gross: 119.99 } },
  { sku: '0626-111', color: 'black/gray', size: 'XS', price: { gross: null } },
  { sku: '0632-412', color: 'black/gray', size: 'S', price: { gross: 119.99 } },
  { sku: '0632-511', color: 'red', size: 'XS', price: { gross: 119.99 } },
];

describe('resolveCartLineSkus', () => {
  it('maps colour + size matrix to variant SKUs, preferring the line article prefix', () => {
    const r = resolveCartLineSkus(
      { articleNumber: '0632', color: 'black/gray', sizes: { XS: 2, S: 1 } },
      variants,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.lines).toEqual([
      { sku: '0632-411', size: 'XS', quantity: 2 },
      { sku: '0632-412', size: 'S', quantity: 1 },
    ]);
  });

  it('tolerates size suffixes and case differences', () => {
    const r = resolveCartLineSkus(
      { articleNumber: '0632', color: 'Black/Gray', sizes: { 'XS (53-54)': 1 } },
      variants,
    );
    expect(r.lines.map(l => l.sku)).toEqual(['0632-411']);
  });

  it('reports sizes without a matching variant instead of guessing', () => {
    const r = resolveCartLineSkus(
      { articleNumber: '0632', color: 'red', sizes: { XS: 1, XL: 3 } },
      variants,
    );
    expect(r.lines).toEqual([{ sku: '0632-511', size: 'XS', quantity: 1 }]);
    expect(r.unresolved).toEqual([{ size: 'XL', quantity: 3 }]);
  });

  it('falls back to the plain quantity when the size matrix is empty', () => {
    const r = resolveCartLineSkus(
      { articleNumber: '0632', color: 'red', quantity: 4 },
      variants,
    );
    expect(r.lines).toEqual([{ sku: '0632-511', size: '', quantity: 4 }]);
  });
});
