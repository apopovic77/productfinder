import { describe, expect, it } from 'vitest';
import { calculateSelectedProductGlow } from './SelectedProductGlow';

describe('selected product depth glow', () => {
  it('centers the mask on the animated main-image bounds with soft overscan', () => {
    const glow = calculateSelectedProductGlow(100, 50, 600, 400);

    expect(glow.centerX).toBe(400);
    expect(glow.centerY).toBe(250);
    expect(glow.radiusX).toBeCloseTo(408);
    expect(glow.radiusY).toBeCloseTo(248);
  });

  it('stays valid while the spread animation passes through tiny bounds', () => {
    const glow = calculateSelectedProductGlow(10, 20, 0, 0);

    expect(glow.centerX).toBe(10.5);
    expect(glow.centerY).toBe(20.5);
    expect(glow.radiusX).toBeGreaterThan(0);
    expect(glow.radiusY).toBeGreaterThan(0);
  });
});
