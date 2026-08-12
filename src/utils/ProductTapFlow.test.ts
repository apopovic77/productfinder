import { describe, expect, it } from 'vitest';
import { resolveProductTapStage } from './ProductTapFlow';

describe('resolveProductTapStage', () => {
  it('opens the compact preview on the first product tap', () => {
    expect(resolveProductTapStage(null, 'yellow-pants')).toBe('preview');
  });

  it('opens V4 only when the already previewed product is tapped again', () => {
    expect(resolveProductTapStage('yellow-pants', 'yellow-pants')).toBe('detail');
  });

  it('returns to preview when the user taps a different product', () => {
    expect(resolveProductTapStage('yellow-pants', 'blue-pants')).toBe('preview');
  });
});
