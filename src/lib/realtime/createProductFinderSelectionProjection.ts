import type { ProductFinderController } from '../../controller/ProductFinderController';
import { ONEAL_API_BASE, ONEAL_API_KEY } from '../../config/apiConfig';
import { mapProductSummary } from '../../data/ProductRepository';
import { ProductFinderSelectionProjection } from './ProductFinderSelectionProjection';
import { ProductSelectionResolveClient } from './ProductSelectionResolveClient';

/**
 * Bind the browser projection to the exact Product API resolve contract.
 *
 * The compatibility API key is intentionally not treated as authority. The
 * resolver additionally requires the trusted session ID returned by the BFF
 * mint port; until that mint exists this factory cannot resolve a selection.
 */
export function createProductFinderSelectionProjection(
  controller: ProductFinderController,
  getSessionId: () => string | null,
): ProductFinderSelectionProjection {
  return new ProductFinderSelectionProjection({
    controller,
    getSessionId,
    resolver: new ProductSelectionResolveClient({
      endpoint: `${ONEAL_API_BASE}/realtime/selections/resolve`,
      apiKey: ONEAL_API_KEY,
    }),
    mapSummary: mapProductSummary,
  });
}
