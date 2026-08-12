import { describe, expect, it } from 'vitest';
import { getDesignFamilyLabel, selectExactDesignFamily } from './productDesignFamily';

type StubProduct = {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  getAttributeValue<T>(key: string): T | undefined;
};

function product(id: number, name: string, attributes: Record<string, unknown>): StubProduct {
  return {
    id: String(id),
    name,
    attributes,
    getAttributeValue<T>(key: string): T | undefined {
      return this.attributes[key] as T | undefined;
    },
  };
}

describe('selectExactDesignFamily', () => {
  it('keeps a single-design product alone', () => {
    const speedmetal = product(1, '3SRS Helmet SPEEDMETAL black/multi', {
      design_group: '3SRS Helmet SPEEDMETAL',
      family_size: 1,
      product_code: '0603',
    });
    const assault = product(2, '3SRS Helmet ASSAULT red', {
      design_group: '3SRS Helmet ASSAULT',
      product_code: '0603',
    });

    expect(selectExactDesignFamily(speedmetal, [speedmetal, assault])).toEqual([speedmetal]);
  });

  it('keeps all exact colorways and rejects other product-code siblings', () => {
    const black = product(1, 'MAYHEM Jersey HEXX black', { design_group: 'MAYHEM Jersey HEXX' });
    const white = product(2, 'MAYHEM Jersey HEXX white', { design_group: 'mayhem jersey hexx' });
    const ride = product(3, 'MAYHEM Jersey RIDE red', { design_group: 'MAYHEM Jersey RIDE' });

    expect(selectExactDesignFamily(black, [white, ride, black])).toEqual([black, white]);
  });

  it('fails closed when design_group is unavailable', () => {
    const current = product(1, 'Legacy product', { product_code: '0603' });
    const unrelated = product(2, 'Other legacy product', { product_code: '0603' });

    expect(selectExactDesignFamily(current, [unrelated])).toEqual([current]);
  });

  it('uses the explicit color name for the option label', () => {
    const item = product(1, 'MAYHEM Jersey HEXX black', {
      design_group: 'MAYHEM Jersey HEXX',
      color_name: 'black',
    });

    expect(getDesignFamilyLabel(item)).toBe('black');
  });
});
