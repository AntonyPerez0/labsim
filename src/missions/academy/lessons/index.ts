/**
 * Academy lesson scripts M01–M18 (Cur §2), loaded by the mission runtime's registry
 * (`import.meta.glob('../academy/lessons/index.ts')` → `LESSONS`). Each module file exports a full
 * `LessonDef` (setup, steps, real-lab checklist); authored strings use `{{key}}` people tokens that are
 * resolved here once from `src/content/team.ts` (canon "People": rename there, renamed everywhere).
 */
import { resolvePeople } from '@/content';
import type { LessonDef } from '../../types';
import { M01 } from './m01';
import { M02 } from './m02';
import { M03 } from './m03';
import { M04 } from './m04';
import { M05 } from './m05';
import { M06 } from './m06';
import { M07 } from './m07';
import { M08 } from './m08';
import { M09 } from './m09';
import { M10 } from './m10';
import { M11 } from './m11';
import { M12 } from './m12';
import { M13 } from './m13';
import { M14 } from './m14';
import { M15 } from './m15';
import { M16 } from './m16';
import { M17 } from './m17';
import { M18 } from './m18';

/** The lessons exactly as authored (people tokens unresolved) — for lint tests. */
export const AUTHORED_LESSONS: readonly LessonDef[] = [M01, M02, M03, M04, M05, M06, M07, M08, M09, M10, M11, M12, M13, M14, M15, M16, M17, M18];

/** Module id → playable lesson (people tokens resolved). */
export const LESSONS: Record<string, LessonDef> = Object.fromEntries(AUTHORED_LESSONS.map((l) => [l.moduleId, resolvePeople(l)]));
