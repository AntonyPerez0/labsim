/**
 * Formatting helpers for the HUD and menus.
 */

/** 75 → "1:15"; negative values render with a minus sign. */
export function mmss(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const neg = seconds < 0;
  const s = Math.floor(Math.abs(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${neg ? '−' : ''}${m}:${String(r).padStart(2, '0')}`;
}

/** Game clock ms since game-midnight → "08:15" (24 h, as Orca/Jenkins timestamps). */
export function gameClock(nowMs: number): string {
  const day = 86_400_000;
  const t = ((nowMs % day) + day) % day;
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function gameClockSeconds(nowMs: number): string {
  const day = 86_400_000;
  const t = ((nowMs % day) + day) % day;
  const s = Math.floor((t % 60_000) / 1000);
  return `${gameClock(nowMs)}:${String(s).padStart(2, '0')}`;
}

export function num(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function signed(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toLocaleString('en-US')}`;
}

export function pct(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Real epoch ms → "Oct 6, 2026". */
export function dateLabel(epochMs: number): string {
  if (!epochMs) return '—';
  try {
    return new Date(epochMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

/** Seconds → "12 min" / "1 h 05 min". */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** "deck.M04" → "M04". */
export function deckModule(deck: string): string {
  return deck.replace(/^deck\./, '');
}

/** Rig system name → Human Readable Name ("wall-e" → "WALL-E"). */
export function hrn(rig: string | null | undefined): string {
  return rig ? rig.toUpperCase() : '—';
}

/** Short module title: "Welcome to the Lab: Orientation & Safety" → "Welcome to the Lab". */
export function shortTitle(title: string): string {
  const i = title.indexOf(':');
  return i > 0 ? title.slice(0, i) : title;
}

/** Module duration label: "10–12 min", or "20 min" when the range is a single value. */
export function estLabel(m: { estMinutes: number; estMinutesRange?: [number, number] }): string {
  const r = m.estMinutesRange;
  if (!r || r[0] === r[1]) return `${r ? r[0] : m.estMinutes} min`;
  return `${r[0]}–${r[1]} min`;
}
