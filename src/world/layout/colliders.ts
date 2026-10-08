/**
 * Static colliders and navigation (World §1.8). `buildLab` registers every `STATIC_COLLIDERS` entry
 * once (walls, corridor, column, every floor prop incl. racks/shelves/benches, chairs as 0.50 m
 * squares). `buildRigs` registers only DYNAMIC colliders (open bay side doors); `buildLab` owns the
 * `door.lab` leaf collider.
 */
import type { ColliderBox } from '@/engine/types';
import { CORRIDOR, DOOR, NAV, ROOM } from './room';
import { PROPS } from './props';
import { footprintAabb, round6, type PropPlacement, type Vec3 } from './types';

export interface ColliderDef extends ColliderBox {
  /** Source id (prop id or `wall.<side>`). */
  readonly id: string;
  readonly kind: 'wall' | 'prop' | 'chair';
}

const H = ROOM.interior.ceilingY;
const T = ROOM.wallThickness;

function box(id: string, kind: ColliderDef['kind'], min: Vec3, max: Vec3): ColliderDef {
  return { id, kind, min: min.map(round6) as Vec3, max: max.map(round6) as Vec3 };
}

/** Room + corridor walls (the south wall leaves the door opening free). */
export function wallColliders(): ColliderDef[] {
  const r = ROOM.interior;
  const c = CORRIDOR;
  return [
    box('wall.north', 'wall', [r.minX - T, 0, r.minZ - T], [r.maxX + T, H, r.minZ]),
    box('wall.west', 'wall', [r.minX - T, 0, r.minZ - T], [r.minX, H, r.maxZ + T]),
    box('wall.east', 'wall', [r.maxX, 0, r.minZ - T], [r.maxX + T, H, r.maxZ]),
    // South wall split around the door opening; the east part continues as the corridor's north wall.
    box('wall.south-west', 'wall', [r.minX - T, 0, r.maxZ], [DOOR.opening.minX, H, r.maxZ + T]),
    box('wall.south-east', 'wall', [DOOR.opening.maxX, 0, r.maxZ], [c.maxX + T, H, r.maxZ + T]),
    box('corridor.west', 'wall', [c.minX - T, 0, c.minZ], [c.minX, c.ceilingY, c.maxZ]),
    box('corridor.east', 'wall', [c.maxX, 0, c.minZ], [c.maxX + T, c.ceilingY, c.maxZ]),
    box('corridor.south', 'wall', [c.minX - T, 0, c.maxZ], [c.maxX + T, c.ceilingY, c.maxZ + T]),
  ];
}

function propHeight(p: PropPlacement): number {
  if (p.size) return p.size[2];
  if (p.cyl) return p.cyl.h;
  return 1.0;
}

/** Static collider of one floor prop (footprint AABB + 0.02 m; chairs 0.50 × 0.50). */
export function propCollider(p: PropPlacement): ColliderDef | null {
  if (!p.collider || p.mount !== 'floor') return null;
  const pad = NAV.colliderPadding;
  if (p.collider === 'chair') {
    const h = NAV.chairColliderSize / 2;
    return box(p.id, 'chair', [p.pos[0] - h, 0, p.pos[2] - h], [p.pos[0] + h, propHeight(p), p.pos[2] + h]);
  }
  let w: number;
  let d: number;
  if (p.size) {
    w = p.size[0];
    d = p.size[1];
  } else if (p.cyl) {
    w = d = p.cyl.d;
  } else {
    return null;
  }
  const [minX, minZ, maxX, maxZ] = footprintAabb(p.pos, w, d, p.rotY);
  return box(p.id, 'prop', [minX - pad, 0, minZ - pad], [maxX + pad, propHeight(p), maxZ + pad]);
}

export function propColliders(): ColliderDef[] {
  return PROPS.map(propCollider).filter((c): c is ColliderDef => c !== null);
}

/** Everything `buildLab` registers once. */
export const STATIC_COLLIDERS: readonly ColliderDef[] = [...wallColliders(), ...propColliders()];

/** True when the floor point (x, z) is inside any static collider (optionally ignoring some ids). */
export function pointBlocked(x: number, z: number, ignore: ReadonlySet<string> = new Set()): string | null {
  for (const c of STATIC_COLLIDERS) {
    if (ignore.has(c.id)) continue;
    if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]) return c.id;
  }
  return null;
}
