/**
 * Static geometry batching for the lab (World §10.3): every zone builder adds its pieces to a
 * `StaticBatch`, which bakes the transform into the geometry and merges everything that shares a
 * material (and shadow flags) into ONE mesh per zone. Box-projected palette materials tile in
 * object space, so baking world coordinates keeps the textures at real-world scale.
 *
 * A small transform stack (`at()` / `push()` / `pop()`) lets builders model a prop in its own
 * local frame and place it with the prop's position/rotation.
 */
import {
  MeshStandardMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Quaternion,
  Euler,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxGeo, cylGeo } from './shapes';

export type ShadowMode = 'both' | 'receive' | 'cast' | 'none';

interface Bucket {
  mat: Material;
  shadow: ShadowMode;
  geos: BufferGeometry[];
}

const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3(1, 1, 1);
const tmpEuler = new Euler();

/** Matrix from a translation and XYZ Euler rotation (radians). */
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, order: 'XYZ' | 'YXZ' | 'ZYX' = 'XYZ'): Matrix4 {
  tmpEuler.set(rx, ry, rz, order);
  tmpQuat.setFromEuler(tmpEuler);
  tmpPos.set(x, y, z);
  return new Matrix4().compose(tmpPos, tmpQuat, tmpScale);
}

/**
 * Normalise a geometry for merging: non-indexed, only `position` / `normal` / `uv`, no groups,
 * transformed by `m`. Always returns a new geometry.
 */
export function prepGeometry(g: BufferGeometry, m: Matrix4 | null): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  }
  out.morphAttributes = {};
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) {
    const n = out.getAttribute('position').count;
    out.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  out.clearGroups();
  if (m) out.applyMatrix4(m);
  return out;
}

export class StaticBatch {
  private buckets = new Map<string, Bucket>();
  private stack: Matrix4[] = [new Matrix4()];
  private triangles = 0;

  constructor(readonly name: string) {}

