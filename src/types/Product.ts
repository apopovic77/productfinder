export type Price = { currency: string; value: number; formatted: string };

export type Product = {
  id: string;
  sku?: string;
  name: string;
  brand?: string;
  category: string[];
  season?: number;
  price?: Price;
  media?: { src: string }[];
  specifications?: { weight?: number };
};


