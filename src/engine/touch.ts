/**
 * Touch (mobile) input bridge — the on-screen HUD (`src/ui/hud/TouchControls.tsx`) writes, the
 * engine consumes in `frame()`. It deliberately mirrors the signal shapes of `input.ts` (look
 * deltas in CSS px, an analog move vector, edge-triggered jump/crouch, queued verb presses) so
 * the engine keeps a single code path per action; there is no pointer lock on touch devices.
 *
 * Plain mutable state, not store state: it changes every frame and nothing may re-render for it.
 * Written from `pointer` events in the touch HUD; cleared when the HUD unmounts or controls stop.
 */
import type { InteractVerb } from './types';

export interface TouchLook {
  dx: number;
  dy: number;
}

/** Look rate for touch drags — ~2.5× the mouse rate: short swipes on a small screen. */
export const TOUCH_LOOK_RADIANS_PER_PIXEL = 0.0055;

/** Joystick tuning, as fractions of the travel radius (dead zone / outer "run" ring). */
export const JOY_DEAD_ZONE = 0.14;
export const JOY_RUN_FRACTION = 0.92;

export const touch = {
  /** Touch HUD is mounted (coarse-pointer device, 3D view free); false ⇒ the engine ignores touch. */
  enabled: false,
  /** Move vector −1..1 (x: right, y: forward +1). 0/0 = not touched. */
  jx: 0,
  jy: 0,
  /** Walk fast: joystick pushed into the outer ring. */
  fast: false,
  /** Accumulated look deltas (CSS px) since the engine last consumed them. */
  lookDX: 0,
  lookDY: 0,
  /** Edge-triggered, consumed by the engine like the Space / C keys. */
  jump: false,
  crouch: false,
  /** Queued verb presses (drained after the keyboard queue). */
  presses: [] as InteractVerb['key'][],
};

const MAX_QUEUED_PRESSES = 3;

/**
 * Map a joystick drag (px from the touch origin, screen y down) to the move vector: analog
 * magnitude with a dead zone, `y` flipped to forward-positive, `fast` from the outer ring.
 */
export function joystick(dx: number, dy: number, radius: number): { x: number; y: number; fast: boolean } {
  const len = Math.hypot(dx, dy);
  const m = radius > 0 ? Math.min(1, len / radius) : 0;
  if (m <= JOY_DEAD_ZONE) return { x: 0, y: 0, fast: false };
  const gain = (m - JOY_DEAD_ZONE) / (1 - JOY_DEAD_ZONE);
  return {
    x: (dx / len) * gain,
    y: (-dy / len) * gain, // screen y is down; forward is up
    fast: m >= JOY_RUN_FRACTION,
  };
}

/** Queue a verb press (bounded: mashing buttons during a hitch must not replay later). */
export function touchPress(k: InteractVerb['key']): void {
  if (touch.presses.length < MAX_QUEUED_PRESSES) touch.presses.push(k);
}

/** Pop the next queued verb press, or null. */
export function touchNextPress(): InteractVerb['key'] | null {
  return touch.presses.shift() ?? null;
}

export function touchConsumeJump(): boolean {
  const j = touch.jump;
  touch.jump = false;
  return j;
}

export function touchConsumeCrouch(): boolean {
  const c = touch.crouch;
  touch.crouch = false;
  return c;
}

/** Hand the accumulated look deltas to `out` and reset them (allocation-free, per frame). */
export function touchConsumeLook(out: TouchLook): void {
  out.dx = touch.lookDX;
  out.dy = touch.lookDY;
  touch.lookDX = touch.lookDY = 0;
}

/** Release everything (HUD unmounted, overlay opened, controls disabled). */
export function touchClear(): void {
  touch.jx = touch.jy = 0;
  touch.fast = false;
  touch.lookDX = touch.lookDY = 0;
  touch.jump = touch.crouch = false;
  touch.presses.length = 0;
}
