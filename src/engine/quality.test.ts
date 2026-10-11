import { describe, expect, it } from 'vitest';
import { QUALITY_ORDER, QUALITY_PRESETS, effectiveFrameCap, getQuality, isCheaperPreset, lowerPreset, resolvePixelRatio } from './quality';

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
    const order = QUALITY_ORDER;
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

  it('potato renders straight to the canvas: no post-fx, shadows, IBL; Lambert, half resolution, 30 fps', () => {
    const q = QUALITY_PRESETS.potato;
    expect(q.postFx).toBe(false);
    expect(q.shadows).toBe(false);
    expect(q.environment).toBe(false);
    expect(q.cheapMaterials).toBe(true);
    expect(q.defaultFrameCap).toBe(30);
    expect(q.reducedDetail).toBe(true);
    for (const dpr of [1, 2, 3]) expect(resolvePixelRatio(q, dpr, 1)).toBeLessThanOrEqual(0.75);
    expect(resolvePixelRatio(q, 1, 1)).toBe(0.5);
    for (const p of ['low', 'medium', 'high', 'ultra'] as const) {
      expect(QUALITY_PRESETS[p].postFx).toBe(true);
      expect(QUALITY_PRESETS[p].cheapMaterials).toBe(false);
    }
  });

  it('preset order helpers and the frame cap', () => {
    expect(lowerPreset('ultra')).toBe('high');
    expect(lowerPreset('low')).toBe('potato');
    expect(lowerPreset('potato')).toBe('potato');
    expect(isCheaperPreset('potato', 'low')).toBe(true);
    expect(isCheaperPreset('high', 'high')).toBe(false);
    expect(effectiveFrameCap(0, 'potato')).toBe(30);
    expect(effectiveFrameCap(60, 'potato')).toBe(60);
    expect(effectiveFrameCap(0, 'high')).toBe(0);
    expect(effectiveFrameCap(30, 'ultra')).toBe(30);
  });
});
