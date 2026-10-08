/**
 * Touch-rig binder (World §2.11): every frame reads the rig's sim state and animates the view —
 * gantry carriage (chasing the sim position, settle sway), magnetic-lock clamps + red dots,
 * solenoid stroke (tap 15 ms down / 90 ms dwell / 30 ms return with a bounce; Down/Up; slow
 * Lower/Raise), dip arm (In −20° / Out +35°, tooth offset), tap paddle, phone sled + power pusher,
 * MAIN/MOTOR toggles, POWER/Pi/PCB/webcam LEDs (Pi ACT flicker 2–12 Hz when healthy, solid when
 * hung), fuse/cable states, side door, JOHNNY-5 device swap. Sounds are positional.
 * Missing sim objects render the healthy factory state.
 */
import type { Engine, LoopHandle, SoundId } from '@/engine/types';
import type { TerminalDevice, LabState, RigState } from '@/sim/types';
import { createRigState } from '@/sim';
import { DIP_ARM_MM, GANTRY_MM, findSimObject } from '../layout';
import { rigConfigFor, type RigDeviceConfig } from './rigConfig';
import type { RigKit } from './kit/context';
import { DEG, MM } from './kit/geom';
import { placeLimitSwitches } from './gantry';
import { TOGGLE_OFF_X, TOGGLE_ON_X } from './fascia';
import type { TouchRigView } from './touchRig';

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A value tweened from → to over `ms` with an easing (restarted when the target changes). */
class Tween {
  from: number;
  to: number;
  t0 = -1e9;
  ms = 1;
  constructor(public value: number, private readonly ease: (t: number) => number = easeInOut) {
    this.from = value;
    this.to = value;
  }
  set(target: number, ms: number, now: number): boolean {
    if (target === this.to) return false;
    this.from = this.value;
    this.to = target;
    this.t0 = now;
    this.ms = Math.max(1, ms);
    return true;
  }
  tick(now: number): number {
    const k = clamp01((now - this.t0) / this.ms);
    this.value = this.from + (this.to - this.from) * this.ease(k);
    return this.value;
  }
  get done(): boolean {
    return this.value === this.to;
  }
}

export class TouchRigBinder {
  private readonly fallback: RigState;
  private cfg: RigDeviceConfig;
  private x = 0;
  private y = 0;
  private cx = 0;
  private cy = 0;
  private speed = 0;
  private wasMoving = false;
  private lastDir: [number, number] = [1, 0];
  private sway = { amp: 0, t0: 0, dx: 0, dy: 0 };
  private plungerHold = new Tween(0, (t) => t);
  private tapAt = -1e9;
  private lastTapMs: number | null = null;
  private lastTaps = 0;
  private dip = new Tween(DIP_ARM_MM.outDeg);
  private tap = new Tween(0, easeOut);
  private sledZ: number;
  private finger = new Tween(0, (t) => t);
  private door = new Tween(0, easeOut);
  private batMain = new Tween(TOGGLE_ON_X, (t) => t);
  private batMotor = new Tween(TOGGLE_ON_X, (t) => t);
  private prev: { main: boolean; motor: boolean; down: boolean; dip: string; tap: string; door: string; engaged: boolean; limX: boolean; limY: boolean } | null = null;
  private stepper: LoopHandle | null = null;
  private idleMs = 0;
  private actPhase = 0;
  private actOn = false;
  private actNext = 0;
  private variantType: string;
  private doorCollider: (() => void) | null = null;
  /** Player drag (mm) applied on top of the sim position while the player pushes the head. */
  dragMm: { dx: number; dy: number } | null = null;
  /** Visual door state while the sim has no door model (null = follow the sim). */
  doorOverride: boolean | null = null;
  /** A decorative (not-in-sim) bay fuse pulled by the player — the Pi load is unplugged meanwhile. */
  bayFuseOut = false;

  constructor(
    private readonly kit: RigKit,
    readonly view: TouchRigView,
    private readonly engine: Engine,
  ) {
    this.fallback = createRigState(view.def.id, 0, 'touch');
    this.cfg = rigConfigFor(view.def);
    this.variantType = this.cfg.type;
    this.sledZ = view.act.sledBackZ;
    this.cx = 0;
    this.cy = 0;
  }

  get config(): RigDeviceConfig {
    return this.cfg;
  }

