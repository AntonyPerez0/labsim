/**
 * Physical rig roster and per-rig configuration — World §2.10 (touch rigs), §2.12 (tethered),
 * §2.13 (ADB bots), with sim bindings (40-simulation §2.3–§2.6) and world transforms.
 *
 * Gantry mapping (D7): gantry (0,0) = the top-left of the rig's PRIMARY screen = (homeX, homeZ) in
 * bay-local mm; for a sim position (xMm, yMm): tipX = homeX + xMm, tipZ = homeZ + yMm, and the beam
 * carriage centre cx = tipX − 26, arm-carriage centre az = tipZ. Screens lie face-up and level at
 * bay y 100; screen +x → bay +X, screen +y → bay +Z (toward the player).
 */
import type { DeviceTypeCode } from '@/sim/types';
import type { FocusPose } from './locations';
import type { ProbePointDef } from './power';
import { bayToWorld, bayPartPositions, rackDef, GANTRY_MM, SOLENOID_MM, type BayNumber, type RackDef } from './racks';
import { round6, type Vec2, type Vec3 } from './types';

export type TouchRigId = 'wall-e' | 'eve' | 'r2-d2' | 'bumblebee' | 'johnny-5' | 'seti' | 'baymax' | 'rosie';
export type TetheredRigId = 'megatron' | 'optimus';
export type AdbRigId = 'data' | 'tars';
export type PhysicalRigId = TouchRigId | TetheredRigId | AdbRigId;

export const TOUCH_RIG_IDS: readonly TouchRigId[] = ['wall-e', 'eve', 'r2-d2', 'bumblebee', 'johnny-5', 'seti', 'baymax', 'rosie'];
export const TETHERED_RIG_IDS: readonly TetheredRigId[] = ['megatron', 'optimus'];
export const ADB_RIG_IDS: readonly AdbRigId[] = ['data', 'tars'];
export const PHYSICAL_RIG_IDS: readonly PhysicalRigId[] = [...TOUCH_RIG_IDS, ...TETHERED_RIG_IDS, ...ADB_RIG_IDS];

export type CradleId =
  | 'flex-cradle-gen3'
  | 'flex-cradle-pocket'
  | 'flex-cradle-gen1'
  | 'flex-cradle-gen2'
  | 'compact-cradle'
  | 'mini-dock'
  | 'station-tray'
  | 'station-duo-tray';

/** Which hardware a rig physically has (drives which parts are built and which ids exist). */
export interface RigActuators {
  readonly gantry: boolean;
  readonly solenoid: boolean;
  readonly dipArm: boolean;
  readonly tapPaddle: boolean;
  readonly phoneSled: boolean;
  readonly tablet: boolean;
  readonly powerPanel: boolean;
  readonly sideDoor: boolean;
  readonly webcam: boolean;
  readonly collis: boolean;
  readonly smartstripe: boolean;
}

const TOUCH_ACTUATORS: RigActuators = {
  gantry: true, solenoid: true, dipArm: true, tapPaddle: true, phoneSled: true,
  tablet: true, powerPanel: true, sideDoor: true, webcam: true, collis: true, smartstripe: false,
};
const TETHERED_ACTUATORS: RigActuators = {
  gantry: false, solenoid: false, dipArm: false, tapPaddle: false, phoneSled: false,
  tablet: false, powerPanel: false, sideDoor: false, webcam: false, collis: false, smartstripe: true,
};
const ADB_ACTUATORS: RigActuators = {
  gantry: false, solenoid: false, dipArm: false, tapPaddle: false, phoneSled: false,
  tablet: false, powerPanel: false, sideDoor: false, webcam: false, collis: false, smartstripe: false,
};

