/**
 * The 42-rig Orka pool (Sim §2.3). Physical rows 1–12 = GP §3.1 verbatim; rows 13–42 are off-screen.
 * Static roster data only — `seed/index.ts` turns it into Orka robots/devices, rigs, hosts and probes.
 */
import type { DeviceTypeCode, RigKind, RobotEnvironment, RobotStatus } from '../types';

export interface RosterDevice {
  /** Orka Device row name, e.g. "wall-e-flux3". */
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
  /** Duet used as a tethered pair (MFD = CFD = the Robot Device row). */
  duoPair: boolean;
  /** Last octet of the Robot Pi `10.42.10.x`. */
  pi: number;
  /** Camera Stream URL host octet, null = "" (no camera). */
  cam: number | null;
  /** Card hardware: 'DTS' = dip/tap/swipe (Kollis), 'S' = SmartStripe swipe only, null = ADB bot. */
  cards: 'DTS' | 'S' | null;
  kallus: string | null;
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
  kallus: string | null,
  merchant: string,
  caps: string[],
  extra: Partial<RosterRow> = {},
): RosterRow {
  return { id, name, hrn: name.toUpperCase(), kind, env, location, status, device, cfd: null, duoPair: false, pi, cam, cards, kallus, merchant, caps, physical: id <= 12, note: '', ...extra };
}

const DTS = ['DIP', 'TAP', 'SWIPE'];
const M1 = 'AUTO-US-NOPIN-01';
const M2 = 'AUTO-US-NOPIN-02';

