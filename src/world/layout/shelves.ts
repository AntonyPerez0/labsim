/**
 * Callus shelf (World §2.14), tethered bench frame (§2.12), ADB shelf (§2.13) and the build table
 * (§2.15) — shelf-local specs with world transforms. All three shelves are axis-aligned (rotY 0),
 * shelf-local +Z points to the aisle.
 */
import { BAYS, type BayNumber } from './racks';
import { TOUCH_RIGS, RACK_T_ORIGIN, SHELF_ADB_ORIGIN, rackTToWorld, shelfAdbToWorld, type TouchRigId } from './rigs';
import { round6, type SimRef, type Vec2, type Vec3 } from './types';

/* ───────────────────────────── Callus shelf (§2.14) ───────────────────────────── */

export const CALLUS_ORIGIN: Vec3 = [-2.0, 0, -2.1];

export function callusToWorld(local: Vec3): Vec3 {
  return [round6(CALLUS_ORIGIN[0] + local[0]), round6(local[1]), round6(CALLUS_ORIGIN[2] + local[2])];
}

/** Levels L1–L4 at the same heights as the bays; top plate at 1.878. */
export const CALLUS_LEVELS: Readonly<Record<BayNumber, number>> = {
  1: BAYS.find((b) => b.bay === 1)!.floorY,
  2: BAYS.find((b) => b.bay === 2)!.floorY,
  3: BAYS.find((b) => b.bay === 3)!.floorY,
  4: BAYS.find((b) => b.bay === 4)!.floorY,
};

export const CALLUS_SHELF = {
  id: 'shelf.callus',
  origin: CALLUS_ORIGIN,
  outer: [0.6, 1.0, 1.95] as Vec3,
  topPlateY: 1.878,
  material: 'perforatedSteel',
} as const;

export interface CollisPlacement {
  readonly id: string;
  readonly rigId: TouchRigId;
  readonly simId: string;
  readonly level: BayNumber;
  /** Shelf-local base centre (m) and world position. */
  readonly local: Vec3;
  readonly world: Vec3;
  /** Rear panel (ribbon) faces the probe's own rack: Rack A probes rotY +90, Rack B −90. */
  readonly rotY: number;
  /** Box 150 W × 110 D × 45 H mm. */
  readonly sizeMm: Vec3;
  readonly topTape: string;
  readonly frontSticker: 'UL Transaction Security';
}

function collisZ(level: BayNumber): number {
  // Level 3: front reserved for the Windows boxes; level 4: front holds the console monitor.
  if (level === 3) return -0.25;
  if (level === 4) return -0.2;
  return 0.2;
}

export const COLLIS_PROBES: readonly CollisPlacement[] = TOUCH_RIGS.map((r) => {
  const left = r.rackId === 'rack.a';
  const local: Vec3 = [left ? -0.15 : 0.15, CALLUS_LEVELS[r.bay], collisZ(r.bay)];
  return {
    id: `collis.${r.id}`,
    rigId: r.id,
    simId: r.sim.collisId!,
    level: r.bay,
    local,
    world: callusToWorld(local),
    rotY: left ? 90 : -90,
    sizeMm: [150, 110, 45],
    topTape: `COLLIS · ${r.hrn}`,
    frontSticker: 'UL Transaction Security',
  };
});

/** Note on the Collis rotY: the doc lists −90/+90 but also says "rear panel faces Rack A" — the
 * rear-facing rule wins (ribbon straight into the bay), so Rack A probes are +90 (front faces east). */
export const COLLIS_ROT_NOTE = 'rotY chosen so the rear ribbon panel faces the probe\'s own rack (doc rotY values were swapped).';

export interface CallusBoxDef {
  readonly id: string;
  readonly label: string;
  readonly kind: 'minix' | 'nuc' | 'slot';
  /** Shelf-local base centre (level 3 front, z +0.30). */
  readonly local: Vec3;
  readonly world: Vec3;
  readonly sizeMm: Vec3;
  readonly sim: SimRef;
  readonly stickyNote?: readonly string[];
}

