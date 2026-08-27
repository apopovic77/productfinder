import type { ProductSummary } from 'arkturian-oneal-sdk';
import type { ProductFinderController } from '../../controller/ProductFinderController';
import type { Product } from '../../types/Product';
import type { ProductSelectionProjectionPort } from './ProductFinderRealtimeAdapter';
import type { ProductSelectionResolveClient } from './ProductSelectionResolveClient';

export interface ProductFinderSelectionProjectionOptions {
  controller: ProductFinderController;
  resolver: ProductSelectionResolveClient;
  getSessionId(): string | null;
  mapSummary(summary: ProductSummary): Product | null;
  onSelectionProjected?(firstProduct: Product, count: number): void | Promise<void>;
}

/** Projects the server-frozen result order without trusting model/browser IDs. */
export class ProductFinderSelectionProjection implements ProductSelectionProjectionPort {
  private readonly options: ProductFinderSelectionProjectionOptions;

  constructor(options: ProductFinderSelectionProjectionOptions) {
    this.options = options;
  }

  async showSelection(selectionToken: string): Promise<void> {
    const sessionId = this.options.getSessionId();
    if (!sessionId) throw new Error('Realtime session identity is unavailable');
    const selection = await this.options.resolver.resolveSelection(selectionToken, sessionId);
    const loadedById = new Map(
      this.options.controller.getCatalogAllProducts().map(product => [product.id, product]),
    );
    const ordered = selection.results.map(summary => {
      const id = String(summary.id);
      return loadedById.get(id) ?? this.options.mapSummary(summary);
    });
    if (ordered.some(product => !product)) {
      throw new Error('Server selection contains an invalid product summary');
    }
    const products = ordered as Product[];
    this.options.controller.applyAgentProducts(products);
    await this.options.onSelectionProjected?.(products[0], products.length);
  }
}
