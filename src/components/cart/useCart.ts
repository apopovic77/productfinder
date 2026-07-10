/**
 * useCart — Cart State Management
 *
 * Lightweight hook for managing cart state (in-memory).
 * Can later be backed by Zustand / localStorage / API.
 */
import { useState, useCallback } from 'react';
import type { CartItem, ProductSearchResult } from './types';

export function useCart(initialItems: CartItem[] = []) {
  const [items, setItems] = useState<CartItem[]>(initialItems);

  const setQuantity = useCallback((itemId: string, size: string, qty: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const sizes = { ...item.sizes };
      if (qty <= 0) delete sizes[size];
      else sizes[size] = qty;
      return { ...item, sizes };
    }));
  }, []);

  const changeColor = useCallback((itemId: string, newColor: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, color: newColor } : item
    ));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const addProduct = useCallback((product: Omit<CartItem, 'sizes'> & { sizes?: Record<string, number> }) => {
    setItems(prev => {
      // Check if product already in cart with same color → merge
      const existing = prev.find(i => i.productId === product.productId && i.color === product.color);
      if (existing) return prev;
      return [...prev, { ...product, sizes: product.sizes ?? {} }];
    });
  }, []);

  const addProductFromSearch = useCallback((result: ProductSearchResult) => {
    addProduct({
      id: `${result.productId}-${result.color || 'default'}-${Date.now()}`,
      productId: result.productId,
      productName: result.name,
      productImageUrl: result.imageUrl,
      articleNumber: result.articleNumber,
      color: result.color || 'default',
      availableColors: result.color ? [result.color] : ['default'],
      availableSizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      sizes: {},
    });
  }, [addProduct]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalQuantity = items.reduce(
    (sum, item) => sum + Object.values(item.sizes).reduce((s, q) => s + (q || 0), 0),
    0
  );

  return {
    items,
    setQuantity,
    changeColor,
    removeItem,
    addProduct,
    addProductFromSearch,
    clearCart,
    totalQuantity,
  };
}
