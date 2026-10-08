/**
 * Touch-robot racks: frame & bay heights (World §2.1), bay-local frame (§2.2) and the shared bay
 * part positions every touch rig uses (§2.5–§2.9) — the numbers binders, focus poses, probe points
 * and sound emitters need. Pure geometry lives in `src/world/rigs/*`.
 *
 * Bay-local frame (mm): origin at the rack centreline (x 0), the bay floor top surface (y 0) and
 * the FRONT rail plane (z 0); +X = player's right facing the rack, +Y up, +Z toward the aisle
 * (inside the bay z < 0, rear rail plane z −900). Clear interior x −225…+225, y 0…442.
 * World = rack position + (x/1000, bayFloorY + y/1000, 0.450 + z/1000)   (racks have rotY 0).
 */
import type { Vec2, Vec3 } from './types';
import { round6 } from './types';

export const RACK_FRAME = {
  outerMm: [600, 1000, 2000] as Vec3,
  /** Black folded steel posts 45 × 45 at rack-local x ±277.5, z ±477.5 (mm). */
  postMm: 45,
  postCentreMm: { x: 277.5, z: 477.5 },
  /** Bottom frame + 4 levelling feet. */
  plinthMm: [0, 100] as Vec2,
  /** Perforated top plate 600 × 1000. */
  topPlateMm: [1970, 2000] as Vec2,
  rail: {
    frontZMm: 450,
    rearZMm: -450,
    /** Rail flange x ±225 … ±255. */
    flangeXMm: [225, 255] as Vec2,
    squareHoleMm: 9.5,
    /** Three holes per U at these heights above each U's bottom. */
    holeOffsetsMm: [6.35, 22.225, 38.1] as readonly number[],
    holeCentreXMm: 232.5,
  },
  /** Front-rail numbering (IMG-T): white numbers centred per U in the outer 15 mm band + 6 mm ticks. */
  railNumbers: { color: '#f2f2f2', capMm: 8, leftBandXMm: [-255, -240] as Vec2, rightBandXMm: [240, 255] as Vec2, tickMm: 6 },
  /** Continuous green LED strip on the inner face of each FRONT post. */
  ledStrip: { xMm: 255, yMm: [100, 1970] as Vec2, widthMm: 10, ledsPerM: 60, material: 'ledStripGreen' },
  units: 42,
  u1BottomMm: 100,
  uMm: 44.45,
  bayUnits: 10,
  /** Shelf plate thickness; the next shelf's plate is the bay ceiling. */
  shelfPlateMm: 2,
  bayClearMm: 442,
  /** Shelf front/rear flanges hang this far below the plate. */
  flangeDropMm: 40,
  bayInteriorXMm: 225,
  bayDepthMm: 900,
} as const;

/** Bottom of rack unit n (rack-local mm): Uₙ spans 100 + (n−1)·44.45 … 100 + n·44.45. */
export function uBottomMm(n: number): number {
  return round6(RACK_FRAME.u1BottomMm + (n - 1) * RACK_FRAME.uMm);
}

export function uTopMm(n: number): number {
  return round6(RACK_FRAME.u1BottomMm + n * RACK_FRAME.uMm);
}

/** Fractional rack unit at a rack-local height (mm): 1.0 = bottom of U1. */
export function unitPositionAt(yMm: number): number {
  return 1 + (yMm - RACK_FRAME.u1BottomMm) / RACK_FRAME.uMm;
}

/** Integer rack unit containing a rack-local height in metres (null outside U1–U42). */
export function unitAtHeight(yM: number): number | null {
  const u = Math.floor(unitPositionAt(yM * 1000));
  return u >= 1 && u <= RACK_FRAME.units ? u : null;
}

export type BayNumber = 1 | 2 | 3 | 4;

export interface BayDef {
  readonly bay: BayNumber;
  /** Rack units [first, last]. */
  readonly units: readonly [number, number];
  /** Bay floor top surface, rack-local y (m). */
  readonly floorY: number;
  /** Fascia y range (m). */
  readonly fasciaY: readonly [number, number];
}

/** Four 10U bays per rack (bay 4 at the top). */
export const BAYS: readonly BayDef[] = [
  { bay: 4, units: [31, 40], floorY: 1.4335, fasciaY: [1.4485, 1.6385] },
  { bay: 3, units: [21, 30], floorY: 0.989, fasciaY: [1.004, 1.194] },
  { bay: 2, units: [11, 20], floorY: 0.5445, fasciaY: [0.5595, 0.7495] },
  { bay: 1, units: [1, 10], floorY: 0.1, fasciaY: [0.115, 0.305] },
];

