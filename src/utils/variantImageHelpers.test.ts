import { describe, expect, it } from 'vitest';
import { getRealtimeVariantContext } from './variantImageHelpers';

describe('getRealtimeVariantContext', () => {
  it('projects the exact visible size and colour values', () => {
    expect(getRealtimeVariantContext({
      sku: '0468-003-M',
      size: ' M ',
      color: ' Schwarz ',
    })).toEqual({ size: 'M', color: 'Schwarz' });
  });

  it('supports the legacy chip values parsed from a variant name', () => {
    expect(getRealtimeVariantContext({ name: 'Red / XL' })).toEqual({
      size: 'XL',
      color: 'Red',
    });
  });

  it('never projects the display helper SKU fallback as a colour', () => {
    expect(getRealtimeVariantContext({ sku: '0468-003-M' })).toBeNull();
  });
});
