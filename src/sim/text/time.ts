/**
 * Game-clock formatting (Sim §0.2): every timestamp the sim writes comes from `time.nowMs` through
 * these helpers. Pure integer calendar maths — no `Date` (Sim §6.6).
 */
import type { TimeState } from '../types';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_UP = MONTHS.map((m) => m.toUpperCase());
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type T = Pick<TimeState, 'epochDate'>;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: m <= 2 ? y + 1 : y, m, d };
}

export interface GameDate {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  /** 0 = Sunday. */
  wd: number;
}

/** Calendar parts of a game-clock instant (negative ms = previous days). */
export function gameDate(time: T, ms: number): GameDate {
  const [ey, em, ed] = time.epochDate.split('-').map(Number) as [number, number, number];
  const dayOffset = Math.floor(ms / DAY_MS);
  const msOfDay = ms - dayOffset * DAY_MS;
  const days = daysFromCivil(ey, em, ed) + dayOffset;
  const { y, m, d } = civilFromDays(days);
  const wd = (((days + 4) % 7) + 7) % 7;
  const totalS = Math.floor(msOfDay / 1000);
  return { y, mo: m, d, h: Math.floor(totalS / 3600), mi: Math.floor((totalS % 3600) / 60), s: totalS % 60, wd };
}

/** `2026-10-05 08:15:00` (Sim §0.2). */
export function fmtStamp(time: T, ms: number): string {
  const t = gameDate(time, ms);
  return `${t.y}-${pad2(t.mo)}-${pad2(t.d)} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}

/** `08:25:00`. */
export function fmtClock(time: T, ms: number): string {
  const t = gameDate(time, ms);
  return `${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}

/** Journal short format `Oct 05 08:11:42` (Sim §4.3.11). */
export function fmtJournal(time: T, ms: number): string {
  const t = gameDate(time, ms);
  return `${MONTHS[t.mo - 1]} ${pad2(t.d)} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}

/** systemd format `Mon 2026-10-05 08:11:42 EDT` (Sim §3.14.1). */
export function fmtSystemd(time: T, ms: number): string {
  const t = gameDate(time, ms);
  return `${WEEKDAYS[t.wd]} ${t.y}-${pad2(t.mo)}-${pad2(t.d)} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} EDT`;
}

/** Windows `10/06/2026 10:00:00` (schtasks, Sim §3.14.6). */
export function fmtWindows(time: T, ms: number): string {
  const t = gameDate(time, ms);
  return `${pad2(t.mo)}/${pad2(t.d)}/${t.y} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}

/** Windows `dir` listing date `10/04/2026  10:00 AM`. */
export function fmtWindowsDir(time: T, ms: number): string {
  const t = gameDate(time, ms);
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${pad2(t.mo)}/${pad2(t.d)}/${t.y}  ${pad2(h12)}:${pad2(t.mi)} ${t.h < 12 ? 'AM' : 'PM'}`;
}

/** Receipt / lock-screen time `09:14 AM`. */
export function fmtTime12(time: T, ms: number): string {
  const t = gameDate(time, ms);
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${pad2(h12)}:${pad2(t.mi)} ${t.h < 12 ? 'AM' : 'PM'}`;
}

/** Lock-screen / tablet clock `9:14 AM` (no leading zero). */
export function fmtClockShort(time: T, ms: number): string {
  const t = gameDate(time, ms);
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${h12}:${pad2(t.mi)} ${t.h < 12 ? 'AM' : 'PM'}`;
}

/** `MON, OCT 5` for the given instant's day. */
export function fmtDateLabel(time: T, ms: number): string {
  const t = gameDate(time, ms);
  return `${WEEKDAYS[t.wd]!.toUpperCase()}, ${MONTHS_UP[t.mo - 1]} ${t.d}`;
}

/** Elapsed duration as systemd prints it: `3min 18s`, `1h 9min`, `45s`. */
export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

/** `$10.83` from integer cents (Sim §0.2). Negative amounts print `-$1.00`. */
export function fmtMoney(cents: number): string {
  const neg = cents < 0;
  const c = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}$${Math.floor(c / 100)}.${pad2(c % 100)}`;
}

/** Basis points → `8.25%` (two decimals, Sim §3.9.7). */
export function fmtRateBp(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

/** Orca coordinate formatting: one decimal (`22.0`, Sim §0.2). */
export function fmtMm(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

/** Round to one decimal place (Orca rows, Sim §6.6 #2). */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
