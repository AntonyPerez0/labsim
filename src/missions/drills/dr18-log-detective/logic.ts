/**
 * DR18 Log Detective (GP §2.4.3): one evidence snippet copied verbatim from an incident's Symptoms (GP §3.5,
 * `IncidentDef.symptoms`) plus that incident's four Diagnosis Call options; correct = the incident's correct
 * option. A wrong pick shows the incident's full symptom list and that option's `wrongCallHint`. The
 * misleading `FAILED at "select print"` case (INC22, Cur M15) is guaranteed early in every round once M15 is
 * unlocked. Items are generated from the live incident catalogue, bound to the incident's default rig.
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem, IncidentDef, SymptomSource } from '../../types';
import { INCIDENTS } from '../../arcade/incidents';
import { addTruth, bindIncident, tpl } from '../../runtime/arcade/binding';
import { lazyDrill } from '../common/lazy';
import { masteryWeight, moduleUnlocked, recentKeys, shuffle, weightedPick, filterByRoundTags, type RngState } from '../common/rng';
import { teach } from '../common/teach';

export interface LogOption {
  text: string;
  hint: string | null;
}

export interface LogData {
  incidentId: string;
  incidentName: string;
  where: SymptomSource;
  evidence: string;
  options: LogOption[];
  answer: number;
  /** Every symptom of the incident (shown after a wrong call). */
  symptoms: { where: SymptomSource; text: string }[];
}

/** Evidence sources that read like logs (preferred), then the rest. */
const LOG_SOURCES: SymptomSource[] = ['Notes', 'Jenkins', 'Terminal', 'IDE', 'GitHub', 'Ollama', 'GIMP'];
const OTHER_SOURCES: SymptomSource[] = ['Tablet', 'LED', 'Camera', 'Orca', 'LabChat', 'World'];

export function eligibleIncidents(state: RootState | null): IncidentDef[] {
  return INCIDENTS.filter((i) => i.diagnosisCall !== 'none' && i.symptoms.length > 0 && moduleUnlocked(state, i.unlockedBy));
}

function bind(def: IncidentDef, state: RootState | null, rng: RngState) {
  const lab = state?.lab;
  const fallback = { rig: def.rigs.default ?? null, hrn: def.rigs.default ? def.rigs.default.toUpperCase() : null, rigs: def.rigs.default ? [def.rigs.default] : [], vars: {}, seed: 1, variant: 'A' };
  if (!lab) return fallback;
  try {
    const b = bindIncident(def, 'A', lab, rng, { preferRig: null, busyRigs: [], mode: 'default', seed: 1 }) ?? fallback;
    return addTruth(def, b, lab, rng);
  } catch {
    return fallback;
  }
}

export function buildLogItem(def: IncidentDef, state: RootState | null, rng: RngState): DrillItem<LogData> | null {
  if (def.diagnosisCall === 'none') return null;
  const b = bind(def, state, rng);
  const symptoms = def.symptoms.map((s) => ({ where: s.where, text: tpl(s.text, b) })).filter((s) => s.text.trim().length > 0);
  if (!symptoms.length) return null;
  const forced = def.id === 'INC22' ? symptoms.find((s) => s.text.includes('select print')) : undefined;
  const logs = symptoms.filter((s) => LOG_SOURCES.includes(s.where));
  const pool = logs.length ? logs : symptoms.filter((s) => OTHER_SOURCES.includes(s.where));
  const ev = forced ?? shuffle(rng, pool.length ? pool : symptoms)[0]!;
  const raw = def.diagnosisCall.options.map((o) => ({ text: tpl(o.text, b), hint: o.wrongCallHint ? tpl(o.wrongCallHint, b) : null, correct: !!o.correct || false }));
  if (!raw.some((o) => o.correct)) raw[0]!.correct = true;
  const order = shuffle(rng, [0, 1, 2, 3]);
  const options = order.map((i) => ({ text: raw[i]!.text, hint: raw[i]!.hint }));
  const answer = order.findIndex((i) => raw[i]!.correct);
  const correctText = options[answer]!.text;
  const sympList = symptoms
    .slice(0, 5)
    .map((s) => `[${s.where}] ${s.text}`)
    .join(' · ');
  return {
    id: `DR18:${def.id}`,
    tags: [...def.tags],
    factIds: def.factIds ? [...def.factIds] : undefined,
    teach: teach(`Root cause: ${correctText}`, `${def.name}. Evidence: ${sympList}`, { ref: def.id, factIds: def.factIds ? [...def.factIds] : undefined, doInstead: 'Read every symptom before you call it.', tag: def.tags[0] }),
    data: { incidentId: def.id, incidentName: def.name, where: ev.where, evidence: ev.text, options, answer, symptoms },
  };
}

