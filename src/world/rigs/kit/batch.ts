/**
 * `MeshBatch`: collect many small parts (geometry + material + placement) and merge them into ONE
 * mesh per material — the static-merge strategy of World §10.3 (rack frames, shelves, fascias,
 * cradles, towers …) and the per-material merge inside moving groups (beam carriage, arm carriage,
 * dip arm, …). Placements are millimetres in the batch's frame.
 */
import { BufferAttribute, BufferGeometry, FrontSide, Matrix4, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { placeMatrix, prepForMerge, type Place } from './geom';

export interface BatchBuildOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
  /** Per-material overrides (e.g. LED-ish or transparent parts that must not cast). */
  noShadowMaterials?: ReadonlySet<Material>;
}

/**
 * Draw-call collapse: plain (untextured, opaque, front-sided, non-emissive) standard materials are
 * merged into two shared vertex-coloured materials — plastic (metalness 0) and metal (metalness 1)
 * — so a moving group or a whole zone costs ~4 draws instead of one per colour.
 */
const VC_PLASTIC = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
VC_PLASTIC.name = 'vcPlastic';
const VC_METAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1 });
VC_METAL.name = 'vcMetal';
const VC_GLOSS = new MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0 });
VC_GLOSS.name = 'vcGloss';

function collapsible(m: Material): 'plastic' | 'metal' | 'gloss' | null {
  const s = m as MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return null;
  if (s.map || s.alphaMap || s.normalMap || s.emissiveMap || s.roughnessMap || s.transparent || s.alphaTest > 0 || s.side !== FrontSide || s.vertexColors) return null;
  if (s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b) * s.emissiveIntensity > 0.001) return null;
  if (m.userData?.boxTile || m.onBeforeCompile !== Material_noop) return null;
  return s.metalness > 0.5 ? 'metal' : s.roughness < 0.25 ? 'gloss' : 'plastic';
}
const Material_noop = new MeshStandardMaterial().onBeforeCompile;

function withColor(g: BufferGeometry, m: MeshStandardMaterial): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = m.color.r;
    c[i * 3 + 1] = m.color.g;
    c[i * 3 + 2] = m.color.b;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

export class MeshBatch {
  private readonly parts = new Map<Material, BufferGeometry[]>();
  private tris = 0;

  /** Add a geometry placed with a mm placement (or a ready metre matrix). The geometry is not modified. */
  add(geometry: BufferGeometry, material: Material, place?: Place | Matrix4): this {
    const g = prepForMerge(geometry);
    const m = place instanceof Matrix4 ? place : placeMatrix(place);
    g.applyMatrix4(m);
    let list = this.parts.get(material);
    if (!list) {
      list = [];
      this.parts.set(material, list);
    }
    list.push(g);
    this.tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    return this;
  }

  /** Merge another batch's parts into this one, transformed by `m`. */
  absorb(other: MeshBatch, m?: Matrix4): this {
    for (const [mat, list] of other.parts) {
      for (const g of list) {
        const c = g.clone();
        if (m) c.applyMatrix4(m);
        let dst = this.parts.get(mat);
        if (!dst) {
          dst = [];
          this.parts.set(mat, dst);
        }
        dst.push(c);
      }
    }
    this.tris += other.tris;
    return this;
  }

  get triangleCount(): number {
    return Math.round(this.tris);
  }

  get isEmpty(): boolean {
    return this.parts.size === 0;
  }

  /** Merge per material, add the meshes to `parent`, dispose the source parts. */
  build(parent: Object3D, opts: BatchBuildOptions = {}): Mesh[] {
    const out: Mesh[] = [];
    // collapse plain materials into the two vertex-coloured buckets
    const buckets = new Map<Material, BufferGeometry[]>();
    for (const [mat, list] of [...this.parts]) {
      if (opts.noShadowMaterials?.has(mat)) continue;
      const kind = collapsible(mat);
      if (!kind) continue;
      const target = kind === 'metal' ? VC_METAL : kind === 'gloss' ? VC_GLOSS : VC_PLASTIC;
      let dst = buckets.get(target);
      if (!dst) {
        dst = [];
        buckets.set(target, dst);
      }
      for (const g of list) dst.push(withColor(g, mat as MeshStandardMaterial));
      this.parts.delete(mat);
    }
    for (const [mat, list] of buckets) this.parts.set(mat, list);
    for (const [mat, list] of this.parts) {
      if (list.length === 0) continue;
      const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
      if (!merged) continue;
      if (list.length > 1) for (const g of list) g.dispose();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new Mesh(merged, mat);
      mesh.name = `${opts.name ?? 'batch'}:${mat.name || 'mat'}`;
      const noShadow = opts.noShadowMaterials?.has(mat) ?? false;
      mesh.castShadow = !noShadow && (opts.castShadow ?? false);
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}
