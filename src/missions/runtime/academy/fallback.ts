/**
 * Fallback lesson for a module whose script is not authored yet: the mentor walks through the module's
 * learning objectives (curriculum text) and the module checkpoint runs with its listed items. Keeps every
 * module playable end-to-end (stars, XP, unlocks) while `src/missions/academy/lessons/` fills in.
 */
import { MODULES_BY_ID } from '@/content';
import type { LessonDef, LessonStep } from '../../types';
import type { NpcKey } from '@/core/state';

export function fallbackLesson(moduleId: string): LessonDef | null {
  const meta = MODULES_BY_ID[moduleId];
  if (!meta) return null;
  const mentor = (meta.mentor || 'morgan') as NpcKey;
  const steps: LessonStep[] = [
    { id: `${moduleId}.01`, kind: 'dialogue', speaker: mentor, text: `${meta.title}. ${meta.summary}` },
    ...meta.objectives.map(
      (o, i): LessonStep => ({ id: `${moduleId}.${String(i + 2).padStart(2, '0')}`, kind: 'dialogue', speaker: mentor, text: `Objective ${i + 1}: ${o}` }),
    ),
  ];
  if (meta.checkpointQuestionIds.length) {
    steps.push({
      id: `${moduleId}.${String(steps.length + 1).padStart(2, '0')}`,
      kind: 'quiz-checkpoint',
      checkpointId: meta.checkpointId ?? `CP-${moduleId}.1`,
      title: meta.checkpointTitle ?? meta.title,
      questionIds: meta.checkpointQuestionIds,
    });
  }
  return {
    moduleId,
    mentor,
    setup: { preset: `academy:${moduleId}` },
    steps,
    realLabChecklist: meta.objectives.slice(0, 6),
    ...(meta.deck ? { deck: meta.deck } : {}),
  };
}
