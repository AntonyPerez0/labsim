/**
 * Progress persistence (localStorage). Only `progress` is persisted; the lab is re-seeded per
 * activity (Free Play can keep a lab snapshot under a separate key).
 */
import type { ProgressState } from './state';
import { createDefaultProgress, DEFAULT_SETTINGS, PROGRESS_VERSION } from './state';
import type { LabState } from '@/sim/types';

const PROGRESS_KEY = 'labsim.progress.v1';
const FREEPLAY_KEY = 'labsim.freeplay.v1';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Fill in defaults a save from an older build lacks, at every depth: a nested default (`streak`,
 * `stats`, `flashcards`, `shifts`, `daily`, `freeplay`, `fieldManual`, `notebook`, `cosmetics`,
 * `settings.bindings`, …) that a later build added must not read as `undefined`. Saved values win;
 * arrays and id-keyed maps (whose defaults are empty) are taken from the save as they are.
 */
export function mergeDefaults<T>(base: T, saved: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(saved)) return (saved === undefined ? base : saved) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(saved)) out[k] = k in base ? mergeDefaults((base as Record<string, unknown>)[k], v) : v;
  return out as T;
}

/** A parsed save → a complete `ProgressState` (also used by tests). */
export function migrateProgress(parsed: unknown): ProgressState {
  const base = createDefaultProgress();
  if (!isPlainObject(parsed)) return base;
  const merged = mergeDefaults(base, parsed);
  merged.settings = mergeDefaults({ ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings } }, parsed.settings);
  merged.version = PROGRESS_VERSION;
  return merged;
}

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createDefaultProgress();
    return migrateProgress(JSON.parse(raw));
  } catch (err) {
    console.warn('[persistence] could not load progress, starting fresh', err);
    return createDefaultProgress();
  }
}

export function saveProgress(p: ProgressState): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch (err) {
    console.warn('[persistence] could not save progress', err);
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(FREEPLAY_KEY);
  } catch {
    /* ignore */
  }
}

export function saveFreeplayLab(lab: LabState): void {
  try {
    localStorage.setItem(FREEPLAY_KEY, JSON.stringify(lab));
  } catch (err) {
    console.warn('[persistence] could not save free play lab', err);
  }
}

export function loadFreeplayLab(): LabState | null {
  try {
    const raw = localStorage.getItem(FREEPLAY_KEY);
    return raw ? (JSON.parse(raw) as LabState) : null;
  } catch {
    return null;
  }
}

/** Days since epoch (local time) — used for streaks, Leitner scheduling and daily challenges. */
export function dayNumber(d = new Date()): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
}
