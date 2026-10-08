/**
 * Arcade Drills (GP §2.4) — the DR01–DR19 catalogue. Each drill lives in its own folder:
 * `logic.ts` (pure items / generators / grading + the `DrillDef`), `View.tsx` (React body, code-split via
 * `lazyDrill`) and `style.css` (unique class prefix `drNN-`). Loaded by `runtime/registry.ts`.
 */
import type { DrillDef } from '../types';
import { makeMixedComponent } from './common/mixed';
import { DR01 } from './dr01-status-triage/logic';
import { DR02 } from './dr02-config-speed-build/logic';
import { DR03 } from './dr03-port-patrol/logic';
import { DR04 } from './dr04-power-path/logic';
import { DR05 } from './dr05-coordinate-hunter/logic';
import { DR06 } from './dr06-json-medic/logic';
import { DR07 } from './dr07-receipt-map/logic';
import { DR08 } from './dr08-pom-builder/logic';
import { DR09 } from './dr09-pipeline-order/logic';
import { DR10 } from './dr10-speed-quiz/logic';
import { DR11 } from './dr11-caps-lock/logic';
import { DR12 } from './dr12-entity-atlas/logic';
import { DR13 } from './dr13-meter-reader/logic';
import { DR14 } from './dr14-who-you-gonna-call/logic';
import { DR15 } from './dr15-where-does-it-go/logic';
import { DR16 } from './dr16-park-it/logic';
import { DR17 } from './dr17-lab-lore/logic';
import { DR18 } from './dr18-log-detective/logic';
import { DR19 } from './dr19-adb-speedrun/logic';

export const DRILLS: DrillDef[] = [DR01, DR02, DR03, DR04, DR05, DR06, DR07, DR08, DR09, DR10, DR11, DR12, DR13, DR14, DR15, DR16, DR17, DR18, DR19] as DrillDef[];

export const DRILLS_BY_ID: Readonly<Record<string, DrillDef>> = Object.fromEntries(DRILLS.map((d) => [d.id, d]));

/**
 * Body for mixed rounds (Weak Spot warm-up): renders each item with the drill that owns it. The runtime's
 * `mixedDrillDef` should set `component: MIXED_DRILL_COMPONENT`.
 */
export const MIXED_DRILL_COMPONENT = makeMixedComponent(() => DRILLS_BY_ID);
