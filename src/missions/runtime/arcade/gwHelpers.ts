/**
 * Predicates the GW detectors (`./gw.ts`) use: load kinds, DC hookups, coworker devices, PayCore rigs,
 * persisting Connection Failed causes, port 5555, legacy device rows, config transitions, LabChat asks.
 */
import type { LabState } from '@/sim/types';
import { personName } from '@/content';
import { GWS, currentConfig } from './gwState';
import { hostById, runtimeDevice } from '../lookups';
import { ROSTER } from './config';
import { RT } from '../rt';

export type P = Record<string, unknown>;
export const pl = (x: unknown): P => (x ?? {}) as P;
export const byPlayer = (x: unknown): boolean => {
  const a = pl(x).actor ?? pl(x).by;
  return a === undefined || a === 'player';
};

/**
 * A Pi power transition is the player's doing only when it follows a player action on that rig's power
 * path (Pi, its lead, MAIN, the power wall, the host itself) or a terminal / workstation-app action within
 * a couple of seconds. Power
 * changes that the sim produces later on its own tick (a fault taking a rail down, a boot finishing,
 * {{jared}}'s fix) carry no actor, so they must not count as the player's.
 */
export function playerTouchedPower(nowS: number, hostId: string, withinS = 2): boolean {
  const rig = hostId.replace(/^pi-/, '');
  const log = RT.log;
  for (let i = log.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
    const e = log[i]!;
    if (nowS - e.atS > withinS) break;
    if (e.suppressed) continue;
    if (e.type === 'terminal.command' || e.type === 'app.action') return true;
    if (e.type !== 'player.interacted') continue;
    const id = String(pl(e.payload).interactableId ?? '');
    if (id.startsWith('power.') || id.startsWith(`rig.${rig}.`) || id.includes(hostId)) return true;
  }
  return false;
}

/**
 * True when a fuse blew or a strip breaker tripped within `withinS` real seconds: a Pi losing power
 * then is a protection trip (the power step runs before the hosts step, so the trip is already in the
 * log when the host's `off` arrives), not a power cycle — e.g. a wrong-rating fuse blowing as the
 * regulator comes back on (GW04 covers that mistake; GW17 must not pile on).
 */
export function recentProtectionTrip(nowS: number, withinS = 2): boolean {
  const log = RT.log;
  for (let i = log.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
    const e = log[i]!;
    if (nowS - e.atS > withinS) break;
    if (e.type === 'power.fuseBlown' || e.type === 'power.breakerTripped') return true;
  }
  return false;
}

/* ───────────────────────────── helper predicates ───────────────────────────── */

function load(lab: LabState, loadId: string) {
  return lab.power?.loads?.[loadId];
}

export function isCollisLoad(lab: LabState, loadId: string): boolean {
  const l = load(lab, loadId);
  return !!l?.collisId || /collis|smartstripe/i.test(loadId);
}

export function islabload(lab: LabState, loadId: string): boolean {
  if (isCollisLoad(lab, loadId)) return false;
  const l = load(lab, loadId);
  if (l) return !!l.deviceId || l.expects === 'AC-BRICK-18V';
  return loadId.startsWith('dev-') || loadId.startsWith('psu-dev') || /flex|mini|station|compact|duo|pocket/i.test(loadId);
}

export function isDc(hookup: unknown): boolean {
  return (pl(hookup).kind as string | undefined) === 'dc-rail';
}

export function isCoworkerDevice(lab: LabState, id: string): boolean {
  const dev = runtimeDevice(lab, id) ?? (load(lab, id)?.deviceId ? runtimeDevice(lab, load(lab, id)!.deviceId!) : null);
  if (dev) return dev.ip?.startsWith('10.42.60.') || (dev.rigId ?? '').startsWith('desk-');
  const host = hostById(lab, id);
  return !!host && (host.ip?.startsWith('10.42.60.') || host.owner === 'riley');
}

export const INFRA_HOSTS = new Set(['orca-vm', 'jenkins-vm', 'ollama-vm', 'gpu-blade']);

export function paycoreRig(name: string): boolean {
  return ROSTER[name]?.roles.includes('paycore') ?? name === 'rosie';
}

/** A fault that keeps a robot from passing its next health check is still active. */
export function connFailedCausePersists(lab: LabState, robot: string): boolean {
  const rig = lab.rigs?.[robot];
  const ro = ROSTER[robot];
  const targets = new Set<string>([robot, rig?.piHostId ?? ro?.pi ?? '', rig?.callusHostId ?? ro?.box ?? '', ro?.fuse ?? ''].filter(Boolean));
  if ((lab.faults ?? []).some((f) => !f.cleared && ((f.target && targets.has(f.target)) || Object.values(f.params ?? {}).some((v) => typeof v === 'string' && targets.has(v))))) return true;
  const pi = rig?.piHostId ?? ro?.pi;
  if (pi) {
    const h = hostById(lab, pi);
    if (h && (h.os !== 'RUNNING' || h.eth === 'UNPLUGGED' || h.services?.['robot-controller']?.running === false)) return true;
  }
  return false;
}

export const has5555 = (s: unknown): boolean => typeof s === 'string' && /(^|[^0-9])5555([^0-9]|$)/.test(s);

/* ───────────────────────────── detector helpers needing the log ───────────────────────────── */

export function robotUrl(lab: LabState, id: number): string {
  const r = Object.values(lab.orca?.robots ?? {}).find((x) => x.id === id);
  return r ? [r.adbServiceUrl, r.cameraStreamUrl, r.dipUrl, r.tapUrl, r.swipeUrl].filter(Boolean).join(' ') : '';
}

export function isLegacyRow(id: number): boolean {
  if (GWS.legacyDeviceIds.has(id)) return true;
  const name = GWS.deviceNames.get(id) ?? '';
  return /flex1|legacy/i.test(name);
}

export function configTurnedBad(lab: LabState): boolean {
  const before = GWS.config.get('config');
  const now = currentConfig(lab);
  const bad = (c: { theme: string | null; kernelType: string | null }) => (c.theme !== null && c.theme !== 'avocado') || (c.kernelType !== null && c.kernelType !== 'CPA');
  GWS.config.set('config', now);
  return bad(now) && !(before && bad(before) && before.theme === now.theme && before.kernelType === now.kernelType);
}

/** Set by the penalties engine from the event log: player LabChat messages mentioning someone. */
const asked = new Set<string>();
export function noteChatAsk(text: string): void {
  const t = text.toLowerCase();
  for (const k of ['riley', 'sam', 'alex', 'jared', 'tate', 'david', 'morgan']) {
    if (t.includes(k) || t.includes(personName(k).toLowerCase())) asked.add(k);
  }
}
export function clearChatAsks(): void {
  asked.clear();
}
export function askedInChat(who: string): boolean {
  return asked.has(who.toLowerCase());
}

