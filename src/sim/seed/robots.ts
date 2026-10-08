/**
 * The 42-rig Orca pool (Sim §2.3). Physical rows 1–12 = GP §3.1 verbatim; rows 13–42 are off-screen.
 * Static roster data only — `seed/index.ts` turns it into Orca robots/devices, rigs, hosts and probes.
 */
import type { DeviceTypeCode, RigKind, RobotEnvironment, RobotStatus } from '../types';

export interface RosterDevice {
  /** Orca Device row name, e.g. "wall-e-flex3". */
  name: string;
  type: DeviceTypeCode;
  /** Last octet of `10.42.30.x`. */
  ip: number;
}

export interface RosterRow {
  id: number;
  name: string;
  hrn: string;
  kind: RigKind;
  env: RobotEnvironment;
  location: string;
  status: RobotStatus;
  /** Robot Device (tethered: the MFD). */
  device: RosterDevice;
  /** Tethered CFD device (MFD ≠ CFD). */
  cfd: RosterDevice | null;
  /** Duo used as a tethered pair (MFD = CFD = the Robot Device row). */
  duoPair: boolean;
  /** Last octet of the Robot Pi `10.42.10.x`. */
  pi: number;
  /** Camera Stream URL host octet, null = "" (no camera). */
  cam: number | null;
  /** Card hardware: 'DTS' = dip/tap/swipe (Collis), 'S' = SmartStripe swipe only, null = ADB bot. */
  cards: 'DTS' | 'S' | null;
  callus: string | null;
  merchant: string;
  caps: string[];
  physical: boolean;
  /** Text after "Rig description:" on the tablet's Robot tab. */
  note: string;
}

const d = (name: string, type: DeviceTypeCode, ip: number): RosterDevice => ({ name, type, ip });

function r(
  id: number,
  name: string,
  kind: RigKind,
  env: RobotEnvironment,
  location: string,
  status: RobotStatus,
  device: RosterDevice,
  pi: number,
  cam: number | null,
  cards: 'DTS' | 'S' | null,
  callus: string | null,
  merchant: string,
  caps: string[],
  extra: Partial<RosterRow> = {},
): RosterRow {
  return { id, name, hrn: name.toUpperCase(), kind, env, location, status, device, cfd: null, duoPair: false, pi, cam, cards, callus, merchant, caps, physical: id <= 12, note: '', ...extra };
}

const DTS = ['DIP', 'TAP', 'SWIPE'];
const M1 = 'AUTO-US-NOPIN-01';
const M2 = 'AUTO-US-NOPIN-02';

