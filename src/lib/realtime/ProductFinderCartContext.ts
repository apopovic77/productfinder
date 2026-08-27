import type { Product, ProductVariant } from '../../types/Product';
import type { ProductFinderCartContext } from './ProductFinderRealtimeController';

export interface ProductFinderCartSourceItem {
  readonly productId: string | number;
  readonly color?: string;
  readonly quantity: number;
  readonly sizes?: Readonly<Record<string, number>>;
  readonly priceEur?: number;
}

function isEur(currency: unknown): boolean {
  if (currency === undefined || currency === null || currency === '') return true;
  const normalized = String(currency).trim().toUpperCase();
  return normalized === 'EUR' || normalized === '€';
}

function finitePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Reads the exact numeric EUR price used by the selected catalog variant. */
export function resolveProductPriceEur(
  product: Product,
  variant?: ProductVariant | null,
): number | null {
  if (variant && typeof variant.price === 'number') {
    return isEur(variant.currency) ? finitePrice(variant.price) : null;
  }
  if (variant?.price && typeof variant.price === 'object') {
    if (!isEur(variant.price.currency)) return null;
    const gross = finitePrice(variant.price.gross);
    if (gross !== null) return gross;
  }
  if (product.price && isEur(product.price.currency)) {
    return finitePrice(product.price.value);
  }
  return null;
}

/**
 * Projects the browser cart into the narrow BFF contract.
 * Names, SKUs, variant keys, media and URLs are deliberately not part of the
 * source interface and cannot cross this boundary.
 */
export function buildProductFinderCartContext(
  source: readonly ProductFinderCartSourceItem[],
): ProductFinderCartContext | null {
  const items = source.flatMap(item => {
    const productId = Number(item.productId);
    const priceEur = finitePrice(item.priceEur);
    if (!Number.isSafeInteger(productId) || productId < 1 || priceEur === null) return [];
    const color = item.color?.trim() || undefined;
    const sizes = Object.entries(item.sizes ?? {})
      .filter(([, quantity]) => Number.isSafeInteger(quantity) && quantity > 0)
      .map(([size, quantity]) => ({
        productId,
        ...(size.trim() ? { size: size.trim() } : {}),
        ...(color ? { color } : {}),
        quantity,
        priceEur,
      }));
    if (sizes.length > 0) return sizes;
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) return [];
    return [{
      productId,
      ...(color ? { color } : {}),
      quantity: item.quantity,
      priceEur,
    }];
  });
  if (items.length === 0) return null;
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalEur = Number(items.reduce(
    (sum, item) => sum + item.quantity * item.priceEur,
    0,
  ).toFixed(2));
  return Object.freeze({ items: Object.freeze(items), count, totalEur });
}
