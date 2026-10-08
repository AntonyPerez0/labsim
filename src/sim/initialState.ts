/**
 * Initial lab state.
 *
 * `createEmptyLabState(seed)` builds a structurally complete, valid v2 `LabState` with no entities
 * (Sim §1). `createInitialLabState(seed)` = empty lab + the factory seed: sim-devops' `seedDevops`
 * (repos, Jenkins, local runs, Ollama) and — next stage — sim-core's seed (`./seed/*`: the 42-rig
 * pool, devices, hosts, power network, merchants, cards, screens; Sim §2).
 *
 * Calendar (Sim §2.1): epoch 2026-10-05 (Monday), label "MON, OCT 5"; factory sessions start 09:00.
 */
import { createRngState, hashString } from '@/core/rng';
import type { RngState } from '@/core/rng';
import { seedDevops } from './devops/seed';
import { mirrorCallusFiles, seedCore } from './seed';
import { registerFactoryBuilder } from './seed/factory';
import { runHealthCheck } from './core/orca/health';
import { detachedCtx } from './core/util';
import type { LabState, RngStream, SimConfig } from './types';
import { DEFAULT_SEED, EPOCH_DATE, HEALTH_CHECK_INTERVAL_MS, LAB_STATE_VERSION, RNG_STREAMS } from './types';

const HOUR_MS = 3_600_000;

/** Independent stream seeds (Sim §6.1): core = createRngState(seed); others = hashString(`${seed}:${name}`). */
export function createRngStreams(seed: number): Record<RngStream, RngState> {
  const out = {} as Record<RngStream, RngState>;
  for (const name of RNG_STREAMS) {
    out[name] = name === 'core' ? createRngState(seed) : createRngState(hashString(`${seed}:${name}`));
  }
  return out;
}

/** Factory SimConfig (Sim §6.5 `factory` row). */
export function factoryConfig(): SimConfig {
  return {
    mode: 'freeplay',
    damageModel: 'full',
    pipelinesEnabled: false,
    npcAutoMerge: true,
    forceHealthCheckAllowed: true,
    logCap: 500,
  };
}

/** Next health-check boundary strictly after `nowMs` (Sim §0.3, §2.1). */
export function nextHealthBoundary(nowMs: number, anchorMs = 0): number {
  const k = Math.floor((nowMs - anchorMs) / HEALTH_CHECK_INTERVAL_MS) + 1;
  return anchorMs + k * HEALTH_CHECK_INTERVAL_MS;
}

/** A complete, valid lab with no entities. */
export function createEmptyLabState(seed: number = DEFAULT_SEED, startHour = 9): LabState {
  const nowMs = startHour * HOUR_MS;
  const streams = createRngStreams(seed);
  return {
    version: LAB_STATE_VERSION,
    time: {
      nowMs,
      physMs: 0,
      timeScale: 1,
      startHour,
      epochDate: EPOCH_DATE,
      dateLabel: 'MON, OCT 5',
      healthAnchorMs: 0,
    },
    rng: { ...streams.core },
    rngStreams: streams,
    config: factoryConfig(),
    flags: {
      receiptQrFeature: true,
      uiaVersion: '2.3',
      softwarePinBypass: false,
      showTouchTargets: false,
      cfdLayoutV2Toggle: false,
    },
    orca: {
      robots: {},
      devices: {},
      capabilities: {},
      merchants: {},
      screens: {},
      screenLocations: {},
      cardProfiles: {},
      screenCompareImages: {},
      seq: { robots: 1, devices: 1, capabilities: 1, merchants: 1, screens: 1, screenLocations: 1, cardProfiles: 1, screenCompareImages: 1, notes: 1 },
      healthCheck: {
        intervalMs: HEALTH_CHECK_INTERVAL_MS,
        lastRunMs: nowMs,
        nextRunMs: nextHealthBoundary(nowMs),
        running: false,
        runCount: 0,
        log: [],
        timeoutMs: 10_000,
      },
      app: { up: true, version: '3.14.2', deployedCommit: '3b8d17a', dbConnected: true, reconnectAtPhysMs: null },
      audit: [],
      pendingSyncs: [],
    },
    rigs: {},
    devices: {},
    hosts: {},
    network: {
      subnets: [
        { cidr: '10.42.1.0/24', name: 'servers' },
        { cidr: '10.42.10.0/24', name: 'robot Pis' },
        { cidr: '10.42.20.0/24', name: 'Windows boxes' },
        { cidr: '10.42.30.0/24', name: 'LabSim devices' },
        { cidr: '10.42.50.0/24', name: 'workstations' },
        { cidr: '10.42.60.0/24', name: 'office desks' },
      ],
      switchUp: true,
      arp: {},
      attempts: {},
    },
    workstation: {
      adbServerRunning: false,
      adbConnections: [],
      sshHostId: null,
      cwd: '~',
      shellHistory: [],
      locallyRunningTest: null,
      coworkerDevicesDisturbed: 0,
      configProperties: {},
      files: {},
    },
    power: {
      outlets: {},
      strips: {},
      psus: {},
      regulators: {},
      rails: {},
      terminals: {},
      fuses: {},
      loads: {},
      spareFuses: { '5': 4, '10': 4, '15': 2, '20': 1 },
      sparks: [],
    },
    collis: {},
    callus: { localCardFiles: {}, log: {} },
    repos: {
      gort: emptyRepo('gort'),
      'uia-remote': emptyRepo('uia-remote'),
      pigeon: emptyRepo('pigeon'),
      orchestrator: emptyRepo('orchestrator'),
    },
    jenkins: { up: true, url: 'http://jenkins.lab.local:8080', jobs: {}, builds: {}, queue: [], executors: 8, views: {}, nextBuildNumber: {} },
    local: { runs: {} },
    laz: { runs: {} },
    ubi: {
      routes: {
        'us-east': { region: 'US-EAST', up: true },
        'ca-central': { region: 'CA-CENTRAL', up: true },
      },
      log: [],
    },
    ollama: { up: true, models: [], requests: [], receiptScenarios: {} },
    printer3d: {
      printers: {
        prusa: { busy: false, job: null, endsPhysMs: null },
        bambu: { busy: false, job: null, endsPhysMs: null },
      },
      output: [],
    },
    chat: { messages: [], unread: {} },
    faults: [],
    timers: [],
    log: [],
    seq: {
      event: 0,
      note: 0,
      build: 0,
      laz: 0,
      ollama: 0,
      chat: 0,
      fault: 0,
      run: 0,
      commit: 0,
      timer: 0,
      request: 0,
      // Next PR numbers (Sim §2.12, §4.4): gort #417–#419 used, uia-remote up to #431, orchestrator up to #81 [illus.].
      pr: { gort: 420, 'uia-remote': 432, pigeon: 57, orchestrator: 82 },
    },
  };
}