/** Sim object ids a rig binds to (candidates; see `findSimObject`). */
export interface RigSimIds {
  readonly rigId: string;
  readonly piHostId: string;
  readonly collisId: string | null;
  readonly callusHostId: string | null;
  /** 40-simulation §2.11 camera view id (`cam-wall-e`, `cam-rackb`, `cam-tethered`). */
  readonly cameraViewId: string | null;
  /** Orca device-row names (MFD before CFD). Runtime devices: use `RigState.deviceIds`. */
  readonly orcaDeviceNames: readonly string[];
  /** Power loads: device bricks (`psu-<orca device name>`). */
  readonly deviceLoadIds: readonly string[];
  readonly piLoadId: string | null;
  readonly collisLoadId: string | null;
  readonly mainTerminalId: string | null;
  readonly motorTerminalId: string | null;
  /** Per-bay inline fuse (World D2). The sim may model only rack-level fuses → render healthy. */
  readonly bayFuseId: string | null;
}

interface RigBase {
  readonly id: PhysicalRigId;
  /** Human readable name as printed on tape labels (tablet text comes from Orca). */
  readonly hrn: string;
  readonly env: 'DEV1' | 'STG';
  readonly locationId: string;
  /** Prop id of the rack / shelf it lives in. */
  readonly hostPropId: string;
  readonly actuators: RigActuators;
  readonly sim: RigSimIds;
  /** World virtual-camera id (Appendix B) that films this rig. */
  readonly cameraId: string;
  /** 20-gameplay role tags this rig serves (World §0.3). */
  readonly roleTags: readonly string[];
}

/** One device configuration of a touch rig (JOHNNY-5 has two: Flex 1 and Flex 2). */
export interface TouchDeviceConfig {
  readonly type: DeviceTypeCode;
  readonly cradle: CradleId;
  /** Tape label on the device bezel. */
  readonly tape: string;
  /** Primary (MFD) screen W × H mm — gantry (0,0) is its top-left. */
  readonly primaryScreenMm: Vec2;
  /** Station Duo CFD W × H mm. */
  readonly secondaryScreenMm?: Vec2;
  /** (homeX, homeZ) bay-local mm. */
  readonly homeMm: Vec2;
  /** Feeds `RigState.gantry.maxXMm / maxYMm`. */
  readonly maxMm: Vec2;
  /** Display the solenoid works on, and that display's top-left in gantry mm. */
  readonly probeDisplay: 'primary' | 'secondary';
  readonly probeOriginMm: Vec2;
  /** Chip-slot centre on the edge face (bay-local mm). */
  readonly slotMm: Vec3;
  /** Bay z of the right-edge power key. */
  readonly powerKeyZMm: number;
  /** Phone-sled rail x (= device right edge + 23). */
  readonly sledRailXMm: number;
  /** NFC landmark in the probe display's screen mm (y beyond the screen = bottom bezel). */
  readonly nfcMm: Vec2;
  /** Webcam aim point (bay-local mm). */
  readonly cameraTargetMm: Vec3;
}

export interface TouchRigDef extends RigBase {
  readonly id: TouchRigId;
  readonly kind: 'touch';
  /** Orca rig kind (ROSIE is a PayCore 'standalone' rig; physically identical). */
  readonly simKind: 'touch' | 'standalone';
  readonly rackId: RackDef['id'];
  readonly bay: BayNumber;
  readonly doorSide: -1 | 1;
  /** Side-panel letters (D8): WALL-E and SETI read `SETI`; all others blank. */
  readonly sidePanelText: string | null;
  /** Factory device; `deviceConfigs` lists every configuration the rig can carry. */
  readonly initialType: DeviceTypeCode;
  readonly deviceConfigs: readonly TouchDeviceConfig[];
  /** Front-lip label (bay floor left end) and bay fuse tape. */
  readonly lipLabel: string;
  readonly fuseTape: string;
  readonly collisPropId: string;
  readonly callusBoxPropId: string;
}

