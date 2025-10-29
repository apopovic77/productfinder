import fs from 'fs';
import { LayoutService } from '../src/services/LayoutService';
import { Product } from '../src/types/Product';
import { PivotDimensionAnalyzer } from '../src/services/PivotDimensionAnalyzer';

const raw = JSON.parse(fs.readFileSync('/Volumes/DatenAP/Code/oneal-api/app/data/products.json','utf-8')) as any[];
const products = raw.map(item => new Product({
  id: item.id,
  name: item.name,
  brand: item.brand ?? undefined,
  category: item.category ?? [],
  season: item.season ?? undefined,
  price: item.price ?? undefined,
  media: item.media ?? [],
  attributes: {},
  displayName: item.name,
  aiTags: item.ai_tags ?? [],
  aiAnalysis: item.ai_analysis ?? undefined,
  raw: item,
}));

const analyzer = new PivotDimensionAnalyzer();
const model = analyzer.analyze(products);

const layoutService = new LayoutService();
layoutService.setPivotModel(model);
layoutService.setLayoutMode('pivot');
layoutService.sync(products);
layoutService.layout(1280, 720);

console.log('Initial group count', layoutService.getPivotGroups().map(g => g.label));
layoutService.drillDownPivot('Helmets');
layoutService.sync(products);
layoutService.layout(1280,720);
console.log('After drill down', layoutService.getPivotGroups().map(g => g.label));
