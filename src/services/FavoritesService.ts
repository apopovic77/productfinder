import type { Product } from '../types/Product';
import { FavoritesStorage } from '../utils/FavoritesStorage';

export type FavoritesChangeListener = () => void;

export class FavoritesService {
  private storage = new FavoritesStorage();
  private showOnlyFavorites = false;
  private listeners: FavoritesChangeListener[] = [];

  toggle(productId: string): boolean {
    const isFavorite = this.storage.toggle(productId);
    this.notifyListeners();
    return isFavorite;
  }

  isFavorite(productId: string): boolean {
    return this.storage.isFavorite(productId);
  }

  setShowOnlyFavorites(show: boolean): void {
    if (this.showOnlyFavorites === show) return;
    this.showOnlyFavorites = show;
    this.notifyListeners();
  }

  getShowOnlyFavorites(): boolean {
    return this.showOnlyFavorites;
  }

  filter(products: Product[]): Product[] {
    if (!this.showOnlyFavorites) return products;
    return products.filter(p => this.storage.isFavorite(p.id));
  }

  getAll(): string[] {
    return this.storage.getAll();
  }

  getCount(): number {
    return this.storage.getAll().length;
  }

  clear(): void {
    this.storage.clear();
    this.notifyListeners();
  }

  addListener(listener: FavoritesChangeListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: FavoritesChangeListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }
}

