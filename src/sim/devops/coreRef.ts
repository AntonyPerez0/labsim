/** Holder of the bound sim-core services (see `CoreServices` in ./index.ts). Separate module to avoid import cycles. */
import type { CoreServices } from './index';

let boundCore: CoreServices | null = null;

/** Called once by `src/sim/impl/index.ts` at module load (re-exported from ./index). */
export function bindCoreServices(c: CoreServices): void {
  boundCore = c;
}

/** The bound sim-core services (throws if used before binding — a wiring bug, never user error). */
export function core(): CoreServices {
  if (!boundCore) throw new Error('sim-devops: CoreServices not bound (src/sim/impl/index.ts must call bindCoreServices)');
  return boundCore;
}
