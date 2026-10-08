/**
 * Thin, defensive wrapper around `sim.terminal` (Apps §5, Sim §0.5).
 *
 * - Passes the tab's session id as an extra argument (contract delta D7: one shell session per tab). A sim
 *   without D7 ignores it, so every tab shares the single sim session — the documented fallback.
 * - Never throws: an exception means the sim is not implemented yet → a bash-style error line.
 */
import { sim } from '@/sim';
import type { TerminalLine, TerminalResult } from '@/sim';

type ExecFn = (line: string, sessionId?: string) => TerminalResult;
type PollFn = (jobId: string, sessionId?: string) => { lines: TerminalLine[]; done: boolean; exitCode: number | null };
type CompleteFn = (partial: string, sessionId?: string) => string[];
type PromptFn = (sessionId?: string) => string;

export const DEFAULT_PROMPT = 'engineer@ws-17:~$ ';

function warn(what: string, err: unknown) {
  console.warn(`[terminal] sim.terminal.${what} failed`, err);
}

export const termApi = {
  exec(line: string, sessionId: string): TerminalResult {
    try {
      const r = (sim.terminal.exec as ExecFn)(line, sessionId);
      return {
        lines: Array.isArray(r?.lines) ? r.lines : [],
        exitCode: typeof r?.exitCode === 'number' ? r.exitCode : 0,
        clear: !!r?.clear,
        prompt: typeof r?.prompt === 'string' && r.prompt ? r.prompt : termApi.prompt(sessionId),
        streamingJobId: r?.streamingJobId || undefined,
      };
    } catch (err) {
      warn('exec', err);
      const cmd = line.trim().split(/\s+/)[0] ?? '';
      return {
        lines: cmd ? [{ text: `bash: ${cmd}: Input/output error`, kind: 'err' }] : [],
        exitCode: cmd ? 1 : 0,
        prompt: termApi.prompt(sessionId),
      };
    }
  },
  poll(jobId: string, sessionId: string): { lines: TerminalLine[]; done: boolean; exitCode: number | null } {
    try {
      const r = (sim.terminal.poll as PollFn)(jobId, sessionId);
      return { lines: Array.isArray(r?.lines) ? r.lines : [], done: r?.done !== false, exitCode: r?.exitCode ?? null };
    } catch (err) {
      warn('poll', err);
      return { lines: [], done: true, exitCode: 1 };
    }
  },
  interrupt(jobId: string, sessionId: string): void {
    try {
      (sim.terminal.interrupt as (jobId: string, sessionId?: string) => void)(jobId, sessionId);
    } catch (err) {
      warn('interrupt', err);
    }
  },
  complete(partial: string, sessionId: string): string[] {
    try {
      const r = (sim.terminal.complete as CompleteFn)(partial, sessionId);
      return Array.isArray(r) ? r.filter((x) => typeof x === 'string') : [];
    } catch (err) {
      warn('complete', err);
      return [];
    }
  },
  prompt(sessionId: string): string {
    try {
      const p = (sim.terminal.prompt as PromptFn)(sessionId);
      return typeof p === 'string' && p ? p : DEFAULT_PROMPT;
    } catch (err) {
      warn('prompt', err);
      return DEFAULT_PROMPT;
    }
  },
};
