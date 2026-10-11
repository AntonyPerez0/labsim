/**
 * DR11 Caps Lock (GP §2.4.3): accept (→) or reject (←) a Jenkins `DEVICE_TYPE` value against the Orka
 * Device Type enum (ALL CAPS, F121/F122); bonus cards ask about config.properties `deviceType` (the family:
 * Micro, Flux, Stand — F195). Generated: early cards are obvious (lower-case), later ones subtle
 * (`FLUX_GEN3`, `STAND_DUET2`, `POCKET`).
 */
import { DEVICE_TYPE_CODES } from '@/sim/types';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, pick, recentKeys, type RngState } from '../common/rng';
import { teach } from '../common/teach';
import type { RootState } from '@/core/state';

export interface CapsData {
  context: 'jenkins' | 'config';
  value: string;
  valid: boolean;
  /** Correct spelling when invalid (null when there is no single fix). */
  fix: string | null;
  reason: string;
  level: 1 | 2 | 3;
}

const ENUMS: readonly string[] = DEVICE_TYPE_CODES;
const FAMILIES = ['Micro', 'Flux', 'Stand'] as const;

interface Bad {
  value: string;
  fix: string | null;
  reason: string;
  level: 1 | 2 | 3;
}

/** Fixed traps from the spec (GP §2.4.3 DR11). */
const TRAPS: Bad[] = [
  { value: 'flux_3', fix: 'FLUX_3', reason: 'lower-case: Device Type enum strings are ALL CAPS', level: 1 },
  { value: 'Flux_3', fix: 'FLUX_3', reason: 'mixed case: the enum is ALL CAPS', level: 1 },
  { value: 'micro_3', fix: 'MICRO_3', reason: 'lower-case: the enum is ALL CAPS', level: 1 },
  { value: 'FLUX3', fix: 'FLUX_3', reason: 'missing the underscore', level: 2 },
  { value: 'FLUX-3', fix: 'FLUX_3', reason: 'hyphen instead of underscore', level: 2 },
  { value: 'Micro 3', fix: 'MICRO_3', reason: 'that is the product name, not the enum value', level: 1 },
  { value: 'STAND_DUET2', fix: 'STAND_DUET_2', reason: 'the generation number has its own underscore', level: 3 },
  { value: 'FLUX_GEN3', fix: null, reason: 'FLUX_GEN3 is the shared testing profile of Flux 3/4/Pocket, not a Device Type', level: 3 },
  { value: 'POCKET', fix: 'FLUX_POCKET', reason: 'the Flux Pocket enum value is FLUX_POCKET', level: 3 },
];

/** More generated near-misses (all invalid). */
const EXTRA: Bad[] = [
  { value: 'STAND_DUET_1', fix: 'STAND_DUET', reason: 'the first Duet is plain STAND_DUET', level: 3 },
  { value: 'FLUXPOCKET', fix: 'FLUX_POCKET', reason: 'missing the underscore', level: 2 },
  { value: 'MICRO3', fix: 'MICRO_3', reason: 'missing the underscore', level: 2 },
  { value: 'Stand_2', fix: 'STAND_2', reason: 'mixed case: the enum is ALL CAPS', level: 1 },
  { value: 'compass', fix: 'COMPASS', reason: 'lower-case: the enum is ALL CAPS', level: 1 },
  { value: 'FLUX_5', fix: null, reason: 'there is no Flux 5 — Flux 1, 2, 3, 4 and Pocket only', level: 3 },
  { value: 'MICRO_GEN3', fix: null, reason: 'a layout/profile name, not a Device Type', level: 3 },
  { value: 'STAND 2018', fix: 'STAND_2018', reason: 'space instead of underscore', level: 2 },
  { value: 'lab_flux_3', fix: 'FLUX_3', reason: 'no LAB_ prefix in the enum', level: 2 },
  { value: 'flux', fix: null, reason: 'lower-case family name — DEVICE_TYPE takes the exact enum (e.g. FLUX_3)', level: 1 },
];

