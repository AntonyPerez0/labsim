/**
 * Automatic quality selection for weak hardware (Settings → "Auto-detect quality").
 *
 * 1. `probeHardware()` collects what the browser exposes: coarse pointer / mobile UA, CPU cores,
 *    device memory, the WebGL renderer string (WEBGL_debug_renderer_info), max texture size and
 *    the screen size.
 * 2. `presetForHardware()` turns that into a CEILING preset (pure; unit-tested): software
 *    rasterisers, phones, ≤ 2 GB / ≤ 2 cores and old mobile/Intel GPUs → potato; tablets,
 *    Chromebooks, 4 GB / 4 cores, Intel HD/UHD → low; Intel Iris → medium.
 * 3. `FrameTimeWatch` judges real frame times while the player is in the lab: after a warm-up it
 *    reports `'slow'` when the mean frame stays above a threshold for a whole window.
 *
 * Callers only ever LOWER the player's preset with these results — never raise it.
 */
import type { WebGLRenderer } from 'three';
import type { QualityPreset } from '@/core/state';
import { QUALITY_ORDER } from './quality';

export interface HardwareInfo {
  /** Phone-sized touch device (coarse pointer and a short screen side ≤ 600 CSS px, or a phone UA). */
  phone: boolean;
  /** Tablet-sized touch device. */
  tablet: boolean;
  chromebook: boolean;
  cores: number | null;
  /** `navigator.deviceMemory` (GB, Chromium only; capped at 8 by the browser). */
  memoryGb: number | null;
  /** Unmasked WebGL renderer string ('' when unavailable). */
  gpu: string;
  maxTextureSize: number;
  /** Screen size in CSS px (long × short side) and device pixel ratio. */
  screenLong: number;
  screenShort: number;
  dpr: number;
}

