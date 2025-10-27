import React from 'react';
import type { Product } from '../types/Product';
import './ProductModal.css';

type Props = {
  product: Product | null;
  onClose: () => void;
};

export class ProductModal extends React.Component<Props> {
  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.props.onClose();
    }
  };

  render() {
    const { product, onClose } = this.props;
    if (!product) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>

          <div className="modal-body">
            <div className="modal-image">
              {product.media && product.media.length > 0 ? (
                <img 
                  src={product.media[0].src} 
                  alt={product.media[0].alt || product.name}
                />
              ) : (
                <div className="modal-image-placeholder">No Image</div>
              )}
            </div>

            <div className="modal-info">
              <h2>{product.name}</h2>
              
              {product.brand && (
                <div className="modal-brand">
                  <strong>Brand:</strong> {product.brand}
                </div>
              )}

              {product.sku && (
                <div className="modal-sku">
                  <strong>SKU:</strong> {product.sku}
                </div>
              )}

              {product.price && (
                <div className="modal-price">
                  {product.price.formatted}
                </div>
              )}

              {product.category && product.category.length > 0 && (
                <div className="modal-categories">
                  <strong>Categories:</strong>
                  <div className="modal-tags">
                    {product.category.map(cat => (
                      <span key={cat} className="modal-tag">{cat}</span>
                    ))}
                  </div>
                </div>
              )}

              {product.season && (
                <div className="modal-season">
                  <strong>Season:</strong> {product.season}
                </div>
              )}

              {product.specifications && (
                <div className="modal-specs">
                  <strong>Specifications:</strong>
                  <ul>
                    {product.specifications.weight && (
                      <li>Weight: {product.specifications.weight}g</li>
                    )}
                    {product.specifications.dimensions && (
                      <li>Dimensions: {product.specifications.dimensions}</li>
                    )}
                    {product.specifications.shell_material && (
                      <li>Shell Material: {product.specifications.shell_material}</li>
                    )}
                    {product.specifications.liner_material && (
                      <li>Liner Material: {product.specifications.liner_material}</li>
                    )}
                  </ul>
                </div>
              )}

              {product.media && product.media.length > 1 && (
                <div className="modal-gallery">
                  <strong>Gallery:</strong>
                  <div className="modal-thumbnails">
                    {product.media.map((media, idx) => (
                      <img 
                        key={idx}
                        src={media.src} 
                        alt={media.alt || `${product.name} ${idx + 1}`}
                        className="modal-thumbnail"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

