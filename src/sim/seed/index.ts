/**
 * sim-core factory seed (Sim §2 except §2.12 repos / §2.13 Jenkins, which `seedDevops` writes).
 * `seedCore(lab)` fills Orca, rigs, devices, hosts, power, probes, Callus, workstation and network on a
 * lab created by `createEmptyLabState` (before `seedDevops`, so the Jenkins history reads real Orca rows;
 * `createFactoryLab` re-mirrors the Callus card files once gort is seeded).
 */
import type { TerminalDevice, CollisProbe, LabState, MerchantConfig, OrcaDevice, OrcaRobot, OrcaScreen, RigState, RobotNote, ScreenLocation } from '../types';
import { DEVICE_TYPE_CODES } from '../types';
import { createTerminalDevice, createDisplayState, createOrcaRobot, createRigState } from '../builders';
import { DEVICE_TYPES, isHandheld, layoutIdFor, screenOf } from './deviceTypes';
import { CFD_ORCA_SCREENS, GENERIC_ORCA_SCREENS, LAYOUTS, ORCA_SCREEN_DESCRIPTIONS } from './layouts';
import { BASE_APPS, seedMerchants } from './merchants';
import { canonicalCardFile, FACTORY_CARD_FILES, seedCapabilities, seedCardProfiles, seedScreenCompareImages } from './cards';
import { PAY_DISPLAY_APP, ROSTER, piDefs } from './robots';
import type { RosterDevice, RosterRow } from './robots';
import { seedHosts, serialFor } from './hosts';
import { seedPower } from './power';
import { cameraIdForOctet, cameraUrl } from './cameras';
import { fmtStamp } from '../text/time';
import { parseControllerYaml } from '../core/hosts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/** Firmware for a device type (Sim §2.4): FLEX_1 is end-of-life and never gets the QR feature. */
export function factoryFirmware(type: string, receiptQrFeature: boolean): { version: string; receiptQr: boolean } {
  if (type === 'FLEX_1') return { version: '2.19.4', receiptQr: false };
  return receiptQrFeature ? { version: '2.26.10.1', receiptQr: true } : { version: '2.26.08.3', receiptQr: false };
}

/** Launcher/app list of a device provisioned with `merchant` (Sim §3.17.2 assign-merchant). */
export function appsFor(merchant: MerchantConfig | null | undefined): string[] {
  return [...BASE_APPS, ...(merchant?.apps ?? [])];
}

/** Display params for the launcher (page, App Market ↔ LabSim Dining slot). */
export function homeParams(device: Pick<TerminalDevice, 'apps' | 'launcher'>): Record<string, string | number | boolean> {
  return { page: device.launcher.page, dining: device.apps.includes('LabSim Dining') };
}

function note(id: number, atMs: number, author: string, kind: RobotNote['kind'], text: string, endpoint?: string): RobotNote {
  return { id, atMs, author, kind, text, resolved: false, repeat: 1, lastAtMs: atMs, ...(endpoint ? { endpoint } : {}) };
}

