import { describe, expect, it } from 'vitest';
import { Product } from '../../types/Product';
import { buildProductFinderCartContext, resolveProductPriceEur } from './ProductFinderCartContext';

describe('ProductFinderCartContext', () => {
  it('uses a maintained numeric EUR variant price without parsing display text', () => {
    const product = new Product({
      id: '123', name: 'Helmet', category: [],
      price: { value: 99.99, currency: 'EUR', formatted: '€ 99,99' },
    });
    expect(resolveProductPriceEur(product, {
      name: 'Black', price: { gross: 119.99, currency: 'EUR' },
    })).toBe(119.99);
    expect(resolveProductPriceEur(product, {
      name: 'USD', price: 80, currency: 'USD',
    })).toBeNull();
  });

  it('flattens positive size quantities and exposes no product content or SKU', () => {
    const context = buildProductFinderCartContext([{
      productId: '123',
      color: ' Schwarz ',
      quantity: 3,
      sizes: { S: 1, M: 2, L: 0 },
      priceEur: 119.99,
      name: 'must not cross',
      sku: 'must not cross',
      url: 'https://must-not-cross.test',
    } as never]);

    expect(context).toEqual({
      items: [
        { productId: 123, size: 'S', color: 'Schwarz', quantity: 1, priceEur: 119.99 },
        { productId: 123, size: 'M', color: 'Schwarz', quantity: 2, priceEur: 119.99 },
      ],
      count: 3,
      totalEur: 359.97,
    });
    expect(JSON.stringify(context)).not.toMatch(/name|sku|url|variantKey/i);
  });

  it('uses null as the explicit clear contract for an empty or unpriced cart', () => {
    expect(buildProductFinderCartContext([])).toBeNull();
    expect(buildProductFinderCartContext([{
      productId: 123, quantity: 1, priceEur: undefined,
    }])).toBeNull();
  });
});
