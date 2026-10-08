/**
 * Orca step (Sim §3.1.1 #8): MySQL connection pool (§3.14.5), gort → Screen Locations sync (§3.22.3),
 * HRN pushes, and the 5-minute health check per crossed boundary (§3.3.1).
 */
import type { DeviceTypeCode, LabState } from '../../types';
import type { Ctx, SubStep } from '../util';
import { log, takeDue } from '../util';
import { DEVICE_TYPES } from '../../seed/deviceTypes';
import { round1 } from '../../text/time';
import { isDeviceTypeConstant } from './checkout';
import { audit } from './status';
import { scheduledHealthChecks } from './health';
import { hrnPush } from '../rigs';
import { ro, roAt } from '../ro';

const RECONNECT_MS = 15_000;
const LOC_RE = /^config\/screen-locations\/([A-Z0-9_]+)\/([A-Z0-9_]+)\.json$/;

export function orcaStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = lab.time.physMs;
  for (const t of takeDue(lab, ['orca.'])) {
    if (t.kind === 'orca.hrnPush') hrnPush(lab, ctx, Number(t.payload.robotId));
  }
  // JDBC pool (Sim §3.14.5).
  const L = ro(lab);
  const vm = roAt(L.hosts, 'orca-vm');
  const mysqlUp = !!vm && vm.os === 'RUNNING' && !!roAt(ro(vm.services), 'mysql')?.running;
  const appR = ro(ro(L.orca).app);
  if (!mysqlUp) {
    if (appR.dbConnected) {
      lab.orca.app.dbConnected = false;
      ctx.emit('orca.dbStateChanged', { connected: false });
      log(lab, 'orca', 'error', 'JDBCConnectionException: Communications link failure');
    }
    if (appR.reconnectAtPhysMs != null) lab.orca.app.reconnectAtPhysMs = null;
  } else if (!appR.dbConnected) {
    const app = lab.orca.app;
    if (app.reconnectAtPhysMs == null) app.reconnectAtPhysMs = phys + RECONNECT_MS;
    else if (phys >= app.reconnectAtPhysMs) {
      app.dbConnected = true;
      app.reconnectAtPhysMs = null;
      ctx.emit('orca.dbStateChanged', { connected: true });
      log(lab, 'orca', 'info', 'HikariPool-1 - Start completed (reconnected to MySQL)');
    }
  }
  // gort → Orca syncs pushed by sim-devops on merges.
  if (ro(ro(L.orca).pendingSyncs).length) {
    const due = lab.orca.pendingSyncs.filter((s) => s.atPhysMs <= phys);
    if (due.length) {
      lab.orca.pendingSyncs = lab.orca.pendingSyncs.filter((s) => s.atPhysMs > phys);
      for (const s of due) for (const p of s.paths) syncScreenLocationFile(lab, ctx, p, s.commit);
    }
  }
  if (sub.dtGameMs > 0) scheduledHealthChecks(lab, ctx, sub.prevNowMs);
}

/**
 * Upsert Screen (TYPE, SCREEN) from `gort/config/screen-locations/<TYPE>/<SCREEN>.json` on `main` and
 * replace its locations with the file's buttons (Sim §3.22.3). Returns false when nothing was synced.
 */
export function syncScreenLocationFile(lab: LabState, ctx: Ctx, path: string, commit: string): boolean {
  const m = LOC_RE.exec(path);
  if (!m) return false;
  const [, type, screen] = m as unknown as [string, string, string];
  if (!isDeviceTypeConstant(type)) return false;
  const text = lab.repos?.gort?.files?.[path];
  if (typeof text !== 'string') return false;
  let json: { buttons?: Record<string, { x?: number; y?: number }> };
  try {
    json = JSON.parse(text);
  } catch {
    log(lab, 'orca', 'warn', `SYNC gort@${commit} ${path}: invalid JSON — skipped`);
    return false;
  }
  const buttons = json.buttons && typeof json.buttons === 'object' ? json.buttons : {};
  const dt = type as DeviceTypeCode;
  let scr = Object.values(lab.orca.screens).find((s) => s.deviceType === dt && s.name === screen);
  if (!scr) {
    const id = Math.max(lab.orca.seq.screens, ...Object.keys(lab.orca.screens).map((k) => Number(k) + 1));
    lab.orca.seq.screens = id + 1;
    scr = { id, name: screen, deviceType: dt, testingProfile: DEVICE_TYPES[dt].testingProfile, display: screen.startsWith('CFD_') ? 'secondary' : 'primary', description: `${screen} (synced from gort)`, optionCount: /RECEIPT_OPTIONS_4$/.test(screen) ? 4 : /RECEIPT_OPTIONS_5$/.test(screen) ? 5 : null };
    lab.orca.screens[id] = scr;
  }
  for (const l of Object.values(lab.orca.screenLocations)) if (l.screenId === scr.id) delete lab.orca.screenLocations[l.id];
  let n = 0;
  for (const name of Object.keys(buttons)) {
    const b = buttons[name]!;
    if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
    const id = Math.max(lab.orca.seq.screenLocations, ...Object.keys(lab.orca.screenLocations).map((k) => Number(k) + 1));
    lab.orca.seq.screenLocations = id + 1;
    lab.orca.screenLocations[id] = { id, screenId: scr.id, button: name, xMm: round1(b.x), yMm: round1(b.y) };
    n++;
  }
  audit(lab, 'gort-sync', `SYNC gort@${commit} ${path}`, 'screen', scr.id);
  ctx.emit('orca.screenLocationsSynced', { deviceType: dt, screen, path, commit, buttons: n });
  return true;
}

/** `orca.syncFromGort` setup op: every screen-location file on gort `main`, now. */
export function syncAllFromGort(lab: LabState, ctx: Ctx): number {
  const repo = lab.repos?.gort;
  if (!repo) return 0;
  const head = (repo.branches[repo.defaultBranch] ?? '').slice(0, 7);
  let n = 0;
  for (const p of Object.keys(repo.files).sort()) if (LOC_RE.test(p) && syncScreenLocationFile(lab, ctx, p, head)) n++;
  return n;
}
