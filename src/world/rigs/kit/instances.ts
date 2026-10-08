/**
 * Instancing (World §10.3): static pools (button-head screws, LED bezels) and dynamic pools whose
 * instances follow an anchor `Object3D` inside a moving group (V-wheels, NEMA-17 bodies, limit
 * switches), plus the LED pool — one InstancedMesh for every indicator LED in the rigs with a
 * per-instance HDR colour (on/off fades), so ≈ 200 LEDs cost one draw call.
 */
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';
import { placeMatrix, type Place } from './geom';
import { bloomActive, ledToneScale } from '../../ledTone';

/** Typical HDR on-intensity of the rig LEDs (`LedPool.add` default 6, some 7). */
const RIG_LED_INTENSITY = 6.5;

/** Static instances: collected first, built once. */
export class StaticInstances {
  private readonly mats: Matrix4[] = [];
  constructor(
    readonly geometry: BufferGeometry,
    readonly material: Material,
    readonly name: string,
  ) {}

  /** Add an instance (placement in mm, in the frame `frame` — world if omitted). */
  add(place: Place | Matrix4, frame?: Matrix4): void {
    const m = place instanceof Matrix4 ? place.clone() : placeMatrix(place);
    this.mats.push(frame ? frame.clone().multiply(m) : m);
  }

  get count(): number {
    return this.mats.length;
  }

  build(parent: Object3D, castShadow = false): InstancedMesh | null {
    if (this.mats.length === 0) return null;
    const im = new InstancedMesh(this.geometry, this.material, this.mats.length);
    this.mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.name = this.name;
    parent.add(im);
    return im;
  }
}

interface DynEntry {
  anchor: Object3D;
  local: Matrix4;
}

/** Instances that follow anchors (call `update()` after the anchors' world matrices change). */
export class DynamicInstances {
  private readonly entries: DynEntry[] = [];
  private mesh: InstancedMesh | null = null;
  private readonly tmp = new Matrix4();
  private readonly inv = new Matrix4();

  constructor(
    readonly geometry: BufferGeometry,
    readonly material: Material,
    readonly name: string,
  ) {}

  /** Add an instance at a mm placement (or a metre matrix) relative to `anchor`. */
  add(anchor: Object3D, place: Place | Matrix4 = {}): number {
    this.entries.push({ anchor, local: place instanceof Matrix4 ? place.clone() : placeMatrix(place) });
    return this.entries.length - 1;
  }

  build(parent: Object3D, castShadow = false): InstancedMesh | null {
    if (this.entries.length === 0) return null;
    const im = new InstancedMesh(this.geometry, this.material, this.entries.length);
    im.instanceMatrix.setUsage(DynamicDrawUsage);
    im.frustumCulled = false;
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.name = this.name;
    parent.add(im);
    this.mesh = im;
    this.update(true);
    return im;
  }

  /** Recompute instance matrices from the anchors (world matrices must be current). */
  update(force = false): void {
    const im = this.mesh;
    if (!im) return;
    im.updateMatrixWorld(force);
    this.inv.copy(im.matrixWorld).invert();
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      if (force) e.anchor.updateWorldMatrix(true, false);
      this.tmp.multiplyMatrices(e.anchor.matrixWorld, e.local).premultiply(this.inv);
      im.setMatrixAt(i, this.tmp);
    }
    im.instanceMatrix.needsUpdate = true;
  }
}

export interface LedHandle {
  readonly index: number;
}

interface LedEntry {
  anchor: Object3D | null;
  local: Matrix4;
  on: Color;
  off: Color;
  level: number;
  target: number;
  /** ms for a 0→1 ramp (World §2.11: all LED transitions ramp 50 ms). */
  rampMs: number;
}

/**
 * All indicator LEDs: unlit lenses (MeshBasicMaterial, tone-mapped) whose colour is the LED colour
 * × intensity when on (above the bloom threshold) and a dark lens tint when off.
 */
export class LedPool {
  private readonly entries: LedEntry[] = [];
  private mesh: InstancedMesh | null = null;
  private colors: InstancedBufferAttribute | null = null;
  private readonly tmp = new Matrix4();
  private readonly inv = new Matrix4();
  private readonly c = new Color();
  private dirtyColor = true;
  private dirtyMatrix = true;
  private mat: MeshBasicMaterial | null = null;
  private bloom: boolean | null = null;

