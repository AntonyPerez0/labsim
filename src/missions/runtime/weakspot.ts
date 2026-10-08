/**
 * Weak Spot playlist (GP §4.8.5): the 3 lowest-mEff seen tags → 5 mixed drill items touching them (90 s)
 * → a 3-incident micro-shift (Shift rules, heat H2, no pipelines, length Σ par × 1.2) → before/after bars
 * and "Review these cards".
 */
import type { TxContext } from '@/core/store';
import type { RootState } from '@/core/state';
import { hashString } from '@/core/rng';
import type { MissionResult } from '../api';
import { RT } from './rt';
import { beginActivity, endActivity, finaliseResultRank, newResult } from './session';
import { effectiveMastery, weakestSeenTags } from './progression/mastery';
import { realNowMs } from './clock';
import { drillHooks, mixedDrillDef, startDrill } from './drills/host';
import { buildWeakSpotPlan, microLength } from './arcade/plans';
import { directorHooks, startShift, writeShiftResult } from './arcade/director';
import { allIncidents } from './registry';
import { modeUnlocked } from './academy/catalog';

export function weakSpotTags(d: RootState): string[] {
  const seen = weakestSeenTags(d.progress, 3);
  if (seen.length) return seen;
  // Nothing seen yet: use the tags of unlocked incidents.
  const tags = allIncidents().flatMap((i) => i.tags);
  return [...new Set(tags)].slice(0, 3);
}

export function startWeakSpot(d: RootState, ctx: TxContext): MissionResult {
  if (!modeUnlocked(d.progress, 'weak-spot')) return { ok: false, error: 'Complete M06 to unlock Weak Spot.' };
  const tags = weakSpotTags(d);
  if (!tags.length) return { ok: false, error: 'No weak tags yet — play a shift or a drill first.' };
  const seed = hashString(`weakspot:${realNowMs()}:${d.session.runId}`);
  beginActivity(d, ctx, { mode: 'arcade-weakspot', activityId: 'weak-spot', seed, preset: 'arcade', timeScale: 5, startHour: 8, simConfig: { pipelinesEnabled: false, forceHealthCheckAllowed: false } });
  const now = realNowMs();
  d.session.weakSpot = {
    tags,
    phase: 'drills',
    before: Object.fromEntries(tags.map((t) => [t, effectiveMastery(d.progress.tagMastery[t], now)])),
    after: null,
    drillItemsDone: 0,
  };
  const def = mixedDrillDef(d, tags, 5);
  if (!def.items?.length) startMicroShift(d, ctx);
  else startDrill(d, ctx, def.id, { embedded: { def }, tags });
  return { ok: true, value: undefined };
}

function startMicroShift(d: RootState, ctx: TxContext): void {
  const ws = d.session.weakSpot;
  if (!ws) return;
  ws.phase = 'shift';
  d.session.drill = null;
  d.ui.overlay = { kind: 'none' };
  const plan = buildWeakSpotPlan(d.progress, ws.tags, RT.rng);
  if (!plan.length) {
    summary(d, ctx);
    return;
  }
  const ids = plan.map((p) => p.incidentId);
  startShift(d, ctx, { configId: 'weak-spot', incidentIds: ids }, { mode: 'arcade-weakspot', keepSession: true, plan, durationS: microLength(ids), seed: RT.rng.seed });
}

function summary(d: RootState, ctx: TxContext): void {
  const ws = d.session.weakSpot!;
  ws.phase = 'summary';
  const now = realNowMs();
  ws.after = Object.fromEntries(ws.tags.map((t) => [t, effectiveMastery(d.progress.tagMastery[t], now)]));
  const sh = d.session.shift;
  if (sh) writeShiftResult(d, ctx, sh, sh.endReason ?? 'time', { noDebrief: true });
  const result = d.session.result ?? newResult(d, 'weak-spot', 'Weak Spot');
  result.kind = 'weak-spot';
  result.title = 'Weak Spot';
  result.passed = true;
  result.weakSpot = { tags: ws.tags.map((t) => ({ tag: t, before: ws.before[t] ?? 0, after: ws.after![t] ?? 0 })) };
  result.takeaways = ws.tags.map((t) => `${t}: ${Math.round((ws.before[t] ?? 0) * 100)} % → ${Math.round((ws.after![t] ?? 0) * 100)} %`);
  d.session.result = result;
  endActivity(d, ctx, result);
  finaliseResultRank(d);
}

drillHooks.finished.push((d, ctx) => {
  const ws = d.session.weakSpot;
  if (d.session.mode !== 'arcade-weakspot' || !ws || ws.phase !== 'drills') return false;
  ws.drillItemsDone = d.session.drill?.answers.length ?? 0;
  startMicroShift(d, ctx);
  return true;
});

directorHooks.ended.push((d, ctx) => {
  if (d.session.mode !== 'arcade-weakspot' || !d.session.weakSpot) return false;
  summary(d, ctx);
  return true;
});
