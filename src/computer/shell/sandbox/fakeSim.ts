/**
 * SANDBOX ONLY — minimal stand-ins for the `sim.*` methods the shell/Orca/dashboard call, installed only
 * while the real sim answers "not implemented". Plausible, not authoritative (the real rules live in Sim §3).
 */
import { getState, transact } from '@/core/store';
import { sim } from '@/sim';
import type { Result } from '@/sim';
import type { LabState, OrcaRobot, RobotStatus } from '@/sim/types';
import type { RigCommandName } from '@/sim/events';
import { fmtStamp, fmtTime24 } from '../../apps';
import { UI_DEVICE_TYPES } from '../deviceTypes';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

function notImplemented(fn: () => unknown): boolean {
  try {
    const r = fn() as { ok?: boolean; error?: string } | undefined;
    return !!r && r.ok === false && r.error === 'not implemented';
  } catch {
    return true;
  }
}

type Coll = 'robots' | 'devices' | 'capabilities' | 'merchants' | 'screens' | 'screenLocations' | 'cardProfiles' | 'screenCompareImages';

function saveIn(coll: Coll, row: { id?: number } & Record<string, unknown>, actor: string): Result<number> {
  return transact((root, ctx) => {
    const db = root.lab.orca;
    const table = db[coll] as unknown as Record<number, Record<string, unknown>>;
    let id = row.id;
    if (id == null) {
      id = db.seq[coll]++;
      table[id] = { ...row, id };
    } else {
      if (!table[id]) return err<number>(`404 Not Found: no ${coll} row ${id}`);
      const before = { ...table[id] };
      Object.assign(table[id]!, row);
      const diff: Record<string, [unknown, unknown]> = {};
      for (const k of Object.keys(row)) if (JSON.stringify(before[k]) !== JSON.stringify(row[k]) && k !== 'id') diff[k] = [before[k], row[k]];
      db.audit.unshift({ atMs: ctx.now, who: actor, action: 'UPDATED', entity: coll, entityId: id, diff });
      if (coll === 'robots') {
        const r = table[id] as unknown as OrcaRobot;
        for (const k of Object.keys(diff)) {
          if (k === 'status') continue;
          r.notes.unshift({ id: db.seq.notes++, atMs: ctx.now, author: actor, text: `${fmtStamp(ctx.now)} CONFIG ${k}: ${JSON.stringify(diff[k]![0])} → ${JSON.stringify(diff[k]![1])} (${actor})`, resolved: false, kind: 'CONFIG', repeat: 1, lastAtMs: ctx.now });
        }
        const rig = root.lab.rigs[r.name];
        if (rig && diff.humanReadableName) rig.tablet.hrnShown = r.humanReadableName;
      }
    }
    return ok(id);
  });
}

const LABEL: Record<RobotStatus, string> = { AVAILABLE: 'Available', UNAVAILABLE: 'Unavailable', OFFLINE: 'Offline', CONNECTION_FAILED: 'Connection Failed', RESERVED: 'Reserved' };

function rigCommand(rigId: string, command: RigCommandName, _actor: string, args?: { xMm?: number; yMm?: number }): Result {
  return transact((root) => {
    const rig = root.lab.rigs[rigId];
    if (!rig) return err(`Unknown rig ${rigId}`);
    if (rig.dashboardLocked) return err('LOCKED');
    const g = rig.gantry;
    const needSteppers = command.startsWith('park') || command === 'move.to' || command === 'tap.at';
    if (needSteppers && !rig.steppersEnabled) return err('Steppers disabled');
    switch (command) {
      case 'steppers.enable':
        rig.steppersEnabled = true;
        break;
      case 'steppers.disable':
        rig.steppersEnabled = false;
        break;
      case 'park.all':
      case 'park.xy':
        g.xMm = 0;
        g.yMm = 0;
        g.homed = true;
        if (command === 'park.all') {
          rig.magneticLock.engaged = true;
          rig.banner = 'green';
          rig.tablet.statusText = 'Status: OK';
          rig.bannerText = 'Status: OK';
          rig.dipArm = 'retracted';
          rig.tapArm = 'retracted';
          rig.solenoid.down = false;
        }
        break;
      case 'park.x':
        g.xMm = 0;
        break;
      case 'park.y':
        g.yMm = 0;
        break;
      case 'dip.in':
        rig.dipArm = 'extended';
        break;
      case 'dip.out':
        rig.dipArm = 'retracted';
        break;
      case 'tap.in':
        rig.tapArm = 'extended';
        break;
      case 'tap.out':
        rig.tapArm = 'retracted';
        break;
      case 'phone.forward':
        rig.phonePusher = 'extended';
        break;
      case 'phone.back':
        rig.phonePusher = 'retracted';
        break;
      case 'solenoid.down':
      case 'solenoid.lower':
        rig.solenoid.down = true;
        break;
      case 'solenoid.up':
      case 'solenoid.raise':
        rig.solenoid.down = false;
        break;
      case 'move.to':
        g.xMm = Math.max(g.minXMm ?? -10, Math.min(g.maxXMm, args?.xMm ?? g.xMm));
        g.yMm = Math.max(g.minYMm ?? -10, Math.min(g.maxYMm, args?.yMm ?? g.yMm));
        break;
      default:
        break;
    }
    return ok(undefined);
  });
}