export interface TetheredFaceDef {
  readonly id: string;
  readonly role: 'mfd' | 'cfd';
  readonly deviceType: DeviceTypeCode;
  readonly orcaDeviceName: string;
  /** Face centre, rack.t-local metres (front surface at z 0). */
  readonly local: Vec3;
  /** Face centre, world. */
  readonly world: Vec3;
  /** Face W × H metres. */
  readonly faceM: Vec2;
  /** Three label-tape pieces on the top bezel: left, centre, right. */
  readonly tapes: readonly [string, string, string];
  readonly logo: 'wordmark' | 'leaf';
  /** MFD top-edge swipe-direction sticker. */
  readonly swipeSticker?: { readonly glyph: string; readonly color: string };
  /** Screen at factory: MFDs lock screen, CFDs dark. */
  readonly defaultLook: 'lock' | 'dark';
  readonly dockId: string;
  readonly callout: string;
}

export interface TetheredRigDef extends RigBase {
  readonly id: TetheredRigId;
  readonly kind: 'tethered';
  readonly mfd: TetheredFaceDef;
  readonly cfd: TetheredFaceDef;
  readonly smartstripe: {
    readonly id: string;
    /** rack.t-local x of the USB dongle (green LED) and the clamp block; y 1.200–1.260 between rows. */
    readonly dongleX: number;
    readonly clampX: number;
    readonly bladeText: 'SmartStripe Probe';
    /** OPTIMUS also holds a white magstripe card in its CFD clamp at this x. */
    readonly cardX?: number;
    readonly simCollisId: string;
  };
}

export interface AdbRigDef extends RigBase {
  readonly id: AdbRigId;
  readonly kind: 'adb';
  readonly deviceType: DeviceTypeCode;
  readonly propId: string;
  /** shelf.adb-local base position (m) and world position. */
  readonly local: Vec3;
  readonly world: Vec3;
  /** Stand: Mini on its standard stand (screen 30° back) or Flex in an upright dock (70°). */
  readonly stand: { readonly kind: 'mini-stand' | 'flex-dock'; readonly screenTiltFromVerticalDeg: number };
  readonly tape: string;
}

export type RigDef = TouchRigDef | TetheredRigDef | AdbRigDef;

/* ───────────────────────────── Touch rigs (§2.10) ───────────────────────────── */

function touchSim(id: TouchRigId, rack: 'A' | 'B', orcaDeviceName: string): RigSimIds {
  return {
    rigId: id,
    piHostId: `pi-${id}`,
    collisId: `collis-${id}`,
    callusHostId: rack === 'A' ? 'minix-01' : 'minix-02',
    cameraViewId: rack === 'A' ? `cam-${id}` : 'cam-rackb',
    orcaDeviceNames: [orcaDeviceName],
    deviceLoadIds: [`psu-${orcaDeviceName}`],
    piLoadId: `pi-${id}`,
    collisLoadId: `psu-collis-${id}`,
    mainTerminalId: `MAIN-${id}`,
    motorTerminalId: `MOTOR-${id}`,
    bayFuseId: `F-${id.toUpperCase()}-5V`,
  };
}

const flex = (type: DeviceTypeCode, cradle: CradleId, tape: string, home: Vec2, slotY: number, keyZ: number, camZ: number, extra: Partial<TouchDeviceConfig> = {}): TouchDeviceConfig => ({
  type, cradle, tape,
  primaryScreenMm: [68.0, 136.0],
  homeMm: home,
  maxMm: [80, 148],
  probeDisplay: 'primary',
  probeOriginMm: [0, 0],
  slotMm: [0, slotY, -160],
  powerKeyZMm: keyZ,
  sledRailXMm: 64,
  nfcMm: [34.0, 111.0],
  cameraTargetMm: [0, 100, camZ],
  ...extra,
});

