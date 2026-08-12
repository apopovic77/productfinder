import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../types/Product';
import { useImageQueue } from '../hooks/useImageQueue';
import { fetchProductById, fetchProducts } from '../data/ProductRepository';
import './ProductOverlayModal.css';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { getVariantDesignName, getVariantSize, getVariantBaseColor } from '../utils/variantImageHelpers';
import { LifestyleMediaSection } from './LifestyleMediaSection';
import { ProductDocumentsSection } from './ProductDocumentsSection';
import { getDesignFamilyLabel, selectExactDesignFamily } from '../utils/productDesignFamily';

// Storage API base URL from environment
const STORAGE_API_URL = STORAGE_API_BASE;

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

type ColorOption = {
  id: number;
  label: string;
  storage: any;
  product: Product;
};

/**
 * Product Overlay Modal V4 - HORIZONTAL GLASSMORPHISM LAYOUT
 * Modern design based on UI designer's mockup
 * Layout: Product image LEFT | Product info RIGHT
 * Light glassmorphism theme with blur background
 */
export const ProductOverlayModalV4: React.FC<Props> = ({ product, onClose, position, onPositionChange, onVariantChange, onBuy }) => {
  const isMobile = window.innerWidth <= 768;
  const DIALOG_WIDTH = isMobile ? window.innerWidth : 1100;

  // State for full product details (fetched from API with variants)
  const [fullProduct, setFullProduct] = useState<Product | null>(null);
  const [displayProduct, setDisplayProduct] = useState<Product>(product);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSiblingView, setIsSiblingView] = useState(false);
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [activeColorId, setActiveColorId] = useState<number | null>(null);
  const activeColorIdRef = React.useRef<number | null>(null);

  // Fetch full variant details and exact design siblings when the modal opens.
  // The list payload owns taxonomy/properties; the detail payload owns variants.
  useEffect(() => {
    let cancelled = false;

    const loadFullDetails = async () => {
      setIsSiblingView(false);
      setDisplayProduct(product);
      setFullProduct(null);
      setColorOptions([]);
      setActiveColorId(Number(product.id));
      activeColorIdRef.current = Number(product.id);
      setIsLoadingDetails(true);

      try {
        const designGroup = product.getAttributeValue<string>('design_group');
        const familySize = product.getAttributeValue<number>('family_size') ?? 1;
        const [details, familyCandidates] = await Promise.all([
          fetchProductById(product.id),
          designGroup && familySize > 1
            ? fetchProducts({ search: designGroup, limit: Math.min(Math.max(familySize * 2, 10), 100) })
            : Promise.resolve([]),
        ]);
        if (cancelled) return;

        if (details) setFullProduct(details);

        const orderedFamily = selectExactDesignFamily(product, familyCandidates);

        setColorOptions(orderedFamily.map(candidate => {
          const raw = candidate.raw as any;
          return {
            id: Number(candidate.id),
            label: getDesignFamilyLabel(candidate),
            storage: raw?.storage,
            product: candidate,
          };
        }));
      } catch (error) {
        console.error('[V4 Modal] Failed to fetch product details:', error);
      } finally {
        if (!cancelled) setIsLoadingDetails(false);
      }
    };

    loadFullDetails();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  // Use full product if available, otherwise use the passed product
  const activeProduct = fullProduct || displayProduct;

  // Extract variants from the active product
  const variants = (activeProduct as any).variants || [];
  const rawProduct = (activeProduct as any).raw || {};
  const derivedTaxonomy = displayProduct.derived_taxonomy || (rawProduct as any)?.derived_taxonomy;
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
  // Design-name semantics (description_short first) — centralized helper
  const getColor = getVariantDesignName;

  const getSize = getVariantSize;

  // Extract unique colors from all variants
  const allColors = useMemo(() =>
    [...new Set(variants.map(getColor).filter(Boolean))] as string[],
    [variants, getColor]
  );

  // State for selected color and size
  const [selectedColor, setSelectedColor] = useState<string>(allColors[0] || '');
  const [selectedSize, setSelectedSize] = useState<string>('');

  // Reset selection when the displayed colorway changes.
  useEffect(() => {
    setSelectedColor(allColors[0] || '');
    setSelectedSize('');
  }, [displayProduct.id, allColors]);

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

  const specs = displayProduct.specifications || {};
  const propertyFacts = [
    'sport',
    'target_group',
    'body_part',
    'product_function',
    'product_type',
    'product_line',
    'season',
    'model_year',
  ].flatMap(key => {
    const attribute = displayProduct.getAttribute(key);
    if (!attribute || attribute.value === null || attribute.value === undefined || attribute.value === '') return [];
    return [{ key, label: attribute.label, value: attribute.displayValue }];
  });

  // State for thumbnail images
  const [thumbnailImages, setThumbnailImages] = useState<Array<{ storageId: number | null; src: string; label: string }>>([]);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(true);

  // Clear thumbnails immediately when product changes
  useEffect(() => {
    setThumbnailsLoading(true);
    setThumbnailImages([]);
  }, [displayProduct.id]);

  // Load new thumbnails - filtered by selected color (v2 API structure)
  useEffect(() => {
    const timer = setTimeout(() => {
      const images: Array<{ storageId: number | null; src: string; label: string; role?: string }> = [];
      const seenStorageIds = new Set<number>();

      // Find the active variant for selected color (use first size)
      const colorVariants = variants.filter((v: any) => getColor(v) === selectedColor);
      const activeColorVariant = colorVariants[0];

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

      // Legacy fallback: displayed product media (for old API compatibility)
      if (images.length === 0) {
        const media = (displayProduct as any).media || [];
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
  }, [displayProduct.id, variants, selectedColor, getColor]);

  const allImages = thumbnailsLoading ? [] : thumbnailImages;

  // Extract image URLs for large display (all images shown in left column)
  const imageUrls = useMemo(() => {
    return allImages.map(img => {
      if (img.storageId) {
        return getStorageMediaUrl(img.storageId, { width: 1300, format: 'webp', quality: 85 });
      }
      return img.src;
    });
  }, [allImages]);

  // Load all images through ImageLoadQueue
  const { loadedImages } = useImageQueue(imageUrls, {
    group: `product-images-${displayProduct.id}`,
    priority: -20,
  });

  // Notify parent when variant changes (but NOT when viewing a sibling product)
  const activeVariantId = activeVariant?.sku || activeVariant?.name || '';
  useEffect(() => {
    if (onVariantChange && activeVariant && !isSiblingView) {
      onVariantChange(activeVariant);
    }
  }, [activeVariantId, onVariantChange, activeVariant, isSiblingView]);

  // No drag handlers - dialog is fixed and expands on scroll

  // Get price - handle both v1 (number) and v2 (object with gross/net) formats
  const getVariantPrice = (variant: any): string => {
    if (!variant?.price) return '';
    // V2 API: price is object { gross, net, currency }
    if (typeof variant.price === 'object' && variant.price?.gross != null) {
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
    : (displayProduct.price?.formatted || displayProduct.priceText || '');

  const availabilityLabel = typeof activeVariant?.is_available === 'boolean'
    ? (activeVariant.is_available ? 'Available' : 'Not available')
    : (activeVariant?.availability || 'Availability unknown');
  const isAvailable = activeVariant?.is_available !== false
    && String(activeVariant?.availability || '').toLocaleLowerCase() !== 'unavailable';

  // Get product URL
  const productUrl = activeVariant?.url || (displayProduct as any).meta?.product_url;

  const variantLabel = [selectedColor, selectedSize].filter(Boolean).join(' / ');

  const getCartImageUrl = (): string | undefined => {
    const heroImage = allImages[0];
    if (heroImage?.storageId) {
      return getStorageMediaUrl(heroImage.storageId, { width: 220, format: 'webp', quality: 85 });
    }
    if (heroImage?.src) {
      return heroImage.src;
    }
    const media = displayProduct.media || [];
    const fallback = media.find(m => (m as any).storage_id) || media[0];
    if (fallback && (fallback as any).storage_id) {
      return getStorageMediaUrl((fallback as any).storage_id, { width: 220, format: 'webp', quality: 85 });
    }
    return fallback?.src;
  };

  const [quantity, setQuantity] = useState(0);

  useEffect(() => {
    setQuantity(0);
  }, [displayProduct.id, activeVariant?.sku, variantLabel]);

  const emitCartChange = (delta: number) => {
    if (!onBuy || delta === 0) return;
    onBuy({
      product: displayProduct,
      variant: activeVariant,
      priceText,
      imageUrl: getCartImageUrl(),
      variantLabel: variantLabel || undefined,
      quantity: delta,
    });
  };

  const handleAddToCartClick = () => {
    if (quantity > 0) return; // Already in cart, do nothing (size/qty handled in cart view)
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

  // Extract category/subtitle from taxonomy
  const categoryText = taxonomyFamily || taxonomyPath[taxonomyPath.length - 1] || 'Product';

  const productCode = displayProduct.getAttributeValue<string>('product_code');

  // Semantic query for the lifestyle section — taxonomy terms match the
  // German AI image descriptions far better than model names do.
  const lifestyleQuery = useMemo(() => {
    const baseColor = activeVariant ? getVariantBaseColor(activeVariant) : undefined;
    return [taxonomySport, taxonomyFamily || categoryText, baseColor, 'Action Lifestyle']
      .filter(Boolean)
      .join(' ');
  }, [taxonomySport, taxonomyFamily, categoryText, activeVariant]);

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

  const { firstWord: productFirstWord, restWords: productRestWords } = parseProductName(displayProduct.name);

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
          left: isMobile ? '0' : `${(window.innerWidth - DIALOG_WIDTH) / 2}px`,
          top: isMobile ? '0' : `${dialogTop}px`,
          width: isMobile ? '100%' : `${DIALOG_WIDTH}px`,
          height: isMobile ? '100%' : 'auto',
          overflow: isMobile ? 'auto' : 'hidden',
          background: isMobile
            ? 'linear-gradient(145deg, rgba(255,255,255,0.88), rgba(238,243,247,0.78))'
            : 'linear-gradient(145deg, rgba(255,255,255,0.68), rgba(238,243,247,0.54))',
          backdropFilter: 'blur(36px) saturate(155%)',
          WebkitBackdropFilter: 'blur(36px) saturate(155%)',
          borderRadius: isMobile ? '0' : '28px 28px 0 0',
          padding: '0',
          border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.72)',
          borderBottom: 'none',
          boxShadow: isMobile
            ? 'inset 0 1px 0 rgba(255,255,255,0.72)'
            : '0 32px 96px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.16)',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          transition: isMobile ? 'none' : 'top 0.05s linear',
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
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
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
          background: 'rgba(255, 255, 255, 0.38)',
          backdropFilter: 'blur(14px) saturate(150%)',
          WebkitBackdropFilter: 'blur(14px) saturate(150%)',
          border: '1px solid rgba(255,255,255,0.58)',
          borderRadius: '50%',
          color: '#1a1a1a',
          cursor: 'pointer',
          transition: 'all 0.2s',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.7)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.38)';
        }}
      >
        ×
      </button>

      {/* LEFT/TOP SIDE - Product Images */}
      <div style={{
        width: isMobile ? '100%' : '40%',
        padding: isMobile ? '0' : '40px 30px',
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        gap: isMobile ? '0' : '12px',
        overflowX: isMobile ? 'auto' : 'visible',
        scrollSnapType: isMobile ? 'x mandatory' : 'none',
        flexShrink: 0,
      }}>
        {allImages.length > 0 ? (
          allImages.map((img, idx) => {
            const imageUrl = img.storageId
              ? getStorageMediaUrl(img.storageId, { width: 1300, format: 'webp', quality: 85 })
              : img.src;
            const loadedImage = loadedImages.get(imageUrl);

            return (
              <div
                key={idx}
                style={{
                  width: isMobile ? '100%' : '100%',
                  minWidth: isMobile ? '100%' : 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  scrollSnapAlign: isMobile ? 'start' : 'none',
                  padding: isMobile ? '12px' : '0',
                }}
              >
                {loadedImage ? (
                  <img
                    src={loadedImage.src}
                    alt={`${displayProduct.name} - ${img.label || `Image ${idx + 1}`}`}
                    style={{
                      width: '100%',
                      maxHeight: isMobile ? '50vh' : 'none',
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

      {/* RIGHT/BOTTOM SIDE - Product Info */}
      <div style={{
        width: isMobile ? '100%' : '60%',
        padding: isMobile ? '16px 16px 32px' : '40px 40px 40px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '14px' : '20px',
        userSelect: 'text',
        cursor: 'auto',
      }}>
        {/* Category/Subtitle */}
        <div style={{
          fontSize: '14px',
          fontWeight: '400',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'rgba(0, 0, 0, 0.6)',
          marginBottom: '8px',
          textAlign: isMobile ? 'left' : 'center',
          marginTop: isMobile ? '0' : '64px',
        }}>
          {categoryText}
        </div>

        {/* Product Name - First word thin, rest bold */}
        <h2 style={{
          fontSize: isMobile ? '28px' : '48px',
          lineHeight: '1.0',
          margin: 0,
          marginBottom: isMobile ? '16px' : '64px',
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
        {displayProduct.description && (
          <div style={{
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(0, 0, 0, 0.7)',
          }}>
            {displayProduct.description}
          </div>
        )}

        {/* Article Number */}
        <div style={{
          fontSize: '12px',
          color: 'rgba(0, 0, 0, 0.5)',
        }}>
          Art. No. {activeVariant?.sku || displayProduct.id || '0000000000'}
        </div>

        {/* Material info from variant or descriptions */}
        {(() => {
          const activeRaw = (activeProduct as any)?.raw || {};
          const materialFromVariant = activeVariant?.material;
          const descriptions = activeRaw?.descriptions || [];
          // Language 6 = German, 26 = English
          const descDE = descriptions.find((d: any) => d.language_id === 6);
          const descEN = descriptions.find((d: any) => d.language_id === 26);
          const materialText = materialFromVariant || descDE?.material || descEN?.material;
          const descText = descDE?.short_text || descEN?.short_text || activeVariant?.description_short;

          if (!materialText && !descText) return null;
          return (
            <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'rgba(0, 0, 0, 0.6)' }}>
              {descText && <div style={{ marginBottom: '4px' }}>{descText}</div>}
              {materialText && (
                <div style={{ fontSize: '12px', color: 'rgba(0, 0, 0, 0.45)' }}>
                  {materialText}
                </div>
              )}
            </div>
          );
        })()}

        {/* Color Siblings - fixed order, never re-sorts */}
        {(() => {
          if (colorOptions.length <= 1) {
            // No siblings - just show current color
            if (selectedColor) {
              return (
                <div style={{ fontSize: '13px', color: 'rgba(0, 0, 0, 0.6)' }}>
                  Color: <span style={{ fontWeight: '600', color: '#1a1a1a' }}>{selectedColor}</span>
                </div>
              );
            }
            return null;
          }

          const currentId = activeColorId;
          const activeOption = colorOptions.find(option => option.id === currentId);

          return (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.5)', marginBottom: '8px' }}>
                Colorway: <span style={{ color: '#1a1a1a' }}>{activeOption?.label || selectedColor}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {colorOptions.map((opt) => {
                  const isActive = opt.id === currentId;
                  const imageId = opt.storage?.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={async () => {
                        if (isActive) return;
                        setIsSiblingView(true);
                        setActiveColorId(opt.id);
                        activeColorIdRef.current = opt.id;
                        setDisplayProduct(opt.product);
                        setIsLoadingDetails(true);
                        const sibProduct = await fetchProductById(opt.id);
                        if (sibProduct && activeColorIdRef.current === opt.id) {
                          setFullProduct(sibProduct);
                        }
                        if (activeColorIdRef.current === opt.id) setIsLoadingDetails(false);
                      }}
                      title={opt.product.name}
                      style={{
                        padding: imageId ? '5px 9px 5px 5px' : '7px 12px',
                        fontSize: '11px', borderRadius: '9px',
                        border: isActive ? '2px solid #1a1a1a' : '1px solid rgba(0,0,0,0.2)',
                        background: isActive ? 'rgba(17,24,39,0.08)' : 'rgba(0,0,0,0.02)',
                        color: '#1a1a1a',
                        fontWeight: isActive ? '600' : '400',
                        cursor: isActive ? 'default' : 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'inline-flex', alignItems: 'center', gap: '7px', maxWidth: '190px',
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                    >
                      {imageId && (
                        <img
                          src={getStorageMediaUrl(imageId, { width: 72, format: 'webp', quality: 80 })}
                          alt=""
                          style={{ width: '36px', height: '30px', objectFit: 'contain', borderRadius: '5px', background: '#fff' }}
                        />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {availableSizes.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.5)', marginBottom: '8px' }}>
              Size: <span style={{ color: '#1a1a1a' }}>{selectedSize}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {availableSizes.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  aria-pressed={size === selectedSize}
                  style={{
                    minWidth: '54px', padding: '8px 12px', borderRadius: '8px',
                    border: size === selectedSize ? '2px solid #111827' : '1px solid rgba(0,0,0,0.18)',
                    background: size === selectedSize ? '#111827' : '#fff',
                    color: size === selectedSize ? '#fff' : '#111827',
                    fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '10px',
        }}>
          {priceText && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(17,24,39,0.05)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.5)' }}>Price incl. VAT</div>
              <div style={{ marginTop: '4px', fontSize: '18px', fontWeight: '800', color: '#111827' }}>{priceText}</div>
            </div>
          )}
          {activeVariant && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: isAvailable ? 'rgba(22,163,74,0.09)' : 'rgba(220,38,38,0.08)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(0,0,0,0.5)' }}>Availability</div>
              <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: '800', color: isAvailable ? '#15803d' : '#b91c1c' }}>{availabilityLabel}</div>
            </div>
          )}
        </div>

        {(propertyFacts.length > 0 || activeVariant?.ean || activeVariant?.weight_grams) && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(0,0,0,0.5)', marginBottom: '10px' }}>
              Product properties
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '7px 18px' }}>
              {propertyFacts.map(fact => (
                <div key={fact.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingBottom: '6px', borderBottom: '1px solid rgba(0,0,0,0.07)', fontSize: '12px' }}>
                  <span style={{ color: 'rgba(0,0,0,0.5)' }}>{fact.label}</span>
                  <span style={{ color: '#111827', fontWeight: '600', textAlign: 'right' }}>{fact.value}</span>
                </div>
              ))}
              {activeVariant?.ean && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingBottom: '6px', borderBottom: '1px solid rgba(0,0,0,0.07)', fontSize: '12px' }}>
                  <span style={{ color: 'rgba(0,0,0,0.5)' }}>EAN</span>
                  <span style={{ color: '#111827', fontWeight: '600' }}>{activeVariant.ean}</span>
                </div>
              )}
              {activeVariant?.weight_grams != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingBottom: '6px', borderBottom: '1px solid rgba(0,0,0,0.07)', fontSize: '12px' }}>
                  <span style={{ color: 'rgba(0,0,0,0.5)' }}>Weight</span>
                  <span style={{ color: '#111827', fontWeight: '600' }}>{activeVariant.weight_grams} g</span>
                </div>
              )}
            </div>
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

        {/* CTA Button */}
        <div style={{ paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start', width: '100%' }}>
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
              background: quantity > 0 ? '#3fb950' : '#111827',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = quantity > 0 ? '#56d364' : '#000000';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = quantity > 0 ? '#3fb950' : '#111827';
            }}
          >
            {quantity > 0 ? '✓ Im Warenkorb' : 'In Warenkorb legen'}
          </button>

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

        <LifestyleMediaSection query={lifestyleQuery} />

        {productCode && <ProductDocumentsSection productCode={productCode} />}

        {isLoadingDetails && (
          <div style={{ fontSize: '12px', color: 'rgba(0,0,0,0.45)', padding: '8px 0' }}>
            Loading complete variant data…
          </div>
        )}
      </div>
    </motion.div>
    </>
  );
};
