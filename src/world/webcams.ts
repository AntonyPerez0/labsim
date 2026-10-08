/**
 * Virtual webcams (World Appendix B) → the Camera app's live streams (Apps §8.3).
 *
 * `registerWebcams()` publishes one `WebcamFeed` per sim camera that has a world camera: the four Rack A
 * bay webcams (one full-frame tile each), the Rack B camera Pi (2 × 2 mosaic of its four bay webcams, sim
 * frame-model order TL JOHNNY-5, TR BAYMAX, BL SETI, BR ROSIE) and the tethered bench webcam. Cameras the
 * world does not model keep the Camera app's synthetic frame. The Camera app only uses these for its live
 * view; snapshots, recordings and lesson images stay on the sim frame model (GIMP/OCR measure exact boxes).
 *
 * A de-aimed webcam (`rig.webcam.aimOffsetDeg`) is turned by its yaw/pitch error every time a feed is read.
 */
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { getState } from '@/core/store';
import { registerWebcamProvider, type WebcamFeed, type WebcamTile } from '@/computer/apps';
import { CAMERAS as SIM_CAMERAS, FRAME_H, FRAME_W, cameraUrl } from '@/sim/seed/cameras';
import { CAMERAS, CAMERA_BY_ID, type CameraDef } from './layout/cameras';
import { deviceConfigFor, probeScreenRect, rigToWorld, TOUCH_RIGS } from './layout/rigs';

interface LiveCam {
  def: CameraDef;
  camera: PerspectiveCamera;
  base: Vector3;
  target: Vector3;
  /** Camera "up": a bay webcam is rolled so the device screen reads upright (World App. B). */
  up: Vector3;
}

const tmp = new Vector3();
const up = new Vector3(0, 1, 0);

/** World direction of the probed screen's top edge for a bay webcam (screen y grows toward +z bay-local). */
function screenUp(def: CameraDef): Vector3 {
  const rig = def.rigs.length === 1 ? TOUCH_RIGS.find((r) => r.id === def.rigs[0]) : undefined;
  if (!rig || def.kind !== 'webcam' || def.id !== `cam.${rig.id}`) return up.clone();
  const r = probeScreenRect(deviceConfigFor(rig));
  const top = new Vector3(...rigToWorld(rig, [r.x + r.w / 2, 0, r.z]));
  const bottom = new Vector3(...rigToWorld(rig, [r.x + r.w / 2, 0, r.z + r.h]));
  const v = top.sub(bottom);
  v.y = 0;
  return v.lengthSq() > 1e-9 ? v.normalize() : up.clone();
}

function makeCam(def: CameraDef): LiveCam | null {
  if (!def.position || !def.lookAt) return null;
  const camera = new PerspectiveCamera(def.vFovDeg ?? 32, FRAME_W / FRAME_H, def.near, def.far);
  camera.name = `webcam:${def.id}`;
  const base = new Vector3(...def.position);
  const target = new Vector3(...def.lookAt);
  const camUp = screenUp(def);
  camera.up.copy(camUp);
  camera.position.copy(base);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return { def, camera, base, target, up: camUp };
}

/** Re-aim the camera with the rig's webcam aim error (degrees; positive yaw turns left, positive pitch up). */
function aim(cam: LiveCam): void {
  const rigId = cam.def.rigs.length === 1 ? cam.def.rigs[0]! : null;
  const off = rigId ? getState().lab.rigs[rigId]?.webcam?.aimOffsetDeg : undefined;
  const yaw = MathUtils.degToRad(off?.yaw ?? 0);
  const pitch = MathUtils.degToRad(off?.pitch ?? 0);
  tmp.copy(cam.target).sub(cam.base);
  if (yaw) tmp.applyAxisAngle(up, yaw);
  if (pitch) {
    const side = new Vector3().crossVectors(tmp, up).normalize();
    if (side.lengthSq() > 0) tmp.applyAxisAngle(side, pitch);
  }
  cam.camera.position.copy(cam.base);
  cam.camera.lookAt(tmp.add(cam.base));
  cam.camera.updateMatrixWorld(true);
}

function label(def: CameraDef): string {
  return def.rigs.map((r) => r.toUpperCase()).join(' · ');
}

/**
 * R2-D2's webcam frames the Duo's CFD for the CFD_TOTAL OCR/GIMP lessons with a "solved projection"
 * (World App. B) that the 3D camera does not implement; its stream stays on the sim frame model so the
 * live view matches the snapshots measured in GIMP.
 */
const FRAME_MODEL_ONLY = new Set(['cam-r2-d2']);

let feedsCache: { feeds: WebcamFeed[]; cams: LiveCam[] } | null = null;

function build(): { feeds: WebcamFeed[]; cams: LiveCam[] } {
  const cams = new Map<string, LiveCam>();
  const camOf = (id: string): LiveCam | null => {
    if (cams.has(id)) return cams.get(id)!;
    const def = CAMERA_BY_ID[id];
    const c = def && def.kind === 'webcam' ? makeCam(def) : null;
    if (c) cams.set(id, c);
    return c;
  };
  const feeds: WebcamFeed[] = [];
  for (const sc of SIM_CAMERAS) {
    if (FRAME_MODEL_ONLY.has(sc.id)) continue;
    const def = CAMERAS.find((c) => c.simViewId === sc.id);
    if (!def) continue;
    const tiles: WebcamTile[] = [];
    if (def.kind === 'webcam') {
      const c = camOf(def.id);
      if (c) tiles.push({ rigId: def.rigs.length === 1 ? def.rigs[0]! : null, label: `${label(def)} · 10.42.10.${sc.octet}`, camera: c.camera, x: 0, y: 0, w: FRAME_W, h: FRAME_H });
    } else if (def.tiles && def.grid) {
      const [cols, rows] = def.grid;
      const tw = Math.floor((FRAME_W - (cols - 1)) / cols);
      const th = Math.floor((FRAME_H - (rows - 1)) / rows);
      def.tiles.forEach((tileId, i) => {
        const c = camOf(tileId);
        if (!c) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        tiles.push({ rigId: c.def.rigs[0] ?? null, label: label(c.def), camera: c.camera, x: col * (tw + 1), y: row * (th + 1), w: tw, h: th });
      });
    }
    if (tiles.length) feeds.push({ cameraId: sc.id, url: cameraUrl(sc.octet), hostId: sc.hostId, label: label(def), tiles });
  }
  return { feeds, cams: [...cams.values()] };
}

/** Register the world's webcams with the Camera app. Returns the unregister function. */
export function registerWebcams(): () => void {
  feedsCache = build();
  registerWebcamProvider({
    feeds() {
      const f = feedsCache ?? (feedsCache = build());
      for (const c of f.cams) aim(c);
      return f.feeds;
    },
  });
  return () => {
    registerWebcamProvider(null);
    feedsCache = null;
  };
}
