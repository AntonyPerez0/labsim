/**
 * LabSim devices system (Sim §3.8): power/boot/battery, idle lock, auto-advance, toasts, the tethered
 * pay-display link (§3.8.6), touches with the firmware hit test (§3.5.4), strokes, keys, card
 * presentation, hardware swaps and provisioning.
 */
import type { CardEntry, TerminalDevice, DevicePower, DeviceTypeCode, LabState } from '../../types';
import type { Result } from '../../api';
import type { TouchResult } from '../../events';
import type { Ctx, SubStep } from '../util';
import { log, takeDue } from '../util';
import { DEVICE_TYPES, isHandheld } from '../../seed/deviceTypes';
import { coreMm } from '../../seed/layouts';
import { appsFor } from '../../seed';
import { TOAST } from '../../text/devices';
import { customerSide, dispOf, liveElements, logcat, setScreen, toast } from './model';
import type { Disp } from './model';
import { autoAdvance, cardEvent, press, printPayload } from './txn';
import { ro } from '../ro';

export * from './model';
export { cardEvent, press, pressKey, enterText, stageApproved, trackDataValid, cardFileValid, autoAdvance as autoAdvanceNow } from './txn';

const BOOT_MS = 30_000;
const IDLE_LOCK_MS = 600_000;

function setPower(lab: LabState, ctx: Ctx, d: TerminalDevice, to: DevicePower): void {
  if (d.power === to) return;
  const from = d.power;
  d.power = to;
  ctx.emit('device.powerChanged', { deviceId: d.id, from, to });
}

function deviceState(d: TerminalDevice): TerminalDevice['state'] {
  if (d.power === 'fried') return 'FRIED';
  if (d.dead) return 'DEAD';
  if (d.power === 'booting') return 'BOOTING';
  return 'OK';
}

/** Power off now (no battery left / unplugged): screens dark, order lost. */
export function devicePowerOff(lab: LabState, ctx: Ctx, d: TerminalDevice): void {
  if (d.power === 'off' || d.power === 'fried') return;
  setPower(lab, ctx, d, 'off');
  d.bootProgress = 0;
  d.bootStartedPhysMs = null;
  d.order = null;
  d.cardPresent = null;
  setScreen(lab, ctx, d, 'primary', 'off', { instant: true });
  if (d.secondaryDisplay) setScreen(lab, ctx, d, 'secondary', 'off', { instant: true });
}

export function deviceBoot(lab: LabState, ctx: Ctx, d: TerminalDevice): void {
  setPower(lab, ctx, d, 'booting');
  d.bootStartedPhysMs = lab.time.physMs;
  d.bootProgress = 0;
  setScreen(lab, ctx, d, 'primary', 'boot', { instant: true });
  if (d.secondaryDisplay) setScreen(lab, ctx, d, 'secondary', 'boot', { instant: true });
}

function bootDone(lab: LabState, ctx: Ctx, d: TerminalDevice): void {
  setPower(lab, ctx, d, 'on');
  d.bootProgress = 1;
  d.lastInputPhysMs = lab.time.physMs;
  if (d.role === 'cfd') {
    const mfd = d.tetheredTo ? lab.devices[d.tetheredTo] : undefined;
    setScreen(lab, ctx, d, 'primary', mfd && mfd.payDisplayLink === 'DOWN' ? 'waiting-for-merchant' : 'customer-idle');
  } else if (!d.provisioned) setScreen(lab, ctx, d, 'primary', 'oobe-welcome');
  else setScreen(lab, ctx, d, 'primary', 'lock');
  if (d.secondaryDisplay) setScreen(lab, ctx, d, 'secondary', 'customer-idle');
}

