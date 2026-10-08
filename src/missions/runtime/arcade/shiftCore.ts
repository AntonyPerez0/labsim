/**
 * Shift score primitives shared by tickets, penalties, pipelines and the director: score deltas with
 * pop-up events, combo (GP §2.3.8), strikes and early end (GP §2.3.9), bonus log.
 */
import type { TxContext } from '@/core/store';
import type { BonusEvent, RootState, ShiftState, TicketState } from '@/core/state';
import { barkById } from '../feedback';
import { comboMultiplier } from './scoring';

let bonusSeq = 0;
let penaltySeq = 0;

export function nextPenaltyId(): string {
  return `pen${++penaltySeq}`;
}

export function shiftOf(d: RootState): ShiftState | null {
  const sh = d.session.shift;
  return sh && sh.phase === 'running' ? sh : null;
}

export function scoringOn(d: RootState): boolean {
  const sh = shiftOf(d);
  return !!sh && sh.rules.scoring;
}

/** Apply a score delta (no-op when the shift does not score). */
export function addScore(d: RootState, ctx: TxContext, delta: number, reason: string, ticketId: string | null): void {
  const sh = shiftOf(d);
  if (!sh || !sh.rules.scoring || !delta) return;
  sh.score += delta;
  d.session.score.points = sh.score;
  ctx.emit('shift.scoreChanged', { score: sh.score, delta, reason, ticketId });
}

export function resetCombo(d: RootState, ctx: TxContext): void {
  const sh = shiftOf(d);
  if (!sh || sh.combo === 0) return;
  sh.combo = 0;
  sh.multiplier = 1;
  d.session.score.combo = 0;
  ctx.emit('shift.comboChanged', { combo: 0, multiplier: 1, reset: true });
}

export function bumpCombo(d: RootState, ctx: TxContext): number {
  const sh = shiftOf(d);
  if (!sh) return 0;
  sh.combo++;
  sh.maxCombo = Math.max(sh.maxCombo, sh.combo);
  sh.multiplier = comboMultiplier(sh.combo);
  d.session.score.combo = sh.combo;
  d.session.score.maxCombo = sh.maxCombo;
  ctx.emit('shift.comboChanged', { combo: sh.combo, multiplier: sh.multiplier, reset: false });
  if (sh.combo === 4) barkById(d, ctx, 'BARK_MORGAN_05');
  return sh.combo;
}

export function addBonus(d: RootState, ctx: TxContext, pbId: string, points: number, ticketId: string | null, detail: string): BonusEvent | null {
  const sh = shiftOf(d);
  if (!sh) return null;
  const ev: BonusEvent = { id: `bon${++bonusSeq}`, pbId, atS: d.session.clockS, points, ticketId, detail };
  sh.bonuses.push(ev);
  if (ticketId) d.session.tickets.find((t) => t.id === ticketId)?.bonusIds.push(ev.id);
  addScore(d, ctx, points, pbId, ticketId);
  if (pbId.startsWith('PB')) ctx.emit('pb.awarded', { pbId, points, ticketId });
  return ev;
}

/** Strike (GP §2.3.9). Returns true when the shift must end now. */
export function addStrike(d: RootState, ctx: TxContext, reason: string, gwId: string | null, ticketId: string | null): boolean {
  const sh = shiftOf(d);
  if (!sh) return false;
  sh.strikes++;
  sh.strikeLog.push({ atS: d.session.clockS, reason, gwId, ticketId });
  ctx.emit('shift.strike', { strikes: sh.strikes, reason, gwId });
  resetCombo(d, ctx);
  return sh.rules.strikesToEnd !== null && sh.strikes >= sh.rules.strikesToEnd;
}

/** Tickets that are still open (count toward max open / handover). */
export function isOpen(t: TicketState): boolean {
  return t.status !== 'resolved' && t.status !== 'handover' && t.status !== 'failed';
}

export function openTickets(d: RootState): TicketState[] {
  return d.session.tickets.filter(isOpen);
}

/**
 * The ticket a penalty is charged to: an open ticket binding the affected rig, else the selected
 * in-progress ticket, else the most recent in-progress one, else none (shift score directly).
 */
export function ticketForCharge(d: RootState, rigs: readonly string[]): TicketState | null {
  const open = openTickets(d);
  if (rigs.length) {
    const t = open.find((x) => rigs.some((r) => x.binding.rig === r || x.binding.rigs.includes(r)));
    if (t) return t;
  }
  const sel = open.find((x) => x.id === d.ui.selectedTicketId && x.status === 'in-progress');
  if (sel) return sel;
  const ip = open.filter((x) => x.status === 'in-progress' || x.status === 'escalated');
  return ip.length ? ip[ip.length - 1]! : null;
}