const small5 = (type: DeviceTypeCode, cradle: CradleId, tape: string, home: Vec2, slotY: number, keyZ: number, rail: number, camZ: number): TouchDeviceConfig => ({
  type, cradle, tape,
  primaryScreenMm: [62.3, 110.7],
  homeMm: home,
  maxMm: [74, 123],
  probeDisplay: 'primary',
  probeOriginMm: [0, 0],
  slotMm: [0, slotY, -160],
  powerKeyZMm: keyZ,
  sledRailXMm: rail,
  nfcMm: [31.2, 85.7],
  cameraTargetMm: [0, 100, camZ],
});

function touchRig(
  id: TouchRigId,
  hrn: string,
  rack: 'A' | 'B',
  bay: BayNumber,
  orcaDeviceName: string,
  configs: TouchDeviceConfig[],
  extra: { sidePanelText?: string; simKind?: 'standalone'; roleTags: string[] },
): TouchRigDef {
  const rackId = rack === 'A' ? 'rack.a' : 'rack.b';
  return {
    id, hrn, kind: 'touch', simKind: extra.simKind ?? 'touch', env: 'DEV1',
    locationId: rack === 'A' ? 'loc.rack-a' : 'loc.rack-b',
    hostPropId: rackId, rackId, bay,
    doorSide: rack === 'A' ? -1 : 1,
    actuators: TOUCH_ACTUATORS,
    sim: touchSim(id, rack, orcaDeviceName),
    cameraId: `cam.${id}`,
    roleTags: extra.roleTags,
    sidePanelText: extra.sidePanelText ?? null,
    initialType: configs[0]!.type,
    deviceConfigs: configs,
    lipLabel: hrn,
    fuseTape: `F-${hrn}-5V 10A`,
    collisPropId: `collis.${id}`,
    callusBoxPropId: rack === 'A' ? 'callus.minix-01' : 'callus.minix-02',
  };
}

export const TOUCH_RIGS: readonly TouchRigDef[] = [
  touchRig('wall-e', 'WALL-E', 'A', 4, 'wall-e-flex3', [flex('FLEX_3', 'flex-cradle-gen3', 'FLEX 3', [-34.0, -343.0], 89, -335, -275)], {
    sidePanelText: 'SETI',
    roleTags: ['touch', 'collis', 'flexgen3', 'printer'],
  }),
  touchRig('eve', 'EVE', 'A', 3, 'eve-flex4', [flex('FLEX_4', 'flex-cradle-gen3', 'FLEX 4', [-34.0, -346.0], 89, -338, -278)], {
    roleTags: ['touch', 'collis', 'flexgen3', 'printer', 'legacy-nuc-motion'],
  }),
  touchRig('r2-d2', 'R2-D2', 'A', 2, 'r2-d2-duo', [
    {
      type: 'STATION_DUO', cradle: 'station-duo-tray', tape: 'STATION DUO',
      primaryScreenMm: [309.9, 174.3], secondaryScreenMm: [172.3, 107.7],
      homeMm: [-154.95, -535.0], maxMm: [309.9, 352],
      probeDisplay: 'secondary', probeOriginMm: [68.8, 239.0],
      slotMm: [0, 85, -160], powerKeyZMm: -517, sledRailXMm: 198,
      nfcMm: [86.2, 119.7], cameraTargetMm: [0, 100, -242],
    },
  ], { roleTags: ['touch', 'collis', 'duo', 'ocr'] }),
  touchRig('bumblebee', 'BUMBLEBEE', 'A', 1, 'bumblebee-mini3', [
    {
      type: 'MINI_3', cradle: 'mini-dock', tape: 'MINI 3',
      primaryScreenMm: [172.3, 107.7], homeMm: [-86.15, -296.0], maxMm: [184, 120],
      probeDisplay: 'primary', probeOriginMm: [0, 0],
      slotMm: [0, 82.5, -160], powerKeyZMm: -298, sledRailXMm: 127,
      nfcMm: [86.2, 119.7], cameraTargetMm: [0, 100, -242],
    },
  ], { roleTags: ['touch', 'collis', 'mini', 'printer'] }),
  touchRig('johnny-5', 'JOHNNY-5', 'B', 4, 'johnny-5-flex1', [
    small5('FLEX_1', 'flex-cradle-gen1', 'FLEX 1', [-31.15, -335.0], 87, -335, 65, -280),
    flex('FLEX_2', 'flex-cradle-gen2', 'FLEX 2', [-34.0, -348.0], 88, -338, -280),
  ], { roleTags: ['touch', 'collis', 'flex-legacy', 'printer'] }),
  touchRig('seti', 'SETI', 'B', 3, 'seti-compact', [small5('COMPACT', 'compact-cradle', 'COMPACT', [-31.15, -311.0], 85, -305, 68, -256)], {
    sidePanelText: 'SETI',
    roleTags: ['touch', 'collis', 'canada', 'physical-pin'],
  }),
  touchRig('baymax', 'BAYMAX', 'B', 2, 'baymax-st2018', [
    {
      type: 'STATION_2018', cradle: 'station-tray', tape: 'STATION 2018',
      primaryScreenMm: [309.9, 174.3], homeMm: [-154.95, -370.0], maxMm: [309.9, 186],
      probeDisplay: 'primary', probeOriginMm: [0, 0],
      slotMm: [0, 85, -160], powerKeyZMm: -352, sledRailXMm: 198,
      nfcMm: [155.0, 192.3], cameraTargetMm: [0, 100, -283],
    },
  ], { roleTags: ['touch', 'collis', 'printer', 'build'] }),
  touchRig('rosie', 'ROSIE', 'B', 1, 'rosie-pocket', [flex('FLEX_POCKET', 'flex-cradle-pocket', 'FLEX POCKET', [-34.0, -320.0], 90, -302, -252)], {
    simKind: 'standalone',
    roleTags: ['touch', 'collis', 'paycore', 'flexgen3', 'printerless'],
  }),
];

