/**
 * Arcade incidents (GP §3.4 template), global wrong actions and process bonuses (GP §3.3).
 * Re-exported from `@/missions/types`. Content lives in `src/missions/incidents/INC##.ts`,
 * `src/missions/incidents/gw.ts`, `src/missions/incidents/pb.ts`.
 *
 * One `IncidentDef` drives Shift tickets, Daily Challenge, Weak Spot micro-shifts, certification
 * practical shifts and the Free Play Fault Injector (`FInn` = `INCnn`).
 */
import type { RngState } from '@/core/rng';
import type { BusRecord } from '@/core/bus';
import type { CareerRankId, HeatLevel, RootState, Severity, TicketState } from '@/core/state';
import type { LabState } from '@/sim/types';
import type { AnyEventMatcher, Condition } from './conditions';
import type {
  IncidentBinding,
  MarkerTarget,
  ReporterKey,
  ScriptAction,
  SetupSpec,
  TeachCardContent,
  Templated,
  WalkthroughCue,
} from './common';

/** Rig role tags (GP §3.1 roster; world doc §0.3 remap). */
export type RoleTag =
  | 'touch'
  | 'collis'
  | 'flexgen3'
  | 'printer'
  | 'printerless'
  | 'mini'
  | 'duo'
  | 'ocr'
  | 'flex-legacy'
  | 'rebuild'
  | 'build'
  | 'canada'
  | 'physical-pin'
  | 'paycore'
  | 'tethered'
  | 'dev1'
  | 'stg'
  | 'adb-only'
  | 'legacy-nuc-motion';

/**
 * Which rig(s) an incident binds to. The runtime keeps the role roster (GP §3.1 + world `RIGS`);
 * it never binds a rig an open ticket already binds (except compound incidents).
 */
export interface RigSpec {
  /** All tags must match. */
  roles?: readonly RoleTag[];
  /** Default rig (Daily/cert use uniform choice among candidates; Free Play pre-selects this). */
  default: string | null;
  /** Explicit candidate list (overrides `roles`). */
  candidates?: readonly string[];
  /** Binding granularity: one rig, a whole rack, every rig of a Callus box, a shared Pi, all rigs, or none (repo/judgement). */
  scope: 'rig' | 'rack' | 'callus-box' | 'shared-pi' | 'all' | 'none';
  /** Header text, e.g. "one rack (default Rack B: JOHNNY-5, BAYMAX, SETI, ROSIE)". */
  describe: string;
}

/** Inputs for a custom binder. */
export interface BindContext {
  lab: Readonly<LabState>;
  rng: RngState;
  variant: string;
  /** Rig requested by the Fault Injector / daily plan, if any. */
  preferRig: string | null;
  /** Rigs already bound by open tickets. */
  busyRigs: readonly string[];
  /** Rigs whose roster tags include all `roles`. */
  rigsWithRoles(roles: readonly RoleTag[]): string[];
  /** Fill the conventional `vars` (pi host & IP, device name & IP, rack, fuse, Callus box, camera) for a rig. */
  defaultVars(rig: string): Record<string, string | number | boolean>;
}

export type SymptomSource =
  | 'Orca'
  | 'Notes'
  | 'Jenkins'
  | 'Tablet'
  | 'LED'
  | 'Camera'
  | 'Terminal'
  | 'World'
  | 'LabChat'
  | 'IDE'
  | 'GitHub'
  | 'GIMP'
  | 'Ollama'
  | 'HUD';

/** One observable symptom (exact strings, GP §3.2). Used by the Field Manual, DR18 Log Detective and Teach Cards. */
export interface Symptom {
  where: SymptomSource;
  text: Templated;
}

/** A Diagnosis Call option (GP §2.3.6). Exactly one is `correct` (A by convention); the UI shuffles. */
export interface DiagnosisOption {
  /** `A`…`D`. */
  id: string;
  text: Templated;
  correct?: boolean;
  /** Teach Card direction for a wrong call / bounced escalation — where to look, never the answer. Required on distractors. */
  wrongCallHint?: Templated;
}

export interface DiagnosisCallDef {
  options: readonly [DiagnosisOption, DiagnosisOption, DiagnosisOption, DiagnosisOption];
}

/** LabChat reply option (GP Appendix C `R_WAIT_PING`, INC58/62 `R1`…`R4`). */
export interface ReplyOption {
  id: string;
  text: string;
  correct: boolean;
  teach?: TeachCardContent;
}

