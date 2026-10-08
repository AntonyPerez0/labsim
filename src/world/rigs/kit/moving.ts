/**
 * `Moving`: a moving part group (beam carriage, arm carriage, dip arm, side door …) whose static
 * sub-parts are merged per material inside the group (World §10.3 "Moving groups"). Parts are
 * placed in the group's local millimetres; the group itself is positioned by the binder.
 */
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, type BufferGeometry, type Material, type Object3D } from 'three';
import { MeshBatch } from './batch';
import { MM, placeMatrix, type Place } from './geom';

export class Moving {
  readonly group = new Group();
  readonly batch = new MeshBatch();
  built = false;
  /** The merged per-material meshes created by `build()` (cross-rig instancing reads them). */
  meshes: Mesh[] = [];

  constructor(
    name: string,
    parent: Object3D,
    readonly castShadow = false,
  ) {
    this.group.name = name;
    parent.add(this.group);
  }

  add(g: BufferGeometry, mat: Material, place: Place | Matrix4 = {}): this {
    this.batch.add(g, mat, place);
    return this;
  }

  /** Child moving part (nested group, e.g. the arm carriage inside the beam carriage). */
  child(name: string, castShadow = this.castShadow): Moving {
    return new Moving(name, this.group, castShadow);
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.meshes = this.batch.build(this.group, { castShadow: this.castShadow, receiveShadow: true, name: this.group.name });
  }
}

const HIT_MAT = new MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
HIT_MAT.visible = false;
HIT_MAT.name = 'hitProxy';
const UNIT_BOX = new BoxGeometry(1, 1, 1);

/**
 * Invisible raycast proxy (material.visible = false so the engine still raycasts it): a box of
 * w × h × d mm at a placement (mm) inside `parent`.
 */
export function hitBox(parent: Object3D, wMm: number, hMm: number, dMm: number, place: Place | Matrix4 = {}, name = 'hit'): Mesh {
  const mesh = new Mesh(UNIT_BOX, HIT_MAT);
  mesh.name = name;
  const m = place instanceof Matrix4 ? place : placeMatrix(place);
  m.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.scale.set(Math.max(1, wMm) * MM * mesh.scale.x, Math.max(1, hMm) * MM * mesh.scale.y, Math.max(1, dMm) * MM * mesh.scale.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

/** Debug: show every proxy (window.__rigs.showHits()). */
export function setHitProxiesVisible(v: boolean): void {
  HIT_MAT.visible = v;
}
