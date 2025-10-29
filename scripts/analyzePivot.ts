import fs from 'fs';
import { PivotDimensionAnalyzer } from '../src/services/PivotDimensionAnalyzer.ts';
import { Product } from '../src/types/Product.ts';
import type { PivotDimensionDefinition } from '../src/services/PivotDimensionAnalyzer.ts';

const raw = JSON.parse(fs.readFileSync('/Volumes/DatenAP/Code/oneal-api/app/data/products.json','utf-8')) as any[];
const products = raw.map(item => new Product({
  id: item.id,
  sku: item.sku ?? undefined,
  name: item.name,
  brand: item.brand ?? undefined,
  category: item.category ?? [],
  season: item.season ?? undefined,
  price: item.price ?? undefined,
  media: item.media ?? [],
  meta: item.meta ?? undefined,
  description: item.description ?? undefined,
  displayName: item.name,
  attributes: {},
  aiTags: item.ai_tags ?? [],
  aiAnalysis: item.ai_analysis ?? undefined,
  raw: item,
}));

const analyzer = new PivotDimensionAnalyzer();
const analysis = analyzer.analyze(products);

const getAiArray = (p: Product, key: string): string[] => {
  const ai = p.aiAnalysis ?? {};
  switch (key) {
    case 'ai_tags': return p.aiTags ?? [];
    case 'ai_colors': return ai.colors ?? [];
    case 'ai_materials': return ai.materials ?? [];
    case 'ai_use_cases': return ai.useCases ?? [];
    case 'ai_visual_harmony': return ai.visualHarmonyTags ?? [];
    default: return [];
  }
};

const summarizeDimension = (def: PivotDimensionDefinition) => {
  const counts = new Map<string, number>();
  for (const product of products) {
    let values: string[] = [];
    switch (def.source.type) {
      case 'category':
        values = [product.category[def.source.level] ?? 'Unknown'];
        break;
      case 'property':
        if (def.source.key === 'brand') values = [product.brand ?? 'Unknown'];
        else if (def.source.key === 'season') values = [product.season ? String(product.season) : 'No Season'];
        else values = ['Unknown'];
        break;
      case 'attribute':
        if (def.source.key.startsWith('ai_')) {
          values = getAiArray(product, def.source.key);
        } else {
          values = ['Unknown'];
        }
        break;
    }
    values.forEach(v => {
      const key = v && v !== '' ? v : 'Unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  }
  return Array.from(counts.entries()).sort((a,b) => b[1]-a[1]).slice(0,10);
};

const tree: Record<string, Record<string, number>> = {};
for (const product of products) {
  const cat = product.category[0] ?? 'Unknown';
  const sub = product.category[1] ?? 'Unknown';
  tree[cat] = tree[cat] || {};
  tree[cat][sub] = (tree[cat][sub] ?? 0) + 1;
}

console.log(`Total products: ${products.length}`);
console.log('\nCategory → Subcategory breakdown (top level):');
Object.entries(tree).forEach(([cat, subs]) => {
  const total = Object.values(subs).reduce((a,b)=>a+b,0);
  console.log(`- ${cat} (${total})`);
  Object.entries(subs)
    .sort((a,b)=>b[1]-a[1])
    .forEach(([sub,count]) => console.log(`    • ${sub}: ${count}`));
});

console.log('\nDimension summaries:');
for (const def of analysis.dimensions) {
  const top = summarizeDimension(def)
    .map(([val,count]) => `${val} (${count})`)
    .join(', ');
  console.log(`- ${def.label} [${def.key}] => ${top}`);
}