const CONFIG_BAD: Bad[] = [
  { value: 'FLUX_3', fix: 'Flux', reason: 'config.properties deviceType is the family (Micro, Flux, Stand), not the Device Type enum', level: 2 },
  { value: 'MICRO', fix: 'Micro', reason: 'the family is written Micro, Flux or Stand', level: 2 },
  { value: 'flux', fix: 'Flux', reason: 'the family is written Micro, Flux or Stand', level: 2 },
  { value: 'Micro 3', fix: 'Micro', reason: 'deviceType is just the family that governs layout/scroll logic', level: 2 },
  { value: 'STAND_DUET', fix: 'Stand', reason: 'config.properties wants the family (Stand), not the enum', level: 3 },
  { value: 'Stand Duet', fix: 'Stand', reason: 'the family is Stand — Duet is a model', level: 3 },
];

function jenkinsItem(rng: RngState, level: 1 | 2 | 3, wantValid: boolean): CapsData {
  if (wantValid) {
    const v = pick(rng, ENUMS);
    return { context: 'jenkins', value: v, valid: true, fix: null, reason: `${v} is an exact Device Type enum value`, level };
  }
  const pool = [...TRAPS, ...EXTRA].filter((b) => b.level <= level && (level === 1 || b.level >= level - 1));
  const b = pick(rng, pool.length ? pool : TRAPS);
  return { context: 'jenkins', value: b.value, valid: false, fix: b.fix, reason: b.reason, level: b.level };
}

function configItem(rng: RngState, wantValid: boolean): CapsData {
  if (wantValid) {
    const v = pick(rng, FAMILIES);
    return { context: 'config', value: v, valid: true, fix: null, reason: `${v} is a valid config.properties deviceType family`, level: 2 };
  }
  const b = pick(rng, CONFIG_BAD);
  return { context: 'config', value: b.value, valid: false, fix: b.fix, reason: b.reason, level: b.level };
}

export function generateCaps(rng: RngState, state: RootState | null, index: number): DrillItem<CapsData> {
  const level: 1 | 2 | 3 = index < 4 ? 1 : index < 10 ? 2 : 3;
  const recent = recentKeys(state, 4);
  let data: CapsData = jenkinsItem(rng, level, chance(rng, 0.45));
  for (let tries = 0; tries < 6; tries++) {
    const bonus = index % 5 === 4;
    data = bonus ? configItem(rng, chance(rng, 0.5)) : jenkinsItem(rng, level, chance(rng, 0.45));
    if (!recent.includes(`DR11:${data.context}:${data.value}`)) break;
  }
  const id = `DR11:${data.context}:${data.value}`;
  const config = data.context === 'config';
  const what = data.valid ? `${config ? 'deviceType=' : 'DEVICE_TYPE='}${data.value} is valid` : `${data.value} is invalid${data.fix ? ` — use ${data.fix}` : ''}`;
  const why = config
    ? 'config.properties deviceType is the target form factor — Micro, Flux or Stand — and governs layout/scroll logic.'
    : data.valid
      ? 'Device Type is an Orka enum, which is why Jenkins pipeline environment variables must be in ALL CAPS — exactly as the enum spells them.'
      : `Device Type is an Orka enum (ALL CAPS, F122): ${data.reason}.`;
  return {
    id,
    tags: config ? ['uia.config', 'orka.devicetype'] : ['orka.devicetype', 'jenkins.envvars'],
    factIds: config ? ['F195'] : ['F121', 'F122'],
    teach: teach(what, why, { ref: config ? 'Ref §4.5' : 'Ref §3.2', factIds: config ? ['F195'] : ['F121', 'F122'], illustrative: !config && (data.valid || data.level >= 2) && data.value !== 'FLUX_5', doInstead: data.valid ? 'Accept (→).' : 'Reject (←).' }),
    data,
  };
}

export const DR11: DrillDef<CapsData> = {
  id: 'DR11',
  name: 'Caps Lock',
  format: 'Accept/reject a Jenkins DEVICE_TYPE / enum value',
  tags: ['orka.devicetype', 'jenkins.envvars', 'uia.config'],
  unlockedBy: ['M07'],
  durationS: 45,
  itemCount: null,
  medals: { bronze: 900, silver: 1600, gold: 2300 },
  scoring: 'standard',
  generate: (rng, state, index) => generateCaps(rng, state, index),
  component: lazyDrill(() => import('./View'), '#4aa8ff'),
};
