import { useEffect, useRef } from 'react';
import { usePreloader } from 'react-asset-preloader';
import { fetchProducts } from '../data/ProductRepository';
import { buildMediaUrl } from '../utils/MediaUrlBuilder';
import { getImagesForVariant, getPrimaryVariant } from '../utils/variantImageHelpers';

/**
 * Hook to preload all product images on app startup
 *
 * Registers all product images with the preloader and starts loading
 * when the app mounts.
 */
export function useProductPreloader() {
  const { registerAssets, startLoading, state } = usePreloader();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const loadProductImages = async () => {
      try {
        console.log('[Preloader] 🚀 Starting product image preload...');
        const startTime = performance.now();

        // Fetch all products
        console.log('[Preloader] 📦 Fetching products from API...');
        const products = await fetchProducts({ limit: 1000 });
        const fetchTime = performance.now() - startTime;
        console.log(`[Preloader] ✅ Fetched ${products.length} products in ${fetchTime.toFixed(0)}ms`);

        // Build asset list
        const assets = [];
        let productsWithImages = 0;
        let productsWithoutImages = 0;

        console.log('[Preloader] 🔍 Analyzing product images...');
        for (const product of products) {
          // Get primary variant for the product
          const primaryVariant = getPrimaryVariant(product);
          if (!primaryVariant) {
            productsWithoutImages++;
            continue;
          }

          // Get all images for the variant
          const images = getImagesForVariant(product, primaryVariant);

          if (images.length === 0) {
            productsWithoutImages++;
            continue;
          }

          productsWithImages++;

          // ONLY load the FIRST/HERO image (not all gallery images)
          const heroImage = images.find(img => img.role === 'hero') || images[0];

          if (!heroImage || !heroImage.storageId) {
            productsWithoutImages++;
            continue;
          }

          // Build THUMBNAIL URL (130px @ 85% quality - fast loading!)
          const url = buildMediaUrl({
            storageId: heroImage.storageId,
            width: 130,
            quality: 85,
            trim: true,
          });

          console.log(`[Preloader]   📸 ${product.name} (${product.id}): ${heroImage.role} image, storageId: ${heroImage.storageId}`);

          assets.push({
            id: `${product.id}-${heroImage.storageId}`,
            type: 'image' as const,
            src: url,
            priority: 1,
            metadata: {
              productId: product.id,
              storageId: heroImage.storageId,
            },
          });
        }

        console.log(`[Preloader] 📊 Summary: ${productsWithImages} products with images, ${productsWithoutImages} without images`);
        console.log(`[Preloader] 🎯 Registering ${assets.length} total images for preloading`);

        // Register all assets
        registerAssets(assets);

        console.log('[Preloader] ⏳ Starting image download...');
        // Start preloading
        await startLoading();

        const totalTime = performance.now() - startTime;
        console.log(`[Preloader] ✨ Complete! Total time: ${totalTime.toFixed(0)}ms (${(totalTime / 1000).toFixed(1)}s)`);

      } catch (error) {
        console.error('[Preloader] ❌ Failed to load products:', error);
      }
    };

    loadProductImages();
  }, [registerAssets, startLoading]);

  return state;
}
