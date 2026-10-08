/**
 * DR11 Caps Lock (GP §2.4.3): accept (→) or reject (←) a Jenkins `DEVICE_TYPE` value against the Orca
 * Device Type enum (ALL CAPS, F121/F122); bonus cards ask about config.properties `deviceType` (the family:
 * Mini, Flex, Station — F195). Generated: early cards are obvious (lower-case), later ones subtle
 * (`FLEX_GEN3`, `STATION_DUO2`, `POCKET`).
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
const FAMILIES = ['Mini', 'Flex', 'Station'] as const;

interface Bad {
  value: string;
  fix: string | null;
  reason: string;
  level: 1 | 2 | 3;
}

/** Fixed traps from the spec (GP §2.4.3 DR11). */
const TRAPS: Bad[] = [
  { value: 'flex_3', fix: 'FLEX_3', reason: 'lower-case: Device Type enum strings are ALL CAPS', level: 1 },
  { value: 'Flex_3', fix: 'FLEX_3', reason: 'mixed case: the enum is ALL CAPS', level: 1 },
  { value: 'mini_3', fix: 'MINI_3', reason: 'lower-case: the enum is ALL CAPS', level: 1 },
  { value: 'FLEX3', fix: 'FLEX_3', reason: 'missing the underscore', level: 2 },
  { value: 'FLEX-3', fix: 'FLEX_3', reason: 'hyphen instead of underscore', level: 2 },
  { value: 'Mini 3', fix: 'MINI_3', reason: 'that is the product name, not the enum value', level: 1 },
  { value: 'STATION_DUO2', fix: 'STATION_DUO_2', reason: 'the generation number has its own underscore', level: 3 },
  { value: 'FLEX_GEN3', fix: null, reason: 'FLEX_GEN3 is the shared testing profile of Flex 3/4/Pocket, not a Device Type', level: 3 },
  { value: 'POCKET', fix: 'FLEX_POCKET', reason: 'the Flex Pocket enum value is FLEX_POCKET', level: 3 },
];

/** More generated near-misses (all invalid). */
const EXTRA: Bad[] = [
  { value: 'STATION_DUO_1', fix: 'STATION_DUO', reason: 'the first Duo is plain STATION_DUO', level: 3 },
  { value: 'FLEXPOCKET', fix: 'FLEX_POCKET', reason: 'missing the underscore', level: 2 },
  { value: 'MINI3', fix: 'MINI_3', reason: 'missing the underscore', level: 2 },
  { value: 'Station_2', fix: 'STATION_2', reason: 'mixed case: the enum is ALL CAPS', level: 1 },
  { value: 'compact', fix: 'COMPACT', reason: 'lower-case: the enum is ALL CAPS', level: 1 },
  { value: 'FLEX_5', fix: null, reason: 'there is no Flex 5 — Flex 1, 2, 3, 4 and Pocket only', level: 3 },
  { value: 'MINI_GEN3', fix: null, reason: 'a layout/profile name, not a Device Type', level: 3 },
  { value: 'STATION 2018', fix: 'STATION_2018', reason: 'space instead of underscore', level: 2 },
  { value: 'lab_flex_3', fix: 'FLEX_3', reason: 'no LAB_ prefix in the enum', level: 2 },
  { value: 'flex', fix: null, reason: 'lower-case family name — DEVICE_TYPE takes the exact enum (e.g. FLEX_3)', level: 1 },
];

const CONFIG_BAD: Bad[] = [
  { value: 'FLEX_3', fix: 'Flex', reason: 'config.properties deviceType is the family (Mini, Flex, Station), not the Device Type enum', level: 2 },
  { value: 'MINI', fix: 'Mini', reason: 'the family is written Mini, Flex or Station', level: 2 },
  { value: 'flex', fix: 'Flex', reason: 'the family is written Mini, Flex or Station', level: 2 },
  { value: 'Mini 3', fix: 'Mini', reason: 'deviceType is just the family that governs layout/scroll logic', level: 2 },
  { value: 'STATION_DUO', fix: 'Station', reason: 'config.properties wants the family (Station), not the enum', level: 3 },
  { value: 'Station Duo', fix: 'Station', reason: 'the family is Station — Duo is a model', level: 3 },
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
    ? 'config.properties deviceType is the target form factor — Mini, Flex or Station — and governs layout/scroll logic.'
    : data.valid
      ? 'Device Type is an Orca enum, which is why Jenkins pipeline environment variables must be in ALL CAPS — exactly as the enum spells them.'
      : `Device Type is an Orca enum (ALL CAPS, F122): ${data.reason}.`;
  return {
    id,
    tags: config ? ['uia.config', 'orca.devicetype'] : ['orca.devicetype', 'jenkins.envvars'],
    factIds: config ? ['F195'] : ['F121', 'F122'],
    teach: teach(what, why, { ref: config ? 'Ref §4.5' : 'Ref §3.2', factIds: config ? ['F195'] : ['F121', 'F122'], illustrative: !config && (data.valid || data.level >= 2) && data.value !== 'FLEX_5', doInstead: data.valid ? 'Accept (→).' : 'Reject (←).' }),
    data,
  };
}

export const DR11: DrillDef<CapsData> = {
  id: 'DR11',
  name: 'Caps Lock',
  format: 'Accept/reject a Jenkins DEVICE_TYPE / enum value',
  tags: ['orca.devicetype', 'jenkins.envvars', 'uia.config'],
  unlockedBy: ['M07'],
  durationS: 45,
  itemCount: null,
  medals: { bronze: 900, silver: 1600, gold: 2300 },
  scoring: 'standard',
  generate: (rng, state, index) => generateCaps(rng, state, index),
  component: lazyDrill(() => import('./View'), '#4aa8ff'),
};
