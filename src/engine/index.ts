/**
 * Engine public entry: the `engine` singleton (see `./types` for the contract and `./engine` for
 * the implementation).
 */
import type { Engine } from './types';
import { LabEngine } from './engine';

export type * from './types';
export { LabEngine } from './engine';
export { QUALITY_PRESETS, type QualitySettings } from './quality';

export const engine: Engine = new LabEngine();
