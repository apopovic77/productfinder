import type { Product } from '../types/Product';

export type ScaleContext = { weightMin?: number; weightMax?: number; clampMin: number; clampMax: number };

export class WeightScalePolicy {
  computeScale(p: Product, ctx: ScaleContext): number {
    const w = p.specifications?.weight;
    if (w === undefined || ctx.weightMin === undefined || ctx.weightMax === undefined || ctx.weightMin === ctx.weightMax) return 1;
    const t = (w - ctx.weightMin) / (ctx.weightMax - ctx.weightMin);
    const s = ctx.clampMin + t * (ctx.clampMax - ctx.clampMin);
    return Math.max(ctx.clampMin, Math.min(ctx.clampMax, s));
  }
}




