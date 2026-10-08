/**
 * Location anchors (World §1.3), spawns and NPC anchors (§1.9) and the fixed focus poses (§9.3).
 * Rig-relative focus poses (tablets, screens) are computed in `rigs.ts`.
 */
import type { CameraPose, LocationAnchor } from '@/engine/types';
import type { Vec3 } from './types';
import { HARDWARE_LEAD, personName } from '@/content/team';

/* ───────────────────────────── §1.3 Location anchors ───────────────────────────── */

export interface LocationDef extends LocationAnchor {
  /** What is there (HUD tooltip / Field Manual). */
  readonly what: string;
}

function loc(id: string, label: string, center: Vec3, radius: number, what: string): LocationDef {
  return { id, label, center, radius, what };
}

/**
 * `center` is on the floor; walk-to lesson steps succeed within 1.5 m of it (curriculum).
 * Registered once by `buildWorld` (`engine.registerLocation`) — builders must not re-register.
 */
export const LOCATIONS: readonly LocationDef[] = [
  loc('loc.corridor', 'Corridor', [5.9, 0, 6.15], 1.5, 'New-game spawn, badge reader'),
  loc('loc.entrance', 'Lab entrance', [5.9, 0, 3.9], 1.2, 'Inside the door, clock, first-aid'),
  loc('loc.workstation', 'Your workstation', [1.1, 0, 3.85], 1.0, 'desk.player'),
  loc('loc.morgan-desk', `${personName('morgan')}'s desk`, [-0.9, 0, 3.85], 1.0, 'desk.morgan'),
  loc('loc.coworker-desks', 'Office desks', [-5.2, 0, 3.8], 1.8, 'Coworker desks + desk devices on ADB 5555'),
  loc('loc.rack-a', 'Touch Rack A', [-2.6, 0, -1.15], 1.0, 'WALL-E (bay 4), EVE (3), R2-D2 (2), BUMBLEBEE (1)'),
  loc('loc.callus-shelf', 'Callus shelf', [-2.0, 0, -1.15], 0.6, 'Collis probes, MINIX-01/02, NUC-03'),
  loc('loc.rack-b', 'Touch Rack B', [-1.4, 0, -1.15], 1.0, 'JOHNNY-5 (4), SETI (3), BAYMAX (2), ROSIE (1)'),
  loc('loc.rear-aisle', 'Rack row (rear)', [-1.7, 0, -3.5], 1.2, 'Pis, fuses, AC strips at rack rears'),
  loc('loc.adb-shelf', 'ADB bot shelf', [0.85, 0, -1.15], 0.9, 'DATA, TARS'),
  loc('loc.rack-tethered', 'Tethered rack', [2.4, 0, -1.05], 1.0, 'MEGATRON / OPTIMUS (IMG-R)'),
  loc('loc.power-wall', 'Power wall', [-0.7, 0, -3.9], 1.3, 'Mean Well, 24 V rail, regulators, fuses, AC strip, DC taps'),
  loc('loc.server-shelf', 'Server shelf', [-3.7, 0, -3.9], 1.0, 'GPU blade, switch, retired tower'),
  loc('loc.print-corner', '3D print corner', [-5.75, 0, -3.75], 1.3, 'Prusa, Bambu Lab, CAD laptop'),
  loc('loc.jared-bench', `${personName(HARDWARE_LEAD)}'s bench`, [2.7, 0, -3.75], 1.3, 'Soldering, scope, bolt bins, red/blue bins, drawers'),
  loc('loc.husky', 'Husky chest', [4.8, 0, -4.0], 0.7, 'Spare devices (drawers 2, 3)'),
  loc('loc.storage', 'Storage cabinet', [6.42, 0, -4.0], 0.7, 'Locked spares, legacy Flex 1'),
  loc('loc.whiteboard', 'Whiteboard', [-6.1, 0, -1.8], 1.4, 'Architecture diagram + roadmap board'),
  loc('loc.build-table', 'Build table', [-4.4, 0, 1.55], 1.2, 'Half-built rig, 10 ft extrusion'),
  loc('loc.device-library', 'Device library', [6.1, 0, 0.3], 1.3, 'One of every device + family trays'),
  loc('loc.coffee', 'Coffee', [6.1, 0, 3.35], 0.8, 'Coffee machine'),
  loc('loc.history-wall', 'Team history wall', [3.75, 0, 4.1], 1.2, 'Frames + match plaques'),
];

