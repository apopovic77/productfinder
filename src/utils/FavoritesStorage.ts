const STORAGE_KEY = 'productfinder_favorites';

export class FavoritesStorage {
  private favorites = new Set<string>();
  
  constructor() {
    this.load();
  }
  
  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        this.favorites = new Set(ids);
      }
    } catch (e) {
      console.error('Failed to load favorites:', e);
    }
  }
  
  private save() {
    try {
      const ids = Array.from(this.favorites);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {
      console.error('Failed to save favorites:', e);
    }
  }
  
  toggle(id: string): boolean {
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
      this.save();
      return false;
    } else {
      this.favorites.add(id);
      this.save();
      return true;
    }
  }
  
  isFavorite(id: string): boolean {
    return this.favorites.has(id);
  }
  
  getAll(): string[] {
    return Array.from(this.favorites);
  }
  
  clear() {
    this.favorites.clear();
    this.save();
  }
}

