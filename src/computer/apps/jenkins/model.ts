/**
 * Jenkins page model (Apps §3): route parsing, job/build lookups, weather, permalinks, gating.
 * Pure helpers over `LabState['jenkins']` — no React.
 */
import { APP_ROUTES, matchRoute, fmtDuration } from '@/computer/apps';
import type { BuildResult, JenkinsBuild, JenkinsJob, JenkinsState } from '@/sim/types';
import type { BallKind, WeatherKind } from './icons';

export type JkPage =
  | { kind: 'dashboard' }
  | { kind: 'view'; view: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'job'; jobId: string; folder: string; job: string }
  | { kind: 'buildWithParameters'; jobId: string; folder: string; job: string }
  | { kind: 'configure'; jobId: string; folder: string; job: string }
  | { kind: 'move'; jobId: string; folder: string; job: string }
  | { kind: 'changes'; jobId: string; folder: string; job: string }
  | { kind: 'fullStageView'; jobId: string; folder: string; job: string }
  | { kind: 'pipelineSyntax'; jobId: string; folder: string; job: string }
  | { kind: 'build'; jobId: string; folder: string; job: string; number: string }
  | { kind: 'console'; jobId: string; folder: string; job: string; number: string }
  | { kind: 'buildParameters'; jobId: string; folder: string; job: string; number: string }
  | { kind: 'buildHistory' }
  | { kind: 'people' }
  | { kind: 'manage' }
  | { kind: 'nodes' }
  | { kind: 'about' }
  | { kind: 'search'; q: string }
  | { kind: 'denied'; permission: string; what: string }
  | { kind: 'notFound' };

const R = APP_ROUTES.jenkins;

/** Order matters: literal job sub-pages before the `:number` build routes. */
const JOB_SUBPAGES: [keyof typeof R, JkPage['kind']][] = [
  ['buildWithParameters', 'buildWithParameters'],
  ['configure', 'configure'],
  ['move', 'move'],
  ['changes', 'changes'],
  ['fullStageView', 'fullStageView'],
  ['pipelineSyntax', 'pipelineSyntax'],
  ['console', 'console'],
  ['buildParameters', 'buildParameters'],
  ['build', 'build'],
  ['job', 'job'],
];