export const LOCATION_BY_ID: Readonly<Record<string, LocationDef>> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

/* ───────────────────────────── §1.9 Spawns and NPC anchors ───────────────────────────── */

export interface SpawnDef {
  readonly id: string;
  /** Feet position. */
  readonly pos: Vec3;
  /** Degrees: 0 = looking north (−Z), +90 = looking west (engine yaw convention, in degrees). */
  readonly yawDeg: number;
  readonly use: string;
  /** Spawned straight into a seated pose (inside a chair collider by design). */
  readonly seated?: boolean;
}

export const SPAWNS: readonly SpawnDef[] = [
  { id: 'spawn.new-game', pos: [5.9, 0, 6.4], yawDeg: 0, use: 'M00 Badge In: facing the closed lab door, Morgan visible through the vision panel' },
  { id: 'spawn.entrance', pos: [5.9, 0, 4.2], yawDeg: 50, use: "Inside the door, framing the rack row's green glow" },
  { id: 'spawn.free-play', pos: [2.0, 0, 1.0], yawDeg: 60, use: 'Free Play default' },
  { id: 'spawn.workstation', pos: [1.1, 0, 4.02], yawDeg: 180, use: 'Load straight into the seated pose (§9.3)', seated: true },
];

export const SPAWN_BY_ID: Readonly<Record<string, SpawnDef>> = Object.fromEntries(SPAWNS.map((s) => [s.id, s]));

export interface NpcAnchorDef {
  readonly id: string;
  readonly pos: Vec3;
  /** Facing, same convention as spawns (0 = facing north, 90 = facing west). */
  readonly yawDeg: number;
  readonly use: string;
  /** NPC id(s) that use the anchor by default ('any' = whoever a script sends there). */
  readonly npc: string;
  readonly seated?: boolean;
}

export const NPC_ANCHORS: readonly NpcAnchorDef[] = [
  { id: 'npc.morgan.desk', pos: [-0.9, 0, 4.02], yawDeg: 180, use: 'seated', npc: 'npc.morgan', seated: true },
  { id: 'npc.morgan.door', pos: [5.45, 0, 4.3], yawDeg: 180, use: 'waving through the vision panel', npc: 'npc.morgan' },
  { id: 'npc.jared.bench', pos: [2.7, 0, -4.05], yawDeg: 0, use: 'working at the bench', npc: 'npc.jared' },
  { id: 'npc.jared.power-wall', pos: [-0.2, 0, -4.05], yawDeg: 0, use: 'M03', npc: 'npc.jared' },
  { id: 'npc.any.rack-a', pos: [-3.3, 0, -1.3], yawDeg: 270, use: 'beside the rack fronts', npc: 'any' },
  { id: 'npc.any.rack-b', pos: [-0.6, 0, -1.3], yawDeg: 90, use: 'beside the rack fronts', npc: 'any' },
  { id: 'npc.any.callus', pos: [-2.0, 0, -1.05], yawDeg: 0, use: 'at the Callus shelf', npc: 'any' },
  { id: 'npc.any.tethered', pos: [2.95, 0, -1.0], yawDeg: 30, use: 'at the tethered rack', npc: 'any' },
  { id: 'npc.any.server', pos: [-3.2, 0, -3.9], yawDeg: 10, use: 'at the server shelf', npc: 'any' },
  { id: 'npc.any.print', pos: [-5.2, 0, -3.7], yawDeg: 10, use: 'at the print corner', npc: 'any' },
  { id: 'npc.any.whiteboard', pos: [-6.1, 0, -1.2], yawDeg: 90, use: 'at the whiteboard', npc: 'any' },
  { id: 'npc.any.library', pos: [6.0, 0, -0.4], yawDeg: 270, use: 'at the device library', npc: 'any' },
  { id: 'npc.coworker.desk-1', pos: [-6.1, 0, 4.02], yawDeg: 180, use: 'Sam† seated', npc: 'npc.sam', seated: true },
  { id: 'npc.coworker.desk-2', pos: [-4.3, 0, 4.02], yawDeg: 180, use: 'Riley† seated', npc: 'npc.riley', seated: true },
  { id: 'npc.alex.build', pos: [-4.4, 0, 1.45], yawDeg: 0, use: 'Alex† at the build table', npc: 'npc.alex' },
  { id: 'npc.tate.visit', pos: [0.1, 0, 3.3], yawDeg: 180, use: 'visitor near the desks', npc: 'npc.tate' },
  { id: 'npc.david.visit', pos: [-0.2, 0, 2.9], yawDeg: 180, use: 'visitor near the desks', npc: 'npc.david' },
];

