/**
 * Interaction / prop id conventions (World §0.1, §9). Every module that refers to a world object
 * (world builders, binders, missions, lessons, HUD markers) builds the id with these helpers so the
 * strings never drift.
 *
 *   rig.<rig>.<part>        rig.wall-e.tablet, rig.r2-d2.cfd, rig.megatron.dock-mfd
 *   rig.tethered.pi|webcam  rig.adb.pi|webcam   rig.rack-b.camera-pi
 *   collis.<rig>            callus.minix-01 | callus.minix-02 | callus.nuc-03 | callus.slot-4 | callus.monitor
 *   rack.a.rails.u<n>-left|right
 *   power.strip.<x>[.s<n>]  power.outlet.w<n>  power.fuse.<x>  power.reg.<x>  power.tap.<v>
 *   cam.<rig> | cam.tethered | cam.adb | cam.rack-b-mosaic | cam.bench-mosaic
 *   mp.*                    multimeter probe points (§9.4)
 */
import type { TouchRigDef } from './rigs';
import { slug } from './types';

/** Parts every touch rig has (R2-D2 replaces `device` with `mfd` + `cfd`). */
export const TOUCH_RIG_PARTS = [
  'tablet',
  'power-panel',
  'switch-main',
  'switch-motor',
  'side-panel',
  'door',
  'carriage',
  'solenoid',
  'solenoid-connector',
  'stepper-x',
  'stepper-y',
  'limit-x',
  'limit-y',
  'dip-arm',
  'tap-paddle',
  'phone-sled',
  'motor-pcb',
  'cradle',
  'device',
  'device-psu',
  'pi',
  'pi-power',
  'pi-ethernet',
  'fuse',
  'webcam',
] as const;
export type TouchRigPart = (typeof TOUCH_RIG_PARTS)[number];

export const TETHERED_RIG_PARTS = ['mfd', 'cfd', 'dock-mfd', 'dock-cfd', 'smartstripe'] as const;
export type TetheredRigPart = (typeof TETHERED_RIG_PARTS)[number];

export type RigPart = TouchRigPart | TetheredRigPart;

/** `rig.<rigId>.<part>` */
export function rigPartId(rigId: string, part: RigPart): string {
  return `rig.${rigId}.${part}`;
}

/** Camel-cased accessors for one touch rig's ids: `touchRigIds('wall-e').switchMain`. */
export function touchRigIds(rigId: string): Record<CamelPart, string> {
  const out = {} as Record<CamelPart, string>;
  for (const p of TOUCH_RIG_PARTS) out[camel(p)] = rigPartId(rigId, p);
  return out;
}

type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type CamelPart = Camel<TouchRigPart>;

function camel<S extends string>(s: S): Camel<S> {
  return s.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase()) as Camel<S>;
}

/** Concrete part list of a touch rig (R2-D2: `mfd` + `cfd` instead of `device`). */
export function touchRigPartList(rig: TouchRigDef): RigPart[] {
  const dual = rig.deviceConfigs.some((c) => !!c.secondaryScreenMm);
  const out: RigPart[] = [];
  for (const p of TOUCH_RIG_PARTS) {
    if (p === 'device' && dual) out.push('mfd', 'cfd');
    else out.push(p);
  }
  return out;
}

/**
 * The interactable id of a device display on any physical rig:
 * touch rigs `rig.<id>.device` (R2-D2: `.mfd` / `.cfd`), tethered `rig.<id>.mfd|cfd`,
 * ADB bots `rig.<id>.device`.
 */
export function deviceDisplayId(rigId: string, display: 'primary' | 'secondary' = 'primary'): string {
  if (rigId === 'r2-d2' || rigId === 'megatron' || rigId === 'optimus') return rigPartId(rigId, display === 'primary' ? 'mfd' : 'cfd');
  return rigPartId(rigId, 'device');
}

/** Parse `rig.<rig>.<part>` (rig ids contain dashes, parts may too). */
export function parseRigPartId(id: string): { rigId: string; part: string } | null {
  const m = /^rig\.([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9-]+)$/.exec(id);
  if (!m) return null;
  const rigId = m[1]!;
  const part = m[2]!;
  // Greedy rig ids: prefer the longest known-part suffix split.
  for (const p of [...TOUCH_RIG_PARTS, ...TETHERED_RIG_PARTS, 'camera-pi'] as string[]) {
    const suffix = `.${p}`;
    if (id.endsWith(suffix)) return { rigId: id.slice(4, id.length - suffix.length), part: p };
  }
  return { rigId, part };
}

/** Shared shelf-level ids (one Pi / webcam per shelf). */
export const SHELF_IDS = {
  tetheredPi: 'rig.tethered.pi',
  tetheredWebcam: 'rig.tethered.webcam',
  adbPi: 'rig.adb.pi',
  adbWebcam: 'rig.adb.webcam',
  rackBCameraPi: 'rig.rack-b.camera-pi',
} as const;

export function collisId(rigId: string): string {
  return `collis.${rigId}`;
}

export function cameraId(rigId: string): string {
  return `cam.${rigId}`;
}

export function outletId(n: number): string {
  return `power.outlet.w${n}`;
}

export function huskyDrawerId(n: 1 | 2 | 3 | 4 | 5): string {
  return `chest.husky.d${n}`;
}

export function serverGpuId(n: 1 | 2 | 3 | 4): string {
  return `server.blade.gpu-${n}`;
}

export function libraryItemId(model: string): string {
  return `library.${model}`;
}

/** Labelled organiser drawers (§6.3); all other drawers are blank decor. */
export const WALL_DRAWER_LABELS = [
  'M2.5 BOLTS',
  'M5 BOLTS',
  'M2.5 NUTS',
  'M5 NUTS',
  'SOLENOIDS',
  'LIMIT SW',
  'V-WHEELS',
  'GT2 BELT',
  'PULLEYS',
  'RIBBON',
  'CARD INSERT',
  'FUSES 10A',
  'HEAT SHRINK',
  'ZIP TIES',
] as const;

/** `wall.drawers.<slug(label)>`, e.g. `wall.drawers.m2-5-bolts`. */
export function wallDrawerId(label: string): string {
  return `wall.drawers.${slug(label)}`;
}

export const WALL_BINS = {
  red: { id: 'wall.bins.red-spares', label: 'SPARE PI · SD · FUSES', contents: ['spare Pi', 'SD card', '10 A fuses'] },
  blue: { id: 'wall.bins.blue-cables', label: 'ETHERNET · USB', contents: ['Ethernet cable', 'USB-C lead', 'micro-USB lead'] },
} as const;

export const HISTORY_FRAMES = ['semi', 'sedi', 'ipx', 'paycore'] as const;
