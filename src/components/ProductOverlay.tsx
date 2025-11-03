import React from 'react';
import type { Product } from '../types/Product';
import './ProductOverlay.css';

type ProductOverlayProps = {
  product: Product;
  anchorX: number;  // Product center X in world coordinates
  anchorY: number;  // Product center Y in world coordinates
  canvasWidth: number;
  canvasHeight: number;
  viewportScale: number;
  viewportOffsetX: number;
  viewportOffsetY: number;
  onClose?: () => void;
};

/**
 * Product Overlay Component
 * Displays a modal/card overlay next to the product in Hero Mode
 *
 * Alternative to force-directed labels - shows all info in a styled card
 */
export const ProductOverlay: React.FC<ProductOverlayProps> = ({
  product,
  anchorX,
  anchorY,
  canvasWidth,
  canvasHeight,
  viewportScale,
  viewportOffsetX,
  viewportOffsetY,
  onClose,
}) => {
  // Position in world coordinates - overlay to the right of product
  const overlayWidth = 320 / viewportScale; // Scale-adjusted width
  const overlayOffset = 40 / viewportScale;

  const left = anchorX + overlayOffset;
  const top = anchorY - (150 / viewportScale); // Center vertically

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 20,
        transform: `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${viewportScale})`,
        transformOrigin: '0 0',
      }}
    >
      {/* Overlay card */}
      <div
        className="product-overlay-card"
        style={{
          position: 'absolute',
          left,
          top,
          width: overlayWidth,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="product-overlay-header">
          <h3 className="product-overlay-title">{product.name}</h3>
          {onClose && (
            <button
              className="product-overlay-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Price */}
        {product.price?.value && (
          <div className="product-overlay-price">
            € {product.price.value.toFixed(2)}
          </div>
        )}

        {/* Details */}
        <div className="product-overlay-details">
          {product.category?.[0] && (
            <div className="product-overlay-detail">
              <span className="product-overlay-label">Category:</span>
              <span className="product-overlay-value">{product.category[0]}</span>
            </div>
          )}

          {product.brand && (
            <div className="product-overlay-detail">
              <span className="product-overlay-label">Brand:</span>
              <span className="product-overlay-value">{product.brand}</span>
            </div>
          )}

          {product.weight && (
            <div className="product-overlay-detail">
              <span className="product-overlay-label">Weight:</span>
              <span className="product-overlay-value">{product.weight}g</span>
            </div>
          )}

          {product.season && (
            <div className="product-overlay-detail">
              <span className="product-overlay-label">Season:</span>
              <span className="product-overlay-value">{product.season}</span>
            </div>
          )}
        </div>

        {/* Optional features section */}
        {product.description && (
          <div className="product-overlay-features">
            <h4>Features:</h4>
            <ul>
              {product.description.split('\n').filter(Boolean).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="product-overlay-actions">
          <button className="product-overlay-button product-overlay-button-primary">
            Add to Cart
          </button>
          <button className="product-overlay-button product-overlay-button-secondary">
            360° View
          </button>
        </div>
      </div>
    </div>
  );
};