export const ROSTER: readonly RosterRow[] = [
  r(1, 'wall-e', 'touch', 'DEV1', 'Rack A · U33–U36', 'AVAILABLE', d('wall-e-flex3', 'FLEX_3', 11), 11, 11, 'DTS', 'minix-01', M1, DTS, { note: 'Flex 3 touch robot (photo rig). Dedicated webcam.' }),
  r(2, 'eve', 'touch', 'DEV1', 'Rack A · U29–U32', 'AVAILABLE', d('eve-flex4', 'FLEX_4', 12), 12, 12, 'DTS', 'minix-01', M1, DTS, { note: 'Flex 4 touch robot.' }),
  r(3, 'bumblebee', 'touch', 'DEV1', 'Rack A · U25–U28', 'AVAILABLE', d('bumblebee-mini3', 'MINI_3', 13), 13, 13, 'DTS', 'minix-01', M1, DTS, { note: 'Mini 3 touch robot.' }),
  r(4, 'r2-d2', 'touch', 'DEV1', 'Rack A · U21–U24', 'AVAILABLE', d('r2-d2-duo', 'STATION_DUO', 14), 14, 14, 'DTS', 'minix-01', M1, [...DTS, 'OCR_CAMERA'], {
    duoPair: true,
    note: 'Station Duo; probe and webcam on the CFD, MFD driven by ADB.',
  }),
  r(5, 'johnny-5', 'touch', 'DEV1', 'Rack B · U33–U36', 'AVAILABLE', d('johnny-5-flex1', 'FLEX_1', 15), 15, 40, 'DTS', 'minix-02', M1, DTS, { note: 'Flex 1 touch robot (end-of-life firmware). Rack B shared camera.' }),
  r(6, 'baymax', 'touch', 'DEV1', 'Rack B · U29–U32', 'AVAILABLE', d('baymax-st2018', 'STATION_2018', 16), 16, 40, 'DTS', 'minix-02', M1, DTS, { note: 'Station 2018 touch robot.' }),
  r(7, 'seti', 'touch', 'DEV1', 'Rack B · U25–U28', 'AVAILABLE', d('seti-compact', 'COMPACT', 17), 17, 40, 'DTS', 'minix-02', 'WESTERS-CA-01', [...DTS, 'INTERAC'], { note: 'Compact touch robot (Westers / Contact Canada, physical PIN).' }),
  r(8, 'rosie', 'standalone', 'DEV1', 'Rack B · U21–U24', 'UNAVAILABLE', d('rosie-pocket', 'FLEX_POCKET', 18), 18, 40, 'DTS', 'minix-02', 'PAYCORE-STANDALONE-01', [...DTS, 'CARD_MATRIX'], {
    note: 'PayCore standalone (card matrix). Keep Unavailable — name it to use it.',
  }),
  r(9, 'megatron', 'tethered', 'DEV1', 'Tethered rack', 'AVAILABLE', d('megatron-mfd', 'STATION_2', 21), 20, 20, 'S', 'minix-02', M1, ['SWIPE'], {
    cfd: d('megatron-cfd', 'MINI_2', 22),
    note: 'Tethered Station 2 → Mini 2 (USB Pay Display). SmartStripe swipe on the CFD.',
  }),
  r(10, 'optimus', 'tethered', 'STG', 'Tethered rack', 'AVAILABLE', d('optimus-mfd', 'MINI_3', 23), 20, 20, 'S', 'minix-02', M1, ['SWIPE'], {
    cfd: d('optimus-cfd', 'MINI_3', 24),
    note: 'Nested Mini 3s (Secure Network Pay Display). SmartStripe swipe on the CFD.',
  }),
  r(11, 'data', 'adb', 'DEV1', 'ADB shelf', 'AVAILABLE', d('data-mini3', 'MINI_3', 31), 30, null, null, null, M1, ['GO_SDK'], { note: 'ADB bot (Mini 3) — PIN-bypass merchants only.' }),
  r(12, 'tars', 'adb', 'DEV1', 'ADB shelf', 'AVAILABLE', d('tars-flex4', 'FLEX_4', 32), 30, null, null, null, M1, ['GO_SDK'], { note: 'ADB bot (Flex 4) — PIN-bypass merchants only.' }),
  r(13, 'vision', 'adb', 'DEV1', 'Rack C (off-screen)', 'AVAILABLE', d('vision-pocket', 'FLEX_POCKET', 50), 50, 50, null, null, M1, ['GO_SDK'], { note: 'ADB bot (Flex Pocket, printerless).' }),
  r(14, 'k-9', 'adb', 'DEV1', 'Rack C (off-screen)', 'AVAILABLE', d('k-9-duo2', 'STATION_DUO_2', 51), 51, null, null, null, M1, [], { note: 'ADB bot (Station Duo 2, printerless).' }),
  r(15, 'soundwave', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('soundwave-flex3', 'FLEX_3', 52), 52, 60, 'DTS', 'minix-03', M2, DTS),
  r(16, 'starscream', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('starscream-flex4', 'FLEX_4', 53), 53, 60, 'DTS', 'minix-03', M2, DTS),
  r(17, 'ratchet', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('ratchet-mini3', 'MINI_3', 54), 54, 60, 'DTS', 'minix-03', M2, DTS),
  r(18, 'c-3po', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('c-3po-duo', 'STATION_DUO', 55), 55, 60, 'DTS', 'minix-03', M2, [...DTS, 'OCR_CAMERA'], { duoPair: true }),
  r(19, 'bb-8', 'tethered', 'DEV2', 'Rack D (off-screen)', 'AVAILABLE', d('bb-8-mfd', 'MINI_3', 61), 61, 61, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('bb-8-cfd', 'MINI_3', 62) }),
  r(20, 'bender', 'standalone', 'STG', 'PayCore bench (off-screen)', 'UNAVAILABLE', d('bender-st2', 'STATION_2', 63), 63, 63, 'DTS', 'minix-03', 'PAYCORE-DINING-01', [...DTS, 'lab_dining', 'CARD_MATRIX'], {
    note: 'PayCore LabSim Dining standalone.',
  }),
  r(21, 'marvin', 'tethered', 'QA', 'Rack D (off-screen)', 'AVAILABLE', d('marvin-mfd', 'STATION_2', 64), 64, 64, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('marvin-cfd', 'MINI_3', 65) }),
  r(22, 'robby', 'tethered', 'DEV2', 'Rack D (off-screen)', 'OFFLINE', d('robby-mfd', 'MINI_3', 66), 64, 64, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('robby-cfd', 'MINI_3', 67) }),
  r(23, 'hal', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('hal-st2', 'STATION_2', 70), 70, null, null, null, M2, []),
  r(24, 'bishop', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('bishop-mini2', 'MINI_2', 71), 70, null, null, null, M2, []),
  r(25, 'ash', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('ash-flex2', 'FLEX_2', 72), 70, null, null, null, M2, []),
  r(26, 'sonny', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'CONNECTION_FAILED', d('sonny-flex3', 'FLEX_3', 73), 74, null, null, null, M2, []),
  r(27, 'chappie', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('chappie-flex4', 'FLEX_4', 75), 75, 79, 'DTS', 'minix-04', M2, DTS),
  r(28, 'case', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('case-mini3', 'MINI_3', 76), 76, 79, 'DTS', 'minix-04', M2, DTS),
  r(29, 'atlas', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('atlas-st2018', 'STATION_2018', 77), 77, 79, 'DTS', 'minix-04', M2, DTS),
  r(30, 'astro', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('astro-flex4', 'FLEX_4', 78), 78, 79, 'DTS', 'minix-04', 'GO-SDK-US-01', [...DTS, 'GO_SDK', 'PHONE'], {
    note: 'Touch robot + phone carriage (iOS Go SDK mobile runner).',
  }),
  r(31, 'iron-giant', 'touch', 'QA', 'Rack F (off-screen)', 'AVAILABLE', d('iron-giant-duo2', 'STATION_DUO_2', 80), 80, 80, 'DTS', 'minix-04', M2, [...DTS, 'OCR_CAMERA'], { duoPair: true }),
  r(32, 'voltron', 'tethered', 'INT', 'Rack D (off-screen)', 'AVAILABLE', d('voltron-mfd', 'STATION_2', 81), 81, 81, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('voltron-cfd', 'MINI_2', 82) }),
  r(33, 'kryten', 'standalone', 'STG', 'PayCore bench (off-screen)', 'UNAVAILABLE', d('kryten-flex3', 'FLEX_3', 83), 83, 83, 'DTS', 'minix-03', 'PAYCORE-STANDALONE-01', [...DTS, 'CARD_MATRIX']),
  r(34, 'mazinger', 'touch', 'DEV2', 'Rack F (off-screen)', 'AVAILABLE', d('mazinger-mini2', 'MINI_2', 84), 84, 84, 'DTS', 'minix-04', M2, DTS),
  r(35, 'jarvis', 'adb', 'DEV2', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('jarvis-mini3', 'MINI_3', 85), 85, null, null, null, M2, []),
  r(36, 'ultron', 'adb', 'DEV2', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('ultron-pocket', 'FLEX_POCKET', 86), 85, null, null, null, M2, []),
  r(37, 'dalek', 'touch', 'QA', 'Rack F (off-screen)', 'OFFLINE', d('dalek-flex1', 'FLEX_1', 87), 87, 87, 'DTS', 'minix-04', M2, DTS),
  r(38, 'number-5', 'touch', 'QA', 'Rack F (off-screen)', 'AVAILABLE', d('number-5-flex2', 'FLEX_2', 88), 88, 88, 'DTS', 'minix-04', M2, DTS),
  r(39, 'gerty', 'touch', 'QA', 'Westers bench (off-screen)', 'AVAILABLE', d('gerty-compact', 'COMPACT', 89), 89, 89, 'DTS', 'minix-05', 'WESTERS-CA-02', [...DTS, 'INTERAC']),
  r(40, 'mother', 'touch', 'QA', 'Westers bench (off-screen)', 'RESERVED', d('mother-compact', 'COMPACT', 90), 90, 89, 'DTS', 'minix-05', 'WESTERS-CA-01', [...DTS, 'INTERAC']),
  r(41, 'brainiac', 'adb', 'DEV2', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('brainiac-duo', 'STATION_DUO', 91), 91, null, null, null, M2, []),
  r(42, 'zorg', 'tethered', 'QA', 'Rack D (off-screen)', 'AVAILABLE', d('zorg-mfd', 'MINI_3', 92), 92, 92, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('zorg-cfd', 'MINI_2', 93) }),
];