export const ROSTER: readonly RosterRow[] = [
  r(1, 'wall-e', 'touch', 'DEV1', 'Rack A · U33–U36', 'AVAILABLE', d('wall-e-flux3', 'FLUX_3', 11), 11, 11, 'DTS', 'minix-01', M1, DTS, { note: 'Flux 3 touch robot (photo rig). Dedicated webcam.' }),
  r(2, 'eve', 'touch', 'DEV1', 'Rack A · U29–U32', 'AVAILABLE', d('eve-flux4', 'FLUX_4', 12), 12, 12, 'DTS', 'minix-01', M1, DTS, { note: 'Flux 4 touch robot.' }),
  r(3, 'bumblebee', 'touch', 'DEV1', 'Rack A · U25–U28', 'AVAILABLE', d('bumblebee-micro3', 'MICRO_3', 13), 13, 13, 'DTS', 'minix-01', M1, DTS, { note: 'Micro 3 touch robot.' }),
  r(4, 'r2-d2', 'touch', 'DEV1', 'Rack A · U21–U24', 'AVAILABLE', d('r2-d2-duet', 'STAND_DUET', 14), 14, 14, 'DTS', 'minix-01', M1, [...DTS, 'OCR_CAMERA'], {
    duoPair: true,
    note: 'Stand Duet; probe and webcam on the CFD, MFD driven by ADB.',
  }),
  r(5, 'johnny-5', 'touch', 'DEV1', 'Rack B · U33–U36', 'AVAILABLE', d('johnny-5-flux1', 'FLUX_1', 15), 15, 40, 'DTS', 'minix-02', M1, DTS, { note: 'Flux 1 touch robot (end-of-life firmware). Rack B shared camera.' }),
  r(6, 'baymax', 'touch', 'DEV1', 'Rack B · U29–U32', 'AVAILABLE', d('baymax-st2018', 'STAND_2018', 16), 16, 40, 'DTS', 'minix-02', M1, DTS, { note: 'Stand 2018 touch robot.' }),
  r(7, 'seti', 'touch', 'DEV1', 'Rack B · U25–U28', 'AVAILABLE', d('seti-compass', 'COMPASS', 17), 17, 40, 'DTS', 'minix-02', 'WESTERLY-CA-01', [...DTS, 'INTERAC'], { note: 'Compass touch robot (Westerly / Contact Canada, physical PIN).' }),
  r(8, 'rosie', 'standalone', 'DEV1', 'Rack B · U21–U24', 'UNAVAILABLE', d('rosie-pocket', 'FLUX_POCKET', 18), 18, 40, 'DTS', 'minix-02', 'PAYCREST-STANDALONE-01', [...DTS, 'CARD_MATRIX'], {
    note: 'PayCrest standalone (card matrix). Keep Unavailable — name it to use it.',
  }),
  r(9, 'megatron', 'tethered', 'DEV1', 'Tethered rack', 'AVAILABLE', d('megatron-mfd', 'STAND_2', 21), 20, 20, 'S', 'minix-02', M1, ['SWIPE'], {
    cfd: d('megatron-cfd', 'MICRO_2', 22),
    note: 'Tethered Stand 2 → Micro 2 (USB Pay Display). SmartStripe swipe on the CFD.',
  }),
  r(10, 'optimus', 'tethered', 'STG', 'Tethered rack', 'AVAILABLE', d('optimus-mfd', 'MICRO_3', 23), 20, 20, 'S', 'minix-02', M1, ['SWIPE'], {
    cfd: d('optimus-cfd', 'MICRO_3', 24),
    note: 'Nested Micro 3s (Secure Network Pay Display). SmartStripe swipe on the CFD.',
  }),
  r(11, 'data', 'adb', 'DEV1', 'ADB shelf', 'AVAILABLE', d('data-micro3', 'MICRO_3', 31), 30, null, null, null, M1, ['GO_SDK'], { note: 'ADB bot (Micro 3) — PIN-bypass merchants only.' }),
  r(12, 'tars', 'adb', 'DEV1', 'ADB shelf', 'AVAILABLE', d('tars-flux4', 'FLUX_4', 32), 30, null, null, null, M1, ['GO_SDK'], { note: 'ADB bot (Flux 4) — PIN-bypass merchants only.' }),
  r(13, 'vision', 'adb', 'DEV1', 'Rack C (off-screen)', 'AVAILABLE', d('vision-pocket', 'FLUX_POCKET', 50), 50, 50, null, null, M1, ['GO_SDK'], { note: 'ADB bot (Flux Pocket, printerless).' }),
  r(14, 'k-9', 'adb', 'DEV1', 'Rack C (off-screen)', 'AVAILABLE', d('k-9-duet2', 'STAND_DUET_2', 51), 51, null, null, null, M1, [], { note: 'ADB bot (Stand Duet 2, printerless).' }),
  r(15, 'soundwave', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('soundwave-flux3', 'FLUX_3', 52), 52, 60, 'DTS', 'minix-03', M2, DTS),
  r(16, 'starscream', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('starscream-flux4', 'FLUX_4', 53), 53, 60, 'DTS', 'minix-03', M2, DTS),
  r(17, 'ratchet', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('ratchet-micro3', 'MICRO_3', 54), 54, 60, 'DTS', 'minix-03', M2, DTS),
  r(18, 'c-3po', 'touch', 'QA', 'Rack C (off-screen)', 'AVAILABLE', d('c-3po-duet', 'STAND_DUET', 55), 55, 60, 'DTS', 'minix-03', M2, [...DTS, 'OCR_CAMERA'], { duoPair: true }),
  r(19, 'bb-8', 'tethered', 'DEV2', 'Rack D (off-screen)', 'AVAILABLE', d('bb-8-mfd', 'MICRO_3', 61), 61, 61, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('bb-8-cfd', 'MICRO_3', 62) }),
  r(20, 'bender', 'standalone', 'STG', 'PayCrest bench (off-screen)', 'UNAVAILABLE', d('bender-st2', 'STAND_2', 63), 63, 63, 'DTS', 'minix-03', 'PAYCREST-DINING-01', [...DTS, 'lab_dining', 'CARD_MATRIX'], {
    note: 'PayCrest LabSim Dining standalone.',
  }),
  r(21, 'marvin', 'tethered', 'QA', 'Rack D (off-screen)', 'AVAILABLE', d('marvin-mfd', 'STAND_2', 64), 64, 64, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('marvin-cfd', 'MICRO_3', 65) }),
  r(22, 'robby', 'tethered', 'DEV2', 'Rack D (off-screen)', 'OFFLINE', d('robby-mfd', 'MICRO_3', 66), 64, 64, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('robby-cfd', 'MICRO_3', 67) }),
  r(23, 'hal', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('hal-st2', 'STAND_2', 70), 70, null, null, null, M2, []),
  r(24, 'bishop', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('bishop-micro2', 'MICRO_2', 71), 70, null, null, null, M2, []),
  r(25, 'ash', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('ash-flux2', 'FLUX_2', 72), 70, null, null, null, M2, []),
  r(26, 'sonny', 'adb', 'QA', 'ADB rack 2 (off-screen)', 'CONNECTION_FAILED', d('sonny-flux3', 'FLUX_3', 73), 74, null, null, null, M2, []),
  r(27, 'chappie', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('chappie-flux4', 'FLUX_4', 75), 75, 79, 'DTS', 'minix-04', M2, DTS),
  r(28, 'case', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('case-micro3', 'MICRO_3', 76), 76, 79, 'DTS', 'minix-04', M2, DTS),
  r(29, 'atlas', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('atlas-st2018', 'STAND_2018', 77), 77, 79, 'DTS', 'minix-04', M2, DTS),
  r(30, 'astro', 'touch', 'QA', 'Rack E (off-screen)', 'AVAILABLE', d('astro-flux4', 'FLUX_4', 78), 78, 79, 'DTS', 'minix-04', 'GO-SDK-US-01', [...DTS, 'GO_SDK', 'PHONE'], {
    note: 'Touch robot + phone carriage (iOS Go SDK mobile runner).',
  }),
  r(31, 'iron-giant', 'touch', 'QA', 'Rack F (off-screen)', 'AVAILABLE', d('iron-giant-duet2', 'STAND_DUET_2', 80), 80, 80, 'DTS', 'minix-04', M2, [...DTS, 'OCR_CAMERA'], { duoPair: true }),
  r(32, 'voltron', 'tethered', 'INT', 'Rack D (off-screen)', 'AVAILABLE', d('voltron-mfd', 'STAND_2', 81), 81, 81, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('voltron-cfd', 'MICRO_2', 82) }),
  r(33, 'kryten', 'standalone', 'STG', 'PayCrest bench (off-screen)', 'UNAVAILABLE', d('kryten-flux3', 'FLUX_3', 83), 83, 83, 'DTS', 'minix-03', 'PAYCREST-STANDALONE-01', [...DTS, 'CARD_MATRIX']),
  r(34, 'mazinger', 'touch', 'DEV2', 'Rack F (off-screen)', 'AVAILABLE', d('mazinger-micro2', 'MICRO_2', 84), 84, 84, 'DTS', 'minix-04', M2, DTS),
  r(35, 'jarvis', 'adb', 'DEV2', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('jarvis-micro3', 'MICRO_3', 85), 85, null, null, null, M2, []),
  r(36, 'ultron', 'adb', 'DEV2', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('ultron-pocket', 'FLUX_POCKET', 86), 85, null, null, null, M2, []),
  r(37, 'dalek', 'touch', 'QA', 'Rack F (off-screen)', 'OFFLINE', d('dalek-flux1', 'FLUX_1', 87), 87, 87, 'DTS', 'minix-04', M2, DTS),
  r(38, 'number-5', 'touch', 'QA', 'Rack F (off-screen)', 'AVAILABLE', d('number-5-flux2', 'FLUX_2', 88), 88, 88, 'DTS', 'minix-04', M2, DTS),
  r(39, 'gerty', 'touch', 'QA', 'Westerly bench (off-screen)', 'AVAILABLE', d('gerty-compass', 'COMPASS', 89), 89, 89, 'DTS', 'minix-05', 'WESTERLY-CA-02', [...DTS, 'INTERAC']),
  r(40, 'mother', 'touch', 'QA', 'Westerly bench (off-screen)', 'RESERVED', d('mother-compass', 'COMPASS', 90), 90, 89, 'DTS', 'minix-05', 'WESTERLY-CA-01', [...DTS, 'INTERAC']),
  r(41, 'brainiac', 'adb', 'DEV2', 'ADB rack 2 (off-screen)', 'AVAILABLE', d('brainiac-duet', 'STAND_DUET', 91), 91, null, null, null, M2, []),
  r(42, 'zorg', 'tethered', 'QA', 'Rack D (off-screen)', 'AVAILABLE', d('zorg-mfd', 'MICRO_3', 92), 92, 92, 'S', 'minix-03', M2, ['SWIPE'], { cfd: d('zorg-cfd', 'MICRO_2', 93) }),
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

/** Kallus (Windows) boxes: id → hostname, IP, the probes' rigs it drives (Sim §2.5.1). */
export const KALLUS_BOXES: { id: string; hostname: string; ip: string; kind: 'minix' | 'nuc' }[] = [
  { id: 'minix-01', hostname: 'MINIX-01', ip: '10.42.20.1', kind: 'minix' },
  { id: 'minix-02', hostname: 'MINIX-02', ip: '10.42.20.2', kind: 'minix' },
  { id: 'nuc-03', hostname: 'NUC-03', ip: '10.42.20.3', kind: 'nuc' },
  { id: 'minix-03', hostname: 'MINIX-03', ip: '10.42.20.4', kind: 'minix' },
  { id: 'minix-04', hostname: 'MINIX-04', ip: '10.42.20.5', kind: 'minix' },
  { id: 'minix-05', hostname: 'MINIX-05', ip: '10.42.20.6', kind: 'minix' },
];
