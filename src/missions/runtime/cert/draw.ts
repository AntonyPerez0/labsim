/**
 * Certification written-exam draw (Cur §5.2): module quotas, one item per critical fact (counted in its
 * module's quota), tier mix as close as the pool allows, at least one item of every type, MC ≤ 65 %,
 * avoid the previous attempt's items when possible, one item per fact unless the quota can't be met,
 * illustrative items excluded. Deterministic for a seed.
 */
import type { RngState } from '@/core/rng';
import { createRngState, shuffle } from '@/core/rng';
import type { ExamBlueprint, QuizQuestion } from '@/content/schema';
import { EXAM_DRAW_RULES, QUIZ_BANK, examPool, factById } from '@/content';

export interface DrawResult {
  questionIds: string[];
  criticalQuestionIds: string[];
}

function tierOf(q: QuizQuestion): 'core' | 'supporting' | 'trivia' {
  return (factById(q.factIds[0] ?? '')?.tier ?? 'core') as 'core' | 'supporting' | 'trivia';
}

export function drawWrittenExam(exam: ExamBlueprint, seed: number, opts: { previous?: readonly string[]; weakestModules?: readonly string[] } = {}): DrawResult {
  const rng: RngState = createRngState(seed);
  const pool = shuffle(rng, examPool(exam, QUIZ_BANK));
  const prev = new Set(opts.previous ?? []);
  const chosen: QuizQuestion[] = [];
  const usedFacts = new Set<string>();
  const take = (q: QuizQuestion) => {
    chosen.push(q);
    q.factIds.forEach((f) => usedFacts.add(f));
  };
  const avail = (q: QuizQuestion) => !chosen.includes(q);
  const prefer = (list: QuizQuestion[]) => [...list.filter((q) => !prev.has(q.id)), ...list.filter((q) => prev.has(q.id))];

  // 1) Critical facts: one item each.
  const critical: QuizQuestion[] = [];
  for (const f of exam.written.criticalFactIds) {
    const all = pool.filter((q) => q.factIds.includes(f));
    const c = prefer(all.filter(avail))[0] ?? (exam.id === 'CERT-R5' || exam.id === 'CERT-R4' ? prefer(QUIZ_BANK.filter((q) => q.factIds.includes(f) && !q.illustrative && !q.retired && avail(q)))[0] : undefined);
    if (c && !chosen.includes(c)) {
      take(c);
      critical.push(c);
    }
  }

  // 2) Module quotas with the tier mix.
  const mix = exam.written.tierMix;
  for (const [mod, quota] of Object.entries(exam.written.moduleQuotas)) {
    const have = () => chosen.filter((q) => q.moduleId === mod).length;
    const modPool = pool.filter((q) => q.moduleId === mod);
    const targets = { core: Math.round(quota * mix.core), supporting: Math.round(quota * mix.supporting), trivia: Math.max(0, quota - Math.round(quota * mix.core) - Math.round(quota * mix.supporting)) };
    for (const tier of ['core', 'supporting', 'trivia'] as const) {
      const cands = prefer(modPool.filter((q) => avail(q) && tierOf(q) === tier && !q.factIds.some((f) => usedFacts.has(f))));
      let n = targets[tier] - chosen.filter((q) => q.moduleId === mod && tierOf(q) === tier).length;
      for (const q of cands) {
        if (n <= 0 || have() >= quota) break;
        take(q);
        n--;
      }
    }
    // Fill to the quota: new facts first, then any item.
    for (const q of prefer(modPool.filter((x) => avail(x) && !x.factIds.some((f) => usedFacts.has(f))))) {
      if (have() >= quota) break;
      take(q);
    }
    for (const q of prefer(modPool.filter(avail))) {
      if (have() >= quota) break;
      take(q);
    }
  }

  // 3) Extras (R4: weakest modules' core items; R5: trivia from any module).
  const extra = exam.written.extra;
  if (extra) {
    const pick = extra.rule === 'weakest-modules-core'
      ? prefer(pool.filter((q) => avail(q) && tierOf(q) === 'core' && (!opts.weakestModules?.length || opts.weakestModules.includes(q.moduleId))))
      : prefer(pool.filter((q) => avail(q) && tierOf(q) === 'trivia'));
    for (const q of pick.slice(0, extra.count)) take(q);
    for (const q of prefer(pool.filter(avail))) {
      if (chosen.length >= exam.written.items) break;
      take(q);
    }
  }

  // 4) Type coverage and MC cap by swapping within a module (never a critical item).
  const isCritical = (q: QuizQuestion) => critical.includes(q);
  for (const type of EXAM_DRAW_RULES.requireEveryType) {
    if (chosen.some((q) => q.type === type)) continue;
    const incoming = prefer(pool.filter((q) => avail(q) && q.type === type))[0];
    if (!incoming) continue;
    const out = chosen.find((q) => q.moduleId === incoming.moduleId && q.type === 'mc' && !isCritical(q)) ?? chosen.find((q) => q.type === 'mc' && !isCritical(q));
    if (out) chosen.splice(chosen.indexOf(out), 1, incoming);
  }
  const maxMc = Math.floor(EXAM_DRAW_RULES.maxMcFraction * chosen.length);
  for (let guard = 0; guard < 100 && chosen.filter((q) => q.type === 'mc').length > maxMc; guard++) {
    const out = chosen.find((q) => q.type === 'mc' && !isCritical(q) && pool.some((x) => avail(x) && x.type !== 'mc' && x.moduleId === q.moduleId));
    if (!out) break;
    const incoming = prefer(pool.filter((x) => avail(x) && x.type !== 'mc' && x.moduleId === out.moduleId))[0]!;
    chosen.splice(chosen.indexOf(out), 1, incoming);
  }

  const ordered = shuffle(rng, chosen);
  return { questionIds: ordered.map((q) => q.id), criticalQuestionIds: critical.map((q) => q.id) };
}
