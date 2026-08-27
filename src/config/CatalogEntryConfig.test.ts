import { describe, expect, it } from 'vitest';
import { resolveBrandOpenMintFlag } from './CatalogEntryConfig';

describe('resolveBrandOpenMintFlag', () => {
  it.each(['open', 'direct'])('marks a brandless %s flow as explicitly open', flow => {
    expect(resolveBrandOpenMintFlag(null, `https://finder.test/?flow=${flow}`)).toBe(true);
  });

  it('omits the marker for the guided brand-gated flow', () => {
    expect(resolveBrandOpenMintFlag("O'Neal", 'https://finder.test/?flow=guided')).toBeUndefined();
  });

  it('does not grant brand-open authority when a concrete brand is present', () => {
    expect(resolveBrandOpenMintFlag("O'Neal", 'https://finder.test/?flow=open')).toBeUndefined();
  });

  it('does not grant brand-open authority to a brandless gated request', () => {
    expect(resolveBrandOpenMintFlag(null, 'https://finder.test/?flow=guided')).toBeUndefined();
  });
});
