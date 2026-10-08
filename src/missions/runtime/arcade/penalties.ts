/**
 * Global wrong actions (GP §3.3) and incident wrong moves (GP §3.4): detection from the player's events,
 * mode-specific consequences, Teach Cards (GP §5.5), barks, mastery evidence (penalty w = 2.0, q = 0),
 * Leitner demotion, strikes.
 *
 *   Shift / Weak Spot / cert shift  points + strikes, charged to the open ticket on that rig
 *   Academy                         Teach Card + mastery evidence only (spark-only damage, Cur M03)
 *   Free Play                       Teach Card always; points reported only with the penalties toggle
 *   Cert task practicals            strike GWs count as practical strikes
 */
import type { TxContext } from '@/core/store';
import type { PenaltyEvent, RootState, TeachCardContent } from '@/core/state';
import type { GlobalWrongActionDef, WrongMoveDef } from '../../types';
import { matchesEvent, evaluate } from '../conditions/evaluate';
import { barkById, pushTeachCard, toast } from '../feedback';
import { addEvidenceAll } from '../progression/mastery';
import { demoteFacts } from '../progression/leitner';
import { onActivityReset, type LogEntry } from '../rt';
import { hostById, rigsServedByHost, runtimeDevice } from '../lookups';
import { GLOBAL_WRONG_ACTIONS, GW_BARKS, GW_BY_ID, noteChatAsk, clearChatAsks } from './gw';
import { GWS, trackEvent } from './gwState';
import { addScore, addStrike, nextPenaltyId, resetCombo, shiftOf, ticketForCharge } from './shiftCore';
import { TR } from './ticketRuntime';
import { academyExemptsGw } from '../academy/gwExempt';
import { tpl } from './binding';

/** Extra GW definitions registered by content (`src/missions/arcade/incidents/gw.ts`), keyed by id. */
const extraGw = new Map<string, GlobalWrongActionDef>();
export function registerGlobalWrongActions(defs: readonly GlobalWrongActionDef[]): void {
  for (const g of defs) extraGw.set(g.id, g);
}
export function gwDef(id: string): GlobalWrongActionDef | undefined {
  return extraGw.get(id) ?? GW_BY_ID[id];
}
function allGw(): GlobalWrongActionDef[] {
  const ids = new Set([...GLOBAL_WRONG_ACTIONS.map((g) => g.id), ...extraGw.keys()]);
  return [...ids].map((id) => gwDef(id)!).filter(Boolean);
}

const lastFired = new Map<string, number>();
onActivityReset(() => {
  lastFired.clear();
  clearChatAsks();
});

/** Hooks wired by the director / certification modules (avoids import cycles). */
export const penaltyHooks = {
  endShift: null as ((d: RootState, ctx: TxContext, reason: 'strikes') => void) | null,
  certStrike: null as ((d: RootState, ctx: TxContext, reason: string, gwId: string | null) => void) | null,
};

export interface RaiseOptions {
  detail?: string;
  ticketId?: string | null;
  payload?: unknown;
  /** Rigs the action touched (charging). */
  rigs?: readonly string[];
  /** Override the strike decision (incident wrong moves). */
  strike?: boolean;
}

/** Rigs an event payload refers to. */
export function rigsOfPayload(d: RootState, payload: unknown): string[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const out = new Set<string>();
  const lab = d.lab;
  for (const k of ['rigId', 'name', 'robotName']) if (typeof p[k] === 'string' && lab.rigs?.[p[k] as string]) out.add(p[k] as string);
  if (typeof p.hostId === 'string') for (const r of rigsServedByHost(lab, p.hostId)) out.add(r);
  if (typeof p.loadId === 'string') {
    const l = lab.power?.loads?.[p.loadId];
    if (l?.rigId) out.add(l.rigId);
    if (l?.hostId) for (const r of rigsServedByHost(lab, l.hostId)) out.add(r);
    if (l?.deviceId) {
      const dev = runtimeDevice(lab, l.deviceId);
      if (dev?.rigId && lab.rigs?.[dev.rigId]) out.add(dev.rigId);
    }
  }
  if (typeof p.deviceId === 'string') {
    const dev = runtimeDevice(lab, p.deviceId);
    if (dev?.rigId && lab.rigs?.[dev.rigId]) out.add(dev.rigId);
  }
  if (typeof p.fuseId === 'string') {
    for (const t of TR.tickets.values()) if (t.binding.vars.fuse === p.fuseId) for (const r of t.binding.rigs) out.add(r);
  }
  return [...out];
}

/**
 * Raise a global wrong action. Returns the penalty event (also in Academy/Free Play, with 0 points), or
 * null when ignored (cooldown, wrong mode).
 */
