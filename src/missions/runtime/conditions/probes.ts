/**
 * Probe resolver — the ONLY code that maps the GP §3.3 DSL state paths (`p.*`) onto the live
 * `LabState` / session. Values are translated into the DSL vocabulary (`'RUNNING'`, `'LINKED'`, `'UP'` …);
 * missing entities yield `null` (and `exists` probes `false`).
 */
import type { RootState, TicketState } from '@/core/state';
import type { GitCommit, LabState } from '@/sim/types';
import type { IncidentBinding, ProbeSpec, ProbeValue } from '../../types';
import { PIPELINE_JOBS } from '../arcade/pipelineJobs';
import {
  cardProfileByName,
  deviceRowById,
  deviceRowByName,
  hostById,
  jobBuilds,
  jsonPointer,
  lastFinishedBuild,
  merchantById,
  merchantByName,
  parseProperties,
  robotByName,
  robotNameOf,
  runtimeDevice,
  screenByTypeAndName,
  screenCompareByName,
  urlHost,
} from '../lookups';

export interface ProbeContext {
  ticket: TicketState | null;
  binding: IncidentBinding | null;
  counter(name: string): number;
  truth(key: string): string | number | boolean | null;
  /** Game ms when the activity started (PRs "opened in this activity"). */
  activityStartMs: number;
  /** Who merged a PR (from the event log), or null. */
  prMergedBy(repo: string, pr: number): string | null;
}

const onOff = (b: boolean): 'ON' | 'OFF' => (b ? 'ON' : 'OFF');