/** Fallback when the incident catalogue is unavailable: the M15 select-print case (Ref §5, F210/F211). */
const SELECT_PRINT: DrillItem<LogData> = {
  id: 'DR18:select-print',
  tags: ['jenkins.logs', 'pigeon.json', 'orca.screens'],
  factIds: ['F210', 'F211'],
  teach: teach('Root cause: outdated screen coordinates — the arm missed Print', 'A failure at "select print" is the last step attempted before the runner timed out waiting for a printer payload, usually because outdated coordinates made the arm miss the Print button.', { ref: 'Ref §5', factIds: ['F210', 'F211'] }),
  data: {
    incidentId: 'INC22',
    incidentName: 'The misleading "select print" log',
    where: 'Jenkins',
    evidence: 'LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s → FAILED at "select print"',
    options: [
      { text: 'Outdated screen coordinates — the arm missed the Print button', hint: null },
      { text: 'The printer is out of paper', hint: 'The printer has paper and a settings test-print works.' },
      { text: 'The "select print" JSON is invalid', hint: 'A JSON error fails at parse time, before step 1 — this run reached step 7.' },
      { text: 'The Pi crashed mid-run', hint: 'The runner kept logging until the timeout — the Pi answered the whole time.' },
    ],
    answer: 0,
    symptoms: [{ where: 'Jenkins', text: 'LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s → FAILED at "select print"' }],
  },
};

export function generateLog(rng: RngState, state: RootState | null, index: number): DrillItem<LogData> {
  const all = eligibleIncidents(state);
  if (!all.length) return SELECT_PRINT;
  const inc22 = all.find((i) => i.id === 'INC22');
  const recent = recentKeys(state, Math.min(8, Math.max(2, all.length - 1)));
  const drawn = new Set((state?.session?.drill?.queue ?? []).map((q) => q.split('#')[0]));
  if (inc22 && index === 1 && !drawn.has('DR18:INC22')) {
    const it = buildLogItem(inc22, state, rng);
    if (it) return it;
  }
  const pool = filterByRoundTags(state, all, (i) => i.tags).filter((i) => !recent.includes(`DR18:${i.id}`));
  for (let tries = 0; tries < 5; tries++) {
    const def = weightedPick(rng, pool.length ? pool : all, (i) => masteryWeight(state, i.tags));
    const it = buildLogItem(def, state, rng);
    if (it) return it;
  }
  return SELECT_PRINT;
}

export const DR18: DrillDef<LogData> = {
  id: 'DR18',
  name: 'Log Detective',
  format: 'Evidence snippet (Notes line, Jenkins tail, terminal output, IDE trace, git diff) → true root cause of 4',
  tags: ['jenkins.logs', 'orca.notes', 'orca.status.connfailed', 'tools.terminal', 'tools.intellij', 'tools.github', 'adb.usage', 'pigeon.json'],
  unlockedBy: ['M15'],
  durationS: 90,
  itemCount: null,
  medals: { bronze: 700, silver: 1300, gold: 1900 },
  scoring: 'standard',
  generate: (rng, state, index) => generateLog(rng, state, index),
  component: lazyDrill(() => import('./View'), '#4aa8ff'),
};