export function devicesStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = lab.time.physMs;
  for (const t of takeDue(lab, ['device.'])) {
    const p = t.payload;
    if (t.kind === 'device.printPayload') printPayload(lab, ctx, String(p.device), String(p.owner), p.qr === true);
    else if (t.kind === 'device.adbTcp') {
      const d = lab.devices[String(p.device)];
      const port = p.port == null ? null : Number(p.port);
      if (d && d.power === 'on' && d.adbTcpPort !== port) {
        d.adbTcpPort = port;
        ctx.emit('device.adbTcpChanged', { deviceId: d.id, port });
      }
    }
  }
  const L = ro(lab);
  const loads = ro(ro(L.power).loads);
  const loadOf: Record<string, string> = {};
  for (const lid of Object.keys(loads)) {
    const did = ro(loads[lid]!).deviceId;
    if (did) loadOf[did] = lid;
  }
  const dtMin = sub.dtPhysMs / 60_000;
  const devices = ro(L.devices);
  for (const id of Object.keys(devices).sort()) {
    const dr = ro(devices[id]!);
    if (dr.power === 'fried') {
      if (dr.state !== 'FRIED') lab.devices[id]!.state = 'FRIED';
      continue;
    }
    const lid = loadOf[id];
    const mains = lid ? ro(loads[lid]!).powered : ro(dr.supply).kind !== 'none';
    // Battery (handhelds, Sim §3.8.1).
    const bat = ro(dr.battery);
    let pct = bat ? bat.pct : 0;
    if (bat) {
      if (mains) {
        if (!bat.charging) lab.devices[id]!.battery!.charging = true;
        if (bat.pct < 100 && dtMin > 0) {
          pct = Math.min(100, Math.round((bat.pct + 2 * dtMin) * 1000) / 1000);
          lab.devices[id]!.battery!.pct = pct;
        }
      } else {
        if (bat.charging) lab.devices[id]!.battery!.charging = false;
        if (bat.pct > 0 && dr.power !== 'off' && dtMin > 0) {
          pct = Math.max(0, Math.round((bat.pct - 0.5 * dtMin) * 1000) / 1000);
          lab.devices[id]!.battery!.pct = pct;
        }
      }
    }
    const powered = !dr.dead && (mains || (!!bat && pct > 0 && dr.power !== 'off'));
    if (!powered) {
      if (dr.power !== 'off') devicePowerOff(lab, ctx, lab.devices[id]!);
    } else if (dr.power === 'off') deviceBoot(lab, ctx, lab.devices[id]!);
    else if (dr.power === 'booting' && dr.bootStartedPhysMs != null) {
      const p = Math.min(1, Math.round(((phys - dr.bootStartedPhysMs) / BOOT_MS) * 100) / 100);
      if (dr.bootProgress !== p) lab.devices[id]!.bootProgress = p;
      if (phys - dr.bootStartedPhysMs >= BOOT_MS) bootDone(lab, ctx, lab.devices[id]!);
    }
    const d = ro(ro(ro(lab).devices)[id]!);
    const st = deviceState(d);
    if (d.state !== st) lab.devices[id]!.state = st;
    if (d.power !== 'on') continue;
    for (const disp of ['primary', 'secondary'] as const) {
      const ds = ro(disp === 'primary' ? d.display : d.secondaryDisplay);
      if (!ds) continue;
      const toastR = ro(ds.toast);
      if (toastR && toastR.untilMs <= phys) {
        const w = dispOf(lab.devices[id]!, disp)!;
        w.toast = null;
        w.rev += 1;
      }
      if (ds.autoAdvanceAtMs != null && ds.autoAdvanceAtMs <= phys) autoAdvance(lab, ctx, lab.devices[id]!, disp);
    }
    // Idle lock (Sim §3.8.1): merchant displays at rest lock after 10 min physical without input.
    if (d.role !== 'cfd' && (d.lastInputPhysMs ?? 0) + IDLE_LOCK_MS <= phys && sub.dtPhysMs > 0) {
      const dd = ro(ro(ro(lab).devices)[id]!);
      const s = ro(dd.display).screen;
      const o = ro(dd.order);
      const idle = s === 'home' || s.startsWith('app-') || (s === 'register' && (!o || ro(o.lines).length === 0));
      if (idle) {
        const w = lab.devices[id]!;
        w.order = null;
        setScreen(lab, ctx, w, 'primary', 'lock', { instant: true });
      }
    }
  }
  // Tethered pay-display link (Sim §3.8.6).
  const devs = ro(ro(lab).devices);
  const switchUp = ro(ro(lab).network).switchUp;
  for (const id of Object.keys(devs).sort()) {
    const mfd = ro(devs[id]!);
    if (mfd.role !== 'mfd' || !mfd.tetheredTo) continue;
    const cfd = ro(devs[mfd.tetheredTo]);
    if (!cfd) continue;
    const usb = mfd.payDisplayApp === 'USB_PAY_DISPLAY';
    const cable = usb ? mfd.hubUsbToPeer && cfd.hubUsbToPeer : mfd.hubEthernet && cfd.hubEthernet && switchUp;
    const link: 'UP' | 'DOWN' = mfd.power === 'on' && cfd.power === 'on' && cable ? 'UP' : 'DOWN';
    if (mfd.payDisplayLink === link && cfd.payDisplayLink === link) continue;
    lab.devices[id]!.payDisplayLink = link;
    const cw = lab.devices[mfd.tetheredTo]!;
    cw.payDisplayLink = link;
    ctx.emit('device.payDisplayLink', { mfdDeviceId: id, cfdDeviceId: cw.id, link });
    if (cfd.power !== 'on') continue;
    if (link === 'DOWN') {
      if (ro(cfd.display).screen !== 'waiting-for-merchant') setScreen(lab, ctx, cw, 'primary', 'waiting-for-merchant');
    } else if (ro(cfd.display).screen === 'waiting-for-merchant') cw.display.autoAdvanceAtMs = phys + 1_500;
  }
}

