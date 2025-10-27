export type Price = { 
  currency?: string; 
  value: number; 
  formatted: string 
};

export type MediaItem = { 
  src: string;
  alt?: string;
  type?: string;
};

export type ProductSpecifications = {
  weight?: number;
  dimensions?: string;
  shell_material?: string;
  liner_material?: string;
  [key: string]: any;
};

export type Product = {
  id: string;
  sku?: string;
  name: string;
  brand?: string;
  category: string[];
  season?: number;
  price?: Price;
  media?: MediaItem[];
  specifications?: ProductSpecifications;
};


