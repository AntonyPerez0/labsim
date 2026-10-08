/**
 * View models for menus and profile screens: the mission runtime's answer when it has one,
 * otherwise a display-only fallback computed from content + `progress` (never written back).
 */
import type { ProgressState, Medal } from '@/core/state';
import type { AchievementView, DrillView, LeitnerSummary, ModuleView, RankView, TagMasteryView, UnlockState } from '@/missions';
import { ACHIEVEMENTS, MODULES, MODULES_BY_ID, RANKS, RANKS_BY_ID, TAGS_BY_ID, TOPIC_TAGS, FLASHCARDS, rankForXp } from '@/content';
import type { ModuleMeta } from '@/content';
import { mq } from '@/ui/services/missions';
import { DRILL_CATALOG, SHIFT_CATALOG, type DrillCatalogEntry, type ShiftCatalogEntry } from './catalog';

/* ───────────────────────── Academy ───────────────────────── */

export function moduleList(): ModuleMeta[] {
  const fromRuntime = mq('modules', [], []);
  return fromRuntime.length ? fromRuntime : MODULES;
}

export function isModuleComplete(p: ProgressState, id: string): boolean {
  const m = p.modules[id];
  return !!m && (m.status === 'complete' || m.completed);
}

export function moduleViewFor(p: ProgressState, id: string): ModuleView | null {
  const rt = mq('moduleView', [id], null);
  if (rt) return rt;
  const meta = MODULES_BY_ID[id];
  if (!meta) return null;
  const rec = p.modules[id];
  const missing = meta.prerequisites.filter((pre) => !isModuleComplete(p, pre));
  const complete = isModuleComplete(p, id);
  const state: ModuleView['state'] = complete ? 'completed' : missing.length ? 'locked' : rec?.status === 'in-progress' ? 'in-progress' : 'available';
  return {
    meta,
    state,
    stars: rec?.stars ?? 0,
    bestCheckpoint: rec?.bestCheckpoint ?? (rec?.bestScore ? rec.bestScore / 100 : 0),
    replays: rec?.replays ?? 0,
    missingPrereqs: missing,
    unlocks: { incidents: [], drills: DRILL_CATALOG.filter((d) => d.unlockedBy[0] === id).map((d) => d.id), modes: [], hotbar: [] },
    resumable: p.academyCheckpoint?.moduleId === id,
  };
}

export function totalStars(p: ProgressState): number {
  return Object.values(p.modules).reduce((a, m) => a + (m.stars ?? 0), 0);
}

export function modulesCompleted(p: ProgressState): number {
  return MODULES.filter((m) => isModuleComplete(p, m.id)).length;
}

/** The module "Continue" should start: the checkpoint, else the first available incomplete module. */
export function nextModule(p: ProgressState): string | null {
  if (p.academyCheckpoint) return p.academyCheckpoint.moduleId;
  for (const m of MODULES) {
    if (isModuleComplete(p, m.id)) continue;
    if (m.prerequisites.every((pre) => isModuleComplete(p, pre))) return m.id;
  }
  return null;
}

/* ───────────────────────── Ranks ───────────────────────── */

export function rankViewFor(p: ProgressState): RankView {
  const rt = mq('careerRank', [], null as unknown as RankView);
  if (rt && rt.rank) return rt;
  const current = RANKS_BY_ID[p.rank] ?? rankForXp(p.xp);
  const idx = RANKS.findIndex((r) => r.id === current.id);
  const next = RANKS[idx + 1] ?? null;
  const span = next ? next.minXp - current.minXp : 1;
  const progress = next ? Math.max(0, Math.min(1, (p.xp - current.minXp) / span)) : 1;
  const pending = p.pendingRank?.missing ?? [];
  return { rank: current, next, xp: p.xp, xpToNext: next ? Math.max(0, next.minXp - p.xp) : 0, pending, progress };
}

/* ───────────────────────── Achievements ───────────────────────── */

export function achievementViews(p: ProgressState): AchievementView[] {
  const rt = mq('achievements', [], []);
  if (rt.length) return rt;
  return ACHIEVEMENTS.map((def) => {
    const rec = p.achievements[def.id];
    const unlocked = !!rec;
    const secret = !!def.hidden;
    return {
      id: def.id,
      def,
      title: secret && !unlocked ? '???' : def.title,
      description: secret && !unlocked ? 'Secret achievement — keep playing to reveal it.' : def.description,
      xp: def.xp ?? 0,
      icon: def.icon ?? null,
      secret,
      unlocked,
      unlockedAt: rec?.unlockedAt ?? null,
      meter: null,
    };
  });
}

/* ───────────────────────── Mastery ───────────────────────── */

const HALF_LIVES = [1, 2, 4, 7, 14, 30, 60];

export function masteryViews(p: ProgressState, nowMs: number): TagMasteryView[] {
  const rt = mq('mastery', [], []);
  if (rt.length) return rt;
  return TOPIC_TAGS.filter((t) => t.kind === 'fine' || !TOPIC_TAGS.some((f) => f.parent === t.id)).map((def) => {
    const tm = p.tagMastery[def.id];
    const m = tm?.m ?? 0;
    const level = tm?.level ?? 0;
    const days = tm?.lastEvidenceAt ? Math.max(0, (nowMs - tm.lastEvidenceAt) / 86_400_000) : 0;
    const mEff = tm ? m * Math.pow(0.5, days / HALF_LIVES[Math.min(level, HALF_LIVES.length - 1)]!) : 0;
    const label: TagMasteryView['label'] = !tm || tm.evidence === 0 ? 'new' : mEff >= 0.8 ? 'mastered' : mEff >= 0.4 ? 'learning' : 'weak';
    return { tag: def.id, def, parent: def.parent ?? def.id, group: def.group, taughtIn: def.taughtIn, m, mEff, level, label, lastEvidenceAt: tm?.lastEvidenceAt ?? 0 };
  });
}

