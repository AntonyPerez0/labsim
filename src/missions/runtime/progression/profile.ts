/**
 * Profile views: rank (GP §4.3), achievements (GP §4.5), tag mastery radar (GP §4.8.3), leaderboards,
 * realism and name.
 */
import type { CareerRankId, LeaderboardEntry, ProgressState, RootState } from '@/core/state';
import { ACHIEVEMENTS, RANKS, TAGS_BY_ID, TOPIC_TAGS, rankForXp } from '@/content';
import type { AchievementView, RankView, TagMasteryView } from '../../api';
import { realNowMs } from '../clock';
import { effectiveMastery, masteryLabel, parentTag, tagGroup } from './mastery';
import { promotionMissing, rankDef, rankIndex } from './xp';
import { achievementMeter } from './achievements';
import { boardEntries } from './leaderboards';

export function rankFor(xp: number): { id: string; title: string; minXp: number; nextXp: number | null } {
  const r = rankForXp(xp);
  return { id: r.id, title: r.title, minXp: r.minXp, nextXp: r.nextXp };
}

export function careerRank(s: RootState): RankView {
  const p = s.progress;
  const rank = rankDef(p.rank);
  const next = RANKS[rankIndex(p.rank) + 1] ?? null;
  const pending = next ? promotionMissing(s, next) : [];
  const xpToNext = next ? Math.max(0, next.minXp - p.xp) : 0;
  const span = next ? next.minXp - rank.minXp : 1;
  return { rank, next, xp: p.xp, xpToNext, pending, progress: next ? Math.max(0, Math.min(1, (p.xp - rank.minXp) / Math.max(1, span))) : 1 };
}

export function achievementViews(s: RootState): AchievementView[] {
  return ACHIEVEMENTS.map((def) => {
    const u = s.progress.achievements[def.id];
    const secret = !!def.hidden;
    const reveal = !secret || !!u;
    return {
      id: def.id,
      def,
      title: reveal ? def.title : '???',
      description: reveal ? def.description : 'Secret achievement.',
      xp: def.xp ?? 0,
      icon: reveal ? (def.icon ?? null) : null,
      secret,
      unlocked: !!u,
      unlockedAt: u?.unlockedAt ?? null,
      meter: reveal ? achievementMeter(s, def.id) : null,
    };
  });
}

export function tagView(p: ProgressState, tag: string, now: number): TagMasteryView {
  const tm = p.tagMastery[tag];
  const def = TAGS_BY_ID[tag] ?? null;
  return {
    tag,
    def,
    parent: def?.parent ?? parentTag(tag),
    group: tagGroup(tag),
    taughtIn: def?.taughtIn ?? '',
    m: tm?.m ?? 0,
    mEff: effectiveMastery(tm, now),
    level: tm?.level ?? 0,
    label: masteryLabel(tm, now),
    lastEvidenceAt: tm?.lastEvidenceAt ?? 0,
  };
}

/** Every declared fine tag plus any other tag with evidence. */
export function masteryViews(s: RootState): TagMasteryView[] {
  const now = realNowMs();
  const tags = new Set<string>(TOPIC_TAGS.filter((t) => t.kind === 'fine').map((t) => t.id));
  for (const t of Object.keys(s.progress.tagMastery)) tags.add(t);
  return [...tags].sort().map((t) => tagView(s.progress, t, now));
}

export function weakestTagViews(s: RootState, n: number): TagMasteryView[] {
  return masteryViews(s)
    .filter((v) => v.label !== 'new')
    .sort((a, b) => a.mEff - b.mEff || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(0, n));
}

export function leaderboard(s: RootState, boardId: string): LeaderboardEntry[] {
  return boardEntries(s.progress, boardId);
}

export function isRank(id: string): id is CareerRankId {
  return RANKS.some((r) => r.id === id);
}
