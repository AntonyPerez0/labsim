/**
 * Executors for the authoring vocabulary of `contract/common.ts`: `SetupSpec` (initial state recipes)
 * and `ScriptAction` (side effects at step boundaries, incident spawn, Jared's fix). Everything runs
 * inside the caller's `transact()`; sim calls go through `simRun` (runtime-driven, no GW detection).
 */
import type { TxContext } from '@/core/store';
import type { DialogueLine, NpcKey, RootState, ToolId } from '@/core/state';
import { requestOpenApp } from '@/computer/apps';
import type { AppGating, IncidentBinding, ScenarioItem, ScriptAction, ScriptContext, SetupSpec } from '../types';
import type { ScenarioItem as SimScenarioItem } from '@/sim/api';
import { RT } from './rt';
import { injectScenario, simRun } from './simx';
import { bark, captureEvidence, postChat, pushTeachCard, toast, unlockManual } from './feedback';
import type { EvidenceSource } from '@/core/state';
import { personText } from '@/content';

export interface ScriptEnv {
  binding: IncidentBinding | null;
  /** Owner (step id / ticket id) for chat threading and logs. */
  ownerId: string;
  ticketId?: string | null;
}

/* ───────────────────────────── placeholders ───────────────────────────── */

const PLACEHOLDER = /\$(PROBE|DEV|BOX|PI|R|T)(?![A-Za-z])/g;

function placeholderValue(b: IncidentBinding | null, key: string): string | null {
  if (!b) return null;
  switch (key) {
    case 'R':
      return b.rig;
    case 'PI':
      return str(b.vars.pi);
    case 'DEV':
      return str(b.vars.dev);
    case 'BOX':
      return str(b.vars.box);
    case 'PROBE':
      return str(b.vars.probe);
    case 'T':
      return str(b.vars.deviceType);
  }
  return null;
}

function str(v: unknown): string | null {
  return v === undefined || v === null ? null : String(v);
}

/** Substitute `$R`, `$PI`, `$DEV`, `$BOX`, `$PROBE`, `$T` in every string param (sim doc §4.5). */
export function substitute<T>(value: T, b: IncidentBinding | null): T {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (m, key: string) => placeholderValue(b, key) ?? m) as T;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, b)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitute(v, b);
    return out as T;
  }
  return value;
}

export function substituteScenario(items: readonly ScenarioItem[], b: IncidentBinding | null): SimScenarioItem[] {
  return items.map((it) => substitute(it, b) as unknown as SimScenarioItem);
}

/* ───────────────────────────── setup ───────────────────────────── */

export interface SetupResult {
  ok: boolean;
  instanceIds: string[];
  error: string | null;
}

/** Apply app gating to the workstation (`session.computer`). */
export function applyGating(d: RootState, apps: AppGating): void {
  const g = d.session.computer;
  if (apps.unlock !== undefined) g.unlockedApps = apps.unlock === 'all' ? 'all' : [...apps.unlock];
  if (apps.restrictions) {
    for (const [app, r] of Object.entries(apps.restrictions)) {
      const out: Record<string, string[] | string | boolean> = {};
      for (const [k, v] of Object.entries(r)) out[k] = Array.isArray(v) ? [...(v as readonly string[])] : (v as string | boolean);
      g.restrictions[app] = out;
    }
  }
  if (apps.forceHealthCheck !== undefined) g.forceHealthCheckButton = apps.forceHealthCheck && d.session.realism !== 'strict';
}

function grantInventory(d: RootState, ctx: TxContext, inv: NonNullable<SetupSpec['inventory']>): void {
  const s = d.session;
  for (const t of inv.tools ?? []) {
    if (!s.inventory.includes(t)) s.inventory.push(t);
    if (t === 'test-card-visa' && !s.inventory.includes('test-card-interac')) s.inventory.push('test-card-interac');
  }
  if (s.inventory.includes('test-card-visa') && !s.items.testCards.length) s.items.testCards = ['VISA', 'INTERAC'];
  for (const [rating, n] of Object.entries(inv.fuses ?? {})) {
    s.items.fuses[rating] = (s.items.fuses[rating] ?? 0) + n;
    ctx.emit('inventory.changed', { item: `fuse-${rating}`, delta: n, total: s.items.fuses[rating]! });
  }
  for (const [part, n] of Object.entries(inv.parts ?? {})) {
    s.items.parts[part] = (s.items.parts[part] ?? 0) + n;
    ctx.emit('inventory.changed', { item: part, delta: n, total: s.items.parts[part]! });
  }
  if (inv.ethernetCables) {
    s.items.ethernetCables += inv.ethernetCables;
    ctx.emit('inventory.changed', { item: 'ethernet-cable', delta: inv.ethernetCables, total: s.items.ethernetCables });
  }
}

/**
 * Apply a `SetupSpec`. `presetApplied` = the caller already ran `sim.reset` with this preset
 * (activity start); otherwise a `preset` resets the lab here.
 */
