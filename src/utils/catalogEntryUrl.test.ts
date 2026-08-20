import { describe, expect, it } from 'vitest';
import { buildCatalogUrl, readCatalogQuery } from './catalogEntryUrl';

describe('catalog entry URL', () => {
  it('stores stable guided-entry values while preserving unrelated query and hash', () => {
    const result = buildCatalogUrl('https://example.test/catalog?renderer=arcturian#hero', {
      lang: 'en',
      brand: "O'Neal",
      sport: 'moto',
      category: 'mx-gear',
    });
    const url = new URL(result, 'https://example.test');
    expect(url.searchParams.get('renderer')).toBe('arcturian');
    expect(readCatalogQuery(url.href)).toEqual({
      lang: 'en',
      brand: "O'Neal",
      sport: 'moto',
      category: 'mx-gear',
    });
    expect(url.hash).toBe('#hero');
  });

  it('removes only explicitly cleared dependent values', () => {
    const result = buildCatalogUrl('https://example.test/?lang=de&brand=O%27Neal&sport=moto&category=boots', {
      sport: null,
      category: null,
    });
    expect(readCatalogQuery(new URL(result, 'https://example.test').href)).toEqual({
      lang: 'de',
      brand: "O'Neal",
      sport: null,
      category: null,
    });
  });
});

