import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../types/Product';
import './ProductOverlayModal.css';

type Props = {
  product: Product;
  onClose: () => void;
  position?: { x: number; y: number }; // Optional position for panel mode
};

interface ParsedFeature {
  title: string;
  subtitle: string;
  icon: 'layer' | 'breathable' | 'sealed' | 'compatible' | 'waterproof' | 'default';
}

/**
 * Modern Product Overlay Modal - React Component Version
 * Full interactivity with real dropdowns, better accessibility
 * Can be used as full modal (centered) or positioned panel (next to product)
 */
export const ProductOverlayModal: React.FC<Props> = ({ product, onClose, position }) => {
  const isPanelMode = !!position;

  // Extract variants
  const variants = (product as any).variants || [];

  // Helper functions to parse variant name (e.g., "Black / Size S")
  const getColor = (variant: any): string => {
    if (variant.option1) return String(variant.option1);
    const parts = (variant.name || '').split('/').map((s: string) => s.trim());
    return parts[0] || variant.sku || 'Default';
  };

  const getSize = (variant: any): string => {
    if (variant.option2) return String(variant.option2);
    const parts = (variant.name || '').split('/').map((s: string) => s.trim());
    return parts[1] || '';
  };

  // Extract unique colors from all variants
  const allColors = [...new Set(variants.map(getColor).filter(Boolean))] as string[];

  // State for selected color and size
  const [selectedColor, setSelectedColor] = useState<string>(allColors[0] || '');
  const [selectedSize, setSelectedSize] = useState<string>('');

  // State for selected image
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  // Filter sizes based on selected color
  const availableSizes = [...new Set(
    variants
      .filter((v: any) => getColor(v) === selectedColor)
      .map(getSize)
      .filter(Boolean)
  )] as string[];

  // Initialize size when color changes or on mount
  useEffect(() => {
    if (availableSizes.length > 0 && (!selectedSize || !availableSizes.includes(selectedSize))) {
      const newSize = availableSizes[0];
      if (newSize !== selectedSize) {
        setSelectedSize(newSize);
      }
    }
  }, [selectedColor, availableSizes.length, availableSizes, selectedSize]);

  // Find active variant
  const activeVariant = variants.find((v: any) =>
    getColor(v) === selectedColor && getSize(v) === selectedSize
  ) || variants[0];

  // Extract data from active variant or product
  const keyFeatures = (product as any).key_features || [];
  const specs = product.specifications || {};
  const material = specs.shell_material || specs.materials || '100% Polyester';

  // Collect all available images (product media + variant images) - Memoized to prevent re-computation
  const allImages = useMemo(() => {
    const images: Array<{ storageId: number | null; src: string; label: string }> = [];

    // Add product media images
    const media = product.media || [];
    media.forEach((m, idx) => {
      const storageId = (m as any).storage_id || null;
      const src = m.src || '';
      const label = m.type || `Image ${idx + 1}`;
      images.push({ storageId, src, label });
    });

    // Add unique variant images that aren't already in media
    const variantImageIds = new Set<number>();
    variants.forEach((v: any) => {
      if (v.image_storage_id && !images.some(img => img.storageId === v.image_storage_id)) {
        variantImageIds.add(v.image_storage_id);
      }
    });

    variantImageIds.forEach((storageId) => {
      images.push({
        storageId,
        src: '',
        label: 'Variant'
      });
    });

    return images;
  }, [product.media, variants]);

  // Update selected image when variant changes
  useEffect(() => {
    if (activeVariant?.image_storage_id) {
      const imgIndex = allImages.findIndex(img => img.storageId === activeVariant.image_storage_id);
      if (imgIndex !== -1 && imgIndex !== selectedImageIndex) {
        setSelectedImageIndex(imgIndex);
      }
    }
  }, [activeVariant?.image_storage_id, allImages, selectedImageIndex]);

  // Get current storage ID
  const getCurrentStorageId = (): number | null => {
    if (selectedImageIndex >= 0 && selectedImageIndex < allImages.length) {
      return allImages[selectedImageIndex].storageId;
    }
    // Fallback
    if (activeVariant?.image_storage_id) {
      return activeVariant.image_storage_id;
    }
    const media = product.media || [];
    const heroMedia = media.find(m => m.type === 'hero') || media[0];
    return (heroMedia as any)?.storage_id || null;
  };

  // Get current image from active variant or fallback to hero
  const getCurrentImage = (): string => {
    const storageId = getCurrentStorageId();

    if (storageId) {
      return `https://share.arkturian.com/proxy.php?id=${storageId}&width=800&format=webp&quality=85`;
    }

    // Fallback to src if no storage_id
    const media = product.media || [];
    const heroMedia = media.find(m => m.type === 'hero') || media[0];
    return heroMedia?.src || '';
  };

  // Parse features
  const parseFeatures = (): ParsedFeature[] => {
    return keyFeatures.map((featureStr: string) => {
      const parts = featureStr.split(':');
      const title = parts[0]?.trim() || featureStr;
      const subtitle = parts[1]?.trim() || '';

      // Detect icon type
      let icon: ParsedFeature['icon'] = 'default';
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('layer') || lowerTitle.includes('protection')) icon = 'layer';
      if (lowerTitle.includes('breathable')) icon = 'breathable';
      if (lowerTitle.includes('sealed') || lowerTitle.includes('seam')) icon = 'sealed';
      if (lowerTitle.includes('compatible') || lowerTitle.includes('jacket')) icon = 'compatible';
      if (lowerTitle.includes('waterproof') || lowerTitle.includes('mm')) icon = 'waterproof';

      return { title, subtitle, icon };
    });
  };

  const features = parseFeatures();

  // Get price from active variant or fallback to product price
  const priceText = activeVariant?.price
    ? `${activeVariant.currency || '€'} ${activeVariant.price.toFixed(2)}`
    : (product.price?.formatted || `€ ${product.price?.value?.toFixed(2) || '0.00'}`);

  // Get availability from active variant
  const availability = activeVariant?.availability || 'Unknown';
  const availabilityColor = availability === 'InStock' ? '#10b981' : (availability === 'OutOfStock' ? '#ef4444' : '#f59e0b');

  // Get variant URL or fallback to product URL
  const productUrl = activeVariant?.url || (product as any).meta?.product_url;

  const handleViewWebsite = () => {
    if (productUrl) {
      window.open(productUrl, '_blank', 'noopener');
    }
  };

  // Icon mapping
  const getFeatureIcon = (icon: ParsedFeature['icon']) => {
    const iconMap = {
      layer: (
        <svg className="feature-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      breathable: (
        <svg className="feature-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18V5l12-2v13M6 14v4M3 16v2" />
        </svg>
      ),
      sealed: (
        <svg className="feature-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      compatible: (
        <svg className="feature-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      waterproof: (
        <svg className="feature-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      ),
      default: (
        <svg className="feature-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    };

    return iconMap[icon];
  };

  // Panel mode: Just the info panel, positioned next to product
  if (isPanelMode) {
    return (
      <motion.div
        className="pom-info-panel pom-panel-standalone"
        style={{
          position: 'fixed',
          width: '480px',
          maxHeight: '90vh',
        }}
        animate={{
          left: position!.x,
          top: position!.y,
          opacity: 1,
        }}
        initial={{
          left: position!.x,
          top: position!.y,
          opacity: 0,
        }}
        transition={{
          opacity: { duration: 0.2 },
          left: { type: 'spring', stiffness: 300, damping: 30 },
          top: { type: 'spring', stiffness: 300, damping: 30 }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button className="pom-close" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: '12px', right: '12px' }}>
          ×
        </button>

        {/* Title */}
        <h2 className="pom-title">{product.name}</h2>

        {/* Thumbnail Gallery - Panel Mode */}
        {allImages.length > 1 && (
          <div style={{
            display: 'flex',
            gap: '6px',
            marginTop: '12px',
            marginBottom: '12px',
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            {allImages.map((img, idx) => {
              const thumbnailUrl = img.storageId
                ? `https://share.arkturian.com/proxy.php?id=${img.storageId}&width=100&format=webp&quality=80`
                : img.src;
              const isActive = idx === selectedImageIndex;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  style={{
                    width: '60px',
                    height: '60px',
                    flexShrink: 0,
                    border: isActive ? '2px solid #ff6b00' : '2px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    padding: 0,
                    background: 'rgba(0, 0, 0, 0.3)',
                    transition: 'all 0.2s ease',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    opacity: isActive ? 1 : 0.7
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.opacity = '1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.opacity = '0.7';
                    }
                  }}
                >
                  <img
                    src={thumbnailUrl}
                    alt={`${product.name} - ${img.label}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Price & Availability */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="pom-price">{priceText}</div>
          {activeVariant && (
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: availabilityColor,
              padding: '6px 12px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '8px'
            }}>
              {availability}
            </div>
          )}
        </div>

        {/* Dropdowns - only show if variants exist */}
        {variants.length > 0 && (
          <div className="pom-dropdowns">
            {allColors.length > 0 && (
              <div className="pom-dropdown-wrapper">
                <select
                  className="pom-dropdown"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                >
                  {allColors.map((color, idx) => (
                    <option key={idx} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availableSizes.length > 0 && (
              <div className="pom-dropdown-wrapper">
                <select
                  className="pom-dropdown"
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                >
                  {availableSizes.map((size, idx) => (
                    <option key={idx} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Features */}
        <div className="pom-features">
          {features.slice(0, 4).map((feature, idx) => (
            <div key={idx} className="pom-feature">
              <div className="pom-feature-icon">
                {getFeatureIcon(feature.icon)}
              </div>
              <div className="pom-feature-text">
                <div className="pom-feature-title">{feature.title}</div>
                {feature.subtitle && (
                  <div className="pom-feature-subtitle">{feature.subtitle}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Material Info */}
        <div className="pom-material">
          <div className="pom-material-item">Material: {material}</div>
          {activeVariant?.sku && (
            <div className="pom-material-item">SKU: {activeVariant.sku}</div>
          )}
          {activeVariant?.gtin13 && (
            <div className="pom-material-item">GTIN: {activeVariant.gtin13}</div>
          )}
          {getCurrentStorageId() && (
            <div className="pom-material-item">
              Storage ID: {getCurrentStorageId()}
            </div>
          )}
          {availableSizes.length > 0 && (
            <div className="pom-material-item">
              Available Sizes: {availableSizes.join(', ')}
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
          <div style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {getCurrentStorageId() && (
              <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
                Storage-ID: {getCurrentStorageId()}
              </span>
            )}
            {(product as any).meta?.source && (
              <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
                Quelle: {(product as any).meta.source}
              </span>
            )}
            {variants.length > 0 && (
              <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
                Varianten: {variants.length}
              </span>
            )}
          </div>

          {/* Image URL */}
          <div style={{ marginTop: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
            <div style={{ marginBottom: '4px', fontWeight: '600', fontSize: '12px' }}>Bild-URL:</div>
            <a
              href={getCurrentImage()}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#ff6b00',
                wordBreak: 'break-all',
                textDecoration: 'none',
                display: 'block',
                padding: '6px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              {getCurrentImage()}
            </a>
          </div>

          {(product as any).derived_taxonomy && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Derived Taxonomy</div>
              <div style={{
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '6px',
                fontSize: '11px',
                maxHeight: '150px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                lineHeight: '1.5'
              }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify((product as any).derived_taxonomy, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {(product as any).meta && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Meta</div>
              <div style={{
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '6px',
                fontSize: '11px',
                maxHeight: '150px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                lineHeight: '1.5'
              }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify((product as any).meta, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {variants.length > 0 && (
            <details style={{ marginTop: '12px' }}>
              <summary style={{
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                padding: '4px 0',
                userSelect: 'none'
              }}>
                ▶ Varianten ({variants.length})
              </summary>
              <div style={{
                marginTop: '8px',
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '6px',
                fontSize: '11px',
                maxHeight: '200px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                lineHeight: '1.5'
              }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(variants, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>

        {/* Buttons */}
        <div className="pom-actions">
          {productUrl && (
            <button className="pom-button pom-button-primary" onClick={handleViewWebsite}>
              Buy on O'Neal
            </button>
          )}
          <button className="pom-button pom-button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </motion.div>
    );
  }

  // Full modal mode: Backdrop + Image + Info Panel
  return (
    <motion.div
      className="pom-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="pom-container"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* Close button */}
        <button className="pom-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {/* Layout: Image + Info Panel */}
        <div className="pom-layout">
          {/* Left: Product Image */}
          <div className="pom-image-section">
            <img
              src={getCurrentImage()}
              alt={product.name}
              className="pom-product-image"
            />

            {/* Thumbnail Gallery */}
            {allImages.length > 1 && (
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '16px',
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: '100%'
              }}>
                {allImages.map((img, idx) => {
                  const thumbnailUrl = img.storageId
                    ? `https://share.arkturian.com/proxy.php?id=${img.storageId}&width=100&format=webp&quality=80`
                    : img.src;
                  const isActive = idx === selectedImageIndex;

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      style={{
                        width: '80px',
                        height: '80px',
                        border: isActive ? '3px solid #ff6b00' : '2px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        padding: 0,
                        background: 'rgba(0, 0, 0, 0.3)',
                        transition: 'all 0.2s ease',
                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                        opacity: isActive ? 1 : 0.7
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.opacity = '1';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.opacity = '0.7';
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }}
                    >
                      <img
                        src={thumbnailUrl}
                        alt={`${product.name} - ${img.label}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Info Panel */}
          <div className="pom-info-panel">
            {/* Title */}
            <h2 className="pom-title">{product.name}</h2>

            {/* Price & Availability */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="pom-price">{priceText}</div>
              {activeVariant && (
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: availabilityColor,
                  padding: '6px 12px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px'
                }}>
                  {availability}
                </div>
              )}
            </div>

            {/* Dropdowns - only show if variants exist */}
            {variants.length > 0 && (
              <div className="pom-dropdowns">
                {allColors.length > 0 && (
                  <div className="pom-dropdown-wrapper">
                    <select
                      className="pom-dropdown"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                    >
                      {allColors.map((color, idx) => (
                        <option key={idx} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {availableSizes.length > 0 && (
                  <div className="pom-dropdown-wrapper">
                    <select
                      className="pom-dropdown"
                      value={selectedSize}
                      onChange={(e) => setSelectedSize(e.target.value)}
                    >
                      {availableSizes.map((size, idx) => (
                        <option key={idx} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Features */}
            <div className="pom-features">
              {features.slice(0, 4).map((feature, idx) => (
                <div key={idx} className="pom-feature">
                  <div className="pom-feature-icon">
                    {getFeatureIcon(feature.icon)}
                  </div>
                  <div className="pom-feature-text">
                    <div className="pom-feature-title">{feature.title}</div>
                    {feature.subtitle && (
                      <div className="pom-feature-subtitle">{feature.subtitle}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Material Info */}
            <div className="pom-material">
              <div className="pom-material-item">Material: {material}</div>
              {activeVariant?.sku && (
                <div className="pom-material-item">SKU: {activeVariant.sku}</div>
              )}
              {activeVariant?.gtin13 && (
                <div className="pom-material-item">GTIN: {activeVariant.gtin13}</div>
              )}
              {getCurrentStorageId() && (
                <div className="pom-material-item">
                  Storage ID: {getCurrentStorageId()}
                </div>
              )}
              {availableSizes.length > 0 && (
                <div className="pom-material-item">
                  Available Sizes: {availableSizes.join(', ')}
                </div>
              )}
            </div>

            {/* Debug Info */}
            <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
              <div style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {getCurrentStorageId() && (
                  <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
                    Storage-ID: {getCurrentStorageId()}
                  </span>
                )}
                {(product as any).meta?.source && (
                  <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
                    Quelle: {(product as any).meta.source}
                  </span>
                )}
                {variants.length > 0 && (
                  <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px' }}>
                    Varianten: {variants.length}
                  </span>
                )}
              </div>

              {/* Image URL */}
              <div style={{ marginTop: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
                <div style={{ marginBottom: '4px', fontWeight: '600', fontSize: '12px' }}>Bild-URL:</div>
                <a
                  href={getCurrentImage()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#ff6b00',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                    display: 'block',
                    padding: '6px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  {getCurrentImage()}
                </a>
              </div>

              {(product as any).derived_taxonomy && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Derived Taxonomy</div>
                  <div style={{
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: '1.5'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify((product as any).derived_taxonomy, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {(product as any).meta && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Meta</div>
                  <div style={{
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: '1.5'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify((product as any).meta, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {variants.length > 0 && (
                <details style={{ marginTop: '12px' }}>
                  <summary style={{
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    padding: '4px 0',
                    userSelect: 'none'
                  }}>
                    ▶ Varianten ({variants.length})
                  </summary>
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: '1.5'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(variants, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </div>

            {/* Buttons */}
            <div className="pom-actions">
              {productUrl && (
                <button className="pom-button pom-button-primary" onClick={handleViewWebsite}>
                  Buy on O'Neal
                </button>
              )}
              <button className="pom-button pom-button-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