export function applySetup(d: RootState, ctx: TxContext, setup: SetupSpec, env: ScriptEnv, opts: { presetApplied?: boolean; seed?: number } = {}): SetupResult {
  if (setup.preset && !opts.presetApplied) {
    const seed = setup.seed ?? opts.seed ?? RT.rng.seed;
    const preset = setup.preset;
    simRun('reset', (s) => s.reset({ preset, seed }), undefined);
  }
  let result: SetupResult = { ok: true, instanceIds: [], error: null };
  if (setup.scenario?.length) {
    result = injectScenario(substituteScenario(setup.scenario, env.binding));
    if (!result.ok) console.warn(`[missions] setup scenario for ${env.ownerId} failed: ${result.error}`);
  }
  if (setup.flags) {
    for (const [k, v] of Object.entries(setup.flags)) {
      simRun('setFlag', (s) => s.setFlag(k as never, v as never), undefined);
    }
  }
  if (setup.timeScale !== undefined) {
    const ts = setup.timeScale;
    simRun('setTimeScale', (s) => s.setTimeScale(ts), undefined);
  }
  if (setup.apps) applyGating(d, setup.apps);
  if (setup.inventory) grantInventory(d, ctx, setup.inventory);
  if (setup.spawn) ctx.emit('mission.teleportRequested', { locationId: setup.spawn });
  if (setup.run) {
    const run = setup.run;
    const sctx = scriptContext(d, env);
    simRun(`setup.run:${env.ownerId}`, (s) => run(s, sctx), undefined);
  }
  return result;
}

export function scriptContext(d: RootState, env: ScriptEnv): ScriptContext {
  return { lab: d.lab, rng: RT.rng, binding: env.binding, vars: d.session.vars };
}

/* ───────────────────────────── actions ───────────────────────────── */

export type ActionOutcome = 'continue' | 'wait-ack';

let lineSeq = 0;

/** Show a blocking dialogue line (Academy). */
export function showLine(d: RootState, ctx: TxContext, speaker: string, text: string, opts: { id?: string; choices?: { id: string; text: string }[] } = {}): string {
  const id = opts.id ?? `line-${++lineSeq}`;
  const line: DialogueLine = {
    id,
    speaker,
    text: personTextSafe(text),
    requiresAck: true,
    skippableAfterS: 1.5,
    shownAtS: d.session.clockS,
  };
  if (opts.choices?.length) line.choices = opts.choices.map((c, i) => ({ id: c.id, key: i + 1, text: c.text }));
  d.session.dialogue = line;
  ctx.emit('dialogue.shown', { lineId: id, speaker, text: line.text });
  return id;
}

function personTextSafe(t: string): string {
  try {
    return personText(t);
  } catch {
    return t;
  }
}

/**
 * Run one script action. `blocking` = `say` lines wait for acknowledgement (Academy step scripts);
 * otherwise they become non-blocking barks (Arcade spawn scripts, Jared's narrated fixes).
 */
export function runAction(d: RootState, ctx: TxContext, a: ScriptAction, env: ScriptEnv, blocking: boolean): ActionOutcome {
  switch (a.do) {
    case 'say':
      if (blocking && a.ack !== false) {
        showLine(d, ctx, a.speaker, a.text);
        return 'wait-ack';
      }
      bark(d, ctx, a.speaker, a.text, env.ticketId ? 'ticket' : 'flavour');
      return 'continue';
    case 'bark':
      bark(d, ctx, a.speaker, a.text, env.ticketId ? 'ticket' : 'flavour');
      return 'continue';
    case 'chat':
      postChat(a.channel ?? '#lab-automation', a.author, a.text, a.ticketId ?? env.ticketId ?? undefined, a.delayS ?? 0);
      return 'continue';
    case 'setup':
      applySetup(d, ctx, a.setup, env);
      return 'continue';
    case 'sim': {
      const run = a.run;
      const sctx = scriptContext(d, env);
      simRun(`script:${env.ownerId}`, (s) => run(s, sctx), undefined);
      return 'continue';
    }
    case 'unlockManual':
      for (const id of a.entryIds) unlockManual(d, ctx, id, env.ownerId);
      return 'continue';
    case 'grant':
      grantInventory(d, ctx, { tools: a.tools as readonly ToolId[] | undefined, fuses: a.fuses, parts: a.parts } as NonNullable<SetupSpec['inventory']>);
      return 'continue';
    case 'openApp':
      d.ui.overlay = { kind: 'computer' };
      requestOpenApp(a.app as never, a.route ? { route: a.route } : undefined);
      return 'continue';
    case 'gate':
      applyGating(d, a.apps);
      return 'continue';
    case 'callouts': {
      const lines = a.lines.slice(0, 4).map(personTextSafe);
      d.ui.callouts = { propId: a.prop, lines, untilS: d.session.clockS + 4 };
      ctx.emit('player.calloutsShown', { propId: a.prop, lines });
      return 'continue';
    }
    case 'npc':
      ctx.emit('mission.npcAction', { npc: a.npc, action: a.action, target: a.target ?? null });
      return 'continue';
    case 'setVar':
      d.session.vars[a.name] = a.value;
      return 'continue';
    case 'toast':
      toast(d, a.kind, personTextSafe(a.title), a.body ? personTextSafe(a.body) : undefined);
      return 'continue';
    case 'evidence':
      captureEvidence(d, ctx, a.source as EvidenceSource, personTextSafe(a.text), env.binding?.rig ?? null, env.ticketId ?? null);
      return 'continue';
    case 'teach':
      pushTeachCard(d, ctx, a.card, { kind: d.session.mode === 'academy' ? 'academy' : 'gw', ref: env.ownerId }, env.ticketId ?? null);
      return 'continue';
    case 'timeScale': {
      const ts = a.scale;
      simRun('setTimeScale', (s) => s.setTimeScale(ts), undefined);
      return 'continue';
    }
  }
  return 'continue';
}

/** Run every action without blocking (Arcade, Free Play). */
export function runActions(d: RootState, ctx: TxContext, actions: readonly ScriptAction[] | undefined, env: ScriptEnv): void {
  for (const a of actions ?? []) runAction(d, ctx, a, env, false);
}

export type { NpcKey };
