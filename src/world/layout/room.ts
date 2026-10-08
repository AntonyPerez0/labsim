/**
 * Room shell (World §1.1), ceiling fixtures (§1.7), light rig (§7.1), overhead cable trays (§1.6)
 * and navigation constants (§1.8).
 */
import type { Vec2, Vec3 } from './types';

/* ───────────────────────────── §1.1 Room shell ───────────────────────────── */

export const ROOM = {
  /** Lab interior box (metres): 14 × 10 × 3. Walls are OUTSIDE this box. */
  interior: { minX: -7.0, maxX: 7.0, minZ: -5.0, maxZ: 5.0, floorY: 0.0, ceilingY: 3.0 },
  wallThickness: 0.15,
  /**
   * The doc places wall-hung decor relative to these planes (x = ±6.985, z = ±4.985): 15 mm off the
   * structural wall face, which leaves room for the plate/frame depth.
   */
  decorPlane: { north: -4.985, south: 4.985, east: 6.985, west: -6.985 },
  wallPaint: '#ecebe7',
  coveBase: { height: 0.1, color: '#1b1b1b', roughness: 0.85 },
  floor: { tileM: 0.305, kind: 'VCT light grey speckle' },
  ceiling: {
    /** T-bar grid lines at x = k·0.6 and z = k·0.6 → tile centres at 0.3 + k·0.6. */
    gridM: 0.6,
    tile: 'fissured 600 × 600',
    gridColor: '#ffffff',
  },
  /** `room.column`: the white drywall column on the left of IMG-R. */
  column: { id: 'room.column', pos: [1.7, 0, -2.05] as Vec3, size: [0.5, 0.5, 3.0] as Vec3 },
} as const;

/** `door.lab` (south wall). Leaf swings into the lab (toward −Z), hinge on the east jamb. */
export const DOOR = {
  id: 'door.lab',
  opening: { minX: 5.44, maxX: 6.36, height: 2.1 },
  /** Frame centre on the south wall line. */
  framePos: [5.9, 0, 5.0] as Vec3,
  rotY: 180,
  hingeX: 6.36,
  leaf: { w: 0.915, d: 0.045, h: 2.1 },
  maxOpenDeg: 95,
  /** Badge-reader unlock opens to 90° in 1.2 s; auto-closes after 8 s when the doorway is clear. */
  badgeOpenDeg: 90,
  badgeOpenS: 1.2,
  autoCloseS: 8,
  /** Open ≥ 60° → the doorway is passable (dynamic collider). */
  passableDeg: 60,
  /** Vision panel on the latch side (Morgan waves through it in M00). */
  visionPanel: { w: 0.1, h: 0.8, minY: 1.1, maxY: 1.9, latchSideOffsetM: 0.14 },
  colors: { frame: '#8d9196', leaf: '#c9ccd0' },
} as const;

/** `corridor.shell` — outside the door; new-game spawn. */
export const CORRIDOR = {
  id: 'corridor.shell',
  minX: 3.4,
  maxX: 8.4,
  minZ: 5.15,
  maxZ: 7.15,
  ceilingY: 2.7,
  wallColor: '#d8d3c8',
  floorColor: '#9b8f80',
  /** One 600 × 600 LED panel; both ends closed by non-interactive doors. */
  ledPanel: [5.9, 2.7, 6.15] as Vec3,
} as const;

/* ───────────────────────────── §1.7 Ceiling fixtures ───────────────────────────── */

export interface TrofferDef {
  readonly id: string;
  /** Centre (x, z); fixture face at y = 3.00, recessed 0.02. Long axis north–south. */
  readonly x: number;
  readonly z: number;
  readonly type: 'fluorescent' | 'led';
  /** §7.1 shadow-caster request priority (0 = never casts). */
  readonly shadowPriority: number;
}

export const TROFFER_SIZE = { w: 0.6, d: 1.2, recess: 0.02, diffuser: [0.58, 1.18] as Vec2 } as const;

export const TROFFERS: readonly TrofferDef[] = [
  { id: 'light.t01', x: -5.1, z: -3.0, type: 'fluorescent', shadowPriority: 0 },
  { id: 'light.t02', x: -1.5, z: -3.0, type: 'led', shadowPriority: 9 },
  { id: 'light.t03', x: 1.5, z: -3.0, type: 'led', shadowPriority: 6 },
  { id: 'light.t04', x: 5.1, z: -3.0, type: 'led', shadowPriority: 0 },
  { id: 'light.t05', x: -5.1, z: 0.0, type: 'led', shadowPriority: 5 },
  { id: 'light.t06', x: -1.5, z: 0.0, type: 'led', shadowPriority: 10 },
  { id: 'light.t07', x: 1.5, z: 0.0, type: 'led', shadowPriority: 8 },
  { id: 'light.t08', x: 5.1, z: 0.0, type: 'led', shadowPriority: 0 },
  { id: 'light.t09', x: -5.1, z: 3.0, type: 'led', shadowPriority: 0 },
  { id: 'light.t10', x: -1.5, z: 3.0, type: 'led', shadowPriority: 0 },
  { id: 'light.t11', x: 1.5, z: 3.0, type: 'led', shadowPriority: 7 },
  { id: 'light.t12', x: 5.1, z: 3.0, type: 'led', shadowPriority: 0 },
];

