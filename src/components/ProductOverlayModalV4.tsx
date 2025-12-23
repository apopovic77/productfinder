import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../types/Product';
import { useImageQueue } from '../hooks/useImageQueue';
import { fetchProductById } from '../data/ProductRepository';
import './ProductOverlayModal.css';

// Storage API base URL from environment
const STORAGE_API_URL = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';

// Helper to build storage media URL
const getStorageMediaUrl = (storageId: number, params: Record<string, string | number> = {}) => {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    queryParams.set(key, String(value));
  });
  const queryString = queryParams.toString();
  return `${STORAGE_API_URL}/storage/media/${storageId}${queryString ? '?' + queryString : ''}`;
};

type Props = {
  product: Product;
  onClose: () => void;
  position?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  onVariantChange?: (variant: any) => void;
  onBuy?: (payload: {
    product: Product;
    variant?: any;
    priceText?: string;
    imageUrl?: string;
    variantLabel?: string;
    quantity?: number;
  }) => void;
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
export const ProductOverlayModalV4: React.FC<Props> = ({ product, onClose, position, onPositionChange, onVariantChange, onBuy }) => {
  const DIALOG_WIDTH = 1100; // Wider for horizontal layout

  // State for full product details (fetched from API with variants)
  const [fullProduct, setFullProduct] = useState<Product | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Fetch full product details when modal opens (list API doesn't include variants)
  useEffect(() => {
    const loadFullDetails = async () => {
      // Check if we already have variants with images
      const existingVariants = (product as any).variants || [];
      const hasVariantsWithImages = existingVariants.some((v: any) => v.images?.length > 0);

      if (hasVariantsWithImages) {
        console.log('[V4 Modal] Product already has variants with images, skipping fetch');
        setFullProduct(null);
        return;
      }

      console.log('[V4 Modal] Fetching full product details for:', product.id);
      setIsLoadingDetails(true);
      try {
        const details = await fetchProductById(product.id);
        if (details) {
          console.log('[V4 Modal] Got full product with variants:', (details as any).variants?.length);
          setFullProduct(details);
        }
      } catch (error) {
        console.error('[V4 Modal] Failed to fetch product details:', error);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    loadFullDetails();
  }, [product.id]);

  // Use full product if available, otherwise use the passed product
  const activeProduct = fullProduct || product;

  // Extract variants from the active product
  const variants = (activeProduct as any).variants || [];
  const rawProduct = (activeProduct as any).raw || {};
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

  // Helper functions to parse variant attributes
  // V2 API has direct color/size fields, fallback to option1/option2 for legacy
  const getColor = useCallback((variant: any): string => {
    // V2 API: description_short contains the actual color/graphic variant name
    // e.g., "PRODIGY black", "RACE Carbon" - this distinguishes variants
    if (variant.description_short) return String(variant.description_short);
    // V2 API: direct color field (fallback, often just base color like "black")
    if (variant.color) return String(variant.color);
    // Legacy Shopify-style
    if (variant.option2) return String(variant.option2);
    if (variant.option1) return String(variant.option1);
    const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
    return parts[0] || variant.sku || 'Default';
  }, []);

  const getSize = useCallback((variant: any): string => {
    // V2 API: direct size field
    if (variant.size) return String(variant.size);
    // Legacy Shopify-style
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

  // Load new thumbnails - filtered by selected color (v2 API structure)
  useEffect(() => {
    const timer = setTimeout(() => {
      const images: Array<{ storageId: number | null; src: string; label: string; role?: string }> = [];
      const seenStorageIds = new Set<number>();

      // Find the active variant for selected color (use first size)
      const colorVariants = variants.filter((v: any) => getColor(v) === selectedColor);
      const activeColorVariant = colorVariants[0];

      // DEBUG: Log variant data to understand the structure
      console.log('[V4 Modal] variants count:', variants.length);
      console.log('[V4 Modal] selectedColor:', selectedColor);
      console.log('[V4 Modal] colorVariants count:', colorVariants.length);
      console.log('[V4 Modal] activeColorVariant:', activeColorVariant);
      console.log('[V4 Modal] activeColorVariant.images:', activeColorVariant?.images);
      console.log('[V4 Modal] activeColorVariant.storage:', activeColorVariant?.storage);

      // V2 API: Get images from variant.images[] array
      if (activeColorVariant?.images && Array.isArray(activeColorVariant.images)) {
        activeColorVariant.images.forEach((img: any, idx: number) => {
          const storageId = img.storage?.id || null;
          if (storageId && !seenStorageIds.has(storageId)) {
            seenStorageIds.add(storageId);
            const imageUrl = getStorageMediaUrl(storageId, { width: 130, format: 'webp', quality: 80 });
            images.push({
              storageId,
              src: imageUrl,
              label: img.image_path || img.role || `View ${idx + 1}`,
              role: img.role
            });
          }
        });
      }

      // Fallback: If no images array, try variant.storage.id (hero image)
      if (images.length === 0 && activeColorVariant?.storage?.id) {
        const storageId = activeColorVariant.storage.id;
        if (!seenStorageIds.has(storageId)) {
          seenStorageIds.add(storageId);
          const imageUrl = getStorageMediaUrl(storageId, { width: 130, format: 'webp', quality: 80 });
          images.push({
            storageId,
            src: imageUrl,
            label: 'Hero',
            role: 'hero'
          });
        }
      }

      // Legacy fallback: product.media (for old API compatibility)
      if (images.length === 0) {
        const media = (product as any).media || [];
        media.forEach((m: any, idx: number) => {
          const storageId = m.storage_id || null;
          const src = m.src || '';
          const label = m.type || `Image ${idx + 1}`;
          if (storageId && !seenStorageIds.has(storageId)) {
            seenStorageIds.add(storageId);
            images.push({ storageId, src, label });
          } else if (src) {
            images.push({ storageId: null, src, label });
          }
        });
      }

      setThumbnailImages(images);
      setThumbnailsLoading(false);
    }, 10);

    return () => clearTimeout(timer);
  }, [product.id, variants, selectedColor, getColor]);

  const allImages = thumbnailsLoading ? [] : thumbnailImages;

  // Extract image URLs for large display (all images shown in left column)
  const imageUrls = useMemo(() => {
    return allImages.map(img => {
      if (img.storageId) {
        return getStorageMediaUrl(img.storageId, { width: 800, format: 'webp', quality: 85 });
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

  const variantLabel = [selectedColor, selectedSize].filter(Boolean).join(' / ');

  const getCartImageUrl = (): string | undefined => {
    const heroImage = allImages[0];
    if (heroImage?.storageId) {
      return getStorageMediaUrl(heroImage.storageId, { width: 220, format: 'webp', quality: 85 });
    }
    if (heroImage?.src) {
      return heroImage.src;
    }
    const media = product.media || [];
    const fallback = media.find(m => (m as any).storage_id) || media[0];
    if (fallback && (fallback as any).storage_id) {
      return getStorageMediaUrl((fallback as any).storage_id, { width: 220, format: 'webp', quality: 85 });
    }
    return fallback?.src;
  };

  const [quantity, setQuantity] = useState(0);
  const mxVideoUrl = getStorageMediaUrl(6629, { format: 'mp4' });
  const mxVideoPoster = getStorageMediaUrl(6629, { width: 1200, format: 'webp', quality: 85 });
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  useEffect(() => {
    setQuantity(0);
    setIsVideoPlaying(false);
  }, [product.id, activeVariant?.sku, variantLabel]);

  const emitCartChange = (delta: number) => {
    if (!onBuy || delta === 0) return;
    onBuy({
      product,
      variant: activeVariant,
      priceText,
      imageUrl: getCartImageUrl(),
      variantLabel: variantLabel || undefined,
      quantity: delta,
    });
  };

  const handleAddToCartClick = () => {
    emitCartChange(1);
    setQuantity(1);
  };

  const handleIncreaseQuantity = () => {
    emitCartChange(1);
    setQuantity((prev) => prev + 1);
  };

  const handleDecreaseQuantity = () => {
    setQuantity((prev) => {
      if (prev <= 0) {
        return 0;
      }
      emitCartChange(-1);
      return prev - 1;
    });
  };

  const handleShowOnOneal = () => {
    if (productUrl) {
      window.open(productUrl, '_blank', 'noopener');
    }
  };

  const handlePlayVideo = () => {
    setIsVideoPlaying(true);
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
              ? getStorageMediaUrl(img.storageId, { width: 800, format: 'webp', quality: 85 })
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

        {/* CTA Buttons */}
        <div style={{ paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start', width: '100%' }}>
          {quantity === 0 ? (
            <button
              onClick={handleAddToCartClick}
              style={{
                fontSize: '15px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '16px 48px',
                width: '100%',
                maxWidth: '360px',
                background: '#111827',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#111827';
              }}
            >
              ADD TO CART
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(17, 24, 39, 0.6)' }}>
                Quantity
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="pf-cart-qty" style={{ padding: '6px 8px', background: 'rgba(248, 250, 252, 1)' }}>
                  <button type="button" onClick={handleDecreaseQuantity} aria-label="Decrease quantity">−</button>
                  <span>{quantity}</span>
                  <button type="button" onClick={handleIncreaseQuantity} aria-label="Increase quantity">+</button>
                </div>
              </div>
            </div>
          )}

          {productUrl && (
            <button
              onClick={handleShowOnOneal}
              style={{
                fontSize: '14px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '14px 40px',
                width: '100%',
                maxWidth: '360px',
                background: 'transparent',
                border: '1px solid rgba(17, 24, 39, 0.9)',
                borderRadius: '10px',
                color: '#111827',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(17, 24, 39, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              SHOW ON ONEAL.EU
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

        {/* MX Video */}
        <div
          style={{
            marginTop: '32px',
            paddingTop: '40px',
            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
            width: '100%',
          }}
        >
          <h3 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: '#1a1a1a' }}>
            MX VIDEO
          </h3>
          <p style={{ fontSize: '14px', color: 'rgba(0, 0, 0, 0.6)', marginBottom: '16px' }}>
            Press play to watch the MX experience with full audio.
          </p>
          <div
            style={{
              width: '100%',
              borderRadius: '20px',
              background: 'rgba(0, 0, 0, 0.04)',
              padding: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
            }}
          >
            {isVideoPlaying ? (
              <video
                controls
                autoPlay
                playsInline
                style={{ width: '100%', borderRadius: '16px', background: '#000', maxWidth: '720px' }}
                src={mxVideoUrl}
                poster={mxVideoPoster}
              />
            ) : (
              <div
                style={{
                  width: '90%',
                  maxWidth: '700px',
                  minHeight: '260px',
                  borderRadius: '16px',
                  backgroundImage: `url(${mxVideoPoster})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={handlePlayVideo}
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '999px',
                    border: 'none',
                    background: 'rgba(17, 24, 39, 0.9)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
                  }}
                  aria-label="Play MX video"
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Product Details (restored content) */}
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
        </div>
      </div>
    </motion.div>
    </>
  );
};
