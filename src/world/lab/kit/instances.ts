/**
 * Static instancing for repeated small parts (World §10.3): button-head screws, hex lugs, stack
 * bins, organiser drawers, filament spools … Builders call `ctx.inst.add(kind, matrix)`; `buildLab`
 * turns every kind into ONE `InstancedMesh` at the end.
 */
import { InstancedMesh, Matrix4, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, xf } from './batch';
import { cylGeo, sphereGeo, boxGeo } from './shapes';

interface Kind {
  geo: () => BufferGeometry;
  mat: Material;
  matrices: Matrix4[];
  shadow: boolean;
}

export class InstanceSet {
  private kinds = new Map<string, Kind>();
  readonly meshes: InstancedMesh[] = [];

  define(name: string, geo: () => BufferGeometry, mat: Material, shadow = false): void {
    if (!this.kinds.has(name)) this.kinds.set(name, { geo, mat, matrices: [], shadow });
  }

  has(name: string): boolean {
    return this.kinds.has(name);
  }

  add(name: string, m: Matrix4): void {
    const k = this.kinds.get(name);
    if (!k) throw new Error(`instance kind ${name} not defined`);
    k.matrices.push(m.clone());
  }

  build(parent: Object3D): void {
    for (const [name, k] of this.kinds) {
      if (!k.matrices.length) continue;
      const im = new InstancedMesh(k.geo(), k.mat, k.matrices.length);
      im.name = `lab.inst:${name}`;
      k.matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = k.shadow;
      im.receiveShadow = k.shadow;
      im.computeBoundingSphere();
      parent.add(im);
      this.meshes.push(im);
    }
  }
}

/** Button-head screw (Ø 7 × 2.2 mm dome + hex socket), axis = local +Y; place with the head on a face. */
export function screwHeadGeo(): BufferGeometry {
  const head = sphereGeo(0.0035, 10, 5);
  head.scale(1, 0.6, 1);
  const parts = [prepGeometry(head, null), prepGeometry(cylGeo(0.0036, 0.0036, 0.0006, 10), xf(0, 0.0003, 0))];
  return mergeGeometries(parts, false)!;
}

/** Hex nut/lug 8 mm across flats, 4 mm tall, axis +Y. */
export function hexNutGeo(): BufferGeometry {
  return cylGeo(0.0046, 0.0046, 0.004, 6);
}

/** Small cube helper (scaled per instance). */
export function unitBoxGeo(): BufferGeometry {
  return boxGeo(1, 1, 1);
}
