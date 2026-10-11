/**
 * "Continue" target for the main menu: the Academy checkpoint to resume, else the next module to start.
 */
import type { ProgressState } from '@/core/state';
import { MODULES_BY_ID } from '@/content';
import { nextModule } from '@/ui/data/views';
import { resumeAcademy, startModule } from './actions';
import { shortTitle } from './format';

export function continueTarget(p: ProgressState): { label: string; moduleId: string; resume: boolean } | null {
  if (p.academyCheckpoint) {
    const m = MODULES_BY_ID[p.academyCheckpoint.moduleId];
    return { label: `${p.academyCheckpoint.moduleId} · ${m ? shortTitle(m.title) : ''} — step ${p.academyCheckpoint.stepIndex + 1}`, moduleId: p.academyCheckpoint.moduleId, resume: true };
  }
  const next = nextModule(p);
  if (!next) return null;
  const m = MODULES_BY_ID[next];
  return { label: `${next} · ${m ? shortTitle(m.title) : ''}`, moduleId: next, resume: false };
}

export function continueGame(p: ProgressState): void {
  const t = continueTarget(p);
  if (!t) return;
  if (t.resume && resumeAcademy()) return;
  startModule(t.moduleId);
}
