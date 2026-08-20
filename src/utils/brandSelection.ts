export type BrandFacet = {
  name: string;
  count: number;
  count_with_image: number;
};

export type BrandEntryResolution = {
  selectedBrand: string | null;
  showSelector: boolean;
  autoSelected: boolean;
};

/** Resolve the entry state without ever normalizing a backend-owned brand. */
export function resolveBrandEntry(
  brands: readonly BrandFacet[],
  requestedBrand: string | null,
): BrandEntryResolution {
  if (brands.length === 0) {
    return { selectedBrand: null, showSelector: false, autoSelected: false };
  }

  if (brands.length === 1) {
    return { selectedBrand: brands[0].name, showSelector: false, autoSelected: requestedBrand !== brands[0].name };
  }

  const exactMatch = brands.find(brand => brand.name === requestedBrand);
  return exactMatch
    ? { selectedBrand: exactMatch.name, showSelector: false, autoSelected: false }
    : { selectedBrand: null, showSelector: true, autoSelected: false };
}

export function buildBrandUrl(
  currentHref: string,
  brand: string | null,
  options: { clearDependents?: boolean } = {},
): string {
  const url = new URL(currentHref);
  if (brand) url.searchParams.set('brand', brand);
  else url.searchParams.delete('brand');
  if (options.clearDependents) {
    url.searchParams.delete('sport');
    url.searchParams.delete('category');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
