/**
 * Player collision: a vertical cylinder (feet position + radius + height) against world-space
 * axis-aligned boxes. Pure math, no three.js / DOM, so it is unit-tested in node.
 *
 *  - Horizontal: the cylinder's circle is pushed out of every box it overlaps vertically, along the
 *    box's closest-point normal. Because only the normal component is removed, motion into a wall
 *    keeps its tangential component — that is wall sliding. Corners behave like rounded corners.
 *  - Step-up: boxes whose top is within `stepHeight` of the feet are not obstacles; the ground probe
 *    then lifts the feet onto them.
 *  - Ground: the highest box top under the (slightly shrunk) circle that is reachable by stepping,
 *    or the floor at y = 0.
 */
import type { ColliderBox } from './types';

/** Internal flat representation (faster than tuple access in hot loops). */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface CylinderBody {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export const FLOOR_Y = 0;
const EPS = 1e-6;

export function toAabb(box: ColliderBox): Aabb {
  const [ax, ay, az] = box.min;
  const [bx, by, bz] = box.max;
  return {
    minX: Math.min(ax, bx),
    minY: Math.min(ay, by),
    minZ: Math.min(az, bz),
    maxX: Math.max(ax, bx),
    maxY: Math.max(ay, by),
    maxZ: Math.max(az, bz),
  };
}

/** A mutable set of colliders with O(1) removal handles. */
export class ColliderSet {
  readonly boxes: Aabb[] = [];

  add(box: ColliderBox | Aabb): () => void {
    const aabb = 'min' in box ? toAabb(box) : { ...box };
    if (![aabb.minX, aabb.minY, aabb.minZ, aabb.maxX, aabb.maxY, aabb.maxZ].every(Number.isFinite)) {
      return () => {};
    }
    this.boxes.push(aabb);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const i = this.boxes.indexOf(aabb);
      if (i >= 0) {
        // swap-remove: order does not matter
        const last = this.boxes.pop()!;
        if (i < this.boxes.length) this.boxes[i] = last;
      }
    };
  }

  clear(): void {
    this.boxes.length = 0;
  }
}

/** True if the box overlaps the body's vertical span above the step height. */
function blocksHorizontally(body: CylinderBody, b: Aabb, stepHeight: number): boolean {
  return b.maxY > body.y + stepHeight + 1e-4 && b.minY < body.y + body.height - 1e-4;
}

/**
 * Push the body's circle out of one box (XZ). Returns true if it was penetrating.
 */
export function pushOutOfBox(body: CylinderBody, b: Aabb): boolean {
  const r = body.radius;
  const cx = body.x < b.minX ? b.minX : body.x > b.maxX ? b.maxX : body.x;
  const cz = body.z < b.minZ ? b.minZ : body.z > b.maxZ ? b.maxZ : body.z;
  const dx = body.x - cx;
  const dz = body.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r - EPS) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    body.x += dx * k;
    body.z += dz * k;
    return true;
  }
  // Centre is inside the rectangle: leave through the nearest face.
  const toMinX = body.x - b.minX;
  const toMaxX = b.maxX - body.x;
  const toMinZ = body.z - b.minZ;
  const toMaxZ = b.maxZ - body.z;
  const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
  if (m === toMinX) body.x = b.minX - r;
  else if (m === toMaxX) body.x = b.maxX + r;
  else if (m === toMinZ) body.z = b.minZ - r;
  else body.z = b.maxZ + r;
  return true;
}

/** Resolve all horizontal penetrations (a few relaxation iterations). Returns true if anything was hit. */
export function resolveHorizontal(body: CylinderBody, boxes: readonly Aabb[], stepHeight: number, iterations = 4): boolean {
  let hit = false;
  for (let it = 0; it < iterations; it++) {
    let pushed = false;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      if (!blocksHorizontally(body, b, stepHeight)) continue;
      if (pushOutOfBox(body, b)) pushed = true;
    }
    if (!pushed) break;
    hit = true;
  }
  return hit;
}

/**
 * Move the body horizontally by (dx, dz) with sub-stepping (no tunnelling through thin walls) and
 * wall sliding. Returns true if the body touched a wall.
 */
