import { describe, expect, it } from 'vitest';
import { LED_NO_BLOOM_PEAK, bloomActive, ledToneScale } from './ledTone';

describe('LED tone (hue kept without bloom)', () => {
  it('only the Low preset has no bloom', () => {
    expect(bloomActive('low')).toBe(false);
    expect(bloomActive('medium')).toBe(true);
    expect(bloomActive('high')).toBe(true);
    expect(bloomActive('ultra')).toBe(true);
  });
  it('keeps HDR lenses with bloom and caps the peak without', () => {
    expect(ledToneScale(7, true)).toBe(1);
    expect(7 * ledToneScale(7, false)).toBeCloseTo(LED_NO_BLOOM_PEAK);
    expect(6.5 * ledToneScale(6.5, false)).toBeCloseTo(LED_NO_BLOOM_PEAK);
    expect(LED_NO_BLOOM_PEAK).toBeLessThanOrEqual(1);
  });
});
