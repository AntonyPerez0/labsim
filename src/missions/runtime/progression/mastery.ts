/**
 * Tag mastery model (GP §4.8.3): per fine tag `m ∈ [0,1]`, `level ∈ 0..6`, forgetting half-lives,
 * evidence weights per source, labels, and the parent (curriculum module tag) roll-up.
 */
import type { TxContext } from '@/core/store';
import type { MasteryLabel, ProgressState, RootState, TagMastery } from '@/core/state';
import { TAGS_BY_ID, rootTag } from '@/content';
import { daysBetween, realNowMs } from '../clock';

export const HALF_LIFE_DAYS = [1, 2, 4, 7, 14, 30, 60] as const;

/** Evidence weights `w` (GP §4.8.3). */
export const EVIDENCE_WEIGHT = {
  flashcard: 0.5,
  drill: 0.5,
  quiz: 1.0,
  cert: 1.0,
  incident: 1.5,
  penalty: 2.0,
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_WEIGHT;

const LEVEL_UP_GAP_MS = 20 * 3_600_000;

export function effectiveMastery(tm: TagMastery | undefined, nowEpochMs: number = realNowMs()): number {
  if (!tm || !tm.evidence) return 0;
  const hl = HALF_LIFE_DAYS[Math.max(0, Math.min(6, tm.level))]!;
  const days = daysBetween(tm.lastEvidenceAt, nowEpochMs);
  return tm.m * Math.pow(0.5, days / hl);
}

export function masteryLabel(tm: TagMastery | undefined, nowEpochMs: number = realNowMs()): MasteryLabel {
  if (!tm || !tm.evidence) return 'new';
  const e = effectiveMastery(tm, nowEpochMs);
  if (e >= 0.85 && tm.level >= 4) return 'mastered';
  if (e < 0.6) return 'weak';
  return 'learning';
}

/** Days overdue relative to the half-life, clamped to [0, 3] (GP §4.8.4 `overdue`). */
export function overdue(tm: TagMastery | undefined, nowEpochMs: number = realNowMs()): number {
  if (!tm || !tm.evidence) return 0;
  const hl = HALF_LIFE_DAYS[Math.max(0, Math.min(6, tm.level))]!;
  return Math.max(0, Math.min(3, daysBetween(tm.lastEvidenceAt, nowEpochMs) / hl));
}

/**
 * Record one evidence event `(tag, q, w)`. Returns the effective mastery before and after.
 * Emits `mastery.changed`.
 */
export function addEvidence(d: RootState, ctx: TxContext, tag: string, q: number, kind: EvidenceKind, source: string): { before: number; after: number } {
  const now = realNowMs();
  const w = EVIDENCE_WEIGHT[kind];
  const map = d.progress.tagMastery;
  const prev = map[tag];
  const before = effectiveMastery(prev, now);
  const tm: TagMastery = prev ?? { m: 0, level: 0, lastEvidenceAt: 0, minSeen: 1, lastLevelUpAt: 0, evidence: 0 };
  const qq = Math.max(0, Math.min(1, q));
  // Decay is applied by the forgetting curve at read time; the update uses the stored m (GP formula).
  tm.m = Math.max(0, Math.min(1, tm.m + 0.3 * w * (qq - tm.m)));
  if (qq >= 0.8) {
    if (tm.level < 6 && now - (tm.lastLevelUpAt || 0) >= LEVEL_UP_GAP_MS) {
      tm.level++;
      tm.lastLevelUpAt = now;
    }
  } else if (qq < 0.5 && tm.level > 0) tm.level--;
  tm.lastEvidenceAt = now;
  tm.evidence = (tm.evidence || 0) + 1;
  tm.minSeen = prev?.evidence ? Math.min(tm.minSeen, tm.m) : tm.m;
  if (!prev) map[tag] = tm;
  const after = effectiveMastery(tm, now);
  ctx.emit('mastery.changed', { tag, before, after, source });
  return { before, after };
}

/** Apply the same evidence to several tags; returns the change of the first (for Teach Card chips). */
export function addEvidenceAll(d: RootState, ctx: TxContext, tags: readonly string[], q: number, kind: EvidenceKind, source: string): { tag: string; before: number; after: number } | null {
  let first: { tag: string; before: number; after: number } | null = null;
  for (const tag of new Set(tags)) {
    const r = addEvidence(d, ctx, tag, q, kind, source);
    first ??= { tag, ...r };
  }
  return first;
}

/** Mastery radar group of a tag (content tag group, else by prefix). */
export function tagGroup(tag: string): string {
  const def = TAGS_BY_ID[tag];
  if (def) return def.group;
  const prefix = tag.split('.')[0]!;
  const byPrefix: Record<string, string> = {
    arch: 'Architecture',
    orca: 'Orca',
    jenkins: 'Jenkins',
    uia: 'uia-remote',
    pigeon: 'Pigeon & Receipts',
    receipt: 'Pigeon & Receipts',
    adb: 'ADB',
    power: 'Power',
    hw: 'Hardware',
    bots: 'Bots & Cards',
    cards: 'Bots & Cards',
    laz: 'Merchants & SDK',
    ubi: 'Merchants & SDK',
    go: 'Merchants & SDK',
    semi: 'Merchants & SDK',
    vision: 'Vision & AI',
    tools: 'Tools & People',
    people: 'Tools & People',
  };
  return tag === 'tools.claude' ? 'Vision & AI' : (byPrefix[prefix] ?? 'Lab Basics');
}

export function parentTag(tag: string): string {
  return rootTag(tag);
}

/** Seen tags sorted weakest first (ties → most overdue). */
export function weakestSeenTags(progress: ProgressState, n: number, nowEpochMs: number = realNowMs()): string[] {
  return Object.entries(progress.tagMastery)
    .filter(([, tm]) => tm.evidence > 0)
    .map(([tag, tm]) => ({ tag, e: effectiveMastery(tm, nowEpochMs), o: overdue(tm, nowEpochMs) }))
    .sort((a, b) => a.e - b.e || b.o - a.o || a.tag.localeCompare(b.tag))
    .slice(0, n)
    .map((x) => x.tag);
}
