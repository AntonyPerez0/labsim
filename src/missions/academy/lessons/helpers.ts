/**
 * Shared vocabulary for the Academy lesson scripts (Cur §2): ids, signal helpers and small condition
 * builders that read sim state, bus events and workstation/world `app.action`s.
 *
 * Text rule (canon "People"): authored strings never spell a team member's name — they use
 * `{{key}}` tokens (`{{jared}}`) that `index.ts` resolves from `src/content/team.ts` when the lessons
 * load. People are referred to by name or they/them only.
 *
 * World signals (`app.action` with `app: 'world'`): the world already emits `safetyCard.taken`,
 * `library.placedOnTray`, `library.compare`, `power.trace.*`, `server.gpuTagged`. Board minigames
 * (whiteboard, roadmap, history match, bolt sort, family sort) are expected to emit
 * `minigame.completed { id, correct, total, mistakes }` and the ruler `ruler.measured
 * { deviceId, button, xMm, yMm }` (listed as contract requests in the lessons hand-off).
 */
import type { RootState } from '@/core/state';
import type { LabState, OrcaDevice, OrcaRobot } from '@/sim/types';
import { c, on } from '../../types';
import type { AnyEventMatcher, Condition, NpcKey, ScriptAction, SetupOpSpec, TeachCardContent } from '../../types';

/* ───────────────────────────── ids used by several lessons ───────────────────────────── */

export const JOB = {
  regressionFlex: 'Java/uia-remote-regression-flex',
  regressionMini: 'Java/uia-remote-regression-mini',
  tetheredTax: 'Java/uia-remote-tethered-tax',
  goSdkSmoke: 'Java/go-sdk-sale-smoke',
  lazSwap: 'Java/laz-oobe-merchant-swap',
  canadaPin: 'Java/contact-canada-pin-sale',
  pigeonSwipe: 'Java/pigeon-android-sale-swipe',
  pigeonTip: 'Java/pigeon-android-tip-sale',
  iosGoSdk: 'iOS/pigeon-ios-go-sdk-smoke',
} as const;

/** Jenkins route of a job (`Java/foo` → `/job/Java/job/foo/`). */
export function jobRoute(job: string, suffix = ''): string {
  const [folder, name] = job.split('/');
  return `/job/${folder}/job/${name}/${suffix}`;
}

/** Fault ids (Sim §4.3) and setup ops (Sim §4.4.1) the lessons inject during a step. */
export const LESSON_FAULT_IDS = ['rig.testRunning', 'callus.down', 'rig.lockReleased', 'jenkins.envCase'] as const;

/* ───────────────────────────── generic signals ───────────────────────────── */

type Data = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

/** A world interaction signal (`app.action` from the 3D world). */
export function worldAction(action: string, test?: (d: Data) => boolean): Condition {
  return c.appAction('world', action, test);
}

/** A board/minigame overlay finished with every item right (`minigame.completed`). */
export function minigameDone(id: string, minCorrect?: number): Condition {
  return worldAction('minigame.completed', (d) => d.id === id && (minCorrect === undefined || num(d.correct) >= minCorrect) && (d.total === undefined || num(d.correct) >= num(d.total)));
}

/** Any of several `app.action`s from the desktop app, the desktop dashboard or the 3D tablet. */
export function appActionAny(apps: readonly string[], action: string, test?: (d: Data) => boolean): Condition {
  return c.any(...apps.map((a) => c.appAction(a, action, test)));
}

/** A tablet / dashboard button was pressed on `robot` (`rig.command`, any result, or the UI action). */
export function pressed(robot: string, command: string): Condition {
  return c.any(
    c.happened(on('rig.command', { rigId: robot, command: command as never })),
    c.appAction('tablet', 'tablet.command.sent', (d) => d.robot === robot && d.command === command),
    c.appAction('dashboard', 'dashboard.command.sent', (d) => d.robot === robot && d.command === command),
  );
}

/** Same as `pressed`, as an ordered matcher list for `c.sequence` (sim event only). */
export function cmd(robot: string, command: string): AnyEventMatcher {
  return on('rig.command', { rigId: robot, command: command as never });
}

/** A tablet tab was opened on `robot` (3D tablet or desktop dashboard). */
export function tabOpened(robot: string, tab: 'robot' | 'robot-control' | 'motion-control'): Condition {
  return c.any(
    c.appAction('tablet', 'tablet.tab.opened', (d) => d.robot === robot && d.tab === tab),
    c.appAction('dashboard', 'dashboard.tab.opened', (d) => d.robot === robot && d.tab === tab),
  );
}

/** Normalise a typed command line (Cur §2.0: equivalent flag orders / trailing whitespace accepted). */
export function normLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * A terminal command matching `re` ran (Sim `terminal.command`). `hosts` limits the host (id or
 * hostname); `ok` requires exit code 0.
 */
export function ran(re: RegExp, opts: { hosts?: readonly string[]; ok?: boolean } = {}): Condition {
  return c.happened(ranMatcher(re, opts));
}

export function ranMatcher(re: RegExp, opts: { hosts?: readonly string[]; ok?: boolean } = {}): AnyEventMatcher {
  return on('terminal.command', {}, (pl) => {
    if (!re.test(normLine(pl.line))) return false;
    if (opts.ok && pl.exitCode !== 0) return false;
    if (opts.hosts && !opts.hosts.some((h) => pl.host === h || pl.host.endsWith(h))) return false;
    return true;
  });
}