export function bayDef(bay: BayNumber): BayDef {
  const b = BAYS.find((x) => x.bay === bay);
  if (!b) throw new Error(`Unknown bay ${bay}`);
  return b;
}

/** U41 plate (top equipment level) at rack-local y 1.878. */
export const RACK_TOP_PLATE_Y = 1.878;

export type RackLetter = 'A' | 'B';

export interface RackDef {
  readonly id: 'rack.a' | 'rack.b';
  readonly letter: RackLetter;
  /** Footprint centre at the floor (World §1.4). */
  readonly pos: Vec3;
  readonly rotY: 0;
  /** Side doors are on the rack's OUTER side: −1 = −X face (Rack A), +1 = +X face (Rack B). */
  readonly doorSide: -1 | 1;
  /** The side facing `shelf.callus` has no door (Collis ribbons and USB pass through). */
  readonly openSide: -1 | 1;
  /** Bay number → rig id. */
  readonly bays: Readonly<Record<BayNumber, string>>;
  /** Label tape on the rack top front. */
  readonly topLabel: string;
  /** U41–U42 contents. */
  readonly topFront: readonly string[];
  readonly topRear: string;
  readonly fuseWallId: string;
  readonly regulatorWallId: string;
}

export const RACKS: readonly RackDef[] = [
  {
    id: 'rack.a',
    letter: 'A',
    pos: [-2.6, 0, -2.1],
    rotY: 0,
    doorSide: -1,
    openSide: 1,
    bays: { 4: 'wall-e', 3: 'eve', 2: 'r2-d2', 1: 'bumblebee' },
    topLabel: 'RACK A — TOUCH ROBOTS',
    topFront: ['power.rackdist.a'],
    topRear: 'power.strip.a',
    fuseWallId: 'power.fuse.5v-a',
    regulatorWallId: 'power.reg.5v-a',
  },
  {
    id: 'rack.b',
    letter: 'B',
    pos: [-1.4, 0, -2.1],
    rotY: 0,
    doorSide: 1,
    openSide: -1,
    bays: { 4: 'johnny-5', 3: 'seti', 2: 'baymax', 1: 'rosie' },
    topLabel: 'RACK B — TOUCH ROBOTS',
    topFront: ['rig.rack-b.camera-pi', 'power.rackdist.b'],
    topRear: 'power.strip.b',
    fuseWallId: 'power.fuse.5v-b',
    regulatorWallId: 'power.reg.5v-b',
  },
];

export function rackDef(id: string): RackDef {
  const r = RACKS.find((x) => x.id === id || x.letter === id);
  if (!r) throw new Error(`Unknown rack ${id}`);
  return r;
}

/** World position of the bay-local origin (front rail plane, rack centreline, bay floor). */
export function bayOriginWorld(rack: RackDef, bay: BayNumber): Vec3 {
  return [rack.pos[0], round6(rack.pos[1] + bayDef(bay).floorY), round6(rack.pos[2] + RACK_FRAME.rail.frontZMm / 1000)];
}

/** Bay-local millimetres → world metres (racks are axis-aligned, rotY 0). */
export function bayToWorld(rack: RackDef, bay: BayNumber, local: Vec3): Vec3 {
  const o = bayOriginWorld(rack, bay);
  return [round6(o[0] + local[0] / 1000), round6(o[1] + local[1] / 1000), round6(o[2] + local[2] / 1000)];
}

/** World AABB (min, max) of a bay's clear interior. */
export function bayInteriorAabb(rack: RackDef, bay: BayNumber): { min: Vec3; max: Vec3 } {
  const lo = bayToWorld(rack, bay, [-RACK_FRAME.bayInteriorXMm, 0, -RACK_FRAME.bayDepthMm]);
  const hi = bayToWorld(rack, bay, [RACK_FRAME.bayInteriorXMm, RACK_FRAME.bayClearMm, 0]);
  return { min: lo, max: hi };
}

/** Rail-number interactable id: `rack.a.rails.u33-left`. */
export function railUnitId(rackId: string, n: number, side: 'left' | 'right'): string {
  return `${rackId}.rails.u${n}-${side}`;
}

