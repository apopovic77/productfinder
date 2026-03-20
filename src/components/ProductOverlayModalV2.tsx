import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../types/Product';
import { useImageQueue } from '../hooks/useImageQueue';
import { fetchProductById } from '../data/ProductRepository';
import './ProductOverlayModal.css';

// Storage API URL from environment
const STORAGE_API_URL = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';

type Props = {
  product: Product;
  onClose: () => void;
  position?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  onVariantChange?: (variant: any) => void;
  onImageSelect?: (storageId: number, thumbnailImage?: HTMLImageElement) => void;
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
 * Product Overlay Modal V2 - HALF WIDTH VERSION (240px)
 * Same design as V1, but with compact half-width layout
 */
export const ProductOverlayModalV2: React.FC<Props> = ({ product, onClose, position, onPositionChange, onVariantChange, onImageSelect, onBuy }) => {
  const isMobilePortrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
  const DIALOG_WIDTH = isMobilePortrait ? Math.min(window.innerWidth - 16, 380) : 240;

  // State for full product details (fetched from API with variants)
  const [fullProduct, setFullProduct] = useState<Product | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSiblingView, setIsSiblingView] = useState(false);

  // Always fetch full product details when modal opens
  // List API doesn't include variants with images array
  useEffect(() => {
    const loadFullDetails = async () => {
      setIsLoadingDetails(true);
      setFullProduct(null);
      setIsSiblingView(false);
      try {
        const details = await fetchProductById(product.id);
        if (details) {
          setFullProduct(details);
        }
      } catch (error) {
        // Silently fail - will use product without full details
      } finally {
        setIsLoadingDetails(false);
      }
    };
    loadFullDetails();
  }, [product.id]);

  // Use full product if available, otherwise use the passed product
  const activeProduct = fullProduct || product;

  // Extract variants from active product
  const variants = (activeProduct as any).variants || [];
  const rawProduct = (product as any).raw || {};
  const derivedTaxonomy = (product as any).derived_taxonomy || rawProduct?.derived_taxonomy;
  const metaInfo = (product.meta && Object.keys(product.meta).length ? product.meta : rawProduct?.meta) || {};
  const taxonomyPath = Array.isArray(derivedTaxonomy?.path) ? derivedTaxonomy.path : [];
  const taxonomySport = derivedTaxonomy?.sport;
  const taxonomyFamily = derivedTaxonomy?.product_family;

  // Drag state - desktop: center-right, mobile: bottom-center
  const isMobileV2 = window.innerWidth <= 768;
  const [dragPosition, setDragPosition] = useState(() => ({
    x: isMobileV2 ? (window.innerWidth - DIALOG_WIDTH) / 2 : window.innerWidth * 0.65 - DIALOG_WIDTH / 2,
    y: isMobileV2 ? window.innerHeight * 0.45 : window.innerHeight * 0.25 // mobile: lower half
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Notify parent of position changes (for connection line)
  useEffect(() => {
    if (onPositionChange) {
      // Parent callback handles change detection to prevent loops
      onPositionChange(dragPosition);
    }
  }, [dragPosition.x, dragPosition.y, onPositionChange]);

  // Helper functions to extract variant color/size - supports V2 API (color/size fields) and V1 (option1/option2)
  const getColor = useCallback((variant: any): string => {
    // V2 API: direct color field
    if (variant.color) return String(variant.color);
    // V1 API: option2 or option1
    if (variant.option2) return String(variant.option2);
    if (variant.option1) return String(variant.option1);
    // Fallback to parsing name
    const parts = (variant.name || variant.description_short || '').split(' / ').map((s: string) => s.trim());
    return parts[0] || variant.sku || 'Default';
  }, []);

  const getSize = useCallback((variant: any): string => {
    // V2 API: direct size field
    if (variant.size) return String(variant.size);
    // V1 API: option1/option2 logic
    if (variant.option1 && !variant.option2) return String(variant.option1);
    if (variant.option1 && variant.option2) {
      const opt1 = String(variant.option1);
      if (/^\d+$/.test(opt1) || opt1.length <= 3) return opt1;
      return '';
    }
    // Fallback to parsing name
    const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
    return parts[1] || '';
  }, []);

  // Extract unique colors from all variants - memoized to prevent array recreation
  const allColors = useMemo(() =>
    [...new Set(variants.map(getColor).filter(Boolean))] as string[],
    [variants, getColor]
  );

  // State for selected color and size
  const [selectedColor, setSelectedColor] = useState<string>(allColors[0] || '');
  const [selectedSize, setSelectedSize] = useState<string>('');

  // State for selected image
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  // Reset all state when product changes
  useEffect(() => {
    setSelectedColor(allColors[0] || '');
    setSelectedSize('');
    setSelectedImageIndex(0);
  }, [product.id, allColors]);

  // Reset selected image when color changes
  useEffect(() => {
    setSelectedImageIndex(0);
  }, [selectedColor]);

  // Filter sizes based on selected color - memoized to prevent re-renders
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
  // Material from variant data or specs
  const material = activeVariant?.material || specs.shell_material || specs.materials || null;

  // State for thumbnail images
  const [thumbnailImages, setThumbnailImages] = useState<Array<{ storageId: number | null; src: string; label: string }>>([]);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(true);

  // Clear thumbnails immediately when product changes
  useEffect(() => {
    setThumbnailsLoading(true);
    setThumbnailImages([]);
  }, [product.id]);

  // Load new thumbnails - filtered by selected color (supports both V1 and V2 API)
  useEffect(() => {
    const timer = setTimeout(() => {
      const images: Array<{ storageId: number | null; src: string; label: string }> = [];
      const seenStorageIds = new Set<number>();

      // Find the active variant for selected color (use first size)
      const colorVariants = variants.filter((v: any) => getColor(v) === selectedColor);
      const activeColorVariant = colorVariants[0];

      // V2 API: Get images from variant.images[] array (all perspectives)
      if (activeColorVariant?.images && Array.isArray(activeColorVariant.images)) {
        activeColorVariant.images.forEach((img: any, idx: number) => {
          const storageId = img.storage?.id || null;
          if (storageId && !seenStorageIds.has(storageId)) {
            seenStorageIds.add(storageId);
            const imageUrl = `${STORAGE_API_URL}/storage/media/${storageId}?width=130&format=webp&quality=80`;
            images.push({
              storageId,
              src: imageUrl,
              label: img.image_path || img.role || `View ${idx + 1}`
            });
          }
        });
      }

      // Fallback: V2 API variant.storage.id (single hero image)
      if (images.length === 0 && activeColorVariant?.storage?.id) {
        const storageId = activeColorVariant.storage.id;
        if (!seenStorageIds.has(storageId)) {
          seenStorageIds.add(storageId);
          const imageUrl = `${STORAGE_API_URL}/storage/media/${storageId}?width=130&format=webp&quality=80`;
          images.push({
            storageId,
            src: imageUrl,
            label: 'Hero'
          });
        }
      }

      // Fallback: V1 API image_storage_id
      if (images.length === 0) {
        colorVariants.forEach((v: any) => {
          if (v.image_storage_id && !seenStorageIds.has(v.image_storage_id)) {
            seenStorageIds.add(v.image_storage_id);
            const imageUrl = `${STORAGE_API_URL}/storage/media/${v.image_storage_id}?width=130&format=webp&quality=80`;
            images.push({
              storageId: v.image_storage_id,
              src: imageUrl,
              label: 'Variant'
            });
          }
        });
      }

      // Final fallback: product.media (shared images)
      if (images.length === 0) {
        const media = product.media || [];
        media.forEach((m, idx) => {
          const storageId = (m as any).storage_id || null;
          const src = m.src || '';
          if (storageId && !seenStorageIds.has(storageId)) {
            seenStorageIds.add(storageId);
            images.push({ storageId, src, label: m.type || `Image ${idx + 1}` });
          } else if (src) {
            images.push({ storageId: null, src, label: m.type || `Image ${idx + 1}` });
          }
        });
      }

      setThumbnailImages(images);
      setThumbnailsLoading(false);
    }, 10);

    return () => clearTimeout(timer);
  }, [product.id, product.media, variants, selectedColor, getColor]);

  const allImages = thumbnailsLoading ? [] : thumbnailImages;

  // Extract thumbnail URLs for ImageLoadQueue
  const thumbnailUrls = useMemo(() => {
    return allImages.map(img => {
      if (img.storageId) {
        return `${STORAGE_API_URL}/storage/media/${img.storageId}?width=130&height=130&format=webp&quality=80`;
      }
      return img.src;
    });
  }, [allImages]);

  // Load thumbnails through ImageLoadQueue
  const { loadedImages: loadedThumbnails } = useImageQueue(thumbnailUrls, {
    group: `product-thumbnails-${product.id}`,
    priority: 200, // Low priority: Load AFTER canvas images (hero=0, LOD=1000+)
  });

  // Update selected image when variant changes
  useEffect(() => {
    if (activeVariant?.image_storage_id) {
      const imgIndex = allImages.findIndex(img => img.storageId === activeVariant.image_storage_id);
      if (imgIndex !== -1 && imgIndex !== selectedImageIndex) {
        setSelectedImageIndex(imgIndex);
      }
    }
  }, [activeVariant?.image_storage_id, allImages, selectedImageIndex]);

  // Notify parent when variant changes (but NOT when viewing a sibling product)
  const activeVariantId = activeVariant?.sku || activeVariant?.name || '';
  useEffect(() => {
    if (onVariantChange && activeVariant && !isSiblingView) {
      onVariantChange(activeVariant);
    }
  }, [activeVariantId, onVariantChange, activeVariant, isSiblingView]);

  // Drag handlers (mouse + touch)
  const startDrag = (clientX: number, clientY: number, target: HTMLElement, currentTarget: HTMLElement) => {
    if (target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'A' || target.tagName === 'INPUT') return;
    const rect = currentTarget.getBoundingClientRect();
    if (clientY - rect.top > 150) return;
    setIsDragging(true);
    setDragOffset({ x: clientX - dragPosition.x, y: clientY - dragPosition.y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startDrag(e.clientX, e.clientY, e.target as HTMLElement, e.currentTarget as HTMLElement);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startDrag(touch.clientX, touch.clientY, e.target as HTMLElement, e.currentTarget as HTMLElement);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Keep dialog within viewport bounds
    const maxX = window.innerWidth - DIALOG_WIDTH;
    const maxY = window.innerHeight - 100;

    setDragPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    const newX = touch.clientX - dragOffset.x;
    const newY = touch.clientY - dragOffset.y;
    const maxX = window.innerWidth - DIALOG_WIDTH;
    const maxY = window.innerHeight - 100;
    setDragPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Setup drag listeners (mouse + touch)
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragOffset]);

  // Get current storage ID
  const getCurrentStorageId = (): number | null => {
    if (selectedImageIndex >= 0 && selectedImageIndex < allImages.length) {
      return allImages[selectedImageIndex].storageId;
    }

    if (activeVariant?.image_storage_id) {
      return activeVariant.image_storage_id;
    }
    const media = product.media || [];
    const heroMedia = media.find(m => m.type === 'hero') || media[0];
    return (heroMedia as any)?.storage_id || null;
  };

  // Get high resolution image URL
  const getHighResImageUrl = (): string => {
    const storageId = getCurrentStorageId();

    if (storageId) {
      return `${STORAGE_API_URL}/storage/media/${storageId}?width=1300&height=1300&format=webp&quality=85`;
    }

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

  // Get price - handle both V1 (number) and V2 (object with gross/net) formats
  const getVariantPrice = (variant: any): string => {
    if (!variant?.price) return '';
    // V2 API: price is object { gross, net, currency }
    if (typeof variant.price === 'object' && variant.price.gross !== undefined) {
      const currency = variant.price.currency === 'EUR' ? '€' : variant.price.currency || '€';
      return `${currency} ${variant.price.gross.toFixed(2)}`;
    }
    // V1 API: price is number
    if (typeof variant.price === 'number') {
      return `${variant.currency || '€'} ${variant.price.toFixed(2)}`;
    }
    return '';
  };

  const priceText = activeVariant?.price
    ? getVariantPrice(activeVariant)
    : (product.price?.formatted || `€ ${product.price?.value?.toFixed(2) || '0.00'}`);

  // Get availability - supports V2 (is_available: bool) and V1 (availability: string)
  const availability = activeVariant?.is_available != null
    ? (activeVariant.is_available ? 'In Stock' : 'Out of Stock')
    : (activeVariant?.availability || 'Unknown');
  const availabilityColor = (activeVariant?.is_available === true || availability === 'InStock' || availability === 'In Stock')
    ? '#10b981'
    : (activeVariant?.is_available === false || availability === 'OutOfStock' || availability === 'Out of Stock')
      ? '#ef4444'
      : '#f59e0b';

  // Get product URL
  const productUrl = activeVariant?.url || (product as any).meta?.product_url;

  const variantLabel = [selectedColor, selectedSize].filter(Boolean).join(' / ');

  const getCartImageUrl = (): string | undefined => {
    const storageId = getCurrentStorageId();
    if (storageId) {
      return `${STORAGE_API_URL}/storage/media/${storageId}?width=180&height=180&format=webp&quality=85`;
    }
    if (allImages[selectedImageIndex]?.src) {
      return allImages[selectedImageIndex].src;
    }
    const media = product.media || [];
    return media[0]?.src;
  };

  const handleAddToCart = () => {
    if (onBuy) {
      onBuy({
        product,
        variant: activeVariant,
        priceText,
        imageUrl: getCartImageUrl(),
        variantLabel: variantLabel || undefined,
      });
    }
  };

  const handleShowInHP = () => {
    if (productUrl) {
      window.open(productUrl, '_blank', 'noopener');
    }
  };

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

  return (
    <motion.div
      className="pom-info-panel pom-panel-standalone"
      style={{
        position: 'fixed',
        left: isMobilePortrait ? `${(window.innerWidth - DIALOG_WIDTH) / 2}px` : `${dragPosition.x}px`,
        top: isMobilePortrait ? 'auto' : `${dragPosition.y}px`,
        bottom: isMobilePortrait ? '8px' : 'auto',
        width: `${DIALOG_WIDTH}px`,
        maxHeight: isMobilePortrait ? '48vh' : '80vh',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: isDragging ? 'none' : 'auto',
        fontSize: isMobilePortrait ? '12px' : '11px',
        overflowY: isMobilePortrait ? 'auto' : 'visible',
      }}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{
        duration: 0.3,
        ease: 'easeOut'
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Action buttons - top right on mobile, close only on desktop */}
      <div style={{
        position: 'absolute',
        top: '6px',
        right: '6px',
        display: 'flex',
        gap: '4px',
        zIndex: 10,
      }}>
        {isMobilePortrait && (
          <button className="pom-button pom-button-primary" onClick={handleAddToCart} style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '6px' }}>
            Cart
          </button>
        )}
        <button className="pom-close" onClick={onClose} aria-label="Close" style={{ fontSize: '18px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
      </div>

      {/* Title - V4 Style: First word thin, rest bold */}
      <h2 className="pom-title" style={{ fontSize: '14px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: '1.1' }}>
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

      {/* Thumbnail Gallery - Compact */}
      {allImages.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '4px',
          marginTop: '8px',
          marginBottom: '12px',
          overflowX: 'auto',
          overflowY: 'visible',
          maxWidth: '100%',
          minHeight: '50px'
        }}>
          {allImages.map((img, idx) => {
            const thumbnailUrl = img.storageId
              ? `${STORAGE_API_URL}/storage/media/${img.storageId}?width=130&height=130&format=webp&quality=80`
              : img.src;
            const loadedImage = loadedThumbnails.get(thumbnailUrl);
            const isActive = idx === selectedImageIndex;

            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedImageIndex(idx);
                  if (onImageSelect && allImages[idx]?.storageId) {
                    const thumbnailUrl = allImages[idx].storageId
                      ? `${STORAGE_API_URL}/storage/media/${allImages[idx].storageId}?width=130&height=130&format=webp&quality=80`
                      : '';
                    const cachedThumb = loadedThumbnails.get(thumbnailUrl);
                    onImageSelect(allImages[idx].storageId, cachedThumb || undefined);
                  }
                }}
                style={{
                  display: 'block',
                  width: '45px',
                  height: '45px',
                  minWidth: '45px',
                  minHeight: '45px',
                  flexShrink: 0,
                  border: isActive ? '2px solid #ff6b00' : '1px solid rgba(255, 255, 255, 0.5)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  padding: 0,
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(5px)',
                  transition: 'all 0.2s ease',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                  opacity: loadedImage ? 1 : 0.5,
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)'
                }}
              >
                {loadedImage ? (
                  <img
                    src={loadedImage.src}
                    alt={`${product.name} - ${img.label}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: 'white' }}>
                    ...
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Price & Availability - Compact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div className="pom-price" style={{ fontSize: '16px' }}>{priceText}</div>
        {activeVariant && (
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: availabilityColor,
            padding: '4px 8px',
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '6px'
          }}>
            {availability}
          </div>
        )}
      </div>

      {/* Color Siblings - other colors of the same product */}
      {(() => {
        const activeRaw = (activeProduct as any)?.raw || {};
        const siblings = activeRaw?.siblings || [];
        const currentColor = activeRaw?.color_name;
        if (siblings.length === 0) return null;

        return (
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, marginBottom: '4px' }}>
              Color: {currentColor || 'default'}
            </label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {/* Current color (active) */}
              {currentColor && (
                <div style={{
                  padding: '3px 8px', fontSize: '10px', borderRadius: '4px',
                  border: '2px solid #ff6b00', background: 'rgba(255, 107, 0, 0.2)',
                  color: 'white', fontWeight: '600'
                }}>
                  {currentColor}
                </div>
              )}
              {/* Sibling colors */}
              {siblings.map((sib: any) => (
                <button
                  key={sib.id}
                  type="button"
                  onClick={async () => {
                    setIsSiblingView(true);
                    const sibProduct = await fetchProductById(sib.id);
                    if (sibProduct) {
                      setFullProduct(sibProduct);
                      setSelectedImageIndex(0);
                    }
                  }}
                  style={{
                    padding: '3px 8px', fontSize: '10px', borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title={sib.color_name}
                >
                  {sib.color_name}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Dropdowns - Compact (2 per row) */}
      {variants.length > 0 && (
        <div className="pom-dropdowns" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '12px' }}>
          {allColors.length > 0 && (
            <div className="pom-dropdown-wrapper">
              <label style={{
                display: 'block',
                fontSize: '9px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                opacity: 0.8,
                marginBottom: '4px'
              }}>
                Color
              </label>
              <select
                className="pom-dropdown"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                style={{ fontSize: '11px', padding: '6px 8px' }}
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
              <label style={{
                display: 'block',
                fontSize: '9px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                opacity: 0.8,
                marginBottom: '4px'
              }}>
                Size
              </label>
              <select
                className="pom-dropdown"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                style={{ fontSize: '11px', padding: '6px 8px' }}
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

      {/* Features - Compact, 2 per row */}
      {features.length > 0 && (
        <div className="pom-features" style={{ gap: '6px', gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '12px' }}>
          {features.slice(0, 4).map((feature, idx) => (
            <div key={idx} className="pom-feature" style={{ padding: '8px', gap: '6px' }}>
              <div className="pom-feature-icon" style={{ width: '20px', height: '20px' }}>
                {getFeatureIcon(feature.icon)}
              </div>
              <div className="pom-feature-text">
                <div className="pom-feature-title" style={{ fontSize: '10px' }}>{feature.title}</div>
                {feature.subtitle && (
                  <div className="pom-feature-subtitle" style={{ fontSize: '9px' }}>{feature.subtitle}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Info - Compact */}
      <div className="pom-material" style={{ fontSize: '10px', gap: '4px', marginBottom: '12px' }}>
        {material && <div className="pom-material-item">{material}</div>}
        {activeVariant?.weight_grams && (
          <div className="pom-material-item">Weight: {activeVariant.weight_grams}g</div>
        )}
        {activeVariant?.sku && (
          <div className="pom-material-item">SKU: {activeVariant.sku}</div>
        )}
        {activeVariant?.ean && (
          <div className="pom-material-item">EAN: {activeVariant.ean}</div>
        )}
        {activeVariant?.description_short && (
          <div className="pom-material-item">{activeVariant.description_short}</div>
        )}
      </div>

      {/* Buttons - hidden on mobile portrait (moved to top right) */}
      {!isMobilePortrait && (
        <div className="pom-actions" style={{ gap: '6px' }}>
          <button className="pom-button pom-button-primary" onClick={handleAddToCart} style={{ fontSize: '11px', padding: '8px 12px' }}>
            Add to Cart
          </button>
          {productUrl && (
            <button className="pom-button pom-button-secondary" onClick={handleShowInHP} style={{ fontSize: '11px', padding: '8px 12px' }}>
              Show in HP
            </button>
          )}
          <button className="pom-button pom-button-secondary" onClick={onClose} style={{ fontSize: '11px', padding: '8px 12px' }}>
            Close
          </button>
        </div>
      )}
    </motion.div>
  );
};
