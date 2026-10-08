/**
 * Corridor portal culling (World §10.4): while the camera is in the corridor, only what can be
 * seen through the lab door is drawn — through the 0.1 × 0.8 m vision panel when the door is shut,
 * through the doorway when it is open. Everything else of the lab and the rigs is moved to a layer
 * no camera renders (layers, not `visible`, so builder code that toggles visibility is untouched);
 * it is restored the moment the camera is back inside or the portal opens wider.
 *
 * Cheap: runs only while the camera is south of the door plane and has moved (or the door has).
 */
import { Group, Sphere, Vector3, type Object3D } from 'three';
import type { Engine } from '@/engine/types';
import { DOOR, ROOM } from './layout';

const CULL_LAYER = 30;
/** The interior face of the south wall (the door plane). */
const DOOR_Z = ROOM.interior.maxZ;

interface Item {
  obj: Object3D;
  local: Sphere;
}

export class PortalCuller {
  private items: Item[] = [];
  private culled = new Set<Object3D>();
  private readonly cam = new Vector3();
  private readonly lastCam = new Vector3(1e9, 0, 0);
  private lastDoor = NaN;
  private readonly corners = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private readonly planes: { n: Vector3; d: number }[] = Array.from({ length: 4 }, () => ({ n: new Vector3(), d: 0 }));
  private readonly s = new Sphere();
  private readonly e1 = new Vector3();
  private readonly e2 = new Vector3();
  /** Meshes hidden by the last evaluation (debug). */
  hidden = 0;

  constructor(
    private readonly engine: Engine,
    roots: Object3D[],
    /** Door leaf group (vision panel lives in its local frame) and the hinge pivot. */
    private readonly leaf: Object3D | null,
    private readonly pivot: Object3D | null,
  ) {
    for (const r of roots) {
      r.updateWorldMatrix(true, true);
      r.traverse((o) => {
        const m = o as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; geometry?: { boundingSphere: Sphere | null; computeBoundingSphere(): void } };
        if (!(m.isMesh || m.isLine || m.isPoints) || !m.geometry) return;
        // the door leaf and anything moving with it always stays
        for (let p: Object3D | null = o; p; p = p.parent) if (p === pivot) return;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const local = m.geometry.boundingSphere?.clone();
        if (!local) return;
        // instanced meshes: their own (instance-aware) sphere
        const im = o as Object3D & { isInstancedMesh?: boolean; boundingSphere?: Sphere | null; computeBoundingSphere?: () => void };
        if (im.isInstancedMesh) {
          if (!im.boundingSphere) im.computeBoundingSphere?.();
          if (im.boundingSphere) local.copy(im.boundingSphere);
        }
        this.items.push({ obj: o, local });
      });
    }
  }

  private doorAngle(): number {
    return this.pivot ? Math.abs(this.pivot.rotation.y) : 0;
  }

  /** Portal rectangle corners in world space (counter-clockwise seen from the corridor). */
  private portal(open: boolean): void {
    const c = this.corners;
    if (open || !this.leaf) {
      const o = DOOR.opening;
      c[0].set(o.minX, 0, DOOR_Z);
      c[1].set(o.maxX, 0, DOOR_Z);
      c[2].set(o.maxX, o.height, DOOR_Z);
      c[3].set(o.minX, o.height, DOOR_Z);
      return;
    }
    const vp = DOOR.visionPanel;
    const x0 = -DOOR.leaf.w + vp.latchSideOffsetM;
    const x1 = x0 + vp.w;
    c[0].set(x0, vp.minY, 0);
    c[1].set(x1, vp.minY, 0);
    c[2].set(x1, vp.maxY, 0);
    c[3].set(x0, vp.maxY, 0);
    this.leaf.updateWorldMatrix(true, false);
    for (const p of c) p.applyMatrix4(this.leaf.matrixWorld);
  }

  update(): void {
    this.engine.camera.getWorldPosition(this.cam);
    const inCorridor = this.cam.z > DOOR_Z + 0.02;
    const ang = this.doorAngle();
    if (!inCorridor || ang > 0.35) {
      // inside, or the door is open wide enough that most of the lab is visible
      if (this.culled.size) this.restore();
      this.lastCam.set(1e9, 0, 0);
      return;
    }
    if (this.cam.distanceToSquared(this.lastCam) < 1e-4 && Math.abs(ang - this.lastDoor) < 1e-3) return;
    this.lastCam.copy(this.cam);
    this.lastDoor = ang;
    this.portal(ang > 0.02);
    // side planes through the camera and each portal edge; normals point into the portal frustum
    const centre = this.e2.set(0, 0, 0);
    for (const p of this.corners) centre.add(p);
    centre.multiplyScalar(0.25);
    for (let i = 0; i < 4; i++) {
      const a = this.corners[i]!;
      const b = this.corners[(i + 1) % 4]!;
      const pl = this.planes[i]!;
      pl.n.subVectors(a, this.cam).cross(this.e1.subVectors(b, this.cam)).normalize();
      pl.d = -pl.n.dot(this.cam);
      if (pl.n.dot(centre) + pl.d < 0) {
        pl.n.negate();
        pl.d = -pl.d;
      }
    }
    let hidden = 0;
    for (const it of this.items) {
      const o = it.obj;
      const s = this.s.copy(it.local).applyMatrix4(o.matrixWorld);
      // on the corridor side of the door plane (or straddling it): keep
      let keep = s.center.z + s.radius > DOOR_Z - 0.02;
      if (!keep) {
        keep = true;
        for (const pl of this.planes) {
          if (pl.n.dot(s.center) + pl.d < -s.radius) {
            keep = false;
            break;
          }
        }
      }
      if (keep) {
        if (this.culled.has(o)) {
          o.layers.set(0);
          this.culled.delete(o);
        }
      } else if (!this.culled.has(o)) {
        // only meshes on the default layer (cross-rig instancing parks its sources on 31)
        if (o.layers.mask !== 1) continue;
        o.layers.set(CULL_LAYER);
        this.culled.add(o);
        hidden++;
      } else hidden++;
    }
    this.hidden = hidden;
  }

  restore(): void {
    for (const o of this.culled) o.layers.set(0);
    this.culled.clear();
    this.hidden = 0;
  }

  dispose(): void {
    this.restore();
    this.items = [];
  }
}

/** Find the lab door leaf / pivot by name and install the culler on the engine's frame loop. */
export function installPortalCulling(engine: Engine): { culler: PortalCuller; off: () => void } {
  const scene = engine.scene;
  const roots = scene.children.filter((c) => c.name === 'lab' || c.name === 'world-rigs');
  const pivot = scene.getObjectByName('door.lab.pivot') ?? null;
  const leaf = scene.getObjectByName('door.lab.leaf') ?? null;
  const culler = new PortalCuller(engine, roots.length ? roots : [new Group()], leaf, pivot);
  const offFrame = engine.onFrame(() => culler.update());
  return {
    culler,
    off: () => {
      offFrame();
      culler.dispose();
    },
  };
}