export function seedCore(lab: LabState): void {
  const merchants = seedMerchants();
  const merchantByName = (n: string) => Object.values(merchants).find((m) => m.name === n)!;
  const caps = seedCapabilities();
  const capIdByName = (n: string) => Object.values(caps).find((c) => c.name === n)!.id;
  lab.orca.merchants = merchants;
  lab.orca.capabilities = caps;
  lab.orca.cardProfiles = seedCardProfiles();
  lab.orca.screenCompareImages = seedScreenCompareImages();

  /* ── Orca Device rows (roster order, MFD before CFD) + runtime devices ── */
  const devRows: Record<number, OrcaDevice> = {};
  const devIdByName: Record<string, number> = {};
  let nextDev = 1;
  const addRow = (d: RosterDevice, label: string): number => {
    const id = nextDev++;
    devRows[id] = { id, name: d.name, deviceType: d.type, serial: serialFor(d.type, d.ip), ip: `10.42.30.${d.ip}`, label, simDeviceId: `dev-${d.name}`, retired: false };
    devIdByName[d.name] = id;
    return id;
  };
  for (const row of ROSTER) {
    addRow(row.device, `${DEVICE_TYPES[row.device.type].displayName} (${row.hrn})${row.cfd ? ' — MFD' : ''}`);
    if (row.cfd) addRow(row.cfd, `${DEVICE_TYPES[row.cfd.type].displayName} (${row.hrn}) — CFD`);
  }
  const retiredId = nextDev++;
  devRows[retiredId] = { id: retiredId, name: 'retired-flex1-legacy', deviceType: 'FLEX_1', serial: 'SIM-F1-000099', ip: '10.42.30.99', label: 'Flex 1 — retired 2025 (history)', simDeviceId: null, retired: true };
  lab.orca.devices = devRows;

  /* ── Robots, rigs, runtime devices, probes ── */
  const deviceLoads: { loadId: string; deviceId: string; label: string }[] = [];
  const collisLoads: { loadId: string; collisId: string; rigId: string }[] = [];
  const pis = piDefs();
  const piByRig: Record<string, string> = {};
  for (const p of pis) for (const r of p.robots) piByRig[r] = p.id;
  const lastUsed: Record<string, number> = {
    'wall-e': -2 * HOUR,
    eve: -3 * HOUR,
    bumblebee: -4 * HOUR,
    'r2-d2': -5 * HOUR,
    'johnny-5': -6 * HOUR,
    baymax: -7 * HOUR,
    seti: -8 * HOUR,
    megatron: -9 * HOUR,
    optimus: -10 * HOUR,
    data: -11 * HOUR,
    tars: -12 * HOUR,
    astro: 6 * HOUR + 14 * MIN,
  };

  for (const row of ROSTER) {
    const merchant = merchantByName(row.merchant);
    const piIp = `10.42.10.${row.pi}`;
    const cardUrl = (p: string) => `http://${piIp}:8000/${p}`;
    const robot: OrcaRobot = createOrcaRobot(row.id, row.name, row.kind, {
      humanReadableName: row.hrn,
      status: row.status,
      environment: row.env,
      deviceId: devIdByName[row.device.name]!,
      mfdDeviceId: row.cfd || row.duoPair ? devIdByName[row.device.name]! : null,
      cfdDeviceId: row.cfd ? devIdByName[row.cfd.name]! : row.duoPair ? devIdByName[row.device.name]! : null,
      adbServiceUrl: `http://${piIp}:8000/adb`,
      cameraStreamUrl: row.cam != null ? cameraUrl(row.cam) : '',
      dipUrl: row.cards === 'DTS' ? cardUrl('dip') : null,
      tapUrl: row.cards === 'DTS' ? cardUrl('tap') : null,
      swipeUrl: row.cards ? cardUrl('swipe') : null,
      capabilityIds: row.caps.map(capIdByName),
      merchantConfigId: merchant.id,
      physical: row.physical,
      location: row.location,
      description: row.note || `${DEVICE_TYPES[row.device.type].displayName} ${row.kind === 'adb' ? 'ADB bot' : row.kind === 'tethered' ? 'tethered test bed' : 'touch robot'} · ${row.location}`,
      statusChangedMs: -2 * DAY,
      lastReleasedMs: lastUsed[row.name] ?? null,
    });
    lab.orca.robots[row.id] = robot;

    // Runtime devices.
    const deviceIds: string[] = [];
    const mk = (d: RosterDevice, role: TerminalDevice['role'], tetheredTo: string | null): TerminalDevice => {
      const id = `dev-${d.name}`;
      const type = d.type;
      const duo = DEVICE_TYPES[type].dualScreenSingleAdb;
      const apps = appsFor(merchant);
      const firmware = factoryFirmware(type, true);
      const onRig = row.physical;
      const loadId = `psu-${d.name}`;
      if (onRig) deviceLoads.push({ loadId, deviceId: id, label: `${DEVICE_TYPES[type].displayName} power brick (${row.hrn}${role === 'cfd' ? ' CFD' : role === 'mfd' ? ' MFD' : ''})` });
      const cfdSide = role === 'cfd';
      const dev = createTerminalDevice(id, type, {
        serial: serialFor(type, d.ip),
        ip: `10.42.30.${d.ip}`,
        orcaDeviceName: d.name,
        rigId: row.name,
        role,
        tetheredTo,
        link: tetheredTo ? (PAY_DISPLAY_APP[row.name] === 'USB_PAY_DISPLAY' ? 'usb' : 'network') : null,
        payDisplayApp: tetheredTo ? PAY_DISPLAY_APP[row.name]! : null,
        payDisplayLink: tetheredTo ? 'UP' : null,
        merchantConfigId: merchant.id,
        apps,
        launcher: { page: 0, apps },
        firmware: firmware.version,
        firmwareInfo: firmware,
        supply: onRig ? { kind: 'none', targetId: null } : { kind: 'ac-strip', targetId: 'offscreen' },
        display: cfdSide ? createDisplayState('customer-idle', { params: { merchant: merchant.displayName } }) : createDisplayState('home', { params: { page: 0, dining: apps.includes('LabSim Dining') } }),
        secondaryDisplay: duo ? createDisplayState('customer-idle', { params: { merchant: merchant.displayName } }) : null,
        battery: isHandheld(type) ? { pct: 100, charging: true } : null,
        lastInputPhysMs: 0,
        orderSeq: 0,
        sdcard: {},
      });
      lab.devices[id] = dev;
      deviceIds.push(id);
      return dev;
    };
    if (row.cfd) {
      mk(row.device, 'mfd', `dev-${row.cfd.name}`);
      mk(row.cfd, 'cfd', `dev-${row.device.name}`);
    } else {
      mk(row.device, DEVICE_TYPES[row.device.type].dualScreenSingleAdb ? 'duo' : 'standalone', null);
    }

    // Probe.
    let collisId: string | null = null;
    if (row.cards) {
      const smart = row.cards === 'S';
      collisId = smart ? `smartstripe-${row.name}` : `collis-${row.name}`;
      const supply = smart ? { kind: 'usb' as const, targetId: piByRig[row.name] ?? null } : row.physical ? { kind: 'none' as const, targetId: null } : { kind: 'ac-strip' as const, targetId: 'offscreen' };
      if (!smart && row.physical) collisLoads.push({ loadId: `psu-collis-${row.name}`, collisId, rigId: row.name });
      const probe: CollisProbe = {
        id: collisId,
        kind: smart ? 'smartstripe' : 'collis',
        rigId: row.name,
        callusHostId: row.callus!,
        ribbonConnected: true,
        supply,
        powered: true,
        damaged: false,
        state: 'OK',
        ledColor: 'green',
        loadedProfileId: null,
        lastAction: null,
        armed: null,
      };
      lab.collis[collisId] = probe;
    }

    // Rig.
    const gantry = row.kind === 'touch' || row.kind === 'standalone';
    const probeDisplay = gantry ? (row.duoPair ? 'secondary' : 'primary') : null;
    const scr = probeDisplay ? screenOf(row.device.type, probeDisplay) : null;
    const cameraId = cameraIdForOctet(row.cam);
    const rig: RigState = createRigState(row.name, row.id, row.kind, {
      offscreen: !row.physical,
      probeDisplay,
      piHostId: piByRig[row.name] ?? null,
      callusHostId: row.callus,
      collisId,
      deviceIds,
      webcam: { connected: row.cam != null, aimedOk: true, cameraId, aimOffsetDeg: { yaw: 0, pitch: 0 } },
      tablet: { tab: 'robot', statusText: 'Status: OK', brainbox: 'Brainbox v6', hrnShown: row.hrn, reachable: true },
      shelfPropId: row.physical ? `rig.${row.name}` : null,
      phone: { mounted: row.name === 'astro' ? 'iPhone (Go SDK mobile runner)' : null },
    });
    if (scr) {
      rig.gantry.maxXMm = Math.round((scr.wMm + 10) * 10) / 10;
      rig.gantry.maxYMm = Math.round((scr.hMm + 10) * 10) / 10;
    }
    lab.rigs[row.name] = rig;
  }

  /* ── Status seeds and notes (Sim §2.3 design notes) ── */
  let noteSeq = 1;
  const addNote = (rid: number, n: Omit<RobotNote, 'id'>) => {
    lab.orca.robots[rid]!.notes.unshift({ ...n, id: noteSeq++ });
  };
  const ts = (ms: number) => fmtStamp(lab.time, ms);
  const hist = (rid: number, atMs: number, from: OrcaRobot['status'], to: OrcaRobot['status'], by: string) => {
    const r = lab.orca.robots[rid]!;
    r.statusHistory.push({ atMs, from, to, by });
    r.statusChangedMs = atMs;
  };
  // ROSIE / BENDER / KRYTEN Unavailable (PayCore), set weeks ago.
  for (const [rid, at] of [
    [8, -14 * DAY + 11 * HOUR + 3 * MIN],
    [20, -21 * DAY + 15 * HOUR + 20 * MIN],
    [33, -9 * DAY + 10 * HOUR + 12 * MIN],
  ] as const) {
    addNote(rid, note(0, at, 'jared', 'STATUS', `${ts(at)} STATUS Available → Unavailable (jared)`));
    hist(rid, at, 'AVAILABLE', 'UNAVAILABLE', 'jared');
  }
  // ROBBY / DALEK Offline (previous week).
  const robbyAt = -6 * DAY + 16 * HOUR + 40 * MIN;
  addNote(22, note(0, robbyAt, 'jared', 'STATUS', `${ts(robbyAt)} STATUS Available → Offline (jared)`));
  addNote(22, note(0, robbyAt + 65_000, 'jared', 'MANUAL', `${ts(robbyAt + 65_000)} Assembling data profiles — Jared`));
  hist(22, robbyAt, 'AVAILABLE', 'OFFLINE', 'jared');
  const dalekAt = -4 * DAY + 9 * HOUR + 15 * MIN;
  addNote(37, note(0, dalekAt, 'jared', 'STATUS', `${ts(dalekAt)} STATUS Available → Offline (jared)`));
  addNote(37, note(0, dalekAt + 40_000, 'jared', 'MANUAL', `${ts(dalekAt + 40_000)} Flex 1 parked; rebuild queued — J`));
  hist(37, dalekAt, 'AVAILABLE', 'OFFLINE', 'jared');
  // SONNY Connection Failed since 07:55 (off-screen Pi .74 hung), escalated at 08:02:11.
  const sonnyAt = 7 * HOUR + 55 * MIN;
  const sonnyEp = 'http://10.42.10.74:8000/health';
  addNote(26, note(0, sonnyAt, 'orca-health-check', 'HEALTH', `${ts(sonnyAt)} GET ${sonnyEp} → connect timed out after 10000 ms`, sonnyEp));
  addNote(26, note(0, 8 * HOUR + 2 * MIN + 11_000, 'tate', 'MANUAL', `${ts(8 * HOUR + 2 * MIN + 11_000)} Escalated to Jared — SD card reflash pending (tate)`));
  hist(26, sonnyAt, 'AVAILABLE', 'CONNECTION_FAILED', 'orca-health-check');
  const sonny = lab.orca.robots[26]!;
  sonny.preFailureStatus = 'AVAILABLE';
  sonny.lastHealthCheckMs = sonnyAt;
  sonny.lastHealthCheckOk = false;
  sonny.lastHealth = { atMs: sonnyAt, endpoint: sonnyEp, http: null, error: 'connect timed out after 10000 ms', latencyMs: 10_000 };
  // MOTHER Reserved by Morgan at 07:40.
  const motherAt = 7 * HOUR + 40 * MIN;
  addNote(40, note(0, motherAt, 'morgan', 'STATUS', `${ts(motherAt)} STATUS Available → Reserved (morgan)`));
  hist(40, motherAt, 'AVAILABLE', 'RESERVED', 'morgan');
  lab.orca.robots[40]!.reservedBy = 'morgan';
  lab.orca.robots[40]!.reservedAtMs = motherAt;

  /* ── Screens and Screen Locations (Sim §2.10.1): enum order × table order ── */
  const typesInLab = new Set(Object.values(devRows).filter((d) => !d.retired).map((d) => d.deviceType));
  const screens: Record<number, OrcaScreen> = {};
  const locations: Record<number, ScreenLocation> = {};
  let sid = 1;
  let lid = 1;
  for (const type of DEVICE_TYPE_CODES) {
    if (!typesInLab.has(type)) continue;
    const info = DEVICE_TYPES[type];
    const rowsFor: { name: string; display: 'primary' | 'secondary'; table: string }[] = GENERIC_ORCA_SCREENS.map((n) => ({ name: n, display: 'primary', table: n }));
    if (type === 'MINI_2' || type === 'MINI_3') rowsFor.push({ name: 'CUSTOMER_CART', display: 'primary', table: 'CUSTOMER_CART' });
    if (type === 'STATION_DUO' || type === 'STATION_DUO_2') for (const [n, t] of Object.entries(CFD_ORCA_SCREENS)) rowsFor.push({ name: n, display: 'secondary', table: t });
    for (const s of rowsFor) {
      const layout = LAYOUTS[layoutIdFor(type, s.display)];
      const id = sid++;
      const optionCount = /RECEIPT_OPTIONS_4$/.test(s.name) ? 4 : /RECEIPT_OPTIONS_5$/.test(s.name) ? 5 : null;
      screens[id] = { id, name: s.name, deviceType: type, testingProfile: info.testingProfile, display: s.display, description: ORCA_SCREEN_DESCRIPTIONS[s.name] ?? s.name, optionCount };
      for (const el of layout.screens[s.table] ?? []) {
        if (el.kind !== 'button') continue;
        locations[lid] = { id: lid, screenId: id, button: el.id, xMm: el.x, yMm: el.y };
        lid++;
        if (s.name === 'HOME' && el.id === 'App Market') {
          locations[lid] = { id: lid, screenId: id, button: 'LabSim Dining', xMm: el.x, yMm: el.y };
          lid++;
        }
      }
    }
  }
  lab.orca.screens = screens;
  lab.orca.screenLocations = locations;
  lab.orca.seq = {
    robots: ROSTER.length + 1,
    devices: nextDev,
    capabilities: Object.keys(caps).length + 1,
    merchants: Object.keys(merchants).length + 1,
    screens: sid,
    screenLocations: lid,
    cardProfiles: Object.keys(lab.orca.cardProfiles).length + 1,
    screenCompareImages: Object.keys(lab.orca.screenCompareImages).length + 1,
    notes: noteSeq,
  };
  lab.seq.note = noteSeq - 1;

  /* ── Coworker desk devices (ADB 5555) and spares ── */
  const m1 = merchants[1]!;
  const cow = (id: string, type: 'FLEX_3' | 'FLEX_4' | 'MINI_3', ip: string, serial: string, desk: string, screen: 'home' | 'lock') => {
    const apps = appsFor(m1);
    lab.devices[id] = createTerminalDevice(id, type, {
      serial,
      ip,
      orcaDeviceName: '',
      rigId: desk,
      adbTcpPort: 5555,
      merchantConfigId: 1,
      apps,
      launcher: { page: 0, apps },
      supply: { kind: 'ac-strip', targetId: 'offscreen' },
      display: screen === 'lock' ? createDisplayState('lock', { params: {} }) : createDisplayState('home', { params: { page: 0, dining: false } }),
      locked: screen === 'lock',
      firmwareInfo: factoryFirmware(type, true),
      firmware: factoryFirmware(type, true).version,
      lastInputPhysMs: 0,
      orderSeq: 0,
      sdcard: {},
    });
  };
  cow('dev-riley-desk-flex', 'FLEX_3', '10.42.60.4', 'SIM-F3-060004', 'desk-riley', 'home');
  cow('dev-sam-desk-mini', 'MINI_3', '10.42.60.5', 'SIM-M3-060005', 'desk-sam', 'home');
  cow('dev-alex-desk-flex', 'FLEX_4', '10.42.60.6', 'SIM-F4-060006', 'desk-alex', 'lock');
  const spare = (id: string, type: 'FLEX_2' | 'MINI_3', serial: string, drawer: string) => {
    const apps = appsFor(m1);
    const fw = factoryFirmware(type, true);
    lab.devices[id] = createTerminalDevice(id, type, {
      serial,
      ip: '',
      orcaDeviceName: '',
      rigId: drawer,
      power: 'off',
      bootProgress: 0,
      state: 'OK',
      merchantConfigId: 1,
      apps,
      launcher: { page: 0, apps },
      supply: { kind: 'none', targetId: null },
      display: createDisplayState('off'),
      firmware: fw.version,
      firmwareInfo: fw,
      battery: isHandheld(type) ? { pct: 0, charging: false } : null,
      lastInputPhysMs: 0,
      orderSeq: 0,
      sdcard: {},
    });
  };
  spare('dev-spare-flex2', 'FLEX_2', 'SIM-F2-000015', 'husky-drawer-2');
  spare('dev-spare-mini3', 'MINI_3', 'SIM-M3-000122', 'husky-drawer-3');

  /* ── Hosts, power, Callus ── */
  lab.hosts = seedHosts(lab.time.nowMs);
  // Running robot-controllers have read their controller.yaml at (re)start (Sim §2.5.3).
  for (const h of Object.values(lab.hosts)) {
    const rc = h.services['robot-controller'];
    const yaml = h.files['/etc/robot-controller/controller.yaml'];
    if (rc?.running && yaml) {
      const parsed = parseControllerYaml(yaml);
      if (parsed.ok) rc.loadedConfig = parsed.config;
    }
  }
  // Spare free-standing loads for the spares (unplugged PSU bricks).
  deviceLoads.push({ loadId: 'psu-spare-flex2', deviceId: 'dev-spare-flex2', label: 'Spare Flex 2 power brick' }, { loadId: 'psu-spare-mini3', deviceId: 'dev-spare-mini3', label: 'Spare Mini 3 power brick' });
  lab.power = seedPower(deviceLoads, collisLoads);
  // Supply mirrors (Sim §1.15): modelled loads are authoritative.
  for (const l of Object.values(lab.power.loads)) {
    if (l.deviceId && lab.devices[l.deviceId]) lab.devices[l.deviceId]!.supply = { ...l.supply };
    if (l.hostId && lab.hosts[l.hostId]) lab.hosts[l.hostId]!.supply = { ...l.supply };
    if (l.collisId && lab.collis[l.collisId]) lab.collis[l.collisId]!.supply = { ...l.supply };
  }
  // SONNY's off-screen Pi has been hung since 07:55.
  const ps = lab.hosts['pi-sonny'];
  if (ps) {
    ps.os = 'HUNG';
    ps.power = 'crashed';
  }
  // …so its tablet already shows what the rigs step derives from that (Sim §3.7.5 grey banner).
  const rsonny = lab.rigs['sonny'];
  if (rsonny) {
    rsonny.banner = 'grey';
    rsonny.bannerText = 'Status: CONTROLLER UNREACHABLE';
    rsonny.tablet.statusText = 'Status: CONTROLLER UNREACHABLE';
    rsonny.tablet.reachable = false;
  }

  for (const box of ['minix-01', 'minix-02', 'minix-03', 'minix-04', 'minix-05']) {
    lab.callus.localCardFiles[box] = { syncedCommit: 'c41d9e2', syncedAtMs: -31_180_000, files: [...FACTORY_CARD_FILES] };
    lab.callus.log[box] = ['GortCardSync: pulled c41d9e2 (7 files)'];
    mirrorCallusFiles(lab, box);
  }

  /* ── Workstation (Sim §2.14) ── */
  lab.workstation.files = {
    '~/IdeaProjects/': '',
    '~/Pictures/': '',
    '~/Downloads/': '',
    '~/Downloads/walle_receipt_0912.jpg': 'img:receipt:wall-e:0912',
    '~/.ssh/': '',
    '~/.ssh/id_ed25519': '-----BEGIN OPENSSH PRIVATE KEY-----\n(lab key — illustrative)\n-----END OPENSSH PRIVATE KEY-----\n',
    '~/.ssh/id_ed25519.pub': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAISimLabKeyForWs17 engineer@ws-17\n',
    '~/CAD/': '',
    '~/CAD/cradle_flex_gen3.3mf': '<3mf:cradle_flex_gen3>',
    '~/CAD/cradle_mini3.3mf': '<3mf:cradle_mini3>',
    '~/CAD/cradle_station.3mf': '<3mf:cradle_station>',
  };
}

