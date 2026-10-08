/**
 * sim-devops shared helpers: game-clock formatting, money, SHA generation (Sim §3.22.1), properties
 * files, RNG draws through CoreServices-independent streams. Pure functions only (no DOM, no Date).
 */
import { nextFloat } from '@/core/rng';
import type { LabState, RngStream } from '../types';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Calendar parts of a game-clock instant (epoch date + nowMs; negative = previous days). Pure integer maths. */
export function gameDate(lab: Pick<LabState, 'time'>, ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: number; msOfDay: number } {
  const [ey, em, ed] = lab.time.epochDate.split('-').map(Number) as [number, number, number];
  const dayOffset = Math.floor(ms / DAY_MS);
  const msOfDay = ms - dayOffset * DAY_MS;
  // days from civil (Howard Hinnant) → add offset → back
  const epochDays = daysFromCivil(ey, em, ed) + dayOffset;
  const { y, m, d } = civilFromDays(epochDays);
  const wd = (((epochDays + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  const totalS = Math.floor(msOfDay / 1000);
  return { y, mo: m, d, h: Math.floor(totalS / 3600), mi: Math.floor((totalS % 3600) / 60), s: totalS % 60, wd, msOfDay };
}

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

/** `2026-10-05 08:15:00` (Sim §0.2). */
export function fmtStamp(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  return `${t.y}-${pad2(t.mo)}-${pad2(t.d)} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}
/** `08:15:00`. */
export function fmtClock(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  return `${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}
/** Journal short format `Oct 05 08:11:42` (Sim §4.3.11). */
export function fmtJournal(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  return `${MONTHS[t.mo - 1]} ${pad2(t.d)} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
}
/** systemd `Mon 2026-10-05 08:11:42 EDT`. */
export function fmtSystemd(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  return `${WEEKDAYS[t.wd]} ${t.y}-${pad2(t.mo)}-${pad2(t.d)} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} EDT`;
}
/** `date` output `Mon Oct  5 09:41:07 EDT 2026`. */
export function fmtDateCmd(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  return `${WEEKDAYS[t.wd]} ${MONTHS[t.mo - 1]} ${String(t.d).padStart(2, ' ')} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} EDT ${t.y}`;
}
/** git log date `Mon Oct 5 09:41:07 2026 -0400`. */
export function fmtGitDate(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  return `${WEEKDAYS[t.wd]} ${MONTHS[t.mo - 1]} ${t.d} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} ${t.y} -0400`;
}
/** Windows `10/04/2026  10:00 AM` (dir listing) and `10/06/2026 10:00:00` (schtasks). */
export function fmtWinDir(lab: Pick<LabState, 'time'>, ms: number): string {
  const t = gameDate(lab, ms);
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${pad2(t.mo)}/${pad2(t.d)}/${t.y}  ${pad2(h12)}:${pad2(t.mi)} ${t.h < 12 ? 'AM' : 'PM'}`;
}
/** Human duration "1min 3s" (systemd style) from ms. */
export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}min`;
  return `${Math.floor(h / 24)} days`;
}
/** `uptime`-style "1:09". */
export function fmtUptime(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}:${pad2(m % 60)}` : `${m} min`;
}
/** Seconds with one decimal: "3.4 s". */
export const fmtSec = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

/** `$10.83` from integer cents (CAD prints `$` too). */
export function fmtMoney(cents: number): string {
  const neg = cents < 0;
  const c = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}$${Math.floor(c / 100)}.${pad2(c % 100)}`;
}
/** Round half up of a/b (integers, b > 0). */
export function roundHalfUpDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/* ── SHA (Sim §3.22.1): 40 hex from FNV-1a over `repo|parent|message|seq`, repeated ── */

function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function makeSha(repo: string, parent: string | null, message: string, seq: number | string): string {
  const base = `${repo}|${parent ?? ''}|${message}|${seq}`;
  let out = '';
  let h = 0x811c9dc5;
  for (let i = 0; out.length < 40; i++) {
    h = fnv1a(`${base}#${i}`, h ^ (i * 0x9e3779b1));
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 40);
}
/** Factory commits keep their documented short sha: pad deterministically to 40 hex. */
export function padSha(short: string, salt: string): string {
  return (short + makeSha('seed', short, salt, 0)).slice(0, 40);
}

/* ── RNG (Sim §6.1) ── */
export function draw(lab: LabState, stream: RngStream): number {
  return stream === 'core' ? nextFloat(lab.rng) : nextFloat(lab.rngStreams[stream]);
}

/* ── .properties ── */
export interface PropertiesFile {
  /** key → value in file order (last wins). */
  values: Record<string, string>;
  keys: string[];
}
export function parseProperties(text: string): PropertiesFile {
  const values: Record<string, string> = {};
  const keys: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line) ?? /^([^=:\s]+)$/.exec(line);
    if (!m) continue;
    const k = m[1]!;
    if (!(k in values)) keys.push(k);
    values[k] = (m[2] ?? '').trim();
  }
  return { values, keys };
}
/** Replace (or append) `key=value`, preserving every other line. */
export function setProperty(text: string, key: string, value: string): string {
  const lines = text.split('\n');
  let found = false;
  const re = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[=:]`);
  const out = lines.map((l) => {
    if (!found && re.test(l)) {
      found = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!found) {
    if (out.length && out[out.length - 1] === '') out.splice(out.length - 1, 0, `${key}=${value}`);
    else out.push(`${key}=${value}`);
  }
  return out.join('\n');
}

/** Workstation home: `~/x` ↔ absolute `/home/engineer/x`. */
export const HOME = '/home/engineer';
export function expandHome(p: string): string {
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return `${HOME}/${p.slice(2)}`;
  return p;
}
export function tildify(p: string): string {
  if (p === HOME) return '~';
  if (p.startsWith(`${HOME}/`)) return `~/${p.slice(HOME.length + 1)}`;
  return p;
}

/** Deep JSON equality (plain data only). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Game ms of a local stamp "YYYY-MM-DD HH:MM[:SS]" relative to the epoch date (negative = before). */
export function stampToMs(epochDate: string, stamp: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(stamp.trim());
  if (!m) throw new Error(`bad stamp ${stamp}`);
  const [ey, em, ed] = epochDate.split('-').map(Number) as [number, number, number];
  const days = daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3])) - daysFromCivil(ey, em, ed);
  return days * DAY_MS + (Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) * 1000;
}
