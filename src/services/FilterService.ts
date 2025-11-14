import type { Product } from '../types/Product';

export type SortMode = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'weight-asc' | 'weight-desc' | 'color-asc' | 'color-desc' | 'none';

export type FilterCriteria = {
  search: string;
  category: string;
  season: string;
  priceMin: string;
  priceMax: string;
  weightMin: string;
  weightMax: string;
};

export class FilterService {
  private sortMode: SortMode = 'none';
  private criteria: FilterCriteria = {
    search: '',
    category: '',
    season: '',
    priceMin: '',
    priceMax: '',
    weightMin: '',
    weightMax: '',
  };
  private includeIds: Set<string> | null = null;

  setSortMode(mode: SortMode): void {
    this.sortMode = mode;
  }

  getSortMode(): SortMode {
    return this.sortMode;
  }

  setCriteria(criteria: Partial<FilterCriteria>): void {
    this.criteria = { ...this.criteria, ...criteria };
  }

  getCriteria(): FilterCriteria {
    return { ...this.criteria };
  }

  resetCriteria(): void {
    this.criteria = {
      search: '',
      category: '',
      season: '',
      priceMin: '',
      priceMax: '',
      weightMin: '',
      weightMax: '',
    };
  }

  setIncludeIds(ids: string[] | null | undefined): void {
    if (ids && ids.length) {
      this.includeIds = new Set(ids.map(String));
    } else {
      this.includeIds = null;
    }
  }

  clearIncludeIds(): void {
    this.includeIds = null;
  }

  getIncludeIds(): string[] {
    if (!this.includeIds) return [];
    return Array.from(this.includeIds);
  }

  hasIncludeIds(): boolean {
    return Boolean(this.includeIds && this.includeIds.size);
  }

  filter(products: Product[]): Product[] {
    const { search, category, season, priceMin, priceMax, weightMin, weightMax } = this.criteria;
    
    return products.filter(p => {
      const q = search.trim().toLowerCase();
      if (q) {
        const inName = p.name.toLowerCase().includes(q);
        const inCat = p.category?.some(c => c.toLowerCase().includes(q));
        if (!inName && !inCat) return false;
      }
      if (category && !p.category?.includes(category)) return false;
      if (season && p.season != Number(season)) return false;

      const pv = p.price?.value;
      if (priceMin && (pv === undefined || pv < Number(priceMin))) return false;
      if (priceMax && (pv === undefined || pv > Number(priceMax))) return false;

      const w = p.specifications?.weight;
      if (weightMin && (w === undefined || w < Number(weightMin))) return false;
      if (weightMax && (w === undefined || w > Number(weightMax))) return false;

      if (this.includeIds && this.includeIds.size > 0) {
        if (!this.includeIds.has(String(p.id))) return false;
      }
      return true;
    });
  }

  sort(products: Product[]): Product[] {
    if (this.sortMode === 'none') return products;

    const sorted = [...products];

    switch (this.sortMode) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'price-asc':
        sorted.sort((a, b) => (a.price?.value ?? 0) - (b.price?.value ?? 0));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (b.price?.value ?? 0) - (a.price?.value ?? 0));
        break;
      case 'weight-asc':
        sorted.sort((a, b) => (a.specifications?.weight ?? 0) - (b.specifications?.weight ?? 0));
        break;
      case 'weight-desc':
        sorted.sort((a, b) => (b.specifications?.weight ?? 0) - (a.specifications?.weight ?? 0));
        break;
      case 'color-asc':
        sorted.sort((a, b) => {
          const colorA = a.colors?.[0] ?? '';
          const colorB = b.colors?.[0] ?? '';
          return colorA.localeCompare(colorB);
        });
        break;
      case 'color-desc':
        sorted.sort((a, b) => {
          const colorA = a.colors?.[0] ?? '';
          const colorB = b.colors?.[0] ?? '';
          return colorB.localeCompare(colorA);
        });
        break;
    }

    return sorted;
  }

  filterAndSort(products: Product[]): Product[] {
    const filtered = this.filter(products);
    return this.sort(filtered);
  }

  getUniqueCategories(products: Product[]): string[] {
    const s = new Set<string>();
    products.forEach(p => p.category?.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }

  getUniqueSeasons(products: Product[]): number[] {
    const s = new Set<number>();
    products.forEach(p => { if (p.season) s.add(p.season); });
    return Array.from(s).sort((a, b) => b - a);
  }
}

