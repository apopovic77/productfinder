import { describe, expect, it } from 'vitest';
import { focalBackgroundPosition } from './bannerFocal';

const banner = (yPct: number, xPct = 50) => ({ xPct, yPct, imageAspect: 2.5 });

describe('focalBackgroundPosition', () => {
  it('centres the focal point in a 7:1 strip', () => {
    // sichtbar 2.5/7 = 35.7 % der Hoehe; Punkt bei 50 % bleibt mittig
    expect(focalBackgroundPosition(banner(50), 7)).toBe('50% 50%');
    // Brille bei 65 % -> Position 73 %, wie von Hand gesetzt (Goggles 35384)
    expect(focalBackgroundPosition(banner(65), 7)).toBe('50% 73%');
  });

  it('clamps points near the edge', () => {
    expect(focalBackgroundPosition(banner(5), 7)).toBe('50% 0%');
    expect(focalBackgroundPosition(banner(98), 7)).toBe('50% 100%');
  });

  it('keeps the image centred when nothing is cropped', () => {
    expect(focalBackgroundPosition(banner(80), 2.5)).toBe('50% 50%');
  });

  it('crops horizontally when the container is taller than the image', () => {
    // 2.5:1-Bild in 1:1-Kachel: sichtbar 40 % der Breite
    expect(focalBackgroundPosition(banner(50, 80), 1)).toBe('100% 50%');
  });
});
