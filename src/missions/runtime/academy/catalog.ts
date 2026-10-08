/**
 * Academy catalogue: module states (Cur §2.1 prerequisites), the GP §2.2.2 "what each module unlocks
 * outside the Academy" table, Arcade mode gates and module views for the menu.
 */
import type { ProgressState, ToolId } from '@/core/state';
import { HOTBAR_SLOTS } from '@/core/state';
import { MODULE_ORDER, MODULES, MODULES_BY_ID } from '@/content';
import type { ModuleView } from '../../api';

export interface ModuleUnlocks {
  incidents: string[];
  drills: string[];
  modes: string[];
  hotbar: ToolId[];
}

/** GP §2.2.2 (modes use stable ids: `shift-5`, `shift-10`, `shift-20`, `freeplay`, `weak-spot`, `daily`, `certification`, `terminal`, `manual:Lab Basics`). */
export const MODULE_UNLOCKS: Readonly<Record<string, ModuleUnlocks>> = {
  M01: { incidents: [], drills: ['DR10', 'DR14', 'DR17'], modes: ['manual:Lab Basics'], hotbar: [] },
  M02: { incidents: [], drills: [], modes: [], hotbar: [] },
  M03: { incidents: ['INC03', 'INC17', 'INC18'], drills: ['DR04', 'DR13'], modes: [], hotbar: ['multimeter', 'spare-fuse-5v'] },
  M04: { incidents: ['INC11', 'INC12', 'INC13', 'INC15', 'INC16', 'INC59'], drills: ['DR16'], modes: ['shift-5', 'freeplay'], hotbar: ['screwdriver'] },
  M05: { incidents: ['INC19', 'INC56'], drills: [], modes: ['terminal'], hotbar: [] },
  M06: {
    incidents: ['INC01', 'INC02', 'INC04', 'INC05', 'INC06', 'INC07', 'INC31', 'INC40', 'INC41', 'INC48', 'INC60', 'INC62'],
    drills: ['DR01', 'DR09'],
    modes: ['weak-spot'],
    hotbar: ['ethernet-cable'],
  },
  M07: { incidents: ['INC08', 'INC09', 'INC14', 'INC42', 'INC43', 'INC45', 'INC46', 'INC63', 'INC65'], drills: ['DR11', 'DR12'], modes: [], hotbar: [] },
  M08: { incidents: ['INC23', 'INC28', 'INC49', 'INC50', 'INC51'], drills: [], modes: [], hotbar: [] },
  M09: { incidents: ['INC20', 'INC21', 'INC52'], drills: ['DR07'], modes: [], hotbar: [] },
  M10: { incidents: ['INC53', 'INC54', 'INC55', 'INC58'], drills: [], modes: ['shift-10'], hotbar: ['test-card-visa'] },
  M11: { incidents: ['INC26', 'INC39', 'INC44'], drills: [], modes: [], hotbar: [] },
  M12: { incidents: [], drills: ['DR03', 'DR19'], modes: [], hotbar: [] },
  M13: { incidents: ['INC32', 'INC33', 'INC34'], drills: ['DR08', 'DR15'], modes: [], hotbar: [] },
  M14: { incidents: ['INC27', 'INC29', 'INC30', 'INC35', 'INC47'], drills: ['DR02', 'DR09'], modes: ['daily'], hotbar: [] },
  M15: { incidents: ['INC22', 'INC25'], drills: ['DR06', 'DR18'], modes: [], hotbar: [] },
  M16: { incidents: ['INC24', 'INC36', 'INC37', 'INC38', 'INC64'], drills: ['DR05'], modes: [], hotbar: [] },
  M17: { incidents: ['INC10', 'INC57', 'INC61'], drills: [], modes: [], hotbar: [] },
  M18: { incidents: [], drills: [], modes: ['shift-20', 'certification'], hotbar: [] },
};

export function isComplete(p: ProgressState, moduleId: string): boolean {
  const m = p.modules[moduleId];
  return !!m && (m.status === 'complete' || m.completed);
}

export function missingPrereqs(p: ProgressState, moduleId: string): string[] {
  const meta = MODULES_BY_ID[moduleId];
  if (!meta) return [];
  const req = [...meta.prerequisites];
  // M18 needs every earlier module (Cur §2.1).
  if (moduleId === 'M18') for (const id of MODULE_ORDER) if (id !== 'M18' && !req.includes(id)) req.push(id);
  return req.filter((id) => !isComplete(p, id));
}

export function moduleState(p: ProgressState, moduleId: string): ModuleView['state'] {
  if (!MODULES_BY_ID[moduleId]) return 'locked';
  if (isComplete(p, moduleId)) return 'completed';
  if (missingPrereqs(p, moduleId).length) return 'locked';
  if (p.modules[moduleId]?.status === 'in-progress' || p.academyCheckpoint?.moduleId === moduleId) return 'in-progress';
  return 'available';
}

export function moduleView(p: ProgressState, moduleId: string, resumable: boolean): ModuleView | null {
  const meta = MODULES_BY_ID[moduleId];
  if (!meta) return null;
  const mp = p.modules[moduleId];
  const u = MODULE_UNLOCKS[moduleId] ?? { incidents: [], drills: [], modes: [], hotbar: [] };
  return {
    meta,
    state: moduleState(p, moduleId),
    stars: mp?.stars ?? 0,
    bestCheckpoint: mp?.bestCheckpoint ?? 0,
    replays: mp?.replays ?? 0,
    missingPrereqs: missingPrereqs(p, moduleId),
    unlocks: { incidents: [...u.incidents], drills: [...u.drills], modes: [...u.modes], hotbar: [...u.hotbar] },
    resumable,
  };
}

/** Module that unlocks a mode / drill / incident (first in curriculum order), or null. */
export function moduleUnlocking(kind: keyof ModuleUnlocks, id: string): string | null {
  for (const mid of MODULE_ORDER) if ((MODULE_UNLOCKS[mid]?.[kind] as readonly string[] | undefined)?.includes(id)) return mid;
  return null;
}

export function modeUnlocked(p: ProgressState, mode: string): boolean {
  const mid = moduleUnlocking('modes', mode);
  return !mid || isComplete(p, mid);
}

/** Modules whose prerequisites the given module completion newly satisfies (debrief "next"). */
export function nextModules(p: ProgressState, completedId: string): string[] {
  return MODULES.filter((m) => !isComplete(p, m.id) && m.id !== completedId && missingPrereqs(p, m.id).length === 0).map((m) => m.id);
}

/** Hotbar tool unlocked by a module. */
export function hotbarFor(moduleId: string): ToolId[] {
  return HOTBAR_SLOTS.filter((s) => s.unlockedBy === moduleId).map((s) => s.tool);
}

export function moduleTitle(moduleId: string): string {
  return MODULES_BY_ID[moduleId]?.title ?? moduleId;
}