/* ───────────────────────────── Tethered bench rack.t (§2.12) ───────────────────────────── */

export const RACK_T_ORIGIN: Vec3 = [2.4, 0, -2.05];

export function rackTToWorld(local: Vec3): Vec3 {
  return [round6(RACK_T_ORIGIN[0] + local[0]), round6(local[1]), round6(RACK_T_ORIGIN[2] + local[2])];
}

function face(
  rig: TetheredRigId, role: 'mfd' | 'cfd', deviceType: DeviceTypeCode, x: number, y: number, env: string,
  logo: 'wordmark' | 'leaf', defaultLook: 'lock' | 'dark', swipeSticker?: { glyph: string; color: string },
): TetheredFaceDef {
  const local: Vec3 = [x, y, 0];
  const mini3 = deviceType === 'MINI_3';
  const HRN = rig.toUpperCase();
  return {
    id: `rig.${rig}.${role}`,
    role, deviceType,
    orcaDeviceName: `${rig}-${role}`,
    local,
    world: rackTToWorld(local),
    faceM: mini3 ? [0.208, 0.158] : [0.21, 0.16],
    tapes: [HRN, role.toUpperCase(), env],
    logo, defaultLook,
    ...(swipeSticker ? { swipeSticker } : {}),
    dockId: `rig.${rig}.dock-${role}`,
    callout: `${HRN}  ${role.toUpperCase()}  ${env}`,
  };
}

function tetheredSim(id: TetheredRigId): RigSimIds {
  return {
    rigId: id,
    piHostId: 'pi-tethered',
    collisId: `smartstripe-${id}`,
    callusHostId: 'minix-02',
    cameraViewId: 'cam-tethered',
    orcaDeviceNames: [`${id}-mfd`, `${id}-cfd`],
    deviceLoadIds: [`psu-${id}-mfd`, `psu-${id}-cfd`],
    piLoadId: 'pi-tethered',
    collisLoadId: null,
    mainTerminalId: null,
    motorTerminalId: null,
    bayFuseId: null,
  };
}

