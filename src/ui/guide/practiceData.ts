/**
 * Practice hub view models (pure): progress through the workstation code exercises and the drills.
 * The exercise lists themselves live with the apps (`@/computer/apps/{vscode,intellij}/practice`) and are
 * loaded lazily by the hub (`loadExerciseLists`), so the menu bundle does not carry the exercise code.
 */
import type { Medal, ProgressState } from '@/core/state';
import type { DrillRow } from '@/ui/data/views';
import { isModuleComplete } from '@/ui/data/views';

export interface ExerciseInfo {
  id: string;
  title: string;
  level: number;
  topic: string;
}

export type PracticeRecords = ProgressState['parrotPractice'];

export interface CodePracticeSummary {
  total: number;
  solved: number;
  /** Total solves, including repeats (each exercise generates a fresh variant). */
  solves: number;
  /** First exercise not solved yet (in list order), or null when all are solved. */
  nextId: string | null;
  /** Module that teaches it, and whether the player has finished that module. */
  taughtIn: string;
  taught: boolean;
}

export function codePracticeSummary(p: ProgressState, records: PracticeRecords, list: readonly ExerciseInfo[], taughtIn: string): CodePracticeSummary {
  const solvedIds = list.filter((e) => (records[e.id]?.solved ?? 0) > 0).map((e) => e.id);
  return {
    total: list.length,
    solved: solvedIds.length,
    solves: list.reduce((a, e) => a + (records[e.id]?.solved ?? 0), 0),
    nextId: list.find((e) => !solvedIds.includes(e.id))?.id ?? null,
    taughtIn,
    taught: isModuleComplete(p, taughtIn),
  };
}

export interface DrillSummary {
  total: number;
  unlocked: number;
  medals: Record<Medal, number>;
  /** Suggested drill to play now: an unlocked drill without a medal, else the lowest medal. */
  suggestion: DrillRow | null;
}

const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

export function drillSummary(rows: readonly DrillRow[]): DrillSummary {
  const unlocked = rows.filter((r) => r.unlock.unlocked);
  const medals: Record<Medal, number> = { bronze: 0, silver: 0, gold: 0 };
  for (const r of rows) if (r.medal) medals[r.medal]++;
  const noMedal = unlocked.find((r) => !r.medal);
  const lowest = [...unlocked].filter((r) => r.medal !== 'gold').sort((a, b) => (a.medal ? MEDAL_RANK[a.medal] : 0) - (b.medal ? MEDAL_RANK[b.medal] : 0))[0];
  return { total: rows.length, unlocked: unlocked.length, medals, suggestion: noMedal ?? lowest ?? null };
}

export interface ExerciseLists {
  parrot: ExerciseInfo[];
  uia: ExerciseInfo[];
}

let cached: ExerciseLists | null = null;

/** Lazy-load both exercise catalogues (titles only). */
export async function loadExerciseLists(): Promise<ExerciseLists> {
  if (cached) return cached;
  const [vs, ij] = await Promise.all([import('@/computer/apps/vscode/practice/exercises'), import('@/computer/apps/intellij/practice/uiaExercises')]);
  const pick = (e: { id: string; title: string; level: number; topic: string }): ExerciseInfo => ({ id: e.id, title: e.title, level: e.level, topic: e.topic });
  cached = { parrot: vs.EXERCISES.map(pick), uia: ij.UIA_EXERCISES.map(pick) };
  return cached;
}

export function cachedExerciseLists(): ExerciseLists | null {
  return cached;
}