/** Low preset: one spot per troffer pair at the pair midpoint, intensity 20 (§7.4). */
export const LOW_PRESET_TROFFER_PAIRS: readonly (readonly [string, string])[] = [
  ['light.t01', 'light.t02'],
  ['light.t03', 'light.t04'],
  ['light.t05', 'light.t06'],
  ['light.t07', 'light.t08'],
  ['light.t09', 'light.t10'],
  ['light.t11', 'light.t12'],
];

export interface CeilingFixture {
  readonly id: string;
  readonly kind: 'supply-diffuser' | 'return-grille' | 'smoke-detector';
  readonly x: number;
  readonly z: number;
  /** Square size (m) or diameter for detectors. */
  readonly size: number;
}

export const CEILING_FIXTURES: readonly CeilingFixture[] = [
  { id: 'ceiling.diffuser-1', kind: 'supply-diffuser', x: -3.3, z: 1.5, size: 0.6 },
  { id: 'ceiling.diffuser-2', kind: 'supply-diffuser', x: 3.3, z: -1.5, size: 0.6 },
  { id: 'ceiling.return-1', kind: 'return-grille', x: -3.3, z: -3.3, size: 0.6 },
  { id: 'ceiling.return-2', kind: 'return-grille', x: 3.3, z: 2.7, size: 0.6 },
  // Smoke detectors blink a red pilot LED every 8 s.
  { id: 'ceiling.smoke-1', kind: 'smoke-detector', x: 0.0, z: 0.0, size: 0.13 },
  { id: 'ceiling.smoke-2', kind: 'smoke-detector', x: -4.8, z: 3.0, size: 0.13 },
];

/** `ceiling.sprinklers`: chrome pendant heads, instanced on a 3.0 m grid. */
export const SPRINKLERS = {
  id: 'ceiling.sprinklers',
  xs: [-6, -3, 0, 3, 6] as readonly number[],
  zs: [-3.9, -0.9, 2.1] as readonly number[],
} as const;

export function sprinklerPositions(): Vec3[] {
  const out: Vec3[] = [];
  for (const x of SPRINKLERS.xs) for (const z of SPRINKLERS.zs) out.push([x, ROOM.interior.ceilingY, z]);
  return out;
}

/* ───────────────────────────── §7.1 Light rig ───────────────────────────── */

export const LIGHTS = {
  troffer: {
    /** SpotLight straight down from (x, 2.98, z) to (x, 0, z). */
    y: 2.98,
    angle: 1.1,
    penumbra: 1.0,
    decay: 2,
    distance: 0,
    led: { color: '#f4f6ff', intensity: 10, diffuserEmissive: 2.0 },
    fluorescent: { color: '#fff3e0', intensity: 8.5, diffuserEmissive: 1.8 },
    lowPresetIntensity: 20,
    shadow: { near: 0.5, far: 3.6, bias: -0.0005, normalBias: 0.02 },
  },
  /** `light.t01` flicker: every 6–14 s (seeded) a 150 ms sequence at 30 ms steps. */
  t01Flicker: { minGapS: 6, maxGapS: 14, stepMs: 30, multipliers: [0.55, 0.92, 0.6, 1.0] as readonly number[] },
  hemisphere: { sky: '#ffffff', ground: '#8a8780', intensity: 0.5, lowIntensity: 0.9 },
  benchTask: { pos: [2.7, 1.1, -4.75] as Vec3, color: '#ffd9a8', intensity: 0.6, distance: 1.6, decay: 2, minPreset: 'medium' },
  magnifierLamp: { propId: 'jared.magnifier-lamp', color: '#fff1e0', intensity: 0.4, distance: 0.8, minPreset: 'high' },
  corridor: { pos: [5.9, 2.68, 6.15] as Vec3, intensity: 8, angle: 1.2, penumbra: 1 },
  flashlight: { angle: 0.35, penumbra: 0.5, intensity: 6, distance: 4, decay: 2, castShadow: false },
  /** Ultra: two RectAreaLights per rack front; Low–High: additive floor decal at each front post. */
  rackSpill: { color: '#2bff6a', rectSize: [0.02, 1.8] as Vec2, rectIntensity: 2.0, decalSize: 0.6, decalOpacity: 0.15 },
  environmentIntensity: 0.35,
} as const;