export const TETHERED_RIGS: readonly TetheredRigDef[] = [
  {
    id: 'megatron', hrn: 'MEGATRON', kind: 'tethered', env: 'DEV1', locationId: 'loc.rack-tethered', hostPropId: 'rack.t',
    actuators: TETHERED_ACTUATORS, sim: tetheredSim('megatron'), cameraId: 'cam.tethered', roleTags: ['tethered', 'dev1'],
    mfd: face('megatron', 'mfd', 'STATION_2', -0.112, 1.34, 'DEV1', 'wordmark', 'lock', { glyph: '▶▬', color: '#111111' }),
    cfd: face('megatron', 'cfd', 'MINI_2', -0.112, 1.12, 'DEV1', 'wordmark', 'dark'),
    smartstripe: { id: 'rig.megatron.smartstripe', dongleX: -0.235, clampX: -0.15, bladeText: 'SmartStripe Probe', simCollisId: 'smartstripe-megatron' },
  },
  {
    id: 'optimus', hrn: 'OPTIMUS', kind: 'tethered', env: 'STG', locationId: 'loc.rack-tethered', hostPropId: 'rack.t',
    actuators: TETHERED_ACTUATORS, sim: tetheredSim('optimus'), cameraId: 'cam.tethered', roleTags: ['tethered', 'stg'],
    mfd: face('optimus', 'mfd', 'MINI_3', 0.112, 1.34, 'STG', 'leaf', 'lock', { glyph: '▬▶', color: '#2fbf5a' }),
    cfd: face('optimus', 'cfd', 'MINI_3', 0.112, 1.12, 'STG', 'leaf', 'dark'),
    smartstripe: { id: 'rig.optimus.smartstripe', dongleX: 0.015, clampX: 0.07, cardX: 0.17, bladeText: 'SmartStripe Probe', simCollisId: 'smartstripe-optimus' },
  },
];

/* ───────────────────────────── ADB shelf (§2.13) ───────────────────────────── */

export const SHELF_ADB_ORIGIN: Vec3 = [0.85, 0, -1.9];

export function shelfAdbToWorld(local: Vec3): Vec3 {
  return [round6(SHELF_ADB_ORIGIN[0] + local[0]), round6(local[1]), round6(SHELF_ADB_ORIGIN[2] + local[2])];
}

function adbSim(id: AdbRigId, orcaDeviceName: string): RigSimIds {
  return {
    rigId: id, piHostId: 'pi-adb-shelf', collisId: null, callusHostId: null, cameraViewId: null,
    orcaDeviceNames: [orcaDeviceName], deviceLoadIds: [`psu-${orcaDeviceName}`], piLoadId: 'pi-adb-shelf',
    collisLoadId: null, mainTerminalId: null, motorTerminalId: null, bayFuseId: null,
  };
}

export const ADB_RIGS: readonly AdbRigDef[] = [
  {
    id: 'data', hrn: 'DATA', kind: 'adb', env: 'DEV1', locationId: 'loc.adb-shelf', hostPropId: 'shelf.adb',
    actuators: ADB_ACTUATORS, sim: adbSim('data', 'data-mini3'), cameraId: 'cam.adb', roleTags: ['adb-only', 'printerless'],
    deviceType: 'MINI_3', propId: 'rig.data.device', local: [-0.25, 1.0, 0.05], world: shelfAdbToWorld([-0.25, 1.0, 0.05]),
    stand: { kind: 'mini-stand', screenTiltFromVerticalDeg: 30 }, tape: 'DATA',
  },
  {
    id: 'tars', hrn: 'TARS', kind: 'adb', env: 'DEV1', locationId: 'loc.adb-shelf', hostPropId: 'shelf.adb',
    actuators: ADB_ACTUATORS, sim: adbSim('tars', 'tars-flex4'), cameraId: 'cam.adb', roleTags: ['adb-only', 'flexgen3', 'printer'],
    deviceType: 'FLEX_4', propId: 'rig.tars.device', local: [0.22, 1.0, 0.05], world: shelfAdbToWorld([0.22, 1.0, 0.05]),
    stand: { kind: 'flex-dock', screenTiltFromVerticalDeg: 20 }, tape: 'TARS',
  },
];

