import React, { useState, useEffect } from 'react';
import { fetchAnnotations, type Annotation } from '../services/StorageAnnotationService';
import { AnnotationDots } from './AnnotationDots';
import type { Product } from '../types/Product';

type ProductImageAnnotationsProps = {
  product: Product;
  imageX: number; // Product image top-left X in world coordinates
  imageY: number; // Product image top-left Y in world coordinates
  imageWidth: number; // Rendered image width in world coordinates
  imageHeight: number; // Rendered image height in world coordinates
  canvasWidth: number;
  canvasHeight: number;
  viewportScale: number;
  viewportOffsetX: number;
  viewportOffsetY: number;
};

/**
 * Product Image Annotations Component
 * Displays AI-generated annotation dots on product images in the canvas
 */
export const ProductImageAnnotations: React.FC<ProductImageAnnotationsProps> = ({
  product,
  imageX,
  imageY,
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  viewportScale,
  viewportOffsetX,
  viewportOffsetY,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Load annotations when product changes
  useEffect(() => {
    const storageId = getStorageId(product);
    if (storageId) {
      console.log('[ProductImageAnnotations] Loading annotations for storage ID:', storageId);
      fetchAnnotations(storageId).then((anns) => {
        console.log('[ProductImageAnnotations] Loaded annotations:', anns.length);
        setAnnotations(anns);
      });
    } else {
      setAnnotations([]);
    }
  }, [product.id]);

  if (annotations.length === 0 || imageWidth === 0 || imageHeight === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 11, // Above ProductAnnotations (z-index 10)
        transform: `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${viewportScale})`,
        transformOrigin: '0 0',
      }}
    >
      <AnnotationDots
        annotations={annotations}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        offsetX={imageX}
        offsetY={imageY}
      />
    </div>
  );
};

/**
 * Get storage ID from product media
 */
function getStorageId(product: Product): number | null {
  const media = product.media || [];
  const heroMedia = media.find((m) => m.type === 'hero') || media[0];
  return (heroMedia as any)?.storage_id || null;
}
