import React from 'react';
import { ForceLabels } from '@arkturian/react-force-labels';
import type { Label } from '@arkturian/react-force-labels';
import { Vector2 } from 'arkturian-typescript-utils';
import type { Product } from '../types/Product';

type ProductAnnotationsProps = {
  product: Product;
  anchorX: number;  // Product center X in world coordinates
  anchorY: number;  // Product center Y in world coordinates
  canvasWidth: number;
  canvasHeight: number;
  viewportScale: number;
  viewportOffsetX: number;
  viewportOffsetY: number;
};

/**
 * Product Annotations Component
 * Displays force-directed labels around a product in Hero Mode
 *
 * Labels automatically position themselves using physics simulation
 * to avoid overlaps and maintain readable spacing
 */
export const ProductAnnotations: React.FC<ProductAnnotationsProps> = ({
  product,
  anchorX,
  anchorY,
  canvasWidth,
  canvasHeight,
  viewportScale,
  viewportOffsetX,
  viewportOffsetY,
}) => {
  // Transform world coordinates to screen coordinates
  const screenX = anchorX * viewportScale + viewportOffsetX;
  const screenY = anchorY * viewportScale + viewportOffsetY;

  // Build labels array from product data
  const labels: Label[] = [];

  // Price (highest priority - stays closest)
  if (product.price?.value) {
    labels.push({
      id: 'price',
      anchor: new Vector2(screenX, screenY - 80),
      content: `€ ${product.price.value.toFixed(2)}`,
      priority: 5,
    });
  }

  // Product name
  labels.push({
    id: 'name',
    anchor: new Vector2(screenX - 120, screenY),
    content: product.name,
    priority: 4,
  });

  // Category
  if (product.category?.[0]) {
    labels.push({
      id: 'category',
      anchor: new Vector2(screenX + 100, screenY + 60),
      content: product.category[0],
      priority: 2,
    });
  }

  // Weight
  if (product.weight) {
    labels.push({
      id: 'weight',
      anchor: new Vector2(screenX - 100, screenY + 80),
      content: `${product.weight}g`,
      priority: 2,
    });
  }

  // Season
  if (product.season) {
    labels.push({
      id: 'season',
      anchor: new Vector2(screenX + 90, screenY - 60),
      content: `Season ${product.season}`,
      priority: 1,
    });
  }

  // Brand
  if (product.brand) {
    labels.push({
      id: 'brand',
      anchor: new Vector2(screenX - 80, screenY - 70),
      content: product.brand,
      priority: 3,
    });
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none', // Let clicks pass through to canvas
      }}
    >
      <ForceLabels
        labels={labels}
        width={canvasWidth}
        height={canvasHeight}
        showConnectors={true}
        forceConfig={{
          anchorStrength: 0.15,
          repulsionStrength: 100,
          repulsionRadius: 120,
          minDistance: 50,
          maxDistance: 180,
          enableCollision: true,
          collisionPadding: 12,
          friction: 0.88,
        }}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          textColor: '#1a1a1a',
          borderColor: '#3b82f6',
          borderWidth: 2,
          borderRadius: 8,
          fontSize: 14,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 600,
          padding: 10,
          shadow: true,
          opacity: 1,
        }}
      />
    </div>
  );
};