/* ───────────────────────────── Roster + lookups ───────────────────────────── */

export const RIGS: readonly RigDef[] = [...TOUCH_RIGS, ...TETHERED_RIGS, ...ADB_RIGS];

export const RIG_BY_ID: Readonly<Record<PhysicalRigId, RigDef>> = Object.fromEntries(RIGS.map((r) => [r.id, r])) as Record<PhysicalRigId, RigDef>;

export function isTouchRig(r: RigDef | undefined): r is TouchRigDef {
  return !!r && r.kind === 'touch';
}

export function touchRigDef(id: string): TouchRigDef {
  const r = TOUCH_RIGS.find((x) => x.id === id);
  if (!r) throw new Error(`Not a touch rig: ${id}`);
  return r;
}

/** Device config for the device type currently on the rig (falls back to the factory config). */
export function deviceConfigFor(rig: TouchRigDef, type?: DeviceTypeCode | null): TouchDeviceConfig {
  return rig.deviceConfigs.find((c) => c.type === type) ?? rig.deviceConfigs[0]!;
}

export function rigRack(rig: TouchRigDef): RackDef {
  return rackDef(rig.rackId);
}

/** Bay-local mm → world metres for a touch rig. */
export function rigToWorld(rig: TouchRigDef, localMm: Vec3): Vec3 {
  return bayToWorld(rigRack(rig), rig.bay, localMm);
}

/** Solenoid tip position (bay-local mm) for a gantry position in sim mm (home-relative). */
export function tipBayMm(cfg: TouchDeviceConfig, xMm: number, yMm: number): Vec2 {
  return [round6(cfg.homeMm[0] + xMm), round6(cfg.homeMm[1] + yMm)];
}

/** Gantry position (sim mm) of a point given in the PROBE display's screen mm. */
export function probeScreenToGantryMm(cfg: TouchDeviceConfig, sx: number, sy: number): Vec2 {
  return [round6(cfg.probeOriginMm[0] + sx), round6(cfg.probeOriginMm[1] + sy)];
}

/** Beam-carriage centre cx and arm-carriage centre az (bay mm) for a gantry position. */
export function carriageCentresMm(cfg: TouchDeviceConfig, xMm: number, yMm: number): { cx: number; az: number } {
  const [tipX, tipZ] = tipBayMm(cfg, xMm, yMm);
  return { cx: round6(tipX - GANTRY_MM.dropOffsetX), az: tipZ };
}

/** World position of the solenoid tip at rest (or extended) for a gantry position. */
export function tipWorld(rig: TouchRigDef, cfg: TouchDeviceConfig, xMm: number, yMm: number, extended = false): Vec3 {
  const [tx, tz] = tipBayMm(cfg, xMm, yMm);
  return rigToWorld(rig, [tx, extended ? SOLENOID_MM.tipExtendedY : SOLENOID_MM.tipRestY, tz]);
}

