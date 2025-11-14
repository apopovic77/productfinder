import React, { useRef, useMemo, useState, useCallback } from 'react';
import { ForceLabels } from 'react-force-labels';
import type { Label } from 'react-force-labels';
import { Vector2 } from 'arkturian-typescript-utils';
import type { Product } from '../types/Product';
import type { ForceLabelsConfig } from './DeveloperOverlay';

type ProductAnnotationsProps = {
  product: Product;
  anchorX: number;  // Product center X in world coordinates
  anchorY: number;  // Product center Y in world coordinates
  productWidth?: number;   // Actual product width from trim bounds (in world coordinates)
  productHeight?: number;  // Actual product height from trim bounds (in world coordinates)
  canvasWidth: number;
  canvasHeight: number;
  viewportScale: number;
  viewportOffsetX: number;
  viewportOffsetY: number;
  forceConfig: ForceLabelsConfig;
};

/**
 * Individual Label Content Component
 */
const LabelContent: React.FC<{
  id: string;
  text: string;
  isHovered: boolean;
  viewportScale: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = React.memo(({ id, text, isHovered, viewportScale, onMouseEnter, onMouseLeave }) => {
  return (
    <div
      style={{
        position: 'relative',
        pointerEvents: 'all',
        cursor: 'pointer',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Circle dot */}
      <div
        style={{
          width: isHovered ? '16px' : '12px',
          height: isHovered ? '16px' : '12px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.95)',
          border: `2px solid #3b82f6`,
          boxShadow: isHovered
            ? '0 4px 12px rgba(59, 130, 246, 0.5)'
            : '0 2px 8px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.2s ease',
        }}
      />

      {/* Text label on hover */}
      {isHovered && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            color: '#1a1a1a',
            border: '2px solid #3b82f6',
            borderRadius: '8px',
            padding: `${10 / viewportScale}px`,
            fontSize: `${14 / viewportScale}px`,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
});

LabelContent.displayName = 'LabelContent';

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
  productWidth,
  productHeight,
  canvasWidth,
  canvasHeight,
  viewportScale,
  viewportOffsetX,
  viewportOffsetY,
  forceConfig,
}) => {
  const [hoveredLabelId, setHoveredLabelId] = useState<string | null>(null);

  // Create labels - must include hoveredLabelId in dependencies so labels update on hover
  const labels = useMemo(() => {
    const result: Label[] = [];

    // Calculate product bounds (use half-dimensions for positioning relative to center)
    const halfWidth = (productWidth ?? 200) / 2;   // Fallback to 200px if not provided
    const halfHeight = (productHeight ?? 200) / 2; // Fallback to 200px if not provided

    const handlers = {
      price: { onMouseEnter: () => setHoveredLabelId('price'), onMouseLeave: () => setHoveredLabelId(null) },
      name: { onMouseEnter: () => setHoveredLabelId('name'), onMouseLeave: () => setHoveredLabelId(null) },
      category: { onMouseEnter: () => setHoveredLabelId('category'), onMouseLeave: () => setHoveredLabelId(null) },
      weight: { onMouseEnter: () => setHoveredLabelId('weight'), onMouseLeave: () => setHoveredLabelId(null) },
      season: { onMouseEnter: () => setHoveredLabelId('season'), onMouseLeave: () => setHoveredLabelId(null) },
      brand: { onMouseEnter: () => setHoveredLabelId('brand'), onMouseLeave: () => setHoveredLabelId(null) },
    };

    // Price (highest priority - stays closest)
    // Position above the actual product (using trim bounds)
    if (product.price?.value) {
      result.push({
        id: 'price',
        anchor: new Vector2(anchorX, anchorY - halfHeight - 20),
        content: (
          <LabelContent
            id="price"
            text={`€ ${product.price.value.toFixed(2)}`}
            isHovered={hoveredLabelId === 'price'}
            viewportScale={viewportScale}
            {...handlers.price}
          />
        ),
        priority: 5,
      });
    }

    // Product name - position to the left of the actual product
    result.push({
      id: 'name',
      anchor: new Vector2(anchorX - halfWidth - 20, anchorY),
      content: (
        <LabelContent
          id="name"
          text={product.name}
          isHovered={hoveredLabelId === 'name'}
          viewportScale={viewportScale}
          {...handlers.name}
        />
      ),
      priority: 4,
    });

    // Category - position to the right and below the actual product
    if (product.category?.[0]) {
      result.push({
        id: 'category',
        anchor: new Vector2(anchorX + halfWidth + 20, anchorY + halfHeight / 2),
        content: (
          <LabelContent
            id="category"
            text={product.category[0]}
            isHovered={hoveredLabelId === 'category'}
            viewportScale={viewportScale}
            {...handlers.category}
          />
        ),
        priority: 2,
      });
    }

    // Weight - position to the left and below the actual product
    if (product.weight) {
      result.push({
        id: 'weight',
        anchor: new Vector2(anchorX - halfWidth - 20, anchorY + halfHeight - 20),
        content: (
          <LabelContent
            id="weight"
            text={`${product.weight}g`}
            isHovered={hoveredLabelId === 'weight'}
            viewportScale={viewportScale}
            {...handlers.weight}
          />
        ),
        priority: 2,
      });
    }

    // Season - position to the right and above the actual product
    if (product.season) {
      result.push({
        id: 'season',
        anchor: new Vector2(anchorX + halfWidth, anchorY - halfHeight),
        content: (
          <LabelContent
            id="season"
            text={`Season ${product.season}`}
            isHovered={hoveredLabelId === 'season'}
            viewportScale={viewportScale}
            {...handlers.season}
          />
        ),
        priority: 1,
      });
    }

    // Brand - position to the left and above the actual product
    if (product.brand) {
      result.push({
        id: 'brand',
        anchor: new Vector2(anchorX - halfWidth, anchorY - halfHeight - 40),
        content: (
          <LabelContent
            id="brand"
            text={product.brand}
            isHovered={hoveredLabelId === 'brand'}
            viewportScale={viewportScale}
            {...handlers.brand}
          />
        ),
        priority: 3,
      });
    }

    return result;
  }, [product.id, product.price?.value, product.name, product.category, product.weight, product.season, product.brand, anchorX, anchorY, productWidth, productHeight, viewportScale, hoveredLabelId]);

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
        pointerEvents: 'none',
        zIndex: 10,
        transform: `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${viewportScale})`,
        transformOrigin: '0 0',
      }}
    >
      <ForceLabels
        key={product.id}
        labels={labels}
        width={canvasWidth / viewportScale}
        height={canvasHeight / viewportScale}
        showConnectors={hoveredLabelId !== null}
        forceConfig={memoizedForceConfig}
        renderMode="html"
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