export function raiseGw(d: RootState, ctx: TxContext, gwId: string, opts: RaiseOptions = {}): PenaltyEvent | null {
  const def = gwDef(gwId);
  if (!def) return null;
  const mode = d.session.mode;
  if (mode === 'menu' || mode === 'arcade-drill') return null;
  const now = d.session.clockS;
  const cooldown = def.cooldownS ?? 2;
  const last = lastFired.get(gwId);
  if (last !== undefined && now - last < cooldown) return null;
  lastFired.set(gwId, now);

  const sh = shiftOf(d);
  const scoring = !!sh && sh.rules.scoring;
  const strike =
    opts.strike ?? (def.strike === true || (def.strike === 'conditional' && !!def.strikeWhen?.(d, opts.payload ?? {})));
  const rigs = opts.rigs ?? rigsOfPayload(d, opts.payload);
  const ticket = opts.ticketId ? (d.session.tickets.find((t) => t.id === opts.ticketId) ?? null) : sh ? ticketForCharge(d, rigs) : null;
  const tag = def.tags[0] ?? null;

  // Mastery evidence (w = 2.0, q = 0) to the GW's tags, Leitner demotion of its facts.
  const mc = def.tags.length ? addEvidenceAll(d, ctx, def.tags, 0, 'penalty', `gw:${gwId}`) : null;
  if (def.factIds?.length) demoteFacts(d, def.factIds);
  d.progress.penalties[gwId] = (d.progress.penalties[gwId] ?? 0) + 1;

  const fpPenalties = mode === 'freeplay' && !!d.session.freeplay?.penalties;
  const points = scoring || fpPenalties ? -Math.abs(def.penalty) : 0;
  const card = pushTeachCard(d, ctx, def.teach, { kind: 'gw', ref: gwId }, ticket?.id ?? null, mc ? { tag: mc.tag, before: mc.before, after: mc.after } : null);
  const ev: PenaltyEvent = {
    id: nextPenaltyId(),
    gwId,
    atS: now,
    atMs: d.lab.time.nowMs,
    points,
    strike: strike && !!sh,
    ticketId: ticket?.id ?? null,
    detail: opts.detail ?? def.action,
    tag,
    teachCardId: card.id,
  };
  if (sh) {
    sh.penalties.push(ev);
    sh.stats.penaltyEvents++;
    d.session.score.mistakes++;
    if (ticket) ticket.penaltyIds.push(ev.id);
    if (points) addScore(d, ctx, points, gwId, ticket?.id ?? null);
    resetCombo(d, ctx);
  }
  ctx.emit('gw.triggered', { gwId, points, strike: ev.strike, ticketId: ev.ticketId, detail: ev.detail, tag });
  toast(d, 'penalty', points ? `${points} ${def.name}` : def.name, def.teach.whatHappened);
  const barkId = GW_BARKS[gwId];
  if (barkId) barkById(d, ctx, barkId, 'safety');
  if (gwId === 'GW05') GWS.paycoreOpenedAtS = now;

  if (strike && sh) {
    if (addStrike(d, ctx, def.name, gwId, ticket?.id ?? null)) penaltyHooks.endShift?.(d, ctx, 'strikes');
  } else if (strike && d.session.cert?.part === 'practical') {
    penaltyHooks.certStrike?.(d, ctx, def.name, gwId);
  }
  return ev;
}

/** Charge an incident-local wrong move (once per ticket unless repeatable). */
export function chargeWrongMove(d: RootState, ctx: TxContext, ticketId: string, move: WrongMoveDef, payload: unknown): void {
  const rt = TR.tickets.get(ticketId);
  const ticket = d.session.tickets.find((t) => t.id === ticketId);
  if (!rt || !ticket) return;
  if (!move.repeatable && rt.charged.has(move.id)) return;
  rt.charged.add(move.id);
  if (move.gw) {
    raiseGw(d, ctx, move.gw, { ticketId, payload, detail: move.text, ...(move.strike !== undefined ? { strike: move.strike } : {}) });
    return;
  }
  const sh = shiftOf(d);
  const key = `${rt.def.id}:${move.id}`;
  const teach: TeachCardContent = move.teach ?? {
    whatHappened: move.text,
    why: rt.def.teaches,
    doInstead: tpl(rt.def.fix.byTheBook ?? rt.def.fix.handsOn ?? rt.def.hints[1], rt.binding) || 'Follow the diagnosis path in the ticket.',
  };
  const tag = rt.def.tags[0] ?? null;
  const mc = tag ? addEvidenceAll(d, ctx, [tag], 0, 'penalty', `wrong:${key}`) : null;
  if (rt.def.factIds?.length) demoteFacts(d, rt.def.factIds);
  const card = pushTeachCard(d, ctx, teach, { kind: 'gw', ref: key }, ticketId, mc ? { tag: mc.tag, before: mc.before, after: mc.after } : null);
  const points = sh && sh.rules.scoring ? -Math.abs(move.penalty ?? 0) : 0;
  const ev: PenaltyEvent = { id: nextPenaltyId(), gwId: key, atS: d.session.clockS, atMs: d.lab.time.nowMs, points, strike: !!move.strike && !!sh, ticketId, detail: move.text, tag, teachCardId: card.id };
  if (sh) {
    sh.penalties.push(ev);
    sh.stats.penaltyEvents++;
    ticket.penaltyIds.push(ev.id);
    if (points) addScore(d, ctx, points, key, ticketId);
    resetCombo(d, ctx);
  }
  ctx.emit('gw.triggered', { gwId: key, points, strike: ev.strike, ticketId, detail: move.text, tag });
  toast(d, 'penalty', points ? `${points} ${move.text}` : move.text);
  if (move.strike) {
    if (sh) {
      if (addStrike(d, ctx, move.text, null, ticketId)) penaltyHooks.endShift?.(d, ctx, 'strikes');
    } else if (d.session.cert?.part === 'practical') penaltyHooks.certStrike?.(d, ctx, move.text, null);
  }
}

