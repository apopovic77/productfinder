export type ProductTapStage = 'preview' | 'detail';

/**
 * Product selection is deliberately progressive:
 * the first tap focuses the product and opens the compact preview, while a
 * second tap on that same product advances to the immersive V4 detail.
 */
export function resolveProductTapStage(
  selectedProductId: string | null | undefined,
  tappedProductId: string,
): ProductTapStage {
  return selectedProductId === tappedProductId ? 'detail' : 'preview';
}
