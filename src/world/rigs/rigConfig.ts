/**
 * Touch-rig device configuration as the SIM sees it (Sim §2.2 / §3.5.4, Appendix C): the gantry's
 * (0,0) is the top-left of the PROBE display (R2-D2: the Duo CFD), in that display's screen mm, and
 * the screens have the sim's sizes (Flex 3/4/Pocket 76.0 × 135.0 …). `layout.ts` (World §2.10) keeps
 * the World-doc numbers; this module derives the effective values while keeping every screen centre
 * where World §2.10 puts it:
 *   - `primaryScreenMm`  sim size of the primary display;
 *   - `screenTopLeftMm`  bay (x, z) of the primary display's top-left (device placement);
 *   - `homeMm`           bay (x, z) of gantry (0,0) = the probe display's top-left;
 *   - `probeOriginMm`    always (0, 0) (the sim's gantry frame IS the probe display frame);
 *   - `maxMm`            probe display + 10 mm (the sim's travel limits);
 *   - `nfcMm`            re-anchored to the new screen (same offset from the bottom edge, centred).
 */
import { deviceConfigFor, type TouchDeviceConfig, type TouchRigDef } from '../layout';
import type { DeviceTypeCode } from '@/sim/types';
import { simScreenMm } from '../devices/models';

export interface RigDeviceConfig extends TouchDeviceConfig {
  /** Bay (x, z) mm of the primary display's top-left. */
  readonly screenTopLeftMm: readonly [number, number];
}

const cache = new Map<TouchDeviceConfig, RigDeviceConfig>();

export function effectiveConfig(cfg: TouchDeviceConfig): RigDeviceConfig {
  const hit = cache.get(cfg);
  if (hit) return hit;
  const [w0, h0] = cfg.primaryScreenMm;
  const [pw, ph] = simScreenMm(cfg.type, 'primary') ?? [w0, h0];
  // primary top-left, keeping the World §2.10 screen centre
  const tl: [number, number] = [cfg.homeMm[0] + (w0 - pw) / 2, cfg.homeMm[1] + (h0 - ph) / 2];
  let home: [number, number] = tl;
  let probeW = pw;
  let probeH = ph;
  let nfc: [number, number] = [cfg.nfcMm[0] - w0 / 2 + pw / 2, cfg.nfcMm[1] - h0 + ph];
  if (cfg.probeDisplay === 'secondary' && cfg.secondaryScreenMm) {
    const [sw0, sh0] = cfg.secondaryScreenMm;
    const [sw, sh] = simScreenMm(cfg.type, 'secondary') ?? [sw0, sh0];
    // CFD top-left (World: MFD top-left + probeOrigin), centre kept
    home = [cfg.homeMm[0] + cfg.probeOriginMm[0] + (sw0 - sw) / 2, cfg.homeMm[1] + cfg.probeOriginMm[1] + (sh0 - sh) / 2];
    probeW = sw;
    probeH = sh;
    nfc = [cfg.nfcMm[0] - sw0 / 2 + sw / 2, cfg.nfcMm[1] - sh0 + sh];
  }
  const out: RigDeviceConfig = {
    ...cfg,
    primaryScreenMm: [pw, ph],
    screenTopLeftMm: tl,
    homeMm: home,
    probeOriginMm: [0, 0],
    maxMm: [Math.round((probeW + 10) * 10) / 10, Math.round((probeH + 10) * 10) / 10],
    nfcMm: nfc,
  };
  cache.set(cfg, out);
  return out;
}

/** `deviceConfigFor` with the sim's geometry (see header). */
export function rigConfigFor(def: TouchRigDef, type?: DeviceTypeCode): RigDeviceConfig {
  return effectiveConfig(deviceConfigFor(def, type));
}