/* ───────────────────────────── §1.6 Overhead trays ───────────────────────────── */

export interface TrayDef {
  readonly id: string;
  /** Straight runs as [x, z] polylines at the tray bottom height. */
  readonly runs: readonly (readonly Vec2[])[];
  /** Section width × depth in mm. */
  readonly sectionMm: Vec2;
  readonly desc: string;
}

export const TRAY_SPEC = {
  bottomY: 2.4,
  material: 'zincTray',
  /** Ø 10 mm threaded rods every 1.20 m with trapeze bars (instanced). */
  rodDiameterM: 0.01,
  rodSpacingM: 1.2,
} as const;

export const TRAYS: readonly TrayDef[] = [
  { id: 'tray.ct1', runs: [[[-4.4, -4.6], [4.4, -4.6]]], sectionMm: [300, 60], desc: 'Along the north wall' },
  { id: 'tray.ct2', runs: [[[-2.0, -4.6], [-2.0, -2.1]]], sectionMm: [300, 60], desc: 'Spur to the rack row' },
  { id: 'tray.ct3', runs: [[[-2.9, -2.1], [-1.1, -2.1]]], sectionMm: [300, 60], desc: 'Over the rack row' },
  {
    id: 'tray.ct4',
    runs: [[[2.4, -4.6], [2.4, -1.95], [0.85, -1.95]]],
    sectionMm: [300, 60],
    desc: 'Spur to the tethered rack, then west to the ADB shelf',
  },
  {
    id: 'tray.ct5',
    runs: [
      [[0.8, -4.6], [0.8, 4.55]],
      [[1.8, 4.55], [-6.5, 4.55]],
    ],
    sectionMm: [200, 60],
    desc: 'Workstation run: north–south at x 0.80, then along the desks at z 4.55',
  },
];

export interface CableDropDef {
  readonly id: string;
  readonly target: string;
  /** Floor-plan point of the drop (x, z). */
  readonly at: Vec2;
  /** From the target's top (y) up to the tray bottom. */
  readonly fromY: number;
  readonly toY: number;
}

/** Black braided bundles Ø 40 mm (`braidedSleeve`). */
export const CABLE_DROPS: readonly CableDropDef[] = [
  { id: 'tray.drop.rack-a', target: 'rack.a', at: [-2.6, -2.1], fromY: 2.0, toY: 2.4 },
  { id: 'tray.drop.callus', target: 'shelf.callus', at: [-2.0, -2.1], fromY: 1.95, toY: 2.4 },
  { id: 'tray.drop.rack-b', target: 'rack.b', at: [-1.4, -2.1], fromY: 2.0, toY: 2.4 },
  { id: 'tray.drop.rack-t', target: 'rack.t', at: [2.4, -2.05], fromY: 1.8, toY: 2.4 },
  // Rear-right post of shelf.adb (shelf-local (+0.48, −0.28)).
  { id: 'tray.drop.adb', target: 'shelf.adb', at: [1.33, -2.18], fromY: 1.05, toY: 2.4 },
];

export const CABLE_DROP_DIAMETER_M = 0.04;
/** Visible tray contents, merged into one mesh per tray. */
export const TRAY_CONTENTS = ['cat6Yellow', 'cableBlack', 'wireRed+wireBlack', 'wireYellow+wireBlack', 'wireOrange+wireBlack'] as const;

/* ───────────────────────────── §1.8 Navigation ───────────────────────────── */

export const NAV = {
  capsuleRadius: 0.25,
  eyeStanding: 1.65,
  eyeCrouched: 1.05,
  stepHeight: 0.15,
  /** Nothing walkable is lower than this except (non-walkable) under-bench spaces. */
  minHeadroom: 1.3,
  /** Every floor prop collider = footprint AABB + this padding. */
  colliderPadding: 0.02,
  /** Chairs collide as a square of this size (they move with the Sit pose only). */
  chairColliderSize: 0.5,
  /** Open bay side doors add a dynamic collider of this size per leaf (W along X when open). */
  bayDoorLeafCollider: [0.9, 0.02, 0.44] as Vec3,
  /** Anti-fatigue mats are 6 mm decals (floor stays flat everywhere). */
  matThickness: 0.006,
} as const;

/** True when (x, z) lies inside the lab interior or the corridor. */
export function insideWalkableShell(x: number, z: number): boolean {
  const r = ROOM.interior;
  const inLab = x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  const inCorridor = x >= CORRIDOR.minX && x <= CORRIDOR.maxX && z >= CORRIDOR.minZ && z <= CORRIDOR.maxZ;
  return inLab || inCorridor;
}

export function insideLab(x: number, z: number): boolean {
  const r = ROOM.interior;
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}
