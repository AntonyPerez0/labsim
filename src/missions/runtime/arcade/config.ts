/**
 * Arcade constants: shift configurations (GP §2.3.2, §2.3.12, §4.6, §4.8.5), heat table (§2.3.3),
 * pipelines PL1–PL8 (§2.3.5), shift events (§2.3.11), severities and the rig roster fallback (§3.1).
 */
import type { HeatLevel, PipelineId, Severity } from '@/core/state';
import type { HeatRow, PipelineDef, ShiftConfig, ShiftEventDef } from '../../types';
import { PIPELINE_JOBS } from './pipelineJobs';
import { personText } from '@/content';

const base = {
  timeScale: 5,
  gameStart: '08:00',
  firstTicketAtS: 8,
  rankCaps: true,
  wildcard: 'optional' as const,
  pipelines: true,
  plannedWork: false,
  shiftEvents: false,
  scoring: true,
  hints: true,
  diagnosisCall: true,
  hudObjectives: true,
  strikesToEnd: 3,
  forceHealthCheck: false,
  unlockXp: 0,
};

export const SHIFT_CONFIGS: readonly ShiftConfig[] = [
  {
    ...base,
    id: 'shift-5',
    kind: 'standard',
    title: '5-minute Shift',
    description: 'Five real minutes, heat up to H3. Tickets, pipelines, and Orca’s 5-minute health check coming round every real minute (the lab runs at 5×).',
    lengthMinutes: 5,
    realSeconds: 300,
    heatCap: 3,
    unlock: { module: 'M04' },
    difficulty: 2,
  },
  {
    ...base,
    id: 'shift-10',
    kind: 'standard',
    title: '10-minute Shift',
    description: 'Ten real minutes, heat up to H4, a shift event is possible.',
    lengthMinutes: 10,
    realSeconds: 600,
    heatCap: 4,
    unlock: { module: 'M10' },
    shiftEvents: true,
    difficulty: 3,
  },
  {
    ...base,
    id: 'shift-20',
    kind: 'full',
    title: 'Full Shift (20 min)',
    description: 'Twenty real minutes, heat up to H5, planned work at t = 30 s, a shift event is possible. Counts for CERT-R5.',
    lengthMinutes: 20,
    realSeconds: 1200,
    heatCap: 5,
    unlock: { module: 'M18' },
    plannedWork: true,
    shiftEvents: true,
    difficulty: 5,
  },
  {
    ...base,
    id: 'daily',
    kind: 'daily',
    title: 'Daily Challenge',
    description: 'Seeded 10-minute shift shared by every player today. One ranked attempt per day.',
    lengthMinutes: 10,
    realSeconds: 600,
    heatCap: 4,
    unlock: { module: 'M14' },
    rankCaps: false,
    wildcard: 'forced',
    shiftEvents: false,
    incidents: { count: 12, draw: 'uniform' },
    difficulty: 4,
  },
  {
    ...base,
    id: 'weak-spot',
    kind: 'weak-spot',
    title: 'Weak Spot micro-shift',
    description: 'Three incidents for your weakest tags at heat H2, no pipelines.',
    lengthMinutes: null,
    realSeconds: null,
    heatCap: 2,
    fixedHeat: 2,
    unlock: { module: 'M06' },
    pipelines: false,
    wildcard: 'never',
    incidents: { count: 3, draw: 'weighted' },
    difficulty: 2,
  },
  {
    ...base,
    id: 'micro',
    kind: 'micro',
    title: 'Micro-shift',
    description: 'A single-incident practice shift (Academy "Play now").',
    lengthMinutes: null,
    realSeconds: null,
    heatCap: 2,
    fixedHeat: 2,
    unlock: {},
    pipelines: false,
    wildcard: 'forced',
    incidents: { count: 1, draw: 'weighted' },
    difficulty: 1,
  },
  {
    ...base,
    id: 'cert-r4',
    kind: 'certification',
    title: 'CERT-R4 practical shift',
    description: 'Five incidents in 20 game minutes at time scale 1: at least one hardware, one Orca and one code/config incident. All resolved, at most 1 strike.',
    lengthMinutes: 20,
    realSeconds: 1200,
    timeScale: 1,
    heatCap: 4,
    unlock: {},
    rankCaps: false,
    wildcard: 'forced',
    scoring: false,
    hints: false,
    diagnosisCall: false,
    strikesToEnd: 2,
    incidents: { count: 5, draw: 'cert-mix', requireCategories: ['hardware', 'orca', 'code-config'] },
    difficulty: 4,
  },
  {
    ...base,
    id: 'cert-r5',
    kind: 'certification',
    title: 'CERT-R5 practical shift',
    description: 'Eight incidents in 30 game minutes, two simultaneous at minute 10, no HUD objective text. All resolved, 0 strikes.',
    lengthMinutes: 30,
    realSeconds: 1800,
    timeScale: 1,
    heatCap: 5,
    unlock: {},
    rankCaps: false,
    wildcard: 'forced',
    scoring: false,
    hints: false,
    diagnosisCall: false,
    hudObjectives: false,
    strikesToEnd: 1,
    incidents: { count: 8, draw: 'cert-mix', simultaneousAtS: 600 },
    difficulty: 5,
  },
];

