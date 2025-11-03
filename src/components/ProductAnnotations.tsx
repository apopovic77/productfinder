import React, { useRef, useMemo } from 'react';
import { ForceLabels } from 'react-force-labels';
import type { Label } from 'react-force-labels';
import { Vector2 } from 'arkturian-typescript-utils';
import type { Product } from '../types/Product';
import type { ForceLabelsConfig } from './DeveloperOverlay';

type ProductAnnotationsProps = {
  product: Product;
  anchorX: number;  // Product center X in world coordinates
  anchorY: number;  // Product center Y in world coordinates
  canvasWidth: number;
  canvasHeight: number;
  viewportScale: number;
  viewportOffsetX: number;
  viewportOffsetY: number;
  forceConfig: ForceLabelsConfig;
};

/**
 * Product Annotations Component
 * Displays force-directed labels around a product in Hero Mode
 *
 * Labels automatically position themselves using physics simulation
 * to avoid overlaps and maintain readable spacing
 */
const ProductAnnotationsComponent: React.FC<ProductAnnotationsProps> = ({
  product,
  anchorX,
  anchorY,
  canvasWidth,
  canvasHeight,
  viewportScale,
  viewportOffsetX,
  viewportOffsetY,
  forceConfig,
}) => {
  // Store STABLE label objects in ref to prevent recreation
  // Labels use WORLD COORDINATES (anchorX, anchorY) - the parent div handles viewport transform
  const labelsRef = useRef<{ labels: Label[]; productId: string } | null>(null);

  // Only recreate labels when product changes
  if (!labelsRef.current || labelsRef.current.productId !== product.id) {
    console.log('🔄 ProductAnnotations: Creating NEW labels for product', product.id);
    const result: Label[] = [];

    // Price (highest priority - stays closest)
    if (product.price?.value) {
      result.push({
        id: 'price',
        anchor: new Vector2(anchorX, anchorY - 80),
        content: `€ ${product.price.value.toFixed(2)}`,
        priority: 5,
      });
    }

    // Product name
    result.push({
      id: 'name',
      anchor: new Vector2(anchorX - 120, anchorY),
      content: product.name,
      priority: 4,
    });

    // Category
    if (product.category?.[0]) {
      result.push({
        id: 'category',
        anchor: new Vector2(anchorX + 100, anchorY + 60),
        content: product.category[0],
        priority: 2,
      });
    }

    // Weight
    if (product.weight) {
      result.push({
        id: 'weight',
        anchor: new Vector2(anchorX - 100, anchorY + 80),
        content: `${product.weight}g`,
        priority: 2,
      });
    }

    // Season
    if (product.season) {
      result.push({
        id: 'season',
        anchor: new Vector2(anchorX + 90, anchorY - 60),
        content: `Season ${product.season}`,
        priority: 1,
      });
    }

    // Brand
    if (product.brand) {
      result.push({
        id: 'brand',
        anchor: new Vector2(anchorX - 80, anchorY - 70),
        content: product.brand,
        priority: 3,
      });
    }

    labelsRef.current = { labels: result, productId: product.id };
  }

  // Use the STABLE labels array from ref
  const labels = labelsRef.current.labels;

  // Memoize forceConfig object to prevent recreation on every render
  const memoizedForceConfig = useMemo(() => ({
    anchorStrength: forceConfig.anchorStrength,
    repulsionStrength: forceConfig.repulsionStrength,
    repulsionRadius: forceConfig.repulsionRadius,
    minDistance: forceConfig.minDistance,
    maxDistance: forceConfig.maxDistance,
    enableCollision: true,
    collisionPadding: 12,
    friction: forceConfig.friction,
  }), [
    forceConfig.anchorStrength,
    forceConfig.repulsionStrength,
    forceConfig.repulsionRadius,
    forceConfig.minDistance,
    forceConfig.maxDistance,
    forceConfig.friction,
  ]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none', // Let clicks pass through to canvas
        zIndex: 10, // Above canvas
        transform: `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${viewportScale})`,
        transformOrigin: '0 0',
      }}
    >
      <ForceLabels
        key={product.id}
        labels={labels}
        width={canvasWidth / viewportScale}
        height={canvasHeight / viewportScale}
        showConnectors={true}
        forceConfig={memoizedForceConfig}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          textColor: '#1a1a1a',
          borderColor: '#3b82f6',
          borderWidth: 2,
          borderRadius: 8,
          fontSize: 14 / viewportScale,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 600,
          padding: 10 / viewportScale,
          shadow: true,
          opacity: 1,
        }}
      />
    </div>
  );
};

// Memoize component - viewport changes handled by CSS transform, no re-render needed!
// Only re-render when product or force config actually changes
export const ProductAnnotations = React.memo(ProductAnnotationsComponent, (prev, next) => {
  // Re-render only if product ID or force config changes
  // Viewport scale/offset changes are handled by CSS transform
  return (
    prev.product.id === next.product.id &&
    prev.anchorX === next.anchorX &&
    prev.anchorY === next.anchorY &&
    prev.forceConfig.anchorStrength === next.forceConfig.anchorStrength &&
    prev.forceConfig.repulsionStrength === next.forceConfig.repulsionStrength &&
    prev.forceConfig.repulsionRadius === next.forceConfig.repulsionRadius &&
    prev.forceConfig.minDistance === next.forceConfig.minDistance &&
    prev.forceConfig.maxDistance === next.forceConfig.maxDistance &&
    prev.forceConfig.friction === next.forceConfig.friction &&
    prev.canvasWidth === next.canvasWidth &&
    prev.canvasHeight === next.canvasHeight
    // Note: viewportScale and viewportOffset NOT compared - handled by CSS transform!
  );
});
