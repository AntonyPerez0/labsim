import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS, getQuality, resolvePixelRatio } from './quality';

describe('quality presets', () => {
  it('low disables AO, shadows, bloom and outline (integrated-GPU budget)', () => {
    const q = QUALITY_PRESETS.low;
    expect(q.ao).toBeNull();
    expect(q.shadows).toBe(false);
    expect(q.maxShadowLights).toBe(0);
    expect(q.bloom).toBeNull();
    expect(q.outline).toBe(false);
  });

  it('low keeps the pixel ratio within 0.75–1 on any display', () => {
    for (const dpr of [0.5, 1, 1.25, 2, 3]) {
      const pr = resolvePixelRatio(QUALITY_PRESETS.low, dpr, 1);
      expect(pr).toBeGreaterThanOrEqual(0.75);
      expect(pr).toBeLessThanOrEqual(1);
    }
  });

  it('presets scale up monotonically', () => {
    const order = ['low', 'medium', 'high', 'ultra'] as const;
    for (let i = 1; i < order.length; i++) {
      const a = QUALITY_PRESETS[order[i - 1]!];
      const b = QUALITY_PRESETS[order[i]!];
      expect(b.maxShadowLights).toBeGreaterThanOrEqual(a.maxShadowLights);
      expect(b.anisotropy).toBeGreaterThanOrEqual(a.anisotropy);
      expect(b.pixelRatioMax).toBeGreaterThanOrEqual(a.pixelRatioMax);
    }
  });

  it('applies the resolution scale and clamps absolute bounds', () => {
    expect(resolvePixelRatio(QUALITY_PRESETS.high, 2, 1)).toBe(1.5);
    expect(resolvePixelRatio(QUALITY_PRESETS.high, 1, 0.5)).toBe(0.5);
    expect(resolvePixelRatio(QUALITY_PRESETS.ultra, 3, 1.5)).toBe(2);
    expect(resolvePixelRatio(QUALITY_PRESETS.medium, Number.NaN, Number.NaN)).toBe(1);
  });

  it('falls back to high for unknown presets', () => {
    expect(getQuality('nope' as never)).toBe(QUALITY_PRESETS.high);
  });
});
