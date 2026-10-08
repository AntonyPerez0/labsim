/**
 * Public entry point of the simulation module.
 *   import { sim } from '@/sim';            // actions (SimApi)
 *   import type { LabState } from '@/sim';  // state types
 * Contract docs: docs/design/40-simulation.md (state §1, behaviour §3, faults §4, events §5, time/save §6).
 */
import './events';
export * from './types';
export type * from './api';
export type { OrcaEntityName, RigCommandName, TouchResult } from './events';
export { sim } from './impl';
export { createInitialLabState, createEmptyLabState, createDisplayState, createOrderState, createRigState, createTerminalDevice, createHost, createOrcaRobot } from './initialState';
