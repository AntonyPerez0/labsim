/**
 * Factory baseline (Sim §2.13 "every job passes at factory"): every Jenkins job except the nightly trigger
 * finishes SUCCESS on a factory lab, for two seeds (render times, auth codes and latencies differ per seed,
 * Sim §6.1 — a job that is only green on one seed would be a flaky baseline for every incident).
 */
import { describe, expect, it, vi } from 'vitest';
import { lab, runUntil, sim } from '../core/testkit';

vi.setConfig({ testTimeout: 600_000 });

describe('factory: every Jenkins job is green', () => {
  for (const seed of [1, 20261005]) {
    it(`seed ${seed}`, () => {
      sim.reset({ preset: 'test', seed });
      const ids = Object.keys(lab().jenkins.jobs).filter((j) => lab().jenkins.jobs[j]!.exists !== false && !j.includes('nightly'));
      expect(ids.length).toBeGreaterThanOrEqual(15);
      const bad: string[] = [];
      for (const j of ids) {
        sim.reset({ preset: 'test', seed });
        const params: Record<string, string> = j.includes('laz') ? { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' } : {};
        const r = sim.jenkins.build(j, params, 'player');
        if (!r.ok) {
          bad.push(`${j}: ${r.error}`);
          continue;
        }
        runUntil(() => lab().jenkins.builds[r.value.buildId]?.state === 'finished', 300_000);
        const b = lab().jenkins.builds[r.value.buildId]!;
        if (b.result !== 'SUCCESS') bad.push(`${j}: ${b.result} ${b.failureCode} — ${b.console.slice(-5).join(' / ')}`);
      }
      expect(bad).toEqual([]);
    });
  }
});
