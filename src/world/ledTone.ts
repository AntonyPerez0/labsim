/**
 * LED lens brightness vs. the post-fx chain. LED lenses are HDR (hue × 6–7) so that, with bloom,
 * they glow: a near-white core inside a coloured halo, like a photographed LED. Without bloom
 * (the Low preset) only the core is left, and ACES tone-maps a hue × 6 to almost white
 * (#2bff6a × 6 → rgb(242,253,238); #ff2614 × 7 → peach) — a green "power present" LED and a red
 * PWR light pipe both read as white. With no bloom the lenses are therefore drawn at a peak of
 * ≈ 0.9, where ACES keeps the hue (#2bff6a → rgb(150,228,145), #ff2614 → rgb(250,30,22)).
 */
import { store } from '@/core/store';
import { QUALITY_PRESETS } from '@/engine/quality';
import type { QualityPreset } from '@/core/state';

/** Peak linear channel of an "on" lens when the preset has no bloom. */
export const LED_NO_BLOOM_PEAK = 0.9;

export function bloomActive(q: QualityPreset | undefined = store.getState().progress?.settings?.quality): boolean {
  const p = q ? QUALITY_PRESETS[q] : undefined;
  return p ? p.bloom !== null : true;
}

/**
 * Multiplier for an LED material whose on-colours carry an HDR `intensity`: 1 with bloom,
 * `LED_NO_BLOOM_PEAK / intensity` without.
 */
export function ledToneScale(intensity: number, bloom = bloomActive()): number {
  return bloom ? 1 : LED_NO_BLOOM_PEAK / Math.max(1, intensity);
}