export function tagLabel(tag: string): string {
  return TAGS_BY_ID[tag]?.label ?? tag;
}

/* ───────────────────────── Leitner ───────────────────────── */

export function leitnerSummaryFor(p: ProgressState, today: number): LeitnerSummary {
  const rt = mq('leitnerSummary', [], null as unknown as LeitnerSummary);
  if (rt && typeof rt.overall === 'number') return rt;
  const cards = Object.entries(p.leitner);
  const perDeckTotals: Record<string, [number, number]> = {};
  let high = 0;
  let due = 0;
  for (const [id, c] of cards) {
    const fc = FLASHCARDS.find((f) => f.id === id);
    const deck = fc?.deck ?? `deck.${fc?.moduleId ?? '?'}`;
    const t = (perDeckTotals[deck] ??= [0, 0]);
    t[1]++;
    if (c.box >= 4) {
      high++;
      t[0]++;
    }
    if (c.dueDay <= today) due++;
  }
  const perDeck: Record<string, number> = {};
  for (const [k, [h, n]] of Object.entries(perDeckTotals)) perDeck[k] = n ? h / n : 0;
  return { overall: cards.length ? high / cards.length : 0, perDeck, dueNow: due, unlocked: cards.length };
}

export function leitnerBoxes(p: ProgressState): number[] {
  const boxes = [0, 0, 0, 0, 0];
  for (const c of Object.values(p.leitner)) boxes[Math.max(1, Math.min(5, c.box)) - 1]!++;
  return boxes;
}

/* ───────────────────────── Drills ───────────────────────── */

export interface DrillRow {
  id: string;
  name: string;
  alias?: string;
  format: string;
  tags: readonly string[];
  durationS: number | null;
  itemCount: number | null;
  medals: Record<Medal, number>;
  unlock: UnlockState;
  best: number;
  medal: Medal | null;
  rounds: number;
  isDaily: boolean;
  /** Runtime definition available (playable). */
  playable: boolean;
}

export function drillRows(p: ProgressState): DrillRow[] {
  const defs = mq('drills', [], []);
  if (defs.length) {
    return defs.map((def) => {
      const v: DrillView | null = mq('drillView', [def.id], null);
      return {
        id: def.id,
        name: def.name,
        alias: def.alias,
        format: def.format,
        tags: def.tags,
        durationS: def.durationS,
        itemCount: def.itemCount,
        medals: def.medals,
        unlock: v?.unlock ?? fallbackDrillUnlock(p, def.unlockedBy),
        best: v?.best ?? p.drills[def.id]?.best ?? 0,
        medal: v?.medal ?? p.drills[def.id]?.medal ?? null,
        rounds: v?.rounds ?? p.drills[def.id]?.rounds ?? 0,
        isDaily: v?.isDaily ?? false,
        playable: true,
      };
    });
  }
  return DRILL_CATALOG.map((c: DrillCatalogEntry) => ({
    ...c,
    unlock: fallbackDrillUnlock(p, c.unlockedBy),
    best: p.drills[c.id]?.best ?? p.bestDrillScores[c.id] ?? 0,
    medal: p.drills[c.id]?.medal ?? null,
    rounds: p.drills[c.id]?.rounds ?? 0,
    isDaily: false,
    playable: false,
  }));
}

function fallbackDrillUnlock(p: ProgressState, unlockedBy: readonly string[]): UnlockState {
  if (!unlockedBy.length || unlockedBy.some((m) => isModuleComplete(p, m))) return { unlocked: true, reason: null };
  return { unlocked: false, reason: `Complete ${unlockedBy[0]}` };
}

/* ───────────────────────── Shifts ───────────────────────── */

export interface ShiftRow extends ShiftCatalogEntry {
  unlock: UnlockState;
  best: number;
}

export function shiftRows(p: ProgressState): ShiftRow[] {
  const rt = mq('shifts', [], []);
  const base: ShiftCatalogEntry[] = rt.length
    ? rt
        .filter((c) => c.kind === 'standard' || c.kind === 'full')
        .map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          lengthMinutes: c.lengthMinutes ?? 0,
          heatCap: c.heatCap,
          unlockModule: c.unlock.module ?? '',
          difficulty: c.difficulty,
          boardLength: String(c.lengthMinutes ?? ''),
        }))
    : SHIFT_CATALOG;
  return base.map((c) => {
    const rtUnlock = mq('shiftUnlock', [c.id], null as unknown as UnlockState);
    const unlock: UnlockState = rtUnlock && typeof rtUnlock.unlocked === 'boolean' ? rtUnlock : !c.unlockModule || isModuleComplete(p, c.unlockModule) ? { unlocked: true, reason: null } : { unlocked: false, reason: `Complete ${c.unlockModule}` };
    return { ...c, unlock, best: p.bestShiftScores[c.id] ?? 0 };
  });
}

/** Simple unlock gates from GP §2.1 for menu entries the runtime doesn't report on. */
export function modeUnlock(p: ProgressState, mode: 'freeplay' | 'daily' | 'weak-spot' | 'certification'): UnlockState {
  const need = { freeplay: 'M04', daily: 'M14', 'weak-spot': 'M06', certification: 'M05' }[mode];
  return isModuleComplete(p, need) ? { unlocked: true, reason: null } : { unlocked: false, reason: `Complete ${need}` };
}