export interface ReplyDef {
  options: readonly ReplyOption[];
  /** Points for a wrong reply (GP INC58: −50). */
  wrongPenalty: number;
  /** INC58: one more try at half points after a wrong reply. */
  retryAtHalfPoints?: boolean;
  /** Who the reply goes to (defaults to the reporter). */
  to?: ReporterKey;
}

/** Judgement / form tasks resolved inside the ticket panel. */
export type IncidentTaskDef =
  | {
      /** INC61: match tool → role, then choose the status line. */
      kind: 'match';
      prompt: string;
      pairs: readonly { left: string; right: string }[];
      /** Extra right-hand options that match nothing. */
      distractors?: readonly string[];
      statusLine?: { prompt: string; options: readonly { id: string; text: string; correct: boolean }[] };
      /** Per wrong match (GP: −30). */
      wrongPenalty: number;
    }
  | {
      /** INC57-B "File bug": values must equal the seeded truth exactly (to the cent). */
      kind: 'bug';
      prompt: string;
      fields: readonly { id: string; label: string; unit?: '$' | '%' | 'mm' | 'px'; truthKey: string }[];
    };

/** Wrong-but-tempting move (GP §3.4). Charged once per ticket unless `repeatable`. */
export interface WrongMoveDef {
  id: string;
  text: string;
  /** Global wrong action this maps to (penalty/teach card come from the GW). */
  gw?: string;
  /** Incident-local penalty (magnitude) when not a GW (e.g. "edit card paths −100"). */
  penalty?: number;
  strike?: boolean;
  detect?: AnyEventMatcher;
  when?: Condition;
  teach?: TeachCardContent;
  repeatable?: boolean;
}

/** By-the-book escalation to Jared (GP §2.3.7). Required when `escalatable`. */
export interface EscalationDef {
  /** Accepted endpoint URLs (the exact Notes line URLs, e.g. `http://10.42.10.11:8000/health`). */
  endpoints: (b: IncidentBinding) => readonly string[];
  /** What Jared does (60–90 real s, narrated); the ticket auto-resolves when `success` becomes true. */
  jaredFix: (b: IncidentBinding) => readonly ScriptAction[];
  /** Bounce text when the cause is right but the endpoint wrong. */
  endpointHint?: Templated;
}

/** Fields a variant may override. */
export type IncidentOverrides = Partial<
  Pick<
    IncidentDef,
    | 'ticket'
    | 'rigs'
    | 'difficulty'
    | 'base'
    | 'parS'
    | 'severity'
    | 'escalatable'
    | 'bind'
    | 'truth'
    | 'setup'
    | 'reveal'
    | 'symptoms'
    | 'diagnosisPath'
    | 'hints'
    | 'walkthrough'
    | 'fix'
    | 'escalation'
    | 'success'
    | 'diagnosisCall'
    | 'replies'
    | 'task'
    | 'wrongButTempting'
    | 'counters'
    | 'onSpawn'
    | 'verifyLabel'
  >
>;

export interface IncidentVariant {
  /** `A` is the base definition; variants are `B`, `C` … */
  id: string;
  label: string;
  /** Relative pick weight (default 1; Daily picks uniformly). */
  weight?: number;
  /** Only eligible at or above this heat (INC03-C compound at H3+). */
  minHeat?: HeatLevel;
  overrides: IncidentOverrides;
}

