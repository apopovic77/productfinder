import { describe, expect, it } from 'vitest';
import { accentColor } from './colorName';

describe('accentColor', () => {
  it('nimmt die erste bunte Teilfarbe', () => {
    expect(accentColor('white/neon')).toBe('neon');
    expect(accentColor('black/neon yellow')).toBe('neon yellow');
    expect(accentColor('black/gray/red')).toBe('red');
    expect(accentColor('Black/Orange')).toBe('orange');
  });
  it('faellt auf die erste Farbe zurueck, wenn alles neutral ist', () => {
    expect(accentColor('black/gray')).toBe('black');
    expect(accentColor('white')).toBe('white');
    expect(accentColor('')).toBe('');
  });
});
