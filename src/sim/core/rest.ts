/**
 * Simulated REST surfaces (Sim §3.23): Orca (JHipster problem JSON), Robot Pis (`:8000`, camera
 * `:8081`) and Callus (`:9000`). Ollama and Jenkins are sim-devops'. Connection failures answer
 * `status: 0` with header `x-sim-error: refused | timeout | no-route` and the error text as body.
 */
import type { CardEntry, LabState, OrcaRobot } from '../types';
import type { Actor, RestResponse } from '../api';
import type { RigCommandName } from '../events';
import type { Ctx } from './util';
import { parseUrl, rand } from './util';
import { reach, resolve } from './network';
import { capabilityDocument, checkout, matchPreview, parseCapsJson, release } from './orca/checkout';
import { robotByName, setRobotStatus } from './orca/status';
import { piHealth } from './orca/health';
import { runHealthCheck } from './orca/health';
import { xyTouch } from './orca/xyTouch';
import { cardAction, callusStatusBody } from './collis';
import { screenCompare } from './ocr';
import { deleteEntity, rigOf, saveCapability, saveCardProfile, saveDevice, saveMerchant, saveRobot, saveScreen, saveScreenCompareImage, saveScreenLocation } from './orca/entities';
import type { EntityName } from './orca/entities';
import { enqueueRig, rigCommand } from './rigs';
import { cameraForUrl } from '../seed/cameras';
import { DEVICE_TYPES } from '../seed/deviceTypes';
import { ollamaTagsJson } from '../devops/ollama';
import { queueBuild } from '../devops/jenkins/engine';

const TITLES: Record<number, string> = { 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity', 423: 'Locked', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
const JSON_H = { 'content-type': 'application/json' };
const JPA = 'Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection';

function lat(lab: LabState): number {
  return 30 + Math.floor(4 * rand(lab, 'devices'));
}

function problem(lab: LabState, status: number, detail: string, path: string): RestResponse {
  const message = status === 400 || status === 409 || status === 422 ? 'error.validation' : `error.http.${status}`;
  return { status, body: JSON.stringify({ title: TITLES[status] ?? 'Error', status, detail, path, message }), headers: JSON_H, latencyMs: lat(lab) };
}

/** Map a sim error ("400 Bad Request: detail") to a problem response. */
function fromError(lab: LabState, error: string, path: string): RestResponse {
  const m = /^(\d{3})(?: [A-Za-z ]+?)?(?:: (.*))?$/.exec(error);
  if (m) return problem(lab, Number(m[1]), m[2] ?? TITLES[Number(m[1])] ?? error, path);
  return problem(lab, 400, error, path);
}

const ok = (lab: LabState, body: unknown, status = 200): RestResponse => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body), headers: JSON_H, latencyMs: lat(lab) });

