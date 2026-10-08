/**
 * Real-clock boundary of the mission runtime (ARCHITECTURE rule 4).
 *
 * Mission logic never reads the wall clock directly. Real dates (Leitner due days, streaks, the Daily
 * Challenge seed, `…At` epoch timestamps in `progress`) come through this one object, so tests can pin
 * time with `setRealClock()`. Game time is `lab.time.nowMs`; session real seconds are `session.clockS`.
 */
import * as persistence from '@/core/persistence';

export interface RealClock {
  /** Real epoch ms (for `…At` fields). */
  epochMs(): number;
  /** Local day number (days since 1970-01-01, local time) — `dayNumber()` in `@/core/persistence`. */
  day(): number;
}

type PersistenceClockExtras = { epochMs?: () => number; dateKey?: (day: number) => string };
const extras = persistence as unknown as PersistenceClockExtras;

const defaultClock: RealClock = {
  epochMs: () => (typeof extras.epochMs === 'function' ? extras.epochMs() : new Date().getTime()),
  day: () => persistence.dayNumber(),
};

let clock: RealClock = defaultClock;

/** Tests / tools: pin the real clock (pass null to restore the default). */
export function setRealClock(c: RealClock | null): void {
  clock = c ?? defaultClock;
}

export function realNowMs(): number {
  return clock.epochMs();
}

export function today(): number {
  return clock.day();
}

/** `YYYY-MM-DD` for a local day number (pure). */
export function dateKey(day: number): string {
  if (typeof extras.dateKey === 'function') return extras.dateKey(day);
  const d = new Date(day * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function todayKey(): string {
  return dateKey(today());
}

/** Epoch ms of local midnight that starts `day` (Leitner `due`). */
export function dayStartEpochMs(day: number): number {
  // dayNumber() = floor((t − tzOffset) / 1 day) ⇒ local midnight of `day` ≈ day × 1 day + tzOffset.
  const approx = day * 86_400_000;
  const offset = new Date(approx).getTimezoneOffset() * 60_000;
  return approx + offset;
}

/** Whole days between two epoch ms values (fractional allowed for the forgetting curve). */
export function daysBetween(fromEpochMs: number, toEpochMs: number): number {
  if (!fromEpochMs) return 0;
  return Math.max(0, (toEpochMs - fromEpochMs) / 86_400_000);
}
