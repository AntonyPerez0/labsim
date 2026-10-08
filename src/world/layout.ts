/**
 * World placement contract — the single source of truth for where everything stands in the lab,
 * the physical rig roster and every world/interaction id (docs/design/30-world.md).
 * Both world builders (`src/world/lab`, `src/world/rigs`), the binders, missions, lessons and the
 * HUD import from here. Pure data + pure helpers (no three.js objects, no store access).
 *
 * Conventions (World §0.1): metres, Y up, origin = lab floor centre, +X east, +Z south.
 * Prop `rotY` degrees (0 = front faces south). Player/NPC `yawDeg` (0 = looking north, +90 = west).
 * Positions are base centres (floor y = 0; surface props y = surface height; wall props y = centre).
 * Rig internals are bay-local millimetres (see `racks.ts`).
 *
 * Who registers what:
 *  - `buildWorld` (src/world/index.ts): `LOCATIONS` (engine.registerLocation) + initial spawn.
 *  - `buildLab`: `STATIC_COLLIDERS`, the door-leaf collider, and every `interactablesFor('lab')`.
 *  - `buildRigs`: every `interactablesFor('rigs')` and the dynamic side-door colliders.
 */
export * from './layout/types';
export * from './layout/room';
export * from './layout/props';
export * from './layout/locations';
export * from './layout/power';
export * from './layout/racks';
export * from './layout/rigs';
export * from './layout/shelves';
export * from './layout/devices';
export * from './layout/cameras';
export * from './layout/ids';
export * from './layout/interactables';
export { ia, E as verbE, R as verbR, G as verbG, fuseVerbs, stripEntries, piVerbs, webcamVerbs, deviceVerbs } from './layout/interactionSpec';
export * from './layout/aliases';
export * from './layout/colliders';
export * from './layout/sim';