  /** Current accumulated transform. */
  get matrix(): Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  push(m: Matrix4): void {
    this.stack.push(this.matrix.clone().multiply(m));
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  /** Model inside a local frame: translate (x, y, z) then rotate about Y by `rotY` radians. */
  at(x: number, y: number, z: number, rotY: number, fn: () => void): void {
    this.push(xf(x, y, z, 0, rotY, 0));
    try {
      fn();
    } finally {
      this.pop();
    }
  }

  /** Same as `at` with a full transform. */
  within(m: Matrix4, fn: () => void): void {
    this.push(m);
    try {
      fn();
    } finally {
      this.pop();
    }
  }

  /**
   * Add a geometry (in the current frame, optionally offset by `local`). The input geometry is
   * disposed unless `keep` is true (shared/cached geometries).
   */
  add(geo: BufferGeometry, mat: Material, local?: Matrix4 | null, shadow: ShadowMode = 'both', keep = false): void {
    const m = local ? this.matrix.clone().multiply(local) : this.matrix;
    const g = prepGeometry(geo, m);
    if (!keep) geo.dispose();
    const key = `${mat.uuid}|${shadow}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, shadow, geos: [] };
      this.buckets.set(key, b);
    }
    b.geos.push(g);
    this.triangles += g.getAttribute('position').count / 3;
  }

  /** Axis-aligned box centred at (x, y, z) in the current frame (optional Y rotation, radians). */
  box(w: number, h: number, d: number, mat: Material, x: number, y: number, z: number, rotY = 0, shadow: ShadowMode = 'both'): void {
    this.add(boxGeo(w, h, d), mat, xf(x, y, z, 0, rotY, 0), shadow);
  }

  /** Box given by its min corner and size (handy for frames). */
  boxMin(x0: number, y0: number, z0: number, w: number, h: number, d: number, mat: Material, shadow: ShadowMode = 'both'): void {
    this.add(boxGeo(w, h, d), mat, xf(x0 + w / 2, y0 + h / 2, z0 + d / 2), shadow);
  }

  /** Vertical cylinder standing on (x, y, z). */
  cyl(r: number, h: number, mat: Material, x: number, y: number, z: number, seg = 16, shadow: ShadowMode = 'both'): void {
    this.add(cylGeo(r, r, h, seg), mat, xf(x, y + h / 2, z), shadow);
  }

  /** Cylinder along an arbitrary axis between two points (cables, rods). */
  rod(a: [number, number, number], b: [number, number, number], r: number, mat: Material, seg = 8, shadow: ShadowMode = 'both'): void {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-5) return;
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const dir = vb.clone().sub(va).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    const m = new Matrix4().compose(mid, q, new Vector3(1, 1, 1));
    this.add(cylGeo(r, r, len, seg, true), mat, m, shadow);
  }

  /** Hand over the un-merged buckets (for `MergedSet`); the batch is emptied. */
  takeBuckets(): { mat: Material; shadow: ShadowMode; geos: BufferGeometry[] }[] {
    const out = [...this.buckets.values()];
    this.buckets.clear();
    return out;
  }

  get triangleCount(): number {
    return this.triangles;
  }

  /** Merge every bucket into one mesh per material and add them to `parent`. */
  flush(parent: Object3D): Mesh[] {
    const out: Mesh[] = [];
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const merged = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false);
      if (!merged) continue;
      if (b.geos.length > 1) for (const g of b.geos) g.dispose();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new Mesh(merged, b.mat);
      mesh.name = `${this.name}:${b.mat.name || 'mat'}`;
      mesh.castShadow = b.shadow === 'both' || b.shadow === 'cast';
      mesh.receiveShadow = b.shadow === 'both' || b.shadow === 'receive';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

/**
 * A set of separately toggleable items that render as ONE merged mesh per material (World §10.4:
 * "library devices are a single merged static mesh until one is picked up"). Hiding/showing an
 * item rebuilds the merged geometry (cheap for a few thousand triangles).
 */
export class MergedSet {
  private items = new Map<string, { buckets: { mat: Material; shadow: ShadowMode; geos: BufferGeometry[] }[]; visible: boolean }>();
  private meshes: Mesh[] = [];
  private parent: Object3D | null = null;

  constructor(readonly name: string) {}

  /** Model one item with its own batch (positions in world/parent space). */
  add(id: string, build: (b: StaticBatch) => void): void {
    const b = new StaticBatch(`${this.name}:${id}`);
    build(b);
    this.items.set(id, { buckets: b.takeBuckets(), visible: true });
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  isVisible(id: string): boolean {
    return this.items.get(id)?.visible ?? false;
  }

  build(parent: Object3D): void {
    this.parent = parent;
    this.rebuild();
  }

  setVisible(id: string, visible: boolean): void {
    const it = this.items.get(id);
    if (!it || it.visible === visible) return;
    it.visible = visible;
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.parent) return;
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.meshes = [];
    const byKey = new Map<string, { mat: Material; shadow: ShadowMode; geos: BufferGeometry[] }>();
    for (const it of this.items.values()) {
      if (!it.visible) continue;
      for (const bk of it.buckets) {
        const key = `${bk.mat.uuid}|${bk.shadow}`;
        let e = byKey.get(key);
        if (!e) byKey.set(key, (e = { mat: bk.mat, shadow: bk.shadow, geos: [] }));
        e.geos.push(...bk.geos);
      }
    }
    for (const e of byKey.values()) {
      const merged = mergeGeometries(e.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, e.mat);
      mesh.name = `${this.name}:${e.mat.name || 'mat'}`;
      mesh.castShadow = e.shadow === 'both' || e.shadow === 'cast';
      mesh.receiveShadow = e.shadow === 'both' || e.shadow === 'receive';
      mesh.matrixAutoUpdate = false;
      this.parent.add(mesh);
      this.meshes.push(mesh);
    }
  }
}

/**
 * Lab-wide static merge (World §10.3): zone batches hand their buckets over; `build()` merges them
 * per material + shadow mode + coarse spatial cell (so frustum culling still drops the far half of
 * the room), which keeps the static lab at roughly (materials × cells) draw calls.
 */
export class StaticCollector {
  private buckets = new Map<string, { mat: Material; shadow: ShadowMode; geos: BufferGeometry[] }>();

  constructor(
    /** Cell size in metres along X and Z. */
    private readonly cell: [number, number] = [100, 5],
  ) {}

  /**
   * Merge a moving/toggleable group's batch on its own (same vertex-colour folding, no cells):
   * returns the meshes added to `parent`.
   */
  flushInto(batch: StaticBatch, parent: Object3D, castShadow = false): Mesh[] {
    const tmp = new StaticCollector([1e6, 1e6]);
    tmp.vcMats = this.vcMats;
    tmp.unifyShadow = castShadow ? 'both' : 'receive';
    tmp.add(batch);
    return tmp.build(parent);
  }

  vcMats = new Map<string, Material>();

  /**
   * Plain colour-only standard materials (no maps, opaque, not emissive) are folded into a shared
   * vertex-coloured material per (roughness, metalness) pair — dozens of palette colours become a
   * handful of draw calls.
   */
  private vertexColourMat(mat: Material): Material | null {
    const m = mat as MeshStandardMaterial;
    if ((m.type !== 'MeshStandardMaterial' && m.type !== 'MeshPhysicalMaterial') || (m as { transmission?: number }).transmission || m.map || m.alphaMap || m.normalMap || m.roughnessMap || m.transparent || !m.visible) return null;
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity > 0.001) return null;
    if ((m as { userData: Record<string, unknown> }).userData?.noMerge) return null;
    // coarse PBR bins: glossy / satin / matte / chalky × dielectric / semi / metal
    const r = m.roughness < 0.3 ? 0.18 : m.roughness < 0.52 ? 0.42 : m.roughness < 0.8 ? 0.62 : 0.9;
    const mt = m.metalness < 0.25 ? 0 : m.metalness < 0.75 ? 0.5 : 1;
    const key = `${r}|${mt}|${m.side}`;
    let out = this.vcMats.get(key);
    if (!out) {
      out = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: r, metalness: mt, side: m.side, envMapIntensity: m.envMapIntensity });
      out.name = `lab.vc.r${r}.m${mt}`;
      this.vcMats.set(key, out);
    }
    return out;
  }

  /** Small moving groups: one shadow mode for everything (fewer draws). */
  unifyShadow: ShadowMode | null = null;

  add(batch: StaticBatch): void {
    for (const b0 of batch.takeBuckets()) {
      const b = { ...b0, shadow: (this.unifyShadow ?? (b0.shadow === 'none' ? 'receive' : b0.shadow)) as ShadowMode };
      const vc = this.vertexColourMat(b.mat);
      const col = (b.mat as MeshStandardMaterial).color;
      for (const g of b.geos) {
        if (vc) {
          const n = g.getAttribute('position').count;
          const arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            arr[i * 3] = col.r;
            arr[i * 3 + 1] = col.g;
            arr[i * 3 + 2] = col.b;
          }
          g.setAttribute('color', new Float32BufferAttribute(arr, 3));
        }
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        const cx = Math.floor(((bb.min.x + bb.max.x) / 2 + 50) / this.cell[0]);
        const cz = Math.floor(((bb.min.z + bb.max.z) / 2 + 50) / this.cell[1]);
        const mat = vc ?? b.mat;
        const key = `${mat.uuid}|${b.shadow}|${cx},${cz}`;
        let e = this.buckets.get(key);
        if (!e) this.buckets.set(key, (e = { mat, shadow: b.shadow, geos: [] }));
        e.geos.push(g);
      }
    }
  }

  /** Triangles queued so far (debug: per-builder budgets). */
  pendingTriangles(): number {
    let n = 0;
    for (const e of this.buckets.values()) for (const g of e.geos) n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    return Math.round(n);
  }

  build(parent: Object3D): Mesh[] {
    const out: Mesh[] = [];
    for (const [key, e] of this.buckets) {
      const merged = e.geos.length === 1 ? e.geos[0]! : mergeGeometries(e.geos, false);
      if (!merged) continue;
      if (e.geos.length > 1) for (const g of e.geos) g.dispose();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new Mesh(merged, e.mat);
      mesh.name = `lab.static:${e.mat.name || 'mat'}:${key.split('|')[2]}`;
      mesh.castShadow = e.shadow === 'both' || e.shadow === 'cast';
      mesh.receiveShadow = e.shadow === 'both' || e.shadow === 'receive';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}
