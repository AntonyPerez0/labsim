/**
 * First-person player controller (pure — no three.js / DOM).
 *
 * Conventions: feet position (x, y, z) in metres; `yaw` rotates about +Y like `camera.rotation.y`
 * (yaw 0 looks toward −Z, yaw π/2 toward −X); `pitch` > 0 looks up. Euler order YXZ.
 */
import {
  type Aabb,
  type CylinderBody,
  ceilingHeight,
  fitsHeight,
  groundHeight,
  moveHorizontal,
} from './collision';

export interface MoveIntent {
  /** −1..1 (W = +1). */
  forward: number;
  /** −1..1 (D = +1). */
  right: number;
  fast: boolean;
  /** Edge-triggered: hop this frame. */
  jump: boolean;
  /** Edge-triggered: toggle crouch this frame. */
  toggleCrouch: boolean;
}

export const NO_INTENT: Readonly<MoveIntent> = { forward: 0, right: 0, fast: false, jump: false, toggleCrouch: false };

export interface PlayerTuning {
  walkSpeed: number;
  fastSpeed: number;
  crouchSpeed: number;
  /** Exponential approach rate toward the wished velocity (1/s). */
  accel: number;
  /** Exponential decay rate with no input (1/s). */
  friction: number;
  airControl: number;
  gravity: number;
  jumpSpeed: number;
  radius: number;
  standEye: number;
  crouchEye: number;
  /** Body height = eye + headroom. */
  headroom: number;
  stepHeight: number;
  pitchLimit: number;
  /** Distance per footstep (walk / fast / crouch). */
  strideWalk: number;
  strideFast: number;
  strideCrouch: number;
  bobAmplitude: number;
  bobSway: number;
}

export const DEFAULT_TUNING: Readonly<PlayerTuning> = {
  walkSpeed: 1.6,
  fastSpeed: 2.6,
  crouchSpeed: 0.85,
  accel: 11,
  friction: 13,
  airControl: 0.2,
  gravity: 14,
  jumpSpeed: 2.5,
  radius: 0.28,
  standEye: 1.65,
  crouchEye: 1.1,
  headroom: 0.1,
  stepHeight: 0.12,
  pitchLimit: (88 * Math.PI) / 180,
  strideWalk: 0.72,
  strideFast: 0.92,
  strideCrouch: 0.55,
  bobAmplitude: 0.022,
  bobSway: 0.012,
};

export type FootSurface = 'floor' | 'plate';

export interface PlayerUpdateOptions {
  reducedMotion: boolean;
  /** Called on each foot strike (intensity 0..1.5) and on landing. */
  onFootstep?: (intensity: number, surface: FootSurface) => void;
}

const TAU = Math.PI * 2;

