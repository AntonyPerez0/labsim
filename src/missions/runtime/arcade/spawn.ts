/**
 * Incident instantiation: variant → binding → truth → setup (fault injection) → pending reveal → ticket
 * (GP §2.3.4, §3.4; Sim §4.1.9). Shared by Shift, Daily, Weak Spot, certification shifts and Free Play
 * "Create ticket".
 */
import type { TxContext } from '@/core/store';
import { nextInt } from '@/core/rng';
import type { HeatLevel, RootState, Severity, TicketState } from '@/core/state';
import type { IncidentDef } from '../../types';
import { RT, onActivityReset } from '../rt';
import { createScope } from '../conditions/evaluate';
import { applySetup, runActions } from '../scripts';
import { barkById, postChat, setBanner, toast } from '../feedback';
import { healthCheckInS } from '../session';
import { realNowMs } from '../clock';
import { robotByName } from '../lookups';
import { addTruth, bindIncident, pickVariant, resolveVariant, tpl } from './binding';
import { SLA_FACTOR } from './config';
import { isOpen } from './shiftCore';
import { TR, type PendingSpawn } from './ticketRuntime';
import { personName } from '@/content';

export interface InjectOptions {
  variantId?: string;
  rig?: string | null;
  heat?: HeatLevel | null;
  misleading?: boolean;
  reporterOverride?: string | null;
  source: PendingSpawn['source'];
  plannedWork?: boolean;
  notYetTaught?: boolean;
  revealNow?: boolean;
  planSlot?: number | null;
  injectionId?: string | null;
  compoundKey?: string | null;
  /** Free Play: pre-select the incident's default rig. */
  bindMode?: 'default' | 'random';
  /** Uniform variant pick (Daily, cert). */
  uniformVariant?: boolean;
  /** Allow binding a rig an open ticket already binds (compound). */
  allowBusy?: boolean;
  /** Do not open a ticket (Free Play injector without "Create ticket"). */
  noTicket?: boolean;
  /** Cap the pipeline-reveal fallback (s): the shift's opening ticket must not sit unrevealed for 90 s. */
  pipelineRevealWithinS?: number;
}

/** Rigs bound by open tickets and pending spawns. */
export function busyRigs(d: RootState): string[] {
  const out = new Set<string>();
  for (const t of d.session.tickets) if (isOpen(t)) for (const r of [t.binding.rig, ...t.binding.rigs]) if (r) out.add(r);
  for (const p of TR.pending) for (const r of [p.binding.rig, ...p.binding.rigs]) if (r) out.add(r);
  return [...out];
}

let spawnSeq = 0;

/** Inject an incident. Returns the pending spawn (already revealed when `immediate`/`revealNow`) or null. */
export function injectIncident(d: RootState, ctx: TxContext, base: IncidentDef, o: InjectOptions): { pending: PendingSpawn; ticket: TicketState | null } | null {
  const variantId = o.variantId ?? pickVariant(base, o.heat ?? null, RT.rng, !!o.uniformVariant);
  const def = resolveVariant(base, variantId);
  // Bind and inject; when the scenario cannot be applied on the chosen rig (e.g. a pipeline build is
  // holding it, so `rig.testRunning` has nothing to break) try one other rig, else do not spawn.
  const avoid: string[] = [];
  let binding: ReturnType<typeof bindIncident> = null;
  let res: ReturnType<typeof applySetup> | null = null;
  for (let attempt = 0; attempt < 2 && !res?.ok; attempt++) {
    const seed = nextInt(RT.rng, 1, 0x7fffffff);
    binding = bindIncident(def, variantId, d.lab, RT.rng, {
      preferRig: o.rig ?? null,
      busyRigs: [...busyRigs(d), ...avoid],
      mode: o.bindMode ?? 'random',
      seed,
      allowBusy: !!o.allowBusy,
    });
    if (!binding) return null;
    binding = addTruth(def, binding, d.lab, RT.rng);
    res = applySetup(d, ctx, def.setup(binding), { binding, ownerId: def.id });
    if (!res.ok) {
      if (o.rig || !binding.rig) break;
      avoid.push(binding.rig, ...binding.rigs);
    }
  }
  if (!binding || !res?.ok) return null;
  runActions(d, ctx, def.onSpawn?.(binding), { binding, ownerId: def.id });
  const now = d.session.clockS;
  // A pipeline-revealed fault surfaces when a build on that rig fails; in a shift with no pipelines
  // (micro-shift, Weak Spot) nothing would ever fail, so Jenkins Bot reports it after a short delay.
  const pipelineFallback = d.session.shift && !d.session.shift.rules.pipelines ? 4 : Math.min(90, o.pipelineRevealWithinS ?? 90);
  const fallback = def.reveal === 'healthCheck' ? healthCheckInS(d) + 6 : def.reveal === 'pipeline' ? pipelineFallback : 0;
  const pending: PendingSpawn = {
    key: `ps${++spawnSeq}`,
    def,
    binding,
    variantId,
    misleading: !!o.misleading && !!def.ticket.misleading,
    reporterOverride: o.reporterOverride ?? null,
    instanceIds: res.instanceIds,
    injectedAtS: now,
    revealByS: now + fallback,
    plannedWork: !!o.plannedWork,
    notYetTaught: !!o.notYetTaught,
    compoundKey: o.compoundKey ?? null,
    source: o.source,
    planSlot: o.planSlot ?? null,
    injectionId: o.injectionId ?? null,
  };
  if (o.noTicket) return { pending, ticket: null };
  if (o.revealNow || def.reveal === 'immediate' || def.reveal === 'none') return { pending, ticket: openTicket(d, ctx, pending) };
  TR.pending.push(pending);
  return { pending, ticket: null };
}

