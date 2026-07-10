/**
 * CartDemo — Standalone Demo der Cart-View
 *
 * Route: /cart
 * Mock-Daten + alle Integration-Varianten zum Vergleich.
 */
import { useState } from 'react';
import { CartView } from '../components/cart/CartView';
import { SlidePanel, SlidePanelMainShifter, SlidePanelBackdrop } from '../components/cart/SlidePanel';
import { useCart } from '../components/cart/useCart';
import type { CartItem, ProductSearchResult } from '../components/cart/types';
import '../components/cart/CartView.css';

const STORAGE_API = '/storage-api';

const MOCK_ITEMS: CartItem[] = [
  {
    id: '1',
    productId: '11211',
    productName: 'PIN IT Jersey',
    productImageUrl: `${STORAGE_API}/storage/media/5336?width=128&format=webp`,
    articleNumber: '0098',
    color: 'red/black',
    availableColors: ['red/black', 'black', 'blue/yellow', 'gray'],
    availableSizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
    sizes: { XS: 2, S: 5, M: 8, L: 5, XL: 3, '2XL': 1 },
  },
  {
    id: '2',
    productId: '11212',
    productName: 'PIN IT Jersey black',
    productImageUrl: `${STORAGE_API}/storage/media/4840?width=128&format=webp`,
    articleNumber: '0098',
    color: 'black',
    availableColors: ['black'],
    availableSizes: ['XS', 'S', 'M', 'L', 'XL'],
    sizes: { XS: 1, S: 3, M: 6, L: 4, XL: 2 },
  },
  {
    id: '3',
    productId: '5012',
    productName: '3SRS Helm RIFF matte',
    productImageUrl: `${STORAGE_API}/storage/media/258?width=128&format=webp`,
    articleNumber: '0625',
    color: 'matte black',
    availableColors: ['matte black', 'gloss white', 'red'],
    availableSizes: ['S/M', 'M/L', 'L/XL'],
    sizes: { 'S/M': 2, 'M/L': 4, 'L/XL': 3 },
  },
  {
    id: '4',
    productId: '8801',
    productName: 'Element Pants',
    productImageUrl: `${STORAGE_API}/storage/media/1262?width=128&format=webp`,
    articleNumber: '0125',
    color: 'black',
    availableColors: ['black', 'gray', 'blue'],
    availableSizes: ['28', '30', '32', '34', '36', '38'],
    sizes: { '30': 2, '32': 5, '34': 4, '36': 2, '38': 1 },
  },
];

const MOCK_SEARCH_RESULTS: ProductSearchResult[] = [
  { productId: '9001', name: 'Matrix Gloves red', articleNumber: '0388', color: 'red', imageUrl: `${STORAGE_API}/storage/media/172?width=128&format=webp` },
  { productId: '9002', name: 'Mayhem Boots black', articleNumber: '0334', color: 'black', imageUrl: `${STORAGE_API}/storage/media/164?width=128&format=webp` },
  { productId: '9003', name: 'Goggle B-Zero clear', articleNumber: '6024', color: 'clear', imageUrl: `${STORAGE_API}/storage/media/206?width=128&format=webp` },
];

type Mode = 'fullpage' | 'modal' | 'slidepanel';

export function CartDemo() {
  const cart = useCart(MOCK_ITEMS);
  const [mode, setMode] = useState<Mode>('slidepanel');
  const [open, setOpen] = useState(true);

  const handleSearchProducts = async (query: string): Promise<ProductSearchResult[]> => {
    const q = query.toLowerCase();
    return MOCK_SEARCH_RESULTS.filter(r =>
      r.name.toLowerCase().includes(q) || r.articleNumber.includes(q)
    );
  };

  const cartView = (
    <CartView
      items={cart.items}
      onSetQuantity={cart.setQuantity}
      onChangeColor={cart.changeColor}
      onRemoveItem={cart.removeItem}
      onSearchProducts={handleSearchProducts}
      onAddProduct={cart.addProductFromSearch}
      onUploadB2B={() => alert(`Upload ${cart.totalQuantity} Stk. → B2B System`)}
      onClose={mode !== 'fullpage' ? () => setOpen(false) : undefined}
    />
  );

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
      {/* Mode Switcher */}
      <div style={{
        position: 'fixed', top: 16, left: 16, zIndex: 2000,
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'rgba(0,0,0,0.85)', padding: '10px 14px',
        borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#fff',
      }}>
        <span style={{ opacity: 0.5 }}>Integration:</span>
        {(['fullpage', 'modal', 'slidepanel'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setOpen(true); }}
            style={{
              background: mode === m ? '#58a6ff' : 'rgba(255,255,255,0.1)',
              border: 'none', color: '#fff', padding: '4px 10px',
              borderRadius: 4, fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', textTransform: 'capitalize',
            }}
          >{m}</button>
        ))}
        {mode !== 'fullpage' && (
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              background: 'rgba(63,185,80,0.3)', border: 'none', color: '#3fb950',
              padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', marginLeft: 12,
            }}
          >{open ? 'Hide' : 'Show'} Cart</button>
        )}
      </div>

      {/* Main "App" Content (Mock) */}
      <SlidePanelMainShifter open={open && mode === 'slidepanel'} panelWidth="60vw" shiftAmount={0.3}>
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)', fontSize: 24,
          fontFamily: 'system-ui, sans-serif',
        }}>
          [ ProductFinder Visual Layer ]
        </div>
      </SlidePanelMainShifter>

      {/* Render mode */}
      {mode === 'fullpage' && (
        <div style={{ position: 'absolute', inset: 0 }}>{cartView}</div>
      )}

      {mode === 'modal' && open && (
        <>
          <SlidePanelBackdrop open={open} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', inset: '5vh 5vw', zIndex: 1000,
            borderRadius: 16, overflow: 'hidden',
            boxShadow: '0 32px 96px rgba(0,0,0,0.6)',
          }}>
            {cartView}
          </div>
        </>
      )}

      {mode === 'slidepanel' && (
        <SlidePanel open={open} width="60vw" side="right">
          {cartView}
        </SlidePanel>
      )}
    </div>
  );
}