/** Pages that exist in real Jenkins but the non-admin Engineer may not use (Apps §3.9). */
const DENIED: { re: RegExp; permission: string; what: string }[] = [
  { re: /^\/view\/[^/]+\/newView\/?$|^\/newView\/?$/, permission: 'View/Create', what: 'New View' },
  { re: /^\/(view\/[^/]+\/)?newJob\/?$|^\/job\/[^/]+\/newJob\/?$/, permission: 'Job/Create', what: 'New Item' },
  { re: /\/delete\/?$/, permission: 'Job/Delete', what: 'Delete' },
  { re: /\/confirm-rename\/?$/, permission: 'Job/Configure', what: 'Rename' },
  { re: /\/replay\/?$/, permission: 'Run/Replay', what: 'Replay' },
  { re: /\/restart\/?$/, permission: 'Job/Build', what: 'Restart from Stage' },
  { re: /\/editDescription\/?$|\/configure-build\/?$/, permission: 'Run/Update', what: 'Edit Build Information' },
  { re: /^\/job\/[^/]+\/configure\/?$/, permission: 'Job/Configure', what: 'Configure' },
  { re: /^\/manage\/[^/]+/, permission: 'Overall/Administer', what: 'Manage Jenkins' },
  { re: /^\/me\//, permission: 'Overall/Administer', what: 'My Views' },
];

export function parseRoute(route: string): JkPage {
  const path = route.split('?')[0] || '/';
  if (path === '/' || path === '') return { kind: 'dashboard' };
  const q = matchRoute(R.search, route);
  if (q) return { kind: 'search', q: q.query.q ?? '' };
  if (matchRoute(R.buildHistory, route)) return { kind: 'buildHistory' };
  if (matchRoute(R.people, route)) return { kind: 'people' };
  if (matchRoute(R.about, route)) return { kind: 'about' };
  if (matchRoute(R.manage, route)) return { kind: 'manage' };
  if (matchRoute(R.nodes, route) || /^\/computer\/[^/]+\/?$/.test(path)) return { kind: 'nodes' };
  for (const d of DENIED) if (d.re.test(path)) return { kind: 'denied', permission: d.permission, what: d.what };
  const v = matchRoute(R.view, route);
  if (v) return v.params.view.toLowerCase() === 'all' ? { kind: 'dashboard' } : { kind: 'view', view: v.params.view };
  for (const [key, kind] of JOB_SUBPAGES) {
    const m = matchRoute(R[key], route);
    if (!m) continue;
    const { folder, job } = m.params;
    const base = { jobId: `${folder}/${job}`, folder, job };
    if (kind === 'build' || kind === 'console' || kind === 'buildParameters') return { kind, ...base, number: m.params.number } as JkPage;
    return { kind, ...base } as JkPage;
  }
  const f = matchRoute(R.folder, route);
  if (f) return { kind: 'folder', folder: f.params.folder };
  return { kind: 'notFound' };
}

/** `/job/Java/job/uia-remote-regression-flex/` */
export function jobUrl(jobId: string, suffix = ''): string {
  const i = jobId.indexOf('/');
  const folder = jobId.slice(0, i);
  const name = jobId.slice(i + 1);
  return `/job/${encodeURIComponent(folder)}/job/${encodeURIComponent(name)}/${suffix}`;
}

export function buildUrl(b: { jobId: string; number: number }, suffix = ''): string {
  return jobUrl(b.jobId, `${b.number}/${suffix}`);
}

/** `Java » uia-remote-regression-flex` */
export function jobDisplayName(jobId: string): string {
  return jobId.replace('/', ' » ');
}

/** Visible jobs after lesson gating (Apps §1.11 `restrictions.jenkins.visibleJobs`). */
export function visibleJobs(j: JenkinsState, gate: string[] | null): JenkinsJob[] {
  return Object.values(j.jobs)
    .filter((job) => job.exists !== false)
    .filter((job) => !gate || gate.includes(job.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function jobsInView(j: JenkinsState, view: string, gate: string[] | null): JenkinsJob[] {
  const def = j.views[view];
  if (!def) return [];
  let re: RegExp;
  try {
    re = new RegExp(def.include);
  } catch {
    return [];
  }
  return visibleJobs(j, gate).filter((job) => re.test(job.id));
}

export function folders(j: JenkinsState): string[] {
  const set = new Set<string>(['Java', 'iOS']);
  for (const job of Object.values(j.jobs)) if (job.exists !== false) set.add(job.folder);
  return [...set];
}

/** Builds of a job, newest first. */
export function jobBuilds(j: JenkinsState, job: JenkinsJob): JenkinsBuild[] {
  const out: JenkinsBuild[] = [];
  for (const id of job.buildIds) {
    const b = j.builds[id];
    if (b) out.push(b);
  }
  return out.sort((a, b) => b.number - a.number);
}

export function resolveBuild(j: JenkinsState, job: JenkinsJob, number: string): JenkinsBuild | null {
  const builds = jobBuilds(j, job);
  const fin = builds.filter((b) => b.state === 'finished');
  switch (number) {
    case 'lastBuild':
      return builds[0] ?? null;
    case 'lastSuccessfulBuild':
    case 'lastStableBuild':
      return fin.find((b) => b.result === 'SUCCESS') ?? null;
    case 'lastFailedBuild':
      return fin.find((b) => b.result === 'FAILURE') ?? null;
    case 'lastUnsuccessfulBuild':
      return fin.find((b) => b.result !== 'SUCCESS') ?? null;
    case 'lastCompletedBuild':
      return fin[0] ?? null;
    default: {
      const n = Number(number);
      return builds.find((b) => b.number === n) ?? j.builds[`${job.id}#${n}`] ?? null;
    }
  }
}

export function resultBall(result: BuildResult | null): BallKind {
  switch (result) {
    case 'SUCCESS':
      return 'success';
    case 'FAILURE':
      return 'failure';
    case 'UNSTABLE':
      return 'unstable';
    case 'ABORTED':
      return 'aborted';
    default:
      return 'notbuilt';
  }
}

/** Ball for a build: running builds keep the previous result's colour (Apps §3.1). */
export function buildBall(j: JenkinsState, b: JenkinsBuild): { kind: BallKind; running: boolean } {
  if (b.state === 'queued') return { kind: 'queued', running: false };
  if (b.state === 'running') {
    const job = j.jobs[b.jobId];
    const prev = job ? jobBuilds(j, job).find((x) => x.number < b.number && x.state === 'finished') : null;
    return { kind: prev ? resultBall(prev.result) : 'notbuilt', running: true };
  }
  return { kind: resultBall(b.result), running: false };
}

export function jobBall(j: JenkinsState, job: JenkinsJob): { kind: BallKind; running: boolean } {
  if (job.disabled) return { kind: 'disabled', running: false };
  const builds = jobBuilds(j, job);
  const last = builds[0];
  if (!last) return { kind: 'notbuilt', running: false };
  if (last.state !== 'finished') {
    const prev = builds.find((b) => b.state === 'finished');
    return { kind: prev ? resultBall(prev.result) : last.state === 'queued' ? 'queued' : 'notbuilt', running: last.state === 'running' || !!prev };
  }
  return { kind: resultBall(last.result), running: false };
}

/** Weather from the last 5 finished builds (Apps §3.1). */
export function jobWeather(j: JenkinsState, jobs: JenkinsJob[]): { kind: WeatherKind; title: string; score: number } | null {
  const fin = jobs.flatMap((job) => jobBuilds(j, job).filter((b) => b.state === 'finished').slice(0, 5));
  if (!fin.length) return null;
  const total = jobs.length === 1 ? fin.length : fin.length;
  const failed = fin.filter((b) => b.result !== 'SUCCESS').length;
  const ok = total - failed;
  const pct = Math.round((ok / total) * 100);
  const ratio = ok / total;
  const kind: WeatherKind = ratio >= 1 ? 'sunny' : ratio >= 0.8 ? 'partly' : ratio >= 0.6 ? 'cloudy' : ratio >= 0.4 ? 'rain' : 'storm';
  const title =
    failed === 0
      ? `Build stability: No recent builds failed. ${pct}%`
      : `Build stability: ${failed} out of the last ${total} builds failed. ${pct}%`;
  return { kind, title, score: pct };
}

/** `2 hr 4 min` since a game time. */
export function since(ms: number | null, nowMs: number): string {
  if (ms == null) return 'N/A';
  return fmtDuration(Math.max(0, nowMs - ms));
}

/** Game-ms duration of a build (running: elapsed so far). */
export function buildDurationMs(b: JenkinsBuild, nowMs: number): number {
  if (b.startedMs == null) return 0;
  return Math.max(0, (b.finishedMs ?? nowMs) - b.startedMs);
}

/** `4s`, `53s`, `1min 2s`, `1h 4min` — Stage View cell format. */
export function fmtStage(ms: number | null): string {
  if (ms == null) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 1) return `${Math.max(0, Math.round(ms))}ms`;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}min ${s % 60}s` : `${m}min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

export interface Permalink {
  label: string;
  build: JenkinsBuild;
}

export function permalinks(j: JenkinsState, job: JenkinsJob): Permalink[] {
  const out: Permalink[] = [];
  const add = (label: string, key: string) => {
    const b = resolveBuild(j, job, key);
    if (b) out.push({ label, build: b });
  };
  add('Last build', 'lastBuild');
  add('Last stable build', 'lastStableBuild');
  add('Last successful build', 'lastSuccessfulBuild');
  add('Last failed build', 'lastFailedBuild');
  add('Last unsuccessful build', 'lastUnsuccessfulBuild');
  add('Last completed build', 'lastCompletedBuild');
  return out;
}

/** "Started by user Engineer" / "Started by timer" / "Started by upstream project …" */
export function startedBy(triggeredBy: string, playerName: string): string {
  if (triggeredBy === 'player') return `Started by user ${playerName || 'Engineer'}`;
  if (triggeredBy === 'timer') return 'Started by timer';
  if (triggeredBy.startsWith('upstream:')) return `Started by upstream project "${triggeredBy.slice(9)}"`;
  if (triggeredBy === 'scm' || triggeredBy === 'github') return 'Started by GitHub push';
  return `Started by user ${triggeredBy}`;
}

/** Index of the console line `[Pipeline] stage (<name>)`, or -1. */
export function stageLineIndex(lines: readonly string[], stage: string): number {
  return lines.findIndex((l) => l === `[Pipeline] stage (${stage})` || l.startsWith(`[Pipeline] stage (${stage})`));
}

/** Last non-[Pipeline] console line within a stage (failed-cell tooltip). */
export function lastLineOfStage(lines: readonly string[], stage: string): string {
  const i = stageLineIndex(lines, stage);
  if (i < 0) return '';
  let end = lines.length;
  for (let k = i + 1; k < lines.length; k++) {
    if (lines[k]!.startsWith('[Pipeline] stage (')) {
      end = k;
      break;
    }
  }
  for (let k = end - 1; k > i; k--) {
    const l = lines[k]!;
    if (!l.startsWith('[Pipeline]') && l.trim()) return l;
  }
  return '';
}

/** `Tests: 2, Failures: 0, …` → "2 tests, 0 failures". */
export function testResult(lines: readonly string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^Tests:\s*(\d+),\s*Failures:\s*(\d+)/.exec(lines[i]!);
    if (m) return `${m[1]} tests, ${m[2]} failure${m[2] === '1' ? '' : 's'}`;
  }
  return null;
}

/** Search entries (Apps §3.7). */
export interface SearchHit {
  id: string;
  label: string;
  kind: 'job' | 'folder' | 'view' | 'build';
  route: string;
}

export function search(j: JenkinsState, q: string, gate: string[] | null): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (const f of folders(j)) if (f.toLowerCase().includes(needle)) hits.push({ id: f, label: f, kind: 'folder', route: `/job/${encodeURIComponent(f)}/` });
  for (const v of Object.keys(j.views)) if (v.toLowerCase().includes(needle)) hits.push({ id: `view:${v}`, label: `${v} (view)`, kind: 'view', route: v === 'All' ? '/' : `/view/${encodeURIComponent(v)}/` });
  for (const job of visibleJobs(j, gate)) {
    if (job.id.toLowerCase().includes(needle) || job.name.toLowerCase().includes(needle)) hits.push({ id: job.id, label: jobDisplayName(job.id), kind: 'job', route: jobUrl(job.id) });
  }
  const bm = /^#?(\d{2,})$/.exec(needle);
  if (bm) {
    for (const b of Object.values(j.builds)) {
      if (String(b.number) === bm[1] && (!gate || gate.includes(b.jobId))) hits.push({ id: b.id, label: `${jobDisplayName(b.jobId)} #${b.number}`, kind: 'build', route: buildUrl(b) });
    }
  }
  return hits.slice(0, 20);
}

/** Static descriptions for folders (Apps §3.2). */
export const FOLDER_DESCRIPTIONS: Record<string, string> = {
  Java: 'Legacy platform split: Java jobs (Android, Windows, REST, Go). iOS jobs live in the iOS folder.',
  iOS: 'Legacy platform split: iOS jobs (Pigeon on iOS). Everything else lives in the Java folder.',
};

/** Parameter descriptions when the sim's are empty (Apps §3.4). */
export const PARAM_DESCRIPTIONS: Record<string, string> = {
  DEVICE_TYPE: 'Orca DeviceType enum value, ALL CAPS (e.g. FLEX_3). Blank = any.',
  ROBOT_NAME: 'Exact Orca robot Name (lowercase). Blank = any matching Available robot.',
  MERCHANT: 'Merchant Config name',
  CARD_PROFILE: 'Card profile name(s), comma separated',
  BACKEND_ENV: 'Backend environment (DEV1, DEV2, STG, QA, INT)',
  BRANCH: 'Git branch',
};

/** Masked parameter names (secrets) on the Parameters page. */
export function isSecretParam(name: string): boolean {
  return /SECRET|PASSWORD|API_KEY|TOKEN/i.test(name);
}