export const SHIFT_BY_ID: Readonly<Record<string, ShiftConfig>> = Object.fromEntries(SHIFT_CONFIGS.map((c) => [c.id, c]));

/** GP §2.3.3. */
export const HEAT_TABLE: Readonly<Record<HeatLevel, HeatRow>> = {
  1: { heat: 1, meanInterArrivalS: 45, maxOpenTickets: 2, maxDifficulty: 2, misleadingChance: 0, compoundChance: 0, activePipelines: 3 },
  2: { heat: 2, meanInterArrivalS: 40, maxOpenTickets: 3, maxDifficulty: 3, misleadingChance: 0.15, compoundChance: 0, activePipelines: 4 },
  3: { heat: 3, meanInterArrivalS: 35, maxOpenTickets: 3, maxDifficulty: 4, misleadingChance: 0.25, compoundChance: 0.1, activePipelines: 5 },
  4: { heat: 4, meanInterArrivalS: 30, maxOpenTickets: 4, maxDifficulty: 5, misleadingChance: 0.35, compoundChance: 0.2, activePipelines: 6 },
  5: { heat: 5, meanInterArrivalS: 25, maxOpenTickets: 5, maxDifficulty: 5, misleadingChance: 0.4, compoundChance: 0.25, activePipelines: 7 },
};

/** Heat by elapsed fraction f, clamped to the cap. */
export function heatFor(f: number, cap: HeatLevel): HeatLevel {
  const h: HeatLevel = f < 0.2 ? 1 : f < 0.45 ? 2 : f < 0.7 ? 3 : f < 0.9 ? 4 : 5;
  return Math.min(h, cap) as HeatLevel;
}

export const SLA_FACTOR: Readonly<Record<Severity, number>> = { P1: 1.5, P2: 2.0, P3: 3.0 };

/** GP §2.3.5 (PL7/PL8 jobs are [illus.] additions). */
export const PIPELINES: readonly PipelineDef[] = [
  {
    id: 'PL1',
    job: PIPELINE_JOBS.PL1,
    requirement: 'DEVICE_TYPE alternates FLEX_3 / FLEX_4; physicalTouch: true',
    params: (run) => ({ DEVICE_TYPE: run % 2 === 0 ? 'FLEX_3' : 'FLEX_4' }),
    eligibleRigs: ['wall-e', 'eve'],
    activationOrder: 1,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL2',
    job: PIPELINE_JOBS.PL2,
    requirement: 'tethered (MFD populated)',
    params: () => ({ RUN_TYPE: 'tethered' }),
    eligibleRigs: ['megatron', 'optimus'],
    activationOrder: 2,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL3',
    job: PIPELINE_JOBS.PL3,
    requirement: 'physical touch + printer',
    params: () => ({ CARD_PROFILE: 'VISA_STD_SWIPE' }),
    eligibleRigs: ['wall-e', 'eve', 'bumblebee', 'johnny-5', 'baymax'],
    activationOrder: 3,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL4',
    job: PIPELINE_JOBS.PL4,
    requirement: 'DEVICE_TYPE=MINI_3, physical touch',
    params: () => ({ DEVICE_TYPE: 'MINI_3' }),
    eligibleRigs: ['bumblebee'],
    activationOrder: 4,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL5',
    job: PIPELINE_JOBS.PL5,
    requirement: 'COMPACT, physical touch, CARD_PROFILE=INTERAC_CA_DIP',
    params: () => ({ DEVICE_TYPE: 'COMPACT', CARD_PROFILE: 'INTERAC_CA_DIP' }),
    eligibleRigs: ['seti'],
    activationOrder: 5,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL6',
    job: PIPELINE_JOBS.PL6,
    requirement: 'merchant GO-SDK-US-01 (App ID / App Secret / API Key); dynamic JSON incl. "printer": true',
    params: () => ({ MERCHANT: 'GO-SDK-US-01' }),
    eligibleRigs: ['data', 'tars'],
    activationOrder: 6,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL7',
    job: PIPELINE_JOBS.PL7,
    requirement: 'STATION_DUO',
    params: () => ({ DEVICE_TYPE: 'STATION_DUO' }),
    eligibleRigs: ['r2-d2'],
    activationOrder: 7,
    intervalS: 30,
    runS: 60,
  },
  {
    id: 'PL8',
    job: PIPELINE_JOBS.PL8,
    requirement: personText("named ROBOT_NAME=rosie ({{sam}}'s PayCore job)"),
    params: () => ({ ROBOT_NAME: 'rosie' }),
    eligibleRigs: ['rosie'],
    activationOrder: 'always',
    intervalS: 180,
    runS: 60,
    uptimeOnlyWhenBroken: true,
  },
];

