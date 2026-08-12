import { describe, expect, it } from 'vitest';
import { calculateMobilePivotGeometry } from './MobilePivotGeometry';

describe('PivotLayouter mobile portrait rows', () => {
  it('reserves the complete label height and fits the densest group', () => {
    const geometry = calculateMobilePivotGeometry({
      viewWidth: 390,
      viewHeight: 720,
      groupCount: 6,
      maxProductsInGroup: 160,
    });

    const columns = Math.floor(
      (geometry.matrixWidth + geometry.itemGap) / (geometry.cellSize + geometry.itemGap),
    );

    expect(geometry.headerHeight).toBe(36);
    expect(geometry.rows * columns).toBeGreaterThanOrEqual(160);
    expect(
      geometry.paddingTop
      + geometry.paddingBottom
      + geometry.frameHeight * 6
      + geometry.frameGap * 5,
    ).toBeLessThanOrEqual(720.001);
  });

  it('honors a deliberate developer cell-size override', () => {
    const geometry = calculateMobilePivotGeometry({
      viewWidth: 390,
      viewHeight: 720,
      groupCount: 6,
      maxProductsInGroup: 160,
      cellSizeOverride: 12,
    });
    expect(geometry.cellSize).toBe(12);
  });
});