function box(id: string, label: string, kind: CallusBoxDef['kind'], x: number, sizeMm: Vec3, simIds: string[], stickyNote?: string[]): CallusBoxDef {
  const local: Vec3 = [x, CALLUS_LEVELS[3], 0.3];
  return {
    id, label, kind, local, world: callusToWorld(local), sizeMm,
    sim: { collection: 'hosts', ids: simIds },
    ...(stickyNote ? { stickyNote } : {}),
  };
}

/** Windows boxes on level 3 front. Minix 120 × 120 × 19; NUC 117 × 112 × 51. */
export const CALLUS_BOXES: readonly CallusBoxDef[] = [
  box('callus.minix-01', 'MINIX-01', 'minix', -0.18, [120, 120, 19], ['minix-01']),
  box('callus.minix-02', 'MINIX-02', 'minix', -0.06, [120, 120, 19], ['minix-02']),
  box('callus.nuc-03', 'NUC-03', 'nuc', 0.06, [117, 112, 51], ['nuc-03'], ['DISK 100% — corporate AGENT.', 'NO HARDWARE CONTROL', 'ON THIS BOX. –J']),
  // Empty unless the sim seeds NUC-01 / MINIX-03 (tape `SPARE`).
  box('callus.slot-4', 'SPARE', 'slot', 0.18, [120, 120, 19], ['nuc-01', 'minix-03']),
];

export const CALLUS_FIXTURES = {
  /** 12 V distribution block with 4 barrel outputs, fed from F-12V via tray.ct2. */
  dist12v: { id: 'callus.dist-12v', local: [0, 0.995, -0.45] as Vec3, world: callusToWorld([0, 0.995, -0.45]), tape: '12V · CALLUS / NUC SHELF' },
  /** 7" HDMI LCD 175 × 110 × 15 on a kickstand tilted back 10°; console of the KVM-selected box. */
  monitor: { id: 'callus.monitor', local: [0, CALLUS_LEVELS[4], 0.3] as Vec3, world: callusToWorld([0, CALLUS_LEVELS[4], 0.3]), sizeMm: [175, 110, 15] as Vec3, tiltDeg: 10, canvasPx: [512, 320] as Vec2, kvmOrder: ['callus.minix-01', 'callus.minix-02', 'callus.nuc-03', 'callus.slot-4'] as readonly string[] },
  /** The free 24 V barrel lead lying on the shelf (sim `T-24V-CALLUS`, INC18 trap). */
  spare24vLead: { id: 'callus.tap-24v', local: [0.05, CALLUS_LEVELS[2], 0.1] as Vec3, world: callusToWorld([0.05, CALLUS_LEVELS[2], 0.1]), sim: { collection: 'power.terminals', ids: ['T-24V-CALLUS'] } as SimRef },
  /** Black USB cables from each Collis front up the posts to its Callus box (A → MINIX-01, B → MINIX-02). */
  usb: { rackA: 'callus.minix-01', rackB: 'callus.minix-02' },
} as const;

/* ───────────────────────────── Tethered bench rack.t (§2.12) ───────────────────────────── */