export interface ScreenRect {
  /** Top-left (x, z) bay mm and size (w, h) mm; the screen plane is at bay y 100. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
}

export function primaryScreenRect(cfg: TouchDeviceConfig): ScreenRect {
  return { x: cfg.homeMm[0], z: cfg.homeMm[1], w: cfg.primaryScreenMm[0], h: cfg.primaryScreenMm[1] };
}

/** The display the probe works on (R2-D2: the CFD). */
export function probeScreenRect(cfg: TouchDeviceConfig): ScreenRect {
  const size = cfg.probeDisplay === 'secondary' && cfg.secondaryScreenMm ? cfg.secondaryScreenMm : cfg.primaryScreenMm;
  return { x: round6(cfg.homeMm[0] + cfg.probeOriginMm[0]), z: round6(cfg.homeMm[1] + cfg.probeOriginMm[1]), w: size[0], h: size[1] };
}

export function screenCentreWorld(rig: TouchRigDef, rect: ScreenRect): Vec3 {
  return rigToWorld(rig, [rect.x + rect.w / 2, SOLENOID_MM.screenY, rect.z + rect.h / 2]);
}

/** Limit-switch bracket positions (bay mm) — they move with the home (JOHNNY-5 re-calibration). */
export function limitSwitchesMm(cfg: TouchDeviceConfig): { x: Vec3; y: Vec3 } {
  const homeCx = cfg.homeMm[0] - GANTRY_MM.dropOffsetX;
  return {
    x: [round6(cfg.homeMm[0] + GANTRY_MM.limitX.xFromHome), GANTRY_MM.limitX.y, -45],
    y: [round6(homeCx + GANTRY_MM.limitY.xFromCx), GANTRY_MM.limitY.y, round6(cfg.homeMm[1] + GANTRY_MM.limitY.zFromHome)],
  };
}

/** Named bay part positions for a rig (world metres). */
export function rigPartWorld(rig: TouchRigDef, part: keyof ReturnType<typeof bayPartPositions>): Vec3 {
  const p = bayPartPositions(rig.doorSide)[part];
  if (!p) throw new Error(`Unknown bay part ${String(part)}`);
  return rigToWorld(rig, p.pos);
}

/* ───────────────────────────── Focus poses (§9.3) ───────────────────────────── */

/** Tablet: centre + 0.32 m along the tablet normal (+Z), FOV 38. */
export function tabletFocusPose(rig: TouchRigDef): FocusPose {
  const c = rigPartWorld(rig, 'tablet');
  return { position: [c[0], c[1], round6(c[2] + 0.32)], lookAt: c, fov: 38 };
}

/** Touch-rig screen: centre + 0.20 m above, FOV 45, camera.up = bay −Z so the screen reads upright. */
export function screenFocusPose(rig: TouchRigDef, cfg: TouchDeviceConfig, display: 'primary' | 'secondary' = 'primary'): FocusPose {
  const rect = display === 'secondary' && cfg.secondaryScreenMm ? probeScreenRect(cfg) : primaryScreenRect(cfg);
  const c = screenCentreWorld(rig, rect);
  return { position: [c[0], round6(c[1] + 0.2), c[2]], lookAt: c, fov: 45, up: [0, 0, -1], near: 0.01 };
}

/* ───────────────────────────── Rig probe points (§9.4) ───────────────────────────── */

export function rigProbePoints(): ProbePointDef[] {
  const out: ProbePointDef[] = [];
  for (const r of TOUCH_RIGS) {
    const fuse = r.sim.bayFuseId!;
    out.push({ id: `mp.rig.${r.id}.fuse.in`, on: `rig.${r.id}.fuse`, pointId: r.sim.mainTerminalId!, altPointId: `fuse:${fuse}:in` });
    out.push({ id: `mp.rig.${r.id}.fuse.out`, on: `rig.${r.id}.fuse`, pointId: `${fuse}.load`, altPointId: `fuse:${fuse}:out` });
    out.push({ id: `mp.rig.${r.id}.pi`, on: `rig.${r.id}.pi`, pointId: r.sim.mainTerminalId!, altPointId: `load:pi-${r.id}` });
  }
  return out;
}

/** Collis assignment: Rack A bay n → left half of Callus level n; Rack B → right half. */
export function collisLevelFor(rig: TouchRigDef): { level: BayNumber; half: 'left' | 'right' } {
  return { level: rig.bay, half: rig.rackId === 'rack.a' ? 'left' : 'right' };
}
