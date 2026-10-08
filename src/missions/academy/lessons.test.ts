/**
 * Integrity tests for the Academy lesson scripts (src/missions/academy/lessons). Every lesson must only
 * reference ids that exist in the other modules' registries: quiz items and checkpoints (content),
 * locations / props / NPCs (world layout), app ids, routes, actions and hint targets (computer apps),
 * fault ids and setup ops (sim), team keys (content), facts and Field Manual articles (content).
 * Registries that are not available at test time are skipped with a console note instead of failing.
 */
import { describe, expect, it } from 'vitest';
import { FACTS, MANUAL_ARTICLES, MODULES_BY_ID, TEAM, questionById } from '@/content';
import { APP_ACTIONS, APP_HINT_TARGETS, APP_IDS, APP_ROUTES, matchRoute } from '@/computer/apps';
import { LOCATION_BY_ID, NPC_ALIASES, NPC_IDS, isPropId, resolvePropId } from '@/world/layout';
import { sim } from '@/sim';
import type { Condition, LessonDef, LessonStep, ScriptAction, SetupSpec } from '../types';
import { AUTHORED_LESSONS, LESSONS } from './lessons';
import { LESSON_FAULT_IDS } from './lessons/helpers';

/* ───────────────────────────── registries ───────────────────────────── */

