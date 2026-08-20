import type { Product } from '../types/Product';
import {
  CATALOG_ENTRY_CONFIG,
  type CatalogCategoryConfig,
  type CatalogEntrySelection,
  type CatalogSportConfig,
} from '../config/CatalogEntryConfig';

type CatalogProduct = Pick<Product, 'attributes' | 'category' | 'raw'>;

function normalizedStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map(item => item.trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  return value.split(/[,;+]/).map(item => item.trim()).filter(Boolean);
}

function productSports(product: CatalogProduct): string[] {
  const properties = (product.raw?.properties ?? {}) as Record<string, unknown>;
  const rawSports = normalizedStrings(properties.sport);
  if (rawSports.length > 0) return rawSports;
  return normalizedStrings(product.attributes.sport?.value);
}

function productCategory(product: CatalogProduct): string {
  const rawCategory = product.raw?.category;
  if (typeof rawCategory === 'string' && rawCategory.trim()) return rawCategory.trim();
  const attributeCategory = product.attributes.category_primary?.value;
  if (typeof attributeCategory === 'string' && attributeCategory.trim()) return attributeCategory.trim();
  return product.category[0] ?? '';
}

function productTargetGroup(product: CatalogProduct): string {
  const properties = (product.raw?.properties ?? {}) as Record<string, unknown>;
  const rawTargetGroup = properties.target_group;
  if (typeof rawTargetGroup === 'string') return rawTargetGroup.trim();
  const attributeTargetGroup = product.attributes.target_group?.value;
  return typeof attributeTargetGroup === 'string' ? attributeTargetGroup.trim() : '';
}

export function getCatalogSport(sportId: string): CatalogSportConfig | undefined {
  return CATALOG_ENTRY_CONFIG.sports.find(sport => sport.id === sportId);
}

export function getCatalogCategory(
  sportId: string,
  categoryId: string,
): CatalogCategoryConfig | undefined {
  return CATALOG_ENTRY_CONFIG.categoriesBySport[sportId]?.find(category => category.id === categoryId);
}

export function matchesCatalogEntrySelection(
  product: CatalogProduct,
  selection: CatalogEntrySelection,
): boolean {
  const sport = getCatalogSport(selection.sportId);
  const category = getCatalogCategory(selection.sportId, selection.categoryId);
  if (!sport?.enabled || !category) return false;

  // ANY(sport): MX+MTB belongs to both worlds; this is deliberately not an
  // exclusive assignment.
  const sports = productSports(product);
  const matchesSport = sport.sportValues.some(value => sports.includes(value));
  return matchesSport
    && category.categories.includes(productCategory(product))
    && category.targetGroup === productTargetGroup(product);
}

export function filterCatalogProducts(
  products: readonly Product[],
  selection: CatalogEntrySelection,
): Product[] {
  return products.filter(product => matchesCatalogEntrySelection(product, selection));
}

export function countCatalogCategoryProducts(
  products: readonly Product[],
  sportId: string,
  categoryId: string,
): number {
  return filterCatalogProducts(products, { sportId, categoryId }).length;
}

