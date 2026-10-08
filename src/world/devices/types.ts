/**
 * LabSim device model contract (World §3.3). A device is built in its own local frame:
 *   origin = centre of the PRIMARY screen's active area, on the glass top surface;
 *   +X = screen right, +Y = screen top edge, +Z = out of the screen (face normal); millimetres.
 * Static geometry is written into a caller-supplied world-space `MeshBatch` (merged with every
 * other static part of the same material), the live screen planes are returned as meshes.
 *
 * `rest` places the device naturally on a surface: device-local → "rest frame" (origin = centre of
 * the footprint on the surface, +Y up, +Z toward the viewer). Callers that stand a device on a
 * shelf compose `surfaceFrame × rest`.
 */
import type { Matrix4, Mesh, Object3D } from 'three';
import type { DeviceTypeCode } from '@/sim/types';
import type { RigKit } from '../rigs/kit/context';
import type { MeshBatch } from '../rigs/kit/batch';

export type DeviceArrangement =
  /** Touch-rig cradles/trays: face-up handled by the caller's frame (Duo: CFD in front of the MFD). */
  | 'tray'
  /** Upright on its own stand/base (library, ADB shelf, desks). */
  | 'stand'
  /** Display head only, no stand/base (tethered panel faces, Station 2018 in its tray). */
  | 'head';

export interface DeviceBuildOptions {
  kit: RigKit;
  /** World matrix of the device local frame (device-local mm → world m). */
  frame: Matrix4;
  /** Batch receiving the static geometry (default `kit.stat`). */
  batch?: MeshBatch;
  /** Batch for small non-shadow details (default `kit.statNoShadow`). */
  detail?: MeshBatch;
  /** Parent for the screen meshes (must be at world identity). */
  screenParent: Object3D;
  arrangement: DeviceArrangement;
  /** Label tape on the bottom bezel (e.g. `FLEX 3`); null = none. */
  tape?: string | null;
  /** Serial sticker text (`SIM-…`). */
  serial?: string | null;
  /** Bezel logo override (tethered faces). */
  logo?: 'wordmark' | 'leaf' | 'none';
  /** Wedge depth cap (mm) when docked face-up above a shelf. */
  maxBodyDepthMm?: number;
  /** Skip the chip-slot light pipe. */
  lightPipe?: boolean;
}

export interface ScreenSlot {
  readonly display: 'primary' | 'secondary';
  /** The canvas plane (hidden while the display is off). */
  readonly mesh: Mesh;
  readonly wMm: number;
  readonly hMm: number;
  /** Screen-centre position in device-local mm. */
  readonly centreMm: readonly [number, number, number];
  /** Unit normal and up (screen +Y) in device-local space. */
  readonly normal: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}

export interface DeviceAnchors {
  /** Centre of the chip-slot opening on the bottom edge face (of the card-reading head). */
  chipSlot: readonly [number, number, number];
  /** Right-edge power key. */
  powerKey: readonly [number, number, number] | null;
  /** NFC landmark on the face. */
  nfc: readonly [number, number, number] | null;
  /** Receipt paper exit (slot centre) and its outward direction / the paper face normal. */
  paper: { pos: readonly [number, number, number]; dir: readonly [number, number, number]; normal: readonly [number, number, number] } | null;
  /** Body bounds (device-local mm). */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface DeviceHandle {
  readonly type: DeviceTypeCode;
  readonly screens: ScreenSlot[];
  readonly anchors: DeviceAnchors;
  /** Device-local → rest frame (see header). Metres matrix on mm placements (like `Frame`). */
  readonly rest: Matrix4;
}