/**
 * Mirror `callus.localCardFiles[box].files` into the box's `C:\gort\…` files (Sim §2.5.3), using gort's
 * file text (sim-devops repo seed) or the canonical definition when gort has not been seeded.
 */
export function mirrorCallusFiles(lab: LabState, boxId: string): void {
  const host = lab.hosts[boxId];
  const local = lab.callus.localCardFiles[boxId];
  if (!host || !local) return;
  for (const k of Object.keys(host.files)) if (k.startsWith('C:\\gort\\cards\\')) delete host.files[k];
  for (const p of local.files) {
    const win = `C:\\gort\\${p.replace(/\//g, '\\')}`;
    host.files[win] = gortFileText(lab, p) ?? '';
  }
}

/** Text of a gort file on `main` (sim-devops state), falling back to the canonical card definition. */
export function gortFileText(lab: LabState, path: string): string | null {
  const t = lab.repos?.gort?.files?.[path];
  if (typeof t === 'string') return t;
  const prof = Object.values(lab.orca.cardProfiles).find((c) => c.gortPath === path);
  if (prof) return canonicalCardFile(prof);
  if (path === 'cards/README.md') return '# Card definitions\n\nDip (EMV contact) and Tap (NFC) virtual card files loaded by Callus.\n';
  return null;
}

export type { RosterRow };
export { ROSTER } from './robots';
export { DEVICE_TYPES } from './deviceTypes';
