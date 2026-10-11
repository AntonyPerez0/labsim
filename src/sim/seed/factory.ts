/**
 * Factory reference values (Sim §2) for fault clear predicates that say "equals its factory value"
 * (merchant credentials, Ubo routes, robot HRNs/URLs/relations, card profiles). Built once from the same
 * `seedCore` the lab uses and memoised; never mutated (callers must clone before writing anything).
 * The memo only caches a pure function of constants, so it cannot change results (Sim §6.4).
 */
import type { CardProfile, MerchantConfig, OrkaDb, OrkaRobot, ScreenCompareImage } from '../types';

let memo: OrkaDb | null = null;

/** The factory Orka database (robots, devices, merchants, card profiles, screens, compare images). */
export function factoryOrka(): OrkaDb {
  if (!memo) {
    // The builder is registered by initialState.ts (avoids an init-time import cycle).
    memo = buildFactory();
  }
  return memo;
}

let builder: (() => OrkaDb) | null = null;
/** Registered by `src/sim/initialState.ts` (empty lab + `seedCore`). */
export function registerFactoryBuilder(fn: () => OrkaDb): void {
  builder = fn;
}
function buildFactory(): OrkaDb {
  if (!builder) throw new Error('sim-core: factory builder not registered');
  return builder();
}

export function factoryRobot(id: number): OrkaRobot | undefined {
  return factoryOrka().robots[id];
}
export function factoryRobotByName(name: string): OrkaRobot | undefined {
  return Object.values(factoryOrka().robots).find((r) => r.name === name);
}
export function factoryMerchantByName(name: string): MerchantConfig | undefined {
  return Object.values(factoryOrka().merchants).find((m) => m.name === name);
}
export function factoryMerchant(id: number): MerchantConfig | undefined {
  return factoryOrka().merchants[id];
}
export function factoryCardProfile(id: number): CardProfile | undefined {
  return factoryOrka().cardProfiles[id];
}
export function factoryCompare(id: number): ScreenCompareImage | undefined {
  return factoryOrka().screenCompareImages[id];
}