function parseBody(body: string | null): Record<string, unknown> | null {
  if (!body) return {};
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const ENTITY_PATHS: Record<string, EntityName> = {
  robots: 'robot',
  devices: 'device',
  'robot-capabilities': 'capability',
  'merchant-configs': 'merchant',
  screens: 'screen',
  'screen-locations': 'screenLocation',
  'card-profiles': 'cardProfile',
  'screen-compare-images': 'screenCompareImage',
};

function tableOf(lab: LabState, e: EntityName): Record<number, object> {
  const o = lab.orca;
  return { robot: o.robots, device: o.devices, capability: o.capabilities, merchant: o.merchants, screen: o.screens, screenLocation: o.screenLocations, cardProfile: o.cardProfiles, screenCompareImage: o.screenCompareImages }[e];
}

function filterRows(rows: Record<string, unknown>[], query: URLSearchParams): Record<string, unknown>[] {
  let out = rows;
  for (const [k, v] of query.entries()) {
    const m = /^(\w+)\.(equals|in|contains)$/.exec(k);
    if (!m) continue;
    const [, field, op] = m as unknown as [string, string, string];
    out = out.filter((r) => {
      const val = String(r[field] ?? '');
      if (op === 'equals') return val === v;
      if (op === 'in') return v.split(',').includes(val);
      return val.toLowerCase().includes(v.toLowerCase());
    });
  }
  return out;
}

/** Runtime env Orca hands back on checkout (Sim §3.18.4 subset). */
function runtimeEnvOf(lab: LabState, robot: OrcaRobot): Record<string, string> {
  const dev = robot.deviceId != null ? lab.orca.devices[robot.deviceId] : undefined;
  const mfd = robot.mfdDeviceId != null ? lab.orca.devices[robot.mfdDeviceId] : undefined;
  const cfd = robot.cfdDeviceId != null ? lab.orca.devices[robot.cfdDeviceId] : undefined;
  const type = dev?.deviceType;
  return {
    RUN_TYPE: mfd ? 'tethered' : 'standalone',
    DEVICE_TYPE: type ?? '',
    DEVICE_FAMILY: type ? DEVICE_TYPES[type].family : '',
    ROBOT_NAME: robot.name,
    MFD_IP: (mfd ?? dev)?.ip ?? '',
    CFD_IP: cfd?.ip ?? '',
    SERIAL: (mfd ?? dev)?.serial ?? '',
    PORT_NUMBER: '5444',
    THEME: 'avocado',
    KERNEL_TYPE: 'CPA',
    BACKEND_ENV: robot.environment,
    ORCA_URL: 'http://orca.lab.local:8080',
  };
}

/* ────────────────────────────── Orca ────────────────────────────── */

export function orcaRest(lab: LabState, ctx: Ctx, method: string, rawPath: string, body: string | null, actor: Actor): RestResponse {
  const [path, qs] = rawPath.split('?') as [string, string | undefined];
  const query = new URLSearchParams(qs ?? '');
  const M = method.toUpperCase();
  const res = (() => {
    if (path === '/management/health') {
      return lab.orca.app.dbConnected ? ok(lab, { status: 'UP' }) : ok(lab, { status: 'DOWN', components: { db: { status: 'DOWN' } } }, 503);
    }
    if (!lab.orca.app.dbConnected) return problem(lab, 500, JPA, path);
    const json = parseBody(body);
    if (json === null) return problem(lab, 400, 'Failed to read request: malformed JSON', path);
    let m: RegExpExecArray | null;
    if (M === 'POST' && path === '/api/xy_touch') {
      const r = xyTouch(lab, ctx, String(json.robot ?? ''), String(json.screen ?? ''), String(json.button ?? ''), actor, json.target === 'MFD' || json.target === 'CFD' ? { target: json.target } : {});
      return r.ok ? { status: 200, body: r.value.body, headers: JSON_H, latencyMs: r.value.respondsAfterMs } : fromError(lab, r.error, path);
    }
    if (M === 'POST' && (m = /^\/api\/card\/(swipe|dip|tap)$/.exec(path))) {
      const r = cardAction(lab, ctx, String(json.robot ?? ''), m[1]!.toUpperCase() as CardEntry, String(json.profile ?? ''), actor);
      if (r.ok) return { status: 200, body: r.value.body, headers: JSON_H, latencyMs: r.value.respondsAfterMs };
      const last = r.error.split('\n').pop()!.replace(/^\[(orca|callus|pi)\] /, '');
      return /^\d{3}/.test(last) ? fromError(lab, last, path) : problem(lab, 502, last, path);
    }
    if (M === 'POST' && path === '/api/match-preview') {
      const caps = parseCapsJson(JSON.stringify(json.capabilities ?? {}));
      if (!caps.ok) return fromError(lab, caps.error, path);
      return ok(lab, matchPreview(lab, caps.caps, typeof json.environment === 'string' ? json.environment : 'DEV1').map((r) => ({ robot: r.robot, matches: r.matches, status: r.status, ...(r.firstMismatch ? { mismatch: r.firstMismatch } : {}) })));
    }
    if (M === 'POST' && path === '/api/health-check/run') {
      if (!lab.config.forceHealthCheckAllowed) return problem(lab, 403, 'Force health check is disabled in this environment', path);
      runHealthCheck(lab, ctx, { forced: true });
      return ok(lab, '', 202);
    }
    if (M === 'POST' && (m = /^\/api\/screen-compare\/([^/]+)\/test$/.exec(path))) {
      const r = screenCompare(lab, ctx, decodeURIComponent(m[1]!), actor, 'orca');
      return r.ok ? ok(lab, { text: r.value.text, expected: r.value.expected, match: r.value.match }) : fromError(lab, r.error, path);
    }
    if (M === 'POST' && path === '/api/robots/checkout') {
      const out = checkout(lab, ctx, {
        buildId: `rest-${++lab.seq.request}`,
        jobId: 'curl',
        robotName: typeof json.robot === 'string' ? json.robot : typeof json.name === 'string' ? json.name : '',
        deviceType: typeof json.deviceType === 'string' ? json.deviceType : undefined,
        capabilities: json.capabilities && typeof json.capabilities === 'object' ? (json.capabilities as Record<string, string | boolean>) : undefined,
        environment: typeof json.environment === 'string' ? json.environment : 'DEV1',
        kind: 'manual',
      });
      if (out.kind === 'ok') {
        const robot = lab.orca.robots[out.robotId]!;
        const env = runtimeEnvOf(lab, robot);
        return ok(lab, { robot: robot.name, deviceType: env.DEVICE_TYPE, runType: env.RUN_TYPE, env });
      }
      if (out.kind === 'wait') return problem(lab, 409, out.lines[out.lines.length - 1]?.replace(/^\[orca\] /, '') ?? `no Available ${out.label} robot`, path);
      const last = out.lines[out.lines.length - 1] ?? out.code;
      return /\] \d{3}/.test(last) ? fromError(lab, last.replace(/^\[orca\] /, ''), path) : problem(lab, out.code === 'ENUM_CASE' ? 400 : 409, last.replace(/^\[orca\] /, ''), path);
    }
    if (M === 'POST' && (m = /^\/api\/robots\/([^/]+)\/release$/.exec(path))) {
      const robot = robotByName(lab, decodeURIComponent(m[1]!));
      if (!robot) return problem(lab, 404, `no robot named '${m[1]}'`, path);
      const r = release(lab, ctx, robot.id, robot.checkout?.buildId ?? '');
      return ok(lab, { robot: robot.name, status: r.statusAfter });
    }
    if (M === 'GET' && (m = /^\/api\/robots\/([a-z0-9-]+[a-z-][a-z0-9-]*)\/capabilities$/.exec(path))) {
      const robot = robotByName(lab, m[1]!);
      return robot ? ok(lab, capabilityDocument(lab, robot)) : problem(lab, 404, `no robot named '${m[1]}'`, path);
    }
    if (M === 'PUT' && (m = /^\/api\/robots\/(\d+)\/status$/.exec(path))) {
      const r = setRobotStatus(lab, ctx, Number(m[1]), String(json.status ?? ''), actor);
      return r.ok ? ok(lab, lab.orca.robots[Number(m[1])]) : fromError(lab, r.error, path);
    }
    // JHipster CRUD.
    if ((m = /^\/api\/([a-z-]+)(?:\/(\d+))?$/.exec(path)) && ENTITY_PATHS[m[1]!]) {
      const entity = ENTITY_PATHS[m[1]!]!;
      const table = tableOf(lab, entity);
      const id = m[2] ? Number(m[2]) : null;
      if (M === 'GET') {
        if (id != null) return table[id] ? ok(lab, table[id]) : problem(lab, 404, 'Not Found', path);
        return ok(lab, filterRows(Object.values(table) as Record<string, unknown>[], query));
      }
      if (M === 'DELETE' && id != null) {
        const r = deleteEntity(lab, ctx, entity, id, actor);
        return r.ok ? { status: 204, body: '', latencyMs: lat(lab) } : fromError(lab, r.error, path);
      }
      if (M === 'POST' || M === 'PUT') {
        const input = { ...json, ...(id != null ? { id } : {}) } as Record<string, unknown>;
        if (M === 'POST' && input.id != null) return problem(lab, 400, 'A new entity cannot already have an ID', path);
        if (M === 'PUT' && input.id == null) return problem(lab, 400, 'Invalid id', path);
        const savers = { robot: saveRobot, device: saveDevice, capability: saveCapability, merchant: saveMerchant, screen: saveScreen, screenLocation: saveScreenLocation, cardProfile: saveCardProfile, screenCompareImage: saveScreenCompareImage } as Record<EntityName, (l: LabState, c: Ctx, i: never, a: string) => { ok: true; value: number } | { ok: false; error: string }>;
        const r = savers[entity](lab, ctx, input as never, actor);
        return r.ok ? ok(lab, table[r.value], M === 'POST' ? 201 : 200) : fromError(lab, r.error, path);
      }
    }
    return problem(lab, 404, 'Not Found', path);
  })();
  ctx.emit('orca.rest', { method: M, path, status: res.status, actor });
  return res;
}