export const RACK_T = {
  id: 'rack.t',
  origin: RACK_T_ORIGIN,
  frame: { outer: [0.6, 0.9, 1.8] as Vec3, postMm: 45, postCentre: { x: 0.2775, z: 0.4275 }, railNumbers: false },
  /** Shelf top surfaces (m): S0, S1, S2 (dock shelf), S3 (directly above the MFD row). */
  shelves: { s0: 0.1, s1: 0.5, s2: 0.93, s3: 1.5, topPlate: [1.77, 1.8] as Vec2 },
  shelfMaterial: 'perforatedSteelRounded',
  /** Two silver 2020 uprights from S2 to S3, cross members at y 1.02 and 1.43. */
  devicePanel: { uprightX: [-0.235, 0.235] as Vec2, uprightZ: -0.05, crossY: [1.02, 1.43] as Vec2 },
  /** Four black printed C-holders 70 W × 150 D × 200 H on S2, centred z +0.36; base plates to the front lip. */
  docks: [
    { id: 'rig.megatron.dock-mfd', x: -0.19, tape: ['MEGATRON', 'MFD'] },
    { id: 'rig.megatron.dock-cfd', x: -0.08, tape: ['MEGATRON', 'CFD'] },
    { id: 'rig.optimus.dock-mfd', x: 0.08, tape: ['OPTIMUS', 'MFD'] },
    { id: 'rig.optimus.dock-cfd', x: 0.19, tape: ['OPTIMUS', 'CFD'] },
  ] as readonly { id: string; x: number; tape: readonly [string, string] }[],
  dockSizeMm: [70, 150, 200] as Vec3,
  dockZ: 0.36,
  /** Hub: white rounded box 120 (D) × 165 (H) × 40 (W) on its long edge, port face toward the aisle. */
  hubSizeMm: [40, 120, 165] as Vec3,
  /** Shelf Pi standing upright between the inner docks, RJ45 at the top. */
  pi: { id: 'rig.tethered.pi', local: [0, 0.93, 0.36] as Vec3, sim: { collection: 'hosts', ids: ['pi-tethered'] } as SimRef },
  webcam: { id: 'rig.tethered.webcam', clamp: [0, 1.49, 0.4] as Vec3, camera: [0, 1.45, 0.38] as Vec3, lookAt: [0, 1.23, 0] as Vec3, vFovDeg: 46 },
  smartstripeY: [1.2, 1.26] as Vec2,
  /** Hub Ethernet colours (IMG-R). */
  cableColors: { megatronEthernet: '#8fb7e6', optimusEthernet: '#f0f0ee', usb: ['#151515', '#f0f0ee'] as readonly string[], dcPower: '#151515' },
  cableKeepers: 3,
  lower: {
    s1: ['8-port switch', 'Station 2 base (MEGATRON MFD)', 'spare hub', 'cable box'] as readonly string[],
    s0: ['power.strip.t (rear)', '4 device AC bricks'] as readonly string[],
    top: ['two cardboard boxes'] as readonly string[],
  },
  /** IMG-R reference viewpoint (Playwright `img-r`): 70° horizontal FOV. */
  photoView: { position: [2.55, 1.3, -0.75] as Vec3, lookAt: [2.4, 1.1, -2.1] as Vec3, hFovDeg: 70 },
} as const;

export function rackTDockWorld(x: number): Vec3 {
  return rackTToWorld([x, RACK_T.shelves.s2, RACK_T.dockZ]);
}

/* ───────────────────────────── ADB shelf (§2.13) ───────────────────────────── */

export const SHELF_ADB = {
  id: 'shelf.adb',
  origin: SHELF_ADB_ORIGIN,
  outer: [1.0, 0.6, 1.05] as Vec3,
  tiers: { lower: 0.45, upper: 1.0 },
  labels: [
    { text: 'DATA', local: [-0.25, 0.99, 0.29] as Vec3, tape: 'white' },
    { text: 'TARS', local: [0.22, 0.99, 0.29] as Vec3, tape: 'white' },
    { text: 'ADB ONLY — NO PIN', local: [0, 0.97, 0.3] as Vec3, tape: 'yellow' },
  ] as readonly { text: string; local: Vec3; tape: 'white' | 'yellow' }[],
  pi: { id: 'rig.adb.pi', local: [-0.3, 0.45, -0.1] as Vec3, world: shelfAdbToWorld([-0.3, 0.45, -0.1]), sim: { collection: 'hosts', ids: ['pi-adb-shelf'] } as SimRef },
  networkSwitch: { local: [0.05, 0.45, -0.1] as Vec3, ports: 5 },
  webcam: { id: 'rig.adb.webcam', camera: [0.45, 1.35, -0.25] as Vec3, lookAt: [0, 1.1, 0.05] as Vec3, vFovDeg: 40, mount: 'rear-right post' },
  acBricks: 2,
} as const;