/** World centre of a rail number label (front rail band). */
export function railUnitLabelPos(rack: RackDef, n: number, side: 'left' | 'right'): Vec3 {
  const band = side === 'left' ? RACK_FRAME.railNumbers.leftBandXMm : RACK_FRAME.railNumbers.rightBandXMm;
  const xMm = (band[0] + band[1]) / 2;
  const yMm = (uBottomMm(n) + uTopMm(n)) / 2;
  return [round6(rack.pos[0] + xMm / 1000), round6(yMm / 1000), round6(rack.pos[2] + RACK_FRAME.rail.frontZMm / 1000)];
}

/* ───────────────────────────── Shared bay part positions (bay-local mm) ───────────────────────────── */

/** §2.9 Front fascia (front face at bay z +3). Points are (x, y). */
export const FASCIA_MM = {
  frontZ: 3,
  ears: { x: [225, 241.3] as Vec2, y: [15, 205] as Vec2, thickness: 3 },
  topBar: { y: [175, 205] as Vec2, depth: 20, screwsX: [-215, -80, 80, 215] as readonly number[] },
  bottomBar: { y: [15, 45] as Vec2, depth: 20, screwsX: [-215, -80, 80, 215] as readonly number[] },
  powerPanel: {
    x: [-225, -140] as Vec2,
    y: [45, 175] as Vec2,
    depth: 43,
    recess: 3,
    title: { text: 'POWER', at: [-182.5, 162] as Vec2, capMm: 11, color: '#8d8f93' },
    ledMain: [-203, 133] as Vec2,
    ledMotor: [-162, 133] as Vec2,
    led: { ringMm: 16, lensMm: 11, domeMm: 2 },
    switchMain: [-203, 92] as Vec2,
    switchMotor: [-162, 92] as Vec2,
    toggle: { nutMm: [12, 3] as Vec2, batMm: [3, 12] as Vec2, onDeg: 18, offDeg: -18 },
    labelMain: { text: 'MAIN', at: [-203, 72] as Vec2, capMm: 6 },
    labelMotor: { text: 'MOTOR', at: [-162, 72] as Vec2, capMm: 6 },
    logo: { at: [-182.5, 54] as Vec2, leafMm: 14, wordmarkMm: 44, raisedMm: 1.2 },
  },
  tabletFrame: { centre: [0, 110] as Vec2, outer: [230, 146, 14] as Vec3, window: [212, 130] as Vec2, clampTopY: [175, 189] as Vec2 },
  tablet: {
    centre: [0, 110] as Vec2,
    glassZ: 3.5,
    body: [210, 128, 9] as Vec3,
    bezel: { lr: 18.85, tb: 10.15 },
    activeMm: [172.3, 107.7] as Vec2,
    activePx: [1280, 800] as Vec2,
    cameraDotMm: 3,
    usbEntry: { side: 'left', y: 120 },
  },
  sidePanel: {
    x: [140, 225] as Vec2,
    y: [45, 175] as Vec2,
    depth: 43,
    letters: { x: 195, topY: 160, capMm: 26, gapMm: 4, color: '#d9d9d9' },
    usbPorts: [[157, 140], [157, 95]] as readonly Vec2[],
    usbLabels: ['Minix', 'Raspberry Pi'] as readonly string[],
  },
} as const;

/** §2.5 XY gantry kinematics (bay-local mm). */
export const GANTRY_MM = {
  /** Fixed 2040 front beam. */
  beam: { x: [-220, 220] as Vec2, y: [255, 295] as Vec2, z: [-55, -35] as Vec2 },
  /** The drop sits this far to +X of the arm: beam-carriage centre cx = tipX − 26. */
  dropOffsetX: 26,
  cxRange: [-183, 183] as Vec2,
  /** Arm-carriage centre az = tipZ. */
  azRange: [-560, -80] as Vec2,
  xIdler: [-205, 275, -62] as Vec3,
  xMotor: [199, 275, -83] as Vec3,
  xCarriagePlate: { w: 70, y: [245, 305] as Vec2, z: [-35, -29] as Vec2 },
  /** X limit switch: top of the beam at x = homeX − 26 − 40, y 297. */
  limitX: { xFromHome: -66, y: 297 },
  arm: { y: [340, 360] as Vec2, z: [-600, -40] as Vec2, lengthMm: 560 },
  riser: { y: [310, 340] as Vec2, z: -45 },
  /** Y motor body centre (cx, 396, −62), shaft down, pulley at y 368. */
  yMotor: { y: 396, z: -62, pulleyY: 368 },
  yIdler: { y: 368, z: -590 },
  /** Y limit switch: z = homeZ − 38, x = cx + 12, y 335. */
  limitY: { zFromHome: -38, xFromCx: 12, y: 335 },
  armCarriage: { xFromCx: [10, 16] as Vec2, y: [325, 375] as Vec2, halfLenZ: 30 },
  drop: { xFromCx: 26, y: [165, 340] as Vec2 },
  /** Magnetic lock: > 3 mm clamp/carriage gap shows the red #ff3b30 dot. */
  lockBreakGapMm: 3,
} as const;