/* ────────────────────────────── Robot Pi & Callus ────────────────────────────── */

function piRest(lab: LabState, ctx: Ctx, hostId: string, method: string, path: string, body: string | null, actor: Actor): RestResponse {
  const pi = lab.hosts[hostId]!;
  const M = method.toUpperCase();
  const rigs = Object.values(lab.rigs).filter((r) => r.piHostId === hostId).sort((a, b) => a.orcaRobotId - b.orcaRobotId);
  if (M === 'GET' && path === '/health') {
    const h = piHealth(lab, hostId, pi.ip);
    if (h.http === 200) return { status: 200, body: h.body, headers: JSON_H, latencyMs: h.latencyMs };
    return { status: h.http ?? 503, body: h.body, headers: JSON_H, latencyMs: h.latencyMs };
  }
  const rig = rigs[0];
  if (M === 'GET' && path === '/status') {
    if (!rig) return ok(lab, { status: 'ok' });
    return ok(lab, `{"robot":"${rig.id}","banner":"${rig.banner}","homed":${rig.gantry.homed},"lock":${rig.magneticLock.engaged},"steppers":${rig.steppersEnabled},"x_mm":${rig.gantry.xMm.toFixed(1)},"y_mm":${rig.gantry.yMm.toFixed(1)}}`);
  }
  const json = parseBody(body) ?? {};
  if (M === 'POST' && path === '/motion' && rig) {
    const r = rigCommand(lab, ctx, rig.id, String(json.cmd ?? '') as RigCommandName, actor);
    return r.ok ? ok(lab, { result: 'OK' }) : ok(lab, { error: r.error }, r.error === 'LOCKED' ? 423 : 409);
  }
  if (M === 'POST' && path === '/touch' && rig) {
    enqueueRig(lab, rig.id, { kind: 'moveTo', xMm: Number(json.x_mm ?? 0), yMm: Number(json.y_mm ?? 0), source: 'player' });
    enqueueRig(lab, rig.id, { kind: 'tap', source: 'player' });
    return ok(lab, { result: 'OK' });
  }
  const m = /^\/(dip|tap|swipe)$/.exec(path);
  if (M === 'POST' && m && rig) {
    if (m[1] === 'swipe') return ok(lab, { result: 'OK' });
    const r = rigCommand(lab, ctx, rig.id, `${m[1]}.${json.action === 'out' ? 'out' : 'in'}` as RigCommandName, actor);
    return r.ok ? ok(lab, { result: 'OK' }) : ok(lab, { error: r.error }, 409);
  }
  if (M === 'POST' && ['/adb', '/cardprog', '/ocr'].includes(path)) {
    if (path === '/cardprog' && !pi.services.cardprog?.running) return ok(lab, { error: 'CARDPROG_UNAVAILABLE' }, 503);
    return ok(lab, { result: 'OK' });
  }
  return ok(lab, { error: 'Not Found' }, 404);
}

