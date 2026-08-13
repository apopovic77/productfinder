import { describe, expect, it } from 'vitest';
import { buildProductsRequestUrl } from './ProductRepository';

describe('buildProductsRequestUrl brand contract', () => {
  it('passes the exact facet string and always requires an image', () => {
    const url = new URL(buildProductsRequestUrl({
      brand: "O'Neal",
      limit: 10000,
      search: 'helmet',
    }), 'https://productfinder.test');

    expect(url.searchParams.get('brand')).toBe("O'Neal");
    expect(url.searchParams.get('has_image')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('10000');
    expect(url.searchParams.get('search')).toBe('helmet');
  });
});
