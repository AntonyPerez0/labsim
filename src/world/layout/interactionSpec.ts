/**
 * Types and helpers for the interactable catalogue (World §9.1). Kept free of catalogue imports so
 * every catalogue file can depend on it without cycles.
 */
import type { ToolId } from '@/core/state';
import { stripSocketId } from './power';
import type { Builder, Zone } from './types';

export type VerbKey = 'E' | 'R' | 'G';
/** press (default), hold (long press, `holdMs`), drag (LMB-drag), wheel (mouse wheel while engaged). */
export type VerbInput = 'press' | 'hold' | 'drag' | 'wheel';

export interface VerbSpec {
  readonly key: VerbKey;
  readonly label: string;
  readonly input?: VerbInput;
  readonly holdMs?: number;
  /** Tool(s) that must be the active tool (any of them). */
  readonly requiresTool?: ToolId | readonly ToolId[];
  /** Condition in words (shown greyed with this reason when not met), e.g. "Open the side door first". */
  readonly when?: string;
  /** Sim call it maps to (documentation for the binder), e.g. "sim.rig.setSwitch(rig, 'main', on)". */
  readonly sim?: string;
  /** True when the sim call is a §9.6 proposal that may not exist yet (fall back gracefully). */
  readonly proposed?: boolean;
  /** Non-sim effect: focus pose, overlay, pickup … */
  readonly effect?: string;
}

export interface InteractableSpec {
  readonly id: string;
  /** Prompt label (≤ 1 line), e.g. "Status tablet — WALL-E". */
  readonly label: string;
  readonly verbs: readonly VerbSpec[];
  /** Hold-RMB inspect callouts (≤ 4, exact strings). */
  readonly callouts: readonly string[];
  /** Max interaction distance (m). Default 2.2; parts inside bays 1.3; wall boards 2.5. */
  readonly reach: number;
  /** Only targetable when crouched (eye ≤ 1.1 m): GPUs 3–4. */
  readonly crouchOnly?: boolean;
  readonly zone: Zone;
  readonly builder: Builder;
  /** Prop the proxy belongs to when different from `id` (e.g. strip sockets). */
  readonly propId?: string;
  /** Focus pose kind used by `E` (if any). */
  readonly focus?: 'seated' | 'tablet' | 'touch-screen' | 'upright' | 'board';
  /** Mode restriction, e.g. "freeplay". */
  readonly modes?: readonly string[];
}

export const REACH = { default: 2.2, inBay: 1.3, wallBoard: 2.5 } as const;

type Extra = Partial<Pick<InteractableSpec, 'reach' | 'crouchOnly' | 'propId' | 'focus' | 'modes'>>;

export function ia(id: string, label: string, verbs: VerbSpec[], callouts: string[], zone: Zone, builder: Builder, extra: Extra = {}): InteractableSpec {
  const spec: { -readonly [K in keyof InteractableSpec]?: InteractableSpec[K] } = { id, label, verbs, callouts, zone, builder, reach: extra.reach ?? REACH.default };
  if (extra.crouchOnly) spec.crouchOnly = true;
  if (extra.propId) spec.propId = extra.propId;
  if (extra.focus) spec.focus = extra.focus;
  if (extra.modes) spec.modes = extra.modes;
  return spec as InteractableSpec;
}

export function E(label: string, more: Partial<VerbSpec> = {}): VerbSpec {
  return { key: 'E', label, ...more };
}
export function R(label: string, more: Partial<VerbSpec> = {}): VerbSpec {
  return { key: 'R', label, ...more };
}
export function G(label: string, more: Partial<VerbSpec> = {}): VerbSpec {
  return { key: 'G', label, ...more };
}

export const MULTIMETER: ToolId = 'multimeter';
export const SCREWDRIVER: ToolId = 'screwdriver';
export const SPARE_FUSES: readonly ToolId[] = ['spare-fuse-5v', 'spare-fuse-12v'];
export const TEST_CARDS: readonly ToolId[] = ['test-card-visa', 'test-card-interac'];

/** Verbs shared by every inline fuse holder (wall fuses and bay fuses). */
export function fuseVerbs(simFuseId: string): VerbSpec[] {
  return [
    E('Open / Close holder'),
    R('Pull fuse', { when: 'Open the holder first', sim: `sim.power.removeFuse('${simFuseId}')`, proposed: true }),
    E('Insert <rating> fuse', { requiresTool: SPARE_FUSES, when: 'Holder open and empty', sim: `sim.power.replaceFuse('${simFuseId}')` }),
    E('Measure', { requiresTool: MULTIMETER, sim: `sim.power.measure('${simFuseId}.load')` }),
  ];
}

/** AC strip verbs (+ one socket entry per outlet, `<strip>.s1` … `.s6`). */
export function stripEntries(stripId: string, label: string, callout: string, zone: Zone, builder: Builder, simStripId: string): InteractableSpec[] {
  const out = [ia(stripId, label, [E('Switch on / off', { sim: `sim.power.toggleStrip('${simStripId}', on)` })], [callout], zone, builder)];
  for (let n = 1; n <= 6; n++) {
    out.push(
      ia(stripSocketId(stripId, n), `${label} · socket ${n}`, [
        E('Unplug / Plug', { sim: `sim.power.unplug(load) / sim.power.plug(load, { kind: 'ac-strip', targetId: '${simStripId}', socket: ${n} })` }),
        E('Measure V~', { requiresTool: MULTIMETER, sim: `sim.power.measure('${simStripId}')` }),
      ], [callout], zone, builder, { propId: stripId }),
    );
  }
  return out;
}

/** Same verbs for every Raspberry Pi (rig Pis, shelf Pis, the Rack B camera Pi). */
export function piVerbs(simHostId: string): VerbSpec[] {
  return [E('Power-cycle', { sim: `sim.host.powerCycle('${simHostId}')`, effect: 'unplug, 5 s, replug' })];
}

/** Same verbs for every webcam. */
export function webcamVerbs(simRigId: string): VerbSpec[] {
  return [
    E('Adjust aim', { input: 'drag', sim: `sim.rig.aimWebcam('${simRigId}', yawDeg, pitchDeg)`, proposed: true, effect: 'drag ±15° yaw/pitch' }),
    R('Re-seat USB', { sim: `sim.rig.reseatWebcam('${simRigId}', 'player')` }),
  ];
}

/** Device display verbs (touch rigs, tethered faces, ADB bots). */
export function deviceVerbs(focus: 'touch-screen' | 'upright'): VerbSpec[] {
  return [
    E('Look at screen', { effect: focus === 'touch-screen' ? 'screenFocusPose (upright reading)' : 'uprightFocusPose' }),
    R('Tap screen', { sim: "sim.device.touch(deviceId, display, xMm, yMm, 'player')", when: 'Locked — test in progress' }),
    G('Power key', { input: 'hold', holdMs: 4000, sim: 'sim.device.pressPower(deviceId, longPress, player)', effect: 'tap = short press; hold 4 s = long press' }),
  ];
}
