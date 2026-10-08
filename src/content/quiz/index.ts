/**
 * Quiz bank index (Cur §3): 382 items Q001–Q382 across modules M01–M18.
 * Item counts: mc 251 · tf 73 · fill 31 · order 14 · match 13. † items (Q128, Q137, Q220) carry
 * `illustrative: true` and are excluded from certification written exams (Cur §0.2 rule 3).
 */
import type { QuizQuestion } from '../schema';
import { QUIZ_M01 } from './m01';
import { QUIZ_M02 } from './m02';
import { QUIZ_M03 } from './m03';
import { QUIZ_M04 } from './m04';
import { QUIZ_M05 } from './m05';
import { QUIZ_M06 } from './m06';
import { QUIZ_M07 } from './m07';
import { QUIZ_M08 } from './m08';
import { QUIZ_M09 } from './m09';
import { QUIZ_M10 } from './m10';
import { QUIZ_M11 } from './m11';
import { QUIZ_M12 } from './m12';
import { QUIZ_M13 } from './m13';
import { QUIZ_M14 } from './m14';
import { QUIZ_M15 } from './m15';
import { QUIZ_M16 } from './m16';
import { QUIZ_M17 } from './m17';
import { QUIZ_M18 } from './m18';

/** Quiz items grouped by module id ("M01" … "M18"), in bank order. */
export const QUIZ_BY_MODULE: Record<string, QuizQuestion[]> = {
  M01: QUIZ_M01,
  M02: QUIZ_M02,
  M03: QUIZ_M03,
  M04: QUIZ_M04,
  M05: QUIZ_M05,
  M06: QUIZ_M06,
  M07: QUIZ_M07,
  M08: QUIZ_M08,
  M09: QUIZ_M09,
  M10: QUIZ_M10,
  M11: QUIZ_M11,
  M12: QUIZ_M12,
  M13: QUIZ_M13,
  M14: QUIZ_M14,
  M15: QUIZ_M15,
  M16: QUIZ_M16,
  M17: QUIZ_M17,
  M18: QUIZ_M18,
};

/** Every quiz item, Q001 … Q382 in id order. */
export const QUIZ_BANK: QuizQuestion[] = Object.values(QUIZ_BY_MODULE)
  .flat()
  .sort((a, b) => a.id.localeCompare(b.id));

/** Ids of † items excluded from certification (Cur §0.2 rule 3). */
export const ILLUSTRATIVE_QUESTION_IDS: string[] = QUIZ_BANK.filter((q) => q.illustrative).map((q) => q.id);
