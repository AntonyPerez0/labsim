/**
 * Camera focus tweens: smoothly move the camera from the player's head to a fixed pose (sitting at
 * the workstation, reading a tablet, inspecting a part) and back. Ease-in-out on position,
 * orientation (slerp) and FOV. While focused the engine disables walking/looking.
 */
import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { CameraPose } from './types';

type State = 'none' | 'in' | 'held' | 'out';

const UP = new Vector3(0, 1, 0);

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export interface HeadPose {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
}

export class CameraFocus {
  private state: State = 'none';
  private t = 0;
  private dur = 0.6;
  private readonly fromPos = new Vector3();
  private readonly fromQuat = new Quaternion();
  private fromFov = 70;
  private readonly toPos = new Vector3();
  private readonly toQuat = new Quaternion();
  private toFov: number | null = null;
  private resolve: (() => void) | null = null;
  private readonly m = new Matrix4();
  private readonly target = new Vector3();

  get active(): boolean {
    return this.state !== 'none';
  }

  /** Focusing in or held (not releasing): the camera stays away from the head. */
  get holding(): boolean {
    return this.state === 'in' || this.state === 'held';
  }

  get settled(): boolean {
    return this.state === 'held';
  }

  focus(camera: PerspectiveCamera, pose: CameraPose, durationMs: number): Promise<void> {
    this.finishPending();
    this.fromPos.copy(camera.position);
    this.fromQuat.copy(camera.quaternion);
    this.fromFov = camera.fov;
    this.toPos.set(pose.position[0], pose.position[1], pose.position[2]);
    this.target.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    if (this.target.distanceToSquared(this.toPos) < 1e-10) this.target.z -= 1;
    this.m.lookAt(this.toPos, this.target, UP);
    this.toQuat.setFromRotationMatrix(this.m);
    this.toFov = pose.fov ?? null;
    this.t = 0;
    this.dur = Math.max(0, durationMs) / 1000;
    this.state = 'in';
    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  release(camera: PerspectiveCamera, durationMs: number): Promise<void> {
    if (this.state === 'none') return Promise.resolve();
    this.finishPending();
    this.fromPos.copy(camera.position);
    this.fromQuat.copy(camera.quaternion);
    this.fromFov = camera.fov;
    this.t = 0;
    this.dur = Math.max(0, durationMs) / 1000;
    this.state = 'out';
    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  /** Immediately drop focus (teleports, resets). */
  cancel(): void {
    this.state = 'none';
    this.finishPending();
  }

  private finishPending(): void {
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  /**
   * Advance and apply to the camera. `head` is the live first-person pose (target of releases).
   * Returns true when the focus system owns the camera this frame.
   */
  update(dt: number, camera: PerspectiveCamera, head: HeadPose): boolean {
    if (this.state === 'none') return false;
    if (this.state === 'held') {
      camera.position.copy(this.toPos);
      camera.quaternion.copy(this.toQuat);
      setFov(camera, this.toFov ?? head.fov);
      return true;
    }
    this.t += dt;
    const k = this.dur > 0 ? Math.min(1, this.t / this.dur) : 1;
    const e = easeInOutCubic(k);
    if (this.state === 'in') {
      camera.position.lerpVectors(this.fromPos, this.toPos, e);
      camera.quaternion.slerpQuaternions(this.fromQuat, this.toQuat, e);
      setFov(camera, this.fromFov + ((this.toFov ?? head.fov) - this.fromFov) * e);
      if (k >= 1) {
        this.state = 'held';
        this.finishPending();
      }
      return true;
    }
    // out
    camera.position.lerpVectors(this.fromPos, head.position, e);
    camera.quaternion.slerpQuaternions(this.fromQuat, head.quaternion, e);
    setFov(camera, this.fromFov + (head.fov - this.fromFov) * e);
    if (k >= 1) {
      this.state = 'none';
      this.finishPending();
      return false;
    }
    return true;
  }
}

function setFov(camera: PerspectiveCamera, fov: number): void {
  if (Math.abs(camera.fov - fov) > 1e-4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