/** USB Pay Display (hub-to-hub USB) vs Secure Network Pay Display (hub Ethernet) per tethered rig [illus. split]. */
export const PAY_DISPLAY_APP: Record<string, 'USB_PAY_DISPLAY' | 'SECURE_NETWORK_PAY_DISPLAY'> = {
  megatron: 'USB_PAY_DISPLAY',
  voltron: 'USB_PAY_DISPLAY',
  optimus: 'SECURE_NETWORK_PAY_DISPLAY',
  'bb-8': 'SECURE_NETWORK_PAY_DISPLAY',
  robby: 'SECURE_NETWORK_PAY_DISPLAY',
  marvin: 'SECURE_NETWORK_PAY_DISPLAY',
  zorg: 'SECURE_NETWORK_PAY_DISPLAY',
};

/**
 * Robot Pi hosts by `10.42.10.x` octet: host id, hostname, role. Shared Pis serve several rigs (Sim §2.3);
 * camera-only Pis serve shared camera URLs. Physical: .11–.18, .20, .30, .40.
 */
export interface PiDef {
  octet: number;
  id: string;
  hostname: string;
  /** Rigs whose Robot ADB Service URL points here (empty for camera-only Pis). */
  robots: string[];
  /** Serves `http://<ip>:8081/stream.mjpg` with a USB webcam. */
  camera: boolean;
  physical: boolean;
}

