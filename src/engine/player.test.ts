import { describe, expect, it } from 'vitest';
import { toAabb } from './collision';
import { NO_INTENT, PlayerController, type MoveIntent } from './player';

const opts = { reducedMotion: false };

function run(p: PlayerController, intent: Partial<MoveIntent>, seconds: number, boxes = [] as ReturnType<typeof toAabb>[], o = opts) {
  const dt = 1 / 60;
  const full = { ...NO_INTENT, ...intent };
  for (let t = 0; t < seconds; t += dt) {
    p.update(dt, full, boxes, o);
    // edge-triggered inputs only for the first frame
    full.jump = false;
    full.toggleCrouch = false;
  }
}

describe('PlayerController', () => {
  it('accelerates smoothly to walk speed and fast speed', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    run(p, { forward: 1 }, 0.05);
    expect(p.speed).toBeGreaterThan(0);
    expect(p.speed).toBeLessThan(1.6);
    run(p, { forward: 1 }, 1.5);
    expect(p.speed).toBeCloseTo(1.6, 2);
    run(p, { forward: 1, fast: true }, 1.5);
    expect(p.speed).toBeCloseTo(2.6, 2);
  });

  it('moves toward −Z at yaw 0 and toward −X at yaw π/2', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    run(p, { forward: 1 }, 1);
    expect(p.z).toBeLessThan(-0.5);
    expect(Math.abs(p.x)).toBeLessThan(1e-6);
    p.teleport(0, 0, 0, Math.PI / 2);
    run(p, { forward: 1 }, 1);
    expect(p.x).toBeLessThan(-0.5);
  });

  it('decelerates with friction when input stops', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    run(p, { forward: 1 }, 1);
    run(p, {}, 1);
    expect(p.speed).toBe(0);
  });

  it('falls under gravity onto the floor', () => {
    const p = new PlayerController();
    p.teleport(0, 1, 0, 0);
    p.grounded = false;
    run(p, {}, 1.5);
    expect(p.y).toBe(0);
    expect(p.grounded).toBe(true);
  });

  it('hops and lands', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    let maxY = 0;
    const dt = 1 / 60;
    p.update(dt, { ...NO_INTENT, jump: true }, [], opts);
    for (let i = 0; i < 90; i++) {
      p.update(dt, NO_INTENT, [], opts);
      maxY = Math.max(maxY, p.y);
    }
    expect(maxY).toBeGreaterThan(0.15);
    expect(maxY).toBeLessThan(0.35);
    expect(p.y).toBe(0);
  });

  it('steps up onto a low plate but not onto a crate', () => {
    const plate = toAabb({ min: [-1, 0, -2], max: [1, 0.1, -1] });
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    run(p, { forward: 1 }, 1.2, [plate]);
    expect(p.y).toBeCloseTo(0.1, 5);

    const crate = toAabb({ min: [-1, 0, -2], max: [1, 0.4, -1] });
    const q = new PlayerController();
    q.teleport(0, 0, 0, 0);
    run(q, { forward: 1 }, 1.2, [crate]);
    expect(q.y).toBe(0);
    expect(q.z).toBeCloseTo(-1 + 0.28, 3);
  });

  it('crouches smoothly and cannot stand up under a low obstacle', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    run(p, { toggleCrouch: true }, 1);
    expect(p.crouched).toBe(true);
    expect(p.eyeHeight).toBeCloseTo(1.1, 2);
    const shelf = toAabb({ min: [-1, 1.4, -1], max: [1, 1.45, 1] });
    run(p, { toggleCrouch: true }, 0.1, [shelf]);
    expect(p.crouched).toBe(true);
    run(p, { toggleCrouch: true }, 1, []);
    expect(p.crouched).toBe(false);
    expect(p.eyeHeight).toBeCloseTo(1.65, 2);
  });

  it('emits footsteps by distance travelled', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    let steps = 0;
    run(p, { forward: 1 }, 3, [], { reducedMotion: false, onFootstep: () => steps++ } as typeof opts);
    // ~4.6 m travelled at 0.72 m per step ≈ 6 steps
    expect(steps).toBeGreaterThanOrEqual(5);
    expect(steps).toBeLessThanOrEqual(8);
  });

  it('disables head-bob with reduced motion', () => {
    const p = new PlayerController();
    p.teleport(0, 0, 0, 0);
    run(p, { forward: 1 }, 1, [], { reducedMotion: true });
    expect(p.bobY).toBe(0);
    expect(p.bobX).toBe(0);
  });

  it('clamps pitch', () => {
    const p = new PlayerController();
    p.look(0, 10);
    expect(p.pitch).toBeCloseTo((88 * Math.PI) / 180, 6);
  });
});
