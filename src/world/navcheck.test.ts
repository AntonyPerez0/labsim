import { describe, expect, it } from 'vitest';
import { LOCATIONS, STATIC_COLLIDERS } from './layout';
import { pushInto, toAabbs, walkAll } from './navcheck';

const boxes = toAabbs(STATIC_COLLIDERS);

describe('navigation (World §1.8)', () => {
  it('every location anchor is reachable on foot from every other one', () => {
    const pts = LOCATIONS.map((l) => ({ id: l.id, x: l.center[0], z: l.center[2] }));
    const res = walkAll(boxes, pts);
    const failed = res.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed.slice(0, 5))).toEqual([]);
    expect(res.length).toBe((pts.length * (pts.length - 1)) / 2);
  });

  it('the player cannot walk through racks, shelves, benches or desks', () => {
    const solid = STATIC_COLLIDERS.filter((c) => c.kind === 'prop' && /^(rack\.|shelf\.|desk\.|bench\.|table\.|cabinet\.|chest\.)/.test(c.id));
    expect(solid.length).toBeGreaterThan(10);
    for (const c of solid) {
      const [box] = toAabbs([c]);
      const cx = (box!.minX + box!.maxX) / 2;
      const cz = (box!.minZ + box!.maxZ) / 2;
      // approach from whichever side is in the room (towards the room centre)
      const fromZ = cz < 0 ? box!.maxZ + 0.9 : box!.minZ - 0.9;
      const depth = pushInto(boxes, { x: cx, z: fromZ }, { x: cx, z: cz }, box!);
      expect(depth, c.id).toBeLessThanOrEqual(0);
    }
  });
});