export const PIPELINE_BY_ID: Readonly<Record<PipelineId, PipelineDef>> = Object.fromEntries(PIPELINES.map((p) => [p.id, p])) as Record<PipelineId, PipelineDef>;

/** GP §2.3.11. */
export const SHIFT_EVENTS: readonly ShiftEventDef[] = [
  { id: 'firmware-rollout', title: 'Firmware rollout', banner: 'Firmware rollout today', forcesIncident: 'INC20' },
  { id: 'onboarding-day', title: 'Onboarding day', banner: 'Onboarding day: the new hire is filing tickets', misleadingTickets: { count: 2, reporter: 'alex' } },
  { id: 'corporate-scan', title: 'corporate security scan', banner: 'corporate security scan in progress', forcesIncident: 'INC19' },
  { id: 'jared-lunch', title: personText('{{jared}} at lunch'), banner: '{{jared}}: out to lunch', jaredAwayS: 120 },
];

/** Static rig roster (GP §3.1) used when the lab lacks a value; the live lab always wins. */
export interface RosterRig {
  hrn: string;
  roles: readonly string[];
  pi: string;
  piIp: string;
  device: string;
  deviceIp: string;
  deviceType: string;
  box: string | null;
  rack: 'rack-a' | 'rack-b' | 'rack-t' | 'adb-shelf' | 'rack-c';
  fuse: string | null;
  camera: string | null;
  cameraUrl: string | null;
}

