/** Jenkins page context (navigation, gating, player) shared by every page component. */
import { createContext, useContext } from 'react';
import type { WindowManagerApi } from '@/computer/apps';
import { useGame } from '@/core/store';

export interface JkCtx {
  route: string;
  navigate(route: string, opts?: { replace?: boolean }): void;
  wm: WindowManagerApi | null;
  /** `restrictions.jenkins.visibleJobs` (null = all). */
  gate: string[] | null;
  /** `restrictions.jenkins.readOnly`. */
  readOnly: boolean;
  playerName: string;
  /** Transient top-right pill (`Build scheduled`, `Saved`). */
  notice(text: string): void;
  focused: boolean;
}

export const JenkinsContext = createContext<JkCtx | null>(null);

export function useJk(): JkCtx {
  const c = useContext(JenkinsContext);
  if (!c) throw new Error('Jenkins context missing');
  return c;
}

/** Game clock rounded to the second (re-render once per game second). */
export function useNowSec(): number {
  return useGame((s) => Math.floor(s.lab.time.nowMs / 1000) * 1000);
}

/** Run a sim call; an exception means the sim is not implemented → Jenkins generic failure (Apps §0.4). */
export function simTry<T>(fn: () => { ok: true; value: T } | { ok: false; error: string }): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return fn();
  } catch (err) {
    console.warn('[jenkins] sim call failed', err);
    return { ok: false, error: 'java.lang.IllegalStateException: Internal server error' };
  }
}
