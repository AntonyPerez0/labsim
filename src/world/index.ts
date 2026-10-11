/**
 * World entry point: builds the whole lab into the engine scene.
 * `buildLab` (room, furniture, power wall, server shelf, fabrication, props) is owned by the
 * world-lab team; `buildRigs` (touch robots, tethered bench, ADB bots, LabSim devices, tablets)
 * by the world-rigs team. Both use the shared placement constants in `./layout.ts`.
 *
 * Registration contract (see `./layout.ts` header): `buildWorld` registers the location anchors
 * and places the player at a default spawn; `buildLab` registers static colliders + lab
 * interactables; `buildRigs` registers rig interactables + dynamic side-door colliders.
 */
import type { Engine } from '@/engine/types';
import { bus } from '@/core/bus';
import { LOCATIONS, SPAWN_BY_ID, degToRad } from './layout';
import { installPortalCulling } from './portal';
import { reducedWorldDetail, setWorldDetail } from './detail';
import { store } from '@/core/store';
import { getQuality } from '@/engine/quality';

export * from './layout';

export type ProgressFn = (progress01: number, label: string) => void;

/** Spawn used when nothing else (mission, save) places the player. */
export const DEFAULT_SPAWN_ID = 'spawn.entrance';

let unregisterLocations: (() => void)[] = [];
let portalOff: (() => void) | null = null;
let teleportOff: (() => void) | null = null;
let webcamsOff: (() => void) | null = null;

/**
 * Mission setups place the player with `spawn: 'loc.*'` (`mission.teleportRequested`). The workstation
 * stands behind its chair facing the monitors; any other anchor puts the player on its centre, facing the room centre.
 */
export function teleportToLocation(engine: Engine, locationId: string): boolean {
  // The seated spawn is inside the chair collider (the player is pushed far out of it): stand behind the chair.
  if (locationId === 'loc.workstation') {
    engine.teleportPlayer([1.1, 0, 3.25], Math.PI, -0.15);
    return true;
  }
  const l = LOCATIONS.find((x) => x.id === locationId);
  if (!l) return false;
  const [x, , z] = l.center;
  const yaw = Math.hypot(x, z) > 0.5 ? Math.atan2(x, z) : 0; // look toward (0, 0): yaw 0 = −Z, +π/2 = −X
  engine.teleportPlayer([x, 0, z], yaw);
  return true;
}

export async function buildWorld(engine: Engine, onProgress: ProgressFn): Promise<void> {
  // Location anchors (World §1.3) are shared data: registered once here, never by the builders.
  for (const off of unregisterLocations) off();
  unregisterLocations = LOCATIONS.map((l) => engine.registerLocation({ id: l.id, label: l.label, center: l.center, radius: l.radius }));

  // Potato builds lower-tessellation curves and skips purely decorative clutter (World §7.4).
  setWorldDetail(getQuality(store.getState().progress.settings.quality).reducedDetail);

  const { buildLab } = await import('./lab');
  const { buildRigs } = await import('./rigs');
  onProgress(0.05, 'Building the lab…');
  await buildLab(engine, (p, l) => onProgress(0.05 + p * 0.5, l));
  onProgress(0.55, 'Wiring up robots…');
  await buildRigs(engine, (p, l) => onProgress(0.55 + p * 0.45, l));
  if (reducedWorldDetail()) hideTinyDetail(engine);
  // Live webcam streams for the workstation's Lab Cameras app (World App. B).
  webcamsOff?.();
  webcamsOff = (await import('./webcams')).registerWebcams();
  // corridor: draw only what the door's vision panel / doorway shows (World §10.4)
  portalOff?.();
  portalOff = installPortalCulling(engine).off;

  const spawn = SPAWN_BY_ID[DEFAULT_SPAWN_ID];
  if (spawn) engine.teleportPlayer(spawn.pos, degToRad(spawn.yawDeg));
  teleportOff?.();
  teleportOff = bus.on('mission.teleportRequested', (e) => {
    if (!teleportToLocation(engine, e.locationId)) console.warn('[world] unknown spawn location', e.locationId);
  });
  onProgress(1, 'Ready');
}

/**
 * Potato: instanced screw heads and nuts are hundreds of tiny instances (~22k triangles, 4 draws)
 * nobody sees at half resolution. Hidden, not removed (raycasts never target them).
 */
const TINY_DETAIL = new Set(['screws-black', 'lab.inst:screw', 'lab.inst:screwBlack', 'lab.inst:nut']);
function hideTinyDetail(engine: Engine): void {
  engine.scene.traverse((o) => {
    if (TINY_DETAIL.has(o.name)) o.visible = false;
  });
}

/** Teleport the player to a named spawn (`spawn.*`) — for missions, menus and debug tools. */
export function teleportToSpawn(engine: Engine, spawnId: string): boolean {
  const s = SPAWN_BY_ID[spawnId];
  if (!s) return false;
  engine.teleportPlayer(s.pos, degToRad(s.yawDeg));
  return true;
}
