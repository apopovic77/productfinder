import { describe, expect, it } from 'vitest';
import { buildProductsRequestUrl } from './ProductRepository';
import { resolveCatalogScope } from '../config/CatalogEntryConfig';

describe('buildProductsRequestUrl brand contract', () => {
  it('passes the exact facet string and always loads Catalog 2028', () => {
    const url = new URL(buildProductsRequestUrl({
      brand: "O'Neal",
      limit: 10000,
      search: 'helmet',
    }), 'https://productfinder.test');

    expect(url.searchParams.get('brand')).toBe("O'Neal");
    expect(url.searchParams.get('workbook')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('10000');
    expect(url.searchParams.get('search')).toBe('helmet');
    // Katalog 2028 = Workbook: ohne Bild-, Jahres- und Relevanzfilter
    expect(url.searchParams.get('has_image')).toBeNull();
    expect(url.searchParams.get('collection_year')).toBeNull();
  });

  it('ignores an old ?catalog=2027 link', () => {
    expect(resolveCatalogScope('https://productfinder.test/?catalog=2027')).toBe('workbook');
    expect(resolveCatalogScope('https://productfinder.test/?catalog=default')).toBe('workbook');
  });
});
