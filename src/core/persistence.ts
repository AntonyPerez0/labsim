/**
 * Progress persistence (localStorage). Only `progress` is persisted; the lab is re-seeded per
 * activity (Free Play can keep a lab snapshot under a separate key).
 */
import type { ProgressState } from './state';
import { createDefaultProgress, DEFAULT_SETTINGS, PROGRESS_VERSION } from './state';
import type { LabState } from '@/sim/types';

const PROGRESS_KEY = 'labsim.progress.v1';
// v3: device families (v2) and internal tool names renamed — older Free Play labs are discarded.
const FREEPLAY_KEY = 'labsim.freeplay.v3';
const OLD_FREEPLAY_KEYS = ['labsim.freeplay.v1', 'labsim.freeplay.v2'];

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
  // Renamed field (Pigeon → Parrot): keep practice records saved under the old key.
  const legacy = (parsed as Record<string, unknown>)['pigeonPractice'];
  if (isPlainObject(legacy) && !Object.keys(merged.parrotPractice ?? {}).length) merged.parrotPractice = legacy as ProgressState['parrotPractice'];
  delete (merged as unknown as Record<string, unknown>)['pigeonPractice'];
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

/* ───────────────────────── Export / import (a file the player keeps) ───────────────────────── */

/** `format` field of an exported progress file. */
export const EXPORT_FORMAT = 'labsim-progress';
/** Version of the export envelope (not of `ProgressState`, which travels as `progress.version`). */
export const EXPORT_VERSION = 1;
/** Imports larger than this are refused before parsing (a real save is well under 1 MB). */
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;

export interface ProgressExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  /** ISO timestamp of the export. */
  exportedAt: string;
  progress: ProgressState;
}

/** What the confirm dialog shows before an import replaces the current progress. */
export interface ProgressSummary {
  playerName: string;
  xp: number;
  rank: string;
  modulesDone: number;
  exportedAt: string | null;
}

export type ImportResult = { ok: true; progress: ProgressState; summary: ProgressSummary } | { ok: false; error: string };

/** Settings that describe this device rather than the player: an import keeps the current browser's values. */
export const DEVICE_SETTING_KEYS = ['quality', 'resolutionScale', 'dynamicResolution', 'autoQuality', 'frameRateCap', 'shadows', 'ao'] as const;
/** Flags that describe this device (hardware detection done once per browser). */
export const DEVICE_FLAG_KEYS = ['qualityDetected'] as const;

/**
 * The progress to store after an import: the imported player, with this device's graphics settings and
 * hardware-detection flags kept (a save from a desktop must not force "Ultra" onto a phone).
 */
export function withDeviceSettings(imported: ProgressState, current: ProgressState): ProgressState {
  const out: ProgressState = { ...imported, settings: { ...imported.settings }, flags: { ...imported.flags } };
  const settings = out.settings as unknown as Record<string, unknown>;
  const cur = current.settings as unknown as Record<string, unknown>;
  for (const k of DEVICE_SETTING_KEYS) if (k in cur) settings[k] = cur[k];
  for (const k of DEVICE_FLAG_KEYS) {
    if (k in current.flags) out.flags[k] = current.flags[k]!;
    else delete out.flags[k];
  }
  return out;
}

/** The JSON envelope written to an export file (a deep copy: later store changes never leak in). */
export function buildExportPayload(p: ProgressState, now: Date = new Date()): ProgressExport {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), progress: JSON.parse(JSON.stringify(p)) as ProgressState };
}

/** "labsim-progress-ada-2026-10-11.json" (name slugged to a–z, 0–9 and dashes). */
export function exportFileName(playerName: string, now: Date = new Date()): string {
  const slug =
    playerName
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 24) || 'player';
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `labsim-progress-${slug}-${d}.json`;
}

function countModulesDone(p: ProgressState): number {
  return Object.values(p.modules ?? {}).filter((m) => !!m && (m.status === 'complete' || m.completed)).length;
}

export function summarizeProgress(p: ProgressState, exportedAt: string | null = null): ProgressSummary {
  return { playerName: p.playerName, xp: p.xp, rank: p.rank, modulesDone: countModulesDone(p), exportedAt };
}

/**
 * Validate an exported file's text and turn it into a complete `ProgressState` (via `migrateProgress`).
 * Never throws; a bad file yields `{ ok: false, error }` with a message fit to show the player.
 */
export function parseProgressImport(text: string): ImportResult {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'That file is empty.' };
  if (text.length > IMPORT_MAX_BYTES) return { ok: false, error: 'That file is far too big to be a LabSim progress file.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON — pick the .json file LabSim exported.' };
  }
  if (!isPlainObject(parsed) || parsed.format !== EXPORT_FORMAT) return { ok: false, error: 'That JSON file is not a LabSim progress export.' };
  const version = typeof parsed.version === 'number' ? parsed.version : NaN;
  if (!Number.isFinite(version) || version < 1) return { ok: false, error: 'This progress file has no valid version number.' };
  if (version > EXPORT_VERSION) return { ok: false, error: 'This progress file comes from a newer version of LabSim. Update the game, then try again.' };
  const raw = parsed.progress;
  if (!isPlainObject(raw)) return { ok: false, error: 'This progress file has no progress in it.' };
  if (typeof raw.playerName !== 'string' || typeof raw.xp !== 'number' || !Number.isFinite(raw.xp) || raw.xp < 0) return { ok: false, error: 'This progress file looks damaged (no player name or XP).' };
  if (raw.modules !== undefined && !isPlainObject(raw.modules)) return { ok: false, error: 'This progress file looks damaged (modules).' };
  if (raw.flags !== undefined && !isPlainObject(raw.flags)) return { ok: false, error: 'This progress file looks damaged (flags).' };
  if (raw.settings !== undefined && !isPlainObject(raw.settings)) return { ok: false, error: 'This progress file looks damaged (settings).' };
  let progress: ProgressState;
  try {
    progress = migrateProgress(raw);
  } catch {
    return { ok: false, error: 'This progress file could not be read.' };
  }
  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
  return { ok: true, progress, summary: summarizeProgress(progress, exportedAt) };
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(FREEPLAY_KEY);
    for (const k of OLD_FREEPLAY_KEYS) localStorage.removeItem(k);
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
