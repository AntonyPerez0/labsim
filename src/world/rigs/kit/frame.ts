/**
 * `Frame`: a world-space coordinate frame (e.g. a bay, a shelf, a device) in which builders place
 * parts in millimetres. Static parts go into shared world-space batches (merged across all rigs),
 * so the frame carries the matrix that maps its local mm into world metres.
 */
import { Matrix4, Object3D, Vector3, type BufferGeometry, type Material } from 'three';
import { placeMatrix, type Place } from './geom';
import type { MeshBatch } from './batch';

export class Frame {
  constructor(readonly m: Matrix4 = new Matrix4()) {}

  static at(pMm: readonly [number, number, number], rY = 0): Frame {
    return new Frame(placeMatrix({ p: pMm, r: [0, rY, 0] }));
  }

  /** Frame from metres position + Y rotation (radians). */
  static world(pM: readonly [number, number, number], rY = 0): Frame {
    return new Frame(placeMatrix({ p: [pM[0] * 1000, pM[1] * 1000, pM[2] * 1000], r: [0, rY, 0] }));
  }

  /** World matrix of a local placement. */
  matrix(place: Place = {}): Matrix4 {
    return this.m.clone().multiply(placeMatrix(place));
  }

  child(place: Place): Frame {
    return new Frame(this.matrix(place));
  }

  /** Add a geometry placed in this frame to a world-space batch. */
  add(batch: MeshBatch, g: BufferGeometry, mat: Material, place: Place = {}): void {
    batch.add(g, mat, this.matrix(place));
  }

  /** World point (metres) of a local mm point. */
  point(pMm: readonly [number, number, number]): Vector3 {
    return new Vector3(pMm[0] / 1000, pMm[1] / 1000, pMm[2] / 1000).applyMatrix4(this.m);
  }

  /** Apply this frame to an Object3D (sets position/quaternion/scale). */
  applyTo(o: Object3D, place: Place = {}): void {
    this.matrix(place).decompose(o.position, o.quaternion, o.scale);
  }

  /** A new Object3D positioned at a local placement, added to `parent` (parent must be at world identity). */
  anchor(parent: Object3D, place: Place = {}, name = ''): Object3D {
    const o = new Object3D();
    o.name = name;
    this.applyTo(o, place);
    parent.add(o);
    return o;
  }
}