export interface PresetPick {
  preset: QualityPreset;
  /** Human-readable reasons (debug / console). */
  reasons: string[];
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|lavapipe/i;
/** Old / low-end mobile GPUs. */
const WEAK_MOBILE_GPU = /mali-[t4]|mali-g(31|51|52|57|68)\b|adreno \(tm\) [2-5]\d\d|adreno [2-5]\d\d|powervr|sgx|videocore|vivante|tegra/i;
/** Integrated Intel GPUs: the old "HD Graphics NNNN" family is very old-laptop territory. */
const INTEL_OLD_HD = /intel.*\bhd graphics/i;
/** Skylake+ (HD 5xx/6xx, UHD): fine at Low. */
const INTEL_UHD = /intel.*(uhd graphics|\bhd graphics [5-6]\d\d\b)/i;
const INTEL_IRIS = /intel.*iris/i;
const OTHER_MOBILE_GPU = /mali|adreno|apple gpu|immortalis|xclipse/i;

function cheaper(a: QualityPreset, b: QualityPreset): QualityPreset {
  return QUALITY_ORDER.indexOf(a) <= QUALITY_ORDER.indexOf(b) ? a : b;
}

/** Highest preset this hardware should start at (pure). */
export function presetForHardware(h: HardwareInfo): PresetPick {
  let preset: QualityPreset = 'ultra';
  const reasons: string[] = [];
  const cap = (p: QualityPreset, why: string) => {
    const next = cheaper(p, preset);
    if (next !== preset) reasons.push(`${why} → ${p}`);
    preset = next;
  };
  const gpu = h.gpu;
  if (gpu && SOFTWARE_GPU.test(gpu)) cap('potato', `software renderer (${gpu})`);
  if (h.phone) cap('potato', 'phone');
  else if (h.tablet) cap('low', 'tablet');
  if (h.chromebook) cap(h.memoryGb !== null && h.memoryGb <= 4 ? 'potato' : 'low', 'Chromebook');
  if (h.memoryGb !== null) {
    if (h.memoryGb <= 2) cap('potato', `${h.memoryGb} GB memory`);
    else if (h.memoryGb <= 4) cap('low', `${h.memoryGb} GB memory`);
  }
  if (h.cores !== null) {
    if (h.cores <= 2) cap('potato', `${h.cores} CPU cores`);
    else if (h.cores <= 4) cap('low', `${h.cores} CPU cores`);
  }
  if (gpu) {
    if (WEAK_MOBILE_GPU.test(gpu)) cap('potato', `low-end mobile GPU (${gpu})`);
    else if (OTHER_MOBILE_GPU.test(gpu) && (h.phone || h.tablet)) cap('low', `mobile GPU (${gpu})`);
    if (INTEL_IRIS.test(gpu)) cap('medium', `Intel Iris (${gpu})`);
    else if (INTEL_UHD.test(gpu)) cap('low', `Intel UHD (${gpu})`);
    else if (INTEL_OLD_HD.test(gpu)) cap('potato', `old Intel HD (${gpu})`);
  }
  if (h.maxTextureSize > 0) {
    if (h.maxTextureSize < 4096) cap('potato', `max texture ${h.maxTextureSize}`);
    else if (h.maxTextureSize < 8192) cap('low', `max texture ${h.maxTextureSize}`);
  }
  // Big, dense screens multiply fragment work even at a capped pixel ratio.
  if (h.screenLong * h.dpr >= 3800 && preset === 'ultra') cap('high', '4K-class screen');
  return { preset, reasons };
}

/** Read what the browser exposes about the device. `gl` adds the GPU string and texture limit. */
export function probeHardware(renderer?: WebGLRenderer | null): HardwareInfo {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const ua = nav.userAgent ?? '';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const fine = typeof matchMedia !== 'undefined' && matchMedia('(any-pointer: fine)').matches;
  const scr = typeof screen !== 'undefined' ? screen : { width: 1920, height: 1080 };
  const long = Math.max(scr.width || 0, scr.height || 0);
  const short = Math.min(scr.width || 0, scr.height || 0);
  const phoneUa = /iPhone|iPod|Android.+Mobile|Windows Phone|Mobile Safari(?!.*iPad)/i.test(ua) || nav.userAgentData?.mobile === true;
  const tabletUa = /iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  const phone = phoneUa || (coarse && !fine && short > 0 && short <= 600);
  const tablet = !phone && (tabletUa || (coarse && !fine));
  let gpu = '';
  let maxTextureSize = 0;
  if (renderer) {
    try {
      const gl = renderer.getContext();
      maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    } catch {
      /* context lost / blocked: decide without the GPU */
    }
  }
  return {
    phone,
    tablet,
    chromebook: /CrOS/.test(ua),
    cores: typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 ? nav.deviceMemory : null,
    gpu,
    maxTextureSize,
    screenLong: long,
    screenShort: short,
    dpr: typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1,
  };
}

/**
 * Sliding judgement of real frame times. Feed it one-second windows (`engine.stats()`); it ignores
 * `warmupWindows` after every reset (shader compiles, texture uploads) and then answers `'slow'`
 * once `windows` consecutive samples all had a mean frame time above `slowMs`.
 */
export class FrameTimeWatch {
  private skip: number;
  private run = 0;

  constructor(
    private readonly slowMs: number,
    private readonly windows: number,
    private readonly warmupWindows = 2,
  ) {
    this.skip = warmupWindows;
  }

  reset(): void {
    this.skip = this.warmupWindows;
    this.run = 0;
  }

  /** One window's mean frame time (ms). `extraSlow` lets the caller add a condition (e.g. DRS at its floor). */
  sample(meanMs: number, extraSlow = true): 'warming' | 'ok' | 'slow' {
    if (this.skip > 0) {
      this.skip--;
      return 'warming';
    }
    if (meanMs > this.slowMs && extraSlow) this.run++;
    else this.run = 0;
    if (this.run >= this.windows) {
      this.run = 0;
      return 'slow';
    }
    return 'ok';
  }
}
