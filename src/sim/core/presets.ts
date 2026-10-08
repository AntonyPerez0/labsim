/**
 * Presets (Sim §6.5) and the Academy module scenarios (Sim §4.4.2 "At reset"). `buildPresetLab` builds
 * the whole lab outside the store (pure apart from the returned object): factory seed at the preset's
 * start hour (incl. the factory health check run #1), preset configuration and flags, then the module's
 * scenario with `injectAll` semantics — a failing item logs an `error` and the rest is skipped.
 */
import type { LabState, SimConfig } from '../types';
import { TIME_SCALES } from '../types';
import type { ScenarioItem } from '../api';
import { createFactoryLab } from '../initialState';
import { detachedCtx, log } from './util';
import { applyScenario } from './faults/engine';

export type PresetKind = 'factory' | 'academy' | 'arcade' | 'freeplay' | 'cert' | 'test';

/** Sim §6.5 table. */
export const PRESET_TABLE: Record<PresetKind, { config: Omit<SimConfig, 'logCap'>; startHour: number; timeScale: number }> = {
  factory: { config: { mode: 'freeplay', damageModel: 'full', pipelinesEnabled: false, npcAutoMerge: true, forceHealthCheckAllowed: true }, startHour: 9, timeScale: 1 },
  academy: { config: { mode: 'academy', damageModel: 'academy', pipelinesEnabled: false, npcAutoMerge: true, forceHealthCheckAllowed: true }, startHour: 9, timeScale: 1 },
  arcade: { config: { mode: 'arcade', damageModel: 'arcade', pipelinesEnabled: true, npcAutoMerge: true, forceHealthCheckAllowed: false }, startHour: 8, timeScale: 5 },
  freeplay: { config: { mode: 'freeplay', damageModel: 'full', pipelinesEnabled: false, npcAutoMerge: true, forceHealthCheckAllowed: true }, startHour: 9, timeScale: 1 },
  cert: { config: { mode: 'cert', damageModel: 'arcade', pipelinesEnabled: true, npcAutoMerge: true, forceHealthCheckAllowed: false }, startHour: 8, timeScale: 1 },
  test: { config: { mode: 'test', damageModel: 'full', pipelinesEnabled: false, npcAutoMerge: false, forceHealthCheckAllowed: true }, startHour: 9, timeScale: 1 },
};

