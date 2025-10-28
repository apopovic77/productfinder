import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Product, MediaItem } from '../types/Product';
import './ProductModal.css';

type Props = {
  product: Product;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  direction?: number;
};

const formatSpecValue = (label: string, value: string | number | undefined) => {
  if (!value && value !== 0) return null;
  return { label, value: String(value) };
};

const getHeroMedia = (media?: MediaItem[]): MediaItem | undefined => {
  if (!media || media.length === 0) return undefined;
  const hero = media.find(item => item.type === 'hero');
  return hero ?? media[0];
};

const imageVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 70 : -70,
    rotate: direction >= 0 ? 5 : -5,
    scale: 0.9
  }),
  center: {
    opacity: 1,
    x: 0,
    rotate: 0,
    scale: 1
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction <= 0 ? 50 : -50,
    rotate: direction <= 0 ? 3 : -3,
    scale: 0.9
  })
};

const transition = { type: 'spring', stiffness: 420, damping: 36, mass: 0.6 };

export const ProductModal: React.FC<Props> = ({ product, onClose, onPrev, onNext, hasPrev = false, hasNext = false, direction = 0 }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imageDirection, setImageDirection] = useState(direction);
  const [copied, setCopied] = useState(false);

  const media = product.media ?? [];
  const totalMedia = media.length;

  useEffect(() => {
    setSelectedIndex(0);
    setImageDirection(direction ?? 0);
  }, [product.id, direction]);

  const moveToIndex = useCallback((targetIndex: number) => {
    if (!totalMedia) return;
    const normalized = (targetIndex + totalMedia) % totalMedia;
    if (normalized === selectedIndex) return;
    const dir = normalized > selectedIndex ? 1 : -1;
    setImageDirection(dir);
    setSelectedIndex(normalized);
  }, [selectedIndex, totalMedia]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!totalMedia) return;
      if (e.key === 'ArrowRight') {
        moveToIndex(selectedIndex + 1);
      }
      if (e.key === 'ArrowLeft') {
        moveToIndex(selectedIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveToIndex, onClose, selectedIndex, totalMedia]);

  useEffect(() => {
    const handleModalNav = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        setImageDirection(1);
        onNext?.();
      }
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        setImageDirection(-1);
        onPrev?.();
      }
    };
    window.addEventListener('keydown', handleModalNav);
    return () => window.removeEventListener('keydown', handleModalNav);
  }, [hasNext, hasPrev, onNext, onPrev]);

  const heroMedia = useMemo(() => {
    if (!totalMedia) return undefined;
    return media[selectedIndex] ?? getHeroMedia(media);
  }, [media, selectedIndex, totalMedia]);

  const meta = (product as unknown as { meta?: { description?: string; status?: string; product_url?: string } }).meta;
  const description = meta?.description ?? (product.specifications as any)?.description;

  const handlePrimaryAction = useCallback(() => {
    const url = meta?.product_url;
    if (url) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    onClose();
  }, [meta?.product_url, onClose]);

  const handleCopySku = useCallback(() => {
    if (!product.sku || !navigator.clipboard) return;
    navigator.clipboard.writeText(product.sku).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [product.sku]);

  const categories = product.category ?? [];
  const priceText = product.price?.formatted;
  const seasonLabel = product.season ? `Season ${product.season}` : undefined;
  const heroCallout = product.brand
    ? `${product.brand.toUpperCase()} · ${categories[0] ?? 'Collection'}`
    : categories[0] ?? 'Product Spotlight';

  const specs = [
    formatSpecValue('SKU', product.sku),
    formatSpecValue('Status', meta?.status),
    formatSpecValue('Season', product.season),
    formatSpecValue('Weight', product.specifications?.weight ? `${product.specifications.weight} g` : undefined),
    formatSpecValue('Dimensions', product.specifications?.dimensions),
    formatSpecValue('Shell', product.specifications?.shell_material),
    formatSpecValue('Liner', product.specifications?.liner_material)
  ].filter((item): item is { label: string; value: string } => item !== null);

  const handlePrevProduct = () => {
    setImageDirection(-1);
    onPrev?.();
  };

  const handleNextProduct = () => {
    setImageDirection(1);
    onNext?.();
  };

  return (
    <motion.div
      className="pf-modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="pf-modal-shell"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div className="pf-modal-ambient" />
        <button className="pf-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="pf-modal-layout">
          <div className="pf-modal-visual">
            <div className="pf-modal-media">
              <AnimatePresence mode="wait" initial={false}>
                {heroMedia ? (
                  <motion.img
                    key={heroMedia.src}
                    src={heroMedia.src}
                    alt={heroMedia.alt || product.name}
                    loading="lazy"
                    custom={imageDirection}
                    variants={imageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                  />
                ) : (
                  <motion.div
                    key="placeholder"
                    className="pf-modal-placeholder"
                    custom={imageDirection}
                    variants={imageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                  >
                    <span>{product.name[0]}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="pf-modal-media-glow" />
            </div>

            {totalMedia > 1 && (
              <div className="pf-modal-thumbs">
                {media.map((item, idx) => (
                  <button
                    key={`${item.src}-${idx}`}
                    className={idx === selectedIndex ? 'pf-thumb active' : 'pf-thumb'}
                    onClick={() => moveToIndex(idx)}
                    aria-label={`Show image ${idx + 1}`}
                  >
                    <img src={item.src} alt={item.alt || `${product.name} ${idx + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pf-modal-panel">
            <div className="pf-modal-meta">
              {product.brand && <span className="pf-modal-brand">{product.brand}</span>}
              {product.sku && <span className="pf-modal-sku">#{product.sku}</span>}
            </div>

            <h2 className="pf-modal-title">{product.name}</h2>
            <p className="pf-modal-subtitle">{heroCallout}</p>

            {priceText && (
              <div className="pf-modal-price-row">
                <span className="pf-modal-price">{priceText}</span>
                {product.specifications?.weight && (
                  <span className="pf-modal-sub">{product.specifications.weight} g</span>
                )}
              </div>
            )}

            <div className="pf-modal-pillrow">
              <span className="pf-modal-pill">SPOTLIGHT PRODUCT</span>
              {product.specifications?.shell_material && (
                <span className="pf-modal-pill ghost">{product.specifications.shell_material}</span>
              )}
            </div>

            {(categories.length > 0 || seasonLabel) && (
              <div className="pf-modal-tags">
                {categories.map(cat => (
                  <span key={cat} className="pf-modal-chip">{cat}</span>
                ))}
                {seasonLabel && (
                  <span className="pf-modal-chip ghost">{seasonLabel}</span>
                )}
              </div>
            )}

            {specs.length > 0 && (
              <div className="pf-modal-specs">
                {specs.map(spec => (
                  <div key={spec.label} className="pf-modal-spec">
                    <span className="pf-modal-spec-label">{spec.label}</span>
                    <span className="pf-modal-spec-value">{spec.value}</span>
                  </div>
                ))}
              </div>
            )}

            {description && (
              <p className="pf-modal-description">{description}</p>
            )}

            {totalMedia > 1 && (
              <p className="pf-modal-hint">Nutze die Pfeiltasten oder klicke auf eine Vorschau für weitere Ansichten.</p>
            )}

            <div className="pf-modal-actions">
              <button
                className="pf-modal-button primary"
                onClick={handlePrimaryAction}
              >
                Produktseite ansehen
              </button>
              {product.sku && (
                <button
                  className="pf-modal-button ghost"
                  onClick={handleCopySku}
                >
                  {copied ? 'SKU kopiert ✓' : 'SKU kopieren'}
                </button>
              )}
              <div className="pf-modal-cycle">
                <button
                  className="pf-modal-cycle-btn"
                  onClick={handlePrevProduct}
                  disabled={!hasPrev}
                  aria-label="Previous product"
                >
                  ‹ Prev
                </button>
                <button
                  className="pf-modal-cycle-btn"
                  onClick={handleNextProduct}
                  disabled={!hasNext}
                  aria-label="Next product"
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProductModal;
