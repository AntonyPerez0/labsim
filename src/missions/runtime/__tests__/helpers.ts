/**
 * Test helpers for the mission runtime: a fresh store, fixed real clock, event emission and quiz answers.
 */
import { emit, mutate, store, createInitialRoot, getState } from '@/core/store';
import type { EventMap } from '@/core/events';
import type { EventName } from '@/core/bus';
import type { QuizAnswerValue, RootState } from '@/core/state';
import type { QuizQuestion } from '@/content/schema';
import type { IncidentDef } from '../../types';
import { c, p } from '../../types';
import { setRealClock } from '../clock';
import { missions } from '../api';

/** 2026-10-06 12:00 local-ish (day number 20732). */
export const FIXED_DAY = 20732;

export function resetWorld(): void {
  setRealClock({ epochMs: () => FIXED_DAY * 86_400_000 + 12 * 3_600_000, day: () => FIXED_DAY });
  store.setState(createInitialRoot(), true);
  mutate((s) => {
    s.ui.loading = null;
    s.ui.overlay = { kind: 'main-menu' };
  });
  missions.init();
  // Disable the physical-clock fallback driver: tests drive time explicitly.
  missions.tick(0);
}

export function fire<K extends EventName>(type: K, payload: EventMap[K]): void {
  emit(type, payload);
}

/** Advance real seconds (game ms = real ms × time scale) — mission timers only, the sim is not ticked. */
export function advance(realS: number, stepS = 0.25): void {
  let left = realS;
  while (left > 1e-9) {
    const dt = Math.min(stepS, left);
    const scale = getState().lab.time.timeScale || 1;
    missions.tick(dt * 1000 * scale);
    left -= dt;
  }
}

export function state(): RootState {
  return getState();
}

export function correctAnswer(q: QuizQuestion): QuizAnswerValue {
  switch (q.type) {
    case 'mc':
    case 'tf':
      return q.answers ? [...q.answers] : (q.answer as number);
    case 'order':
      return [...(q.options ?? [])];
    case 'match':
      return (q.pairs ?? []).map(([l, r]) => [l, r] as [string, string]);
    case 'fill':
      return (q.accepted ?? [''])[0]!;
  }
}

export function wrongAnswer(q: QuizQuestion): QuizAnswerValue {
  switch (q.type) {
    case 'mc':
    case 'tf':
      return ((q.answer ?? 0) + 1) % (q.options?.length ?? 2);
    case 'order':
      return [...(q.options ?? [])].reverse();
    case 'match':
      return (q.pairs ?? []).map(([l], i, arr) => [l, arr[(i + 1) % arr.length]![1]] as [string, string]);
    case 'fill':
      return 'definitely wrong';
  }
}

/** A minimal incident for runtime tests. */
export function testIncident(id: string, over: Partial<IncidentDef> = {}): IncidentDef {
  return {
    id,
    name: `Test ${id}`,
    difficulty: 1,
    base: 200,
    parS: 120,
    severity: 'P1',
    rigs: { roles: ['touch'], default: 'wall-e', scope: 'rig', describe: 'any touch rig' },
    escalatable: true,
    unlockedBy: 'M01',
    tags: ['orca.status.connfailed', 'hw.pi'],
    factIds: ['F107'],
    ticket: { title: (b) => `${b.hrn} Connection Failed`, reporter: 'jenkins-bot', misleading: { title: (b) => `${b.hrn}'s tablet froze`, reporter: 'riley' } },
    setup: () => ({}),
    reveal: 'immediate',
    symptoms: [{ where: 'Notes', text: 'connect timed out after 10000 ms' }],
    diagnosisPath: ['Read the Notes'],
    hints: ['Look at the Notes.', 'Open Orca → robot → Notes.', 'Escalate with the endpoint.'],
    fix: { byTheBook: 'Escalate to Jared.' },
    escalation: { endpoints: (b) => [`http://${b.vars.piIp}:8000/health`], jaredFix: () => [{ do: 'setVar', name: `fixed:${id}`, value: true }] },
    success: () => c.all(c.eq(p.v(`fixed:${id}`), true), c.nextHealthCheck()),
    diagnosisCall: {
      options: [
        { id: 'A', text: 'Pi hung', correct: true },
        { id: 'B', text: 'Cable', wrongCallHint: 'Check the jack LEDs.' },
        { id: 'C', text: 'Fuse', wrongCallHint: 'Only one rig is down.' },
        { id: 'D', text: 'Orca', wrongCallHint: 'Other rigs passed.' },
      ],
    },
    wrongButTempting: [],
    teaches: 'Ref §3 Connection Failed.',
    ...over,
  };
}