function emptyRepo(id: LabState['repos'][keyof LabState['repos']]['id']): LabState['repos'][typeof id] {
  return {
    id,
    name: id,
    remoteUrl: `git@github.com:labsim-lab/${id}.git`,
    description: '',
    defaultBranch: 'main',
    branches: {},
    commits: {},
    files: {},
    pullRequests: [],
    local: null,
  };
}

/**
 * The factory lab (Sim §2): empty lab + sim-devops' seed (repos, Jenkins, Ollama) + sim-core's seed
 * (the 42-rig pool, devices, hosts, power, Orca tables) + the factory health check run #1 at `nowMs`
 * (Sim §6.5 step 2). Used by the store at boot.
 *
 * With `preset`, the full `sim.reset` procedure of Sim §6.5 is applied (preset configuration, start
 * hour, time scale, the preset's scenario) through the builder registered by `src/sim/impl`.
 */
export function createInitialLabState(seed: number = DEFAULT_SEED, preset?: string): LabState {
  if (preset && presetBuilder) return presetBuilder(preset, seed).lab;
  return createFactoryLab(seed, 9);
}

/**
 * The §2 factory lab at `startHour` (Sim §6.5 steps 1–2): empty lab + sim-devops' seed + sim-core's
 * seed + the factory health check run #1 at `nowMs` (before any preset scenario).
 */
export function createFactoryLab(seed: number = DEFAULT_SEED, startHour = 9): LabState {
  const lab = createEmptyLabState(seed, startHour);
  // sim-core first, so the devops seed (Jenkins history consoles: robots, devices, merchants, Laz lines)
  // reads the real Orca rows; seedCore reads gort card files with a canonical fallback (identical text).
  seedCore(lab);
  seedDevops(lab);
  // Re-mirror the Windows boxes' C:\gort\cards from the now-seeded gort repo (GortCardSync's last run).
  for (const boxId of Object.keys(lab.callus.localCardFiles)) mirrorCallusFiles(lab, boxId);
  factoryHealthCheck(lab);
  return lab;
}

/** Sim §6.5 step 2: run #1 = the factory check at `nowMs`, before any scenario is applied (no events). */
export function factoryHealthCheck(lab: LabState): void {
  runHealthCheck(lab, detachedCtx(lab), { forced: false });
  lab.orca.healthCheck.nextRunMs = nextHealthBoundary(lab.time.nowMs, lab.time.healthAnchorMs);
  lab.rngStreams.core = { ...lab.rng };
}

type PresetBuilder = (preset: string, seed: number) => { lab: LabState; preset: string };
let presetBuilder: PresetBuilder | null = null;
/** Called once by `src/sim/impl` (presets need the fault engine and sim-devops' setup ops). */
export function registerPresetBuilder(fn: PresetBuilder): void {
  presetBuilder = fn;
}

// Factory reference values for fault predicates (Sim §4.3 "equals its factory value").
registerFactoryBuilder(() => {
  const lab = createEmptyLabState(DEFAULT_SEED);
  seedCore(lab);
  return lab.orca;
});

export { createDisplayState, createOrderState, createRigState, createTerminalDevice, createHost, createOrcaRobot } from './builders';

