/**
 * Camera views (Sim §2.11.1): 1280 × 720 MJPEG at 10 fps. Each view maps device-screen mm to frame px
 * linearly: `px = ox + s·x`, `py = oy + s·y` (no perspective [sim]). Off-screen cameras show a
 * placeholder frame except C-3PO inside Rack C's quad.
 */
export interface CameraView {
  deviceId: string;
  display: 'primary' | 'secondary';
  ox: number;
  oy: number;
  s: number;
  /** Overlay tag drawn by the Camera app ("MEGATRON MFD DEV1"). */
  tag: string;
}

export interface CameraDef {
  id: string;
  /** Host serving the stream. */
  hostId: string;
  /** `10.42.10.x` octet. */
  octet: number;
  /** Rig whose own webcam this is (misaim applies), null for shared/quad cameras. */
  rigId: string | null;
  views: CameraView[];
}

export const FRAME_W = 1280;
export const FRAME_H = 720;
/** Webcam aim error → frame offset (Sim §1.15): +6.67 px per degree yaw, +6.25 px per degree pitch. */
export const PX_PER_DEG_YAW = 6.67;
export const PX_PER_DEG_PITCH = 6.25;

const v = (deviceId: string, display: 'primary' | 'secondary', ox: number, oy: number, s: number, tag: string): CameraView => ({ deviceId, display, ox, oy, s, tag });

export const CAMERAS: readonly CameraDef[] = [
  { id: 'cam-wall-e', hostId: 'pi-wall-e', octet: 11, rigId: 'wall-e', views: [v('dev-wall-e-flex3', 'primary', 397, 112, 3.5, 'WALL-E')] },
  { id: 'cam-eve', hostId: 'pi-eve', octet: 12, rigId: 'eve', views: [v('dev-eve-flex4', 'primary', 397, 112, 3.5, 'EVE')] },
  { id: 'cam-bumblebee', hostId: 'pi-bumblebee', octet: 13, rigId: 'bumblebee', views: [v('dev-bumblebee-mini3', 'primary', 296, 145, 4.0, 'BUMBLEBEE')] },
  { id: 'cam-r2-d2', hostId: 'pi-r2-d2', octet: 14, rigId: 'r2-d2', views: [v('dev-r2-d2-duo', 'secondary', 300, 160, 3.947, 'R2-D2 · CFD')] },
  {
    id: 'cam-rackb',
    hostId: 'pi-cam-rackb',
    octet: 40,
    rigId: null,
    views: [
      v('dev-johnny-5-flex1', 'primary', 239, 36, 2.6, 'JOHNNY-5'),
      v('dev-baymax-st2018', 'primary', 712, 40, 1.6, 'BAYMAX'),
      v('dev-seti-compact', 'primary', 239, 396, 2.6, 'SETI'),
      v('dev-rosie-pocket', 'primary', 877, 400, 2.2, 'ROSIE'),
    ],
  },
  {
    id: 'cam-tethered',
    hostId: 'pi-tethered',
    octet: 20,
    rigId: null,
    views: [
      v('dev-megatron-mfd', 'primary', 72, 40, 1.6, 'MEGATRON MFD DEV1'),
      v('dev-optimus-mfd', 'primary', 736, 40, 2.6, 'OPTIMUS MFD STG'),
      v('dev-megatron-cfd', 'primary', 97, 410, 2.9, 'MEGATRON CFD DEV1'),
      v('dev-optimus-cfd', 'primary', 736, 400, 2.6, 'OPTIMUS CFD STG'),
    ],
  },
  { id: 'cam-vision', hostId: 'pi-vision', octet: 50, rigId: 'vision', views: [] },
  { id: 'cam-rackc', hostId: 'pi-cam-rackc', octet: 60, rigId: null, views: [v('dev-c-3po-duo', 'secondary', 940, 420, 1.6, 'C-3PO · CFD')] },
  { id: 'cam-bb-8', hostId: 'pi-bb-8', octet: 61, rigId: null, views: [] },
  { id: 'cam-bender', hostId: 'pi-bender', octet: 63, rigId: 'bender', views: [] },
  { id: 'cam-rackd', hostId: 'pi-marvin', octet: 64, rigId: null, views: [] },
  { id: 'cam-racke', hostId: 'pi-cam-racke', octet: 79, rigId: null, views: [] },
  { id: 'cam-iron-giant', hostId: 'pi-iron-giant', octet: 80, rigId: 'iron-giant', views: [] },
  { id: 'cam-voltron', hostId: 'pi-voltron', octet: 81, rigId: null, views: [] },
  { id: 'cam-kryten', hostId: 'pi-kryten', octet: 83, rigId: 'kryten', views: [] },
  { id: 'cam-mazinger', hostId: 'pi-mazinger', octet: 84, rigId: 'mazinger', views: [] },
  { id: 'cam-dalek', hostId: 'pi-dalek', octet: 87, rigId: 'dalek', views: [] },
  { id: 'cam-number-5', hostId: 'pi-number-5', octet: 88, rigId: 'number-5', views: [] },
  { id: 'cam-westers', hostId: 'pi-gerty', octet: 89, rigId: null, views: [] },
  { id: 'cam-zorg', hostId: 'pi-zorg', octet: 92, rigId: null, views: [] },
];

export const CAMERA_BY_ID: Readonly<Record<string, CameraDef>> = Object.fromEntries(CAMERAS.map((c) => [c.id, c]));

export function cameraUrl(octet: number): string {
  return `http://10.42.10.${octet}:8081/stream.mjpg`;
}

/** Camera serving a stream URL (by host IP), or null. */
export function cameraForUrl(url: string): CameraDef | null {
  const m = /^https?:\/\/([\d.]+)(?::(\d+))?/.exec(url.trim());
  if (!m) return null;
  return CAMERAS.find((c) => `10.42.10.${c.octet}` === m[1]) ?? null;
}

/** Camera covering a rig (its own webcam, or the shared camera of its rack). */
export function cameraIdForOctet(octet: number | null): string | null {
  if (octet == null) return null;
  return CAMERAS.find((c) => c.octet === octet)?.id ?? null;
}
