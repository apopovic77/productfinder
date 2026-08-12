import { describe, expect, it } from 'vitest';
import {
  calculateVisibleImagePriority,
  VISIBLE_IMAGE_PRIORITY_MAX,
  VISIBLE_IMAGE_PRIORITY_MIN,
} from './VisibleImagePriority';

const viewport = { x: 100, y: 200, width: 390, height: 700 };

describe('calculateVisibleImagePriority', () => {
  it('puts the viewport-centred item first', () => {
    const centred = { x: 270, y: 530, width: 50, height: 40 };
    const edge = { x: 100, y: 200, width: 50, height: 40 };

    expect(calculateVisibleImagePriority(centred, viewport)).toBe(VISIBLE_IMAGE_PRIORITY_MIN);
    expect(calculateVisibleImagePriority(centred, viewport))
      .toBeLessThan(calculateVisibleImagePriority(edge, viewport));
  });

  it('keeps all visible priorities inside the foreground band', () => {
    expect(calculateVisibleImagePriority(
      { x: -1000, y: -1000, width: 10, height: 10 },
      viewport,
    )).toBe(VISIBLE_IMAGE_PRIORITY_MAX);
  });
});
