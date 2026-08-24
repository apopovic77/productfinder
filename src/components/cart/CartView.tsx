/**
 * CartView — Tabellarischer Warenkorb mit Größen-Matrix
 *
 * Pure View-Komponente, agnostic von Mounting (Route, Modal, Slide-Panel).
 * Layout: Größen als Spalten (Union aller verfügbaren Größen).
 * Darunter: Suchfeld für Zusatzartikel.
 */
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { CartItem, CartViewCallbacks, ProductSearchResult } from './types';

// Standard size order — used for sorting columns
const SIZE_ORDER = [
  // Clothing
  'XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL',
  // Helmets
  'XS/S', 'S/M', 'M/L', 'L/XL', 'XL/2XL',
  // Shoes (US/EU mixed)
  '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
  // Pants (Inch)
  '28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42',
];

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a);
    const bi = SIZE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

interface CartViewProps extends CartViewCallbacks {
  items: CartItem[];
  title?: string;
  orderSubmitting?: boolean;
  orderResult?: string | null;
  orderError?: string | null;
  onDismissOrderStatus?: () => void;
}

export function CartView({
  items, title = 'Bestellübersicht',
  onSetQuantity, onChangeColor, onRemoveItem,
  onSearchProducts, onAddProduct, onUploadB2B, onClose,
  orderSubmitting, orderResult, orderError, onDismissOrderStatus,
}: CartViewProps) {
  // Compute union of all sizes across all items (column headers)
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const size of item.availableSizes) set.add(size);
    }
    return sortSizes(Array.from(set));
  }, [items]);

  // Per-row total
  const rowTotal = useCallback((item: CartItem): number => {
    return Object.values(item.sizes).reduce((sum, q) => sum + (q || 0), 0);
  }, []);

  // Grand total
  const grandTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + rowTotal(item), 0);
  }, [items, rowTotal]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimeout = useRef<number | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) { setSearchResults([]); return; }
    searchTimeout.current = window.setTimeout(async () => {
      const results = await onSearchProducts(value);
      setSearchResults(results.slice(0, 8));
    }, 200);
  };

  const handleAddSearchResult = (result: ProductSearchResult) => {
    onAddProduct(result);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  // Close search dropdown on outside click
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="cart-view">
      {/* Header */}
      <div className="cart-header">
        <div className="cart-title">
          {title}
          <span className="cart-count">{items.length} {items.length === 1 ? 'Position' : 'Positionen'} · {grandTotal} Stk.</span>
        </div>
        {onClose && (
          <button className="cart-close" onClick={onClose} aria-label="Schließen">✕</button>
        )}
      </div>

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="cart-empty">
          <div className="cart-empty-icon">🛒</div>
          <div className="cart-empty-text">Noch keine Produkte im Warenkorb.</div>
          <div className="cart-empty-hint">Wähle Produkte über den Visual Selection Layer oder die Suche unten.</div>
        </div>
      ) : (
        <div className="cart-table-wrapper">
          <table className="cart-table">
            <thead>
              <tr>
                <th className="cart-col-product">Produkt</th>
                <th className="cart-col-art">Art.-Nr.</th>
                <th className="cart-col-color">Farbe</th>
                {allSizes.map(size => (
                  <th key={size} className="cart-col-size">{size}</th>
                ))}
                <th className="cart-col-total">Σ</th>
                <th className="cart-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td className="cart-cell-product">
                    {item.productImageUrl && (
                      <img src={item.productImageUrl} alt={item.productName} className="cart-thumb" />
                    )}
                    <span className="cart-product-name">{item.productName}</span>
                  </td>
                  <td className="cart-cell-art">{item.articleNumber}</td>
                  <td className="cart-cell-color">
                    {item.availableColors.length > 1 ? (
                      <select
                        value={item.color}
                        onChange={e => onChangeColor(item.id, e.target.value)}
                        className="cart-color-select"
                      >
                        {item.availableColors.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <span>{item.color}</span>
                    )}
                  </td>
                  {allSizes.map(size => {
                    const available = item.availableSizes.includes(size);
                    const qty = item.sizes[size] || 0;
                    return (
                      <td key={size} className={`cart-cell-qty ${!available ? 'cart-cell-na' : ''}`}>
                        {available ? (
                          <div className="cart-qty-stepper">
                            <button
                              type="button"
                              className="cart-qty-btn"
                              aria-label="Menge verringern"
                              disabled={qty <= 0}
                              onClick={() => onSetQuantity(item.id, size, Math.max(0, qty - 1))}
                            >−</button>
                            <input
                              type="number"
                              min={0}
                              max={9999}
                              value={qty || ''}
                              placeholder="0"
                              onChange={e => onSetQuantity(item.id, size, parseInt(e.target.value) || 0)}
                              className="cart-qty-input"
                            />
                            <button
                              type="button"
                              className="cart-qty-btn"
                              aria-label="Menge erhöhen"
                              onClick={() => onSetQuantity(item.id, size, qty + 1)}
                            >+</button>
                          </div>
                        ) : (
                          <span className="cart-na">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="cart-cell-total">{rowTotal(item)}</td>
                  <td className="cart-cell-actions">
                    <button
                      className="cart-remove-btn"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label="Entfernen"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3 + allSizes.length} className="cart-foot-label">Gesamt</td>
                <td className="cart-foot-total">{grandTotal}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Additional Product Search */}
      <div className="cart-search-section" ref={searchRef}>
        <div className="cart-search-label">Zusatzartikel</div>
        <div className="cart-search-input-wrapper">
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="Artikel suchen (Name, Art.-Nr.)..."
            className="cart-search-input"
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="cart-search-results">
              {searchResults.map(result => (
                <button
                  key={result.productId}
                  className="cart-search-result"
                  onClick={() => handleAddSearchResult(result)}
                >
                  {result.imageUrl && (
                    <img src={result.imageUrl} alt="" className="cart-search-thumb" />
                  )}
                  <div className="cart-search-info">
                    <div className="cart-search-name">{result.name}</div>
                    <div className="cart-search-meta">
                      {result.articleNumber}
                      {result.color && ` · ${result.color}`}
                    </div>
                  </div>
                  <div className="cart-search-add">+</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="cart-footer">
        {orderResult && (
          <div className="cart-order-status cart-order-success" onClick={onDismissOrderStatus}>
            ✓ Bestellung übermittelt — Nr. <strong>{orderResult}</strong>
          </div>
        )}
        {orderError && (
          <div className="cart-order-status cart-order-error" onClick={onDismissOrderStatus}>
            ✕ Übermittlung fehlgeschlagen — bitte erneut versuchen.
          </div>
        )}
        <button
          className="cart-upload-btn"
          onClick={onUploadB2B}
          disabled={orderSubmitting || items.length === 0 || grandTotal === 0}
        >
          {orderSubmitting ? 'Wird übermittelt …' : 'Bestellung absenden →'}
        </button>
      </div>
    </div>
  );
}