  constructor(readonly geometry: BufferGeometry) {}

  /**
   * Add an LED. `place` positions/scales the unit lens geometry (mm) relative to `anchor` (or world
   * when anchor is null). `hex` is the LED colour; `intensity` its on-brightness multiplier.
   */
  add(anchor: Object3D | null, place: Place | Matrix4, hex: string, intensity = 6, offHex = '#0b0d0c'): LedHandle {
    const on = new Color(hex).multiplyScalar(intensity);
    const off = new Color(offHex);
    this.entries.push({ anchor, local: place instanceof Matrix4 ? place.clone() : placeMatrix(place), on, off, level: 0, target: 0, rampMs: 50 });
    return { index: this.entries.length - 1 };
  }

  build(parent: Object3D): InstancedMesh | null {
    if (this.entries.length === 0) return null;
    const mat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
    mat.name = 'ledLens';
    this.mat = mat;
    this.applyTone();
    const im = new InstancedMesh(this.geometry, mat, this.entries.length);
    im.instanceMatrix.setUsage(DynamicDrawUsage);
    const arr = new Float32Array(this.entries.length * 3);
    this.colors = new InstancedBufferAttribute(arr, 3);
    this.colors.setUsage(DynamicDrawUsage);
    im.instanceColor = this.colors;
    im.frustumCulled = false;
    im.name = 'rig-leds';
    parent.add(im);
    this.mesh = im;
    this.updateMatrices(true);
    this.flushColors();
    return im;
  }

  /** Set an LED's target brightness 0..1 (ramps over `rampMs`). `instant` skips the ramp. */
  set(h: LedHandle | null | undefined, level: number, instant = false): void {
    if (!h) return;
    const e = this.entries[h.index];
    if (!e) return;
    const v = Math.max(0, Math.min(1, level));
    if (e.target === v && (!instant || e.level === v)) return;
    e.target = v;
    if (instant) e.level = v;
    this.dirtyColor = true;
  }

  setColor(h: LedHandle | null | undefined, hex: string, intensity = 6): void {
    if (!h) return;
    const e = this.entries[h.index];
    if (!e) return;
    e.on.set(hex).multiplyScalar(intensity);
    this.dirtyColor = true;
  }

  markMoved(): void {
    this.dirtyMatrix = true;
  }

  /** Advance ramps; upload colours/matrices when something changed. */
  tick(dtMs: number): void {
    this.applyTone();
    let changed = this.dirtyColor;
    for (const e of this.entries) {
      if (e.level !== e.target) {
        const step = dtMs / Math.max(1, e.rampMs);
        e.level = e.level < e.target ? Math.min(e.target, e.level + step) : Math.max(e.target, e.level - step);
        changed = true;
      }
    }
    if (changed) this.flushColors();
    if (this.dirtyMatrix) this.updateMatrices(false);
  }

  /** Keep the lens hue readable when the preset has no bloom (see `world/ledTone.ts`). */
  private applyTone(): void {
    const b = bloomActive();
    if (b === this.bloom || !this.mat) return;
    this.bloom = b;
    this.mat.color.setScalar(ledToneScale(RIG_LED_INTENSITY, b));
  }

  private flushColors(): void {
    const attr = this.colors;
    if (!attr) return;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      this.c.copy(e.off).lerp(e.on, e.level);
      attr.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
    attr.needsUpdate = true;
    this.dirtyColor = false;
  }

  private updateMatrices(force: boolean): void {
    const im = this.mesh;
    if (!im) return;
    im.updateMatrixWorld(force);
    this.inv.copy(im.matrixWorld).invert();
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      if (e.anchor) {
        if (force) e.anchor.updateWorldMatrix(true, false);
        this.tmp.multiplyMatrices(e.anchor.matrixWorld, e.local).premultiply(this.inv);
      } else this.tmp.copy(e.local).premultiply(this.inv);
      im.setMatrixAt(i, this.tmp);
    }
    im.instanceMatrix.needsUpdate = true;
    this.dirtyMatrix = false;
  }
}
