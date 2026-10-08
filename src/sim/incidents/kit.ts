/**
 * Helpers for the incident scenario suites (GP §3.5 × Sim Appendix A). Everything goes through the
 * public SimApi (faults.injectAll, jenkins.build, terminal.exec, …) and reads committed state, exactly as
 * the missions runtime and the workstation apps do.
 */
import { expect } from 'vitest';
import type { ScenarioItem } from '../api';
import { lab, run, runUntil, sim } from '../core/testkit';
import { resetTerminalSessions } from '../terminal';
import type { JenkinsBuild, OrcaRobot } from '../types';

export { lab, run, runUntil, sim };

/** Fresh `test` lab with fresh terminal sessions. */
export function start(seed = 20261005): void {
  sim.reset({ preset: 'test', seed });
  resetTerminalSessions();
}

/** Apply a scenario (Sim §4.5) and assert it was accepted. */
export function scenario(...items: ScenarioItem[]): string[] {
  const r = sim.faults.injectAll(items);
  if (!r.ok) throw new Error(r.error);
  return r.value.instanceIds;
}

export const robot = (name: string): OrcaRobot => Object.values(lab().orca.robots).find((r) => r.name === name)!;

/** Newest first note texts of a robot. */
export const notes = (name: string): string[] => [...robot(name).notes].sort((a, b) => b.id - a.id).map((n) => n.text);

/** Run the next scheduled health check (game clock jump) and return its log block. */
export function nextHealthCheck(): string[] {
  const before = lab().orca.healthCheck.log.length;
  sim.skipToNextHealthCheck();
  const log = lab().orca.healthCheck.log;
  expect(log.length).toBeGreaterThan(before);
  return log[log.length - 1]!.lines;
}

/** Run the health check now (tutorial button) and return its log block. */
export function healthNow(): string[] {
  sim.orca.runHealthCheckNow();
  const log = lab().orca.healthCheck.log;
  return log[log.length - 1]!.lines;
}

/** Queue a Jenkins build and run the sim until it finishes. */
export function build(job: string, params: Record<string, string> = {}, maxMs = 400_000): JenkinsBuild {
  const r = sim.jenkins.build(job, params, 'player');
  if (!r.ok) throw new Error(r.error);
  const id = r.value.buildId;
  const t = runUntil(() => lab().jenkins.builds[id]?.state === 'finished', maxMs);
  if (t < 0) throw new Error(`build ${id} did not finish:\n${lab().jenkins.builds[id]!.console.slice(-15).join('\n')}`);
  return lab().jenkins.builds[id]!;
}

/** Wait for an already-queued/running build (by id) to finish. */
export function finish(id: string, maxMs = 400_000): JenkinsBuild {
  const t = runUntil(() => lab().jenkins.builds[id]?.state === 'finished', maxMs);
  if (t < 0) throw new Error(`build ${id} did not finish`);
  return lab().jenkins.builds[id]!;
}

/** The newest build of a job. */
export function lastBuild(job: string): JenkinsBuild | undefined {
  const ids = lab().jenkins.jobs[job]?.buildIds ?? [];
  return ids.length ? lab().jenkins.builds[ids[ids.length - 1]!] : undefined;
}

/** Run one terminal line (draining streaming jobs) and return its output lines. */
export function sh(line: string, sessionId?: string): string[] {
  const exec = sim.terminal.exec as (l: string, s?: string) => ReturnType<typeof sim.terminal.exec>;
  const r = exec(line, sessionId);
  let out = r.lines.map((l) => l.text);
  if (r.streamingJobId) {
    for (let i = 0; i < 2400; i++) {
      sim.tick(250 * lab().time.timeScale);
      const p = sim.terminal.poll(r.streamingJobId);
      out = [...out, ...p.lines.map((l) => l.text)];
      if (p.done) break;
    }
  }
  return out;
}

/** Console text of a build as one string (for `toContain` on a line). */
export const consoleOf = (b: JenkinsBuild): string => b.console.join('\n');

/** True once every listed fault instance is resolved. */
export const resolved = (ids: string[]): boolean => ids.every((id) => sim.faults.isResolved(id));

/** Time to the next health check in physical ms (game ms / scale). */
export function msToNextHealthCheck(): number {
  const t = lab().time;
  const next = lab().orca.healthCheck.nextRunMs;
  return Math.max(0, Math.ceil((next - t.nowMs) / t.timeScale));
}