export const ACADEMY_MODULES = Array.from({ length: 18 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
export const PRESET_NAMES = ['factory', 'arcade', 'freeplay', 'cert', 'test', ...ACADEMY_MODULES.map((m) => `academy:${m}`)];

const PIGEON_SWIPE = 'tests/sale/swipe_sale_print.json';

/** Sim §4.4.2 "At reset (in order)" per Academy module. */
export const ACADEMY_SCENARIOS: Record<string, ScenarioItem[]> = {
  M01: [{ faultId: 'rig.testRunning', params: { rig: 'wall-e', job: 'Java/uia-remote-regression-flex', number: 4120 } }],
  M02: [],
  M03: [
    { faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } },
    { op: 'power.addLoad', params: { id: 'psu-flex4-new', label: 'New Flex 4 power brick', expects: 'AC-BRICK-18V', drawA: 0.5 } },
    { op: 'power.addLoad', params: { id: 'psu-collis-spare', label: 'Spare Collis probe PSU', expects: 'AC-BRICK-18V', drawA: 0.3 } },
  ],
  M04: [],
  M05: [],
  M06: [],
  M07: [
    { faultId: 'orca.hrnTypo', params: { robot: 'johnny-5' } },
    { op: 'device.swap', params: { rig: 'johnny-5', deviceId: 'dev-spare-flex2' } },
    { faultId: 'orca.urlWrong', params: { robot: 'johnny-5', field: 'tap', value: '' } },
    { faultId: 'orca.tetherCleared', params: { robot: 'optimus' } },
    { faultId: 'orca.offsets', params: { robot: 'bumblebee', yMm: 1.5 } },
  ],
  M08: [
    { faultId: 'merchant.credentialBlank', params: { merchant: 'GO-SDK-US-01', field: 'apiKey' } },
    { faultId: 'gort.capabilityDropped', params: { path: 'go-sdk/tests/sale_receipt.json', key: 'printer' } },
  ],
  M09: [
    { op: 'flag.set', params: { flag: 'receiptQrFeature', value: false } },
    { faultId: 'receipt.qrRollout', params: { devices: ['dev-eve-flex4'] } },
    { faultId: 'orca.missingReceiptMap', params: { deviceType: 'FLEX_4' } },
    { op: 'repo.deleteFile', params: { repo: 'gort', path: 'config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json', by: 'jared', message: 'Remove unverified FLEX_4 5-option map' } },
  ],
  M10: [],
  M11: [{ faultId: 'jenkins.envCase', params: { job: 'Java/uia-remote-regression-flex', value: 'flex_3' } }],
  M12: [],
  M13: [
    { faultId: 'uia.scrollSwapped', params: { mode: 'swapped' } },
    { faultId: 'uia.missingScreenMethods', params: { class: 'ReceiptScreen' } },
  ],
  M14: [
    { op: 'repo.clone', params: { repo: 'uia-remote' } },
    { op: 'config.write', params: { fixture: 'm14-broken' } },
    { op: 'ws.adbKnows', params: { target: '10.42.60.4:5555' } },
  ],
  M15: [
    { op: 'github.unmergePr', params: { repo: 'gort', number: 418 } },
    { op: 'repo.commitFixture', params: { repo: 'pigeon', path: PIGEON_SWIPE, fixture: 'm15-expanded', by: 'alex', message: 'Expand swipe sale actions' } },
    { faultId: 'pigeon.missingComma', params: { path: PIGEON_SWIPE, line: 22 } },
    { op: 'jenkins.setParam', params: { job: 'Java/pigeon-android-sale-swipe', param: 'ROBOT_NAME', value: 'bumblebee' } },
  ],
  M16: [
    { op: 'github.unmergePr', params: { repo: 'uia-remote', number: 398 } },
    { op: 'orca.deleteEntity', params: { entity: 'screenCompareImage', name: 'CFD_TOTAL' } },
    { op: 'device.stage', params: { device: 'dev-r2-d2-duo', stage: 'review-order' } },
    { op: 'repo.clone', params: { repo: 'uia-remote' } },
    { op: 'config.write', params: { fixture: 'target', robot: 'megatron' } },
    { op: 'repo.commitFixture', params: { repo: 'pigeon', path: PIGEON_SWIPE, fixture: 'm16-with-compare', by: 'morgan', message: 'Add CFD total screen compare' } },
  ],
  M17: [{ op: 'github.reopenPr', params: { repo: 'uia-remote', number: 212 } }],
  M18: [],
};

export function parsePreset(name: string): { kind: PresetKind; module: string | null } | null {
  if (name.startsWith('academy:')) {
    const mod = name.slice('academy:'.length);
    return ACADEMY_MODULES.includes(mod) ? { kind: 'academy', module: mod } : null;
  }
  return (Object.keys(PRESET_TABLE) as PresetKind[]).includes(name as PresetKind) ? { kind: name as PresetKind, module: null } : null;
}

/** Nearest allowed time scale (ties down), Sim §6.3. */
export function snapScale(scale: number): number {
  let best: number = TIME_SCALES[0];
  for (const s of TIME_SCALES) if (Math.abs(s - scale) < Math.abs(best - scale)) best = s;
  return best;
}

/** Sim §6.5 steps 1–4. Unknown preset: `error` log, factory used (never throws). */
export function buildPresetLab(presetName: string, seed: number, startHour?: number, timeScale?: number): { lab: LabState; preset: string } {
  let parsed = parsePreset(presetName);
  let preset = presetName;
  let unknown = false;
  if (!parsed) {
    unknown = true;
    parsed = { kind: 'factory', module: null };
    preset = 'factory';
  }
  const row = PRESET_TABLE[parsed.kind];
  const hour = startHour ?? row.startHour;
  const lab = createFactoryLab(seed, hour);
  if (unknown) log(lab, 'sim', 'error', `unknown preset '${presetName}' — using factory`);
  lab.config = { ...row.config, logCap: 500 };
  lab.time.timeScale = snapScale(timeScale ?? row.timeScale);
  lab.flags = { receiptQrFeature: true, uiaVersion: '2.3', softwarePinBypass: false, showTouchTargets: false, cfdLayoutV2Toggle: false };
  const items = parsed.module ? (ACADEMY_SCENARIOS[parsed.module] ?? []) : [];
  if (items.length) {
    const r = applyScenario(lab, detachedCtx(lab), items, { inPreset: true });
    if (!r.ok) log(lab, 'sim', 'error', `preset ${preset}: ${r.error} — rest of the scenario skipped`);
  }
  lab.rngStreams.core = { ...lab.rng };
  return { lab, preset };
}
