/**
 * Module completion (Cur §2.0 + GP §2.2.1): stars, module XP (+100; replays 25 %), first ★★ / ★★★
 * bonuses, progress record, deck / Field Manual / hotbar unlocks, the debrief with the real-lab checklist
 * and the Arcade preview ("Play now").
 */
import type { TxContext } from '@/core/store';
import type { AcademySummary, ModuleProgress, RootState } from '@/core/state';
import { articlesForTags, articlesInCategory, MODULES_BY_ID, personText, XP_REWARDS } from '@/content';
import type { ManualCategory } from '@/content/schema';
import type { LessonDef } from '../../types';
import { today } from '../clock';
import { unlockManual } from '../feedback';
import { endActivity, finaliseResultRank, newResult } from '../session';
import { grantXp } from '../progression/xp';
import { unlockDeck } from '../progression/leitner';
import { hotbarFor, MODULE_UNLOCKS, nextModules } from './catalog';

export function computeStars(hintsUsed: number, checkpointsPerfect: boolean): 1 | 2 | 3 {
  if (hintsUsed === 0 && checkpointsPerfect) return 3;
  if (hintsUsed <= 2) return 2;
  return 1;
}

export function emptyModuleProgress(): ModuleProgress {
  return {
    completed: false,
    bestScore: 0,
    completedAtDay: 0,
    status: 'not-started',
    stars: 0,
    bestCheckpoint: 0,
    replays: 0,
    starBonusesPaid: { two: false, three: false },
  };
}

export function finishModule(d: RootState, ctx: TxContext, lesson: LessonDef): void {
  const ac = d.session.academy;
  if (!ac || ac.phase === 'done') return;
  ac.phase = 'done';
  d.session.dialogue = null;
  d.session.objectives = [];
  const moduleId = lesson.moduleId;
  const meta = MODULES_BY_ID[moduleId];
  const checkpoints = Object.values(ac.checkpoints);
  const perfect = checkpoints.every((c) => c.firstTryPerfect);
  const stars = computeStars(ac.hintsUsedTotal, perfect);
  ac.stars = stars;

  const mp = (d.progress.modules[moduleId] ??= emptyModuleProgress());
  const wasComplete = mp.status === 'complete' || mp.completed;
  mp.status = 'complete';
  mp.completed = true;
  if (!mp.completedAtDay) mp.completedAtDay = today();
  if (ac.replay || wasComplete) mp.replays++;
  mp.stars = Math.max(mp.stars, stars) as ModuleProgress['stars'];
  mp.starBonusesPaid ??= { two: false, three: false };

  const result = newResult(d, 'academy', meta?.title ?? moduleId);
  result.passed = true;
  d.session.result = result;
  // Step XP was granted as the steps completed; list it as one line.
  if (ac.xpEarned > 0) {
    result.xp += ac.xpEarned;
    result.xpBreakdown.push({ label: `Steps (${ac.stepsDone.length})`, xp: ac.xpEarned });
  }
  const replay = ac.replay || wasComplete;
  grantXp(d, ctx, XP_REWARDS.moduleComplete * (replay ? XP_REWARDS.replayMultiplier : 1), 'academy-module', `${moduleId} complete${replay ? ' (replay)' : ''}`);
  if (stars >= 2 && !mp.starBonusesPaid.two) {
    mp.starBonusesPaid.two = true;
    grantXp(d, ctx, XP_REWARDS.firstTwoStars, 'academy-stars', `First ★★ on ${moduleId}`, { final: true });
  }
  if (stars >= 3 && !mp.starBonusesPaid.three) {
    mp.starBonusesPaid.three = true;
    grantXp(d, ctx, XP_REWARDS.firstThreeStars, 'academy-stars', `First ★★★ on ${moduleId}`, { final: true });
  }

  // Unlocks: deck, Field Manual chapters + module articles, hotbar tools.
  const deck = lesson.deck ?? meta?.deck ?? `deck.${moduleId}`;
  unlockDeck(d, deck);
  const chapters: string[] = [...(lesson.manualChapters ?? [])];
  const u = MODULE_UNLOCKS[moduleId];
  for (const m of u?.modes ?? []) if (m.startsWith('manual:')) chapters.push(m.slice(7));
  for (const ch of new Set(chapters)) for (const a of articlesInCategory(ch as ManualCategory)) unlockManual(d, ctx, a.id, moduleId);
  for (const a of articlesForTags(meta?.tags ?? [])) unlockManual(d, ctx, a.id, moduleId);
  const tools = hotbarFor(moduleId);
  for (const t of tools) if (!d.session.inventory.includes(t)) d.session.inventory.push(t);

  const unlocked: AcademySummary['unlocked'] = {
    incidents: [...(u?.incidents ?? [])],
    drills: [...(u?.drills ?? [])],
    // `manual:<chapter>` modes are listed as Field Manual chapters, not as raw ids.
    modes: (u?.modes ?? []).filter((m) => !m.startsWith('manual:')),
    hotbar: tools,
    decks: [deck],
    manualChapters: [...new Set(chapters)],
  };
  const playNow: AcademySummary['playNow'] = unlocked.drills[0]
    ? { kind: 'drill', drillId: unlocked.drills[0] }
    : unlocked.incidents[0]
      ? { kind: 'micro-shift', incidentId: unlocked.incidents[0] }
      : null;
  const firstCp = checkpoints[0] ?? null;
  result.academy = {
    moduleId,
    stars,
    hintsUsed: ac.hintsUsedTotal,
    checkpoint: firstCp ? { ...firstCp, missedIds: [...firstCp.missedIds] } : null,
    replay,
    unlocked,
    playNow,
    nextModules: nextModules(d.progress, moduleId),
  };
  result.points = stars;
  result.accuracy = firstCp && firstCp.total ? firstCp.firstTryCorrect / firstCp.total : 1;
  result.takeaways = lesson.realLabChecklist.slice(0, 6).map((t) => personText(t));
  d.progress.academyCheckpoint = null;
  ctx.emit('mission.completed', { moduleId, stars, xp: result.xp, replay });
  endActivity(d, ctx, result);
  finaliseResultRank(d);
}
