/**
 * Ticket panel view (`missions.ticketView`): the ticket joined with its resolved incident texts —
 * shuffled Diagnosis Call options, replies, judgement task, escalation endpoint candidates, hints.
 */
import { createRngState, hashString, shuffle } from '@/core/rng';
import type { RootState } from '@/core/state';
import type { TicketView } from '../../api';
import { RT } from '../rt';
import { robotByName } from '../lookups';
import { tpl } from './binding';
import { TR } from './ticketRuntime';

export function ticketView(s: RootState, id: string): TicketView | null {
  const t = s.session.tickets.find((x) => x.id === id);
  const rt = TR.tickets.get(id);
  if (!t || !rt) return null;
  const def = rt.def;
  const b = rt.binding;
  const callOptions =
    def.diagnosisCall === 'none' || !t.canCall
      ? null
      : t.callOptionOrder.map((oid) => {
          const o = (def.diagnosisCall as Exclude<typeof def.diagnosisCall, 'none'>).options.find((x) => x.id === oid)!;
          return { id: o.id, text: tpl(o.text, b) };
        });
  const replies = def.replies ? def.replies.options.map((o) => ({ id: o.id, text: o.text })) : null;
  let task: TicketView['task'] = null;
  if (def.task?.kind === 'match') {
    const rng = createRngState(hashString(`${id}:task`));
    const right = shuffle(rng, [...def.task.pairs.map((p) => p.right), ...(def.task.distractors ?? [])]);
    task = {
      kind: 'match',
      prompt: def.task.prompt,
      left: def.task.pairs.map((p) => p.left),
      right,
      statusLine: def.task.statusLine ? { prompt: def.task.statusLine.prompt, options: def.task.statusLine.options.map((o) => ({ id: o.id, text: o.text })) } : null,
    };
  } else if (def.task?.kind === 'bug') {
    task = { kind: 'bug', prompt: def.task.prompt, fields: def.task.fields.map((f) => ({ id: f.id, label: f.label, unit: f.unit ?? null })) };
  }
  const sh = s.session.shift;
  const maxTier = sh ? sh.rules.hintsMaxTier : s.session.realism === 'strict' ? 1 : 3;
  const hints = def.hints.slice(0, t.hintTier).map((h) => tpl(h, b));
  return {
    ticket: { ...t },
    incidentName: def.name,
    callOptions,
    replies,
    task,
    escalatable: def.escalatable,
    endpointCandidates: endpointCandidates(s, t.binding.rigs.length ? t.binding.rigs : t.binding.rig ? [t.binding.rig] : []),
    nextHintTier: t.hintTier < maxTier ? t.hintTier + 1 : 0,
    hints,
    verifyingLabel: t.verifying?.label ?? null,
    slaFraction: Math.max(0, Math.min(1, t.slaSecondsLeft / Math.max(1, t.slaS))),
  };
}

/** The rigs' latest Notes endpoints + URLs from the player's terminal history (GP §2.3.7). */
export function endpointCandidates(s: RootState, rigs: readonly string[]): string[] {
  const out: string[] = [];
  for (const rig of rigs) {
    const r = robotByName(s.lab, rig);
    const notes = [...(r?.notes ?? [])].sort((a, b) => b.atMs - a.atMs);
    for (const n of notes) {
      if (n.endpoint && !out.includes(n.endpoint)) out.push(n.endpoint);
      if (out.length >= 6) break;
    }
  }
  for (let i = RT.log.length - 1; i >= 0 && out.length < 12; i--) {
    const e = RT.log[i]!;
    if (e.type !== 'terminal.command') continue;
    const m = /https?:\/\/[^\s'"]+/.exec((e.payload as { line: string }).line);
    if (m && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}