/**
 * GP §3.4 incident entry.
 *
 * @example (abridged INC04)
 * export const INC04: IncidentDef = {
 *   id: 'INC04', name: 'Connection Failed: Ethernet unplugged',
 *   difficulty: 1, base: 200, parS: 150, severity: 'P1', escalatable: true, unlockedBy: 'M06',
 *   rigs: { roles: ['touch'], default: 'bumblebee', scope: 'rig', describe: 'any rig with its own Pi (default BUMBLEBEE)' },
 *   tags: ['orca.status.connfailed', 'hw.pi', 'orca.notes'],
 *   ticket: { title: (b) => `${b.hrn} Connection Failed`, reporter: 'jenkins-bot',
 *             misleading: { title: (b) => `${b.hrn}'s Pi crashed again` } },
 *   setup: () => ({ scenario: [{ faultId: 'eth.unplugged', params: { host: '$PI' } }] }), reveal: 'healthCheck',
 *   symptoms: [{ where: 'Notes', text: (b) => `GET http://${b.vars.piIp}:8000/health → connect timed out after 10000 ms` }],
 *   diagnosisPath: ['Tablet green but Orca red ⇒ Pi alive, network not', 'Inspect the jack', 'Call or escalate'],
 *   hints: ['Compare the tablet with Orca.', 'Look at the Pi\'s Ethernet jack LEDs.', 'Re-seat the cable at the jack.'],
 *   fix: { byTheBook: 'Escalate with the health endpoint, cause A.', handsOn: 'Re-seat the cable; wait for the next health check.' },
 *   escalation: { endpoints: (b) => [`http://${b.vars.piIp}:8000/health`], jaredFix: (b) => [{ do: 'npc', npc: 'jared', action: 'fix', target: `rig.${b.rig}.pi` }] },
 *   success: (b) => c.all(c.eq(p.pi(String(b.vars.pi)).eth, 'LINKED'), c.status(b.rig!, 'AVAILABLE'), c.nextHealthCheck()),
 *   diagnosisCall: { options: [
 *     { id: 'A', text: 'Network cable disconnected', correct: true },
 *     { id: 'B', text: 'Pi hung', wrongCallHint: 'A hung Pi freezes its ACT LED and greys the tablet. This tablet is green.' },
 *     { id: 'C', text: 'Rack A fuse blown', wrongCallHint: 'A blown fuse darkens every Pi on the rack. Only one rig is down.' },
 *     { id: 'D', text: 'Orca health thread stuck', wrongCallHint: 'Other rigs were checked at the same time and passed.' },
 *   ] },
 *   wrongButTempting: [{ id: 'cycle', text: 'Power-cycle the Pi', gw: 'GW17' }],
 *   teaches: 'Ref §3 — the health check is a REST ping over the network.',
 * };
 */
export interface IncidentDef {
  /** `INC01`…`INC65` (stable; never renumber). */
  id: string;
  /** Catalog name (Field Manual, Fault Injector). */
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Base points. */
  base: number;
  /** Par time, real seconds (3:00 → 180). SLA = par × {P1 1.5, P2 2.0, P3 3.0}. */
  parS: number;
  severity: Severity;
  rigs: RigSpec;
  escalatable: boolean;
  /** Academy module that unlocks it (`M06`). */
  unlockedBy: string;
  /** Fine topic tags (GP §4.8.1). */
  tags: readonly string[];
  /** Curriculum facts (Cur §6 via GP §3.7) — wrong calls/escalations/GWs demote their flashcards. */
  factIds?: readonly string[];
  /** Eligible as Full Shift planned work (INC19, INC38, INC42, INC44, INC59). */
  plannedWork?: boolean;
  /** Only ever appears as planned work (never from the normal spawn queue). */
  plannedWorkOnly?: boolean;
  /** Incidents this one may stack with on the same rig (compound, GP §2.3.3). */
  compoundWith?: readonly string[];
  ticket: {
    title: Templated;
    reporter: ReporterKey;
    summary?: Templated;
    /** Misleading title variant (system evidence stays truthful). */
    misleading?: { title: Templated; reporter?: ReporterKey };
  };
  /** Custom binder; default = roster pick by `rigs` + `ctx.defaultVars(rig)`. */
  bind?: (ctx: BindContext) => IncidentBinding | null;
  /** Seeded ground truth (stored as `binding.vars['truth.<key>']`), e.g. INC57 receipt values. */
  truth?: (b: IncidentBinding, lab: Readonly<LabState>, rng: RngState) => Readonly<Record<string, string | number | boolean>>;
  /** Initial state (GP "Initial state"), layered on the current lab (no `preset`). Sim doc Appendix A lists each scenario. */
  setup: (b: IncidentBinding) => SetupSpec;
  /**
   * When the ticket opens after injection (sim doc §4.1.9/§4.5): `healthCheck` = the next
   * `orca.healthCheckRan` that fails the rig; `pipeline` = the next non-SUCCESS `jenkins.buildFinished`
   * on the rig (Jenkins Bot reporter); `immediate`; `none` = director-timed (INC05).
   */
  reveal: 'healthCheck' | 'pipeline' | 'immediate' | 'none';
  symptoms: readonly Symptom[];
  diagnosisPath: readonly string[];
  /** Arcade hint tiers: Nudge (where to look) → Pointer (which app/object/field) → Walkthrough. */
  hints: readonly [Templated, Templated, Templated];
  /** Walkthrough tier ghost highlights (else the tier-3 text only). */
  walkthrough?: (b: IncidentBinding) => readonly WalkthroughCue[];
  fix: { byTheBook?: Templated; handsOn?: Templated };
  escalation?: EscalationDef;
  /** GP "Success" (DSL). Evaluated on Resolve; `verify` nodes defer it (see conditions docs). */
  success: (b: IncidentBinding) => Condition;
  diagnosisCall: DiagnosisCallDef | 'none';
  replies?: ReplyDef;
  task?: IncidentTaskDef;
  wrongButTempting: readonly WrongMoveDef[];
  /** Per-ticket counters (`counter(powerCycles)`), counted while the ticket is open. */
  counters?: (b: IncidentBinding) => Readonly<Record<string, AnyEventMatcher>>;
  /** Process bonuses this incident can earn (PB ids); PB08 applies to every escalatable hardware incident. */
  processBonuses?: readonly string[];
  /** LabChat messages / NPC choreography when the ticket spawns (Jared's "Firmware drop today…"). */
  onSpawn?: (b: IncidentBinding) => readonly ScriptAction[];
  /** "Verifying… waiting for {time} health check" (default per trigger kind). */
  verifyLabel?: Templated;
  /** "Teaches" line (Ref §). */
  teaches: string;
  variants?: readonly IncidentVariant[];
  /** HUD compass target after Ack (defaults to the bound rig). */
  marker?: (b: IncidentBinding) => MarkerTarget | null;
}

