import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CameraFocus, type HeadPose } from './focus';

function setup() {
  const cam = new PerspectiveCamera(70, 1, 0.1, 100);
  cam.position.set(0, 1.65, 0);
  const head: HeadPose = { position: new Vector3(0, 1.65, 0), quaternion: new Quaternion(), fov: 70 };
  return { cam, head, f: new CameraFocus() };
}

function step(f: CameraFocus, cam: PerspectiveCamera, head: HeadPose, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) {
    if (!f.update(dt, cam, head)) {
      cam.position.copy(head.position);
      cam.quaternion.copy(head.quaternion);
      cam.fov = head.fov;
    }
  }
}

const pose = { position: [1, 1.2, -1] as [number, number, number], lookAt: [1, 1, -2] as [number, number, number], fov: 50 };

describe('CameraFocus', () => {
  it('tweens to the pose, holds it, and releases back to the head', async () => {
    const { cam, head, f } = setup();
    let focused = false;
    void f.focus(cam, pose, 500).then(() => (focused = true));
    step(f, cam, head, 0.6);
    await Promise.resolve();
    expect(focused).toBe(true);
    expect(f.holding).toBe(true);
    expect(cam.position.distanceTo(new Vector3(1, 1.2, -1))).toBeLessThan(1e-6);
    expect(cam.fov).toBeCloseTo(50, 5);
    let released = false;
    void f.release(cam, 300).then(() => (released = true));
    expect(f.holding).toBe(false);
    expect(f.active).toBe(true);
    step(f, cam, head, 0.4);
    await Promise.resolve();
    expect(released).toBe(true);
    expect(f.active).toBe(false);
    expect(cam.position.distanceTo(head.position)).toBeLessThan(1e-6);
  });

  it('focus() during a release tween wins and every promise settles', async () => {
    const { cam, head, f } = setup();
    const settled: string[] = [];
    void f.focus(cam, pose, 400).then(() => settled.push('focus1'));
    step(f, cam, head, 0.5);
    void f.release(cam, 600).then(() => settled.push('release'));
    step(f, cam, head, 0.2); // mid-release
    void f.focus(cam, pose, 400).then(() => settled.push('focus2'));
    await Promise.resolve();
    expect(settled).toEqual(['focus1', 'release']);
    step(f, cam, head, 0.5);
    await Promise.resolve();
    expect(settled).toEqual(['focus1', 'release', 'focus2']);
    expect(f.holding).toBe(true);
    // stays at the pose while held
    step(f, cam, head, 0.5);
    expect(cam.position.distanceTo(new Vector3(1, 1.2, -1))).toBeLessThan(1e-6);
  });

  it('release() while not focused resolves immediately; zero-length tweens snap', async () => {
    const { cam, head, f } = setup();
    await f.release(cam, 300);
    const p = f.focus(cam, pose, 0);
    step(f, cam, head, 1 / 60);
    await p;
    expect(cam.fov).toBeCloseTo(50, 5);
  });
});
