import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { Product } from '../types/Product';
import { soundService } from '../services/SoundService';
import { sanitizeInlineHtml, extractYouTubeIds } from '../utils/richText';
import { useImageQueue } from '../hooks/useImageQueue';
import { fetchProductById } from '../data/ProductRepository';
import './ProductOverlayModal.css';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { getVariantBaseColor, getVariantSize } from '../utils/variantImageHelpers';

// Storage API URL from environment
const STORAGE_API_URL = STORAGE_API_BASE;

type Props = {
  product: Product;
  onClose: () => void;
  position?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  onVariantChange?: (variant: any) => void;
  onImageSelect?: (storageId: number, thumbnailImage?: HTMLImageElement) => void;
  /** Auto-cycle gate: true when the 1300 px version of this image is downloaded. */
  isHiResReady?: (storageId: number) => boolean;
  /**
   * Desktop hero presentation (design 2026-08-23): dark card docked to the
   * right of the stage, not floating over the product. Layout reserves the
   * space, so the card never covers the helmet.
   */
  heroDock?: boolean;
  /** Colour sibling chosen in the card — App re-selects it on the canvas. */
  onSiblingSelect?: (productId: string | number) => boolean;
  /** Expanded state: the SAME card grows into the detail view (true morph). */
  expanded?: boolean;
  onCollapse?: () => void;
  /** Catalog language for the description text (LIUS language ids). */
  locale?: string;
  onShowDetails?: () => void;
  onBuy?: (payload: {
    product: Product;
    variant?: any;
    priceText?: string;
    imageUrl?: string;
    variantLabel?: string;
    quantity?: number;
    size?: string;
    availableSizes?: string[];
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
export const ProductOverlayModalV2: React.FC<Props> = ({ product, onClose, position, onPositionChange, onVariantChange, onImageSelect, onBuy, heroDock = false, isHiResReady, onShowDetails, expanded = false, onCollapse, locale, onSiblingSelect }) => {
  const isMobilePortrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
  // Phone: the dark hero card as a full-width bottom sheet (owner 2026-08-23,
  // "die Karte auch im Desktop-Style"). Same markup as the desktop dock,
  // different geometry — no side dock, no 3D, badges inline.
  const heroSheet = heroDock && isMobilePortrait;
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
  const derivedTaxonomy = product.derived_taxonomy || (rawProduct as any)?.derived_taxonomy;
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

  // Variant color/size extraction — centralized in variantImageHelpers
  // (module functions are referentially stable, safe in dep arrays)
  const getColor = getVariantBaseColor;
  const getSize = getVariantSize;

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

  // Expanded detail text (LIUS long_text, locale-aware) + video ids — used
  // by BOTH the right info column and the hero stage (video plays IN the
  // stage where the photo sits, owner 2026-08-24, 120594).
  const expandedDescText = useMemo(() => {
    const raw: any = (activeProduct as any)?.raw || {};
    const descriptions: any[] = raw?.descriptions || [];
    const LOCALE_IDS: Record<string, number> = { de: 6, fr: 20, it: 22, es: 23, en: 26, pl: 31, cs: 45 };
    const pick = (id: number) => descriptions.find((d: any) => d.language_id === id);
    const longOf = (d: any) => (d?.long_text || '').trim();
    return longOf(pick(LOCALE_IDS[locale || 'de'] ?? 6)) || longOf(pick(26)) || longOf(pick(6)) || '';
  }, [activeProduct, locale]);
  const stageVideoIds = useMemo(() => extractYouTubeIds(expandedDescText), [expandedDescText]);
  const [stageVideoId, setStageVideoId] = useState<string | null>(null);
  useEffect(() => { setStageVideoId(null); }, [product.id, expanded]);

  // Find active variant
  const activeVariant = variants.find((v: any) =>
    getColor(v) === selectedColor && getSize(v) === selectedSize
  ) || variants[0];

  // Extract data
  const keyFeatures = product.key_features || [];
  const specs = product.specifications || {};
  // Material from variant data or specs
  const material = activeVariant?.material || specs.shell_material || specs.materials || null;

  // State for thumbnail images
  const [thumbnailImages, setThumbnailImages] = useState<Array<{ storageId: number | null; src: string; label: string }>>([]);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(true);

  // Clear thumbnails immediately when the shown product changes — ALSO on
  // a colour-sibling swap (fullProduct changes while product.id stays):
  // the old gallery kept showing for siblings without images and a yellow
  // jersey displayed a black/white shirt (owner 2026-08-24, 120598).
  useEffect(() => {
    setThumbnailsLoading(true);
    setThumbnailImages([]);
  }, [product.id, (activeProduct as any)?.id]);

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
            const imageUrl = `${STORAGE_API_URL}/storage/media/${storageId}?width=130&format=webp&quality=80&trim=true`;
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
          const imageUrl = `${STORAGE_API_URL}/storage/media/${storageId}?width=130&format=webp&quality=80&trim=true`;
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
            const imageUrl = `${STORAGE_API_URL}/storage/media/${v.image_storage_id}?width=130&format=webp&quality=80&trim=true`;
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

      // Sync with canvas: the canvas shows the product-level storage image
      // (which can be a different perspective, e.g. back view). Start the
      // gallery on that image when it exists in this variant's set so the
      // active thumb matches what the user already sees. Fallback: index 0.
      const productStorageId = (product as any).storage?.id ?? null;
      const initialIdx = productStorageId != null
        ? images.findIndex(i => i.storageId === productStorageId)
        : -1;
      setSelectedImageIndex(initialIdx >= 0 ? initialIdx : 0);
    }, 10);

    return () => clearTimeout(timer);
  }, [product.id, product.media, variants, selectedColor, getColor]);

  const allImages = thumbnailsLoading ? [] : thumbnailImages;

  // Auto-cycle through the gallery while the card is open (owner
  // 2026-08-23): advance every few seconds, but ONLY to an image whose
  // high-res file is already downloaded (isHiResReady) — never blend to a
  // still-loading image. A manual thumb click pauses the cycle for a while.
  const selectedImageIndexRef = useRef(selectedImageIndex);
  selectedImageIndexRef.current = selectedImageIndex;
  const manualHoldUntilRef = useRef(0);
  // The cycle keeps its own position: the variant-sync effect below may
  // snap the highlight back, and cycling from the snapped-back index would
  // pick the same image forever.
  const cyclePosRef = useRef(-1);
  const autoSelectedRef = useRef(-1);

  useEffect(() => {
    cyclePosRef.current = -1;
    autoSelectedRef.current = -1;
  }, [product.id]);

  useEffect(() => {
    if (!onImageSelect || !isHiResReady || allImages.length < 2) return;
    const timer = setInterval(() => {
      if (Date.now() < manualHoldUntilRef.current) return;
      const cur = cyclePosRef.current >= 0 ? cyclePosRef.current : selectedImageIndexRef.current;
      for (let step = 1; step < allImages.length; step++) {
        const idx = (cur + step) % allImages.length;
        const sid = allImages[idx].storageId;
        if (!sid || !isHiResReady(sid)) continue;
        cyclePosRef.current = idx;
        autoSelectedRef.current = idx;
        setSelectedImageIndex(idx);
        onImageSelect(sid);
        break;
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [product.id, allImages, onImageSelect, isHiResReady]);

  // Thumbnail URL builder — width only, NO height: with trim=true the server
  // crops to (non-square) trim bounds first; forcing width+height would
  // distort the image into a square (issue #249). Aspect fit happens in CSS.
  const buildThumbUrl = (storageId: number) =>
    `${STORAGE_API_URL}/storage/media/${storageId}?width=130&format=webp&quality=80&trim=true`;

  // Extract thumbnail URLs for ImageLoadQueue
  const thumbnailUrls = useMemo(() => {
    return allImages.map(img => {
      if (img.storageId) {
        return buildThumbUrl(img.storageId);
      }
      return img.src;
    });
  }, [allImages]);

  // Load thumbnails through ImageLoadQueue
  const { loadedImages: loadedThumbnails } = useImageQueue(thumbnailUrls, {
    group: `product-thumbnails-${product.id}`,
    priority: 200, // Low priority: Load AFTER canvas images (hero=0, LOD=1000+)
  });

  // Update selected image when variant changes (V1 API only — V2 variants
  // carry storage.id instead, but auto-jumping on V2 would fight the
  // canvas-synced initial index set in the thumbnail-load effect above).
  useEffect(() => {
    if (activeVariant?.image_storage_id) {
      // Don't fight the gallery auto-cycle: a selection it just made is
      // intentional, not a variant change to correct.
      if (selectedImageIndex === autoSelectedRef.current) return;
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
      // width only — height would distort trimmed (non-square) images, see issue #249
      return `${STORAGE_API_URL}/storage/media/${storageId}?width=1300&format=webp&quality=85&trim=true`;
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
      // gross can be null in LIUS (price not maintained) — crashed the card
      return typeof variant.price.gross === 'number' ? `${currency} ${variant.price.gross.toFixed(2)}` : '';
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
      return `${STORAGE_API_URL}/storage/media/${storageId}?width=180&format=webp&quality=85&trim=true`;
    }
    if (allImages[selectedImageIndex]?.src) {
      return allImages[selectedImageIndex].src;
    }
    const media = product.media || [];
    return media[0]?.src;
  };

  const handleAddToCart = () => {
    soundService.tick();
    if (onBuy) {
      onBuy({
        product,
        variant: activeVariant,
        priceText,
        imageUrl: getCartImageUrl(),
        variantLabel: variantLabel || undefined,
        // The cart is a size matrix — hand it the chosen size and the clean
        // size list (issue #1303: quantity landed nowhere visible).
        size: selectedSize || availableSizes[0] || undefined,
        availableSizes: availableSizes.length ? availableSizes : undefined,
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

  // Hero dock title (design 2026-08-23): series / MODEL / colour from the
  // structured fields, not guessed from the name. "2SRS Helmet RUSH" ->
  // series "2SRS", model "RUSH" (line prefix and generic nouns stripped).
  const heroTitle = useMemo(() => {
    const line: string = rawProduct.product_line || '';
    const design: string = rawProduct.design_group || product.name || '';
    let model = line ? design.replace(new RegExp('^' + line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '') : design;
    model = model.replace(/\b(Helmet|Helm|Youth|Glove|Gloves|Jersey|Pants|Pant|Boot|Boots|Goggle|Jacket|Polyacrylite|Hyperlite|Fidlock®?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    // Marketing copy as design_group ("SUPERLEICHTER MX MIT NUR 1.150
    // GRAMM - 8SRS", 120531): drop a trailing "- <series>" echo and cap
    // the headline at a card-sized length.
    if (line) model = model.replace(new RegExp('\\s*[-–]\\s*' + line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
    if (model.length > 42) {
      const cut = model.slice(0, 42);
      model = cut.slice(0, Math.max(20, cut.lastIndexOf(' '))) + '…';
    }
    if (!model) model = line || design;
    // "7SRS" series + "7SRS" model rendered as "7SRS 7SRS" — drop the
    // series line when it adds nothing.
    const series = line && line.trim().toLowerCase() !== model.trim().toLowerCase() ? line : '';
    return { series, model, colour: (rawProduct.color_name || '') as string };
  }, [rawProduct.product_line, rawProduct.design_group, rawProduct.color_name, product.name]);

  // Hero dock badges (design 2026-08-23): only what the data really carries.
  // Weight = the selected variant's (helmets differ by size, 2087-2117 g),
  // falling back to the first variant with one. Size range = first to last
  // size as the API orders them; helmets carry head circumference in
  // brackets ("XS (53/54)" … "2XL (63/64)") -> "53-64 cm", apparel -> "S-2XL".
  const heroBadges = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    const w = activeVariant?.weight_grams ?? variants.find((v: any) => v.weight_grams > 0)?.weight_grams;
    if (w > 0) out.push({ label: 'Gewicht', value: `${Math.round(w)} g` });
    const sizes: string[] = variants.map((v: any) => v.size).filter((x: any) => typeof x === 'string' && x.trim());
    if (sizes.length >= 2) {
      const first = sizes[0], last = sizes[sizes.length - 1];
      const cm = (t: string) => t.match(/\((\d+)\s*\/\s*(\d+)\)/);
      const a = cm(first), b = cm(last);
      out.push({
        label: 'Größen',
        value: a && b ? `${a[1]}–${b[2]} cm` : `${first.replace(/\s*\(.*$/, '')}–${last.replace(/\s*\(.*$/, '')}`,
      });
    } else if (sizes.length === 1) {
      out.push({ label: 'Größe', value: sizes[0] });
    }
    return out;
  }, [activeVariant?.weight_grams, variants]);

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
      className={`pom-info-panel pom-panel-standalone ${heroDock ? 'pom-hero-dock' : ''} ${heroSheet && !expanded ? 'pom-hero-sheet' : ''} ${expanded ? 'pom-expanded' : ''}`}
      style={{
        position: 'fixed',
        // ANCHOR NEVER MOVES (fluid morph, owner 2026-08-24): the dock card
        // is pinned bottom-right; expanding interpolates width/height from
        // that same corner — up and to the left. The sheet keeps its
        // bottom strip anchors and grows upward.
        left: heroSheet || isMobilePortrait ? '8px' : 'auto',
        right: heroSheet || isMobilePortrait ? '8px' : '208px',
        top: 'auto',
        transform: undefined,
        boxSizing: 'border-box',
        cursor: heroDock ? 'default' : isDragging ? 'grabbing' : 'grab',
        userSelect: isDragging ? 'none' : 'auto',
        fontSize: isMobilePortrait ? '12px' : '11px',
        overflowY: expanded ? 'auto' : heroSheet ? 'hidden' : isMobilePortrait ? 'auto' : 'visible',
      }}
      animate={{
        opacity: 1,
        // Expanded: flush with the bottom edge, only the top corners stay
        // rounded (owner 2026-08-24).
        bottom: expanded ? 0 : (heroSheet || isMobilePortrait ? 8 : 88),
        borderBottomLeftRadius: expanded ? 0 : 18,
        borderBottomRightRadius: expanded ? 0 : 18,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        width: heroSheet || isMobilePortrait
          ? undefined
          : (expanded ? Math.min(1040, window.innerWidth - 248) : 340),
        maxHeight: heroSheet || isMobilePortrait
          ? (expanded ? Math.round(window.innerHeight * 0.9) - 16 : Math.round(window.innerHeight * 0.5))
          : (expanded ? Math.round(window.innerHeight * 0.86) : window.innerHeight - 150),
        rotateY: !isMobilePortrait && !expanded ? -7 : 0,
        transformPerspective: 1400,
      }}
      initial={{ opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.45,
        ease: [0.4, 0, 0.2, 1],
        opacity: { duration: 0.3 },
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
        {isMobilePortrait && !heroSheet && (
          <button className="pom-button pom-button-primary" onClick={handleAddToCart} style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '6px' }}>
            Cart
          </button>
        )}
        <button className="pom-close" onClick={expanded && onCollapse ? onCollapse : onClose} aria-label="Close" style={{ position: 'static', flex: '0 0 auto', fontSize: '18px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
      </div>

      {/* Expanded: hero stage — the big dialog exists to PRESENT the
          product (owner 2026-08-24). Large active image on a white stage,
          thumbs below it; the outer mini strip hides via CSS. */}
      {expanded && allImages.length === 0 && !thumbnailsLoading && (
        <div className="pom-expanded-hero pom-expanded-hero-empty">
          <span>Kein Produktbild verfügbar</span>
        </div>
      )}
      {expanded && allImages.length > 0 && (() => {
        const active = allImages[Math.max(0, Math.min(selectedImageIndex, allImages.length - 1))];
        const heroSrc = active?.storageId
          ? `${STORAGE_API_URL}/storage/media/${active.storageId}?width=1000&format=webp&quality=85&trim=true`
          : active?.src;
        // Fixed to the viewport: the stage must NOT scroll with the info
        // column (owner 2026-08-24 — two separate blocks). The dialog
        // geometry is deterministic (anchored bottom-right).
        const expW = Math.min(1040, window.innerWidth - 248);
        const stageStyle: React.CSSProperties = isMobilePortrait ? {} : {
          position: 'fixed',
          left: `${window.innerWidth - 208 - expW + 20}px`,
          top: 'calc(14vh + 20px)',
          bottom: '20px',
          width: '492px',
        };
        const stage = (
          <div className="pom-expanded-hero" style={{ ...stageStyle, zIndex: 10002 }}>
            {stageVideoId ? (
              <iframe
                className="pom-expanded-hero-video"
                src={`https://www.youtube-nocookie.com/embed/${stageVideoId}?autoplay=1`}
                title="Produktvideo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <img className="pom-expanded-hero-img" src={heroSrc} alt={product.name} />
            )}
            <div className="pom-expanded-hero-thumbs">
              {stageVideoIds.map(id => (
                <button
                  key={`video-${id}`}
                  type="button"
                  className={`pom-expanded-thumb pom-expanded-thumb-video ${stageVideoId === id ? 'active' : ''}`}
                  onClick={() => setStageVideoId(stageVideoId === id ? null : id)}
                  title="Produktvideo abspielen"
                >
                  <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" />
                  <span className="pom-expanded-thumb-play">▶</span>
                </button>
              ))}
              {allImages.map((img, idx) => {
                const thumbnailUrl = img.storageId ? buildThumbUrl(img.storageId) : img.src;
                const isActive = idx === selectedImageIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`pom-expanded-thumb ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setStageVideoId(null);
                      manualHoldUntilRef.current = Date.now() + 12000;
                      cyclePosRef.current = idx;
                      autoSelectedRef.current = -1;
                      setSelectedImageIndex(idx);
                      if (onImageSelect && img.storageId) {
                        const cachedThumb = loadedThumbnails.get(buildThumbUrl(img.storageId));
                        onImageSelect(img.storageId, cachedThumb || undefined);
                      }
                    }}
                  >
                    <img src={thumbnailUrl} alt="" />
                  </button>
                );
              })}
            </div>
          </div>
        );
        // Portal: position:fixed inside the dialog is captured by its
        // transform (framer) — outside it is truly viewport-fixed.
        return isMobilePortrait ? stage : createPortal(stage, document.body);
      })()}

      {/* Title - V4 Style: First word thin, rest bold */}
      {heroDock ? (
        <h2 className="pom-title pom-title-hero" style={{ margin: '0 0 4px', textTransform: 'uppercase', lineHeight: '1' }}>
          {heroTitle.series && <div className="pom-hero-series">{heroTitle.series}</div>}
          <div className="pom-hero-model">{heroTitle.model}</div>
          {heroTitle.colour && (
            <div className="pom-hero-colour">
              {heroTitle.colour.split('/').map((c, i, arr) => (
                <span key={i} className={i === arr.length - 1 && arr.length > 1 ? 'accent' : ''}>
                  {c.trim()}{i < arr.length - 1 ? <span className="sep"> / </span> : null}
                </span>
              ))}
            </div>
          )}
        </h2>
      ) : (
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
      )}

      {/* Thumbnail Gallery - Compact */}
      {allImages.length > 0 && (
        <div className="pom-thumb-strip" style={{
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
              ? buildThumbUrl(img.storageId)
              : img.src;
            const loadedImage = loadedThumbnails.get(thumbnailUrl);
            const isActive = idx === selectedImageIndex;

            return (
              <button
                key={idx}
                onClick={() => {
                  manualHoldUntilRef.current = Date.now() + 12000;
                  cyclePosRef.current = idx;
                  autoSelectedRef.current = -1;
                  setSelectedImageIndex(idx);
                  if (onImageSelect && allImages[idx]?.storageId) {
                    const cachedThumb = loadedThumbnails.get(buildThumbUrl(allImages[idx].storageId!));
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
                      objectFit: 'contain'
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

      {/* Color — rectangles (selectable, switches to sibling product) */}
      {(() => {
        const activeRaw = (activeProduct as any)?.raw || {};
        const siblings: any[] = activeRaw?.siblings || [];
        const currentColor = activeRaw?.color_name || selectedColor;
        const currentId = activeRaw?.id;

        // Build a stable list: current color + siblings
        const options: Array<{ id: number | string; color_name: string }> = [];
        if (currentColor) options.push({ id: currentId ?? 'current', color_name: currentColor });
        for (const sib of siblings) {
          options.push({ id: sib.id, color_name: sib.color_name });
        }
        if (options.length === 0) return null;

        return (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, marginBottom: '6px' }}>
              Color: <span style={{ opacity: 1 }}>{currentColor}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {options.map((opt) => {
                const isActive = opt.id === currentId || (opt.id === 'current' && options.length === 1);
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    disabled={isActive}
                    onClick={async () => {
                      if (isActive || opt.id === 'current') return;
                      // Prefer a real re-selection: canvas, stage and card
                      // then all show the SAME product. In-card sibling view
                      // only when the sibling is not on the current level.
                      if (onSiblingSelect && onSiblingSelect(opt.id)) return;
                      setIsSiblingView(true);
                      const sibProduct = await fetchProductById(opt.id as number);
                      if (sibProduct) {
                        setFullProduct(sibProduct);
                        setSelectedImageIndex(0);
                      }
                    }}
                    style={{
                      padding: '6px 12px', fontSize: '11px', borderRadius: '6px',
                      border: isActive ? '2px solid #ff6b00' : '1px solid rgba(255,255,255,0.25)',
                      background: isActive ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.08)',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.85)',
                      fontWeight: isActive ? 600 : 400,
                      cursor: isActive ? 'default' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={opt.color_name}
                  >
                    {opt.color_name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Sizes — selectable chips; the chosen size goes into the cart via
          activeVariant (owner 2026-08-23: plain text left no way to pick). */}
      {availableSizes.length > 0 && (
        <div className="pom-size-block" style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, marginBottom: '6px' }}>
            Size: <span style={{ opacity: 1 }}>{selectedSize || availableSizes[0]}</span>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {availableSizes.map(size => {
              const isActive = size === selectedSize;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  style={{
                    padding: '5px 10px', fontSize: '11px', borderRadius: '6px',
                    border: isActive ? '2px solid #ff6b00' : '1px solid rgba(255,255,255,0.25)',
                    background: isActive ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.08)',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.85)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: isActive ? 'default' : 'pointer',
                    transition: 'all 0.15s ease',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
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

      {heroDock && heroBadges.length > 0 && (
        <aside className="pom-hero-badges" aria-label="Produktdaten">
          {heroBadges.map(b => (
            <div key={b.label} className="pom-hero-badge">
              <span className="pom-hero-badge-label">{b.label}</span>
              <span className="pom-hero-badge-value">{b.value}</span>
            </div>
          ))}
        </aside>
      )}

      {/* Expanded-only detail sections: the SAME dialog grows and reveals
          these (owner 2026-08-24 — true morph, no second dialog). */}
      {expanded && (() => {
        const descText = expandedDescText || (activeVariant as any)?.description_long || '';
        const props: Array<[string, string]> = [];
        const raw: any = (product as any).raw || {};
        const attrs: any = (product as any).attributes || {};
        const attr = (k: string) => attrs[k]?.value ?? raw?.properties?.[k];
        if (attr('sport')) props.push(['Sport', String(Array.isArray(attr('sport')) ? attr('sport').join(', ') : attr('sport'))]);
        if (attr('target_group')) props.push(['Zielgruppe', String(attr('target_group'))]);
        if (attr('product_line')) props.push(['Produktlinie', String(attr('product_line'))]);
        if (raw?.model_year) props.push(['Jahrgang', String(raw.model_year)]);
        if ((activeVariant as any)?.material) props.push(['Material', String((activeVariant as any).material)]);
        for (const b of heroBadges) props.push([b.label, b.value]);
        return (
          <div className="pom-expanded-extra">
            {descText && (
              <div className="pom-expanded-desc">
                {descText.split(/<br\s*\/?>/i).map((line: string) => line.replace(/^\s*-\s*/, '').trim()).filter(Boolean).map((line: string, i: number) => (
                  <div key={i} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(line) }} />
                ))}
              </div>
            )}
            {props.length > 0 && (
              <div className="pom-expanded-props">
                {props.map(([k, v]) => (
                  <div key={k} className="pom-expanded-prop">
                    <span className="pom-expanded-prop-label">{k}</span>
                    <span className="pom-expanded-prop-value">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Buttons - hidden on mobile portrait (moved to top right) */}
      {(!isMobilePortrait || heroSheet) && (
        <div className="pom-actions" style={{ gap: '6px' }}>
          <button className="pom-button pom-button-primary" onClick={handleAddToCart} style={{ fontSize: '11px', padding: '8px 12px' }}>
            Add to Cart
          </button>
          {(onShowDetails || onCollapse) && (
            <button className="pom-button" onClick={expanded ? onCollapse : onShowDetails} style={{ fontSize: '11px', padding: '8px 12px' }}>
              {expanded ? 'Weniger' : 'Mehr Details'}
            </button>
          )}
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