/* ───────────────────────────── Build table (§2.15) ───────────────────────────── */

export interface BuildTableItem {
  readonly id: string;
  readonly item: string;
  /** Table-local position on the top (x along the table, z toward the aisle), metres. LabSim layout. */
  readonly local: Vec3;
  readonly callouts: readonly string[];
  readonly tape?: string;
}

export const BUILD_TABLE_ORIGIN: Vec3 = [-4.4, 0, 0.6];
export const BUILD_TABLE_TOP_Y = 0.9;

/** Item arrangement on the 1.80 × 0.90 top is LabSim's (doc lists contents only). */
export const BUILD_TABLE_ITEMS: readonly BuildTableItem[] = [
  { id: 'table.build.bay-plate', item: 'Bare bay floor plate with a printed cradle', local: [-0.45, 0.9, 0.0], callouts: ['Bay floor plate + 3D-printed cradle'] },
  { id: 'table.build.beam', item: '2040 front beam on two blocks', local: [-0.45, 0.9, -0.3], callouts: ['10 ft aluminium rails, cut to size'] },
  { id: 'table.build.steppers', item: 'Two loose NEMA-17s', local: [0.1, 0.9, -0.28], callouts: ['NEMA-17 stepper motors'] },
  { id: 'table.build.v-wheels', item: 'Bag of V-wheels', local: [0.3, 0.9, -0.3], callouts: ['V-slot wheels'] },
  { id: 'table.build.belt-reel', item: 'GT2 belt reel', local: [0.48, 0.9, -0.28], callouts: ['GT2 timing belt'] },
  { id: 'table.build.bolt-box', item: 'Box of bolts', local: [0.72, 0.9, -0.25], tape: '200+ M2.5 / M5 BOLTS', callouts: ['200+ nuts & bolts (2.5 mm and 5 mm)'] },
  { id: 'table.build.wire-spool', item: '22 AWG spool', local: [0.15, 0.9, 0.05], tape: '130 FT · 22 AWG', callouts: ['130 ft of wiring per robot'] },
  { id: 'table.build.clipboard', item: 'Clipboard', local: [0.5, 0.9, 0.12], tape: 'SOLDER JOINTS ≈ 300 ✓✓✓', callouts: ['~300 hand solder points'] },
  { id: 'table.build.pcb', item: 'Unpopulated green 25-pin PCB', local: [0.78, 0.9, 0.1], callouts: ['25-pin motor controller PCB (printed in Hong Kong)'] },
  { id: 'table.build.solenoid-bag', item: 'Blue solenoid in an anti-static bag', local: [-0.05, 0.9, 0.25], callouts: ['Blue push-pull solenoid'] },
  { id: 'table.build.offcuts', item: 'Extrusion off-cuts', local: [-0.75, 0.9, 0.25], callouts: ['10 ft aluminium rails, cut to size'] },
  { id: 'table.build.hacksaw', item: 'Hacksaw', local: [-0.55, 0.9, 0.3], callouts: ['Rails are cut to size by hand'] },
  { id: 'table.build.tape-measure', item: 'Tape measure', local: [0.3, 0.9, 0.3], callouts: ['Tape measure'] },
];

export function buildTableToWorld(local: Vec3): Vec3 {
  return [round6(BUILD_TABLE_ORIGIN[0] + local[0]), round6(local[1]), round6(BUILD_TABLE_ORIGIN[2] + local[2])];
}

/** The BOM inspect callouts of §2.15 (exact strings). */
export const BUILD_TABLE_CALLOUTS: readonly string[] = [
  '10 ft aluminium rails, cut to size',
  '130 ft of wiring per robot',
  '~300 hand solder points',
  '200+ nuts & bolts (2.5 mm and 5 mm)',
  '25-pin motor controller PCB (printed in Hong Kong)',
];
