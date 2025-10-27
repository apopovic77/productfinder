import { DefaultApi, Configuration, type Product as OnealProduct } from 'arkturian-oneal-sdk';
import { Product, type ProductData } from '../types/Product';

const API_BASE = import.meta.env.VITE_ONEAL_API_BASE || 'https://oneal-api.arkturian.com/v1';
const API_KEY = import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

// Initialize SDK
const config = new Configuration({
  basePath: API_BASE,
  apiKey: API_KEY,
});
const api = new DefaultApi(config);

export type Query = {
  search?: string;
  category?: string;
  season?: number;
  price_min?: number;
  price_max?: number;
  weight_min?: number;
  weight_max?: number;
  sort?: 'name' | 'price' | 'season' | 'weight';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

/**
 * Map SDK Product to our OOP Product class instance
 */
function mapProduct(p: OnealProduct): Product {
  const data: ProductData = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: p.category,
    season: p.season,
    price: p.price,
    media: p.media,
    specifications: p.specifications
  };
  
  return new Product(data);
}

export async function fetchProducts(query: Query = {}): Promise<Product[]> {
  const response = await api.productsGet({
    search: query.search,
    category: query.category,
    season: query.season,
    priceMin: query.price_min,
    priceMax: query.price_max,
    sort: query.sort as any,
    order: query.order as any,
    limit: query.limit,
    offset: query.offset,
  });
  
  const results = (response.data as any).results || [];
  const products = results.map(mapProduct);
  
  // Preload images for better UX (non-blocking)
  Product.preloadImages(products);
  
  return products;
}

export async function fetchFacets(): Promise<any> {
  const response = await api.facetsGet();
  return response.data;
}