function cameraRest(lab: LabState, hostId: string, path: string): RestResponse {
  const host = lab.hosts[hostId]!;
  const cam = cameraForUrl(`http://${host.ip}:8081${path}`);
  if (!host.usb.includes('webcam')) return { status: 503, body: 'camera unavailable', latencyMs: lat(lab) };
  if (path === '/stream.mjpg') return { status: 200, body: '--frame\r\nContent-Type: image/jpeg\r\n\r\n<jpeg>', headers: { 'content-type': 'multipart/x-mixed-replace; boundary=frame' }, latencyMs: lat(lab) };
  if (path === '/snapshot.jpg') return { status: 200, body: cam ? `img:webcam:${cam.id}:live` : '', headers: { 'content-type': 'image/jpeg' }, latencyMs: lat(lab) };
  return { status: 404, body: 'Not Found', latencyMs: lat(lab) };
}

function callusRest(lab: LabState, hostId: string, method: string, path: string): RestResponse {
  const box = lab.hosts[hostId]!;
  if (box.diskUsedGb >= box.diskTotalGb - 0.001) return ok(lab, { error: 'No space left on device' }, 500);
  if (method.toUpperCase() === 'GET' && path === '/status') return ok(lab, callusStatusBody(lab, hostId));
  if (method.toUpperCase() === 'POST' && ['/load', '/swipe', '/arm'].includes(path)) return ok(lab, { result: 'OK' });
  return ok(lab, { error: 'Not Found' }, 404);
}

/* ────────────────────────────── Ollama & Jenkins JSON (read side) ────────────────────────────── */

function ollamaRest(lab: LabState, method: string, path: string): RestResponse {
  if (method.toUpperCase() === 'GET' && path === '/api/tags') return ok(lab, ollamaTagsJson(lab));
  if (method.toUpperCase() === 'GET' && path === '/api/version') return ok(lab, { version: '0.3.12' });
  return { status: 404, body: '404 page not found', latencyMs: lat(lab) };
}

