/**
 * GP §3.3 rules as data: `GLOBAL_WRONG_ACTIONS` (GW01–GW24) and `PROCESS_BONUSES` (PB01–PB08).
 *
 * The GP table data (penalty, strike rule, consequence, tags, Teach Card, trigger description) is
 * authored here; the executable detectors / checks are missions-core's (`runtime/arcade/gw.ts`,
 * `runtime/arcade/pb.ts`) and are merged in by id, so both stay in one place each.
 */
import type { GlobalWrongActionDef, ProcessBonusDef } from '../../types';
import { GLOBAL_WRONG_ACTIONS as RUNTIME_GW } from '../../runtime/arcade/gw';
import { PROCESS_BONUSES as RUNTIME_PB } from '../../runtime/arcade/pb';
import { GW_SPECS } from './gw';
import { PB_SPECS } from './pb';

export * from './gw';
export * from './pb';

const runtimeGw = new Map(RUNTIME_GW.map((g) => [g.id, g]));
const runtimePb = new Map(RUNTIME_PB.map((b) => [b.id, b]));

export const GLOBAL_WRONG_ACTIONS: readonly GlobalWrongActionDef[] = GW_SPECS.map((s) => {
  const rt = runtimeGw.get(s.id);
  const def: GlobalWrongActionDef = {
    id: s.id,
    name: s.name,
    action: s.action,
    penalty: s.penalty,
    strike: s.strike === 'always' ? true : s.strike === 'never' ? false : 'conditional',
    tags: s.tags,
    consequence: s.consequence,
    detect: rt?.detect ?? [],
    teach: { ...s.teach, factIds: [...s.factIds] },
    factIds: s.factIds,
  };
  if (rt?.strikeWhen) def.strikeWhen = rt.strikeWhen;
  if (rt?.cooldownS !== undefined) def.cooldownS = rt.cooldownS;
  return def;
});

export const PROCESS_BONUSES: readonly ProcessBonusDef[] = PB_SPECS.map((s) => {
  const rt = runtimePb.get(s.id);
  const def: ProcessBonusDef = { id: s.id, behaviour: s.behaviour, points: s.points, appliesTo: s.appliesTo, check: rt?.check ?? (() => false) };
  if (s.minRank) def.minRank = s.minRank;
  return def;
});