function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export class PlayerController {
  readonly tuning: PlayerTuning;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  crouched = false;
  grounded = true;
  /** Smoothed eye height above the feet. */
  eyeHeight: number;
  /** Feet height smoothed for the camera (softens step-ups). */
  smoothFeetY = 0;
  /** Head-bob phase (π per footstep) and weight (0 = still). */
  bobPhase = 0;
  bobWeight = 0;
  /** Output head offsets (metres / radians), recomputed each update. */
  bobY = 0;
  bobX = 0;
  bobRoll = 0;
  private readonly body: CylinderBody;

  constructor(tuning: Partial<PlayerTuning> = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.eyeHeight = this.tuning.standEye;
    this.body = { x: 0, y: 0, z: 0, radius: this.tuning.radius, height: this.standHeight };
  }

  get standHeight(): number {
    return this.tuning.standEye + this.tuning.headroom;
  }

  get crouchHeight(): number {
    return this.tuning.crouchEye + this.tuning.headroom;
  }

  /** Horizontal speed (m/s). */
  get speed(): number {
    return Math.sqrt(this.vx * this.vx + this.vz * this.vz);
  }

  /** Camera eye position components (feet + eye height + head-bob). */
  get headX(): number {
    return this.x + Math.cos(this.yaw) * this.bobX;
  }
  get headY(): number {
    return this.smoothFeetY + this.eyeHeight + this.bobY;
  }
  get headZ(): number {
    return this.z - Math.sin(this.yaw) * this.bobX;
  }

  teleport(x: number, y: number, z: number, yaw: number, pitch = 0): void {
    this.x = x;
    this.y = Math.max(0, y);
    this.z = z;
    this.smoothFeetY = this.y;
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw;
    this.pitch = Math.max(-this.tuning.pitchLimit, Math.min(this.tuning.pitchLimit, pitch));
    this.grounded = true;
    this.bobWeight = 0;
    this.bobX = this.bobY = this.bobRoll = 0;
  }

  /** Apply a mouse-look delta in radians (positive dPitch looks up). */
  look(dYaw: number, dPitch: number): void {
    let yaw = this.yaw + dYaw;
    // keep yaw bounded to avoid precision loss over long sessions
    if (yaw > Math.PI) yaw -= TAU;
    else if (yaw < -Math.PI) yaw += TAU;
    this.yaw = yaw;
    const lim = this.tuning.pitchLimit;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch + dPitch));
  }

  update(dt: number, intent: MoveIntent, boxes: readonly Aabb[], opts: PlayerUpdateOptions): void {
    if (!(dt > 0)) return;
    const t = this.tuning;
    const body = this.body;

    // --- crouch toggle (only stand up if there is headroom) ---
    if (intent.toggleCrouch) {
      if (this.crouched) {
        body.x = this.x;
        body.y = this.y;
        body.z = this.z;
        if (fitsHeight(body, this.standHeight, boxes, t.stepHeight)) this.crouched = false;
      } else {
        this.crouched = true;
      }
    }
    body.height = this.crouched ? this.crouchHeight : this.standHeight;

    // --- wished velocity ---
    let f = intent.forward;
    let r = intent.right;
    const len = Math.sqrt(f * f + r * r);
    if (len > 1) {
      f /= len;
      r /= len;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (−sin, −cos), right = (cos, −sin)
    const wishX = -sin * f + cos * r;
    const wishZ = -cos * f - sin * r;
    const maxSpeed = this.crouched ? t.crouchSpeed : intent.fast ? t.fastSpeed : t.walkSpeed;
    const hasInput = len > 1e-3;
    let rate = hasInput ? t.accel : t.friction;
    if (!this.grounded) rate *= t.airControl;
    this.vx = approach(this.vx, wishX * maxSpeed, rate, dt);
    this.vz = approach(this.vz, wishZ * maxSpeed, rate, dt);
    if (!hasInput && this.speed < 0.01) this.vx = this.vz = 0;

    // --- horizontal move with collision & sliding ---
    const ox = this.x;
    const oz = this.z;
    body.x = ox;
    body.y = this.y;
    body.z = oz;
    const hit = moveHorizontal(body, this.vx * dt, this.vz * dt, boxes, t.stepHeight);
    this.x = body.x;
    this.z = body.z;
    if (hit) {
      // keep only the velocity that actually happened (no sticking / building speed into walls)
      this.vx = (this.x - ox) / dt;
      this.vz = (this.z - oz) / dt;
    }

    // --- vertical: hop, gravity, ground & ceiling ---
    const wasGrounded = this.grounded;
    if (intent.jump && this.grounded && !this.crouched) {
      this.vy = t.jumpSpeed;
      this.grounded = false;
    }
    this.vy -= t.gravity * dt;
    this.y += this.vy * dt;
    body.y = this.y;
    const ground = groundHeight(body, boxes, t.stepHeight);
    const surface: FootSurface = ground > 1e-3 ? 'plate' : 'floor';
    if (this.y <= ground) {
      if (!wasGrounded && this.vy < -1.2) opts.onFootstep?.(Math.min(1.5, -this.vy / 3), surface);
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (wasGrounded && this.vy <= 0 && this.y - ground <= t.stepHeight + 0.02) {
      // walking down a small step: stay glued to the ground
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    body.y = this.y;
    const ceil = ceilingHeight(body, boxes, t.stepHeight);
    if (this.y + body.height > ceil) {
      this.y = Math.max(ground, ceil - body.height);
      if (this.vy > 0) this.vy = 0;
    }

    // --- camera smoothing: eye height (crouch) and feet (steps) ---
    const targetEye = this.crouched ? t.crouchEye : t.standEye;
    this.eyeHeight = approach(this.eyeHeight, targetEye, 9, dt);
    this.smoothFeetY = this.grounded ? approach(this.smoothFeetY, this.y, 16, dt) : this.y;

    // --- head-bob & footsteps ---
    const speed = this.grounded ? this.speed : 0;
    const stride = this.crouched ? t.strideCrouch : intent.fast ? t.strideFast : t.strideWalk;
    const moving = speed > 0.15;
    const prevStep = Math.floor(this.bobPhase / Math.PI);
    if (moving) this.bobPhase += (speed * dt * Math.PI) / stride;
    else if (this.bobWeight < 0.02) this.bobPhase = 0;
    const step = Math.floor(this.bobPhase / Math.PI);
    if (step !== prevStep && moving) {
      opts.onFootstep?.(Math.min(1.3, speed / t.walkSpeed) * (this.crouched ? 0.55 : 1), surface);
    }
    const targetWeight = moving ? Math.min(1.3, speed / t.walkSpeed) : 0;
    this.bobWeight = approach(this.bobWeight, targetWeight, 6, dt);
    if (opts.reducedMotion) {
      this.bobX = this.bobY = this.bobRoll = 0;
    } else {
      const w = this.bobWeight * (this.crouched ? 0.6 : 1);
      this.bobY = -Math.cos(2 * this.bobPhase) * t.bobAmplitude * 0.5 * w;
      this.bobX = Math.sin(this.bobPhase) * t.bobSway * w;
      this.bobRoll = Math.sin(this.bobPhase) * 0.004 * w;
    }
  }
}
