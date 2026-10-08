/**
 * Virtual cameras (World Appendix B): every webcam the camera app / OCR / GIMP / Ollama can see.
 * Snapshots are 1280 × 720 (16:9); live streams use the quality preset size/fps (§7.4).
 */
import { deviceConfigFor, probeScreenRect, rackTToWorld, rigToWorld, shelfAdbToWorld, TOUCH_RIGS } from './rigs';
import { RACK_T, SHELF_ADB } from './shelves';
import { bayPartPositions } from './racks';
import type { Vec3 } from './types';

export interface CameraDef {
  readonly id: string;
  readonly kind: 'webcam' | 'mosaic';
  /** 40-simulation §2.11 camera view id (frame model for OCR/GIMP), if any. */
  readonly simViewId: string | null;
  /** Rig(s) in frame. */
  readonly rigs: readonly string[];
  /** World prop of the physical webcam. */
  readonly propId: string | null;
  readonly position?: Vec3;
  readonly lookAt?: Vec3;
  readonly vFovDeg?: number;
  readonly near: number;
  readonly far: number;
  readonly width: 1280;
  readonly height: 720;
  /** Mosaics: tile camera ids in reading order (TL, TR, BL, BR) and grid. */
  readonly tiles?: readonly string[];
  readonly grid?: readonly [number, number];
  readonly note?: string;
}

const BASE = { near: 0.02, far: 6, width: 1280, height: 720 } as const;

function bayWebcam(rigId: string): CameraDef {
  const rig = TOUCH_RIGS.find((r) => r.id === rigId)!;
  const cfg = deviceConfigFor(rig);
  const cam = bayPartPositions(rig.doorSide).webcamCamera!.pos;
  const def: CameraDef = {
    ...BASE,
    id: `cam.${rig.id}`,
    kind: 'webcam',
    simViewId: rig.sim.cameraViewId === 'cam-rackb' ? null : rig.sim.cameraViewId,
    rigs: [rig.id],
    propId: `rig.${rig.id}.webcam`,
    position: rigToWorld(rig, cam),
    lookAt: rigToWorld(rig, cfg.cameraTargetMm),
    vFovDeg: 32,
  };
  if (rig.id !== 'r2-d2') return def;
  const cfd = probeScreenRect(cfg);
  return {
    ...def,
    lookAt: rigToWorld(rig, [cfd.x + cfd.w / 2, 100, cfd.z + cfd.h / 2]),
    note:
      'Solved projection: choose the vertical FOV so the padded `TOTAL $10.83` text rect of the L8 customer-cart screen (padded to 236:44) spans 236 px of 1280, then camera.setViewOffset(1280, 720, …) so its centre lands at (530, 310) — bbox (412, 288, 236, 44) of Orca CFD_TOTAL (±4 px).',
  };
}

export const CAMERAS: readonly CameraDef[] = [
  ...TOUCH_RIGS.map((r) => bayWebcam(r.id)),
  {
    ...BASE,
    id: 'cam.tethered',
    kind: 'webcam',
    simViewId: 'cam-tethered',
    rigs: ['megatron', 'optimus'],
    propId: RACK_T.webcam.id,
    position: rackTToWorld(RACK_T.webcam.camera),
    lookAt: rackTToWorld(RACK_T.webcam.lookAt),
    vFovDeg: RACK_T.webcam.vFovDeg,
    note: 'Sees all four tethered faces as a 2 × 2 (IMG-R). §2.12 says vFOV 46°, Appendix B 40°: 46° chosen so both rows fit.',
  },
  {
    ...BASE,
    id: 'cam.adb',
    kind: 'webcam',
    simViewId: null,
    rigs: ['data', 'tars'],
    propId: SHELF_ADB.webcam.id,
    position: shelfAdbToWorld(SHELF_ADB.webcam.camera),
    lookAt: shelfAdbToWorld(SHELF_ADB.webcam.lookAt),
    vFovDeg: SHELF_ADB.webcam.vFovDeg,
  },
  {
    ...BASE,
    id: 'cam.rack-b-mosaic',
    kind: 'mosaic',
    simViewId: 'cam-rackb',
    rigs: ['johnny-5', 'baymax', 'seti', 'rosie'],
    propId: 'rig.rack-b.camera-pi',
    // Sim frame model (40-simulation §2.11): JOHNNY-5 TL, BAYMAX TR, SETI BL, ROSIE BR.
    tiles: ['cam.johnny-5', 'cam.baymax', 'cam.seti', 'cam.rosie'],
    grid: [2, 2],
    note: '640 × 360 tiles, 1 px black gutters, per-tile tags. Tile order follows the sim frame model (World App. B lists SETI TR / BAYMAX BL).',
  },
  {
    ...BASE,
    id: 'cam.bench-mosaic',
    kind: 'mosaic',
    simViewId: null,
    rigs: ['megatron', 'optimus', 'data', 'tars'],
    propId: 'rig.tethered.pi',
    tiles: ['cam.tethered', 'cam.adb'],
    grid: [2, 1],
    note: '1 × 2 composite: 640 × 360 tiles centred on a black 1280 × 720 frame.',
  },
];

export const CAMERA_BY_ID: Readonly<Record<string, CameraDef>> = Object.fromEntries(CAMERAS.map((c) => [c.id, c]));

/** Stream overlay (every frame): rig tag top-left, game timestamp bottom-right, `● REC` while recording. */
export const STREAM_OVERLAY = {
  tag: { font: '14px', color: '#ffffff', bg: 'rgba(0,0,0,0.5)' },
  timestampFormat: 'YYYY-MM-DD HH:MM:SS',
  rec: '● REC',
  /** De-aimed webcam (`webcam.aimedOk = false`): look-at offset 25° yaw toward the bay wall. */
  deAimYawDeg: 25,
} as const;
