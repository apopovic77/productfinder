/**
 * Cart Types — tabellarischer Warenkorb mit Größen-Matrix
 */

export interface CartItem {
  id: string;                      // unique line id
  productId: string;
  productName: string;
  productImageUrl?: string;
  articleNumber: string;           // e.g. "0098"
  color: string;                   // currently selected color
  availableColors: string[];       // for color dropdown
  sizes: Record<string, number>;   // { "XS": 2, "S": 5, "M": 8, ... }
  availableSizes: string[];        // sizes this product is available in
  pricePerUnit?: number;           // optional, for sub-totals
}

export interface ProductSearchResult {
  productId: string;
  name: string;
  articleNumber: string;
  imageUrl?: string;
  color?: string;
}

export interface CartViewCallbacks {
  onSetQuantity: (itemId: string, size: string, qty: number) => void;
  onChangeColor: (itemId: string, newColor: string) => void;
  onRemoveItem: (itemId: string) => void;
  onSearchProducts: (query: string) => Promise<ProductSearchResult[]>;
  onAddProduct: (result: ProductSearchResult) => void;
  onUploadB2B: () => void;
  onClose?: () => void;
}