export function piDefs(): PiDef[] {
  const byOctet = new Map<number, PiDef>();
  const named: Record<number, [string, string]> = {
    20: ['pi-tethered', 'tethered-pi'],
    30: ['pi-adb-shelf', 'adb-shelf-pi'],
    40: ['pi-cam-rackb', 'rackb-cam'],
    60: ['pi-cam-rackc', 'rackc-cam'],
    64: ['pi-marvin', 'rackd-pi'],
    70: ['pi-adb2', 'adb2-pi'],
    79: ['pi-cam-racke', 'racke-cam'],
    85: ['pi-adb3', 'adb3-pi'],
  };
  const get = (octet: number, rig: string | null): PiDef => {
    let p = byOctet.get(octet);
    if (!p) {
      const [id, hostname] = named[octet] ?? [`pi-${rig}`, rig ?? `pi-${octet}`];
      p = { octet, id, hostname, robots: [], camera: false, physical: octet <= 40 };
      byOctet.set(octet, p);
    }
    return p;
  };
  for (const row of ROSTER) get(row.pi, row.name).robots.push(row.name);
  for (const row of ROSTER) if (row.cam != null) get(row.cam, row.name).camera = true;
  return [...byOctet.values()].sort((a, b) => a.octet - b.octet);
}

/** Callus (Windows) boxes: id → hostname, IP, the probes' rigs it drives (Sim §2.5.1). */
export const CALLUS_BOXES: { id: string; hostname: string; ip: string; kind: 'minix' | 'nuc' }[] = [
  { id: 'minix-01', hostname: 'MINIX-01', ip: '10.42.20.1', kind: 'minix' },
  { id: 'minix-02', hostname: 'MINIX-02', ip: '10.42.20.2', kind: 'minix' },
  { id: 'nuc-03', hostname: 'NUC-03', ip: '10.42.20.3', kind: 'nuc' },
  { id: 'minix-03', hostname: 'MINIX-03', ip: '10.42.20.4', kind: 'minix' },
  { id: 'minix-04', hostname: 'MINIX-04', ip: '10.42.20.5', kind: 'minix' },
  { id: 'minix-05', hostname: 'MINIX-05', ip: '10.42.20.6', kind: 'minix' },
];
