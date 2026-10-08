/**
 * Named camera views for the integrated world sandbox (sandbox-world.html): one per location
 * anchor (stand at the anchor, look at what is there) plus the photo viewpoints (IMG-*) and the
 * close-ups used for visual review.
 */
import { LOCATIONS } from './layout';

export type V3 = [number, number, number];
export interface ViewDef {
  pos: V3;
  look: V3;
  fov?: number;
}

/** What each location anchor looks at (eye goes 1.65 m above the anchor, a step back). */
const LOCATION_LOOK: Record<string, { look: V3; back?: [number, number] }> = {
  'loc.corridor': { look: [5.9, 1.25, 5.0], back: [0, 0.6] },
  'loc.entrance': { look: [-1.0, 1.2, -1.8] },
  'loc.workstation': { look: [1.1, 0.95, 4.8], back: [0, -0.35] },
  'loc.morgan-desk': { look: [-0.9, 0.95, 4.8], back: [0, -0.35] },
  'loc.coworker-desks': { look: [-5.2, 0.9, 4.8], back: [0, -0.6] },
  'loc.rack-a': { look: [-2.6, 1.1, -2.1], back: [0, 0.35] },
  'loc.callus-shelf': { look: [-2.0, 1.0, -2.1], back: [0, 0.5] },
  'loc.rack-b': { look: [-1.4, 1.1, -2.1], back: [0, 0.35] },
  'loc.rear-aisle': { look: [-2.0, 1.0, -2.1], back: [0, -0.2] },
  'loc.adb-shelf': { look: [0.85, 0.85, -1.9], back: [0, 0.35] },
  'loc.rack-tethered': { look: [2.4, 1.15, -2.05], back: [0, 0.35] },
  'loc.power-wall': { look: [-0.7, 1.5, -4.98], back: [0, 0.4] },
  'loc.server-shelf': { look: [-3.7, 1.0, -4.8], back: [0, 0.4] },
  'loc.print-corner': { look: [-5.75, 1.0, -4.8], back: [0, 0.4] },
  'loc.jared-bench': { look: [2.7, 1.0, -4.8], back: [0, 0.4] },
  'loc.husky': { look: [4.8, 0.7, -4.9], back: [0, 0.3] },
  'loc.storage': { look: [6.42, 1.0, -4.9], back: [-0.2, 0.4] },
  'loc.whiteboard': { look: [-7.0, 1.4, -1.8], back: [0.5, 0] },
  'loc.build-table': { look: [-4.4, 0.9, 0.6], back: [0, 0.4] },
  'loc.device-library': { look: [7.0, 1.2, 0.3], back: [-0.4, 0] },
  'loc.coffee': { look: [7.0, 1.0, 3.35], back: [-0.4, 0] },
  'loc.history-wall': { look: [3.75, 1.5, 5.0], back: [0, -0.4] },
};

export function locationView(id: string): ViewDef | null {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) return null;
  const spec = LOCATION_LOOK[id] ?? { look: [0, 1.2, 0] as V3 };
  const b = spec.back ?? [0, 0];
  return { pos: [l.center[0] + b[0], 1.65, l.center[2] + b[1]], look: spec.look };
}

/** Photo viewpoints and close-ups (eye position → look-at, optional fov). */
export const VIEWS: Record<string, ViewDef> = {
  // photos (docs/reference/images)
  'img-t': { pos: [-2.6, 1.6, -1.1], look: [-2.6, 1.56, -1.64], fov: 62 },
  'img-g': { pos: [-3.22, 1.66, -1.72], look: [-2.62, 1.56, -2.12], fov: 62 },
  'img-r': { pos: [2.55, 1.3, -0.75], look: [2.4, 1.1, -2.1], fov: 43 },
  vid: { pos: [-2.98, 1.64, -1.86], look: [-2.6, 1.535, -1.93], fov: 38 },
  // overviews
  'entrance-wide': { pos: [6.3, 1.7, 4.5], look: [-2.0, 1.1, -3.0] },
  overview: { pos: [6.6, 2.8, 4.7], look: [-2.0, 0.4, -2.5] },
  'overview-west': { pos: [-6.6, 2.8, 4.6], look: [1.5, 0.4, -2.5] },
  'rack-row': { pos: [-0.5, 1.7, 1.6], look: [-2.0, 1.2, -2.5] },
  ceiling: { pos: [0, 1.6, 2.5], look: [0, 2.9, -2.0] },
  // close-ups
  'rack-a': { pos: [-2.6, 1.3, 0.4], look: [-2.6, 1.0, -2.1], fov: 60 },
  'rack-b': { pos: [-1.4, 1.3, 0.4], look: [-1.4, 1.0, -2.1], fov: 60 },
  rear: { pos: [-2.0, 1.4, -3.9], look: [-2.0, 1.0, -2.1], fov: 70 },
  'bay-bumblebee': { pos: [-3.2, 0.55, -1.9], look: [-2.6, 0.22, -2.1], fov: 60 },
  adb: { pos: [0.85, 1.4, -0.4], look: [0.85, 0.9, -1.9], fov: 60 },
  tethered: { pos: [2.4, 1.45, -0.6], look: [2.4, 1.15, -2.05], fov: 60 },
  'power-wall-close': { pos: [-0.5, 1.75, -4.1], look: [-0.4, 1.85, -4.98] },
  'power-bench': { pos: [-0.9, 1.5, -3.6], look: [-0.9, 0.9, -4.7] },
  workstation: { pos: [1.1, 1.45, 3.55], look: [1.1, 0.95, 4.8] },
  'parts-wall': { pos: [3.9, 1.6, -2.9], look: [4.2, 1.2, -4.9] },
  'build-table': { pos: [-4.4, 1.7, 2.0], look: [-4.4, 0.9, 0.6], fov: 60 },
  library: { pos: [5.0, 1.55, 0.3], look: [7.0, 1.25, 0.3] },
  corridor: { pos: [5.9, 1.65, 6.6], look: [5.9, 1.2, 4.0] },
};
