/**
 * Shared types and small pure helpers of the world placement contract (`@/world/layout`).
 *
 * Conventions (World §0.1):
 *  - World units are metres, Y up, origin = centre of the lab floor, +X = east, +Z = south
 *    (north wall at z −5.00, entrance wall at z +5.00).
 *  - Prop `rotY` is in DEGREES about +Y: 0 = the prop's front (local +Z face) faces south (+Z),
 *    90 faces east, 180 north, −90 west. three.js: `object.rotation.y = degToRad(rotY)`.
 *  - Player / NPC yaw is in DEGREES: 0 = looking north (−Z), positive turns left (CCW seen from
 *    above), 90 = looking west. Engine: `teleportPlayer(pos, degToRad(yawDeg))`.
 *  - Positions are the centre of the footprint at its BASE (floor props y = 0; props standing on a
 *    surface y = that surface height; wall-mounted props y = centre height).
 *  - Sizes are `W × D × H` = [local X, local Z, Y] in metres.
 */
import type { Vec3 } from '@/engine/types';

export type { Vec3 };
export type Vec2 = [number, number];

/** Which world builder owns the geometry of a prop. */
export type Builder = 'lab' | 'rigs';

export type Zone =
  | 'room'
  | 'corridor'
  | 'entrance'
  | 'desks'
  | 'rack-row'
  | 'power-wall'
  | 'server'
  | 'fab'
  | 'jared'
  | 'west-wall'
  | 'east-wall'
  | 'south-wall'
  | 'ceiling'
  | 'overhead';

export type Mount = 'floor' | 'surface' | 'wall' | 'ceiling';
export type WallSide = 'north' | 'south' | 'east' | 'west';

export type PropKind =
  | 'door'
  | 'reader'
  | 'button'
  | 'sign'
  | 'extinguisher'
  | 'switch'
  | 'first-aid'
  | 'clock'
  | 'desk'
  | 'monitor'
  | 'computer'
  | 'keyboard'
  | 'mouse'
  | 'phone'
  | 'mug'
  | 'sticky-notes'
  | 'card-reader'
  | 'chair'
  | 'tool'
  | 'device'
  | 'bin'
  | 'poster'
  | 'rack'
  | 'shelf'
  | 'cart'
  | 'anchor'
  | 'board'
  | 'bench'
  | 'psu'
  | 'parts'
  | 'fan'
  | 'server'
  | 'network-switch'
  | 'ups'
  | 'printer-3d'
  | 'laptop'
  | 'filament'
  | 'drybox'
  | 'card'
  | 'instrument'
  | 'lamp'
  | 'pcb'
  | 'light-bar'
  | 'tool-chest'
  | 'cabinet'
  | 'whiteboard'
  | 'cork-board'
  | 'extrusion'
  | 'table'
  | 'library-shelf'
  | 'tray'
  | 'counter'
  | 'appliance'
  | 'frame'
  | 'plaque'
  | 'column'
  | 'mat';

/** Extra numeric / text specs copied from the doc (sub-part dimensions, label strings …). */
export type PropSpec = Readonly<Record<string, number | string | boolean | readonly number[] | readonly string[]>>;

/** One row of World §1.4 (and the other placement tables). */
export interface PropPlacement {
  /** Stable world prop id (World §0.1): `<group>.<instance>[.<part>]`. */
  readonly id: string;
  readonly kind: PropKind;
  readonly zone: Zone;
  /** Base centre (see header). Metres. */
  readonly pos: Vec3;
  /** Degrees about +Y (0 = front faces south). */
  readonly rotY: number;
  /** W × D × H in metres (local X, local Z, Y), when the doc gives one. */
  readonly size?: Vec3;
  /** Cylindrical props: diameter × height (metres). */
  readonly cyl?: { readonly d: number; readonly h: number };
  readonly mount: Mount;
  /** For wall-mounted props: which wall they hang on. */
  readonly wall?: WallSide;
  readonly builder: Builder;
  /**
   * Static collider rule (World §1.8): `true` = footprint AABB + 0.02 m (rotated footprints use
   * their world AABB); `'chair'` = a 0.50 × 0.50 box; absent/false = no static collider.
   */
  readonly collider?: boolean | 'chair';
  /** One-line description (what the doc says it looks like). */
  readonly desc: string;
  readonly spec?: PropSpec;
  /** True when LabSim chose this value because the doc is silent or inconsistent (see `note`). */
  readonly adjusted?: boolean;
  readonly note?: string;
}

/** An entry that binds a world object to sim state: ordered candidate sim ids (first existing wins). */
export interface SimRef {
  /** Which `LabState` collection the object lives in. */
  readonly collection:
    | 'rigs'
    | 'devices'
    | 'hosts'
    | 'collis'
    | 'power.outlets'
    | 'power.strips'
    | 'power.psus'
    | 'power.regulators'
    | 'power.rails'
    | 'power.terminals'
    | 'power.fuses'
    | 'power.loads';
  /** Candidate ids in priority order (sim doc id first, World-doc spelling second). */
  readonly ids: readonly string[];
}

/* ───────────────────────────── helpers ───────────────────────────── */

export const DEG = Math.PI / 180;

export function degToRad(deg: number): number {
  return deg * DEG;
}

/** Millimetres → metres. */
export function mm(v: number): number {
  return v / 1000;
}

/** Rotate a local (x, z) offset by a prop rotY (degrees) — the same rotation three.js applies. */
export function rotateXZ(x: number, z: number, rotYDeg: number): Vec2 {
  const a = degToRad(rotYDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  // three.js rotation about +Y: x' = x·cos + z·sin, z' = −x·sin + z·cos
  return [x * c + z * s, -x * s + z * c];
}

/** Local point (metres, relative to a prop's base centre) → world, given the prop pos/rotY. */
export function localToWorld(pos: Vec3, rotYDeg: number, local: Vec3): Vec3 {
  const [dx, dz] = rotateXZ(local[0], local[2], rotYDeg);
  return [round6(pos[0] + dx), round6(pos[1] + local[1]), round6(pos[2] + dz)];
}

/** Unit normal of a prop's front face in world space. */
export function frontNormal(rotYDeg: number): Vec3 {
  const [x, z] = rotateXZ(0, 1, rotYDeg);
  return [round6(x), 0, round6(z)];
}

/** Axis-aligned world footprint (minX, minZ, maxX, maxZ) of a W × D box rotated by rotY. */
export function footprintAabb(pos: Vec3, w: number, d: number, rotYDeg: number): [number, number, number, number] {
  const a = degToRad(rotYDeg);
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hx = (w * c + d * s) / 2;
  const hz = (w * s + d * c) / 2;
  return [round6(pos[0] - hx), round6(pos[2] - hz), round6(pos[0] + hx), round6(pos[2] + hz)];
}

export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Kebab slug for ids built from label text ("M2.5 BOLTS" → "m2-5-bolts"). */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