/** A Jenkins build of `job` was queued with these parameter values (case-sensitive). */
export function queued(job: string, params: Readonly<Record<string, string>> = {}): AnyEventMatcher {
  return on('jenkins.buildQueued', { jobId: job }, (pl) => Object.entries(params).every(([k, v]) => (pl.params?.[k] ?? '') === v));
}

/** A build of `job` finished with `result` (and optional failure code). */
export function finished(job: string, result: 'SUCCESS' | 'FAILURE' = 'SUCCESS', failureCode?: string): AnyEventMatcher {
  return on('jenkins.buildFinished', { jobId: job, result }, (pl) => failureCode === undefined || pl.failureCode === failureCode);
}

/** The Console Output page was opened on a finished build of `job` with this result. */
export function consoleOpened(job: string, result: 'SUCCESS' | 'FAILURE'): Condition {
  return c.appAction('jenkins', 'jenkins.console.opened', (d) => d.jobId === job && d.result === result);
}

/* ───────────────────────────── state readers (custom conditions) ───────────────────────────── */

export function robotByName(lab: LabState, name: string): OrcaRobot | undefined {
  return Object.values(lab.orca?.robots ?? {}).find((r) => r.name === name);
}

export function deviceRow(lab: LabState, id: number | null | undefined): OrcaDevice | undefined {
  return id === null || id === undefined ? undefined : lab.orca?.devices?.[id];
}

export function deviceByName(lab: LabState, name: string): OrcaDevice | undefined {
  return Object.values(lab.orca?.devices ?? {}).find((d) => d.name === name);
}

/** Every listed power load is plugged into an AC power strip (Ref §6 18V exception). */
export function loadsOnAcStrip(loadIds: readonly string[]): Condition {
  return c.custom(`ac-strip:${loadIds.join(',')}`, 'Plugged into the commercial AC power strip', (s) =>
    loadIds.every((id) => s.lab.power?.loads?.[id]?.supply?.kind === 'ac-strip'),
  );
}

/** A health-check run that happened after the owner scope started has a log line matching `re`. */
export function healthLogLine(re: RegExp): Condition {
  return c.custom(`health-log:${re.source}`, 'Health log shows the line', (s, ctx) =>
    (s.lab.orca?.healthCheck?.log ?? []).some((run) => run.atMs >= ctx.startedAtMs && run.lines.some((l) => re.test(l))),
  );
}

/** Local (working tree) file text of a repo clone, or null. */
export function localFile(s: RootState, repo: string, path: string): string | null {
  const r = (s.lab.repos as unknown as Record<string, { local?: { files?: Record<string, string> } }> | undefined)?.[repo];
  return r?.local?.files?.[path] ?? null;
}

/** Local files of a repo clone whose path ends with `/<file>`. */
export function localFilesNamed(s: RootState, repo: string, file: string): [string, string][] {
  const r = (s.lab.repos as unknown as Record<string, { local?: { files?: Record<string, string> } }> | undefined)?.[repo];
  return Object.entries(r?.local?.files ?? {}).filter(([p]) => p === file || p.endsWith(`/${file}`));
}

/** `[start, end)` 1-based line ranges of the "Zone 1" / "Zone 2" blocks of a page-object file. */
export function zoneRanges(text: string): { zone1: [number, number]; zone2: [number, number] } | null {
  const lines = text.split('\n');
  const z1 = lines.findIndex((l) => /Zone 1/.test(l));
  const z2 = lines.findIndex((l) => /Zone 2/.test(l));
  if (z1 < 0 || z2 < 0) return null;
  return { zone1: [z1 + 1, z2 + 1], zone2: [z2 + 1, lines.length + 1] };
}

/** An `intellij.editor.clicked` inside Zone `n` of a page-object file. */
export function zoneClick(fileName: string, zone: 1 | 2): AnyEventMatcher {
  return on('app.action', { app: 'intellij', action: 'intellij.editor.clicked' }, (pl, s) => {
    const d = (pl.data ?? {}) as Data;
    const path = str(d.path);
    if (!path.endsWith(`/${fileName}`)) return false;
    const text = localFile(s, str(d.repo) || 'uia-remote', path);
    const z = text ? zoneRanges(text) : null;
    const line = num(d.line);
    if (!z) return zone === 1 ? /Zone 1|BySelector/.test(str(d.lineText)) : /Zone 2|public .*\(/.test(str(d.lineText));
    const [a, b] = zone === 1 ? z.zone1 : z.zone2;
    return line >= a && line < b;
  });
}

/* ───────────────────────────── script helpers ───────────────────────────── */

export const say = (speaker: NpcKey, text: string): ScriptAction => ({ do: 'say', speaker, text });
export const bark = (speaker: NpcKey, text: string): ScriptAction => ({ do: 'bark', speaker, text });

/** Apply one or more scenario items (fault or setup op) mid-lesson (Sim §4.4.2 "During the lesson"). */
export function inject(...items: ({ faultId: string; params?: Record<string, string | number | boolean> } | SetupOpSpec)[]): ScriptAction {
  return { do: 'setup', setup: { scenario: items } };
}

/** Clear every active (uncleared) fault of these ids, as the mentor (e.g. Jared's fix). */
export function clearFaults(...faultIds: string[]): ScriptAction {
  return {
    do: 'sim',
    run: (sim, ctx) => {
      for (const f of ctx.lab.faults ?? []) if (!f.cleared && faultIds.includes(f.faultId)) sim.faults.clear(f.id, 'mentor');
    },
  };
}

/** Teach Card shorthand (GP §5.5). */
export function teach(whatHappened: string, why: string, doInstead: string, extra: Partial<TeachCardContent> = {}): TeachCardContent {
  return { whatHappened, why, doInstead, ...extra };
}
