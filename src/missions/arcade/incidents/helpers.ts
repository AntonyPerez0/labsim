/**
 * Shared authoring helpers for the Arcade incident catalogue (GP §3.5): binding accessors, the
 * Diagnosis Call builder, symptom/wrong-move shorthands, Jared's narrated by-the-book fixes and the
 * event matchers incident-local wrong moves use. Pure data helpers — no React, no Math.random.
 */
import { personText } from '@/content';
import type { DeviceTypeCode, RobotStatus } from '@/sim/types';
import { truthFor } from '@/sim/seed/repos/screenTruth';
import type { RootState } from '@/core/state';
import type { FaultSpec } from '@/sim/api';
import type {
  AnyEventMatcher,
  ScenarioItem,
  SetupOpSpec,
  Condition,
  DiagnosisCallDef,
  DiagnosisOption,
  IncidentBinding,
  ReplyOption,
  ScriptAction,
  Symptom,
  SymptomSource,
  TeachCardContent,
  Templated,
  WrongMoveDef,
} from '../../types';
import { c, on, p } from '../../types';

/** Resolve `{{jared}}`-style people tokens from `src/content/team.ts` (names are never hard-coded). */
export const P = (text: string): string => personText(text);

/* ───────────────────────────── binding accessors ───────────────────────────── */

/** A binding var as a string (`''` when missing). */
export function v(b: IncidentBinding, key: string): string {
  const x = b.vars[key];
  return x === undefined || x === null ? '' : String(x);
}

/** Bound rig system name (`wall-e`), or `''` for rig-less incidents. */
export const rig = (b: IncidentBinding): string => b.rig ?? '';
/** Human Readable Name shown on tickets (`WALL-E`). */
export const hrn = (b: IncidentBinding): string => b.hrn || v(b, 'hrn') || rig(b).toUpperCase();
/** Pi host id (`pi-wall-e`). */
export const pi = (b: IncidentBinding): string => v(b, 'pi');
/** Pi IP (`10.42.10.11`). */
export const piIp = (b: IncidentBinding): string => v(b, 'piIp');
/** Robot Controller health endpoint (`http://10.42.10.11:8000/health`). */
export const healthUrl = (b: IncidentBinding): string => `http://${piIp(b)}:8000/health`;
/** Robot Device runtime id (`dev-wall-e-flex3`). */
export const dev = (b: IncidentBinding): string => v(b, 'dev');
/** Orca device-row name (`wall-e-flex3`). */
export const deviceRow = (b: IncidentBinding): string => v(b, 'device');
/** Device IP (`10.42.30.11`). */
export const deviceIp = (b: IncidentBinding): string => v(b, 'deviceIp');
/** Device Type enum value (`FLEX_3`). */
export const deviceType = (b: IncidentBinding): string => v(b, 'deviceType');
/** Callus box host id (`minix-01`). */
export const box = (b: IncidentBinding): string => v(b, 'box');
/** Collis probe id (`collis-wall-e`). */
export const probe = (b: IncidentBinding): string => v(b, 'probe') || `collis-${rig(b)}`;
/** Camera Stream URL Orca stores for the rig. */
export const cameraUrl = (b: IncidentBinding): string => v(b, 'cameraUrl') || `http://${piIp(b)}:8081/stream.mjpg`;
/** True when the rig's camera is served by its own Pi (not the shared Rack B camera host). */
export const ownCamera = (b: IncidentBinding): boolean => cameraUrl(b).includes(`//${piIp(b)}:`);
/** Every rig the binding affects (primary first). */
export const allRigs = (b: IncidentBinding): string[] => [...new Set([...(b.rig ? [b.rig] : []), ...b.rigs])];
/** Upper-case list for ticket titles. */
export const hrnList = (rigs: readonly string[]): string => rigs.map((r) => r.toUpperCase()).join(', ');

/**
 * Status a rig returns to after a Connection Failed recovery (Sim §3.2.1 restore rule, SR01): the
 * PayCore rig goes back to Unavailable, every other modelled rig to Available.
 */
export function restoredStatus(rigName: string): RobotStatus {
  return rigName === 'rosie' ? 'UNAVAILABLE' : 'AVAILABLE';
}