function capabilityDocument(lab: LabState, robotId: number): Record<string, string | boolean> | null {
  const r = lab.orca.robots[robotId];
  if (!r) return null;
  const dev = r.deviceId != null ? lab.orca.devices[r.deviceId] : null;
  const t = dev ? UI_DEVICE_TYPES[dev.deviceType] : null;
  const keys = r.capabilityIds.map((id) => lab.orca.capabilities[id]).filter(Boolean);
  const has = (k: string) => keys.some((c) => c!.key === k);
  const doc: Record<string, string | boolean> = {
    deviceType: dev?.deviceType ?? '',
    printer: !!t?.printer,
    physicalTouch: r.rigKind === 'touch' || r.rigKind === 'standalone',
    dip: has('dip'),
    tap: has('tap'),
    swipe: has('swipe'),
    pinEntry: r.rigKind === 'touch' || r.rigKind === 'standalone',
    tethered: r.mfdDeviceId != null,
    duo: !!t?.dualScreenSingleAdb,
    adbOnly: r.rigKind === 'adb',
    testingProfile: t?.profile ?? '',
  };
  for (const c of keys.map((c) => c!.key).filter((k) => !['dip', 'tap', 'swipe'].includes(k)).sort()) doc[c] = true;
  return doc;
}

/** Install the fakes for every namespace method that is still a stub. */
export function installFakeSim(): void {
  const o = sim.orca as unknown as Record<string, unknown>;
  if (notImplemented(() => sim.orca.saveRobot({ id: -1 }, 'probe'))) {
    o.saveRobot = (row: Record<string, unknown>, actor: string) => {
      const name = row.name as string | undefined;
      if (name != null && Object.values(getState().lab.orca.robots).some((r) => r.name === name && r.id !== row.id)) return err('400 Bad Request: Robot name already exists');
      if (row.id == null) Object.assign(row, { notes: [], statusHistory: [], checkout: null, capabilityIds: row.capabilityIds ?? [] });
      return saveIn('robots', row as never, actor);
    };
    o.setRobotStatus = (id: number, status: RobotStatus, actor: string) =>
      transact((root, ctx) => {
        const r = root.lab.orca.robots[id];
        if (!r) return err('404 Not Found');
        if (status === 'CONNECTION_FAILED') return err('400 Bad Request: Connection Failed is set by the health check only');
        const from = r.status;
        r.status = status;
        r.reservedBy = status === 'RESERVED' ? actor : null;
        r.notes.unshift({ id: root.lab.orca.seq.notes++, atMs: ctx.now, author: actor, text: `${fmtStamp(ctx.now)} STATUS ${LABEL[from]} → ${LABEL[status]} (${actor})`, resolved: false, kind: 'STATUS', repeat: 1, lastAtMs: ctx.now });
        return ok(undefined);
      });
    o.resolveNote = (robotId: number, noteId: number) =>
      transact((root) => {
        const n = root.lab.orca.robots[robotId]?.notes.find((x) => x.id === noteId);
        if (!n) return err('404 Not Found');
        n.resolved = true;
        return ok(undefined);
      });
    o.addNote = (robotId: number, text: string, actor: string) =>
      transact((root, ctx) => {
        const r = root.lab.orca.robots[robotId];
        if (!r) return err<number>('404 Not Found');
        if (!text.trim()) return err<number>('400 Bad Request: note text is required');
        const id = root.lab.orca.seq.notes++;
        r.notes.unshift({ id, atMs: ctx.now, author: actor, text: `${fmtStamp(ctx.now)} ${text.trim()} (${actor})`, resolved: false, kind: 'MANUAL', repeat: 1, lastAtMs: ctx.now });
        return ok(id);
      });
    o.saveDevice = (row: Record<string, unknown>, a: string) => saveIn('devices', row as never, a);
    o.saveCapability = (row: Record<string, unknown>, a: string) => saveIn('capabilities', row as never, a);
    o.saveMerchant = (row: Record<string, unknown>, a: string) => saveIn('merchants', row as never, a);
    o.saveScreen = (row: Record<string, unknown>, a: string) => saveIn('screens', row as never, a);
    o.saveScreenLocation = (row: Record<string, unknown>, a: string) => saveIn('screenLocations', row as never, a);
    o.saveCardProfile = (row: Record<string, unknown>, a: string) => {
      if (row.entry === 'SWIPE' ? !row.trackData || row.gortPath : !row.gortPath || row.trackData) return err('400 Bad Request: Swipe profiles store Track Data; Dip/Tap profiles store a Gort path');
      return saveIn('cardProfiles', row as never, a);
    };
    o.saveScreenCompareImage = (row: Record<string, unknown>, a: string) => saveIn('screenCompareImages', row as never, a);
    o.deleteEntity = (entity: string, id: number) =>
      transact((root) => {
        const map: Record<string, Coll> = { robot: 'robots', device: 'devices', capability: 'capabilities', merchant: 'merchants', screen: 'screens', screenLocation: 'screenLocations', cardProfile: 'cardProfiles', screenCompareImage: 'screenCompareImages' };
        const t = root.lab.orca[map[entity]!] as unknown as Record<number, unknown>;
        if (entity === 'device' && Object.values(root.lab.orca.robots).some((r) => r.deviceId === id || r.mfdDeviceId === id || r.cfdDeviceId === id)) return err('400 Bad Request: Device is linked to a robot');
        delete t[id];
        return ok(undefined);
      });
    o.forceHealthCheck = () =>
      transact((root, ctx) => {
        const hc = root.lab.orca.healthCheck;
        hc.runCount++;
        hc.lastRunMs = ctx.now;
        hc.log.unshift({ run: hc.runCount, atMs: ctx.now, pinged: 37, skipped: 3, failed: 1, recovered: 0, lines: [`${fmtStamp(ctx.now)}  health-check run #${hc.runCount} — 37 pinged, 3 skipped, 1 failed, 0 recovered`, 'sonny  GET http://10.42.10.74:8000/health  FAIL connect timed out after 10000 ms', 'robby  SKIPPED (Offline)'] });
        return ok(undefined);
      });
    o.checkout = (req: { buildId: string; jobId: string; robotName?: string }) =>
      transact((root, ctx) => {
        const r = Object.values(root.lab.orca.robots).find((x) => x.name === req.robotName);
        if (!r) return err('404 Not Found');
        if (r.checkout) return err(`Robot ${r.name} is already checked out (${r.checkout.buildId})`);
        r.checkout = { buildId: req.buildId, jobId: req.jobId, byName: true, startedMs: ctx.now, statusAtCheckout: r.status, kind: 'jenkins' };
        return ok({ robotId: r.id });
      });
    o.release = (robotId: number) =>
      transact((root) => {
        const r = root.lab.orca.robots[robotId];
        if (!r) return err('404 Not Found');
        r.checkout = null;
        return ok(undefined);
      });
    o.capabilityDocument = (robotId: number) => capabilityDocument(getState().lab, robotId);
    o.matchPreview = (capsJson: string, env = 'DEV1') => {
      let want: Record<string, unknown>;
      try {
        want = JSON.parse(capsJson) as Record<string, unknown>;
      } catch (e) {
        return err(`Invalid JSON: ${(e as Error).message}`);
      }
      const lab = getState().lab;
      const rows = Object.values(lab.orca.robots)
        .filter((r) => r.environment === env)
        .map((r) => {
          const doc = capabilityDocument(lab, r.id) ?? {};
          const bad = Object.entries(want).find(([k, v]) => (doc[k] ?? false) !== v);
          return { robotId: r.id, robot: r.name, status: r.status, environment: r.environment, matches: !bad, firstMismatch: bad ? `${bad[0]}: required ${String(bad[1])}, robot ${String(doc[bad[0]] ?? false)}` : null };
        });
      return ok(rows);
    };
    o.xyTouch = (robotName: string, screen: string, button: string) => {
      const lab = getState().lab;
      const r = Object.values(lab.orca.robots).find((x) => x.name === robotName);
      if (!r) return err(`404 Not Found: robot ${robotName}`);
      const dev = r.deviceId != null ? lab.orca.devices[r.deviceId] : null;
      const s = Object.values(lab.orca.screens).find((x) => x.name === screen && x.deviceType === dev?.deviceType);
      const l = s ? Object.values(lab.orca.screenLocations).find((x) => x.screenId === s.id && x.button === button) : null;
      if (!l) return err(`404 Not Found: no Screen Location "${button}" on ${screen} (${dev?.deviceType ?? '?'})`);
      const rig = lab.rigs[robotName];
      if (rig && !rig.magneticLock.engaged) return err('409 Conflict: LOCK_RELEASED (park required)');
      const mode = r.rigKind === 'adb' ? 'ADB_TOUCH' : 'PHYSICAL_TAP';
      const x = l.xMm + r.offsetXMm;
      const y = l.yMm + r.offsetYMm;
      return ok({ robotName, screen, button, xMm: x, yMm: y, mode: mode === 'ADB_TOUCH' ? 'adb' : 'probe', hitButton: null, requestId: 'req-1', orcaMode: mode, status: 200, body: `{"result":"OK","mode":"${mode}","x_mm":${x.toFixed(1)},"y_mm":${y.toFixed(1)}}`, respondsAfterMs: 900, deviceId: dev?.simDeviceId ?? '', display: 'primary' });
    };
    o.rest = (method: string, path: string, body: string | null) => {
      const lab = getState().lab;
      if (method === 'GET' && path === '/management/health') {
        const up = lab.orca.app.dbConnected;
        return { status: up ? 200 : 503, body: JSON.stringify({ status: up ? 'UP' : 'DOWN', components: { db: { status: up ? 'UP' : 'DOWN' }, diskSpace: { status: 'UP' }, ping: { status: 'UP' } } }), latencyMs: 12, headers: { 'content-type': 'application/json' } };
      }
      const capM = /^\/api\/robots\/([^/]+)\/capabilities$/.exec(path);
      if (method === 'GET' && capM) {
        const r = Object.values(lab.orca.robots).find((x) => x.name === capM[1]);
        if (!r) return { status: 404, body: '{"title":"Not Found","status":404}', latencyMs: 8 };
        return { status: 200, body: JSON.stringify(capabilityDocument(lab, r.id)), latencyMs: 9, headers: { 'content-type': 'application/json' } };
      }
      if (method === 'GET' && path.startsWith('/api/robots')) {
        return { status: 200, body: JSON.stringify(Object.values(lab.orca.robots).slice(0, 5).map((r) => ({ id: r.id, name: r.name, status: r.status }))), latencyMs: 14, headers: { 'content-type': 'application/json' } };
      }
      if (method === 'POST' && path === '/api/xy_touch') {
        try {
          const b = JSON.parse(body ?? '{}') as { robot: string; screen: string; button: string };
          const res = sim.orca.xyTouch(b.robot, b.screen, b.button, 'player');
          if (res.ok) return { status: 200, body: res.value.body, latencyMs: 900, headers: { 'content-type': 'application/json' } };
          return { status: Number(/^\d+/.exec(res.error)?.[0] ?? 400), body: JSON.stringify({ title: res.error.replace(/^\d+ [A-Za-z ]+: /, ''), status: Number(/^\d+/.exec(res.error)?.[0] ?? 400) }), latencyMs: 20 };
        } catch {
          return { status: 400, body: '{"title":"Bad Request","status":400,"detail":"Malformed JSON"}', latencyMs: 4 };
        }
      }
      return { status: 404, body: `{"title":"Not Found","status":404,"path":"${path}"}`, latencyMs: 6 };
    };
  }
  if (notImplemented(() => sim.rig.command('__none__', 'park.all', 'probe'))) {
    const r = sim.rig as unknown as Record<string, unknown>;
    r.command = rigCommand;
    r.setTabletTab = (rigId: string, tab: 'robot' | 'robot-control' | 'motion-control') =>
      transact((root) => {
        const rig = root.lab.rigs[rigId];
        if (rig) rig.tablet.tab = tab;
        return ok(undefined);
      });
  }
  if (notImplemented(() => sim.ocr.compare(-1))) {
    (sim.ocr as unknown as Record<string, unknown>).compare = (id: number) => {
      const c = getState().lab.orca.screenCompareImages[id];
      if (!c) return err('404 Not Found');
      const v2 = getState().lab.flags.cfdLayoutV2Toggle;
      const text = v2 ? 'Total: $10.83' : c.expectedText;
      return ok({ text, expected: c.expectedText, match: text === c.expectedText });
    };
  }
  void fmtTime24;
}
