export type CatalogQueryState = {
  lang: string | null;
  brand: string | null;
  sport: string | null;
  category: string | null;
};

export type CatalogQueryPatch = Partial<Record<keyof CatalogQueryState, string | null>>;

const CATALOG_QUERY_KEYS: Array<keyof CatalogQueryState> = ['lang', 'brand', 'sport', 'category'];

export function readCatalogQuery(href: string): CatalogQueryState {
  const url = new URL(href);
  return {
    lang: url.searchParams.get('lang'),
    brand: url.searchParams.get('brand'),
    sport: url.searchParams.get('sport'),
    category: url.searchParams.get('category'),
  };
}

export function buildCatalogUrl(currentHref: string, patch: CatalogQueryPatch): string {
  const url = new URL(currentHref);
  for (const key of CATALOG_QUERY_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function writeCatalogUrl(patch: CatalogQueryPatch, mode: 'push' | 'replace' = 'push'): void {
  const nextUrl = buildCatalogUrl(window.location.href, patch);
  const nextCatalog = readCatalogQuery(new URL(nextUrl, window.location.href).href);
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](
    { catalogEntry: nextCatalog },
    '',
    nextUrl,
  );
  window.dispatchEvent(new Event('cataloglocationchange'));
}
