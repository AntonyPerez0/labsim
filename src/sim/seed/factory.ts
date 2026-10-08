/**
 * Factory reference values (Sim §2) for fault clear predicates that say "equals its factory value"
 * (merchant credentials, Ubi routes, robot HRNs/URLs/relations, card profiles). Built once from the same
 * `seedCore` the lab uses and memoised; never mutated (callers must clone before writing anything).
 * The memo only caches a pure function of constants, so it cannot change results (Sim §6.4).
 */
import type { CardProfile, MerchantConfig, OrcaDb, OrcaRobot, ScreenCompareImage } from '../types';

let memo: OrcaDb | null = null;

/** The factory Orca database (robots, devices, merchants, card profiles, screens, compare images). */
export function factoryOrca(): OrcaDb {
  if (!memo) {
    // The builder is registered by initialState.ts (avoids an init-time import cycle).
    memo = buildFactory();
  }
  return memo;
}

let builder: (() => OrcaDb) | null = null;
/** Registered by `src/sim/initialState.ts` (empty lab + `seedCore`). */
export function registerFactoryBuilder(fn: () => OrcaDb): void {
  builder = fn;
}
function buildFactory(): OrcaDb {
  if (!builder) throw new Error('sim-core: factory builder not registered');
  return builder();
}

export function factoryRobot(id: number): OrcaRobot | undefined {
  return factoryOrca().robots[id];
}
export function factoryRobotByName(name: string): OrcaRobot | undefined {
  return Object.values(factoryOrca().robots).find((r) => r.name === name);
}
export function factoryMerchantByName(name: string): MerchantConfig | undefined {
  return Object.values(factoryOrca().merchants).find((m) => m.name === name);
}
export function factoryMerchant(id: number): MerchantConfig | undefined {
  return factoryOrca().merchants[id];
}
export function factoryCardProfile(id: number): CardProfile | undefined {
  return factoryOrca().cardProfiles[id];
}
export function factoryCompare(id: number): ScreenCompareImage | undefined {
  return factoryOrca().screenCompareImages[id];
}
