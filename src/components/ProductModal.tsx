import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Product, MediaItem } from '../types/Product';
import './ProductModal.css';

type Props = {
  product: Product | null;
  onClose: () => void;
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

export const ProductModal: React.FC<Props> = ({ product, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!product?.media || product.media.length === 0) return;
      if (e.key === 'ArrowRight') {
        setSelectedIndex(prev => (prev + 1) % product.media!.length);
      }
      if (e.key === 'ArrowLeft') {
        setSelectedIndex(prev => {
          const total = product.media!.length;
          return (prev - 1 + total) % total;
        });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [product?.id]);

  const media = product?.media ?? [];
  const heroMedia = useMemo(() => {
    if (!product) return undefined;
    if (media.length === 0) return undefined;
    return media[selectedIndex] ?? getHeroMedia(media);
  }, [media, product, selectedIndex]);

  const meta = product
    ? ((product as unknown as { meta?: { description?: string; status?: string; product_url?: string } }).meta)
    : undefined;
  const handlePrimaryAction = useCallback(() => {
    const url = meta?.product_url;
    if (url) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    onClose();
  }, [meta?.product_url, onClose]);

  const handleCopySku = useCallback(() => {
    if (!product?.sku || !navigator.clipboard) return;
    navigator.clipboard.writeText(product.sku).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [product?.sku]);

  if (!product) return null;

  const description = meta?.description ?? (product.specifications as any)?.description;

  const categories = product.category ?? [];
  const priceText = product.price?.formatted;
  const seasonLabel =
    product.season ? `Season ${product.season}` : undefined;
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
              {heroMedia ? (
                <img
                  src={heroMedia.src}
                  alt={heroMedia.alt || product.name}
                  loading="lazy"
                />
              ) : (
                <div className="pf-modal-placeholder">
                  <span>{product.name[0]}</span>
                </div>
              )}
              <div className="pf-modal-media-glow" />
            </div>

            {media.length > 1 && (
              <div className="pf-modal-thumbs">
                {media.map((item, idx) => (
                  <button
                    key={`${item.src}-${idx}`}
                    className={idx === selectedIndex ? 'pf-thumb active' : 'pf-thumb'}
                    onClick={() => setSelectedIndex(idx)}
                    aria-label={`Show image ${idx + 1}`}
                  >
                    <img src={item.src} alt={item.alt || `${product.name} ${idx + 1}`} />
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

            {product.media && product.media.length > 1 && (
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
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProductModal;
