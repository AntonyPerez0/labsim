/**
 * Local leaderboards (GP §4.7): top 20 per board, last 30 daily boards kept. Board ids:
 * `shift:<5|10|20>:<standard|strict>`, `daily:<dateKey>:<realism>`, `dailyDrill:<dateKey>`, `drill:DRnn`.
 */
import type { LeaderboardEntry, ProgressState, RootState } from '@/core/state';
import { CONTENT_VERSION } from '@/core/state';

export const BOARD_SIZE = 20;
export const DAILY_BOARDS_KEPT = 30;

export interface BoardSubmission {
  score: number;
  grade?: LeaderboardEntry['grade'];
  medal?: LeaderboardEntry['medal'];
  accuracy?: number | null;
  seed?: string;
  maxCombo?: number;
  fastDiagnoses?: number;
  at: number;
}

/** Insert an entry; returns the 1-based placement (null when it did not make the board) and the delta vs. the previous personal best. */
export function submitScore(d: RootState, boardId: string, sub: BoardSubmission): { rank: number | null; deltaVsBest: number | null } {
  const p = d.progress;
  const board = (p.leaderboards[boardId] ??= []);
  const prevBest = board.filter((e) => e.profileId === p.profileId).reduce<number | null>((m, e) => (m === null || e.score > m ? e.score : m), null);
  const entry: LeaderboardEntry = {
    profileId: p.profileId,
    name: p.playerName.slice(0, 16),
    score: Math.round(sub.score),
    grade: sub.grade ?? null,
    medal: sub.medal ?? null,
    accuracy: sub.accuracy ?? null,
    at: sub.at,
    seed: sub.seed ?? '',
    realism: d.session.realism,
    contentVersion: CONTENT_VERSION,
    maxCombo: sub.maxCombo ?? 0,
    fastDiagnoses: sub.fastDiagnoses ?? 0,
  };
  board.push(entry);
  board.sort((a, b) => b.score - a.score || a.at - b.at);
  if (board.length > BOARD_SIZE) board.length = BOARD_SIZE;
  const idx = board.indexOf(entry);
  trimDailyBoards(p);
  return { rank: idx >= 0 ? idx + 1 : null, deltaVsBest: prevBest === null ? null : entry.score - prevBest };
}

function trimDailyBoards(p: ProgressState): void {
  const daily = Object.keys(p.leaderboards)
    .filter((k) => k.startsWith('daily:') || k.startsWith('dailyDrill:'))
    .map((k) => ({ k, date: k.split(':')[1] ?? '' }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const dates = [...new Set(daily.map((x) => x.date))];
  const keep = new Set(dates.slice(0, DAILY_BOARDS_KEPT));
  for (const { k, date } of daily) if (!keep.has(date)) delete p.leaderboards[k];
}

export function shiftBoardId(lengthMinutes: number, realism: string): string {
  return `shift:${lengthMinutes}:${realism}`;
}

export function boardEntries(p: ProgressState, boardId: string): LeaderboardEntry[] {
  return (p.leaderboards[boardId] ?? []).map((e) => ({ ...e }));
}
