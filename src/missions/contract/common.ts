/**
 * Shared authoring vocabulary for missions: ids, setup specs, script actions, hints, ghost demos.
 * Re-exported from `@/missions/types`.
 */
import type { FaultSpec, SimApi } from '@/sim/api';
import type { LabFlags, LabState } from '@/sim/types';
import type { RngState } from '@/core/rng';
import type { MarkerTarget, NpcKey, ReporterKey, TeachCardContent, TicketBinding, ToolId, Toast } from '@/core/state';

export type { MarkerTarget, NpcKey, ReporterKey, TeachCardContent };

/**
 * Location anchor id (`loc.rack-a`, `loc.workstation` …) — Cur §0.5 / world `LOCATIONS`
 * (`src/world/layout`), registered with `engine.registerLocation`.
 */
export type LocationId = string;

/**
 * Prop / interactable id. Either the world id (`rig.wall-e.tablet`, `power.fuse.5v-b`) or the
 * curriculum alias (`prop.walle.tablet`); the runtime resolves aliases through the world's
 * `PROP_ALIASES` (pure data in `src/world/layout`). NPCs are `npc.<key>`.
 */
export type PropId = string;

/**
 * Computer app id (`AppId` in `src/computer/apps.ts`, apps doc §1.9; Cur's `app.orca` → `orca`).
 * LabChat is `chat`; the tablet dashboard is `dashboard`.
 */
export type AppId =
  | 'orca'
  | 'jenkins'
  | 'github'
  | 'ollama'
  | 'browser'
  | 'intellij'
  | 'terminal'
  | 'gimp'
  | 'camera'
  | 'dashboard'
  | 'chat'
  | 'cardreader'
  | 'files'
  | (string & {});

/** Exact text, or text computed from the incident binding (rig names, IPs …). */
export type Templated<B = IncidentBinding> = string | ((b: B) => string);

/**
 * Rig binding of an incident instance. `TicketBinding` (core) + the chosen variant.
 * Conventional `vars` keys (filled by the default binder, sim doc §4.5 placeholders in brackets):
 * `pi` [$PI] Pi host id (`pi-wall-e`), `piIp` (`10.42.10.11`), `dev` [$DEV] Robot Device runtime id,
 * `device` Orca device-row name (`wall-e-flex3`), `deviceIp`, `deviceType` [$T] (`FLEX_3`),
 * `box` [$BOX] Callus host id (`minix-01`), `probe` [$PROBE] Collis probe id, `rack`, `fuse`, `camera`;
 * seeded truth under `truth.<key>`. `$R` = `rig`.
 */
export type IncidentBinding = TicketBinding & { readonly variant: string };

/**
 * A setup operation (sim doc §4.4.1: `orca.setStatus`, `device.stage`, `repo.commitFixture`,
 * `jenkins.seedBuild` …). Structurally identical to the sim's `SetupOp`.
 */
export interface SetupOpSpec {
  op: string;
  params?: Readonly<Record<string, string | number | boolean | null | Readonly<Record<string, string>>>>;
}

/**
 * One scenario item (sim doc §4.5): a fault (`faultId`) or a setup op (`op`). String params may use
 * the placeholders `$R`, `$PI`, `$DEV`, `$BOX`, `$PROBE`, `$T` (substituted from the binding) and
 * `'@random'` (resolved by the sim). Applied in order by `sim.faults.injectAll` (all-or-nothing).
 */
export type ScenarioItem = FaultSpec | SetupOpSpec;

/** Apps gating for the workstation during a lesson step / setup. */
export interface AppGating {
  /** Apps the desktop shows (`'all'` to lift gating). */
  unlock?: readonly AppId[] | 'all';
  /** Per-app restrictions, e.g. `{ jenkins: { visibleJobs: ['Java/uia-remote-regression-flex'] } }`. */
  restrictions?: Readonly<Record<string, Readonly<Record<string, readonly string[] | string | boolean>>>>;
  /** Orca's tutorial **Force health check** header button. */
  forceHealthCheck?: boolean;
}

