/** Fault catalogue §4.3.4 (LabSim devices, tethering) and §4.3.5 (Collis / SmartStripe probes, Callus files) — core. */
import type { TerminalDevice, CollisProbe, LabState } from '../../types';
import { DEVICE_TYPE_CODES } from '../../types';
import type { CoreFaultDef, Params, Record_ } from './helpers';
import { info, list, nothing, num, ok, p, str, undoPatches, w } from './helpers';
import { DEVICE_TYPES, isHandheld } from '../../seed/deviceTypes';
import { mirrorCallusFiles } from '../../seed';
import { devicePowerOff } from '../devices';
import { setDeviceQrFirmware } from '../flags';
import { gortCardFilesAt, gortMainCardFiles } from '../hosts';
import { robotByName } from '../orca/status';
import { rigOf } from '../orca/entities';

const invalid = (id: string, name: string, v: string, reason: string) => ({ ok: false as const, error: `fault ${id}: invalid param ${name}='${v}' (${reason})` });
const dev = (lab: LabState, params: Params, key = 'device'): TerminalDevice | undefined => lab.devices[str(params[key])];

/** The PSU load that powers a device (`psu-<orca name>` / spares), or undefined (off-screen device). */
function deviceLoadId(lab: LabState, deviceId: string): string | undefined {
  for (const id of Object.keys(lab.power.loads).sort()) if (lab.power.loads[id]!.deviceId === deviceId) return id;
  return undefined;
}

/** Unplug a load from wherever it is (strip socket or DC terminal), recording the writes. */
function unplugLoad(lab: LabState, record: Record_, loadId: string): void {
  const load = lab.power.loads[loadId]!;
  const sup = load.supply;
  if (sup.kind === 'ac-strip' && sup.targetId && lab.power.strips[sup.targetId]) {
    const s = lab.power.strips[sup.targetId]!;
    const idx = s.loads.indexOf(loadId);
    if (idx >= 0) w(lab, record, ['power', 'strips', s.id, 'loads', idx], null);
  } else if (sup.kind === 'dc-rail' && sup.targetId && lab.power.terminals[sup.targetId]?.plugged === loadId) {
    w(lab, record, ['power', 'terminals', sup.targetId, 'plugged'], null);
  }
  w(lab, record, ['power', 'loads', loadId, 'supply'], { kind: 'none', targetId: null });
}

/** Is the device's supply connected (load supply / own supply)? */
function deviceSupplied(lab: LabState, d: TerminalDevice): boolean {
  const lid = deviceLoadId(lab, d.id);
  return lid ? lab.power.loads[lid]!.supply.kind !== 'none' : d.supply.kind !== 'none';
}

/** Tethered pair of a robot (runtime MFD + CFD devices on its rig). */
function tetherPair(lab: LabState, robotName: string): { mfd: TerminalDevice; cfd: TerminalDevice } | null {
  const robot = robotByName(lab, robotName);
  const rig = robot ? rigOf(lab, robot) : lab.rigs[robotName];
  if (!rig) return null;
  const devs = rig.deviceIds.map((id) => lab.devices[id]).filter((d): d is TerminalDevice => !!d);
  const mfd = devs.find((d) => d.role === 'mfd');
  const cfd = mfd?.tetheredTo ? lab.devices[mfd.tetheredTo] : undefined;
  return mfd && cfd ? { mfd, cfd } : null;
}

function cableOf(mfd: TerminalDevice, cable: string): 'usb' | 'ethernet' {
  if (cable === 'usb' || cable === 'ethernet') return cable;
  return mfd.payDisplayApp === 'USB_PAY_DISPLAY' ? 'usb' : 'ethernet';
}

/** Probe power input present (Collis PSU plugged / SmartStripe USB on the shelf Pi). */
function probeSupplied(lab: LabState, c: CollisProbe): boolean {
  if (c.kind === 'smartstripe') {
    const host = c.supply.targetId ? lab.hosts[c.supply.targetId] : undefined;
    return !!host && host.usb.includes(`smartstripe:${c.rigId}`);
  }
  const load = lab.power.loads[`psu-collis-${c.rigId}`];
  if (load && load.collisId === c.id) return load.supply.kind !== 'none';
  return c.supply.kind !== 'none';
}

