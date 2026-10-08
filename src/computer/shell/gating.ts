/**
 * Lesson gating (Apps §1.11): `session.computer` written by missions narrows the desktop.
 * Gating focuses the trainee; it is not security, and it never changes lab state.
 */
import type { ComputerGating } from '@/core/state';
import { getState, useGameShallow } from '@/core/store';
import type { AppId } from '../apps';

export const LOCKED_TEXT = 'Unlocks later in the Academy';

export function isAppUnlocked(g: ComputerGating | undefined, app: AppId): boolean {
  if (!g || g.unlockedApps === 'all') return true;
  return g.unlockedApps.includes(app);
}

export function appUnlockedNow(app: AppId): boolean {
  return isAppUnlocked(getState().session.computer, app);
}

/** The unlocked-app list as a stable string (for selectors). */
export function useUnlockedApps(): 'all' | string[] {
  return useGameShallow((s) => s.session.computer?.unlockedApps ?? 'all') as 'all' | string[];
}

/** Read one app's restrictions object (unknown keys ignored by callers). */
export function restrictionsOf(g: ComputerGating | undefined, app: AppId): Record<string, string[] | string | boolean> {
  return (g?.restrictions?.[app] as Record<string, string[] | string | boolean> | undefined) ?? {};
}

export function useRestrictions(app: AppId): Record<string, string[] | string | boolean> {
  return useGameShallow((s) => restrictionsOf(s.session.computer, app));
}