  /** Displayed carriage position (gantry mm, home-relative). */
  get carriageMm(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  rig(lab: LabState): RigState {
    return lab.rigs?.[this.view.def.id] ?? this.fallback;
  }

  device(lab: LabState): TerminalDevice | undefined {
    const r = lab.rigs?.[this.view.def.id];
    const id = r?.deviceIds?.[0];
    return id ? lab.devices?.[id] : undefined;
  }

  private play(id: SoundId, worldMm: [number, number, number], volume = 1, rate = 1): void {
    const o = this.view.frame;
    const p = o.point(worldMm);
    try {
      this.engine.audio.play(id, { position: [p.x, p.y, p.z], volume, rate });
    } catch {
      /* audio not ready */
    }
  }

  /** Bay mm of the solenoid tip for the displayed gantry position. */
  tipBay(): [number, number, number] {
    return [this.cfg.homeMm[0] + this.x, 106, this.cfg.homeMm[1] + this.y];
  }

  update(lab: LabState, dtS: number, nowMs: number): void {
    const v = this.view;
    const def = v.def;
    const rig = this.rig(lab);
    const live = rig !== this.fallback;
    const dtMs = dtS * 1000;

    // ── device configuration (JOHNNY-5 Flex 1 → Flex 2) ──
    const dev = this.device(lab);
    const type = dev?.type ?? this.cfg.type;
    if (type !== this.variantType && def.deviceConfigs.some((c) => c.type === type)) {
      this.variantType = type;
      this.cfg = rigConfigFor(def, type);
      for (const vr of v.variants) {
        if (vr.group) vr.group.visible = vr.cfg.type === type;
        for (const h of vr.hitProxies ?? []) h.visible = vr.cfg.type === type;
      }
      placeLimitSwitches(v.gantry, this.cfg);
      this.kit.updateDynamic();
    }

    // ── gantry ──
    const g = rig.gantry;
    let tx = g.xMm;
    let ty = g.yMm;
    if (this.dragMm) {
      tx += this.dragMm.dx;
      ty += this.dragMm.dy;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = Math.max(220, dist * 14) * dtS;
    if (dist <= maxStep || dist < 0.005) {
      this.x = tx;
      this.y = ty;
    } else {
      this.x += (dx / dist) * maxStep;
      this.y += (dy / dist) * maxStep;
    }
    const moved = Math.min(dist, maxStep);
    this.speed = dtS > 0 ? moved / dtS : 0;
    const moving = this.speed > 2;
    if (moving && dist > 0) {
      this.lastDir[0] = dx / dist;
      this.lastDir[1] = dy / dist;
    }
    if (this.wasMoving && !moving) this.sway = { amp: 0.3, t0: nowMs, dx: this.lastDir[0], dy: this.lastDir[1] };
    this.wasMoving = moving;
    // clamp (belt) position: follows while the lock is engaged; frozen when broken; travels to
    // re-couple during Park
    const dragBroke = !!this.dragMm && Math.hypot(this.dragMm.dx, this.dragMm.dy) > GANTRY_MM.lockBreakGapMm;
    const engaged = (rig.magneticLock?.engaged ?? true) && !dragBroke;
    if (engaged) {
      const k = clamp01(dtMs / 40);
      this.cx += (this.x - this.cx) * (Math.abs(this.cx - this.x) > 5 ? k : 1);
      this.cy += (this.y - this.cy) * (Math.abs(this.cy - this.y) > 5 ? k : 1);
    } else if (rig.current && /park/i.test(rig.current.kind)) {
      const step = 40 * dtS;
      const gx = this.x - this.cx;
      const gy = this.y - this.cy;
      const gd = Math.hypot(gx, gy);
      if (gd > step) {
        this.cx += (gx / gd) * step;
        this.cy += (gy / gd) * step;
      }
    }
    const swayT = (nowMs - this.sway.t0) / 1000;
    const sw = this.sway.amp * Math.sin(2 * Math.PI * 18 * swayT) * Math.exp(-swayT / 0.12);
    const home = this.cfg.homeMm;
    const cxMm = home[0] + this.x - GANTRY_MM.dropOffsetX;
    const azMm = home[1] + this.y;
    v.gantry.beam.group.position.x = (cxMm + sw * this.sway.dx) * MM;
    v.gantry.arm.group.position.z = (azMm + sw * this.sway.dy) * MM;
    v.gantry.xClamp.group.position.x = (home[0] + this.cx - GANTRY_MM.dropOffsetX) * MM;
    v.gantry.yClamp.group.position.z = (home[1] + this.cy - azMm) * MM + azMm * MM;
    const coilLen = Math.max(20, GANTRY_MM.riser.z - 8 - azMm);
    v.gantry.coil.scale.z = coilLen / v.gantry.coilBaseLen;
    const gap = Math.max(Math.abs(this.cx - this.x), Math.abs(this.cy - this.y));
    v.gantry.xDot.visible = !engaged && Math.abs(this.cx - this.x) > GANTRY_MM.lockBreakGapMm;
    v.gantry.yDot.visible = !engaged && (Math.abs(this.cy - this.y) > GANTRY_MM.lockBreakGapMm || gap > GANTRY_MM.lockBreakGapMm);

    // ── solenoid ──
    const sol = rig.solenoid;
    const taps = sol?.taps ?? 0;
    if (live && ((sol?.lastTapMs ?? null) !== this.lastTapMs || taps > this.lastTaps)) {
      if (this.prev) this.triggerTap(nowMs);
      this.lastTapMs = sol?.lastTapMs ?? null;
      this.lastTaps = taps;
    }
    const slow = sol?.mode === 'slow';
    if (this.plungerHold.set(sol?.down ? 10 : 0, slow ? 600 : sol?.down ? 15 : 30, nowMs) && this.prev) {
      if (!slow) this.play('solenoid', this.tipBay(), sol?.down ? 0.9 : 0.4, sol?.down ? 1 : 1.3);
    }
    const hold = this.plungerHold.tick(nowMs);
    v.gantry.plunger.group.position.y = -Math.max(hold, this.tapStroke(nowMs)) * MM;
    v.gantry.connector.position.y = rig.solenoidConnector === 'LOOSE' ? -25 * MM : 0;

    // ── dip arm / tap paddle / phone sled ──
    const dipIn = rig.dipArm === 'extended' || rig.dipArm === 'extending';
    if (this.dip.set(dipIn ? DIP_ARM_MM.inDeg : DIP_ARM_MM.outDeg, dipIn ? 450 : 380, nowMs) && this.prev) this.play('servo', [32, 150, -48], 0.8);
    const wasDipDone = this.dip.done;
    const dipDeg = this.dip.tick(nowMs) + (rig.dipArmToothOffset ?? 0) * DIP_ARM_MM.toothDeg;
    if (!wasDipDone && this.dip.done && dipIn) this.play('card-insert', [0, 89, -170], 0.8);
    v.act.dip.group.rotation.x = dipDeg * DEG;
    const tapIn = rig.tapArm === 'extended' || rig.tapArm === 'extending';
    if (this.tap.set(tapIn ? v.act.tapInYaw : 0, tapIn ? 350 : 300, nowMs) && this.prev) this.play('servo', [60, 170, -48], 0.6, 1.2);
    const wasTapDone = this.tap.done;
    v.act.tap.group.rotation.y = this.tap.tick(nowMs);
    if (!wasTapDone && this.tap.done && tapIn) this.play('nfc-tap', [0, 108, -232], 0.8);
    const fwd = rig.phonePusher === 'extended' || rig.phonePusher === 'extending';
    const sledTarget = fwd ? this.cfg.powerKeyZMm : v.act.sledBackZ;
    const sdz = sledTarget - this.sledZ;
    this.sledZ += Math.sign(sdz) * Math.min(Math.abs(sdz), 120 * dtS);
    v.act.sled.group.position.z = this.sledZ * MM;
    v.act.sled.group.position.x = this.cfg.sledRailXMm * MM;
    if (this.finger.set(rig.phonePowerPress ? 6 : 0, rig.phonePowerPress ? 30 : 40, nowMs) && rig.phonePowerPress && this.prev) this.play('solenoid', [this.cfg.sledRailXMm, 90, this.sledZ], 0.4, 1.6);
    v.act.finger.position.x = -this.finger.tick(nowMs) * MM;

    // ── switches, door ──
    const main = rig.mainSwitch !== false;
    const motor = rig.motorSwitch !== false;
    if (this.batMain.set(main ? TOGGLE_ON_X : TOGGLE_OFF_X, 60, nowMs) && this.prev) this.play('switch-toggle', [-203, 92, 10]);
    if (this.batMotor.set(motor ? TOGGLE_ON_X : TOGGLE_OFF_X, 60, nowMs) && this.prev) this.play('switch-toggle', [-162, 92, 10]);
    v.fascia.batMain.rotation.x = this.batMain.tick(nowMs);
    v.fascia.batMotor.rotation.x = this.batMotor.tick(nowMs);
    const open = this.doorOverride ?? rig.door === 'open';
    if (this.door.set(open ? def.doorSide * 95 * DEG : 0, 450, nowMs) && this.prev) {
      this.play('door', [def.doorSide * 241, 220, -450], 0.4, 1.2);
      this.setDoorCollider(open);
    }
    v.door.group.rotation.y = this.door.tick(nowMs);

    // ── LEDs ──
    const leds = this.kit.leds;
    const p5 = this.rail5v(lab, rig);
    const p24 = this.rail24v(lab, rig);
    leds.set(v.fascia.ledMain, main && p5 ? 1 : 0);
    leds.set(v.fascia.ledMotor, motor && p24 ? 1 : 0);
    const host = findSimObject<{ power: string; os: string; eth?: string; ethernet?: boolean }>(lab, { collection: 'hosts', ids: [def.sim.piHostId] });
    const hostPower = host ? host.power !== 'off' : main && p5;
    const os = host?.os ?? (hostPower ? 'RUNNING' : 'OFF');
    leds.set(v.pi.pwr, hostPower ? 1 : 0);
    leds.set(v.pi.act, this.actLevel(os, hostPower, nowMs));
    const ethOk = host ? (host.eth ? host.eth !== 'UNPLUGGED' : host.ethernet !== false) : true;
    leds.set(v.pi.link, hostPower && ethOk ? (Math.sin(nowMs / 37) > -0.2 ? 1 : 0.2) : 0);
    leds.set(v.pi.speed, hostPower && ethOk ? 1 : 0);
    leds.set(v.pcb.power, main && p5 ? 1 : 0);
    for (const d of v.pcb.drivers) leds.set(d, motor && p24 && rig.steppersEnabled !== false ? 1 : 0);
    leds.set(v.webcam.led, main && (rig.webcam?.connected ?? true) ? 1 : 0);
    v.motionCable.visible = !!rig.motionHost && rig.motionHost !== 'PI';
    v.cables.ethPlugged.visible = ethOk;
    v.cables.ethLoose.visible = !ethOk;
    const piLoad = findSimObject<{ supply?: { kind: string } }>(lab, { collection: 'power.loads', ids: [def.sim.piLoadId ?? ''] });
    const piPlugged = (piLoad?.supply ? piLoad.supply.kind !== 'none' : true) || this.bayFuseOut;
    v.cables.piPwrPlugged.visible = piPlugged;
    v.cables.piPwrLoose.visible = !piPlugged;
    const fuse = findSimObject<{ blown: boolean; removed?: boolean; ratingA: number }>(lab, { collection: 'power.fuses', ids: [def.sim.bayFuseId ?? ''] });
    v.fuse.setState({ blown: fuse?.blown ?? false, removed: fuse ? (fuse.removed ?? false) : this.bayFuseOut, ratingA: fuse?.ratingA ?? 10 });

    // ── stepper sound (pitch follows speed; homing growl) + limit clicks ──
    this.updateStepper(dtMs, rig);
    const limX = !!g.limitXHit;
    const limY = !!g.limitYHit;
    if (this.prev && live) {
      if (limX && !this.prev.limX) this.play('relay', [home[0] - 66, 297, -45], 0.5, 1.8);
      if (limY && !this.prev.limY) this.play('relay', [home[0] - 14, 335, home[1] - 38], 0.5, 1.8);
      if (!engaged && this.prev.engaged) this.play('unplug', [cxMm, 300, -60], 1, 0.6);
      if (engaged && !this.prev.engaged) this.play('plug-in', [cxMm, 300, -60], 0.8, 1.4);
    }
    // reuse the snapshot object (no per-frame allocation, World §10.5)
    const pv = (this.prev ??= { main, motor, down: false, dip: '', tap: '', door: '', engaged, limX, limY });
    pv.main = main;
    pv.motor = motor;
    pv.down = !!sol?.down;
    pv.dip = rig.dipArm;
    pv.tap = rig.tapArm;
    pv.door = rig.door;
    pv.engaged = engaged;
    pv.limX = limX;
    pv.limY = limY;
  }

  private triggerTap(nowMs: number): void {
    this.tapAt = nowMs;
    this.play('solenoid', this.tipBay(), 1);
  }

  /** Tap stroke profile: 10 mm in 15 ms (ease-in quad), dwell 90 ms, 30 ms return + 0.6 mm bounce. */
  private tapStroke(nowMs: number): number {
    const t = nowMs - this.tapAt;
    if (t < 0 || t > 160) return 0;
    if (t < 15) return 10 * (t / 15) * (t / 15);
    if (t < 105) return 10;
    if (t < 135) return 10 * (1 - (t - 105) / 30);
    return -0.6 * Math.sin(((t - 135) / 25) * Math.PI);
  }

  /** Pi ACT LED: random 20–60 ms pulses at 2–12 Hz when healthy, solid when hung, off when off. */
  private actLevel(os: string, powered: boolean, nowMs: number): number {
    if (!powered || os === 'OFF') return 0;
    if (os === 'HUNG') return 1;
    if (nowMs >= this.actNext) {
      this.actOn = !this.actOn;
      const r = Math.abs(Math.sin(nowMs * 12.9898 + this.actPhase++ * 78.233)) % 1;
      this.actNext = nowMs + (this.actOn ? 20 + r * 40 : 1000 / (2 + r * 10));
    }
    return this.actOn ? 1 : 0;
  }

  private rail5v(lab: LabState, rig: RigState): boolean {
    const t = findSimObject<{ energised: boolean }>(lab, { collection: 'power.terminals', ids: [this.view.def.sim.mainTerminalId ?? ''] });
    void rig;
    if (t) return t.energised;
    const rail = findSimObject<{ voltage: number }>(lab, { collection: 'power.rails', ids: [this.view.def.rackId === 'rack.a' ? 'rail-5v-a' : 'rail-5v-b'] });
    return rail ? rail.voltage > 4 : true;
  }

  private rail24v(lab: LabState, rig: RigState): boolean {
    const t = findSimObject<{ energised: boolean }>(lab, { collection: 'power.terminals', ids: [this.view.def.sim.motorTerminalId ?? ''] });
    if (t) return t.energised;
    const rail = findSimObject<{ voltage: number }>(lab, { collection: 'power.rails', ids: ['rail-24v'] });
    void rig;
    return rail ? rail.voltage > 18 : true;
  }

  private updateStepper(dtMs: number, rig: RigState): void {
    const v = this.speed;
    if (v > 1) {
      this.idleMs = 0;
      const home = this.cfg.homeMm;
      const p = this.view.frame.point([home[0] + this.x - 26, 300, -60]);
      if (!this.stepper) {
        try {
          this.stepper = this.engine.audio.loop('stepper', { position: [p.x, p.y, p.z], volume: 0 });
        } catch {
          this.stepper = null;
        }
      }
      if (this.stepper) {
        const s = Math.min(1, v / 20);
        this.stepper.setVolume(0.12 * s * s * (3 - 2 * s) + (rig.steppersEnabled ? 0.01 : 0));
        this.stepper.setRate(Math.max(0.2, Math.min(3, v / 60)));
        this.stepper.setPosition([p.x, p.y, p.z]);
      }
    } else if (this.stepper) {
      this.idleMs += dtMs;
      this.stepper.setVolume(0);
      if (this.idleMs > 600) {
        this.stepper.stop();
        this.stepper = null;
      }
    }
  }

  /** Open door: a collider for the leaf (0.90 × 0.02 × 0.44) pointing outward at the rear. */
  private setDoorCollider(open: boolean): void {
    this.doorCollider?.();
    this.doorCollider = null;
    if (!open) return;
    const s = this.view.def.doorSide;
    const a = this.view.frame.point([s * 241, 0, -900]);
    const b = this.view.frame.point([s * (241 + 900), 440, -880]);
    this.doorCollider = this.engine.addCollider({
      min: [Math.min(a.x, b.x), a.y, Math.min(a.z, b.z) - 0.01],
      max: [Math.max(a.x, b.x), b.y, Math.max(a.z, b.z) + 0.01],
    });
  }
}
