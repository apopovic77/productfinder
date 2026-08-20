import { describe, expect, it } from 'vitest';
import { buildBrandUrl, resolveBrandEntry, type BrandFacet } from './brandSelection';

const brands: BrandFacet[] = [
  { name: "O'Neal", count: 6415, count_with_image: 579 },
  { name: 'KINI Red Bull', count: 43, count_with_image: 43 },
];

describe('resolveBrandEntry', () => {
  it('auto-selects the only available brand using its exact name', () => {
    expect(resolveBrandEntry([brands[0]], null)).toEqual({
      selectedBrand: "O'Neal",
      showSelector: false,
      autoSelected: true,
    });
  });

  it('accepts only an exact URL match when several brands exist', () => {
    expect(resolveBrandEntry(brands, 'KINI Red Bull').selectedBrand).toBe('KINI Red Bull');
    expect(resolveBrandEntry(brands, 'kini red bull')).toEqual({
      selectedBrand: null,
      showSelector: true,
      autoSelected: false,
    });
  });

  it('shows the selector when a multi-brand URL has no selection', () => {
    expect(resolveBrandEntry(brands, null).showSelector).toBe(true);
  });
});

describe('buildBrandUrl', () => {
  it('preserves renderer and hash while encoding the exact facet value', () => {
    expect(buildBrandUrl('https://example.test/?renderer=arcturian#demo', "O'Neal"))
      .toBe('/?renderer=arcturian&brand=O%27Neal#demo');
  });

  it('can clear sport and category when the user changes brand', () => {
    const result = buildBrandUrl(
      'https://example.test/catalog?lang=en&brand=Old&sport=moto&category=mx-gear',
      "O'Neal",
      { clearDependents: true },
    );
    const url = new URL(result, 'https://example.test');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('brand')).toBe("O'Neal");
    expect(url.searchParams.has('sport')).toBe(false);
    expect(url.searchParams.has('category')).toBe(false);
  });

  it('removes only the brand parameter', () => {
    expect(buildBrandUrl('https://example.test/?brand=O%27Neal&renderer=arcturian', null))
      .toBe('/?renderer=arcturian');
  });
});