/* ────────────────────────────── touches (Sim §3.5.4) ────────────────────────────── */

export interface TouchOutcome {
  hitButton: string | null;
  result: TouchResult;
}

/** A touch at (x, y) mm on a display. `probe` applies the core rule; adb/player use the rect. */
export function deviceTouch(lab: LabState, ctx: Ctx, deviceId: string, disp: Disp, xMm: number, yMm: number, source: 'adb' | 'probe' | 'player'): Result<TouchOutcome> {
  const d = lab.devices[deviceId];
  if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
  const ds = dispOf(d, disp);
  if (!ds) return { ok: false, error: `${deviceId} has no ${disp} display` };
  const emit = (hitButton: string | null, result: TouchResult): Result<TouchOutcome> => {
    ctx.emit('device.touched', { deviceId, display: disp, xMm: Math.round(xMm * 10) / 10, yMm: Math.round(yMm * 10) / 10, source, hitButton, screen: ds.screen, result });
    return { ok: true, value: { hitButton, result } };
  };
  if (d.power !== 'on') return emit(null, 'MISS');
  d.lastInputPhysMs = lab.time.physMs;
  if (ds.brightness < 1) {
    ds.brightness = 1;
    ds.rev += 1;
  }
  if (source === 'adb' && ds.screen === 'pin-entry') {
    logcat(d, 'W SecureTouch: injected input rejected');
    return emit(null, 'SECURE_REJECTED');
  }
  if (ds.renderDoneMs != null && lab.time.physMs < ds.renderDoneMs) return emit(null, 'NOT_RENDERED');
  const els = liveElements(lab, d, disp).filter((e) => e.kind === 'button' || e.kind === 'pad');
  const hit = els.find((e) => Math.abs(xMm - e.x) <= e.w / 2 + 1e-9 && Math.abs(yMm - e.y) <= e.h / 2 + 1e-9);
  if (!hit) {
    if (ds.screen === 'lock' && !ds.params.pad) {
      press(lab, ctx, d, disp, 'wake');
      return emit(null, 'MISS');
    }
    return emit(null, 'MISS');
  }
  if (hit.kind === 'pad') return emit(null, 'MISS');
  if (source === 'probe') {
    const core = coreMm(hit);
    if (Math.abs(xMm - hit.x) > core + 1e-9 || Math.abs(yMm - hit.y) > core + 1e-9) {
      logcat(d, 'I InputReader: touch rejected (edge contact, pressure 0.12)');
      return emit(null, 'EDGE_REJECT');
    }
  }
  if (!hit.enabled) {
    toast(lab, ctx, d, disp, TOAST.noPrinter);
    return emit(hit.id, 'DISABLED');
  }
  const r = emit(hit.id, 'HIT');
  press(lab, ctx, d, disp, hit.id);
  return r;
}

/** A stroke: signature line, launcher scroll, lock-screen swipe up (Sim §3.5.4). */
export function deviceStroke(lab: LabState, ctx: Ctx, deviceId: string, disp: Disp, points: { xMm: number; yMm: number }[], source: 'adb' | 'probe' | 'player'): Result<{ effect: 'signature' | 'scroll' | 'ignored' }> {
  const d = lab.devices[deviceId];
  if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
  const ds = dispOf(d, disp);
  if (!ds) return { ok: false, error: `${deviceId} has no ${disp} display` };
  let effect: 'signature' | 'scroll' | 'ignored' = 'ignored';
  if (d.power === 'on' && points.length >= 2) {
    d.lastInputPhysMs = lab.time.physMs;
    const a = points[0]!;
    const b = points[points.length - 1]!;
    const dx = b.xMm - a.xMm;
    const dy = b.yMm - a.yMm;
    if (ds.screen === 'pin-entry' && source === 'adb') {
      logcat(d, 'W SecureTouch: injected input rejected');
    } else if (ds.screen === 'signature') {
      const pad = liveElements(lab, d, disp).find((e) => e.kind === 'pad');
      if (pad && Math.abs(a.xMm - pad.x) <= pad.w / 2 && Math.abs(a.yMm - pad.y) <= pad.h / 2) {
        ds.strokes += 1;
        ds.rev += 1;
        effect = 'signature';
      }
    } else if (ds.screen === 'home' && disp === 'primary') {
      const vertical = DEVICE_TYPES[d.type].launcherScroll === 'vertical';
      const travel = vertical ? dy : dx;
      if (Math.abs(travel) >= 20) {
        const page = Math.max(0, Math.min(1, d.launcher.page + (travel < 0 ? 1 : -1)));
        effect = 'scroll';
        if (page !== d.launcher.page) {
          d.launcher.page = page;
          ds.params = { ...ds.params, page };
          ds.rev += 1;
        }
      }
    } else if (ds.screen === 'lock' && dy <= -20) {
      if (!ds.params.pad) setScreen(lab, ctx, d, disp, 'lock', { params: { pad: true, typed: '' }, instant: true });
      effect = 'scroll';
    }
  }
  ctx.emit('device.stroke', { deviceId, display: disp, source, effect });
  return { ok: true, value: { effect } };
}