function ticketNumber(): string {
  for (let i = 0; i < 50; i++) {
    const id = `LAB-${String(nextInt(RT.rng, 1000, 9999))}`;
    if (!TR.usedTicketIds.has(id)) {
      TR.usedTicketIds.add(id);
      return id;
    }
  }
  return `LAB-${9000 + TR.usedTicketIds.size}`;
}

/** Turn a pending spawn into a ticket (reveal). */
export function openTicket(d: RootState, ctx: TxContext, ps: PendingSpawn, opts: { reporter?: string } = {}): TicketState {
  const i = TR.pending.indexOf(ps);
  if (i >= 0) TR.pending.splice(i, 1);
  const def = ps.def;
  const b = ps.binding;
  const sh = d.session.shift;
  const now = d.session.clockS;
  const severity: Severity = ps.plannedWork ? 'P2' : def.severity;
  const misleading = ps.misleading && !!def.ticket.misleading;
  const reporter = ps.reporterOverride ?? opts.reporter ?? (misleading ? (def.ticket.misleading?.reporter ?? def.ticket.reporter) : def.ticket.reporter);
  const title = misleading ? tpl(def.ticket.misleading!.title, b) : tpl(def.ticket.title, b);
  const id = ticketNumber();
  const canCall = (sh ? sh.rules.diagnosisCall : ps.source !== 'cert') && def.diagnosisCall !== 'none';
  const callOptionOrder = def.diagnosisCall === 'none' ? [] : shuffleIds(def.diagnosisCall.options.map((o) => o.id));
  const ticket: TicketState = {
    id,
    incidentId: def.id,
    variantId: ps.variantId,
    title,
    misleading,
    summary: tpl(def.ticket.summary, b),
    reporter,
    robotId: b.rig,
    binding: { rig: b.rig, hrn: b.hrn, rigs: [...b.rigs], vars: { ...b.vars }, seed: b.seed },
    severity,
    difficulty: def.difficulty,
    basePoints: def.base,
    parS: def.parS,
    slaS: Math.round(def.parS * SLA_FACTOR[severity]),
    openedAtMs: d.lab.time.nowMs,
    arrivedAtS: now,
    ackedAtS: null,
    startedAtS: null,
    resolvedAtS: null,
    slaSecondsLeft: Math.round(def.parS * SLA_FACTOR[severity]),
    sla: 'green',
    breached: false,
    status: 'new',
    points: 0,
    hintTier: 0,
    canCall,
    callOptionOrder,
    call: null,
    escalation: null,
    escalationsBounced: 0,
    reply: null,
    replyAttempts: 0,
    bug: null,
    matches: null,
    counters: {},
    penaltyIds: [],
    bonusIds: [],
    fixedAtMs: null,
    verifying: null,
    resolveAttempts: 0,
    score: null,
    compoundWith: null,
    notYetTaught: ps.notYetTaught,
    plannedWork: ps.plannedWork,
    faultInstanceIds: [...ps.instanceIds],
    source: ps.source,
    pinned: false,
  };
  const counters = def.counters?.(b) ?? {};
  for (const name of Object.keys(counters)) ticket.counters[name] = 0;
  d.session.tickets.push(ticket);
  const scope = createScope({ id: `ticket:${id}`, kind: 'ticket', ownerId: id, cond: def.success(b), state: d, ticketId: id, binding: b, counterMatchers: { ...counters } });
  TR.tickets.set(id, { ticketId: id, def, binding: b, scope, spawnSeq: RT.seq, charged: new Set(), jaredFixRun: false, cueIndex: 0 });

  // Compound partner (GP §2.3.3): two faults on one rig.
  if (ps.compoundKey) {
    const partner = d.session.tickets.find((t) => t.id !== id && TR.tickets.get(t.id) && t.compoundWith === null && compoundKeyOf(t.id) === ps.compoundKey);
    if (partner) {
      partner.compoundWith = id;
      ticket.compoundWith = partner.id;
    }
    compoundKeys.set(id, ps.compoundKey);
  }
  if (sh) {
    sh.stats.spawned++;
    sh.target += def.base;
    if (ps.plannedWork) sh.plannedWorkTicketId = id;
    if (ps.planSlot !== null && sh.plan) {
      const slot = sh.plan.find((p) => p.slot === ps.planSlot);
      if (slot) slot.ticketId = id;
    }
  }
  const st = (d.progress.incidents[def.id] ??= { attempts: 0, solves: 0, bestMs: 0, bestScore: 0, fastDiagnoses: 0, escalations: 0, wrongCalls: 0, lastSeenAt: 0, variantsSeen: [] });
  st.attempts++;
  st.lastSeenAt = realNowMs();
  if (!st.variantsSeen.includes(ps.variantId)) st.variantsSeen.push(ps.variantId);
  d.progress.stats.ticketsTotal++;
  ctx.emit('ticket.opened', { ticketId: id, incidentId: def.id, variantId: ps.variantId, rig: b.rig, severity, reporter, title, misleading });
  toast(d, 'ticket', `${id} · ${severity}`, title);
  if (reporter !== 'jenkins-bot') postChat('#lab-automation', reporter, title, id);
  else postChat('#jenkins', 'jenkins-bot', `${title} (${id})`, id);
  const spawnBark = SPAWN_BARKS[def.id];
  if (spawnBark) barkById(d, ctx, spawnBark, 'ticket');
  if (ps.notYetTaught) setBanner(d, `nyt-${id}`, 'info', `${id}: not yet taught — read the Field Manual entry if stuck`, now + 8);
  return ticket;
}