/** `GET /job/<F>/job/<name>/lastBuild/api/json`, `POST /job/<F>/job/<name>/buildWithParameters?K=V` (Sim §3.23). */
function jenkinsRest(lab: LabState, ctx: Ctx, method: string, rawPath: string, actor: Actor): RestResponse {
  const [path, qs] = rawPath.split('?') as [string, string | undefined];
  const m = /^\/job\/([^/]+)\/job\/([^/]+)\/(lastBuild\/api\/json|buildWithParameters|build)$/.exec(path);
  if (!m) return { status: 404, body: 'Not Found', latencyMs: lat(lab) };
  const jobId = `${decodeURIComponent(m[1]!)}/${decodeURIComponent(m[2]!)}`;
  const job = lab.jenkins.jobs[jobId];
  if (!job || !job.exists) return { status: 404, body: 'Not Found', latencyMs: lat(lab) };
  if (m[3] === 'lastBuild/api/json') {
    if (method.toUpperCase() !== 'GET') return { status: 405, body: 'Method Not Allowed', latencyMs: lat(lab) };
    const last = job.buildIds.map((id) => lab.jenkins.builds[id]).filter((b) => !!b).sort((a, b) => b!.number - a!.number)[0];
    if (!last) return { status: 404, body: 'Not Found', latencyMs: lat(lab) };
    const duration = last.startedMs != null && last.finishedMs != null ? last.finishedMs - last.startedMs : 0;
    return ok(lab, `{"number":${last.number},"result":${last.result ? `"${last.result}"` : 'null'},"building":${last.state !== 'finished'},"duration":${duration}}`);
  }
  if (method.toUpperCase() !== 'POST') return { status: 405, body: 'Method Not Allowed', latencyMs: lat(lab) };
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs ?? '').entries()) params[k] = v;
  const r = queueBuild(lab, ctx, jobId, params, String(actor));
  if (!r.ok) return { status: 400, body: r.error, latencyMs: lat(lab) };
  return { status: 201, body: '', headers: { location: `http://jenkins.lab.local:8080/queue/item/${lab.jenkins.queue.length}/` }, latencyMs: lat(lab) };
}

/**
 * HTTP from `fromHostId` to a lab URL (CoreServices.http, `curl`, the browser).
 */
export function http(lab: LabState, ctx: Ctx, req: { method: string; url: string; body: string | null; fromHostId: string; actor: Actor }): RestResponse {
  const u = parseUrl(req.url);
  if (!u) return { status: 0, body: `URL rejected: Malformed input to a URL function`, headers: { 'x-sim-error': 'no-route' }, latencyMs: 0 };
  const r = reach(lab, req.fromHostId, u.host, u.port);
  if (!r.ok) {
    const kind = r.kind;
    const text = kind === 'refused' ? 'Connection refused' : kind === 'timeout' ? 'Connection timed out after 10000 milliseconds' : resolve(lab, u.host).ip ? 'No route to host' : `Could not resolve host: ${u.host}`;
    return { status: 0, body: text, headers: { 'x-sim-error': kind }, latencyMs: r.latencyMs };
  }
  if (!r.hostId) return { status: 0, body: 'Empty reply from server', headers: { 'x-sim-error': 'refused' }, latencyMs: r.latencyMs };
  const host = lab.hosts[r.hostId]!;
  if (host.id === 'orca-vm' && u.port === 8080) return orcaRest(lab, ctx, req.method, u.path, req.body, req.actor);
  if (host.kind === 'pi' && u.port === 8000) return piRest(lab, ctx, host.id, req.method, u.path.split('?')[0]!, req.body, req.actor);
  if (host.kind === 'pi' && u.port === 8081) return cameraRest(lab, host.id, u.path.split('?')[0]!);
  if ((host.kind === 'minix' || host.kind === 'nuc') && u.port === 9000) return callusRest(lab, host.id, req.method, u.path.split('?')[0]!);
  if (host.id === 'ollama-vm' && u.port === 11434) return ollamaRest(lab, req.method, u.path.split('?')[0]!);
  if (host.id === 'jenkins-vm' && u.port === 8080) return jenkinsRest(lab, ctx, req.method, u.path, req.actor);
  if (host.kind === 'nuc' && u.port === 9100) return host.diskUsedGb >= host.diskTotalGb - 0.001 ? ok(lab, { error: 'No space left on device' }, 500) : ok(lab, { status: 'ok' });
  return { status: 404, body: 'Not Found', latencyMs: r.latencyMs };
}

export { rigOf };
