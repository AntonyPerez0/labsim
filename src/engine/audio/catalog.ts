/**
 * Per-sound defaults: mixer bus, level, re-trigger period when looped without a continuous recipe,
 * and 3D attenuation reference distance.
 */
import type { SoundId } from '../types';

export type Bus = 'sfx' | 'ambience' | 'ui';

export interface SoundDef {
  bus: Bus;
  level: number;
  /** Seconds between re-triggers for `loop()` of one-shot sounds ([min, max] = random). */
  retrigger?: [number, number];
  /** PannerNode refDistance (m). */
  refDistance: number;
}

const sfx = (level: number, refDistance = 1, retrigger?: [number, number]): SoundDef => ({ bus: 'sfx', level, refDistance, retrigger });
const amb = (level: number, refDistance = 2): SoundDef => ({ bus: 'ambience', level, refDistance });
const ui = (level: number, retrigger?: [number, number]): SoundDef => ({ bus: 'ui', level, refDistance: 1, retrigger });

export const SOUND_DEFS: Record<SoundId, SoundDef> = {
  stepper: sfx(1, 0.8),
  solenoid: sfx(1, 0.8, [0.35, 0.35]),
  servo: sfx(1, 0.8),
  relay: sfx(1, 0.6, [0.5, 0.5]),
  fan: amb(1, 1.2),
  'gpu-fans': amb(1, 2.5),
  fluorescent: amb(1, 1.5),
  'device-beep': sfx(1, 1, [1, 1]),
  'device-approved': sfx(1, 1.2, [2, 2]),
  'device-error': sfx(1, 1.2, [1.2, 1.2]),
  printer: sfx(1, 1),
  keyboard: sfx(0.9, 0.7, [0.07, 0.22]),
  'mouse-click': sfx(0.9, 0.6, [0.6, 1.4]),
  footstep: sfx(0.9, 1, [0.45, 0.45]),
  door: sfx(1, 1.5, [3, 3]),
  'room-tone': amb(1, 4),
  'ui-click': ui(0.9),
  'ui-hover': ui(0.8),
  'ui-success': ui(1),
  'ui-fail': ui(1),
  'ui-xp': ui(1),
  'ui-achievement': ui(1),
  'ui-ticket': ui(1, [2, 2]),
  'ui-type': ui(0.9, [0.06, 0.18]),
  'fuse-pop': sfx(1, 1.2, [2, 2]),
  spark: sfx(1, 1, [0.4, 1.2]),
  'plug-in': sfx(1, 0.7, [1, 1]),
  unplug: sfx(1, 0.7, [1, 1]),
  'switch-toggle': sfx(1, 0.7, [1, 1]),
  'card-insert': sfx(1, 0.7, [1.5, 1.5]),
  'nfc-tap': sfx(1, 1, [1.2, 1.2]),
};
