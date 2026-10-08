/**
 * Quality presets — concrete renderer / post-fx / audio settings per `QualityPreset`.
 * Pure data + helpers (no three.js), so it can be unit-tested and read by the debug overlay.
 *
 * Budget targets
 *  - low:    integrated GPUs at ≥ 30 fps. No AO, no shadows, no bloom, no outline, DPR 0.75–1.
 *  - medium: mainstream laptops. Half-res AO, 2 shadow casters @1024, bloom, emissive highlight.
 *  - high:   discrete GPUs (default). Full-res AO, 4 casters @2048, bloom, outline highlight.
 *  - ultra:  fast desktop GPUs. 64-sample AO, 6 casters @2048, wider bloom, HRTF audio.
 */
import type { QualityPreset } from '@/core/state';

export type AoQuality = 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra';
export type SmaaQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  preset: QualityPreset;
  /** Device-pixel-ratio multiplier, then clamped to [pixelRatioMin, pixelRatioMax]. */
  pixelRatioScale: number;
  pixelRatioMin: number;
  pixelRatioMax: number;
  shadows: boolean;
  shadowMapSize: number;
  /** PCF filter radius (three r186 PCF uses a Vogel-disk kernel scaled by this). */
  shadowRadius: number;
  /** How many lights flagged `castShadow` by the world actually render shadow maps. */
  maxShadowLights: number;
  ao: null | { quality: AoQuality; halfRes: boolean; radius: number; intensity: number; distanceFalloff: number };
  bloom: null | { intensity: number; levels: number; radius: number; threshold: number; smoothing: number };
  smaa: SmaaQuality;
  /** OutlineEffect highlight (true) or emissive-tint fallback (false). */
  outline: boolean;
  vignette: boolean;
  anisotropy: number;
  /** HRTF panning for positional audio (else equal-power). */
  hrtf: boolean;
}

export const QUALITY_PRESETS: Readonly<Record<QualityPreset, QualitySettings>> = {
  low: {
    preset: 'low',
    pixelRatioScale: 0.85,
    pixelRatioMin: 0.75,
    pixelRatioMax: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowRadius: 1,
    maxShadowLights: 0,
    ao: null,
    bloom: null,
    smaa: 'low',
    outline: false,
    vignette: true,
    anisotropy: 2,
    hrtf: false,
  },
  medium: {
    preset: 'medium',
    pixelRatioScale: 1,
    pixelRatioMin: 0.75,
    pixelRatioMax: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 3,
    maxShadowLights: 2,
    ao: { quality: 'Low', halfRes: true, radius: 1.0, intensity: 3.5, distanceFalloff: 1 },
    bloom: { intensity: 0.75, levels: 5, radius: 0.55, threshold: 1.25, smoothing: 0.35 },
    smaa: 'medium',
    outline: false,
    vignette: true,
    anisotropy: 4,
    hrtf: false,
  },
  high: {
    preset: 'high',
    pixelRatioScale: 1,
    pixelRatioMin: 1,
    pixelRatioMax: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 4,
    maxShadowLights: 4,
    ao: { quality: 'Medium', halfRes: false, radius: 1.1, intensity: 3.8, distanceFalloff: 1 },
    bloom: { intensity: 0.85, levels: 6, radius: 0.6, threshold: 1.25, smoothing: 0.35 },
    smaa: 'high',
    outline: true,
    vignette: true,
    anisotropy: 8,
    hrtf: true,
  },
  ultra: {
    preset: 'ultra',
    pixelRatioScale: 1,
    pixelRatioMin: 1,
    pixelRatioMax: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 5,
    maxShadowLights: 6,
    ao: { quality: 'High', halfRes: false, radius: 1.2, intensity: 4, distanceFalloff: 1 },
    bloom: { intensity: 0.9, levels: 7, radius: 0.65, threshold: 1.25, smoothing: 0.35 },
    smaa: 'ultra',
    outline: true,
    vignette: true,
    anisotropy: 16,
    hrtf: true,
  },
};

export function getQuality(preset: QualityPreset): QualitySettings {
  return QUALITY_PRESETS[preset] ?? QUALITY_PRESETS.high;
}

/**
 * Effective renderer pixel ratio for a preset, the device pixel ratio and the user's
 * resolution scale (0.5–1.5). The result is clamped to [0.5, 2] as an absolute safety net.
 */
export function resolvePixelRatio(q: QualitySettings, devicePixelRatio: number, resolutionScale = 1): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scale = Number.isFinite(resolutionScale) ? Math.min(1.5, Math.max(0.5, resolutionScale)) : 1;
  const base = Math.min(q.pixelRatioMax, Math.max(q.pixelRatioMin, dpr * q.pixelRatioScale));
  return Math.min(2, Math.max(0.5, base * scale));
}