const MODULE_IDS = Array.from({ length: 18 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
const TEAM_KEYS = new Set(Object.keys(TEAM));
const FACT_IDS = new Set(FACTS.map((f) => f.id));
const ARTICLE_IDS = new Set(MANUAL_ARTICLES.map((a) => a.id));
const APP_ACTION_NAMES = new Set<string>(Object.values(APP_ACTIONS).flatMap((g) => Object.values(g as Record<string, string>)));

/**
 * `app.action`s with `app: 'world'`. The first group is emitted by the 3D world (`src/world/lab/*`); the
 * second by the UI's board minigames and steel-ruler panel (`src/ui/minigames`), which the world opens
 * through the inspect overlay / `minigame.open`.
 */
const WORLD_ACTIONS_EMITTED = new Set(['safetyCard.taken', 'library.placedOnTray', 'library.trays', 'library.compare', 'power.trace.complete', 'power.trace.wrong', 'power.trace.step', 'power.trace.start', 'server.gpuTagged', 'minigame.open']);
const WORLD_ACTIONS_UI = new Set(['minigame.completed', 'ruler.measured', 'whiteboard.open', 'roadmap.open', 'historyMatch.open']);

/** Fault catalogue of Sim §4.3 (fallback when the live sim catalogue is unavailable). */
const DOC_FAULT_IDS = new Set(
  'pi.hung pi.off pi.serviceDown camera.sharedHostDown camera.usbUnplugged pi.diskFull pi.wineBroken eth.unplugged eth.damaged callus.down nuc.diskFull vm.serviceDown orca.mysqlDown orca.appDown jenkins.down ollama.down net.switchDown fuse.blown fuse.underRated power.regulatorOff power.outletDead rig.lockReleased rig.steppersDisabled rig.motorOff rig.mainOff rig.solenoidLoose rig.dipArmMisaligned rig.cradleCracked rig.limitSwitchBroken rig.webcamMisaimed rig.motionOnNuc rig.rebuild device.unpowered device.dead device.adbTcpReset device.printerNoPaper laz.skipAdbRestore receipt.qrRollout tether.linkDown collis.unpowered collis.ribbonUnseated callus.syncStale merchant.credentialBlank merchant.ubiRouteWrong merchant.overwritten ubi.routeDown card.gortPathWrong card.trackDataCorrupt orca.offsets orca.hrnTypo orca.urlWrong orca.tetherCleared orca.tetherCloned orca.screenLocationShift orca.screenLocationTypo orca.missingReceiptMap orca.statusOverride orca.staleReservation ocr.labelShift ocr.capitalisation ocr.typo gort.capabilityDropped pigeon.missingComma pigeon.missingBracket pigeon.screenCompareEmpty uia.waitForScreenStub uia.scrollSwapped uia.missingScreenMethods uia.teardownMissing config.port5555 config.value config.themeKernel jenkins.envCase jenkins.jobMoved jenkins.capsConflict jenkins.namedRobot rig.testRunning'.split(
    ' ',
  ),
);
/** Setup ops of Sim §4.4.1. */
const DOC_SETUP_OPS = new Set(
  'flag.set config.patch orca.setStatus orca.createDevice orca.linkDevice orca.deleteEntity orca.syncFromGort device.stage device.swap device.provision power.plug power.addLoad ws.adbKnows chat.post ollama.seedReceipt repo.clone repo.commitFixture repo.deleteFile github.seedPr github.reopenPr github.unmergePr config.write jenkins.setParam jenkins.startBuild jenkins.seedBuild runner.startLocal'.split(' '),
);

function liveCatalogue(): { faults: Set<string> | null; ops: Set<string> | null } {
  try {
    const f = sim.faults.catalogue();
    const o = sim.faults.setupCatalogue();
    return { faults: f.length ? new Set(f.map((x) => x.id)) : null, ops: o.length ? new Set(o.map((x) => x.op)) : null };
  } catch {
    return { faults: null, ops: null };
  }
}

/* ───────────────────────────── walkers ───────────────────────────── */

function setupsOf(lesson: LessonDef): SetupSpec[] {
  const out: SetupSpec[] = [lesson.setup];
  if (lesson.replaySetup) out.push(lesson.replaySetup);
  const fromActions = (as: readonly ScriptAction[] | undefined) => as?.forEach((a) => a.do === 'setup' && out.push(a.setup));
  for (const s of lesson.steps) {
    if (s.kind === 'setup') out.push(s.setup);
    fromActions(s.onEnter);
    fromActions(s.onComplete);
    if (s.kind === 'script') fromActions(s.actions);
  }
  return out;
}

function actionsOf(step: LessonStep): ScriptAction[] {
  return [...(step.onEnter ?? []), ...(step.onComplete ?? []), ...(step.kind === 'script' ? step.actions : [])];
}

/** Every condition reachable from a step (success, objectives, wrong-action `when`, branch `if`). */
function conditionsOf(step: LessonStep): Condition[] {
  const out: Condition[] = [];
  if ('success' in step && step.success) out.push(step.success);
  if ((step.kind === 'interact' || step.kind === 'computer-task') && step.objectives) out.push(...step.objectives.map((o) => o.done));
  for (const w of step.wrongActions ?? []) if (w.when) out.push(w.when);
  if (step.kind === 'branch' && step.if) out.push(step.if);
  if (step.kind === 'fast-forward' && typeof step.to === 'object' && 'until' in step.to) out.push(step.to.until);
  return out;
}

type Matcher = { event: string; where?: Record<string, unknown> };
function matchersOf(cond: Condition, out: Matcher[] = []): Matcher[] {
  switch (cond.op) {
    case 'all':
    case 'any':
      cond.of.forEach((x) => matchersOf(x, out));
      break;
    case 'not':
    case 'always':
    case 'never':
    case 'wasTrue':
    case 'held':
      matchersOf(cond.of, out);
      break;
    case 'happened':
      out.push(cond.match as Matcher);
      break;
    case 'sequence':
      out.push(...(cond.steps as Matcher[]));
      break;
    case 'verify':
      if (cond.on.kind === 'event') out.push(cond.on.match as Matcher);
      if (cond.then) matchersOf(cond.then, out);
      break;
    default:
      break;
  }
  return out;
}

function allMatchers(lesson: LessonDef): Matcher[] {
  const out: Matcher[] = [];
  for (const s of lesson.steps) {
    conditionsOf(s).forEach((c) => matchersOf(c, out));
    for (const w of s.wrongActions ?? []) out.push(w.on as Matcher);
    if (s.kind === 'wait-for-event') out.push(s.match as Matcher);
  }
  return out;
}

/** Displayed strings (skips condition/matcher data). */
const NON_TEXT_KEYS = new Set(['success', 'done', 'on', 'when', 'if', 'match', 'until', 'setup', 'run', 'route', 'target', 'prop', 'part', 'location', 'id', 'goto', 'else', 'app', 'checkpointId', 'questionIds', 'factIds', 'manualEntryIds', 'moduleId', 'deck', 'marker', 'speaker', 'kind', 'do', 'npc', 'action', 'effect', 'author', 'channel', 'entryIds', 'manualChapters', 'tools', 'fuses', 'gw']);
function texts(value: unknown, out: string[] = [], key = ''): string[] {
  if (NON_TEXT_KEYS.has(key)) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => texts(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) texts(v, out, k);
  return out;
}

function propOk(id: string): boolean {
  if (id.startsWith('npc.')) return (NPC_IDS as readonly string[]).includes(NPC_ALIASES[id] ?? id);
  const w = resolvePropId(id);
  return isPropId(w) || isPropId(`${w}-left`);
}

function routeOk(app: string, route: string): boolean {
  const defs = (APP_ROUTES as Record<string, Record<string, { path: string }>>)[app];
  if (!defs) return false;
  return Object.values(defs).some((d) => matchRoute(d as never, route) !== null);
}

function hintTargetOk(target: string): boolean {
  return (APP_HINT_TARGETS as readonly string[]).some((t) => (t.endsWith(':') ? target.startsWith(t) : target === t));
}

const ALL_STEPS = AUTHORED_LESSONS.flatMap((l) => l.steps.map((s) => ({ lesson: l, step: s })));

/* ───────────────────────────── tests ───────────────────────────── */

describe('Academy lessons — structure', () => {
  it('exports all 18 modules M01–M18 as LessonDefs keyed by id', () => {
    expect(Object.keys(LESSONS).sort()).toEqual(MODULE_IDS);
    for (const id of MODULE_IDS) expect(LESSONS[id]!.moduleId).toBe(id);
  });

  it.each(MODULE_IDS)('%s has ≥ 8 steps, ≥ 1 checkpoint, unique prefixed step ids and a 3–6 bullet checklist', (id) => {
    const l = LESSONS[id]!;
    expect(l.steps.length).toBeGreaterThanOrEqual(8);
    expect(l.steps.some((s) => s.kind === 'quiz-checkpoint')).toBe(true);
    const ids = l.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ids) expect(s).toMatch(new RegExp(`^${id}\\.\\d{2}[a-z]?$`));
    expect(l.realLabChecklist.length).toBeGreaterThanOrEqual(3);
    expect(l.realLabChecklist.length).toBeLessThanOrEqual(6);
    expect(l.setup.preset).toBe(`academy:${id}`);
    expect(TEAM_KEYS.has(l.mentor)).toBe(true);
    expect(MODULES_BY_ID[id]?.mentor ?? l.mentor).toBe(l.mentor);
  });

  it('branch targets point at steps of the same lesson', () => {
    for (const { lesson, step } of ALL_STEPS) {
      if (step.kind !== 'branch') continue;
      const ids = new Set(lesson.steps.map((s) => s.id));
      expect(ids.has(step.goto)).toBe(true);
      if (step.else) expect(ids.has(step.else)).toBe(true);
    }
  });
});

describe('Academy lessons — content references', () => {
  it('checkpoints use existing quiz items and match the curriculum checkpoint of the module', () => {
    for (const l of AUTHORED_LESSONS) {
      const cps = l.steps.filter((s): s is Extract<LessonStep, { kind: 'quiz-checkpoint' }> => s.kind === 'quiz-checkpoint');
      for (const cp of cps) {
        for (const q of cp.questionIds) expect(questionById(q), `${l.moduleId} ${cp.checkpointId} ${q}`).toBeDefined();
        expect(cp.checkpointId).toMatch(new RegExp(`^CP-${l.moduleId}\\.\\d$`));
      }
      const meta = MODULES_BY_ID[l.moduleId];
      if (meta?.checkpointQuestionIds?.length) expect([...cps.flatMap((c) => c.questionIds)].sort()).toEqual([...meta.checkpointQuestionIds].sort());
      if (meta?.checkpointId) expect(cps[0]?.checkpointId).toBe(meta.checkpointId);
    }
  });

  it('fact ids and Field Manual articles exist', () => {
    for (const { lesson, step } of ALL_STEPS) {
      for (const f of step.factIds ?? []) expect(FACT_IDS.has(f), `${lesson.moduleId} ${step.id} ${f}`).toBe(true);
      if (step.kind === 'inspect') for (const a of step.manualEntryIds ?? []) expect(ARTICLE_IDS.has(a), `${step.id} ${a}`).toBe(true);
      for (const a of actionsOf(step)) if (a.do === 'unlockManual') for (const e of a.entryIds) expect(ARTICLE_IDS.has(e), `${step.id} ${e}`).toBe(true);
    }
  });

  it('speakers and NPC script actions are team keys', () => {
    for (const { lesson, step } of ALL_STEPS) {
      if (step.kind === 'dialogue') expect(TEAM_KEYS.has(step.speaker), `${step.id} ${step.speaker}`).toBe(true);
      if (step.kind === 'hint' && step.speaker) expect(TEAM_KEYS.has(step.speaker)).toBe(true);
      for (const w of step.wrongActions ?? []) if (w.speaker) expect(TEAM_KEYS.has(w.speaker), `${step.id} ${w.id}`).toBe(true);
      const choices = (step.kind === 'dialogue' || step.kind === 'interact' ? step.choices : undefined) ?? [];
      for (const ch of choices) for (const r of ch.response ?? []) expect(TEAM_KEYS.has(r.speaker), `${step.id} ${ch.id}`).toBe(true);
      for (const a of actionsOf(step)) {
        if (a.do === 'say' || a.do === 'bark') expect(TEAM_KEYS.has(a.speaker), `${lesson.moduleId} ${step.id}`).toBe(true);
        if (a.do === 'npc') expect(TEAM_KEYS.has(a.npc)).toBe(true);
      }
    }
  });
});

describe('Academy lessons — world ids', () => {
  it('walk-to steps and spawns use world location anchors', () => {
    for (const l of AUTHORED_LESSONS) for (const s of setupsOf(l)) if (s.spawn) expect(LOCATION_BY_ID[s.spawn], `${l.moduleId} spawn ${s.spawn}`).toBeDefined();
    for (const { step } of ALL_STEPS) {
      if (step.kind === 'walk-to') expect(LOCATION_BY_ID[step.location], `${step.id} ${step.location}`).toBeDefined();
      if (step.marker?.kind === 'location') expect(LOCATION_BY_ID[step.marker.id], `${step.id} marker`).toBeDefined();
    }
  });

  it('inspect / interact targets resolve to world props, interactables or NPCs', () => {
    const missing: string[] = [];
    for (const { step } of ALL_STEPS) {
      const ids: string[] = [];
      if (step.kind === 'inspect') ids.push(step.prop, ...(step.part ? [step.part] : []));
      if (step.kind === 'interact') ids.push(step.target);
      if (step.marker && step.marker.kind !== 'location' && step.marker.kind !== 'app' && step.marker.kind !== 'rig') ids.push(step.marker.id);
      for (const a of actionsOf(step)) if (a.do === 'callouts') ids.push(a.prop);
      for (const id of ids) if (!propOk(id)) missing.push(`${step.id}: ${id}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('Academy lessons — workstation apps', () => {
  it('computer-task apps, routes and Show-me hint targets exist in the apps contract', () => {
    for (const { step } of ALL_STEPS) {
      for (const a of actionsOf(step)) if (a.do === 'openApp') expect(routeOk(a.app, a.route ?? '/'), `${step.id} openApp ${a.route}`).toBe(true);
      if (step.kind !== 'computer-task') continue;
      const apps = (Array.isArray(step.app) ? step.app : [step.app]) as string[];
      for (const app of apps) expect((APP_IDS as readonly string[]).includes(app), `${step.id} app ${app}`).toBe(true);
      if (step.route) expect(apps.some((a) => routeOk(a, step.route!)), `${step.id} route ${step.route}`).toBe(true);
      for (const g of step.showMe ?? []) {
        expect((APP_IDS as readonly string[]).includes(g.app), `${step.id} showMe app`).toBe(true);
        expect(hintTargetOk(g.target), `${step.id} showMe target ${g.target}`).toBe(true);
        if (g.route) expect(routeOk(g.app, g.route), `${step.id} showMe route ${g.route}`).toBe(true);
      }
    }
  });

  it('every app.action matched is an APP_ACTIONS name (or a known world action)', () => {
    const unknown: string[] = [];
    for (const l of AUTHORED_LESSONS) {
      for (const m of allMatchers(l)) {
        if (m.event !== 'app.action' || !m.where?.action) continue;
        const action = String(m.where.action);
        if (m.where.app === 'world') {
          if (!WORLD_ACTIONS_EMITTED.has(action) && !WORLD_ACTIONS_UI.has(action)) unknown.push(`${l.moduleId}: world ${action}`);
        } else if (!APP_ACTION_NAMES.has(action)) unknown.push(`${l.moduleId}: ${String(m.where.app)} ${action}`);
        else if (m.where.app && m.where.app !== 'world') expect(action.split('.')[0], `${l.moduleId} ${action}`).toBe(String(m.where.app));
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe('Academy lessons — sim scenarios', () => {
  it('scenario items use catalogued fault ids and setup ops', () => {
    const live = liveCatalogue();
    if (!live.faults) console.info('[lessons] live sim fault catalogue unavailable — checking against the Sim §4.3 list');
    const faults = live.faults ?? DOC_FAULT_IDS;
    const ops = live.ops ?? DOC_SETUP_OPS;
    const used = new Set<string>();
    for (const l of AUTHORED_LESSONS) {
      for (const s of setupsOf(l)) {
        for (const it of s.scenario ?? []) {
          if ('faultId' in it) {
            used.add(it.faultId);
            expect(faults.has(it.faultId) || DOC_FAULT_IDS.has(it.faultId), `${l.moduleId} fault ${it.faultId}`).toBe(true);
          } else expect(ops.has(it.op) || DOC_SETUP_OPS.has(it.op), `${l.moduleId} op ${it.op}`).toBe(true);
        }
      }
    }
    for (const f of LESSON_FAULT_IDS) expect(DOC_FAULT_IDS.has(f)).toBe(true);
    if (live.faults) {
      const missingLive = [...used].filter((f) => !live.faults!.has(f));
      if (missingLive.length) console.info(`[lessons] faults used but not yet in the live sim catalogue: ${missingLive.join(', ')}`);
    }
  });

  it('presets are academy presets', () => {
    let presets: string[] = [];
    try {
      presets = sim.presets();
    } catch {
      presets = [];
    }
    for (const l of AUTHORED_LESSONS) {
      for (const s of setupsOf(l)) if (s.preset) expect(s.preset).toMatch(/^academy:M(0[1-9]|1[0-8])$/);
      if (presets.length) expect(presets, l.moduleId).toContain(l.setup.preset);
    }
  });

  it('global wrong actions referenced are GP GW01–GW24', () => {
    for (const { step } of ALL_STEPS) for (const w of step.wrongActions ?? []) if (w.gw) expect(w.gw, step.id).toMatch(/^GW(0[1-9]|1\d|2[0-4])$/);
  });
});

describe('Academy lessons — text rules', () => {
  const NAME = /\b(Morgan|Jared|Tate|David|Riley|Sam|Alex)\b/;
  const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;

  it('authored strings never spell team names (use {{key}} tokens) and never use gendered pronouns', () => {
    const bad: string[] = [];
    for (const l of AUTHORED_LESSONS) {
      for (const t of texts(l)) {
        if (NAME.test(t)) bad.push(`${l.moduleId} name: ${t.slice(0, 80)}`);
        if (GENDERED.test(t)) bad.push(`${l.moduleId} pronoun: ${t.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every people token resolves', () => {
    for (const l of Object.values(LESSONS)) for (const t of texts(l)) expect(t, l.moduleId).not.toMatch(/\{\{[a-z0-9-]+\}\}/);
  });

  it('dialogue lines and HUD objectives are non-empty and HUD lines are short', () => {
    for (const { step } of ALL_STEPS) {
      if (step.kind === 'dialogue') expect(step.text.trim().length).toBeGreaterThan(10);
      if ('hud' in step && step.hud !== undefined) {
        expect(step.hud.trim().length, step.id).toBeGreaterThan(3);
        expect(step.hud.length, step.id).toBeLessThanOrEqual(170);
      }
    }
  });
});