/** Rack label for texts (`Rack A`). */
export function rackLabel(b: IncidentBinding): string {
  const r = v(b, 'rack');
  return r === 'rack-a' ? 'Rack A' : r === 'rack-b' ? 'Rack B' : r === 'rack-t' ? 'the tethered rack' : r === 'adb-shelf' ? 'the ADB shelf' : 'its rack';
}

/** Rack 5 V fuse for a rig (`F-RACKA-5V`). */
export function rackFuse(b: IncidentBinding): string {
  return v(b, 'fuse') || 'F-RACKB-5V';
}

/** Touch rigs with their own Pi (GP §3.1 `touch` role). */
export const TOUCH_RIGS = ['wall-e', 'eve', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti', 'rosie'] as const;
/** Rigs whose Collis probe is driven by MINIX-01 / MINIX-02 (Sim roster). */
export const MINIX01_RIGS = ['wall-e', 'eve', 'bumblebee', 'r2-d2'] as const;
export const MINIX02_RIGS = ['johnny-5', 'baymax', 'seti', 'rosie', 'megatron', 'optimus'] as const;
/** Rigs powered by each rack 5 V fuse (Sim power layout). */
export const RACK_A_RIGS = ['wall-e', 'eve', 'bumblebee', 'r2-d2'] as const;
export const RACK_B_RIGS = ['johnny-5', 'baymax', 'seti', 'rosie'] as const;

/* ───────────────────────────── builders ───────────────────────────── */

export const sym = (where: SymptomSource, text: Templated): Symptom => ({ where, text });

type Opt = readonly [text: Templated, wrongCallHint?: Templated];

/**
 * Diagnosis Call (GP §2.3.6): option A is the correct one, B–D are distractors with a
 * `wrongCallHint` (where to look, never the answer). The UI shuffles.
 */
export function dc(a: Templated, b: Opt, cc: Opt, d: Opt): DiagnosisCallDef {
  const o = (id: string, x: Opt): DiagnosisOption => ({ id, text: x[0], wrongCallHint: x[1] ?? 'Re-read the evidence on the ticket before you call it.' });
  return { options: [{ id: 'A', text: a, correct: true }, o('B', b), o('C', cc), o('D', d)] };
}

/** Diagnosis Call where the correct option is not A (INC57 variants). */
export function dcWithCorrect(correctId: 'A' | 'B', options: readonly [Opt, Opt, Opt, Opt]): DiagnosisCallDef {
  const ids = ['A', 'B', 'C', 'D'] as const;
  const out = options.map((x, i): DiagnosisOption => {
    const id = ids[i]!;
    return id === correctId ? { id, text: x[0], correct: true } : { id, text: x[0], wrongCallHint: x[1] ?? 'Re-read the evidence on the ticket before you call it.' };
  });
  return { options: [out[0]!, out[1]!, out[2]!, out[3]!] };
}

/** A wrong-but-tempting move that maps to a global wrong action (penalty and Teach Card come from the GW; detection is global). */
export const gw = (id: string, gwId: string, text: string): WrongMoveDef => ({ id, text, gw: gwId });

/** An incident-local wrong move with its own penalty, detected from a player event. */
export function wm(
  id: string,
  text: string,
  penalty: number,
  detect: AnyEventMatcher | undefined,
  teach?: TeachCardContent,
  extra: Partial<Pick<WrongMoveDef, 'strike' | 'when' | 'repeatable'>> = {},
): WrongMoveDef {
  const out: WrongMoveDef = { id, text, penalty, ...extra };
  if (detect) out.detect = detect;
  if (teach) out.teach = { ...teach, whatHappened: P(teach.whatHappened), why: P(teach.why), doInstead: P(teach.doInstead) };
  return out;
}

/** Teach Card shorthand. */
export const teach = (whatHappened: string, why: string, doInstead: string, extra: Partial<TeachCardContent> = {}): TeachCardContent => ({
  whatHappened,
  why,
  doInstead,
  ...extra,
});

/* ───────────────────────────── event matchers (player actions) ───────────────────────────── */

type Pl = Record<string, unknown>;
const byPlayer = (x: unknown): boolean => {
  const a = (x as Pl | null)?.actor ?? (x as Pl | null)?.by;
  return a === undefined || a === 'player';
};

/** The player saved an Orca entity (optionally: touching one of `fields`, matching `test`). */
export function orcaSave(entity: 'robot' | 'device' | 'capability' | 'merchant' | 'screen' | 'screenLocation' | 'cardProfile' | 'screenCompareImage', opts: { fields?: readonly string[]; action?: 'create' | 'update' | 'delete'; test?: (pl: Pl, s: RootState) => boolean } = {}): AnyEventMatcher {
  return on('orca.entitySaved', { entity }, (pl, s) => {
    if (!byPlayer(pl)) return false;
    if (opts.action && pl.action !== opts.action) return false;
    if (opts.fields && !opts.fields.some((f) => pl.fields.includes(f))) return false;
    return opts.test ? opts.test(pl as unknown as Pl, s) : true;
  });
}

/** The player saved a Robot row of `robotName` touching one of `fields`. */
export function robotEdit(robotName: string, fields: readonly string[]): AnyEventMatcher {
  return orcaSave('robot', { fields, test: (_pl, s) => Object.values(s.lab.orca.robots).some((r) => r.name === robotName && r.id === (_pl.id as number)) });
}

/** The player changed a robot's status to `to`. */
export function statusTo(robotName: string, to: RobotStatus): AnyEventMatcher {
  return on('robot.statusChanged', { name: robotName, to }, (pl) => byPlayer(pl));
}

/** A rig command (tablet / Motion Control) by the player. */
export function rigCommand(rigId: string, command: string): AnyEventMatcher {
  return on('rig.command', { rigId }, (pl) => pl.command === command && byPlayer(pl));
}

/** A terminal command line matching `re` (any host). */
export function typed(re: RegExp): AnyEventMatcher {
  return on('terminal.command', {}, (pl) => re.test(pl.line));
}

/** The player saved a Jenkins job (params / script). */
export function jobSaved(jobId: string, test?: (pl: Pl) => boolean): AnyEventMatcher {
  return on('jenkins.jobSaved', { jobId }, (pl) => byPlayer(pl) && (!test || test(pl as unknown as Pl)));
}

/** A build of `jobId` was queued with a param matching. */
export function buildWith(jobId: string | null, test: (params: Record<string, string>) => boolean): AnyEventMatcher {
  return on('jenkins.buildQueued', {}, (pl) => (jobId === null || pl.jobId === jobId) && test(pl.params ?? {}));
}

/** Power-cycle counter for a Pi host: any transition of the host to `off` caused by the player. */
export function piPowerOff(host: string): AnyEventMatcher {
  return on('host.powerChanged', { hostId: host }, (pl) => pl.to === 'off');
}

/* ───────────────────────────── conditions ───────────────────────────── */

/** `orca.robot(R).status == S` for every rig. */
export const allStatus = (rigs: readonly string[], status: (r: string) => RobotStatus): Condition => c.forAll(rigs, (r) => c.status(r, status(r)));

/** Recovery observed at the next health check: robot status restored and the last ping 200. */
export function recoveredAtNextCheck(rigs: readonly string[]): Condition {
  return c.label(
    c.nextHealthCheck(c.all(...rigs.map((r) => c.all(c.status(r, restoredStatus(r)), c.eq(p.robot(r).lastHealthHttp, 200))))),
    'Waiting for the next health check',
  );
}

/* ───────────────────────────── Jared's by-the-book fix ───────────────────────────── */

/**
 * Narrated escalation fix (GP §2.3.7): Jared walks to the target, narrates what was checked and does
 * the fix animation. The runtime then clears the incident's fault instances (`faults.clear(id,'jared')`,
 * whose reverts restore causes the way a real fix would) and auto-resolves on the success condition.
 */
export function jaredFix(target: string, ...lines: string[]): readonly ScriptAction[] {
  const out: ScriptAction[] = [{ do: 'npc', npc: 'jared', action: 'walk-to', target }];
  for (const line of lines) out.push({ do: 'bark', speaker: 'jared', text: P(line) });
  out.push({ do: 'npc', npc: 'jared', action: 'fix', target });
  return out;
}

/** Standard counters for hardware Connection Failed incidents. */
export function powerCycleCounters(b: IncidentBinding): Readonly<Record<string, AnyEventMatcher>> {
  return { powerCycles: piPowerOff(pi(b)) };
}

/** Robot Controller Pi IP per modelled rig (GP §3.1 / Sim roster) — for multi-rig escalation endpoints. */
export const PI_IPS: Readonly<Record<string, string>> = {
  'wall-e': '10.42.10.11',
  eve: '10.42.10.12',
  bumblebee: '10.42.10.13',
  'r2-d2': '10.42.10.14',
  'johnny-5': '10.42.10.15',
  baymax: '10.42.10.16',
  seti: '10.42.10.17',
  rosie: '10.42.10.18',
  megatron: '10.42.10.20',
  optimus: '10.42.10.20',
  data: '10.42.10.30',
  tars: '10.42.10.30',
};

/** Health endpoints of every rig in the binding (the exact Notes URLs). */
export const healthUrls = (b: IncidentBinding): string[] => [...new Set(allRigs(b).map((r) => `http://${PI_IPS[r] ?? piIp(b)}:8000/health`))];

/** Scenario item: a sim fault (Sim §4.3). */
export const F = (faultId: string, params: FaultSpec['params'] = {}): ScenarioItem => ({ faultId, params });
/** Scenario item: a setup op (Sim §4.4.1). */
export const OP = (op: string, params: SetupOpSpec['params'] = {}): ScenarioItem => ({ op, params });

const OPEN = new Set(['new', 'acked', 'in-progress', 'escalated', 'verifying']);
/** True when an open ticket of `incidentId` binds `rigId` (wrong-move matchers are static; this ties them to the bound rig). */
export function boundTo(s: RootState, incidentId: string, rigId: unknown): boolean {
  return s.session.tickets.some((t) => t.incidentId === incidentId && OPEN.has(t.status) && (t.binding.rig === rigId || t.binding.rigs.includes(String(rigId))));
}

/** A tablet / Motion Control command on the incident's bound rig. */
export function boundRigCommand(incidentId: string, command: string): AnyEventMatcher {
  return on('rig.command', {}, (pl, s) => pl.command === command && byPlayer(pl) && boundTo(s, incidentId, pl.rigId));
}

/** MAIN / MOTOR switched on the incident's bound rig. */
export function boundRigSwitch(incidentId: string, which: 'main' | 'motor', isOn: boolean): AnyEventMatcher {
  return on('rig.switch', { which, on: isOn }, (pl, s) => boundTo(s, incidentId, pl.rigId));
}

/**
 * Every button of `(deviceType, screen)` within ±`tolMm` of the firmware truth (Sim §2.10.2, the
 * values Jared's coordinate-PR review checks) — GP INC20/INC21/INC22 `|loc − truth| ≤ 0.5`.
 */
export function locationsMatch(deviceTypeCode: string, screen: string, tolMm = 0.5, only?: readonly string[]): Condition {
  const truth = truthFor(deviceTypeCode, screen) ?? {};
  const names = Object.keys(truth).filter((n) => !only || only.includes(n));
  return c.label(
    c.all(
      ...names.flatMap((n) => {
        const t = truth[n]!;
        const loc = p.screenLocation(deviceTypeCode as DeviceTypeCode, screen, n);
        return [c.approx(loc.x, t.x, tolMm), c.approx(loc.y, t.y, tolMm)];
      }),
    ),
    `${deviceTypeCode} ${screen} within ±${tolMm} mm`,
  );
}

/** Firmware truth of one button (mm), for texts. */
export function truthMm(deviceTypeCode: string, screen: string, button: string): { x: number; y: number } | null {
  return truthFor(deviceTypeCode, screen)?.[button] ?? null;
}

/** The player's uia-remote `config.properties` was edited (local clone); pair with a `when` condition on the new value. */
export const configEdited: AnyEventMatcher = on('git.fileEdited', { repo: 'uia-remote', path: 'config.properties' });
/** The player pushed uia-remote (pair with a code-fact `when`). */
export const uiaPushed: AnyEventMatcher = on('git.pushed', { repo: 'uia-remote' });

/**
 * LabChat reply option. `response` = the NPC's answer posted after a correct reply (10–20 s, GP SR18);
 * the ticket runtime posts it to LabChat (`replyTicket`).
 */
export function reply(id: string, text: string, correct: boolean, extra: { teach?: TeachCardContent; response?: { author: string; text: string; delayS?: number } } = {}): ReplyOption {
  const out: ReplyOption & { response?: { author: string; text: string; delayS?: number } } = { id, text: P(text), correct };
  if (extra.teach) out.teach = { ...extra.teach, whatHappened: P(extra.teach.whatHappened), why: P(extra.teach.why), doInstead: P(extra.teach.doInstead) };
  if (extra.response) out.response = { ...extra.response, text: P(extra.response.text) };
  return out;
}
