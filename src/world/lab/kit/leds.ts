/**
 * Indicator LEDs as ONE instanced mesh per shape (World §10.3: "LED lenses by colour ≈ 220 → 4
 * draws, per-instance colour/intensity via instanceColor"). The material is unlit with a colour
 * multiplier well above the bloom threshold (§7.2: LEDs ×7); each instance's `instanceColor` is its
 * hue × level (0 = dark lens).
 */
import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  BoxGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { bloomActive, ledToneScale } from '../../ledTone';

const UP = new Vector3(0, 1, 0);

export interface LedSpec {
  pos: [number, number, number];
  /** Outward normal of the panel the LED sits on (lens axis). */
  normal: [number, number, number];
  color: string;
  /** Lens diameter (round) or [w, h] (rectangular), metres. */
  size: number | [number, number];
  /** Initial level 0..1. */
  level?: number;
}

/** Dark lens tint when off (fraction of the hue). */
const OFF_LEVEL = 0.025;

export class LedSet {
  private specs: { color: Color; level: number; round: boolean; matrix: Matrix4 }[] = [];
  private round: InstancedMesh | null = null;
  private rect: InstancedMesh | null = null;
  private roundIdx: number[] = [];
  private rectIdx: number[] = [];
  private dirtyRound = false;
  private dirtyRect = false;
  private readonly tmp = new Color();
  private mat: MeshBasicMaterial | null = null;
  private bloom: boolean | null = null;

  constructor(
    readonly name: string,
    private readonly intensity = 7,
  ) {}

  add(spec: LedSpec): number {
    const round = typeof spec.size === 'number';
    const n = new Vector3(...spec.normal).normalize();
    const q = new Quaternion().setFromUnitVectors(UP, n);
    const s = round ? new Vector3(spec.size as number, 1, spec.size as number) : new Vector3((spec.size as [number, number])[0], 1, (spec.size as [number, number])[1]);
    // the lens protrudes 0.8 mm along the normal
    const p = new Vector3(...spec.pos).addScaledVector(n, 0.0004);
    const m = new Matrix4().compose(p, q, s);
    this.specs.push({ color: new Color(spec.color), level: spec.level ?? 1, round, matrix: m });
    return this.specs.length - 1;
  }

  /** Build the instanced meshes (call once after all `add`s). */
  build(parent: Object3D): void {
    const roundSpecs = this.specs.map((s, i) => [s, i] as const).filter(([s]) => s.round);
    const rectSpecs = this.specs.map((s, i) => [s, i] as const).filter(([s]) => !s.round);
    const mat = new MeshBasicMaterial({ color: new Color(this.intensity, this.intensity, this.intensity), toneMapped: true });
    mat.name = `${this.name}:leds`;
    this.mat = mat;
    this.applyTone();
    const mk = (geo: BufferGeometry, list: (readonly [LedSetSpec, number])[], idx: number[]): InstancedMesh | null => {
      if (!list.length) return null;
      const im = new InstancedMesh(geo, mat, list.length);
      im.name = `${this.name}:leds`;
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.instanceColor = new InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      im.instanceColor.setUsage(DynamicDrawUsage);
      list.forEach(([s, i], k) => {
        im.setMatrixAt(k, s.matrix);
        idx[i] = k;
      });
      im.castShadow = false;
      im.receiveShadow = false;
      im.frustumCulled = false;
      parent.add(im);
      return im;
    };
    this.roundIdx = new Array(this.specs.length).fill(-1);
    this.rectIdx = new Array(this.specs.length).fill(-1);
    // unit lens: Ø1 × 0.8 mm dome-ish cylinder / 1 × 1 × 0.8 mm box (scaled per instance in X/Z)
    this.round = mk(new CylinderGeometry(0.5, 0.5, 0.0008, 10), roundSpecs, this.roundIdx);
    this.rect = mk(new BoxGeometry(1, 0.0008, 1), rectSpecs, this.rectIdx);
    for (let i = 0; i < this.specs.length; i++) this.apply(i);
    if (this.round) this.round.instanceColor!.needsUpdate = true;
    if (this.rect) this.rect.instanceColor!.needsUpdate = true;
  }

  private apply(i: number): void {
    const s = this.specs[i]!;
    const lvl = Math.max(OFF_LEVEL, Math.min(1.5, s.level));
    this.tmp.copy(s.color).multiplyScalar(s.level <= 0 ? OFF_LEVEL : lvl);
    if (s.round) {
      const k = this.roundIdx[i]!;
      if (this.round && k >= 0) {
        this.round.setColorAt(k, this.tmp);
        this.dirtyRound = true;
      }
    } else {
      const k = this.rectIdx[i]!;
      if (this.rect && k >= 0) {
        this.rect.setColorAt(k, this.tmp);
        this.dirtyRect = true;
      }
    }
  }

  /** Set an LED level (0 = off, 1 = on); cheap no-op when unchanged. */
  set(i: number, level: number | boolean): void {
    const s = this.specs[i];
    if (!s) return;
    const l = typeof level === 'boolean' ? (level ? 1 : 0) : level;
    if (Math.abs(s.level - l) < 1e-3) return;
    s.level = l;
    this.apply(i);
  }

  /** Change an LED's hue (e.g. badge reader red → green). */
  setColor(i: number, hex: string): void {
    const s = this.specs[i];
    if (!s) return;
    s.color.set(hex);
    this.apply(i);
  }

  /** Upload changed colours (call once per frame). */
  /** Material multiplier: HDR × intensity with bloom, a hue-preserving peak without (`world/ledTone.ts`). */
  private applyTone(): void {
    const b = bloomActive();
    if (b === this.bloom || !this.mat) return;
    this.bloom = b;
    this.mat.color.setScalar(this.intensity * ledToneScale(this.intensity, b));
  }

  flush(): void {
    this.applyTone();
    if (this.dirtyRound && this.round?.instanceColor) this.round.instanceColor.needsUpdate = true;
    if (this.dirtyRect && this.rect?.instanceColor) this.rect.instanceColor.needsUpdate = true;
    this.dirtyRound = this.dirtyRect = false;
  }
}

type LedSetSpec = { color: Color; level: number; round: boolean; matrix: Matrix4 };
