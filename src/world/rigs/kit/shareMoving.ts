/**
 * Cross-rig instancing of moving parts (World §10.3 draw-call budget). Every touch rig builds the
 * same moving sub-assemblies (beam carriage, arm carriage, plunger, dip arm, tap paddle, phone
 * sled, side door …), each merged per material — ~23 draw calls per bay, ~180 for the 8 rigs.
 * Parts with identical geometry + material are drawn as ONE `InstancedMesh`; the original meshes
 * stay in the scene graph (so their parents keep animating and their world matrices stay current)
 * but are moved to a layer no camera renders, and each frame the instance matrices are copied from
 * them. An instance collapses to zero scale while its source (or any ancestor) is hidden.
 */
import { InstancedMesh, Matrix4, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';

/** Layer no camera / shadow camera / raycaster enables. */
const HIDDEN_LAYER = 31;
const ZERO = new Matrix4().makeScale(0, 0, 0);

function geometryKey(g: BufferGeometry): string {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const col = g.getAttribute('color');
  const idx = g.index;
  let h = 0;
  const mix = (arr: ArrayLike<number> | undefined, w: number) => {
    if (!arr) return;
    // full pass: every value contributes with a position-dependent weight
    for (let i = 0; i < arr.length; i++) h = (h + arr[i]! * (((i * 7919) % 104729) + w)) % 1e12;
  };
  mix(pos?.array as ArrayLike<number> | undefined, 1);
  mix(nrm?.array as ArrayLike<number> | undefined, 3);
  mix(uv?.array as ArrayLike<number> | undefined, 5);
  mix(col?.array as ArrayLike<number> | undefined, 7);
  mix(idx?.array as ArrayLike<number> | undefined, 11);
  return `${pos?.count ?? 0}|${idx?.count ?? -1}|${!!uv}|${!!col}|${h.toFixed(3)}`;
}

function shown(o: Object3D): boolean {
  for (let p: Object3D | null = o.parent; p; p = p.parent) if (!p.visible) return false;
  return true;
}

interface Slot {
  im: InstancedMesh;
  sources: Mesh[];
  /** Last uploaded matrix per instance (to skip unchanged uploads). */
  last: Float64Array;
}

export class MovingInstancer {
  private slots: Slot[] = [];
  /** Draw calls saved (meshes replaced − instanced meshes created). */
  saved = 0;

  /**
   * Group `meshes` (the merged per-material meshes of every moving part) by material + geometry
   * and instance every group with at least `minCopies` members into `parent` (world-identity).
   */
  build(meshes: readonly Mesh[], parent: Object3D, minCopies = 2): void {
    const groups = new Map<string, Mesh[]>();
    for (const m of meshes) {
      if ((m as { isInstancedMesh?: boolean }).isInstancedMesh || Array.isArray(m.material)) continue;
      const key = `${(m.material as Material).uuid}|${geometryKey(m.geometry)}|${m.castShadow}|${m.receiveShadow}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(m);
    }
    for (const list of groups.values()) {
      if (list.length < minCopies) continue;
      const first = list[0]!;
      const im = new InstancedMesh(first.geometry, first.material as Material, list.length);
      im.name = `moving-inst:${first.name}`;
      im.castShadow = first.castShadow;
      im.receiveShadow = first.receiveShadow;
      im.matrixAutoUpdate = false;
      for (const m of list) m.layers.set(HIDDEN_LAYER);
      parent.add(im);
      this.slots.push({ im, sources: list, last: new Float64Array(list.length * 16).fill(NaN) });
      this.saved += list.length - 1;
    }
    this.update(true);
    for (const s of this.slots) {
      s.im.computeBoundingSphere();
      // parts travel inside their bays (≤ ~0.35 m); keep the culling sphere conservative
      if (s.im.boundingSphere) s.im.boundingSphere.radius += 0.4;
    }
  }

  /** Copy world matrices of the sources into the instances (call after `updateMatrixWorld`). */
  update(force = false): void {
    for (const s of this.slots) {
      let dirty = false;
      for (let i = 0; i < s.sources.length; i++) {
        const src = s.sources[i]!;
        const m = src.visible && shown(src) ? src.matrixWorld : ZERO;
        const e = m.elements;
        const o = i * 16;
        let same = !force;
        if (same) {
          for (let k = 0; k < 16; k++) {
            if (s.last[o + k] !== e[k]) {
              same = false;
              break;
            }
          }
        }
        if (same) continue;
        for (let k = 0; k < 16; k++) s.last[o + k] = e[k]!;
        s.im.setMatrixAt(i, m);
        dirty = true;
      }
      if (dirty) s.im.instanceMatrix.needsUpdate = true;
    }
  }

  get instancedMeshes(): number {
    return this.slots.length;
  }

  dispose(): void {
    for (const s of this.slots) {
      s.im.removeFromParent();
      s.im.dispose();
      for (const m of s.sources) m.layers.set(0);
    }
    this.slots = [];
  }
}