export const NPC_ANCHOR_BY_ID: Readonly<Record<string, NpcAnchorDef>> = Object.fromEntries(NPC_ANCHORS.map((a) => [a.id, a]));

/**
 * NPC ids (Appendix A). Display names/roles come from `src/content/team.ts` (never hard-code real
 * names in world text); `npc.coworker` is the curriculum's generic alias for the desk coworker.
 */
export const NPC_IDS = ['npc.morgan', 'npc.jared', 'npc.tate', 'npc.david', 'npc.riley', 'npc.sam', 'npc.alex'] as const;
export type NpcId = (typeof NPC_IDS)[number];

export const NPC_DEFAULT_ANCHOR: Readonly<Record<NpcId, string>> = {
  'npc.morgan': 'npc.morgan.desk',
  'npc.jared': 'npc.jared.bench',
  'npc.tate': 'npc.tate.visit',
  'npc.david': 'npc.david.visit',
  'npc.riley': 'npc.coworker.desk-2',
  'npc.sam': 'npc.coworker.desk-1',
  'npc.alex': 'npc.alex.build',
};

/* ───────────────────────────── §9.3 Fixed focus poses ───────────────────────────── */

export interface FocusPose extends CameraPose {
  /** Optional camera up vector (default +Y). Touch-rig screens use bay −Z so the screen reads upright. */
  readonly up?: Vec3;
  /** Optional near-plane override. */
  readonly near?: number;
}

/** Seated at the workstation: chair slides in 0.25 m over 0.4 s; the React desktop covers the monitors. */
export const SEATED_POSE: FocusPose = { position: [1.1, 1.2, 4.12], lookAt: [1.1, 1.08, 4.8], fov: 50 };

/** Wall boards: 1.10 m in front of the board centre, eye height 1.55, FOV 55. */
export function boardFocusPose(centre: Vec3, outwardNormal: Vec3): FocusPose {
  return {
    position: [centre[0] + outwardNormal[0] * 1.1, 1.55, centre[2] + outwardNormal[2] * 1.1],
    lookAt: centre,
    fov: 55,
  };
}

/** Upright devices (tethered, ADB, coworker, library): face centre + 0.30 m along the face normal, FOV 40. */
export function uprightFocusPose(faceCentre: Vec3, faceNormal: Vec3): FocusPose {
  return {
    position: [faceCentre[0] + faceNormal[0] * 0.3, faceCentre[1] + faceNormal[1] * 0.3, faceCentre[2] + faceNormal[2] * 0.3],
    lookAt: faceCentre,
    fov: 40,
  };
}

/** The workstation's seated "chair slide" spec. */
export const SEATED_CHAIR_SLIDE = { distanceM: 0.25, durationS: 0.4 } as const;
