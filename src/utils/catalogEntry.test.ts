import { describe, expect, it } from 'vitest';
import { CATALOG_ENTRY_CONFIG, getCatalogSportBanner } from '../config/CatalogEntryConfig';
import { Product } from '../types/Product';
import { countCatalogCategoryProducts, matchesCatalogEntrySelection } from './catalogEntry';

function product(category: string, targetGroup: string, sports: string[]): Product {
  return new Product({
    id: `${category}:${targetGroup}:${sports.join('+')}`,
    name: category,
    category: [category],
    raw: {
      category,
      properties: {
        sport: sports,
        target_group: targetGroup,
      },
    },
  });
}

describe('catalog entry mapping', () => {
  it('keeps all 16 MOTO categories in one unique config list', () => {
    const categories = CATALOG_ENTRY_CONFIG.categoriesBySport.moto;
    expect(categories).toHaveLength(16);
    expect(new Set(categories.map(category => category.id)).size).toBe(16);
  });

  it('uses ANY(sport), so MX+MTB products remain part of MOTO', () => {
    const sharedHelmet = product('Helmets MX', 'Erwachsene', ['MX', 'MTB']);
    expect(matchesCatalogEntrySelection(sharedHelmet, {
      sportId: 'moto',
      categoryId: 'mx-helmets',
    })).toBe(true);
  });

  it('separates adult and youth tiles with the target group', () => {
    const adult = product('Gloves', 'Erwachsene', ['MX']);
    const youth = product('Gloves', 'Jugendliche', ['MX']);
    expect(matchesCatalogEntrySelection(adult, { sportId: 'moto', categoryId: 'gloves' })).toBe(true);
    expect(matchesCatalogEntrySelection(youth, { sportId: 'moto', categoryId: 'gloves' })).toBe(false);
    expect(matchesCatalogEntrySelection(youth, { sportId: 'moto', categoryId: 'youth-gloves' })).toBe(true);
  });

  it('counts every source category in a composite tile with the same matcher', () => {
    const products = [
      product('Jerseys Offroad', 'Erwachsene', ['MX']),
      product('Pants MX', 'Erwachsene', ['MX', 'MTB']),
      product('Pants MX', 'Jugendliche', ['MX']),
      product('Jerseys Offroad', 'Erwachsene', ['MTB']),
    ];
    expect(countCatalogCategoryProducts(products, 'moto', 'mx-gear')).toBe(2);
    expect(countCatalogCategoryProducts(products, 'moto', 'youth-gear')).toBe(1);
  });

  it('resolves sport artwork from the selected brand with a generic fallback', () => {
    const moto = CATALOG_ENTRY_CONFIG.sports.find(sport => sport.id === 'moto');
    const mtb = CATALOG_ENTRY_CONFIG.sports.find(sport => sport.id === 'mtb');
    expect(moto).toBeDefined();
    expect(mtb).toBeDefined();

    expect(getCatalogSportBanner(moto!, 'Kini Red Bull')?.storageId).toBe(30976);
    expect(getCatalogSportBanner(mtb!, 'Kini Red Bull')?.storageId).toBe(31537);
    expect(getCatalogSportBanner(moto!, 'ONE Industries')?.storageId).toBe(31795);
    expect(getCatalogSportBanner(mtb!, 'ONE Industries')?.storageId).toBe(31802);
    expect(getCatalogSportBanner(moto!, 'Unknown brand')).toBe(moto!.banner);
    expect(getCatalogSportBanner(mtb!, null)).toBe(mtb!.banner);
  });
});
