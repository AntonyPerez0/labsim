/**
 * sim-devops factory seed (Sim §2.12–§2.14). Kept in its own module with no runtime import of the store
 * or the SimApi: `src/sim/initialState.ts` imports it and is itself imported by `@/core/store`, so pulling
 * the store in here would make `store → initialState → devops → store` a cycle that fails at load time.
 */
import type { LabState } from '../types';
import { JENKINS_URL, JENKINS_VIEWS, JOB_SEEDS, seedJenkinsJobs } from '../seed/jenkins';
import { seedPrNumbers, seedRepos } from '../seed/repos';
import { mirrorConfig } from './git';
import { nextDailyMs } from './jenkins/engine';
import { linkHistoryRobots, seedHistory } from './jenkins/history';
import { seedOllama } from './ollama';

/** Idempotent fix-ups that need sim-core's seed (history robot ids, the factory receipt photo); run once at the end of `seedDevops`. */
function postSeed(lab: LabState): void {
  linkHistoryRobots(lab);
  lab.workstation.files['~/Downloads/walle_receipt_0912.jpg'] ??= 'img:receipt:wall-e:0912';
}

/* ────────────────────────────── Seed (Sim §2.12–§2.14) ────────────────────────────── */

/**
 * Fill the devops-owned parts of a freshly created lab (Sim §2.12–§2.14): repos with history and PRs,
 * Jenkins jobs/views/history, local runs, Ollama models and receipt scenarios. Idempotent.
 */
export function seedDevops(lab: LabState): void {
  lab.repos = seedRepos(lab);
  const jobs = seedJenkinsJobs((schedule) => (/^H 2 /.test(schedule) ? nextDailyMs(lab.time.nowMs, 2) : null));
  const next: Record<string, number> = {};
  for (const id of Object.keys(jobs)) next[id] = 0;
  lab.jenkins = {
    up: true,
    url: JENKINS_URL,
    jobs,
    builds: {},
    queue: [],
    executors: 8,
    views: { ...JENKINS_VIEWS },
    nextBuildNumber: next,
  };
  // Next numbers per the Sim §2.13 table; history = the 5 builds before them.
  for (const s of Object.values(jobs)) {
    const seed = (JOB_NEXT as Record<string, number>)[s.id];
    lab.jenkins.nextBuildNumber[s.id] = seed ?? 1;
  }
  seedHistory(lab);
  lab.local = { runs: {} };
  seedOllama(lab);
  lab.seq.pr = { ...lab.seq.pr, ...seedPrNumbers() };
  mirrorConfig(lab);
  postSeed(lab);
}

const JOB_NEXT: Record<string, number> = Object.fromEntries(JOB_SEEDS.map((s) => [s.id, s.nextNumber]));
