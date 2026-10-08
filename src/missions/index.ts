/**
 * Public entry point of the missions module.
 *
 *   import { missions } from '@/missions';                       // runtime (MissionsApi)
 *   import { c, p, on, type IncidentDef } from '@/missions/types'; // authoring contract
 *
 * The runtime lives in `./runtime/` (lesson runner, condition engine, shift director, tickets, drills,
 * Free Play, certification, progression). Content registries load lessons / incidents / drills from
 * `./academy/lessons`, `./arcade/incidents` and `./drills` when those folders exist.
 */
export type * from './api';
export * from './types';
export { missions } from './runtime/api';
export { registerDrills, registerIncidents, registerLessons, registerPracticals } from './runtime/registry';
export { registerGlobalWrongActions } from './runtime/arcade/penalties';