const probeHealthy = (lab: LabState, c: CollisProbe): boolean => probeSupplied(lab, c) && c.powered && c.ribbonConnected && c.state === 'OK';

/** Every `cards/**` file on gort `main` is present in the box's local clone. */
function callusUpToDate(lab: LabState, hostId: string): boolean {
  const local = lab.callus.localCardFiles[hostId];
  if (!local) return false;
  const have = new Set(local.files);
  return gortMainCardFiles(lab).files.every((f) => have.has(f));
}

export const DEVICE_FAULTS: CoreFaultDef[] = [
  {
    info: info('device.unpowered', 'Device brick unplugged', 'devices', [p('device', 'device', 'Runtime device id (dev-…)', { required: true, target: true, example: 'dev-eve-flex4' }), p('battery', 'number', 'Battery % left on handhelds', { default: 0 })], {
      tags: ['power.18v', 'power.rails', 'hw.devices'],
      clears: "power == 'on'",
      symptoms: ['device dark', 'Orca stays Available (/health does not cover the device)', "builds adb: failed to connect to '10.42.30.12:5444': No route to host"],
      usedBy: ['INC17', 'P1-2'],
    }),
    validate(lab, params) {
      const d = dev(lab, params);
      if (!d) return invalid('device.unpowered', 'device', str(params.device), 'no such device');
      if (Number.isNaN(num(params.battery, 0))) return invalid('device.unpowered', 'battery', str(params.battery), 'not a number');
      if (!deviceSupplied(lab, d)) return nothing('device.unpowered', `${d.id} brick is already unplugged`);
      return ok(d.id);
    },
    apply(lab, ctx, params, record) {
      const d = dev(lab, params)!;
      const lid = deviceLoadId(lab, d.id);
      if (lid) unplugLoad(lab, record, lid);
      w(lab, record, ['devices', d.id, 'supply'], { kind: 'none', targetId: null });
      if (d.battery && isHandheld(d.type)) w(lab, record, ['devices', d.id, 'battery'], { pct: Math.max(0, Math.min(100, num(params.battery, 0))), charging: false });
      devicePowerOff(lab, ctx, d);
      if (lid) ctx.emit('power.unplugged', { loadId: lid });
    },
    isResolved(lab, f) {
      const d = lab.devices[f.target];
      return !!d && d.power === 'on' && deviceSupplied(lab, d);
    },
  },
  {
    info: info('device.dead', 'Device hardware failure', 'devices', [p('device', 'device', 'Runtime device id', { required: true, target: true, example: 'dev-k-9-duo2' })], {
      tags: ['hw.devices'],
      clears: 'API only, or when no rig holds the device (swapped out / RMA)',
      symptoms: ['adb … No route to host', 'the rig stays Available (its Pi is fine)'],
      usedBy: ['INC44'],
      apiOnly: true,
    }),
    validate(lab, params) {
      const d = dev(lab, params);
      if (!d) return invalid('device.dead', 'device', str(params.device), 'no such device');
      if (d.dead || d.power === 'fried') return nothing('device.dead', `${d.id} is already dead`);
      return ok(d.id);
    },
    apply(lab, ctx, params, record) {
      const d = dev(lab, params)!;
      w(lab, record, ['devices', d.id, 'dead'], true);
      devicePowerOff(lab, ctx, d);
    },
    isResolved: (lab, f) => !Object.values(lab.rigs).some((r) => r.deviceIds.includes(f.target)),
  },
  {
    info: info('device.adbTcpReset', 'ADB-over-TCP not re-enabled', 'devices', [p('device', 'device', 'Runtime device id', { required: true, target: true, example: 'dev-data-mini3' })], {
      tags: ['adb.port', 'adb.usage', 'laz.oobe', 'hw.pi'],
      clears: 'adbTcpPort == 5444',
      symptoms: ["adb connect 10.42.30.31:5444 → failed to connect to '10.42.30.31:5444': Connection refused", 'Orca Available; USB ADB from the Pi still lists the serial'],
      usedBy: ['INC28'],
    }),
    validate(lab, params) {
      const d = dev(lab, params);
      if (!d) return invalid('device.adbTcpReset', 'device', str(params.device), 'no such device');
      if (d.adbTcpPort !== 5444) return nothing('device.adbTcpReset', `${d.id} is not listening on 5444`);
      return ok(d.id);
    },
    apply(lab, ctx, params, record) {
      const d = dev(lab, params)!;
      w(lab, record, ['devices', d.id, 'adbTcpPort'], null);
      ctx.emit('device.adbTcpChanged', { deviceId: d.id, port: null });
    },
    isResolved: (lab, f) => lab.devices[f.target]?.adbTcpPort === 5444,
  },
  {
    info: info('device.printerNoPaper', 'Printer out of paper', 'devices', [p('device', 'device', 'Runtime id of a device with a printer', { required: true, target: true, example: 'dev-wall-e-flex3' })], {
      tags: ['hw.devices'],
      clears: 'printer.paper (device.loadPaper)',
      symptoms: ['Print → toast Printer out of paper, no payload', 'select print timeout'],
      usedBy: ['FP'],
    }),
    validate(lab, params) {
      const d = dev(lab, params);
      if (!d) return invalid('device.printerNoPaper', 'device', str(params.device), 'no such device');
      if (!DEVICE_TYPES[d.type].hasPrinter || !d.printer.present) return invalid('device.printerNoPaper', 'device', d.id, 'no printer on this device');
      if (!d.printer.paper) return nothing('device.printerNoPaper', `${d.id} printer is already out of paper`);
      return ok(d.id);
    },
    apply(lab, _ctx, params, record) {
      w(lab, record, ['devices', str(params.device), 'printer', 'paper'], false);
    },
    isResolved: (lab, f) => !!lab.devices[f.target]?.printer.paper,
  },
  {
    info: info('laz.skipAdbRestore', 'Laz forgets to restore ADB-over-TCP', 'devices', [p('device', 'device', 'Runtime device id', { target: true, default: 'dev-data-mini3' })], {
      tags: ['laz.oobe', 'adb.port', 'adb.usage'],
      clears: 'adbTcpPort == 5444 and a Laz run on the device has finished since injection',
      symptoms: ['the next Laz run skips restore-adb silently', 'afterwards adbTcpPort = null: as device.adbTcpReset', 'the build console still ends laz: merchant active'],
      usedBy: ['INC28'],
    }),
    validate(lab, params) {
      const d = dev(lab, params);
      if (!d) return invalid('laz.skipAdbRestore', 'device', str(params.device), 'no such device');
      return ok(d.id);
    },
    apply() {
      // No state write: while ACTIVE the next Laz run on the device skips `restore-adb` (core/laz.ts).
    },
    isResolved(lab, f) {
      const d = lab.devices[f.target];
      if (!d || d.adbTcpPort !== 5444) return false;
      return Object.values(lab.laz.runs).some((r) => r.deviceId === f.target && r.startedMs >= f.injectedMs && (r.step === 'done' || r.step === 'failed'));
    },
  },
  {
    info: info(
      'receipt.qrRollout',
      '"Scan for receipt" firmware reaches devices',
      'devices',
      [
        p('devices', 'list', 'Runtime device ids (or use deviceTypes)', { target: true, example: 'dev-eve-flex4' }),
        p('deviceTypes', 'list', 'Device Types whose lab devices get the firmware', { example: 'FLEX_4', values: [...DEVICE_TYPE_CODES] }),
        p('on', 'boolean', 'Firmware with (true) or without (false) the QR feature', { default: true }),
      ],
      {
        tags: ['receipt.qr', 'receipt.maps'],
        clears: 'API only (firmware does not roll back)',
        symptoms: ['receipt screens show 5 options with every button 3.0 mm lower', 'a missing / stale _5 map then 404s or misses'],
        usedBy: ['M09', 'P2-3'],
        apiOnly: true,
      },
    ),
    validate(lab, params) {
      const ids = list(params.devices);
      const types = list(params.deviceTypes);
      if (!ids.length && !types.length) return invalid('receipt.qrRollout', 'devices', '', 'missing');
      for (const id of ids) if (!lab.devices[id]) return invalid('receipt.qrRollout', 'devices', id, 'no such device');
      for (const t of types) if (!(DEVICE_TYPE_CODES as readonly string[]).includes(t)) return invalid('receipt.qrRollout', 'deviceTypes', t, `not one of ${DEVICE_TYPE_CODES.join(', ')}`);
      return ok(ids.length ? ids.join(',') : types.join(','));
    },
    apply(lab, _ctx, params, record) {
      const on = params.on === undefined ? true : params.on === true || params.on === 'true';
      const ids = new Set(list(params.devices));
      const types = new Set(list(params.deviceTypes));
      for (const id of Object.keys(lab.devices).sort()) {
        const d = lab.devices[id]!;
        if (!ids.has(id) && !(types.has(d.type) && d.rigId != null && !!lab.rigs[d.rigId])) continue;
        setDeviceQrFirmware(lab, d, on, (path, value) => w(lab, record, path, value));
      }
    },
    isResolved: () => false,
  },
  {
    info: info('tether.linkDown', 'Pay-display link cable unseated', 'devices', [p('robot', 'robot', 'Tethered robot (MFD ≠ CFD)', { target: true, default: 'optimus' }), p('cable', 'string', 'Which hub cable (auto = by pay-display app)', { default: 'auto', values: ['auto', 'usb', 'ethernet'] })], {
      tags: ['semi.paydisplay', 'orca.tethered', 'uia.taxtest'],
      clears: "payDisplayLink == 'UP'",
      symptoms: ['CFD Waiting for merchant device…', 'MFD Charge → Connecting to customer display… then back to review-order after 30 s', 'TaxTest [CFD_O1] waitForScreen timed out (CustomerOrderScreen) → WAIT_TIMEOUT'],
      usedBy: ['INC47'],
    }),
    validate(lab, params) {
      const name = str(params.robot);
      const pair = tetherPair(lab, name);
      if (!pair) return invalid('tether.linkDown', 'robot', name, 'no such tethered robot');
      const c = str(params.cable) || 'auto';
      if (!['auto', 'usb', 'ethernet'].includes(c)) return invalid('tether.linkDown', 'cable', c, 'not one of auto, usb, ethernet');
      const cable = cableOf(pair.mfd, c);
      if (cable === 'usb' ? !pair.mfd.hubUsbToPeer : !pair.cfd.hubEthernet) return nothing('tether.linkDown', `${name} ${cable} cable is already unseated`);
      return ok(name);
    },
    apply(lab, _ctx, params, record) {
      const pair = tetherPair(lab, str(params.robot))!;
      const cable = cableOf(pair.mfd, str(params.cable) || 'auto');
      if (cable === 'usb') w(lab, record, ['devices', pair.mfd.id, 'hubUsbToPeer'], false);
      else w(lab, record, ['devices', pair.cfd.id, 'hubEthernet'], false);
    },
    isResolved(lab, f) {
      const pair = tetherPair(lab, f.target);
      if (!pair) return false;
      const cables = pair.mfd.hubUsbToPeer && pair.cfd.hubUsbToPeer && pair.mfd.hubEthernet && pair.cfd.hubEthernet;
      return cables && pair.mfd.payDisplayLink === 'UP';
    },
  },
  /* ── §4.3.5 Collis / SmartStripe probes and Callus files ── */
  {
    info: info('collis.unpowered', 'Probe unpowered', 'cards', [p('probe', 'probe', 'Collis / SmartStripe probe id', { required: true, target: true, example: 'collis-wall-e' })], {
      tags: ['hw.collis', 'power.18v', 'cards.callus'],
      clears: "powered && ribbonConnected && state == 'OK'",
      symptoms: ['LED off', 'Callus /status {"id":"collis-wall-e","state":"OFFLINE"}', '[callus] probe collis-wall-e: PROBE_OFFLINE'],
      usedBy: ['INC18-A'],
    }),
    validate(lab, params) {
      const c = lab.collis[str(params.probe)];
      if (!c) return invalid('collis.unpowered', 'probe', str(params.probe), 'no such probe');
      if (!probeSupplied(lab, c)) return nothing('collis.unpowered', `${c.id} is already unpowered`);
      return ok(c.id);
    },
    apply(lab, ctx, params, record) {
      const c = lab.collis[str(params.probe)]!;
      if (c.kind === 'smartstripe') {
        const host = lab.hosts[c.supply.targetId!]!;
        const usbId = `smartstripe:${c.rigId}`;
        w(lab, record, ['hosts', host.id, 'usb'], host.usb.filter((u) => u !== usbId));
        ctx.emit('host.usbChanged', { hostId: host.id, usbId, attached: false });
        return;
      }
      const lid = `psu-collis-${c.rigId}`;
      if (lab.power.loads[lid]?.collisId === c.id) {
        unplugLoad(lab, record, lid);
        ctx.emit('power.unplugged', { loadId: lid });
      }
      w(lab, record, ['collis', c.id, 'supply'], { kind: 'none', targetId: null });
    },
    isResolved(lab, f) {
      const c = lab.collis[f.target];
      return !!c && probeHealthy(lab, c);
    },
  },
  {
    info: info('collis.ribbonUnseated', 'Rear ribbon unseated', 'cards', [p('probe', 'probe', 'Collis probe id', { required: true, target: true, example: 'collis-eve' })], {
      tags: ['hw.collis', 'cards.callus'],
      clears: "powered && ribbonConnected && state == 'OK'",
      symptoms: ['LED amber', '/status NO_LINK', 'PROBE_NO_LINK'],
      usedBy: ['INC18-B'],
    }),
    validate(lab, params) {
      const c = lab.collis[str(params.probe)];
      if (!c) return invalid('collis.ribbonUnseated', 'probe', str(params.probe), 'no such probe');
      if (c.kind !== 'collis') return invalid('collis.ribbonUnseated', 'probe', c.id, 'a SmartStripe probe has no ribbon');
      if (!c.ribbonConnected) return nothing('collis.ribbonUnseated', `${c.id} ribbon is already unseated`);
      return ok(c.id);
    },
    apply(lab, _ctx, params, record) {
      w(lab, record, ['collis', str(params.probe), 'ribbonConnected'], false);
    },
    isResolved(lab, f) {
      const c = lab.collis[f.target];
      return !!c && probeHealthy(lab, c);
    },
  },
  {
    info: info('callus.syncStale', 'Box missed GortCardSync', 'cards', [p('host', 'host', 'Windows box running Callus', { target: true, default: 'minix-02' }), p('commit', 'string', 'gort commit the box last synced', { default: '9f02a1b' })], {
      tags: ['cards.callus', 'cards.diptap', 'tools.terminal'],
      clears: 'localCardFiles[host].files ⊇ every cards/** file on gort main',
      symptoms: ['[callus] map cards/nfc/interac_ca_tap.json → C:\\gort\\cards\\nfc\\interac_ca_tap.json · FileNotFoundException (The system cannot find the path specified)', 'schtasks /query /tn GortCardSync → next run 10/06/2026 10:00:00 Ready', 'dir C:\\gort\\cards\\nfc lacks the file'],
      usedBy: ['INC54'],
    }),
    validate(lab, params) {
      const h = lab.hosts[str(params.host)];
      if (!h || !lab.callus.localCardFiles[h.id] || !h.schedTasks.GortCardSync) return invalid('callus.syncStale', 'host', str(params.host), 'no such Callus box');
      if (!callusUpToDate(lab, h.id)) return nothing('callus.syncStale', `${h.id} is already behind gort main`);
      const files = gortCardFilesAt(lab, str(params.commit) || '9f02a1b');
      if (gortMainCardFiles(lab).files.every((f) => files.includes(f))) return nothing('callus.syncStale', `gort ${str(params.commit)} already has every card file on main`);
      return ok(h.id);
    },
    apply(lab, _ctx, params, record) {
      const hid = str(params.host);
      const commit = str(params.commit) || '9f02a1b';
      w(lab, record, ['callus', 'localCardFiles', hid], { syncedCommit: commit, syncedAtMs: -50_380_000, files: gortCardFilesAt(lab, commit) });
      w(lab, record, ['hosts', hid, 'schedTasks', 'GortCardSync', 'lastRunMs'], -50_400_000);
      mirrorCallusFiles(lab, hid);
    },
    isResolved: (lab, f) => callusUpToDate(lab, f.target),
    revert(lab, _ctx, f) {
      undoPatches(lab, f);
      mirrorCallusFiles(lab, f.target);
    },
  },
];
