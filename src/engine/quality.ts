/**
 * Quality presets — concrete renderer / post-fx / audio settings per `QualityPreset`.
 * Pure data + helpers (no three.js), so it can be unit-tested and read by the debug overlay.
 *
 * Budget targets
 *  - potato: very old laptops, Chromebooks, phones and software rendering (SwiftShader/llvmpipe).
 *            Renders straight to the canvas (no EffectComposer, no AO/bloom/SMAA/outline/vignette),
 *            no shadows, no image-based lighting, Lambert materials, DPR 0.5–0.75, 30 fps cap,
 *            low-res device screens updated at a low rate, decorative clutter skipped.
 *  - low:    integrated GPUs at ≥ 30 fps. No AO, no shadows, no bloom, no outline, DPR 0.75–1.
 *  - medium: mainstream laptops. Half-res AO, 2 shadow casters @1024, bloom, emissive highlight.
 *  - high:   discrete GPUs (default). Half-res AO, 4 casters @2048, bloom, outline highlight.
 *  - ultra:  fast desktop GPUs. High AO (half-res, depth-aware upsample), 6 casters @2048 (static,
 *            refreshed on demand), wider bloom, DPR ≤ 1.5, HRTF audio.
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
  /**
   * Post-processing chain (EffectComposer: AO / bloom / tone mapping / SMAA …). false = render
   * straight to the canvas with renderer tone mapping; `postprocessing` + `n8ao` are not even loaded.
   */
  postFx: boolean;
  /** Image-based lighting (PMREM of the lab room) on PBR materials. */
  environment: boolean;
  /** Swap PBR (Standard/Physical) materials for Lambert copies (see `cheapMaterials.ts`). */
  cheapMaterials: boolean;
  /** Frame-rate cap applied when the player's `frameRateCap` setting is 0 (Display). */
  defaultFrameCap: 0 | 30 | 60;
  /** Skip purely decorative small props (clutter, cable ties, posters' extras…). */
  reducedDetail: boolean;
  /** Device/tablet screen textures: max redraws per frame, min ms between animation redraws, mipmaps. */
  screens: { redrawsPerFrame: number; animMinMs: number; nearM: number; mipmaps: boolean };
}

const FULL_SCREENS = { redrawsPerFrame: 3, animMinMs: 100, nearM: 4.5, mipmaps: true } as const;

export const QUALITY_PRESETS: Readonly<Record<QualityPreset, QualitySettings>> = {
  potato: {
    preset: 'potato',
    pixelRatioScale: 0.5,
    pixelRatioMin: 0.5,
    pixelRatioMax: 0.75,
    shadows: false,
    shadowMapSize: 256,
    shadowRadius: 1,
    maxShadowLights: 0,
    ao: null,
    bloom: null,
    smaa: 'low',
    outline: false,
    vignette: false,
    anisotropy: 1,
    hrtf: false,
    postFx: false,
    environment: false,
    cheapMaterials: true,
    defaultFrameCap: 30,
    reducedDetail: true,
    screens: { redrawsPerFrame: 1, animMinMs: 400, nearM: 2.5, mipmaps: false },
  },
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
    postFx: true,
    environment: true,
    cheapMaterials: false,
    defaultFrameCap: 0,
    reducedDetail: false,
    screens: FULL_SCREENS,
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
    postFx: true,
    environment: true,
    cheapMaterials: false,
    defaultFrameCap: 0,
    reducedDetail: false,
    screens: FULL_SCREENS,
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
    ao: { quality: 'Medium', halfRes: true, radius: 1.1, intensity: 3.8, distanceFalloff: 1 },
    bloom: { intensity: 0.85, levels: 6, radius: 0.6, threshold: 1.25, smoothing: 0.35 },
    smaa: 'high',
    outline: true,
    vignette: true,
    anisotropy: 8,
    hrtf: true,
    postFx: true,
    environment: true,
    cheapMaterials: false,
    defaultFrameCap: 0,
    reducedDetail: false,
    screens: FULL_SCREENS,
  },
  ultra: {
    preset: 'ultra',
    pixelRatioScale: 1,
    pixelRatioMin: 1,
    pixelRatioMax: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 5,
    maxShadowLights: 6,
    ao: { quality: 'High', halfRes: true, radius: 1.2, intensity: 4, distanceFalloff: 1 },
    bloom: { intensity: 0.9, levels: 7, radius: 0.65, threshold: 1.25, smoothing: 0.35 },
    smaa: 'ultra',
    outline: true,
    vignette: true,
    anisotropy: 16,
    hrtf: true,
    postFx: true,
    environment: true,
    cheapMaterials: false,
    defaultFrameCap: 0,
    reducedDetail: false,
    screens: FULL_SCREENS,
  },
};

/** Presets from cheapest to richest (auto-detect steps down this list). */
export const QUALITY_ORDER: readonly QualityPreset[] = ['potato', 'low', 'medium', 'high', 'ultra'];

/** The next cheaper preset (potato stays potato). */
export function lowerPreset(p: QualityPreset): QualityPreset {
  const i = QUALITY_ORDER.indexOf(p);
  return i <= 0 ? 'potato' : QUALITY_ORDER[i - 1]!;
}

/** `a` is cheaper than `b`. */
export function isCheaperPreset(a: QualityPreset, b: QualityPreset): boolean {
  return QUALITY_ORDER.indexOf(a) < QUALITY_ORDER.indexOf(b);
}

/** Effective frame-rate cap (fps, 0 = none): the player's setting, else the preset's default. */
export function effectiveFrameCap(setting: number | undefined, preset: QualityPreset): number {
  if (setting === 30 || setting === 60) return setting;
  return getQuality(preset).defaultFrameCap;
}

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