/** Context handed to scripted setup / `sim` actions. They run inside one `transact()`. */
export interface ScriptContext {
  /** Lab as it is right now (read-only view of the draft). */
  lab: Readonly<LabState>;
  /** Seeded RNG of the activity (use with `@/core/rng` helpers; never Math.random). */
  rng: RngState;
  binding: IncidentBinding | null;
  vars: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Initial-state recipe (module "Setup" rows, incident "Initial state", cert practical setups).
 *
 * @example
 * const setup: SetupSpec = {
 *   preset: 'academy:M06',
 *   scenario: [
 *     { op: 'orca.setStatus', params: { robot: 'baymax', status: 'OFFLINE', by: 'jared' } },
 *     { faultId: 'pi.hung', params: { host: '$PI' } },
 *   ],
 *   apps: { unlock: ['orca', 'jenkins'], restrictions: { jenkins: { visibleJobs: ['Java/uia-remote-regression-flex'] } }, forceHealthCheck: true },
 *   spawn: 'loc.whiteboard',
 * };
 */
export interface SetupSpec {
  /**
   * `sim.reset({ preset, seed })` first — `factory | arcade | freeplay | cert | test | academy:M01 … academy:M18`
   * (sim doc §6.5; `academy:Mnn` already applies the module's §4.4.2 scenario). Omit to keep the current
   * lab (incidents layered on a running shift).
   */
  preset?: string;
  seed?: number;
  /** Faults and setup ops applied in order (sim doc §4.5), after the preset. */
  scenario?: readonly ScenarioItem[];
  flags?: Partial<LabFlags>;
  timeScale?: number;
  apps?: AppGating;
  /** Teleport the player to a location anchor. */
  spawn?: LocationId;
  /** Hotbar tools / parts granted for the activity. */
  inventory?: { tools?: readonly ToolId[]; fuses?: Readonly<Record<string, number>>; parts?: Readonly<Record<string, number>>; ethernetCables?: number };
  /** Any other scripted state through the SimApi (robot statuses, reservations, files …). */
  run?: (sim: SimApi, ctx: ScriptContext) => void;
}

/** A line spoken by an NPC (subtitle box with portrait). */
export interface SpokenLine {
  speaker: NpcKey;
  text: string;
}

/**
 * Side effects at step boundaries (`onEnter` / `onComplete`), incident spawn/resolve, Jared's fix.
 *
 * @example
 * const onComplete: ScriptAction[] = [
 *   { do: 'say', speaker: 'jared', text: 'On it. Probably the Pi, or a Minix box running Callus. Same symptom.' },
 *   { do: 'npc', npc: 'jared', action: 'fix', target: 'rig.eve.pi-power' },
 *   { do: 'sim', run: (sim) => { sim.faults.clear('fault-7', 'mentor'); } }, // Jared re-plugs EVE's Pi lead
 * ];
 */
export type ScriptAction =
  /** Dialogue line; `ack: true` (default) blocks until acknowledged. */
  | { do: 'say'; speaker: NpcKey; text: string; ack?: boolean }
  /** Subtitle-only bark (non-blocking). */
  | { do: 'bark'; speaker: NpcKey; text: string }
  /** LabChat message (via `sim.chat.post`), optionally delayed (NPC replies 10–20 s, GP SR18). */
  | { do: 'chat'; author: ReporterKey | string; text: string; channel?: string; delayS?: number; ticketId?: string }
  | { do: 'setup'; setup: SetupSpec }
  | { do: 'sim'; run: (sim: SimApi, ctx: ScriptContext) => void }
  | { do: 'unlockManual'; entryIds: readonly string[] }
  | { do: 'grant'; tools?: readonly ToolId[]; fuses?: Readonly<Record<string, number>>; parts?: Readonly<Record<string, number>> }
  /** Open the workstation on an app/route (runtime: `ui.overlay = computer` + `requestOpenApp` from `@/computer/apps`). */
  | { do: 'openApp'; app: AppId; route?: string }
  | { do: 'gate'; apps: AppGating }
  /** Inspect callouts (≤ 4 lines, 4 s; become Field Manual entries). */
  | { do: 'callouts'; prop: PropId; lines: readonly string[] }
  /** NPC choreography handled by the world (walk over, perform a fix animation, go idle). */
  | { do: 'npc'; npc: NpcKey; action: 'walk-to' | 'fix' | 'idle' | 'leave'; target?: string }
  | { do: 'setVar'; name: string; value: string | number | boolean }
  | { do: 'toast'; kind: Toast['kind']; title: string; body?: string }
  /** Capture a Notebook evidence line. */
  | { do: 'evidence'; source: string; text: string }
  | { do: 'teach'; card: TeachCardContent }
  | { do: 'timeScale'; scale: number };

/** Hint presentation effects (Cur §2.0 ladders). */
export type HintEffect =
  /** walk-to 45 s: marker pulses. */
  | 'pulse-marker'
  /** walk-to 90 s: breadcrumb line. */
  | 'breadcrumb'
  /** inspect 60 s: outline turns bright. */
  | 'bright-outline'
  /** inspect 120 s: camera auto-pans (Academy only). */
  | 'auto-pan'
  /** interact after 3 wrong: highlight the correct control. */
  | 'highlight'
  /** computer-task 180 s: "Show me" button appears. */
  | 'show-me-button'
  /** Text only (HUD hint line or mentor bark when `speaker` is set). */
  | 'text';

/** One rung of a hint ladder. `afterS` counts real seconds in the step (`idle: true` → seconds without a relevant action). */
export interface HintDef {
  afterS: number;
  idle?: boolean;
  text?: string;
  speaker?: NpcKey;
  effect?: HintEffect;
}

/**
 * One "Show me" / Walkthrough pointer on the workstation. `target` is a hint target from
 * `APP_HINT_TARGETS` (apps doc §1.7: elements carry `data-hint="<target>"`; parametrised with `:`,
 * e.g. `orca.robots.row:johnny-5`). The runtime calls `requestHint({ app, target, route, showMe })`
 * from `@/computer/apps`: a pulsing ring, plus the ghost cursor for Show me (it never clicks).
 *
 * @example { app: 'orca', route: '/robot', target: 'orca.robots.filter.status', action: 'select', text: 'Available', caption: "Tate's filter UI" }
 */
export interface GhostAction {
  app: AppId;
  target: string;
  /** What the player should do there (caption text only; the shell never performs it). */
  action?: 'click' | 'type' | 'select' | 'drag' | 'key' | 'scroll';
  text?: string;
  route?: string;
  caption?: string;
}

/** A Walkthrough-tier cue (GP §2.3.8 tier 3): highlight the next action until `doneWhen` holds. */
export interface WalkthroughCue {
  text: string;
  marker?: MarkerTarget;
  ghost?: GhostAction;
  /** Cue is skipped once this holds (evaluated like a condition; see `./conditions`). */
  doneWhen?: import('./conditions').Condition;
}

export type { FaultSpec };
