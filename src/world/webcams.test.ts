import { afterEach, describe, expect, it } from 'vitest';
import { findWebcamFeed, getWebcamFeeds } from '@/computer/apps';
import { mutate } from '@/core/store';
import { registerWebcams } from './webcams';

describe('virtual webcams → Camera app feeds (World App. B)', () => {
  let off: (() => void) | null = null;
  afterEach(() => {
    off?.();
    off = null;
  });

  it('serves a full-frame feed per Rack A bay webcam and the Rack B 2 × 2 mosaic in sim frame order', () => {
    off = registerWebcams();
    const walle = findWebcamFeed('http://10.42.10.11:8081/stream.mjpg');
    expect(walle?.cameraId).toBe('cam-wall-e');
    expect(walle?.tiles).toHaveLength(1);
    expect(walle?.tiles[0]).toMatchObject({ x: 0, y: 0, w: 1280, h: 720, rigId: 'wall-e' });

    const rackB = findWebcamFeed('http://10.42.10.40:8081/stream.mjpg');
    expect(rackB?.tiles.map((t) => t.label)).toEqual(['JOHNNY-5', 'BAYMAX', 'SETI', 'ROSIE']);
    for (const t of rackB!.tiles) {
      expect(t.x + t.w).toBeLessThanOrEqual(1280);
      expect(t.y + t.h).toBeLessThanOrEqual(720);
    }
    expect(findWebcamFeed('http://10.42.10.20:8081/stream.mjpg')?.cameraId).toBe('cam-tethered');
  });

  it('keeps R2-D2 (solved CFD projection) and unmodelled cameras on the frame model', () => {
    off = registerWebcams();
    expect(findWebcamFeed('http://10.42.10.14:8081/stream.mjpg')).toBeNull();
    expect(findWebcamFeed('http://10.42.10.50:8081/stream.mjpg')).toBeNull();
    off();
    off = null;
    expect(getWebcamFeeds()).toEqual([]);
  });

  it('turns a de-aimed webcam by its yaw error', () => {
    off = registerWebcams();
    const cam = findWebcamFeed('http://10.42.10.11:8081/stream.mjpg')!.tiles[0]!.camera;
    const before = cam.quaternion.clone();
    mutate((s) => {
      s.lab.rigs['wall-e']!.webcam.aimOffsetDeg = { yaw: 25, pitch: 0 };
    });
    findWebcamFeed('http://10.42.10.11:8081/stream.mjpg');
    expect(cam.quaternion.angleTo(before)).toBeGreaterThan(0.15); // 25° about world up seen from a downward-looking camera
    mutate((s) => {
      s.lab.rigs['wall-e']!.webcam.aimOffsetDeg = { yaw: 0, pitch: 0 };
    });
    findWebcamFeed('http://10.42.10.11:8081/stream.mjpg');
    expect(cam.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });
});