/** §2.6 Solenoid probe head heights (bay-local y, rest). Add `solenoid.heightAdjustMm` if present. */
export const SOLENOID_MM = {
  tipRestY: 106,
  tipExtendedY: 96,
  /** Contact when the tip is at or below this y (the rubber tip compresses up to 4 mm). */
  contactY: 100.5,
  strokeMm: 10,
  frameY: [120, 150] as Vec2,
  clipTopY: 162,
  dropBottomY: 165,
  /** Device screens lie face-up and level at this bay y (D7). */
  screenY: 100,
} as const;

/** §2.7 Dip arm / tap paddle / phone sled (bay-local mm). */
export const DIP_ARM_MM = {
  tower: { x: [12, 52] as Vec2, z: [-68, -28] as Vec2, height: 240 },
  pivotZ: -48.4,
  /** pivotY = slotY + 47.9 */
  pivotAboveSlot: 47.9,
  inDeg: -20,
  outDeg: 35,
  pivotToTip: 140,
  gearLabel: '63',
  toothDeg: 1.8,
} as const;

export const TAP_PADDLE_MM = { pivot: [60, 170, -48] as Vec3, paddle: [60, 40, 5] as Vec3, carryY: 108 } as const;

export const PHONE_SLED_MM = {
  /** Rail along Z at x = deviceRightEdge + 23 (the per-rig `sledRailX`). */
  railZ: [-620, -180] as Vec2,
  backZ: -600,
  sled: [30, 70, 45] as Vec3,
  pusherReachMm: 6,
} as const;

/** The 2-mm-cradle rule: chip-slot edge face of every device at bay z −160 (D7). */
export const DEVICE_SLOT_EDGE_Z = -160;

/**
 * Door-side–dependent parts (§2.8). `s` = rack.doorSide (−1 Rack A, +1 Rack B). Positions are
 * bay-local mm; `rotY` in degrees.
 */
export function bayPartPositions(doorSide: -1 | 1): Record<string, { pos: Vec3; rotY?: number }> {
  const s = doorSide;
  return {
    /** Raspberry Pi on the floor, door-side rear corner, ports facing the door. */
    pi: { pos: [165 * s, 0, -790], rotY: s < 0 ? 90 : -90 },
    /** Inline bay fuse zip-tied to the door-side rear post. */
    fuse: { pos: [205 * s, 70, -850] },
    /** Device AC brick on the floor, door side. */
    devicePsu: { pos: [150 * s, 0, -640] },
    /** Motor PCB on the back mesh, OPPOSITE the door side, facing +Z. */
    motorPcb: { pos: [-110 * s, 205, -893] },
    /** Webcam on a gooseneck clamped to the left front post top. */
    webcamClamp: { pos: [-225, 425, -10] },
    webcamCamera: { pos: [-150, 410, -120] },
    /** Collis ribbon enters through the open (Callus) side. */
    collisRibbonEntry: { pos: [225 * -s, 30, -400] },
    /** Side door hinge (rear post on the door side). */
    doorHinge: { pos: [241 * s, 0, -900] },
    tablet: { pos: [0, 110, FASCIA_MM.tablet.glassZ] },
    powerPanel: { pos: [-182.5, 110, FASCIA_MM.frontZ] },
    switchMain: { pos: [-203, 92, FASCIA_MM.frontZ] },
    switchMotor: { pos: [-162, 92, FASCIA_MM.frontZ] },
    sidePanel: { pos: [182.5, 110, FASCIA_MM.frontZ] },
  };
}

/** Hex-mesh side door: 900 (Z) × 440 (Y), hinged on the rear post, opens outward 0 → 95° in 0.45 s. */
export const SIDE_DOOR = { lenZMm: 900, heightMm: 440, openDeg: 95, openS: 0.45, handleY: 220 } as const;