/** Feed one player event to GW detection and the open tickets' wrong moves. */
export function detectWrongActions(d: RootState, ctx: TxContext, e: LogEntry): void {
  trackEvent(e.type, e.payload);
  if (e.type === 'chat.message') {
    const p = e.payload as { author: string; text: string; channel?: string };
    // A DM to someone is asking them, whatever the words.
    if (p.author === 'player') noteChatAsk(p.channel?.startsWith('dm:') ? `${p.text} ${p.channel.slice(3)}` : p.text);
  }
  // Remember which local runs the runtime started (scenario setup): what they do is not the player's.
  if (e.type === 'test.localRunStarted' && e.suppressed) GWS.runtimeRuns.add(String((e.payload as { runId: string }).runId));
  if (e.type === 'test.localRunFinished') GWS.runtimeRuns.delete(String((e.payload as { runId: string }).runId));
  if (e.suppressed) return;
  const mode = d.session.mode;
  if (mode === 'menu' || mode === 'arcade-drill') return;
  for (const def of allGw()) {
    // Academy: the step that asks for this "mistake" on purpose is not penalised for it.
    if (mode === 'academy' && academyExemptsGw(d, def.id)) continue;
    for (const det of def.detect) {
      if (!matchesEvent(det.match, e.type, e.payload, d)) continue;
      let ok = true;
      if (det.when) {
        try {
          ok = det.when(d, e.payload);
        } catch (err) {
          console.warn(`[missions] ${def.id} detector threw`, err);
          ok = false;
        }
      }
      if (ok) {
        raiseGw(d, ctx, def.id, { payload: e.payload });
        break;
      }
    }
  }
  // PayCore overwrite after GW05 → strike (GP §2.3.9).
  if (GWS.paycoreOpenedAtS !== null && (e.type === 'laz.runFinished' || e.type === 'device.provisioned')) {
    const dev = String((e.payload as { deviceId?: string }).deviceId ?? '');
    if (/rosie/.test(dev) && shiftOf(d)) {
      GWS.paycoreOpenedAtS = null;
      if (addStrike(d, ctx, 'PayCore merchant overwritten', 'GW05', null)) penaltyHooks.endShift?.(d, ctx, 'strikes');
    }
  }
  // Incident-local wrong moves of open tickets — only for actions on that ticket's rigs when the event
  // names a rig (editing R2-D2's camera URL for one ticket is not INC08's "own Pi URL" move on Rack B).
  const subject = eventRig(d, e.type, e.payload);
  for (const rt of TR.tickets.values()) {
    const ticket = d.session.tickets.find((t) => t.id === rt.ticketId);
    if (!ticket || ticket.status === 'resolved' || ticket.status === 'handover' || ticket.status === 'failed') continue;
    const rigs = [ticket.binding.rig, ...ticket.binding.rigs].filter((r): r is string => !!r);
    if (subject && rigs.length && !rigs.includes(subject)) continue;
    for (const move of rt.def.wrongButTempting) {
      if (!move.detect || !matchesEvent(move.detect, e.type, e.payload, d)) continue;
      if (move.when && !evaluate(move.when, d, rt.scope)) continue;
      chargeWrongMove(d, ctx, rt.ticketId, move, e.payload);
    }
  }
}

export { hostById };

/** The rig (Orca robot name) an event is about, when its payload says so; null otherwise. */
function eventRig(d: RootState, type: string, payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (type === 'orca.entitySaved') {
    if (p.entity !== 'robot') return null;
    return Object.values(d.lab.orca?.robots ?? {}).find((r) => r.id === p.id)?.name ?? null;
  }
  for (const k of ['rigId', 'robotName', 'robot'] as const) if (typeof p[k] === 'string' && p[k]) return p[k] as string;
  if (type.startsWith('robot.') && typeof p.name === 'string') return p.name;
  return null;
}
