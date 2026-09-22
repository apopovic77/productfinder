import { describe, expect, it } from 'vitest';
import { CATALOG_ENTRY_CONFIG, getCatalogSportBanner } from '../config/CatalogEntryConfig';
import { Product, ProductAttribute } from '../types/Product';
import { countCatalogCategoryProducts, matchesCatalogEntrySelection, resolveCatalogCategory } from './catalogEntry';

/**
 * Seit 2026-09-22 lesen gefuehrter Einstieg und voller Finder denselben
 * Baum (oneal.eu: MTB · MX · Motorrad · Frauen · Kinder · Merchandise).
 * Die Knoten pruefen Attribute, nicht mehr ERP-Kategorienamen — deshalb
 * setzen die Testprodukte sport, product_type, category_primary und
 * target_group wie die API sie liefert.
 */
function product(fields: Record<string, string>, name = 'Testprodukt'): Product {
  const attributes: Record<string, ProductAttribute> = {};
  for (const [key, value] of Object.entries(fields)) {
    attributes[key] = new ProductAttribute({ key, label: key, type: 'enum', value, sourcePath: 'test' });
  }
  return new Product({
    id: `${name}:${Object.values(fields).join('+')}`,
    name,
    category: [fields.category_primary ?? ''],
    attributes,
    raw: { category: fields.category_primary, properties: fields },
  });
}

const mxHelmet = { sport: 'MX', product_type: 'Helm', category_primary: 'Helmets MX', target_group: 'Erwachsene' };
const mxGlove = { sport: 'MX', product_type: 'Handschuh', category_primary: 'Gloves', target_group: 'Erwachsene' };

describe('Einstieg liest den Shop-Baum', () => {
  it('zeigt auf erster Ebene die sechs Shop-Bereiche', () => {
    expect(CATALOG_ENTRY_CONFIG.sports.map(sport => sport.id))
      .toEqual(['mtb', 'mx', 'motorrad', 'frauen', 'kinder', 'merchandise']);
  });

  it('nennt die zweite Ebene wie der Shop', () => {
    expect(CATALOG_ENTRY_CONFIG.categoriesBySport.mx.map(entry => entry.id))
      .toEqual(['helme', 'brillen', 'kleidung', 'protektoren', 'stiefel', 'accessories', 'ersatzteile']);
  });

  it('ordnet einen MX-Helm dem Knoten MX > Helme zu', () => {
    expect(matchesCatalogEntrySelection(product(mxHelmet), { sportId: 'mx', categoryId: 'helme' })).toBe(true);
    expect(matchesCatalogEntrySelection(product(mxGlove), { sportId: 'mx', categoryId: 'helme' })).toBe(false);
  });

  it('haelt MX+MTB-Produkte in beiden Welten (ANY-Sport)', () => {
    const shared = product({ ...mxHelmet, sport: 'MX, MTB' });
    expect(matchesCatalogEntrySelection(shared, { sportId: 'mx', categoryId: 'helme' })).toBe(true);
  });

  it('fuehrt Jugendliche unter Kinder statt unter MX', () => {
    const youth = product({ ...mxGlove, target_group: 'Jugendliche' });
    expect(matchesCatalogEntrySelection(youth, { sportId: 'mx', categoryId: 'kleidung' })).toBe(false);
    expect(matchesCatalogEntrySelection(youth, { sportId: 'kinder', categoryId: 'kinder-mx' })).toBe(true);
  });

  it('zaehlt ueber alle Produkttypen eines Knotens', () => {
    const products = [
      product({ sport: 'MX', product_type: 'Jersey', category_primary: 'Jerseys Offroad', target_group: 'Erwachsene' }),
      product({ sport: 'MX', product_type: 'Hose', category_primary: 'Pants MX', target_group: 'Erwachsene' }),
      product({ sport: 'MX', product_type: 'Hose', category_primary: 'Pants MX', target_group: 'Jugendliche' }),
      product(mxHelmet),
    ];
    expect(countCatalogCategoryProducts(products, 'mx', 'kleidung')).toBe(2);
    expect(countCatalogCategoryProducts(products, 'kinder', 'kinder-mx')).toBe(1);
  });

  it('benennt die Pivot-Spalte nach dem Knoten des Produkts', () => {
    expect(resolveCatalogCategory(product(mxHelmet), 'mx')?.id).toBe('helme');
    expect(resolveCatalogCategory(product(mxGlove), 'mx')?.id).toBe('kleidung');
  });

  it('nimmt Marken-Motive, behaelt aber den allgemeinen Fallback', () => {
    const mx = CATALOG_ENTRY_CONFIG.sports.find(sport => sport.id === 'mx')!;
    const mtb = CATALOG_ENTRY_CONFIG.sports.find(sport => sport.id === 'mtb')!;
    expect(getCatalogSportBanner(mx, 'Kini Red Bull')?.storageId).toBe(30976);
    expect(getCatalogSportBanner(mtb, 'Kini Red Bull')?.storageId).toBe(31537);
    expect(getCatalogSportBanner(mx, 'ONE Industries')?.storageId).toBe(31795);
    expect(getCatalogSportBanner(mtb, 'ONE Industries')?.storageId).toBe(31802);
    expect(getCatalogSportBanner(mx, 'Unknown brand')).toBe(mx.banner);
    expect(getCatalogSportBanner(mtb, null)).toBe(mtb.banner);
  });
});