export const ROSTER: Readonly<Record<string, RosterRig>> = {
  'wall-e': { hrn: 'WALL-E', roles: ['touch', 'collis', 'flexgen3', 'printer'], pi: 'pi-wall-e', piIp: '10.42.10.11', device: 'wall-e-flex3', deviceIp: '10.42.30.11', deviceType: 'FLEX_3', box: 'minix-01', rack: 'rack-a', fuse: 'F-RACKA-5V', camera: 'cam-wall-e', cameraUrl: 'http://10.42.10.11:8081/stream.mjpg' },
  eve: { hrn: 'EVE', roles: ['touch', 'collis', 'flexgen3', 'printer', 'legacy-nuc-motion'], pi: 'pi-eve', piIp: '10.42.10.12', device: 'eve-flex4', deviceIp: '10.42.30.12', deviceType: 'FLEX_4', box: 'minix-01', rack: 'rack-a', fuse: 'F-RACKA-5V', camera: 'cam-eve', cameraUrl: 'http://10.42.10.12:8081/stream.mjpg' },
  bumblebee: { hrn: 'BUMBLEBEE', roles: ['touch', 'collis', 'mini', 'printer'], pi: 'pi-bumblebee', piIp: '10.42.10.13', device: 'bumblebee-mini3', deviceIp: '10.42.30.13', deviceType: 'MINI_3', box: 'minix-01', rack: 'rack-a', fuse: 'F-RACKA-5V', camera: 'cam-bumblebee', cameraUrl: 'http://10.42.10.13:8081/stream.mjpg' },
  'r2-d2': { hrn: 'R2-D2', roles: ['touch', 'collis', 'duo', 'ocr'], pi: 'pi-r2-d2', piIp: '10.42.10.14', device: 'r2-d2-duo', deviceIp: '10.42.30.14', deviceType: 'STATION_DUO', box: 'minix-01', rack: 'rack-a', fuse: 'F-RACKA-5V', camera: 'cam-r2-d2', cameraUrl: 'http://10.42.10.14:8081/stream.mjpg' },
  'johnny-5': { hrn: 'JOHNNY-5', roles: ['touch', 'collis', 'flex-legacy', 'printer'], pi: 'pi-johnny-5', piIp: '10.42.10.15', device: 'johnny-5-flex1', deviceIp: '10.42.30.15', deviceType: 'FLEX_1', box: 'minix-02', rack: 'rack-b', fuse: 'F-RACKB-5V', camera: 'cam-rackb', cameraUrl: 'http://10.42.10.40:8081/stream.mjpg' },
  baymax: { hrn: 'BAYMAX', roles: ['touch', 'collis', 'printer', 'rebuild', 'build'], pi: 'pi-baymax', piIp: '10.42.10.16', device: 'baymax-st2018', deviceIp: '10.42.30.16', deviceType: 'STATION_2018', box: 'minix-02', rack: 'rack-b', fuse: 'F-RACKB-5V', camera: 'cam-rackb', cameraUrl: 'http://10.42.10.40:8081/stream.mjpg' },
  seti: { hrn: 'SETI', roles: ['touch', 'collis', 'canada', 'physical-pin'], pi: 'pi-seti', piIp: '10.42.10.17', device: 'seti-compact', deviceIp: '10.42.30.17', deviceType: 'COMPACT', box: 'minix-02', rack: 'rack-b', fuse: 'F-RACKB-5V', camera: 'cam-rackb', cameraUrl: 'http://10.42.10.40:8081/stream.mjpg' },
  rosie: { hrn: 'ROSIE', roles: ['touch', 'collis', 'paycore', 'printerless', 'flexgen3'], pi: 'pi-rosie', piIp: '10.42.10.18', device: 'rosie-pocket', deviceIp: '10.42.30.18', deviceType: 'FLEX_POCKET', box: 'minix-02', rack: 'rack-b', fuse: 'F-RACKB-5V', camera: 'cam-rackb', cameraUrl: 'http://10.42.10.40:8081/stream.mjpg' },
  megatron: { hrn: 'MEGATRON', roles: ['tethered', 'dev1'], pi: 'pi-tethered', piIp: '10.42.10.20', device: 'megatron-mfd', deviceIp: '10.42.30.21', deviceType: 'STATION_2', box: 'minix-02', rack: 'rack-t', fuse: 'F-BENCH-5V', camera: 'cam-tethered', cameraUrl: 'http://10.42.10.20:8081/stream.mjpg' },
  optimus: { hrn: 'OPTIMUS', roles: ['tethered', 'stg'], pi: 'pi-tethered', piIp: '10.42.10.20', device: 'optimus-mfd', deviceIp: '10.42.30.23', deviceType: 'MINI_3', box: 'minix-02', rack: 'rack-t', fuse: 'F-BENCH-5V', camera: 'cam-tethered', cameraUrl: 'http://10.42.10.20:8081/stream.mjpg' },
  data: { hrn: 'DATA', roles: ['adb-only', 'mini', 'printer'], pi: 'pi-adb-shelf', piIp: '10.42.10.30', device: 'data-mini3', deviceIp: '10.42.30.31', deviceType: 'MINI_3', box: null, rack: 'adb-shelf', fuse: 'F-BENCH-5V', camera: null, cameraUrl: null },
  tars: { hrn: 'TARS', roles: ['adb-only', 'flexgen3', 'printer'], pi: 'pi-adb-shelf', piIp: '10.42.10.30', device: 'tars-flex4', deviceIp: '10.42.30.32', deviceType: 'FLEX_4', box: null, rack: 'adb-shelf', fuse: 'F-BENCH-5V', camera: null, cameraUrl: null },
  vision: { hrn: 'VISION', roles: ['adb-only', 'flexgen3', 'printerless'], pi: 'pi-vision', piIp: '10.42.10.50', device: 'vision-pocket', deviceIp: '10.42.30.50', deviceType: 'FLEX_POCKET', box: null, rack: 'rack-c', fuse: null, camera: null, cameraUrl: 'http://10.42.10.50:8081/stream.mjpg' },
  'k-9': { hrn: 'K-9', roles: ['adb-only', 'printerless'], pi: 'pi-k-9', piIp: '10.42.10.51', device: 'k-9-duo2', deviceIp: '10.42.30.51', deviceType: 'STATION_DUO_2', box: null, rack: 'rack-c', fuse: null, camera: null, cameraUrl: null },
};

/** Physically modelled rigs (Arcade binds incidents to these; VISION and K-9 are Orca-only). */
export const MODELLED_RIGS: readonly string[] = ['wall-e', 'eve', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti', 'rosie', 'megatron', 'optimus', 'data', 'tars'];
