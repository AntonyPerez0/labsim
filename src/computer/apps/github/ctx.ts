/** GitHub page context and the session-local review-event log (timeline). */
import { createContext, useContext } from 'react';
import { bus } from '@/core/bus';
import { getState, useGame } from '@/core/store';
import type { WindowManagerApi } from '@/computer/apps';

export interface GhCtx {
  route: string;
  navigate(route: string, opts?: { replace?: boolean }): void;
  wm: WindowManagerApi | null;
  /** `restrictions.github.repos` (null = all). */
  repos: string[] | null;
  readOnly: boolean;
  playerName: string;
  playerInitials: string;
  toast(text: string): void;
  focused: boolean;
}

export const GitHubContext = createContext<GhCtx | null>(null);

export function useGh(): GhCtx {
  const c = useContext(GitHubContext);
  if (!c) throw new Error('GitHub context missing');
  return c;
}

export function useNow(): number {
  return useGame((s) => Math.floor(s.lab.time.nowMs / 10_000) * 10_000);
}

/* ── review events seen since the GitHub chunk loaded (the sim keeps only the verdict) ── */

export interface ReviewEvent {
  repo: string;
  number: number;
  by: string;
  verdict: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  atMs: number;
  body?: string;
}

const reviewLog: ReviewEvent[] = [];
const listeners = new Set<() => void>();
let started = false;

export function startReviewLog(): void {
  if (started) return;
  started = true;
  bus.on('github.prReviewed', (e) => {
    reviewLog.push({ repo: e.repo, number: e.number, by: e.by, verdict: e.verdict, atMs: getState().lab.time.nowMs });
    for (const fn of [...listeners]) fn();
  });
}

export function noteReviewBody(repo: string, number: number, by: string, body: string): void {
  for (let i = reviewLog.length - 1; i >= 0; i--) {
    const r = reviewLog[i]!;
    if (r.repo === repo && r.number === number && r.by === by) {
      r.body = body;
      break;
    }
  }
}

export function reviewEvents(repo: string, number: number): ReviewEvent[] {
  return reviewLog.filter((r) => r.repo === repo && r.number === number);
}

export function onReviewLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function simTry<T>(fn: () => { ok: true; value: T } | { ok: false; error: string }): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return fn();
  } catch (err) {
    console.warn('[github] sim call failed', err);
    return { ok: false, error: 'Something went wrong.' };
  }
}