export function resolveProbe(spec: ProbeSpec, s: RootState, ctx: ProbeContext): ProbeValue {
  const lab = s.lab;
  try {
    switch (spec.p) {
      case 'orca.robot':
        return robotField(lab, spec.robot, spec.field);
      case 'orca.robot.url': {
        const r = robotByName(lab, spec.robot);
        if (!r) return null;
        const v = { adb: r.adbServiceUrl, camera: r.cameraStreamUrl, dip: r.dipUrl, tap: r.tapUrl, swipe: r.swipeUrl }[spec.kind];
        return v ?? null;
      }
      case 'orca.device': {
        const d = deviceRowByName(lab, spec.device);
        if (spec.field === 'exists') return !!d && !d.retired;
        if (!d) return null;
        return spec.field === 'type' ? d.deviceType : spec.field === 'serial' ? d.serial : d.ip;
      }
      case 'orca.screenLocation': {
        const screen = screenByTypeAndName(lab, spec.deviceType, spec.screen);
        const loc = screen ? Object.values(lab.orca.screenLocations).find((l) => l.screenId === screen.id && l.button === spec.button) : undefined;
        if (spec.field === 'exists') return !!loc;
        if (!loc) return null;
        return spec.field === 'x' ? loc.xMm : loc.yMm;
      }
      case 'orca.screenCompare': {
        const c = screenCompareByName(lab, spec.name);
        if (spec.field === 'exists') return !!c;
        if (!c) return spec.field === 'deprecated' ? false : null;
        switch (spec.field) {
          case 'x':
            return c.bbox.x;
          case 'y':
            return c.bbox.y;
          case 'w':
            return c.bbox.w;
          case 'h':
            return c.bbox.h;
          case 'expected':
            return c.expectedText;
          case 'deprecated':
            return c.deprecated;
        }
        return null;
      }
      case 'orca.merchant': {
        const m = merchantByName(lab, spec.merchant);
        if (!m) return null;
        const v = (m as unknown as Record<string, unknown>)[spec.field];
        return scalar(v);
      }
      case 'orca.cardProfile': {
        const c = cardProfileByName(lab, spec.profile);
        if (spec.field === 'exists') return !!c;
        if (!c) return null;
        return spec.field === 'kind' ? c.entry : spec.field === 'trackData' ? c.trackData : c.gortPath;
      }
      case 'orca.http': {
        const app = lab.orca.app;
        if (!app.up) return 503;
        return app.dbConnected === false ? 500 : 200;
      }
      case 'hw.pi': {
        const h = hostById(lab, spec.host);
        if (!h) return null;
        if (spec.field === 'power') return onOff(h.os !== 'OFF' && h.power !== 'off');
        if (spec.field === 'os') return h.os ?? (h.power === 'off' ? 'OFF' : h.power === 'crashed' ? 'HUNG' : h.power === 'booting' ? 'BOOTING' : 'RUNNING');
        return h.eth ?? (h.ethernet ? 'LINKED' : 'UNPLUGGED');
      }
      case 'svc': {
        const h = hostById(lab, spec.host);
        if (!h) return null;
        const svc = h.services?.[spec.service];
        return svc?.running && h.os === 'RUNNING' ? 'UP' : 'DOWN';
      }
      case 'hw.fuse': {
        const f = lab.power?.fuses?.[spec.fuse];
        if (!f) return spec.field === 'removed' ? false : null;
        if (spec.field === 'state') return f.blown ? 'BLOWN' : 'OK';
        if (spec.field === 'rating') return f.removed ? null : f.ratingA;
        if (spec.field === 'labelRating') return f.labelA ?? f.ratingA;
        return !!f.removed;
      }
      case 'hw.outlet': {
        const strip = lab.power?.strips?.[spec.strip];
        return strip?.loads?.[spec.outlet - 1] ?? null;
      }
      case 'hw.dcTerminal':
        return lab.power?.terminals?.[spec.terminal]?.plugged ?? null;
      case 'hw.box': {
        const h = hostById(lab, spec.box);
        if (!h) return null;
        if (spec.field === 'power') return onOff(h.os !== 'OFF' && h.power !== 'off');
        return Math.round((h.diskTotalGb - (h.diskUsedGb ?? (h.diskTotalGb * h.diskUsedPct) / 100)) * 10) / 10;
      }
      case 'hw.rig':
        return rigField(lab, spec.rig, spec.field);
      case 'hw.collis': {
        const c = lab.collis?.[spec.collis];
        if (!c) return null;
        if (spec.field === 'power') return c.powered ? (c.supply?.kind === 'dc-rail' ? 'DC' : 'AC') : 'OFF';
        if (spec.field === 'ribbon') return c.ribbonConnected ? 'SEATED' : 'UNSEATED';
        return c.state ?? (c.damaged ? 'FRIED' : 'OK');
      }
      case 'hw.device':
        return deviceField(lab, spec.device, spec.field);
      case 'hw.camera':
        return cameraField(lab, spec.camera, spec.field);
      case 'link': {
        const mfd = runtimeDevice(lab, spec.mfd);
        const cfd = runtimeDevice(lab, spec.cfd);
        if (!mfd || !cfd) return 'DOWN';
        if (mfd.tetheredTo && mfd.tetheredTo !== cfd.id) return 'DOWN';
        return mfd.payDisplayLink ?? cfd.payDisplayLink ?? 'DOWN';
      }
      case 'jenkins.job': {
        const job = lab.jenkins?.jobs?.[spec.job];
        if (spec.field === 'exists') return !!job && job.exists !== false;
        if (!job) return null;
        if (spec.field === 'folder') return job.folder;
        if (spec.field === 'script') return job.script ?? null;
        const last = lastFinishedBuild(lab, spec.job);
        if (spec.field === 'lastResult') return last?.result ?? null;
        if (spec.field === 'lastRobot') return robotNameOf(lab, last?.robotId);
        return last?.id ?? null;
      }
      case 'jenkins.lastParam': {
        const last = lastFinishedBuild(lab, spec.job) ?? jobBuilds(lab, spec.job)[0];
        return last?.params?.[spec.param] ?? null;
      }
      case 'jenkins.greenStreak': {
        const jobId = PIPELINE_JOBS[spec.job as keyof typeof PIPELINE_JOBS] ?? spec.job;
        let n = 0;
        for (const b of jobBuilds(lab, jobId)) {
          if (b.state !== 'finished') continue;
          if (spec.robot && robotNameOf(lab, b.robotId) !== spec.robot) continue;
          if (b.result !== 'SUCCESS') break;
          n++;
        }
        return n;
      }
      case 'adb.connections':
        return (lab.workstation?.adbConnections ?? []).filter((c) => c.state === 'device').map((c) => c.target);
      case 'prop':
        return propValue(lab, spec.file, spec.key);
      case 'fs': {
        const files = spec.host === 'ws' || spec.host === 'workstation' || spec.host === 'ws-17' ? lab.workstation?.files : hostById(lab, spec.host)?.files;
        const v = files?.[spec.path];
        return spec.field === 'exists' ? v !== undefined : (v ?? null);
      }
      case 'git.file': {
        const text = fileAtRef(lab, spec.repo, spec.path, spec.ref);
        if (spec.field === 'exists') return text !== null;
        if (spec.field === 'contents') return text;
        if (text === null) return false;
        try {
          JSON.parse(text);
          return true;
        } catch {
          return false;
        }
      }
      case 'git.json': {
        const text = fileAtRef(lab, spec.repo, spec.path, spec.ref);
        if (text === null) return null;
        try {
          const v = jsonPointer(JSON.parse(text), spec.pointer);
          if (v === undefined) return null;
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean | null);
        } catch {
          return null;
        }
      }
      case 'git.pr':
        return prField(lab, spec.repo, spec.pr, spec.field, ctx);
      case 'code.fact':
        return codeFact(lab, spec.fact, spec.subject);
      case 'ide.localRun': {
        const run = latestLocalRun(lab, spec.test);
        if (spec.field === 'result') return !run ? 'NONE' : run.state === 'running' ? 'RUNNING' : run.passed ? 'PASS' : 'FAIL';
        if (!run) return spec.field === 'overlappedJenkins' ? false : null;
        return spec.field === 'robot' ? run.robotName : !!run.overlappedJenkins;
      }
      case 'ide.localRunStreak': {
        const runs = localRuns(lab, spec.test).filter((r) => r.state === 'finished');
        let n = 0;
        for (const r of runs) {
          if (!r.passed) break;
          n++;
        }
        return n;
      }
      case 'coworker.deviceIdle':
        return coworkerIdle(lab);
      case 'ticket':
        return ticketField(ctx.ticket, spec.field);
      case 'ticket.bug':
        return (ctx.ticket?.bug?.[spec.field] as string | number | undefined) ?? null;
      case 'ticket.match':
        return ctx.ticket?.matches?.[spec.left] ?? null;
      case 'counter':
        return ctx.counter(spec.name);
      case 'truth':
        return ctx.truth(spec.key);
      case 'flag':
        return scalar((lab.flags as unknown as Record<string, unknown>)?.[spec.flag]);
      case 'var':
        return s.session.vars[spec.name] ?? null;
      case 'player':
        return playerField(s, spec.field);
      case 'overlay':
        return s.ui.overlay.kind;
      case 'path':
        return scalarOrList(getPath(s, spec.path));
    }
  } catch (err) {
    console.warn('[missions] probe failed', spec, err);
  }
  return null;
}

