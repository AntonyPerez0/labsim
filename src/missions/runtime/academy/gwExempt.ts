/**
 * Academy exemptions from the global wrong-action detectors (GP §5.4 GW01–GW24).
 *
 * Some lessons deliberately ask for an action that is a mistake anywhere else — push WALL-E's carriage
 * by hand to see the lock break (M04.11, GW06), pull EVE's Pi lead to watch Orca fail the ping (M06.07,
 * GW17). Penalising the instructed action (Teach Card, mastery evidence, Leitner demotion) teaches the
 * opposite of the lesson, so the step that asks for it — and the moment right after it completes, when
 * the action's follow-up events (e.g. the Pi's `host.powerChanged`) arrive — is exempt. M14 runs the
 * port-5555 collision on purpose (GW08) until the player has stopped it.
 */
import type { RootState } from '@/core/state';
import { L, currentStep } from './runner';

/** Step id → global wrong actions the step itself asks the player to perform. */
export const ACADEMY_GW_EXEMPT: Readonly<Record<string, readonly string[]>> = {
  'M04.11': ['GW06'],
  'M06.07': ['GW17'],
  // M14: the scripted 5555 collision — the run the lesson starts drives the coworker's desk Flex until
  // the player has walked over and stopped it (M14.05's own "still 5555" correction keeps GW08).
  'M14.01': ['GW08'],
  'M14.02': ['GW08'],
  'M14.03': ['GW08'],
  'M14.03a': ['GW08'],
  'M14.03b': ['GW08'],
};

/** Seconds after an exempt step completes during which its exemption still applies. */
const GRACE_S = 3;

export function academyExemptsGw(d: RootState, gwId: string): boolean {
  if (d.session.mode !== 'academy') return false;
  const step = currentStep(d);
  if (step && ACADEMY_GW_EXEMPT[step.id]?.includes(gwId)) return true;
  const last = L.lastCompleted;
  return !!last && d.session.clockS - last.atS <= GRACE_S && !!ACADEMY_GW_EXEMPT[last.id]?.includes(gwId);
}
