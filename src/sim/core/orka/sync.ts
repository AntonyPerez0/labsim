/**
 * Orka step (Sim §3.1.1 #8): MySQL connection pool (§3.14.5), gorth → Screen Locations sync (§3.22.3),
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

export function orkaStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = lab.time.physMs;
  for (const t of takeDue(lab, ['orka.'])) {
    if (t.kind === 'orka.hrnPush') hrnPush(lab, ctx, Number(t.payload.robotId));
  }
  // JDBC pool (Sim §3.14.5).
  const L = ro(lab);
  const vm = roAt(L.hosts, 'orka-vm');
  const mysqlUp = !!vm && vm.os === 'RUNNING' && !!roAt(ro(vm.services), 'mysql')?.running;
  const appR = ro(ro(L.orka).app);
  if (!mysqlUp) {
    if (appR.dbConnected) {
      lab.orka.app.dbConnected = false;
      ctx.emit('orka.dbStateChanged', { connected: false });
      log(lab, 'orka', 'error', 'JDBCConnectionException: Communications link failure');
    }
    if (appR.reconnectAtPhysMs != null) lab.orka.app.reconnectAtPhysMs = null;
  } else if (!appR.dbConnected) {
    const app = lab.orka.app;
    if (app.reconnectAtPhysMs == null) app.reconnectAtPhysMs = phys + RECONNECT_MS;
    else if (phys >= app.reconnectAtPhysMs) {
      app.dbConnected = true;
      app.reconnectAtPhysMs = null;
      ctx.emit('orka.dbStateChanged', { connected: true });
      log(lab, 'orka', 'info', 'HikariPool-1 - Start completed (reconnected to MySQL)');
    }
  }
  // gorth → Orka syncs pushed by sim-devops on merges.
  if (ro(ro(L.orka).pendingSyncs).length) {
    const due = lab.orka.pendingSyncs.filter((s) => s.atPhysMs <= phys);
    if (due.length) {
      lab.orka.pendingSyncs = lab.orka.pendingSyncs.filter((s) => s.atPhysMs > phys);
      for (const s of due) for (const p of s.paths) syncScreenLocationFile(lab, ctx, p, s.commit);
    }
  }
  if (sub.dtGameMs > 0) scheduledHealthChecks(lab, ctx, sub.prevNowMs);
}

/**
 * Upsert Screen (TYPE, SCREEN) from `gorth/config/screen-locations/<TYPE>/<SCREEN>.json` on `main` and
 * replace its locations with the file's buttons (Sim §3.22.3). Returns false when nothing was synced.
 */
export function syncScreenLocationFile(lab: LabState, ctx: Ctx, path: string, commit: string): boolean {
  const m = LOC_RE.exec(path);
  if (!m) return false;
  const [, type, screen] = m as unknown as [string, string, string];
  if (!isDeviceTypeConstant(type)) return false;
  const text = lab.repos?.gorth?.files?.[path];
  if (typeof text !== 'string') return false;
  let json: { buttons?: Record<string, { x?: number; y?: number }> };
  try {
    json = JSON.parse(text);
  } catch {
    log(lab, 'orka', 'warn', `SYNC gorth@${commit} ${path}: invalid JSON — skipped`);
    return false;
  }
  const buttons = json.buttons && typeof json.buttons === 'object' ? json.buttons : {};
  const dt = type as DeviceTypeCode;
  let scr = Object.values(lab.orka.screens).find((s) => s.deviceType === dt && s.name === screen);
  if (!scr) {
    const id = Math.max(lab.orka.seq.screens, ...Object.keys(lab.orka.screens).map((k) => Number(k) + 1));
    lab.orka.seq.screens = id + 1;
    scr = { id, name: screen, deviceType: dt, testingProfile: DEVICE_TYPES[dt].testingProfile, display: screen.startsWith('CFD_') ? 'secondary' : 'primary', description: `${screen} (synced from gorth)`, optionCount: /RECEIPT_OPTIONS_4$/.test(screen) ? 4 : /RECEIPT_OPTIONS_5$/.test(screen) ? 5 : null };
    lab.orka.screens[id] = scr;
  }
  for (const l of Object.values(lab.orka.screenLocations)) if (l.screenId === scr.id) delete lab.orka.screenLocations[l.id];
  let n = 0;
  for (const name of Object.keys(buttons)) {
    const b = buttons[name]!;
    if (typeof b.x !== 'number' || typeof b.y !== 'number') continue;
    const id = Math.max(lab.orka.seq.screenLocations, ...Object.keys(lab.orka.screenLocations).map((k) => Number(k) + 1));
    lab.orka.seq.screenLocations = id + 1;
    lab.orka.screenLocations[id] = { id, screenId: scr.id, button: name, xMm: round1(b.x), yMm: round1(b.y) };
    n++;
  }
  audit(lab, 'gorth-sync', `SYNC gorth@${commit} ${path}`, 'screen', scr.id);
  ctx.emit('orka.screenLocationsSynced', { deviceType: dt, screen, path, commit, buttons: n });
  return true;
}

/** `orka.syncFromGorth` setup op: every screen-location file on gorth `main`, now. */
export function syncAllFromGorth(lab: LabState, ctx: Ctx): number {
  const repo = lab.repos?.gorth;
  if (!repo) return 0;
  const head = (repo.branches[repo.defaultBranch] ?? '').slice(0, 7);
  let n = 0;
  for (const p of Object.keys(repo.files).sort()) if (LOC_RE.test(p) && syncScreenLocationFile(lab, ctx, p, head)) n++;
  return n;
}
