import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product } from '../types/Product';
import { useImageQueue } from '../hooks/useImageQueue';
import './ProductOverlayModal.css';

// Storage proxy URL from environment
const STORAGE_PROXY_URL = import.meta.env.VITE_STORAGE_PROXY_URL || 'https://share.arkturian.com/proxy.php';

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
 * Product Overlay Modal V3 - HERO MODE VERSION (700px Vertical Layout)
 * Large, prominent design for Hero Mode (when < 8 products)
 * Used with fullscreen video background
 * Vertical layout: Large product image -> Thumbnails -> Info -> Actions
 */
export const ProductOverlayModalV3: React.FC<Props> = ({ product, onClose, position, onPositionChange, onVariantChange }) => {
  const DIALOG_WIDTH = 700; // Large width for Hero Mode

  // Extract variants
  const variants = (product as any).variants || [];
  const rawProduct = (product as any).raw || {};
  const derivedTaxonomy = (product as any).derived_taxonomy || rawProduct?.derived_taxonomy;
  const metaInfo = (product.meta && Object.keys(product.meta).length ? product.meta : rawProduct?.meta) || {};
  const taxonomyPath = Array.isArray(derivedTaxonomy?.path) ? derivedTaxonomy.path : [];
  const taxonomySport = derivedTaxonomy?.sport;
  const taxonomyFamily = derivedTaxonomy?.product_family;

  // Drag state - start positioned PERFECTLY CENTERED (Hero Mode)
  const [dragPosition, setDragPosition] = useState(() => ({
    x: (window.innerWidth - DIALOG_WIDTH) / 2, // Centered horizontally
    y: window.innerHeight * 0.05 // 5vh from top (dialog maxHeight is 90vh, so 5vh top + 90vh + 5vh bottom = perfect centering)
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

  // Helper functions to parse variant name - memoized to prevent re-creation
  const getColor = useCallback((variant: any): string => {
    // Try option2 first (some variants have color in option2)
    if (variant.option2) return String(variant.option2);
    // Then option1
    if (variant.option1) return String(variant.option1);
    // Fallback to parsing name: "Color1/Color2/Color3 / Size"
    // Split by " / " (with spaces) to separate colors from size
    const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
    return parts[0] || variant.sku || 'Default';
  }, []);

  const getSize = useCallback((variant: any): string => {
    // Try option1 first (some variants have size in option1)
    if (variant.option1 && !variant.option2) return String(variant.option1);
    // If both exist, option1 is likely the size
    if (variant.option1 && variant.option2) {
      // Check if option1 looks like a size (contains numbers or is short)
      const opt1 = String(variant.option1);
      const opt2 = String(variant.option2);
      // If opt1 is numeric or short (like "XL", "M", "42"), it's likely a size
      if (/^\d+$/.test(opt1) || opt1.length <= 3) {
        return opt1;
      }
      // Otherwise opt2 is the color, so there's no size
      return '';
    }
    // Fallback to parsing name: "Color1/Color2/Color3 / Size"
    // Split by " / " (with spaces) to separate colors from size
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
  const [imageOpacity, setImageOpacity] = useState<number>(1);

  // Reset all state when product changes
  useEffect(() => {
    setSelectedColor(allColors[0] || '');
    setSelectedSize('');
    setSelectedImageIndex(0);
    setImageOpacity(1);
  }, [product.id, allColors]);

  // Reset selected image when color changes
  useEffect(() => {
    setSelectedImageIndex(0);
    setImageOpacity(1);
  }, [selectedColor]);

  // Handle image change with fade transition
  const handleImageChange = useCallback((newIndex: number) => {
    if (newIndex === selectedImageIndex) return;

    // Fade out
    setImageOpacity(0);

    // Wait for fade-out, then change image and fade in
    setTimeout(() => {
      setSelectedImageIndex(newIndex);
      setImageOpacity(1);
    }, 200); // 200ms fade-out duration
  }, [selectedImageIndex]);

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

      // Add product media images (these are shared across all variants)
      const media = product.media || [];
      media.forEach((m, idx) => {
        const storageId = (m as any).storage_id || null;
        const src = m.src || '';
        const label = m.type || `Image ${idx + 1}`;
        images.push({ storageId, src, label });
      });

      // Add variant images ONLY for the selected color
      const colorVariants = variants.filter((v: any) => getColor(v) === selectedColor);
      const variantImageIds = new Set<number>();

      colorVariants.forEach((v: any) => {
        if (v.image_storage_id && !images.some(img => img.storageId === v.image_storage_id)) {
          variantImageIds.add(v.image_storage_id);
        }
      });

      variantImageIds.forEach((storageId) => {
        const imageUrl = `${STORAGE_PROXY_URL}?id=${storageId}&width=130&format=webp&quality=80&trim=false`;
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

  // Extract thumbnail URLs for ImageLoadQueue
  const thumbnailUrls = useMemo(() => {
    return allImages.map(img => {
      if (img.storageId) {
        return `${STORAGE_PROXY_URL}?id=${img.storageId}&width=130&format=webp&quality=80&trim=false`;
      }
      return img.src;
    });
  }, [allImages]);

  // Load thumbnails through ImageLoadQueue
  const { loadedImages: loadedThumbnails } = useImageQueue(thumbnailUrls, {
    group: `product-thumbnails-${product.id}`,
    priority: -30, // HIGHEST PRIORITY: Thumbnails are small, cache-friendly, and instantly visible!
  });

  // Update selected image when variant changes
  useEffect(() => {
    if (activeVariant?.image_storage_id) {
      const imgIndex = allImages.findIndex(img => img.storageId === activeVariant.image_storage_id);
      if (imgIndex !== -1 && imgIndex !== selectedImageIndex) {
        handleImageChange(imgIndex);
      }
    }
  }, [activeVariant?.image_storage_id, allImages, selectedImageIndex, handleImageChange]);

  // Notify parent when variant changes
  const activeVariantId = activeVariant?.sku || activeVariant?.name || '';
  useEffect(() => {
    if (onVariantChange && activeVariant) {
      onVariantChange(activeVariant);
    }
  }, [activeVariantId, onVariantChange, activeVariant]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Don't allow dragging from interactive elements
    if (target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'A' || target.tagName === 'INPUT') {
      return;
    }

    // Only allow dragging from the top area (header + image area)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    if (relativeY > 550) {
      return;
    }

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - dragPosition.x,
      y: e.clientY - dragPosition.y,
    });
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

  // Setup drag listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
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
      // Main dialog image: NO trim (consistent aspect ratio with thumbnail - prevents visual jump during LOD update)
      return `${STORAGE_PROXY_URL}?id=${storageId}&width=1300&format=webp&quality=85&trim=false`;
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

  // Get price
  const priceText = activeVariant?.price
    ? `${activeVariant.currency || '€'} ${activeVariant.price.toFixed(2)}`
    : (product.price?.formatted || `€ ${product.price?.value?.toFixed(2) || '0.00'}`);

  // Get availability
  const availability = activeVariant?.availability || 'Unknown';
  const availabilityColor = availability === 'InStock' ? '#10b981' : (availability === 'OutOfStock' ? '#ef4444' : '#f59e0b');

  // Get product URL
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

  // Load high-res image URL
  const highResUrl = getHighResImageUrl();
  const { loadedImages: loadedHeroImages } = useImageQueue([highResUrl], {
    group: `product-hero-${product.id}`,
    priority: -10, // ABSOLUTE HIGHEST PRIORITY - Main dialog image should load/sharpen FIRST!
  });
  const loadedHeroImage = loadedHeroImages.get(highResUrl);

  return (
    <motion.div
      className="pom-info-panel pom-panel-standalone"
      style={{
        position: 'fixed',
        left: `${dragPosition.x}px`,
        top: `${dragPosition.y}px`,
        width: `${DIALOG_WIDTH}px`,
        maxHeight: '90vh',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: isDragging ? 'none' : 'auto',
        overflowY: 'auto',
        background: 'rgba(20, 20, 30, 0.85)', // Darker glassmorphism
        backdropFilter: 'blur(20px)', // Stronger blur
        borderRadius: '24px', // Larger border radius
        padding: '32px', // More padding
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)', // Stronger shadow
      }}
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 0 }}
      transition={{
        duration: 0.6,
        ease: [0.4, 0, 0.2, 1], // Smooth easing
        delay: 0.3 // Wait for video to start fading in
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={handleMouseDown}
    >
      {/* Close button */}
      <button
        className="pom-close"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          fontSize: '32px',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        ×
      </button>

      {/* Product Name - Large and Bold */}
      <h2
        className="pom-title"
        style={{
          fontSize: '28px',
          fontWeight: '700',
          marginBottom: '24px',
          marginTop: '8px',
          lineHeight: '1.2',
          color: 'white',
        }}
      >
        {product.name}
      </h2>

      {/* Large Product Image */}
      <div style={{
        width: '100%',
        height: '600px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {loadedHeroImage ? (
          <img
            src={loadedHeroImage.src}
            alt={product.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: imageOpacity,
              transition: 'opacity 0.2s ease-in-out',
            }}
          />
        ) : (
          <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '16px' }}>
            Loading...
          </div>
        )}
      </div>

      {/* Thumbnail Gallery */}
      {allImages.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '28px',
          overflowX: 'auto',
          overflowY: 'visible',
          maxWidth: '100%',
          minHeight: '80px',
          paddingTop: '8px',
          paddingBottom: '8px',
        }}>
          {allImages.map((img, idx) => {
            const thumbnailUrl = img.storageId
              ? `${STORAGE_PROXY_URL}?id=${img.storageId}&width=130&format=webp&quality=80&trim=false`
              : img.src;
            const loadedImage = loadedThumbnails.get(thumbnailUrl);
            const isActive = idx === selectedImageIndex;

            return (
              <button
                key={idx}
                onClick={() => handleImageChange(idx)}
                style={{
                  display: 'block',
                  width: '70px',
                  height: '70px',
                  minWidth: '70px',
                  minHeight: '70px',
                  flexShrink: 0,
                  border: isActive ? '3px solid #ff6b00' : '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  padding: 0,
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  transition: 'all 0.2s ease',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                  opacity: loadedImage ? 1 : 0.5,
                  boxShadow: isActive ? '0 4px 12px rgba(255, 107, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.3)',
                  outline: 'none', // Remove blue browser focus outline
                }}
              >
                {loadedImage ? (
                  <img
                    src={loadedImage.src}
                    alt={`${product.name} - ${img.label}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white' }}>
                    ...
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Price & Availability */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <div
          className="pom-price"
          style={{
            fontSize: '36px',
            fontWeight: '700',
            color: '#ff6b00',
          }}
        >
          {priceText}
        </div>
        {activeVariant && (
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: availabilityColor,
            padding: '8px 16px',
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)',
          }}>
            {availability}
          </div>
        )}
      </div>

      {/* Color & Size Dropdowns */}
      {variants.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {allColors.length > 0 && (
            <div className="pom-dropdown-wrapper">
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                opacity: 0.9,
                marginBottom: '8px',
                color: 'white',
              }}>
                Color
              </label>
              <select
                className="pom-dropdown"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                style={{
                  fontSize: '16px',
                  padding: '14px 16px',
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  color: 'white',
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

          {availableSizes.length > 0 && (
            <div className="pom-dropdown-wrapper">
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                opacity: 0.9,
                marginBottom: '8px',
                color: 'white',
              }}>
                Size
              </label>
              <select
                className="pom-dropdown"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                style={{
                  fontSize: '16px',
                  padding: '14px 16px',
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  color: 'white',
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

      {/* Action Buttons - Large */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
        {productUrl && (
          <button
            className="pom-button pom-button-primary"
            onClick={handleViewWebsite}
            style={{
              fontSize: '18px',
              fontWeight: '700',
              padding: '18px 36px',
              flex: 1,
              background: 'linear-gradient(135deg, #ff6b00 0%, #ff8800 100%)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(255, 107, 0, 0.4)',
            }}
          >
            Buy Now
          </button>
        )}
        <button
          className="pom-button pom-button-secondary"
          onClick={onClose}
          style={{
            fontSize: '18px',
            fontWeight: '600',
            padding: '18px 36px',
            background: 'rgba(255, 255, 255, 0.15)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '12px',
            color: 'white',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Close
        </button>
      </div>

      {/* Features */}
      {features.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {features.slice(0, 4).map((feature, idx) => (
            <div
              key={idx}
              style={{
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ width: '28px', height: '28px', color: '#ff6b00', flexShrink: 0 }}>
                {getFeatureIcon(feature.icon)}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                  {feature.title}
                </div>
                {feature.subtitle && (
                  <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                    {feature.subtitle}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Material Info */}
      <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div>{material}</div>
        {activeVariant?.sku && (
          <div>SKU: {activeVariant.sku}</div>
        )}
        {getCurrentStorageId() && (
          <div>ID: {getCurrentStorageId()}</div>
        )}
      </div>
    </motion.div>
  );
};
