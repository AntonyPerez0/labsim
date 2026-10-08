/**
 * Non-serialisable per-ticket runtime data (resolved incident definition, binding, condition scope,
 * counters, local wrong moves charged) and pending spawns waiting for their reveal event. Reset per
 * activity. Ticket *state* lives in `session.tickets`.
 */
import type { IncidentBinding, IncidentDef } from '../../types';
import type { Scope } from '../conditions/evaluate';
import { disposeScope } from '../conditions/evaluate';
import { onActivityReset } from '../rt';

export interface TicketRt {
  ticketId: string;
  def: IncidentDef;
  binding: IncidentBinding;
  scope: Scope;
  /** Event log seq at spawn (process bonuses, wrong moves). */
  spawnSeq: number;
  /** Local wrong-move ids already charged. */
  charged: Set<string>;
  /** Escalation: Jared's fix actions already run. */
  jaredFixRun: boolean;
  /** Walkthrough cue index reached. */
  cueIndex: number;
  /** Session clock of the last Jenkins Bot verification re-run (see `kickVerificationBuild`). */
  verifyKickAtS?: number;
}

/** An injected incident waiting for its reveal event (GP §3.4 / Sim §4.1.9). */
export interface PendingSpawn {
  key: string;
  def: IncidentDef;
  binding: IncidentBinding;
  variantId: string;
  misleading: boolean;
  reporterOverride: string | null;
  instanceIds: string[];
  injectedAtS: number;
  /** Fallback: reveal anyway after this many real seconds. */
  revealByS: number;
  plannedWork: boolean;
  notYetTaught: boolean;
  compoundKey: string | null;
  source: 'shift' | 'pipeline' | 'freeplay' | 'cert' | 'weak-spot' | 'event' | 'academy';
  planSlot: number | null;
  injectionId: string | null;
}

export const TR = {
  tickets: new Map<string, TicketRt>(),
  pending: [] as PendingSpawn[],
  usedTicketIds: new Set<string>(),
};

onActivityReset(() => {
  for (const t of TR.tickets.values()) disposeScope(t.scope.id);
  TR.tickets.clear();
  TR.pending = [];
  TR.usedTicketIds.clear();
});

export function ticketRt(id: string): TicketRt | undefined {
  return TR.tickets.get(id);
}