/* ────────────────────────────── cards by hand / SDK ────────────────────────────── */

export function presentCardByHand(lab: LabState, ctx: Ctx, deviceId: string, entry: CardEntry, profileRef: number | string): Result {
  const d = lab.devices[deviceId];
  if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
  const prof = typeof profileRef === 'number' ? lab.orca.cardProfiles[profileRef] : Object.values(lab.orca.cardProfiles).find((c) => c.name === profileRef);
  if (!prof) return { ok: false, error: `no card profile '${profileRef}'` };
  const owner = d.role === 'cfd' && d.tetheredTo ? lab.devices[d.tetheredTo]! : d;
  const c = customerSide(lab, owner);
  const e = cardEvent(lab, ctx, c.dev, c.disp, prof, entry, { trusted: true });
  return e ? { ok: false, error: e } : { ok: true, value: undefined };
}

/* ────────────────────────────── hardware swap & provisioning ────────────────────────────── */

/** Laz end state (Sim §3.17.2 assign-merchant / §4.4.1 device.provision). */
export function provisionDevice(lab: LabState, ctx: Ctx, d: TerminalDevice, merchantId: number | null, resetAdb = false): void {
  const m = merchantId != null ? lab.orca.merchants[merchantId] : undefined;
  d.merchantConfigId = m ? m.id : null;
  d.provisioned = !!m;
  d.apps = appsFor(m);
  d.launcher = { page: 0, apps: [...d.apps] };
  d.order = null;
  if (resetAdb) {
    if (d.adbTcpPort !== null) {
      d.adbTcpPort = null;
      ctx.emit('device.adbTcpChanged', { deviceId: d.id, port: null });
    }
  }
  if (d.power === 'on') {
    setScreen(lab, ctx, d, 'primary', d.role === 'cfd' ? 'customer-idle' : 'home');
    if (d.secondaryDisplay) setScreen(lab, ctx, d, 'secondary', 'customer-idle');
  }
  ctx.emit('device.provisioned', { deviceId: d.id, merchantConfigId: d.merchantConfigId });
}