/** GP §5.4 barks on spawn. */
const SPAWN_BARKS: Readonly<Record<string, string>> = { INC20: 'BARK_JARED_06', INC39: 'BARK_DAVID_01' };

const compoundKeys = new Map<string, string>();
onActivityReset(() => compoundKeys.clear());
function compoundKeyOf(ticketId: string): string | null {
  return compoundKeys.get(ticketId) ?? null;
}

function shuffleIds(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(RT.rng, 0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Reveal pending spawns whose reveal event happened (health check failing the rig / red build on the rig)
 * or whose fallback time passed.
 */
export function checkReveals(d: RootState, ctx: TxContext, e: { type: string; payload: unknown } | null): void {
  if (!TR.pending.length) return;
  const now = d.session.clockS;
  for (const ps of [...TR.pending]) {
    let reveal = now >= ps.revealByS;
    let reporter: string | undefined;
    if (!reveal && e) {
      const robotIds = new Set(ps.binding.rigs.concat(ps.binding.rig ? [ps.binding.rig] : []).map((r) => robotByName(d.lab, r)?.id).filter((x): x is number => x !== undefined));
      if (ps.def.reveal === 'healthCheck' && e.type === 'orca.healthCheckRan') {
        const p = e.payload as { failedRobotIds?: number[]; newlyFailedRobotIds?: number[] };
        const failed = [...(p.failedRobotIds ?? []), ...(p.newlyFailedRobotIds ?? [])];
        reveal = failed.some((id) => robotIds.has(id)) || (!robotIds.size && failed.length > 0);
      } else if (ps.def.reveal === 'pipeline' && e.type === 'jenkins.buildFinished') {
        const p = e.payload as { result: string; robotId: number | null };
        reveal = p.result !== 'SUCCESS' && p.robotId !== null && robotIds.has(p.robotId);
        if (reveal) reporter = 'jenkins-bot';
      }
    }
    if (reveal) openTicket(d, ctx, ps, reporter ? { reporter } : {});
  }
}

/** Reveal a pending spawn on a rig right away (red pipeline run on that rig, GP §2.3.5). */
export function revealOnRig(d: RootState, ctx: TxContext, rig: string): boolean {
  const ps = TR.pending.find((p) => p.binding.rig === rig || p.binding.rigs.includes(rig));
  if (!ps) return false;
  openTicket(d, ctx, ps, { reporter: 'jenkins-bot' });
  return true;
}

export function reporterName(key: string): string {
  return key === 'jenkins-bot' ? 'Jenkins Bot' : personName(key);
}
