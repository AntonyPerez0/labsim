/**
 * Teach Cards (GP §5.5 buttons), Field Manual progress (unlock / read / bookmark) and the Notebook
 * (notes, pinned evidence).
 */
import type { TxContext } from '@/core/store';
import type { RootState } from '@/core/state';
import { unlockManual } from './feedback';

/** "Got it": remove the card (and its Academy modal). */
export function dismissTeachCard(d: RootState, teachCardId: string): void {
  const i = d.ui.teachCards.findIndex((c) => c.id === teachCardId);
  if (i >= 0) d.ui.teachCards.splice(i, 1);
  if (d.ui.overlay.kind === 'teach-card' && d.ui.overlay.teachCardId === teachCardId) {
    const next = d.session.mode === 'academy' ? d.ui.teachCards.find((c) => !c.collapsed && c.trigger.kind !== 'drill') : undefined;
    d.ui.overlay = next ? { kind: 'teach-card', teachCardId: next.id } : { kind: 'none' };
  }
  if (d.session.drill?.teach?.id === teachCardId) d.session.drill.teach = null;
}

/** Drill + tag of a card's **Practice** button. */
export function practiceTarget(d: RootState, teachCardId: string): { drillId: string; tags: string[] } | null {
  const card = d.ui.teachCards.find((c) => c.id === teachCardId) ?? d.session.result?.teachCards.find((c) => c.id === teachCardId) ?? (d.session.drill?.teach?.id === teachCardId ? d.session.drill.teach : null);
  if (!card?.practiceDrillId) return null;
  return { drillId: card.practiceDrillId, tags: card.tag ? [card.tag] : [] };
}

export function unlockManualEntry(d: RootState, ctx: TxContext, entryId: string, source: string): void {
  unlockManual(d, ctx, entryId, source);
}

export function markManualRead(d: RootState, entryId: string): void {
  const fm = d.progress.fieldManual;
  if (!fm.read.includes(entryId)) fm.read.push(entryId);
}

export function toggleBookmark(d: RootState, entryId: string): void {
  const b = d.progress.fieldManual.bookmarks;
  const i = b.indexOf(entryId);
  if (i >= 0) b.splice(i, 1);
  else b.push(entryId);
}

export function setNotes(d: RootState, text: string): void {
  d.progress.notebook.notes = text.slice(0, 20_000);
}

export function pinEvidence(d: RootState, evidenceId: string, pinned: boolean): void {
  const list = d.progress.notebook.pinnedEvidence;
  const i = list.findIndex((e) => e.id === evidenceId);
  if (!pinned) {
    if (i >= 0) list.splice(i, 1);
    return;
  }
  if (i >= 0) return;
  const ev = d.session.notebook.evidence.find((e) => e.id === evidenceId);
  if (ev) list.push({ ...ev });
  if (list.length > 100) list.splice(0, list.length - 100);
}