/** Physically swap a rig's device (Sim §3.24): old → storage (unplugged), new seated and powered; Orca untouched. */
export function swapHardware(lab: LabState, ctx: Ctx, rigId: string, newType: DeviceTypeCode, opts: { deviceId?: string; storeAt?: string } = {}): Result<{ deviceId: string }> {
  const rig = lab.rigs[rigId];
  if (!rig) return { ok: false, error: `unknown rig '${rigId}'` };
  const stored = (d: TerminalDevice) => !d.rigId || !lab.rigs[d.rigId];
  const incoming = opts.deviceId ? lab.devices[opts.deviceId] : Object.values(lab.devices).sort((a, b) => (a.id < b.id ? -1 : 1)).find((d) => d.type === newType && stored(d) && !d.rigId?.startsWith('desk-'));
  if (!incoming) return { ok: false, error: `No ${DEVICE_TYPES[newType]?.displayName ?? newType} available in storage` };
  if (!stored(incoming)) return { ok: false, error: `${incoming.id} is installed on ${incoming.rigId}` };
  if (incoming.type !== newType) return { ok: false, error: `${incoming.id} is a ${DEVICE_TYPES[incoming.type].displayName}, not a ${DEVICE_TYPES[newType].displayName}` };
  const fam = DEVICE_TYPES[newType].family;
  const candidates = rig.deviceIds.map((id) => lab.devices[id]!).filter(Boolean);
  const old = candidates.length > 1 ? (candidates.find((d) => d.role === 'cfd' && DEVICE_TYPES[d.type].family === fam) ?? candidates.find((d) => DEVICE_TYPES[d.type].family === fam) ?? candidates.find((d) => d.role === 'cfd')!) : candidates[0];
  if (!old) return { ok: false, error: `${rigId} has no device to swap` };
  // Move the PSU hookup from the old device's brick to the new one.
  const oldLoad = Object.values(lab.power.loads).find((l) => l.deviceId === old.id);
  const newLoad = Object.values(lab.power.loads).find((l) => l.deviceId === incoming.id);
  const hookup = oldLoad ? { ...oldLoad.supply } : { ...old.supply };
  if (oldLoad && oldLoad.supply.kind !== 'none') {
    for (const s of Object.values(lab.power.strips)) {
      const i = s.loads.indexOf(oldLoad.id);
      if (i >= 0) s.loads[i] = null;
    }
    oldLoad.supply = { kind: 'none', targetId: null };
    ctx.emit('power.unplugged', { loadId: oldLoad.id });
  }
  old.supply = { kind: 'none', targetId: null };
  devicePowerOff(lab, ctx, old);
  const storeAt = opts.storeAt ?? 'storage-shelf';
  const ip = old.ip;
  const role = old.role;
  const partner = old.tetheredTo ? lab.devices[old.tetheredTo] : undefined;
  incoming.rigId = rigId;
  incoming.ip = ip;
  incoming.role = DEVICE_TYPES[newType].dualScreenSingleAdb && role !== 'cfd' ? 'duo' : role === 'duo' ? 'standalone' : role;
  incoming.tetheredTo = old.tetheredTo;
  incoming.link = old.link;
  incoming.payDisplayApp = old.payDisplayApp;
  incoming.payDisplayLink = old.payDisplayLink;
  incoming.hubEthernet = true;
  incoming.hubUsbToPeer = true;
  incoming.adbTcpPort = 5444;
  if (partner) partner.tetheredTo = incoming.id;
  old.rigId = storeAt;
  old.ip = '';
  old.tetheredTo = null;
  if (hookup.kind === 'ac-strip' && newLoad) {
    const s = hookup.targetId ? lab.power.strips[hookup.targetId] : undefined;
    if (s && hookup.socket) {
      for (const st of Object.values(lab.power.strips)) {
        const i = st.loads.indexOf(newLoad.id);
        if (i >= 0) st.loads[i] = null;
      }
      s.loads[hookup.socket - 1] = newLoad.id;
      newLoad.supply = { kind: 'ac-strip', targetId: s.id, socket: hookup.socket };
      incoming.supply = { ...newLoad.supply };
      ctx.emit('power.plugged', { loadId: newLoad.id, hookup: { ...newLoad.supply } });
    }
  } else incoming.supply = hookup.kind === 'none' ? { kind: 'ac-strip', targetId: 'offscreen' } : hookup;
  if (incoming.battery) incoming.battery = { pct: Math.max(incoming.battery.pct, 0), charging: true };
  // Serial binding: an Orca Device row with this serial names the device (Sim §1.15).
  const row = Object.values(lab.orca.devices).find((r) => r.serial === incoming.serial);
  incoming.orcaDeviceName = row ? row.name : '';
  rig.deviceIds = rig.deviceIds.map((id) => (id === old.id ? incoming.id : id));
  ctx.emit('device.swapped', { rigId, removedDeviceId: old.id, installedDeviceId: incoming.id });
  log(lab, 'devices', 'info', `${rigId}: ${old.id} → ${storeAt}, ${incoming.id} installed`);
  return { ok: true, value: { deviceId: incoming.id } };
}

/** Front power key: short = screen sleep/wake, long = power off and restart [sim]. */
export function devicePressPower(lab: LabState, ctx: Ctx, deviceId: string, longPress: boolean): Result {
  const d = lab.devices[deviceId];
  if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
  if (d.power === 'fried' || d.dead) return { ok: true, value: undefined };
  if (longPress) {
    if (d.power === 'on' || d.power === 'booting') {
      devicePowerOff(lab, ctx, d);
      deviceBoot(lab, ctx, d);
    }
    return { ok: true, value: undefined };
  }
  if (d.power === 'on') {
    d.display.brightness = d.display.brightness > 0 ? 0 : 1;
    d.display.rev += 1;
    d.lastInputPhysMs = lab.time.physMs;
  }
  return { ok: true, value: undefined };
}

export { isHandheld };
