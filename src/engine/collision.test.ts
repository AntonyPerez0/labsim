import { describe, expect, it } from 'vitest';
import {
  ColliderSet,
  ceilingHeight,
  fitsHeight,
  groundHeight,
  isRayOccluded,
  moveHorizontal,
  pushOutOfBox,
  rayAabb,
  toAabb,
  type CylinderBody,
} from './collision';

const R = 0.28;
const STEP = 0.12;

function body(x: number, z: number, y = 0, height = 1.75): CylinderBody {
  return { x, y, z, radius: R, height };
}

/** A wall occupying x ∈ [1, 1.2], all z, 0..3 m tall. */
const wall = toAabb({ min: [1, 0, -10], max: [1.2, 3, 10] });

describe('cylinder vs AABB', () => {
  it('does not move a body that is clear of the box', () => {
    const b = body(0, 0);
    expect(pushOutOfBox(b, wall)).toBe(false);
    expect(b.x).toBe(0);
  });

  it('pushes a penetrating circle out along the face normal', () => {
    const b = body(0.9, 0);
    expect(pushOutOfBox(b, wall)).toBe(true);
    expect(b.x).toBeCloseTo(1 - R, 6);
    expect(b.z).toBe(0);
  });

  it('pushes a centre that is inside the box out through the nearest face', () => {
    const b = body(1.15, 0);
    pushOutOfBox(b, wall);
    expect(b.x).toBeCloseTo(1.2 + R, 6);
  });

  it('treats box corners as rounded', () => {
    const box = toAabb({ min: [0, 0, 0], max: [1, 1, 1] });
    const b = body(-0.15, -0.15);
    pushOutOfBox(b, box);
    const d = Math.hypot(b.x - 0, b.z - 0);
    expect(d).toBeCloseTo(R, 5);
    expect(b.x).toBeCloseTo(b.z, 6); // pushed diagonally
  });
});

describe('moveHorizontal', () => {
  it('stops at a wall and slides along it', () => {
    const b = body(0, 0);
    // Move diagonally into the wall: +x is blocked, +z continues.
    const hit = moveHorizontal(b, 2, 1, [wall], STEP);
    expect(hit).toBe(true);
    expect(b.x).toBeCloseTo(1 - R, 4);
    expect(b.z).toBeCloseTo(1, 4);
  });

  it('does not tunnel through a thin wall with a large step', () => {
    const thin = toAabb({ min: [1, 0, -5], max: [1.01, 3, 5] });
    const b = body(0, 0);
    moveHorizontal(b, 5, 0, [thin], STEP);
    expect(b.x).toBeLessThan(1);
  });

  it('ignores boxes entirely below the step height (walk onto them)', () => {
    const plate = toAabb({ min: [0.5, 0, -1], max: [2, 0.1, 1] });
    const b = body(0, 0);
    moveHorizontal(b, 1, 0, [plate], STEP);
    expect(b.x).toBeCloseTo(1, 6);
    expect(groundHeight(b, [plate], STEP)).toBeCloseTo(0.1, 6);
  });

  it('blocks boxes taller than the step height', () => {
    const crate = toAabb({ min: [0.5, 0, -1], max: [2, 0.3, 1] });
    const b = body(0, 0);
    moveHorizontal(b, 1, 0, [crate], STEP);
    expect(b.x).toBeCloseTo(0.5 - R, 4);
    expect(groundHeight(b, [crate], STEP)).toBe(0);
  });

  it('ignores boxes above the head (e.g. a shelf overhang)', () => {
    const overhang = toAabb({ min: [0.5, 2.0, -1], max: [2, 2.1, 1] });
    const b = body(0, 0);
    moveHorizontal(b, 1, 0, [overhang], STEP);
    expect(b.x).toBeCloseTo(1, 6);
  });

  it('resolves a corner between two walls', () => {
    const wallZ = toAabb({ min: [-10, 0, 1], max: [10, 3, 1.2] });
    const b = body(0, 0);
    moveHorizontal(b, 3, 3, [wall, wallZ], STEP);
    expect(b.x).toBeCloseTo(1 - R, 3);
    expect(b.z).toBeCloseTo(1 - R, 3);
  });
});

describe('ground / ceiling', () => {
  it('ground is the floor when nothing is under the body', () => {
    expect(groundHeight(body(0, 0), [wall], STEP)).toBe(0);
  });

  it('ground is the highest reachable top under the body', () => {
    const low = toAabb({ min: [-1, 0, -1], max: [1, 0.05, 1] });
    const step = toAabb({ min: [-1, 0, -1], max: [1, 0.1, 1] });
    expect(groundHeight(body(0, 0), [low, step], STEP)).toBeCloseTo(0.1, 6);
  });

  it('ceiling detects a low obstacle above and blocks standing up', () => {
    const desk = toAabb({ min: [-1, 1.2, -1], max: [1, 1.25, 1] });
    const b = body(0, 0, 0, 1.1);
    expect(ceilingHeight(b, [desk], STEP)).toBeCloseTo(1.2, 6);
    expect(fitsHeight(b, 1.1, [desk], STEP)).toBe(true);
    expect(fitsHeight(b, 1.75, [desk], STEP)).toBe(false);
  });
});

describe('ColliderSet', () => {
  it('adds and removes boxes via the returned handle', () => {
    const set = new ColliderSet();
    const offA = set.add({ min: [0, 0, 0], max: [1, 1, 1] });
    set.add({ min: [2, 0, 0], max: [3, 1, 1] });
    expect(set.boxes.length).toBe(2);
    offA();
    offA(); // idempotent
    expect(set.boxes.length).toBe(1);
    expect(set.boxes[0]!.minX).toBe(2);
  });

  it('normalises inverted min/max and rejects non-finite boxes', () => {
    const set = new ColliderSet();
    set.add({ min: [1, 1, 1], max: [0, 0, 0] });
    set.add({ min: [Number.NaN, 0, 0], max: [1, 1, 1] });
    expect(set.boxes.length).toBe(1);
    expect(set.boxes[0]!.minX).toBe(0);
    expect(set.boxes[0]!.maxX).toBe(1);
  });
});

describe('rays', () => {
  const box = toAabb({ min: [2, 0, -1], max: [3, 2, 1] });

  it('rayAabb returns the entry distance', () => {
    expect(rayAabb(0, 1, 0, 1, 0, 0, box, 10)).toBeCloseTo(2, 6);
    expect(rayAabb(0, 1, 0, -1, 0, 0, box, 10)).toBe(-1);
    expect(rayAabb(0, 1, 0, 1, 0, 0, box, 1.5)).toBe(-1);
  });

  it('a wall between the eye and the target occludes it', () => {
    const thinWall = toAabb({ min: [1, 0, -5], max: [1.1, 3, 5] });
    expect(isRayOccluded(0, 1.6, 0, 1, 0, 0, 2.0, [thinWall])).toBe(true);
  });

  it('a target inside a collider (device in a rack) is not occluded by that collider', () => {
    const rack = toAabb({ min: [1, 0, -0.5], max: [1.6, 2, 0.5] });
    expect(isRayOccluded(0, 1.6, 0, 1, 0, 0, 1.2, [rack])).toBe(false);
  });

  it('a collider behind the target does not occlude', () => {
    expect(isRayOccluded(0, 1, 0, 1, 0, 0, 1.5, [box])).toBe(false);
  });
});
