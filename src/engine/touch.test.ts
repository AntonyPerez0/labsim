/**
 * Touch input bridge (node, no DOM): joystick mapping, press queue, edge flags and clear.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { JOY_DEAD_ZONE, JOY_RUN_FRACTION, joystick, touch, touchClear, touchConsumeCrouch, touchConsumeJump, touchConsumeLook, touchNextPress, touchPress } from './touch';

const R = 44; // joystick travel radius in px

describe('joystick()', () => {
  it('is zero inside the dead zone and just past the origin', () => {
    expect(joystick(0, 0, R)).toEqual({ x: 0, y: 0, fast: false });
    const tiny = joystick(R * JOY_DEAD_ZONE * 0.9, 0, R);
    expect(tiny.x).toBe(0);
    expect(tiny.y).toBe(0);
    expect(tiny.fast).toBe(false);
  });

  it('flips screen-y-down to forward-positive', () => {
    // dragging up (negative dy) = forward (positive y)
    const fwd = joystick(0, -R, R);
    expect(fwd.y).toBeCloseTo(1);
    expect(fwd.x).toBeCloseTo(0);
    // dragging down = backwards
    expect(joystick(0, R * 0.5, R).y).toBeLessThan(0);
  });

  it('is analog: half deflection ≈ half speed, full deflection = 1', () => {
    expect(joystick(0, -(R * 0.5), R).y).toBeLessThan(0.6);
    expect(joystick(0, -R, R).y).toBeCloseTo(1);
    // clamps past the radius (finger can overshoot the ring)
    expect(joystick(0, -R * 3, R).y).toBeCloseTo(1);
  });

  it('runs only in the outer ring', () => {
    expect(joystick(0, -(R * (JOY_RUN_FRACTION - 0.05)), R).fast).toBe(false);
    expect(joystick(0, -R, R).fast).toBe(true);
  });

  it('is zero for a zero radius (guards a mis-sized HUD)', () => {
    expect(joystick(10, -10, 0)).toEqual({ x: 0, y: 0, fast: false });
  });
});

describe('press queue and edge flags', () => {
  beforeEach(() => touchClear());

  it('drains presses in order and caps the queue', () => {
    touchPress('E');
    touchPress('R');
    touchPress('Q');
    touchPress('F'); // over the cap of 3
    expect(touchNextPress()).toBe('E');
    expect(touchNextPress()).toBe('R');
    expect(touchNextPress()).toBe('Q');
    expect(touchNextPress()).toBeNull();
  });

  it('consumes jump / crouch exactly once (edge-triggered like the keys)', () => {
    touch.jump = true;
    expect(touchConsumeJump()).toBe(true);
    expect(touchConsumeJump()).toBe(false);
    touch.crouch = true;
    expect(touchConsumeCrouch()).toBe(true);
    expect(touchConsumeCrouch()).toBe(false);
  });

  it('hands look deltas over and resets them', () => {
    touch.lookDX = 12;
    touch.lookDY = -4;
    const out = { dx: 0, dy: 0 };
    touchConsumeLook(out);
    expect(out).toEqual({ dx: 12, dy: -4 });
    const again = { dx: 5, dy: 5 };
    touchConsumeLook(again);
    expect(again).toEqual({ dx: 0, dy: 0 });
  });

  it('clear() drops everything (overlay opened, HUD unmounted)', () => {
    touch.enabled = true;
    touch.jx = 0.5;
    touch.jy = 1;
    touch.fast = true;
    touchPress('E');
    touch.jump = true;
    touch.lookDX = 3;
    touchClear();
    expect(touch.jx).toBe(0);
    expect(touch.jy).toBe(0);
    expect(touch.fast).toBe(false);
    expect(touch.jump).toBe(false);
    expect(touch.lookDX).toBe(0);
    expect(touchNextPress()).toBeNull();
  });
});