/* ═════════════════════════════ Global wrong actions & process bonuses ═════════════════════════════ */

/** Detection of a GW: any matcher fires it; `when` filters with state. */
export interface GwDetector {
  match: AnyEventMatcher;
  when?: (state: RootState, payload: unknown) => boolean;
}

/**
 * GP §3.3 global wrong action. Penalised in every incident and during free roam in a shift;
 * Academy: Teach Card + mastery evidence only (spark-only damage per Cur M03); Free Play: per the
 * sandbox "penalties" toggle (Teach Cards always fire).
 *
 * @example
 * export const GW17: GlobalWrongActionDef = {
 *   id: 'GW17', name: 'Extra power cycle', action: 'Redundant power-cycle (target already booting or healthy)',
 *   penalty: 50, strike: false, tags: ['orca.healthcheck'], consequence: 'Recovery slips to the next health check',
 *   detect: [{ match: on('host.powerChanged', { to: 'off' }), when: (s, ev) => wasAlreadyBootingOrHealthy(s, ev) }],
 *   teach: { whatHappened: 'Extra power cycle.', why: 'Recovery shows at the next 5-minute health check; cycling again delays it. (Ref §3)',
 *            doInstead: 'Verify with curl and wait for the ping.', practiceDrillId: 'DR01' },
 * };
 */
export interface GlobalWrongActionDef {
  /** `GW01`…`GW24`. */
  id: string;
  /** Short label for pop-ups ("Fried hardware"). */
  name: string;
  /** GP table "Action". */
  action: string;
  /** Penalty magnitude (points subtracted). */
  penalty: number;
  /** Strike: always, never, or conditional (`strikeWhen`). */
  strike: boolean | 'conditional';
  strikeWhen?: (state: RootState, payload: unknown) => boolean;
  tags: readonly string[];
  /** GP "World consequence" (the sim/world produce it; this is the description). */
  consequence: string;
  detect: readonly GwDetector[];
  teach: TeachCardContent;
  factIds?: readonly string[];
  /** Ignore repeats within this many real seconds (default 2). */
  cooldownS?: number;
}

/** Context for a process-bonus check (evaluated when the ticket resolves). */
export interface ProcessBonusContext {
  state: RootState;
  ticket: TicketState;
  binding: IncidentBinding;
  /** Events since the ticket spawned. */
  events: readonly BusRecord[];
  escalated: boolean;
  rank: CareerRankId;
}

/** GP §3.3 process bonus. @example { id: 'PB07', behaviour: 'Power off before touching wiring, fuses or ribbons', points: 25, check: (ctx) => … } */
export interface ProcessBonusDef {
  /** `PB01`…`PB08`. */
  id: string;
  behaviour: string;
  points: number;
  /** PB08 needs Lab Technician or above. */
  minRank?: CareerRankId;
  /** Applies to incidents listing it in `processBonuses` (or `'any'`; PB08 → every escalatable hardware incident). */
  appliesTo: 'listed' | 'any' | 'escalatable';
  check: (ctx: ProcessBonusContext) => boolean;
}
