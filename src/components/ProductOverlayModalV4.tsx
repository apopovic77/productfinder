import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../types/Product';
import { useImageQueue } from '../hooks/useImageQueue';
import './ProductOverlayModal.css';

type Props = {
  product: Product;
  onClose: () => void;
  position?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  onVariantChange?: (variant: any) => void;
};

interface ParsedFeature {
  title: string;
  subtitle: string;
  icon: 'layer' | 'breathable' | 'sealed' | 'compatible' | 'waterproof' | 'default';
}

/**
 * Product Overlay Modal V4 - HORIZONTAL GLASSMORPHISM LAYOUT
 * Modern design based on UI designer's mockup
 * Layout: Product image LEFT | Product info RIGHT
 * Light glassmorphism theme with blur background
 */
export const ProductOverlayModalV4: React.FC<Props> = ({ product, onClose, position, onPositionChange, onVariantChange }) => {
  const DIALOG_WIDTH = 1100; // Wider for horizontal layout

  // Extract variants
  const variants = (product as any).variants || [];
  const rawProduct = (product as any).raw || {};
  const derivedTaxonomy = (product as any).derived_taxonomy || rawProduct?.derived_taxonomy;
  const metaInfo = (product.meta && Object.keys(product.meta).length ? product.meta : rawProduct?.meta) || {};
  const taxonomyPath = Array.isArray(derivedTaxonomy?.path) ? derivedTaxonomy.path : [];
  const taxonomySport = derivedTaxonomy?.sport;
  const taxonomyFamily = derivedTaxonomy?.product_family;

  // Dialog position state - entire dialog scrolls (no internal overflow)
  const initialTop = window.innerHeight * 0.12; // Initial: 12% from top for better centering
  const [dialogTop, setDialogTop] = useState(initialTop);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Handle wheel event to scroll the entire dialog up/down
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // Always prevent default - we control the scrolling

      if (!dialogRef.current) return;

      const scrollDelta = e.deltaY;
      const dialogHeight = dialogRef.current.offsetHeight;
      const viewportHeight = window.innerHeight;

      // Calculate new position
      let newTop = dialogTop - scrollDelta;

      // Boundaries:
      // - Top boundary: dialog top can't be above viewport (max = 40px from top)
      // - Bottom boundary: dialog bottom can't be above viewport bottom (min negative value)
      const maxTop = 40; // Top margin
      const minTop = viewportHeight - dialogHeight; // Dialog can scroll up until bottom is visible

      newTop = Math.max(minTop, Math.min(maxTop, newTop));

      setDialogTop(newTop);
    };

    const dialogEl = dialogRef.current;
    if (dialogEl) {
      dialogEl.addEventListener('wheel', handleWheel, { passive: false });
      return () => dialogEl.removeEventListener('wheel', handleWheel);
    }
  }, [dialogTop]);

  // Helper functions to parse variant name
  const getColor = useCallback((variant: any): string => {
    if (variant.option2) return String(variant.option2);
    if (variant.option1) return String(variant.option1);
    const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
    return parts[0] || variant.sku || 'Default';
  }, []);

  const getSize = useCallback((variant: any): string => {
    if (variant.option1 && !variant.option2) return String(variant.option1);
    if (variant.option1 && variant.option2) {
      const opt1 = String(variant.option1);
      const opt2 = String(variant.option2);
      if (/^\d+$/.test(opt1) || opt1.length <= 3) {
        return opt1;
      }
      return '';
    }
    const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
    return parts[1] || '';
  }, []);

  // Extract unique colors from all variants
  const allColors = useMemo(() =>
    [...new Set(variants.map(getColor).filter(Boolean))] as string[],
    [variants, getColor]
  );

  // State for selected color and size
  const [selectedColor, setSelectedColor] = useState<string>(allColors[0] || '');
  const [selectedSize, setSelectedSize] = useState<string>('');

  // Reset all state when product changes
  useEffect(() => {
    setSelectedColor(allColors[0] || '');
    setSelectedSize('');
  }, [product.id, allColors]);

  // Filter sizes based on selected color
  const availableSizes = useMemo(() => {
    return [...new Set(
      variants
        .filter((v: any) => getColor(v) === selectedColor)
        .map(getSize)
        .filter(Boolean)
    )] as string[];
  }, [selectedColor, variants, getColor, getSize]);

  // Initialize size when color changes
  useEffect(() => {
    if (availableSizes.length > 0 && (!selectedSize || !availableSizes.includes(selectedSize))) {
      const newSize = availableSizes[0];
      if (newSize !== selectedSize) {
        setSelectedSize(newSize);
      }
    }
  }, [selectedColor, availableSizes, selectedSize]);

  // Find active variant
  const activeVariant = variants.find((v: any) =>
    getColor(v) === selectedColor && getSize(v) === selectedSize
  ) || variants[0];

  // Extract data
  const keyFeatures = (product as any).key_features || [];
  const specs = product.specifications || {};
  const material = specs.shell_material || specs.materials || '100% Polyester';

  // State for thumbnail images
  const [thumbnailImages, setThumbnailImages] = useState<Array<{ storageId: number | null; src: string; label: string }>>([]);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(true);

  // Clear thumbnails immediately when product changes
  useEffect(() => {
    setThumbnailsLoading(true);
    setThumbnailImages([]);
  }, [product.id]);

  // Load new thumbnails - filtered by selected color
  useEffect(() => {
    const timer = setTimeout(() => {
      const images: Array<{ storageId: number | null; src: string; label: string }> = [];

      // Add product media images
      const media = product.media || [];
      media.forEach((m, idx) => {
        const storageId = (m as any).storage_id || null;
        const src = m.src || '';
        const label = m.type || `Image ${idx + 1}`;
        images.push({ storageId, src, label });
      });

      // Add variant images for selected color
      const colorVariants = variants.filter((v: any) => getColor(v) === selectedColor);
      const variantImageIds = new Set<number>();

      colorVariants.forEach((v: any) => {
        if (v.image_storage_id && !images.some(img => img.storageId === v.image_storage_id)) {
          variantImageIds.add(v.image_storage_id);
        }
      });

      variantImageIds.forEach((storageId) => {
        const imageUrl = `https://share.arkturian.com/proxy.php?id=${storageId}&width=130&format=webp&quality=80&trim=false`;
        images.push({
          storageId,
          src: imageUrl,
          label: 'Variant'
        });
      });

      setThumbnailImages(images);
      setThumbnailsLoading(false);
    }, 10);

    return () => clearTimeout(timer);
  }, [product.id, product.media, variants, selectedColor, getColor]);

  const allImages = thumbnailsLoading ? [] : thumbnailImages;

  // Extract image URLs for large display (all images shown in left column)
  const imageUrls = useMemo(() => {
    return allImages.map(img => {
      if (img.storageId) {
        return `https://share.arkturian.com/proxy.php?id=${img.storageId}&width=800&format=webp&quality=85&trim=true`;
      }
      return img.src;
    });
  }, [allImages]);

  // Load all images through ImageLoadQueue
  const { loadedImages } = useImageQueue(imageUrls, {
    group: `product-images-${product.id}`,
    priority: -20,
  });

  // Notify parent when variant changes
  const activeVariantId = activeVariant?.sku || activeVariant?.name || '';
  useEffect(() => {
    if (onVariantChange && activeVariant) {
      onVariantChange(activeVariant);
    }
  }, [activeVariantId, onVariantChange, activeVariant]);

  // No drag handlers - dialog is fixed and expands on scroll

  // Get price
  const priceText = activeVariant?.price
    ? `${activeVariant.currency || '€'} ${activeVariant.price.toFixed(2)}`
    : (product.price?.formatted || `€ ${product.price?.value?.toFixed(2) || '0.00'}`);

  // Get availability
  const availability = activeVariant?.availability || 'Unknown';

  // Get product URL
  const productUrl = activeVariant?.url || (product as any).meta?.product_url;

  const handleViewWebsite = () => {
    if (productUrl) {
      window.open(productUrl, '_blank', 'noopener');
    }
  };

  // Extract category/subtitle from taxonomy
  const categoryText = taxonomyFamily || taxonomyPath[taxonomyPath.length - 1] || 'Product';

  // Parse product name: Remove "O'NEAL" if first word, split first word (thin) from rest (bold)
  const parseProductName = (name: string): { firstWord: string; restWords: string } => {
    let words = name.trim().split(/\s+/);

    // Remove O'NEAL if it's the first word (case insensitive)
    if (words.length > 0 && words[0].toUpperCase().replace(/'/g, '').replace(/-/g, '') === 'ONEAL') {
      words = words.slice(1);
    }

    if (words.length === 0) {
      return { firstWord: '', restWords: '' };
    }

    const firstWord = words[0];
    const restWords = words.slice(1).join(' ');

    return { firstWord, restWords };
  };

  const { firstWord: productFirstWord, restWords: productRestWords } = parseProductName(product.name);

  return (
    <>
      {/* Backdrop - Click outside to close */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <motion.div
        ref={dialogRef}
        className="pom-info-panel pom-panel-standalone pom-v4-glassmorphism"
        style={{
          position: 'fixed',
          left: `${(window.innerWidth - DIALOG_WIDTH) / 2}px`,
          top: `${dialogTop}px`,
          width: `${DIALOG_WIDTH}px`,
          // Height is auto - grows with content (can be 5000px+)
          overflow: 'hidden', // NO internal scrolling - entire dialog scrolls via translation
          // GLASSMORPHISM EFFECT - Light theme with blur
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)', // Safari support
          borderRadius: '24px 24px 0 0', // Only top corners rounded (content continues below)
          padding: '0',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderBottom: 'none', // No bottom border (content continues)
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
          display: 'flex',
          flexDirection: 'row', // 2-column layout: Images left | Content right
          transition: 'top 0.05s linear', // Very fast, smooth scrolling
          zIndex: 1000,
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{
          duration: 0.4,
          ease: [0.4, 0, 0.2, 1],
        }}
        onClick={(e) => e.stopPropagation()}
      >
      {/* Close button - Top right */}
      <button
        className="pom-close"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          fontSize: '28px',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.05)',
          border: 'none',
          borderRadius: '50%',
          color: '#1a1a1a',
          cursor: 'pointer',
          transition: 'all 0.2s',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
        }}
      >
        ×
      </button>

      {/* LEFT SIDE - All Product Images (40%) */}
      <div style={{
        width: '40%',
        padding: '40px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {allImages.length > 0 ? (
          allImages.map((img, idx) => {
            const imageUrl = img.storageId
              ? `https://share.arkturian.com/proxy.php?id=${img.storageId}&width=800&format=webp&quality=85&trim=true`
              : img.src;
            const loadedImage = loadedImages.get(imageUrl);

            return (
              <div
                key={idx}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {loadedImage ? (
                  <img
                    src={loadedImage.src}
                    alt={`${product.name} - ${img.label || `Image ${idx + 1}`}`}
                    style={{
                      width: '100%',
                      height: 'auto',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <div style={{ color: 'rgba(0, 0, 0, 0.4)', fontSize: '14px' }}>
                    Loading...
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{
            width: '100%',
            minHeight: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(0, 0, 0, 0.4)',
            fontSize: '14px',
          }}>
            No images available
          </div>
        )}
      </div>

      {/* RIGHT SIDE - Product Info (60%) */}
      <div style={{
        width: '60%',
        padding: '40px 40px 40px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Category/Subtitle */}
        <div style={{
          fontSize: '14px',
          fontWeight: '400',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'rgba(0, 0, 0, 0.6)',
          marginBottom: '8px',
          textAlign: 'center',
          marginTop: '64px',
        }}>
          {categoryText}
        </div>

        {/* Product Name - First word thin, rest bold */}
        <h2 style={{
          fontSize: '48px',
          lineHeight: '1.0',
          margin: 0,
          marginBottom: '64px',
          color: '#000000',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          textAlign: 'center',
        }}>
          {productFirstWord && (
            <div style={{ fontWeight: '400' }}>
              {productFirstWord}
            </div>
          )}
          {productRestWords && (
            <div style={{ fontWeight: '900' }}>
              {productRestWords}
            </div>
          )}
        </h2>

        {/* Description (if available) */}
        {product.description && (
          <div style={{
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(0, 0, 0, 0.7)',
          }}>
            {product.description}
          </div>
        )}

        {/* Article Number */}
        <div style={{
          fontSize: '12px',
          color: 'rgba(0, 0, 0, 0.5)',
        }}>
          Art. No. {activeVariant?.sku || product.id || '0000000000'}
        </div>

        {/* Star Rating (placeholder) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          color: 'rgba(0, 0, 0, 0.6)',
        }}>
          <span>★★★★☆</span>
          <span>(4.0) 1 review</span>
        </div>

        {/* Color Info */}
        {selectedColor && (
          <div style={{
            fontSize: '13px',
            color: 'rgba(0, 0, 0, 0.6)',
          }}>
            Color: <span style={{ fontWeight: '600', color: '#1a1a1a' }}>{selectedColor}</span>
          </div>
        )}

        {/* Specifications Section */}
        {Object.keys(specs).length > 0 && (
          <div>
            <div style={{
              fontSize: '13px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'rgba(0, 0, 0, 0.6)',
              marginBottom: '12px',
            }}>
              Specifications:
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '13px',
              color: 'rgba(0, 0, 0, 0.6)',
            }}>
              {Object.entries(specs).slice(0, 6).map(([key, value], idx) => (
                <div key={idx}>
                  <span style={{ textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}:</span>{' '}
                  <span style={{ color: '#1a1a1a' }}>{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRE ORDER Button */}
        <div style={{ paddingTop: '20px' }}>
          {productUrl && (
            <button
              onClick={handleViewWebsite}
              style={{
                fontSize: '15px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '16px 48px',
                width: '100%',
                maxWidth: '300px',
                background: '#1a1a1a',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
              }}
            >
              PRE ORDER
            </button>
          )}
        </div>

        {/* Horizontal Line */}
        <div style={{
          width: '100%',
          height: '1px',
          background: 'rgba(0, 0, 0, 0.1)',
          marginTop: '24px',
          marginBottom: '16px',
        }} />

        {/* Color & Size Selectors */}
        {variants.length > 0 && (allColors.length > 1 || availableSizes.length > 1) && (
          <div style={{ display: 'flex', gap: '12px' }}>
            {allColors.length > 1 && (
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'rgba(0, 0, 0, 0.6)',
                  marginBottom: '6px',
                }}>
                  Color
                </label>
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  style={{
                    fontSize: '14px',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                    borderRadius: '8px',
                    color: '#1a1a1a',
                    width: '100%',
                    cursor: 'pointer',
                  }}
                >
                  {allColors.map((color, idx) => (
                    <option key={idx} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availableSizes.length > 1 && (
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'rgba(0, 0, 0, 0.6)',
                  marginBottom: '6px',
                }}>
                  Size
                </label>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  style={{
                    fontSize: '14px',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                    borderRadius: '8px',
                    color: '#1a1a1a',
                    width: '100%',
                    cursor: 'pointer',
                  }}
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

        {/* DUMMY CONTENT - To test scroll behavior (like Apple product pages) */}
        <div style={{
          marginTop: '40px',
          paddingTop: '40px',
          borderTop: '1px solid rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{
            fontSize: '24px',
            fontWeight: '700',
            marginBottom: '16px',
            color: '#1a1a1a',
          }}>
            Product Details
          </h3>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.8',
            color: 'rgba(0, 0, 0, 0.7)',
            marginBottom: '24px',
          }}>
            Experience unmatched performance and durability with this premium product.
            Engineered with cutting-edge materials and innovative design, it delivers
            exceptional comfort and reliability in any condition.
          </p>

          <h3 style={{
            fontSize: '24px',
            fontWeight: '700',
            marginTop: '40px',
            marginBottom: '16px',
            color: '#1a1a1a',
          }}>
            Advanced Technology
          </h3>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.8',
            color: 'rgba(0, 0, 0, 0.7)',
            marginBottom: '24px',
          }}>
            Built with state-of-the-art components that push the boundaries of what's possible.
            Every detail has been meticulously crafted to provide you with the best experience.
          </p>

          <h3 style={{
            fontSize: '24px',
            fontWeight: '700',
            marginTop: '40px',
            marginBottom: '16px',
            color: '#1a1a1a',
          }}>
            Premium Materials
          </h3>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.8',
            color: 'rgba(0, 0, 0, 0.7)',
            marginBottom: '24px',
          }}>
            Constructed from the finest materials available, ensuring longevity and
            performance that stands the test of time.
          </p>

          {/* Dummy Image Placeholder */}
          <div style={{
            width: '100%',
            height: '300px',
            background: 'rgba(0, 0, 0, 0.05)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(0, 0, 0, 0.4)',
            fontSize: '14px',
            marginTop: '32px',
            marginBottom: '32px',
          }}>
            [Product Detail Image]
          </div>

          <h3 style={{
            fontSize: '24px',
            fontWeight: '700',
            marginTop: '40px',
            marginBottom: '16px',
            color: '#1a1a1a',
          }}>
            Designed for Performance
          </h3>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.8',
            color: 'rgba(0, 0, 0, 0.7)',
            marginBottom: '24px',
          }}>
            Every aspect of this product has been optimized for maximum performance.
            From the ergonomic design to the high-performance materials, nothing has
            been left to chance.
          </p>

          {/* Another Dummy Image */}
          <div style={{
            width: '100%',
            height: '300px',
            background: 'rgba(0, 0, 0, 0.05)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(0, 0, 0, 0.4)',
            fontSize: '14px',
            marginTop: '32px',
            marginBottom: '32px',
          }}>
            [Video Placeholder]
          </div>

          <h3 style={{
            fontSize: '24px',
            fontWeight: '700',
            marginTop: '40px',
            marginBottom: '16px',
            color: '#1a1a1a',
          }}>
            Technical Specifications
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            fontSize: '13px',
            color: 'rgba(0, 0, 0, 0.6)',
            marginBottom: '40px',
          }}>
            <div><strong>Weight:</strong> 850g</div>
            <div><strong>Volume:</strong> 25L</div>
            <div><strong>Dimensions:</strong> 50 x 30 x 20 cm</div>
            <div><strong>Material:</strong> Ripstop Nylon</div>
            <div><strong>Waterproof:</strong> 10,000mm</div>
            <div><strong>Breathability:</strong> 8,000g/m²</div>
            <div><strong>Back Length:</strong> 48cm</div>
            <div><strong>Body Height:</strong> 65cm</div>
          </div>

          <h3 style={{
            fontSize: '24px',
            fontWeight: '700',
            marginTop: '40px',
            marginBottom: '16px',
            color: '#1a1a1a',
          }}>
            What's in the Box
          </h3>
          <ul style={{
            fontSize: '14px',
            lineHeight: '2',
            color: 'rgba(0, 0, 0, 0.7)',
            paddingLeft: '20px',
            marginBottom: '60px',
          }}>
            <li>1x Product</li>
            <li>1x User Manual</li>
            <li>1x Warranty Card</li>
            <li>1x Care Instructions</li>
          </ul>
        </div>
      </div>
    </motion.div>
    </>
  );
};