function scalar(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

function scalarOrList(v: unknown): ProbeValue {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return scalar(v);
}

function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function robotField(lab: LabState, name: string, field: string): ProbeValue {
  const r = robotByName(lab, name);
  if (!r) return field === 'capabilities' ? [] : null;
  switch (field) {
    case 'status':
      return r.status;
    case 'name':
      return r.name;
    case 'hrn':
      return r.humanReadableName;
    case 'reservedBy':
      return r.status === 'RESERVED' ? r.reservedBy : null;
    case 'deviceId':
      return deviceRowById(lab, r.deviceId)?.name ?? null;
    case 'mfdDeviceId':
      return deviceRowById(lab, r.mfdDeviceId)?.name ?? null;
    case 'cfdDeviceId':
      return deviceRowById(lab, r.cfdDeviceId)?.name ?? null;
    case 'offsetX':
      return r.offsetXMm;
    case 'offsetY':
      return r.offsetYMm;
    case 'capabilities':
      return (r.capabilityIds ?? []).map((id) => lab.orca.capabilities[id]?.name).filter((n): n is string => !!n);
    case 'lastHealthAt':
      return r.lastHealth?.atMs ?? r.lastHealthCheckMs ?? null;
    case 'lastHealthHttp':
      return r.lastHealth ? r.lastHealth.http : r.lastHealthCheckOk === null || r.lastHealthCheckOk === undefined ? null : r.lastHealthCheckOk ? 200 : null;
    case 'lastHealthError':
      return r.lastHealth?.error ?? null;
    case 'checkedOutBy':
      return r.checkout ? (r.checkout.kind === 'local' ? `local:${r.checkout.buildId}` : r.checkout.buildId) : null;
  }
  return null;
}

function rigField(lab: LabState, rigId: string, field: string): ProbeValue {
  const r = lab.rigs?.[rigId];
  if (!r) return null;
  switch (field) {
    case 'main':
      return onOff(r.mainSwitch);
    case 'motor':
      return onOff(r.motorSwitch);
    case 'steppersEnabled':
      return r.steppersEnabled;
    case 'homed':
      return r.gantry.homed;
    case 'magLock':
      return r.magneticLock.engaged ? 'ENGAGED' : 'RELEASED';
    case 'banner':
      return r.banner.toUpperCase();
    case 'solenoidConnector':
      return r.solenoidConnector ?? 'SEATED';
    case 'dipArmAligned':
      return r.dipArmAligned ?? true;
    case 'cradle':
      return r.cradle ?? 'OK';
    case 'motionHost':
      return r.motionHost ?? 'PI';
    case 'lockedOut':
      return !!(r.dashboardLocked || r.lockedBy);
    case 'door':
      return (r.door ?? 'closed').toUpperCase();
  }
  return null;
}

function deviceField(lab: LabState, id: string, field: string): ProbeValue {
  const d = runtimeDevice(lab, id);
  if (!d) return null;
  switch (field) {
    case 'power':
      return onOff(d.power === 'on' || d.power === 'booting');
    case 'state':
      return d.state ?? (d.power === 'fried' ? 'FRIED' : d.power === 'booting' ? 'BOOTING' : d.dead ? 'DEAD' : 'OK');
    case 'adbTcpPort':
      return d.adbTcpPort ?? null;
    case 'activeMerchant':
      return merchantById(lab, d.merchantConfigId)?.name ?? null;
    case 'psuOn': {
      const load = lab.power?.loads?.[`psu-${d.orcaDeviceName}`];
      return load ? load.powered : d.supply?.kind !== 'none' && d.power !== 'off';
    }
    case 'screen':
      return d.display?.screen ?? 'off';
    case 'secondaryScreen':
      return d.secondaryDisplay?.screen ?? null;
  }
  return null;
}

function cameraField(lab: LabState, camera: string, field: 'svc' | 'usb'): ProbeValue {
  const rigs = Object.values(lab.rigs ?? {});
  const rig = rigs.find((r) => r.id === camera || r.webcam?.cameraId === camera || `cam-${r.id}` === camera);
  if (field === 'usb') return rig ? (rig.webcam.connected ? 'SEATED' : 'UNSEATED') : null;
  const robot = rig ? robotByName(lab, rig.id) : null;
  const ip = urlHost(robot?.cameraStreamUrl);
  const host = ip ? hostById(lab, ip) : rig?.piHostId ? hostById(lab, rig.piHostId) : hostById(lab, camera);
  if (!host) return null;
  const svc = host.services?.['camera-stream'];
  return svc?.running && host.os === 'RUNNING' ? 'UP' : 'DOWN';
}

function propValue(lab: LabState, file: string, key: string): string | null {
  if (file === 'config') {
    const v = lab.workstation?.configProperties?.[key];
    if (v !== undefined) return v;
    const text = lab.repos?.['uia-remote']?.local?.files?.['config.properties'];
    return parseProperties(text)[key] ?? null;
  }
  if (file === 'alexConfig') {
    const text = Object.entries(lab.workstation?.files ?? {}).find(([p]) => p.includes('CodeWithMe') && p.endsWith('config.properties'))?.[1];
    return parseProperties(text)[key] ?? null;
  }
  const sep = file.indexOf(':');
  if (sep > 0) {
    const repo = file.slice(0, sep);
    const path = file.slice(sep + 1);
    const text = fileAtRef(lab, repo, path, 'local') ?? fileAtRef(lab, repo, path, 'main');
    return parseProperties(text)[key] ?? null;
  }
  const text = lab.workstation?.files?.[file];
  return parseProperties(text)[key] ?? null;
}

/** File contents of a repo at a ref (`main`/default branch, `local` working tree, or a branch name). */
export function fileAtRef(lab: LabState, repoId: string, path: string, ref: string): string | null {
  const repo = (lab.repos as Record<string, LabState['repos'][keyof LabState['repos']]> | undefined)?.[repoId];
  if (!repo) return null;
  if (ref === 'local' || ref === 'working') return repo.local?.files?.[path] ?? null;
  if (ref === 'main' || ref === repo.defaultBranch) return repo.files?.[path] ?? null;
  let sha: string | null | undefined = repo.branches?.[ref];
  const seen = new Set<string>();
  while (sha && !seen.has(sha)) {
    seen.add(sha);
    const commit: GitCommit | undefined = repo.commits?.[sha];
    if (!commit) break;
    if (path in commit.changes) return commit.changes[path] ?? null;
    sha = commit.parent;
  }
  return repo.files?.[path] ?? null;
}

function prField(lab: LabState, repoId: string, prRef: number | 'latest', field: string, ctx: ProbeContext): ProbeValue {
  const repo = (lab.repos as Record<string, LabState['repos'][keyof LabState['repos']]> | undefined)?.[repoId];
  const prs = repo?.pullRequests ?? [];
  const pr =
    prRef === 'latest'
      ? [...prs].filter((p) => p.author === 'player' && p.createdMs >= ctx.activityStartMs).sort((a, b) => b.number - a.number)[0]
      : prs.find((p) => p.number === prRef);
  if (!pr) return field === 'state' || field === 'verdict' ? 'NONE' : field === 'commentTags' ? [] : null;
  switch (field) {
    case 'state':
      return pr.state.toUpperCase();
    case 'verdict':
      return pr.verdict === 'APPROVED' ? 'APPROVE' : pr.verdict === 'CHANGES_REQUESTED' ? 'REQUEST_CHANGES' : pr.comments?.length ? 'COMMENT' : 'NONE';
    case 'commentTags':
      return Array.from(new Set((pr.comments ?? []).map((c) => c.reason).filter((r): r is string => !!r)));
    case 'mergedBy':
      return pr.state === 'merged' ? (ctx.prMergedBy(repoId, pr.number) ?? null) : null;
    case 'number':
      return pr.number;
  }
  return null;
}

function localRuns(lab: LabState, test: string) {
  return Object.values(lab.local?.runs ?? {})
    .filter((r) => r.testName === test || r.testPath.endsWith(`/${test}.java`) || r.testPath === test)
    .sort((a, b) => b.startedMs - a.startedMs || b.id.localeCompare(a.id));
}

function latestLocalRun(lab: LabState, test: string) {
  return localRuns(lab, test)[0] ?? null;
}

function coworkerIdle(lab: LabState): boolean {
  const ws = lab.workstation;
  if (ws?.adbConnections?.some((c) => c.coworker && c.state === 'device')) return false;
  const busy = (handles: { mfd: string | null; cfd: string | null } | undefined) =>
    !!handles && [handles.mfd, handles.cfd].some((h) => !!h && h.startsWith('10.42.60.'));
  for (const run of Object.values(lab.local?.runs ?? {})) if (run.state === 'running' && busy(run.runner?.handles)) return false;
  for (const b of Object.values(lab.jenkins?.builds ?? {})) if (b.state === 'running' && busy(b.runner?.handles)) return false;
  return true;
}

function ticketField(t: TicketState | null, field: string): ProbeValue {
  if (!t) return null;
  switch (field) {
    case 'reply':
      return t.reply;
    case 'call':
      return t.call?.optionId ?? null;
    case 'callCorrect':
      return t.call ? t.call.correct : null;
    case 'escalationCause':
      return t.escalation?.cause ?? null;
    case 'escalationEndpoint':
      return t.escalation?.endpoint ?? null;
    case 'status':
      return t.status;
    case 'hintTier':
      return t.hintTier;
  }
  return null;
}

function playerField(s: RootState, field: string): ProbeValue {
  const sess = s.session;
  switch (field) {
    case 'location':
      return sess.player.locationId;
    case 'lookingAt':
      return sess.player.lookingAt;
    case 'activeTool':
      return sess.activeTool;
    case 'carrying':
      return sess.items.carried?.id ?? null;
    case 'crouched':
      return sess.player.crouched;
    case 'fuseRating':
      return sess.toolModes.fuseRating;
  }
  return null;
}

/* ───────────────────────────── Code facts (Sim §3.19.6, regex-level) ───────────────────────────── */

const FACT_ALIASES: Record<string, string> = {
  waitForScreen: 'CF01',
  waitForScreenBeforeClick: 'CF01',
  sleepWait: 'CF02',
  isScreenPresent: 'CF04',
  openScroll: 'CF05',
  openScrollCorrect: 'CF05',
  teardown: 'CF06',
  screenCompare: 'CF07',
  usesScreenCompare: 'CF07',
  displayId: 'CF08',
  dualScreenLocator: 'CF08',
  packageOk: 'CF09',
  touchesMain: 'CF10',
  port5555: 'CF11',
  compiles: 'CF12',
};

function classSource(lab: LabState, subject: string): { path: string; text: string } | null {
  const repo = lab.repos?.['uia-remote'];
  if (!repo) return null;
  const local = subject.startsWith('local:');
  const name = local ? subject.slice(6) : subject;
  const files = local ? (repo.local?.files ?? {}) : (repo.files ?? {});
  for (const [path, text] of Object.entries(files)) if (path.endsWith(`/${name}.java`)) return { path, text };
  return null;
}

function methodBody(text: string, method: string): string | null {
  const m = new RegExp(`\\b${method}\\s*\\([^)]*\\)\\s*(?:throws [^{]+)?\\{`).exec(text);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  return text.slice(start, i - 1);
}

export function codeFact(lab: LabState, fact: string, subject: string): boolean {
  const id = FACT_ALIASES[fact] ?? fact;
  const src = classSource(lab, subject);
  if (!src) return false;
  const text = src.text;
  switch (id) {
    case 'CF01': {
      const body = methodBody(text, 'waitForScreen');
      return !!body && /device\.wait\(\s*Until\.hasObject\(/.test(body);
    }
    case 'CF02': {
      const body = methodBody(text, 'waitForScreen');
      return !!body && /Thread\.sleep\(/.test(body);
    }
    case 'CF03': {
      const body = methodBody(text, 'waitForScreen');
      return !body || !body.trim();
    }
    case 'CF04': {
      const body = methodBody(text, 'isScreenPresent');
      return !!body && /\breturn\b/.test(body);
    }
    case 'CF05': {
      const body = methodBody(text, 'open') ?? '';
      const flexBranch = /if\s*\([^)]*FLEX[^)]*\)\s*\{([^}]*)\}/i.exec(body);
      return !!flexBranch && /scrollVerticallyTo/.test(flexBranch[1]!) && /scrollHorizontallyTo/.test(body.slice(flexBranch.index + flexBranch[0].length));
    }
    case 'CF06':
      return /@After[\s\S]{0,200}goHome/.test(text);
    case 'CF07':
      return /orca\.screenCompare\(/.test(text);
    case 'CF08':
      return /displayId\(/.test(text);
    case 'CF09':
      return !src.path.includes('/pageobjects/') || /package\s+com\.labsim\.uia\.pageobjects\s*;/.test(text);
    case 'CF10':
      return src.path.startsWith('app/src/main/');
    case 'CF11':
      return /portNumber\s*=\s*5555/.test(text);
    case 'CF12': {
      let depth = 0;
      for (const ch of text) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth < 0) return false;
      }
      return depth === 0;
    }
  }
  return false;
}
