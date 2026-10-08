/**
 * Player feedback written by the runtime: toasts, sticky banners, mentor barks (subtitles), Teach
 * Cards (GP §5.5), LabChat posts, notebook evidence and Field Manual unlocks. All writers take the
 * transaction draft + context (call them inside `transact`).
 */
import type { TxContext } from '@/core/store';
import type { Banner, EvidenceSource, NpcKey, RootState, TeachCard, TeachCardContent, Toast } from '@/core/state';
import { BARKS_BY_ID, articleById, personName, personText } from '@/content';
import { simRun } from './simx';

let toastSeq = 0;
let cardSeq = 0;
let evidenceSeq = 0;

declare module '@/core/events' {
  interface EventMap {
    /** Non-blocking mentor/coworker one-liner (GP §5.4): subtitle top-centre, 4 s, queue max 2. */
    'mission.bark': { speaker: string; text: string; barkId: string | null; priority: 'safety' | 'ticket' | 'flavour' };
    /** Ask the world/engine to move the player to a location anchor (SetupSpec.spawn). */
    'mission.teleportRequested': { locationId: string };
    /** NPC choreography for the world (walk over, perform a fix, go idle, leave). */
    'mission.npcAction': { npc: string; action: 'walk-to' | 'fix' | 'idle' | 'leave'; target: string | null };
  }
}

export function toast(d: RootState, kind: Toast['kind'], title: string, body?: string, icon?: string): void {
  const t: Toast = { id: `mt${++toastSeq}`, kind, title, createdAtMs: d.lab.time.nowMs };
  if (body) t.body = body;
  if (icon) t.icon = icon;
  d.ui.toasts.push(t);
  if (d.ui.toasts.length > 12) d.ui.toasts.splice(0, d.ui.toasts.length - 12);
}

export function setBanner(d: RootState, id: string, kind: Banner['kind'], text: string, untilS: number | null = null): void {
  const existing = d.ui.banners.find((b) => b.id === id);
  if (existing) {
    existing.kind = kind;
    existing.text = text;
    existing.untilS = untilS;
  } else d.ui.banners.push({ id, kind, text, untilS });
}

export function removeBanner(d: RootState, id: string): void {
  const i = d.ui.banners.findIndex((b) => b.id === id);
  if (i >= 0) d.ui.banners.splice(i, 1);
}

/** Drop expired banners/callouts (called every tick). */
export function expireUi(d: RootState): void {
  const now = d.session.clockS;
  if (d.ui.banners.some((b) => b.untilS !== null && b.untilS <= now)) d.ui.banners = d.ui.banners.filter((b) => b.untilS === null || b.untilS > now);
  if (d.ui.callouts && d.ui.callouts.untilS <= now) d.ui.callouts = null;
}

/** A subtitle bark (`text` may contain `{{name}}` people tokens). */
export function bark(d: RootState, ctx: TxContext, speaker: NpcKey | string, text: string, priority: 'safety' | 'ticket' | 'flavour' = 'flavour', barkId: string | null = null): void {
  const line = personText(text);
  ctx.emit('mission.bark', { speaker, text: line, barkId, priority });
  ctx.emit('dialogue.shown', { lineId: barkId ?? `bark-${toastSeq + 1}`, speaker, text: line });
  if (d.progress.settings.subtitles !== false) toast(d, 'info', personName(speaker), line);
}

export function barkById(d: RootState, ctx: TxContext, barkId: string, priority: 'safety' | 'ticket' | 'flavour' = 'flavour'): void {
  const b = BARKS_BY_ID[barkId];
  if (b) bark(d, ctx, b.speaker, b.text, priority, barkId);
}

/**
 * Show a Teach Card. Academy: centre modal (`teach-card` overlay) when nothing else owns the screen;
 * Shift: right-hand panel (collapses to a chip after 5 s); drills: inline (the drill overlay reads it).
 */
export function pushTeachCard(
  d: RootState,
  ctx: TxContext,
  content: TeachCardContent,
  trigger: TeachCard['trigger'],
  ticketId: string | null = null,
  masteryChange: TeachCard['masteryChange'] = null,
): TeachCard {
  const card: TeachCard = {
    ...stripUndefined(content),
    whatHappened: personText(content.whatHappened),
    why: personText(content.why),
    doInstead: personText(content.doInstead),
    id: `tc${++cardSeq}`,
    trigger,
    ticketId,
    masteryChange,
    createdAtS: d.session.clockS,
    collapsed: false,
  };
  d.ui.teachCards.push(card);
  if (d.ui.teachCards.length > 20) d.ui.teachCards.splice(0, d.ui.teachCards.length - 20);
  if (d.session.mode === 'academy' && d.ui.overlay.kind === 'none') d.ui.overlay = { kind: 'teach-card', teachCardId: card.id };
  ctx.emit('teachCard.shown', { teachCardId: card.id, trigger: trigger.kind, ref: trigger.ref });
  return { ...card };
}

function stripUndefined<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Collapse Shift teach cards older than 5 s (GP §5.5). */
export function collapseTeachCards(d: RootState): void {
  if (d.session.mode === 'academy') return;
  for (const c of d.ui.teachCards) if (!c.collapsed && d.session.clockS - c.createdAtS >= 5) c.collapsed = true;
}

/** Notebook evidence line ("Notes: connect timed out after 10000 ms @ 08:15 — EVE"). */
export function captureEvidence(d: RootState, ctx: TxContext, source: EvidenceSource, text: string, rig: string | null = null, ticketId: string | null = null): void {
  const ev = d.session.notebook.evidence;
  if (ev.length && ev[ev.length - 1]!.text === text) return;
  const id = `ev${d.session.runId}-${++evidenceSeq}`;
  ev.push({ id, source, text, atGameMs: d.lab.time.nowMs, rig, ticketId });
  if (ev.length > 200) ev.splice(0, ev.length - 200);
  ctx.emit('notebook.evidenceCaptured', { evidenceId: id, source, text, rig });
}

/** Unlock a Field Manual entry ("New entry" sparkle). */
export function unlockManual(d: RootState, ctx: TxContext, entryId: string, source: string): boolean {
  const fm = d.progress.fieldManual;
  if (fm.unlocked.includes(entryId)) return false;
  fm.unlocked.push(entryId);
  ctx.emit('manual.entryUnlocked', { entryId, source });
  toast(d, 'manual', 'New Field Manual entry', articleById(entryId)?.title ?? entryId);
  return true;
}

/** Post a LabChat message now or after `delayS` real seconds (NPC replies 10–20 s, GP SR18). */
export function postChat(channel: string, author: string, text: string, ticketId?: string, delayS = 0): void {
  const msg = personText(text);
  if (delayS > 0) {
    simRun('chat.schedule', (s) => s.chat.schedule(channel, author, msg, Math.round(delayS * 1000), ticketId), '');
  } else simRun('chat.post', (s) => s.chat.post(channel, author, msg, ticketId), undefined);
}

export function nextCardId(): number {
  return cardSeq;
}
