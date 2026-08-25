import type { Product } from '../../types/Product';

export type AgentSelectionResolution = Readonly<{
  applied: boolean;
  productIds: readonly string[];
  missingProductIds: readonly string[];
  products: readonly Product[];
}>;

/**
 * Resolve a server-owned ordered ID list against the browser catalog.
 *
 * Missing IDs reject the whole projection. Partial results would shift the
 * visible 1-based slots and make a later spoken comparison address the wrong
 * products.
 */
export function resolveAgentSelectionProducts(
  catalog: readonly Product[],
  productIds: readonly string[],
): AgentSelectionResolution {
  const byId = new Map(catalog.map(product => [product.id, product]));
  const uniqueIds = Array.from(new Set(productIds));
  const missingProductIds = uniqueIds.filter(id => !byId.has(id));
  if (uniqueIds.length === 0 || missingProductIds.length > 0) {
    return { applied: false, productIds: uniqueIds, missingProductIds, products: [] };
  }
  return {
    applied: true,
    productIds: uniqueIds,
    missingProductIds: [],
    products: uniqueIds.map(id => byId.get(id)!),
  };
}
