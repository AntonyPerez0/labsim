/**
 * Effective device geometry: World §3.1 bodies with the SIM's screen sizes (Sim §2.2 — the sim's
 * firmware layouts are the only truth for hit tests, Sim Appendix C "Screen geometry"). A gantry or
 * player touch in screen mm must land on the button drawn at those mm, so every screen plane is
 * built at the sim size and centred where World §3.1 puts the active area (bezels grow/shrink
 * symmetrically). A sim screen larger than the physical opening (STATION_2 on the tethered bench is
 * a 14" layout in an 8" head) is drawn uniformly scaled: the plane is smaller than `logicalMm`, and
 * screen-mm ↔ UV conversions always use `logicalMm`.
 */
import type { DeviceTypeCode } from '@/sim/types';
import { screenOf } from '@/sim/seed/deviceTypes';
import { DEVICE_MODELS, type DeviceModelDef } from '../layout';

type Vec2 = readonly [number, number];

/** Sim screen size (mm) of a device display, or null when the sim does not know the type. */
export function simScreenMm(type: DeviceTypeCode, display: 'primary' | 'secondary'): [number, number] | null {
  try {
    const s = screenOf(type, display);
    return s && s.wMm > 0 && s.hMm > 0 ? [s.wMm, s.hMm] : null;
  } catch {
    return null;
  }
}

export interface EffectiveScreen {
  /** Plane size actually built (mm). */
  readonly physMm: Vec2;
  /** Screen-mm frame the sim draws and hit-tests in (= physMm unless scaled to fit). */
  readonly logicalMm: Vec2;
}

export interface EffectiveModel extends DeviceModelDef {
  readonly primaryScreen: EffectiveScreen | null;
  readonly secondaryScreen: EffectiveScreen | null;
}

/** Sim size when it fits the face opening; otherwise the sim aspect scaled into the World opening. */
function fit(world: Vec2, sim: [number, number] | null, maxW: number, maxH: number): EffectiveScreen {
  if (!sim) return { physMm: world, logicalMm: world };
  if (sim[0] <= maxW && sim[1] <= maxH) return { physMm: sim, logicalMm: sim };
  const k = Math.min(world[0] / sim[0], world[1] / sim[1]);
  return { physMm: [sim[0] * k, sim[1] * k], logicalMm: sim };
}

const cache = new Map<DeviceTypeCode, EffectiveModel>();

/** World model with the sim's screen sizes (screen centre kept; bezel margins adjusted). */
export function modelFor(type: DeviceTypeCode): EffectiveModel {
  const hit = cache.get(type);
  if (hit) return hit;
  const base = DEVICE_MODELS[type];
  let primaryScreen: EffectiveScreen | null = null;
  let secondaryScreen: EffectiveScreen | null = null;
  let screen = base.screen;
  let margins = base.margins;
  if (base.screen && base.margins) {
    const [w, h] = base.screen.mm;
    const mg = base.margins;
    // the opening the face allows: the body width minus 2 mm rims, the full face height minus 6 mm
    const maxW = Math.max(w, base.bodyMm[0] - 4);
    const maxH = Math.max(h, h + mg.top + mg.bottom - 12);
    primaryScreen = fit([w, h], simScreenMm(type, 'primary'), maxW, maxH);
    const [pw, ph] = primaryScreen.physMm;
    screen = { ...base.screen, mm: [pw, ph] };
    margins = { top: mg.top + (h - ph) / 2, bottom: mg.bottom + (h - ph) / 2, sides: mg.sides + (w - pw) / 2 };
  }
  if (base.secondary) {
    const [w, h] = base.secondary.mm;
    secondaryScreen = fit([w, h], simScreenMm(type, 'secondary'), w + 8, h + 8);
  }
  const out: EffectiveModel = { ...base, screen, margins, primaryScreen, secondaryScreen };
  cache.set(type, out);
  return out;
}
