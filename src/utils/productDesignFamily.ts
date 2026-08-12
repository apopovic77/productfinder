import type { Product } from '../types/Product';

type DesignFamilyProduct = Pick<Product, 'id' | 'name' | 'getAttributeValue'>;

function normalizeDesignGroup(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

/**
 * Selects only products that belong to the current product's exact design.
 *
 * `product_code` is intentionally not a fallback: it identifies broad article
 * families and can contain hundreds of historically unrelated designs.
 */
export function selectExactDesignFamily<T extends DesignFamilyProduct>(
  current: T,
  candidates: readonly T[],
): T[] {
  const designGroup = normalizeDesignGroup(current.getAttributeValue('design_group'));
  if (!designGroup) return [current];

  const selected: T[] = [];
  const seenIds = new Set<string>();
  const add = (candidate: T) => {
    const key = String(candidate.id);
    if (!seenIds.has(key)) {
      seenIds.add(key);
      selected.push(candidate);
    }
  };

  add(current);
  candidates.forEach(candidate => {
    if (normalizeDesignGroup(candidate.getAttributeValue('design_group')) === designGroup) {
      add(candidate);
    }
  });

  return selected;
}

export function getDesignFamilyLabel(product: DesignFamilyProduct): string {
  const colorName = product.getAttributeValue<string>('color_name')?.trim();
  if (colorName) return colorName;

  const designGroup = product.getAttributeValue<string>('design_group')?.trim();
  if (designGroup && product.name.toLocaleLowerCase().startsWith(designGroup.toLocaleLowerCase())) {
    return product.name.slice(designGroup.length).trim() || product.name;
  }

  return product.name;
}
