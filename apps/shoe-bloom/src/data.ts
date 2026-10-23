/**
 * Stiefel der Kollektion 2028 aus oneal-api-v2 (dieselbe Quelle und derselbe Schlüssel
 * wie der Finder), gruppiert nach Design. Bilder freigestellt über die Storage-API.
 */

const API_BASE = '/oneal-api/v1';
const API_KEY: string = import.meta.env.VITE_ONEAL_API_KEY || '';
const PRODUCT_TYPES = ['Stiefel', 'Schuh'];

export interface Shoe {
  id: number;
  name: string;
  design: string;
  color: string;
  image: string;
  price: number | null;
  sizes: string[];
  sizesInStock: string[];
  line: string | null;
  targetGroup: string | null;
}

export interface Design {
  name: string;
  shoes: Shoe[];
}

interface ApiProduct {
  id: number;
  name: string;
  design_group: string | null;
  color_name: string | null;
  price_from: number | null;
  size_list?: string[];
  size_list_in_stock?: string[];
  properties: { product_type?: string; product_line?: string; target_group?: string };
  storage: { id: number } | null;
}

export function imageUrl(storageId: number, width = 640): string {
  return `/storage-api/storage/media/${storageId}?format=png&trim=true&width=${width}`;
}

export async function loadDesigns(): Promise<Design[]> {
  const res = await fetch(`${API_BASE}/products?workbook=true&limit=2000`, { headers: { 'X-API-Key': API_KEY } });
  if (!res.ok) throw new Error(`Produkte: HTTP ${res.status}`);
  const body = (await res.json()) as { results: ApiProduct[] };
  const byDesign = new Map<string, Shoe[]>();
  for (const p of body.results) {
    if (!PRODUCT_TYPES.includes(p.properties?.product_type ?? '') || !p.storage) continue;
    const design = p.design_group || p.name;
    const shoe: Shoe = {
      id: p.id, name: p.name, design, color: p.color_name || '', image: imageUrl(p.storage.id),
      price: p.price_from, sizes: p.size_list ?? [], sizesInStock: p.size_list_in_stock ?? [],
      line: p.properties.product_line ?? null, targetGroup: p.properties.target_group ?? null,
    };
    byDesign.set(design, [...(byDesign.get(design) ?? []), shoe]);
  }
  // Designs mit vielen Farben zuerst: die tragen die Blüte
  return [...byDesign.entries()]
    .map(([name, shoes]) => ({ name, shoes }))
    .sort((a, b) => b.shoes.length - a.shoes.length || a.name.localeCompare(b.name));
}