export function moveHorizontal(body: CylinderBody, dx: number, dz: number, boxes: readonly Aabb[], stepHeight: number): boolean {
  const dist = Math.sqrt(dx * dx + dz * dz);
  const maxStep = Math.max(0.02, body.radius * 0.5);
  const steps = Math.max(1, Math.min(64, Math.ceil(dist / maxStep)));
  const sx = dx / steps;
  const sz = dz / steps;
  let hit = false;
  for (let s = 0; s < steps; s++) {
    body.x += sx;
    body.z += sz;
    if (resolveHorizontal(body, boxes, stepHeight)) hit = true;
  }
  return hit;
}

/** Squared XZ distance from a point to a box's rectangle (0 when inside). */
function distSqXZ(x: number, z: number, b: Aabb): number {
  const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
  const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz;
}

/**
 * Height of the ground under the body: the highest box top that the feet can reach by stepping up
 * (`maxY <= feetY + stepHeight`) under a support circle of `radius * supportScale`, or the floor.
 */
export function groundHeight(body: CylinderBody, boxes: readonly Aabb[], stepHeight: number, supportScale = 0.6): number {
  let g = FLOOR_Y;
  const sr = body.radius * supportScale;
  const sr2 = sr * sr;
  const reach = body.y + stepHeight + 1e-4;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (b.maxY <= g || b.maxY > reach) continue;
    if (distSqXZ(body.x, body.z, b) < sr2) g = b.maxY;
  }
  return g;
}

/**
 * Lowest box bottom above the body's step band that overlaps the circle — i.e. the ceiling over
 * the head. Returns +Infinity when nothing is above.
 */
export function ceilingHeight(body: CylinderBody, boxes: readonly Aabb[], stepHeight: number): number {
  let c = Number.POSITIVE_INFINITY;
  const r2 = body.radius * body.radius - EPS;
  const above = body.y + stepHeight + 1e-4;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (b.maxY <= above) continue; // walkable / below us
    if (b.minY < above) continue; // a wall around us, handled horizontally
    if (b.minY < c && distSqXZ(body.x, body.z, b) < r2) c = b.minY;
  }
  return c;
}

/** True if a body of `height` fits at its current feet position (used to un-crouch). */
export function fitsHeight(body: CylinderBody, height: number, boxes: readonly Aabb[], stepHeight: number): boolean {
  return ceilingHeight(body, boxes, stepHeight) >= body.y + height;
}

/**
 * Ray vs AABB slab test. Returns the entry distance t (≥ 0) or -1 when missed / beyond maxT.
 * When the origin is inside the box, returns 0.
 */
export function rayAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  b: Aabb, maxT: number,
): number {
  let tmin = 0;
  let tmax = maxT;
  // X
  if (Math.abs(dx) < 1e-12) {
    if (ox < b.minX || ox > b.maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv;
    let t2 = (b.maxX - ox) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Y
  if (Math.abs(dy) < 1e-12) {
    if (oy < b.minY || oy > b.maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (b.minY - oy) * inv;
    let t2 = (b.maxY - oy) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Z
  if (Math.abs(dz) < 1e-12) {
    if (oz < b.minZ || oz > b.maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv;
    let t2 = (b.maxZ - oz) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

function containsPoint(b: Aabb, x: number, y: number, z: number, pad: number): boolean {
  return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
}

/**
 * Is an interactable hit at distance `hitDist` along the (normalised) ray occluded by a collider?
 * A box occludes when the ray enters it before the hit point, the ray origin is outside it, and the
 * hit point itself is not inside the box (devices sitting inside a rack's collider stay reachable,
 * but nothing can be used through a wall).
 */
export function isRayOccluded(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  hitDist: number,
  boxes: readonly Aabb[],
  pad = 0.04,
): boolean {
  const hx = ox + dx * hitDist;
  const hy = oy + dy * hitDist;
  const hz = oz + dz * hitDist;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (containsPoint(b, ox, oy, oz, 0)) continue;
    const t = rayAabb(ox, oy, oz, dx, dy, dz, b, hitDist);
    if (t < 0 || t >= hitDist - 1e-3) continue;
    if (containsPoint(b, hx, hy, hz, pad)) continue;
    return true;
  }
  return false;
}
