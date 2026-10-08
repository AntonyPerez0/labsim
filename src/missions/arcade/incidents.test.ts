/**
 * Integrity tests for the Arcade incident catalogue (GP §3.5) and the GW/PB rule data (GP §3.3):
 * completeness, cross-references to content (tags, modules, facts), the sim fault catalogue, and that
 * every scenario injects on a fresh Arcade lab and leaves its success condition false until fixed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sim } from '@/sim';
import { createInitialRoot, getState, store } from '@/core/store';
import { createRngState } from '@/core/rng';
import { MODULES_BY_ID, TAGS_BY_ID, factById } from '@/content';
import type { IncidentBinding, IncidentDef, ScenarioItem } from '../types';
import { INCIDENTS } from './incidents';
import { CANONICAL_VISA_TRACKS } from './incidents/inc51-58';
import { GLOBAL_WRONG_ACTIONS, GW_SPECS, PB_SPECS, PROCESS_BONUSES } from './rules';
import { GLOBAL_WRONG_ACTIONS as RUNTIME_GW } from '../runtime/arcade/gw';
import { PROCESS_BONUSES as RUNTIME_PB } from '../runtime/arcade/pb';
import { addTruth, bindIncident, resolveVariant, tpl } from '../runtime/arcade/binding';
import { substituteScenario } from '../runtime/scripts';
import { createScope, disposeScope, evaluate, hasVerify } from '../runtime/conditions/evaluate';

const EXPECTED = Array.from({ length: 65 }, (_, i) => `INC${String(i + 1).padStart(2, '0')}`);

function variantsOf(def: IncidentDef): string[] {
  return ['A', ...(def.variants ?? []).map((v) => v.id)];
}

function freshLab(): void {
  store.setState(createInitialRoot(), true);
  sim.reset({ preset: 'arcade', seed: 7 });
}

function bind(def: IncidentDef, vid: string): IncidentBinding {
  const rng = createRngState(42);
  const b = bindIncident(def, vid, getState().lab, rng, { preferRig: null, busyRigs: [], mode: 'default', seed: 1234 });
  if (!b) throw new Error(`${def.id}-${vid}: no binding`);
  return addTruth(def, b, getState().lab, rng);
}

describe('incident catalogue', () => {
  it('has INC01–INC65 exactly once each', () => {
    const ids = INCIDENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(EXPECTED);
  });

  it('matches the GP §3.7 difficulty distribution (D1×12 · D2×23 · D3×24 · D4×4 · D5×2)', () => {
    const d: Record<number, number> = {};
    for (const i of INCIDENTS) d[i.difficulty] = (d[i.difficulty] ?? 0) + 1;
    expect(d).toEqual({ 1: 12, 2: 23, 3: 24, 4: 4, 5: 2 });
  });

  it('has no Diagnosis Call exactly for change / project / review / judgement tickets (GP §2.3.6)', () => {
    const none = INCIDENTS.filter((i) => i.diagnosisCall === 'none').map((i) => i.id);
    expect(none).toEqual(['INC34', 'INC38', 'INC42', 'INC43', 'INC58', 'INC61', 'INC62']);
  });

  it('marks the GP §2.3.11 planned-work incidents', () => {
    expect(INCIDENTS.filter((i) => i.plannedWork).map((i) => i.id)).toEqual(['INC19', 'INC38', 'INC42', 'INC44', 'INC59']);
  });

  it('references only known GW and PB ids', () => {
    const gw = new Set(GW_SPECS.map((g) => g.id));
    const pb = new Set(PB_SPECS.map((b) => b.id));
    for (const def of INCIDENTS) {
      for (const vid of variantsOf(def)) for (const w of resolveVariant(def, vid).wrongButTempting) if (w.gw) expect(gw.has(w.gw), `${def.id} ${w.gw}`).toBe(true);
      for (const b of def.processBonuses ?? []) expect(pb.has(b), `${def.id} ${b}`).toBe(true);
    }
  });

  it('canonical Visa tracks equal the factory swipe profile', () => {
    freshLab();
    const prof = Object.values(getState().lab.orca.cardProfiles).find((x) => x.name === 'VISA_STD_SWIPE');
    expect(prof?.trackData).toBe(CANONICAL_VISA_TRACKS);
  });

  it.each(INCIDENTS.map((i) => [i.id, i] as const))('%s header, tags, module and facts resolve', (_id, def) => {
    expect(MODULES_BY_ID[def.unlockedBy], `unlockedBy ${def.unlockedBy}`).toBeTruthy();
    for (const t of def.tags) expect(TAGS_BY_ID[t], `tag ${t}`).toBeTruthy();
    for (const f of def.factIds ?? []) expect(factById(f), `fact ${f}`).toBeTruthy();
    expect(def.hints).toHaveLength(3);
    expect(def.symptoms.length + (def.task ? 1 : 0) + (def.replies ? 1 : 0)).toBeGreaterThan(0);
    if (def.escalatable) expect(def.escalation, 'escalatable incidents need an escalation').toBeTruthy();
    for (const vid of variantsOf(def)) {
      const d = resolveVariant(def, vid);
      if (d.diagnosisCall !== 'none') {
        const opts = d.diagnosisCall.options;
        expect(opts.filter((o) => o.correct).length, `${def.id}-${vid} exactly one correct call`).toBe(1);
        for (const o of opts) if (!o.correct) expect(o.wrongCallHint, `${def.id}-${vid} ${o.id} wrongCallHint`).toBeTruthy();
      }
      if (d.replies && !d.task) expect(d.replies.options.filter((o) => o.correct).length).toBeGreaterThanOrEqual(1);
      for (const w of d.wrongButTempting) expect(w.gw || w.penalty !== undefined, `${def.id} ${w.id}`).toBeTruthy();
    }
  });
});

describe('scenarios inject on a fresh Arcade lab', () => {
  const catalogue = new Set(sim.faults.catalogue().map((f) => f.id));
  const ops = new Set(sim.faults.setupCatalogue().map((o) => o.op));
  const cases = INCIDENTS.flatMap((def) => variantsOf(def).map((vid) => [`${def.id}-${vid}`, def, vid] as const));

  beforeEach(() => freshLab());

  it.each(cases)('%s', (_name, base, vid) => {
    const def = resolveVariant(base, vid);
    const b = bind(def, vid);
    // texts render, people tokens resolved, they/them only
    const texts = [
      ...def.symptoms.map((s) => tpl(s.text, b)),
      ...def.hints.map((h) => tpl(h, b)),
      tpl(def.ticket.title, b),
      tpl(def.ticket.misleading?.title, b),
      tpl(def.fix.byTheBook, b),
      tpl(def.fix.handsOn, b),
      def.name,
      def.teaches,
      ...def.diagnosisPath,
      ...(def.diagnosisCall === 'none' ? [] : def.diagnosisCall.options.flatMap((o) => [tpl(o.text, b), tpl(o.wrongCallHint, b)])),
      ...(def.replies?.options ?? []).flatMap((o) => [o.text, o.teach?.why ?? '', o.teach?.doInstead ?? '']),
      ...def.wrongButTempting.flatMap((w) => [w.text, w.teach?.whatHappened ?? '', w.teach?.why ?? '', w.teach?.doInstead ?? '']),
      ...(def.onSpawn?.(b) ?? []).map((a) => JSON.stringify(a)),
      ...(def.escalation ? def.escalation.jaredFix(b).map((a) => JSON.stringify(a)) : []),
    ];
    for (const s of def.symptoms) expect(tpl(s.text, b)).not.toBe('');
    for (const h of def.hints) expect(tpl(h, b)).not.toBe('');
    expect(tpl(def.ticket.title, b)).not.toBe('');
    for (const t of texts) {
      expect(t, 'unresolved people token').not.toMatch(/\{\{\w+\}\}/);
      expect(t, 'gendered pronoun').not.toMatch(/\b(he|she|him|her|his|hers|himself|herself)\b/i);
      expect(t, 'unsubstituted placeholder').not.toMatch(/\$(R|PI|DEV|BOX|PROBE|T)\b/);
    }
    // success is false before the incident on the factory lab (full mode) and evaluates without throwing
    const cond = def.success(b);
    const scope0 = createScope({ id: `t0:${def.id}`, kind: 'ticket', ownerId: def.id, cond, state: getState(), binding: b });
    expect(evaluate(cond, getState(), scope0, 'full')).toBe(false);
    disposeScope(scope0.id);
    // inject
    const setup = def.setup(b);
    const items = substituteScenario(setup.scenario ?? [], b) as ScenarioItem[];
    for (const it of items) {
      if ('faultId' in it) expect(catalogue.has(it.faultId), `fault ${it.faultId}`).toBe(true);
      else expect(ops.has((it as { op: string }).op), `op ${(it as { op: string }).op}`).toBe(true);
      expect(JSON.stringify(it)).not.toMatch(/\$(R|PI|DEV|BOX|PROBE|T)\b/);
    }
    const res = sim.faults.injectAll(items as never);
    expect(res.ok ? 'ok' : res.error).toBe('ok');
    if (setup.run) setup.run(sim, { lab: getState().lab, rng: createRngState(1), binding: b, vars: {} });
    for (let i = 0; i < 4; i++) sim.tick(250); // let the systems derive the broken state (power solver, hosts …)
    // the incident's broken state is not already "fixed"
    const scope = createScope({ id: `t1:${def.id}`, kind: 'ticket', ownerId: def.id, cond, state: getState(), binding: b });
    const immediate = evaluate(cond, getState(), scope, 'immediate');
    // Build-parameter fixes (INC39, INC41) have nothing to check but the confirming build: then only the
    // deferred part may be pending — never a plain true.
    if (immediate) expect(hasVerify(cond) && !evaluate(cond, getState(), scope, 'full'), 'success must be false right after injection').toBe(true);
    disposeScope(scope.id);
  });
});

describe('GW / PB rules (GP §3.3)', () => {
  it('defines GW01–GW24 and PB01–PB08', () => {
    expect(GW_SPECS.map((g) => g.id)).toEqual(Array.from({ length: 24 }, (_, i) => `GW${String(i + 1).padStart(2, '0')}`));
    expect(PB_SPECS.map((b) => b.id)).toEqual(Array.from({ length: 8 }, (_, i) => `PB0${i + 1}`));
    expect(GLOBAL_WRONG_ACTIONS).toHaveLength(24);
    expect(PROCESS_BONUSES).toHaveLength(8);
  });

  it.each(GW_SPECS.map((g) => [g.id, g] as const))('%s spec is complete and resolves', (_id, g) => {
    expect(g.trigger.rule.length).toBeGreaterThan(10);
    for (const t of g.tags) expect(TAGS_BY_ID[t], t).toBeTruthy();
    for (const f of g.factIds) expect(factById(f), f).toBeTruthy();
    if (g.strike === 'conditional') expect(g.strikeRule).toBeTruthy();
    for (const s of [g.action, g.consequence, g.teach.whatHappened, g.teach.why, g.teach.doInstead]) {
      expect(s).not.toMatch(/\{\{\w+\}\}/);
      expect(s).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    }
    // detectors come from the runtime; only the ticket-logic GWs (GW12, GW16) have none
    const merged = GLOBAL_WRONG_ACTIONS.find((x) => x.id === g.id)!;
    if (g.trigger.events.length) expect(merged.detect.length, `${g.id} detector`).toBeGreaterThan(0);
  });

  it('the runtime GW / PB tables agree with the GP data (penalty, strike, tags, points)', () => {
    const diffs: string[] = [];
    for (const g of GW_SPECS) {
      const rt = RUNTIME_GW.find((x) => x.id === g.id);
      if (!rt) {
        diffs.push(`${g.id} missing in runtime`);
        continue;
      }
      const strike = g.strike === 'always' ? true : g.strike === 'never' ? false : 'conditional';
      if (rt.penalty !== g.penalty) diffs.push(`${g.id} penalty ${rt.penalty} ≠ ${g.penalty}`);
      if (rt.strike !== strike) diffs.push(`${g.id} strike ${String(rt.strike)} ≠ ${String(strike)}`);
      if ([...rt.tags].sort().join() !== [...g.tags].sort().join()) diffs.push(`${g.id} tags ${rt.tags.join()} ≠ ${g.tags.join()}`);
    }
    for (const b of PB_SPECS) {
      const rt = RUNTIME_PB.find((x) => x.id === b.id);
      if (!rt) diffs.push(`${b.id} missing in runtime`);
      else if (rt.points !== b.points || rt.appliesTo !== b.appliesTo) diffs.push(`${b.id} points/appliesTo differ`);
    }
    expect(diffs).toEqual([]);
  });
});
