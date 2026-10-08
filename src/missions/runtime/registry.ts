/**
 * Content registries of the runtime: lesson scripts, incidents and drills are authored in parallel by
 * other teams (`src/missions/academy/lessons/`, `src/missions/arcade/incidents/`, `src/missions/drills/`)
 * and loaded **optionally** (`import.meta.glob`, eager) so the build never breaks while a folder does not
 * exist yet. Tests and tools may register extra definitions.
 */
import type { LessonStep } from '../types';
import type { CertPracticalDef, DrillDef, GlobalWrongActionDef, IncidentDef, LessonDef, ProcessBonusDef } from '../types';
import { registerGlobalWrongActions } from './arcade/penalties';
import { registerProcessBonuses } from './arcade/pb';
import { MODULES_BY_ID } from '@/content';
import { SAMPLE_LESSONS } from '../academy/sample';

type LessonsExport = Record<string, LessonDef | readonly LessonStep[]>;

const lessonGlob = import.meta.glob('../academy/lessons/index.ts', { eager: true }) as Record<string, { LESSONS?: LessonsExport; default?: unknown }>;
const incidentGlob = import.meta.glob('../arcade/incidents/index.ts', { eager: true }) as Record<string, { INCIDENTS?: readonly IncidentDef[] }>;
const drillGlob = import.meta.glob('../drills/index.ts', { eager: true }) as Record<string, { DRILLS?: readonly DrillDef[]; MIXED_DRILL_COMPONENT?: DrillDef['component'] }>;
/** Optional content overrides of the built-in GW / PB / practical definitions. */
const gwGlob = import.meta.glob(['../arcade/incidents/{gw,pb,practicals}.ts', '../arcade/rules/index.ts'], { eager: true }) as Record<
  string,
  { GLOBAL_WRONG_ACTIONS?: readonly GlobalWrongActionDef[]; PROCESS_BONUSES?: readonly ProcessBonusDef[]; PRACTICALS?: readonly CertPracticalDef[] }
>;

const lessons = new Map<string, LessonDef>();
const incidents = new Map<string, IncidentDef>();
const drills = new Map<string, DrillDef>();
const practicals = new Map<string, CertPracticalDef>();

/** Normalise a lesson export (a full `LessonDef`, or just its step list). */
export function toLessonDef(moduleId: string, v: LessonDef | readonly LessonStep[]): LessonDef {
  if (!Array.isArray(v)) return v as LessonDef;
  const meta = MODULES_BY_ID[moduleId];
  return {
    moduleId,
    mentor: (meta?.mentor ?? 'morgan') as LessonDef['mentor'],
    setup: { preset: `academy:${moduleId}` },
    steps: v as readonly LessonStep[],
    realLabChecklist: (meta?.objectives ?? []).slice(0, 6).map((o) => `In the real lab you will ${o.charAt(0).toLowerCase()}${o.slice(1)}`),
  };
}

function loadAll(): void {
  for (const [id, def] of Object.entries(SAMPLE_LESSONS)) lessons.set(id, def);
  for (const mod of Object.values(lessonGlob)) {
    const L = mod?.LESSONS;
    if (L) for (const [id, v] of Object.entries(L)) lessons.set(id, toLessonDef(id, v));
  }
  for (const mod of Object.values(incidentGlob)) for (const inc of mod?.INCIDENTS ?? []) incidents.set(inc.id, inc);
  for (const mod of Object.values(drillGlob)) for (const dr of mod?.DRILLS ?? []) drills.set(dr.id, dr);
  for (const mod of Object.values(gwGlob)) {
    if (mod?.GLOBAL_WRONG_ACTIONS) registerGlobalWrongActions(mod.GLOBAL_WRONG_ACTIONS);
    if (mod?.PROCESS_BONUSES) registerProcessBonuses(mod.PROCESS_BONUSES);
    for (const pr of mod?.PRACTICALS ?? []) practicals.set(pr.examId, pr);
  }
}
loadAll();

export function registerLessons(defs: Record<string, LessonDef | readonly LessonStep[]>): void {
  for (const [id, v] of Object.entries(defs)) lessons.set(id, toLessonDef(id, v));
}
export function registerIncidents(defs: readonly IncidentDef[]): void {
  for (const d of defs) incidents.set(d.id, d);
}
export function registerDrills(defs: readonly DrillDef[]): void {
  for (const d of defs) drills.set(d.id, d);
}
export function registerPracticals(defs: readonly CertPracticalDef[]): void {
  for (const d of defs) practicals.set(d.examId, d);
}
/** Tests: drop everything registered at runtime and reload the authored content. */
export function resetRegistries(opts: { keepAuthored?: boolean } = {}): void {
  lessons.clear();
  incidents.clear();
  drills.clear();
  if (opts.keepAuthored !== false) loadAll();
}

/** Body for mixed-item rounds (Weak Spot warm-up): renders each item with the drill that owns it. */
export function mixedDrillComponent(): DrillDef['component'] | undefined {
  for (const mod of Object.values(drillGlob)) if (mod?.MIXED_DRILL_COMPONENT) return mod.MIXED_DRILL_COMPONENT;
  return undefined;
}

export const getLesson = (moduleId: string): LessonDef | null => lessons.get(moduleId) ?? null;
export const allIncidents = (): IncidentDef[] => [...incidents.values()].sort((a, b) => a.id.localeCompare(b.id));
export const getIncident = (id: string): IncidentDef | null => incidents.get(id) ?? null;
export const allDrills = (): DrillDef[] => [...drills.values()].sort((a, b) => a.id.localeCompare(b.id));
export const getDrill = (id: string): DrillDef | null => drills.get(id) ?? null;
export const getPractical = (examId: string): CertPracticalDef | null => practicals.get(examId) ?? null;
