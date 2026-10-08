/**
 * Content public API — the game's knowledge base. Import from `@/content`.
 *
 * Data: FACTS (F001–F245) + ILLUSTRATIVE_FACTS (S01–S20), QUIZ_BANK (Q001–Q382), FLASHCARDS (FC001–FC159),
 * MODULES (M01–M18), TOPIC_TAGS, TEAM_MEMBERS, RANKS, ACHIEVEMENTS, GLOSSARY, MANUAL_ARTICLES, EXAMS,
 * QUIPS, BARKS. Everything is plain serialisable data, already resolved for people names (see people.ts).
 */
import type { Fact, Flashcard, ManualArticle, ModuleMeta, QuizQuestion, TopicTag } from './schema';
import { FACTS, ILLUSTRATIVE_FACTS } from './facts';
import { QUIZ_BANK, QUIZ_BY_MODULE } from './quiz';
import { FLASHCARDS } from './flashcards';
import { MODULES, MODULES_BY_ID } from './modules';
import { MANUAL_ARTICLES, MANUAL_BY_ID } from './manual';
import { createManualSearch, type ManualSearchHit } from './manual/search';
import { GLOSSARY } from './glossary';
import { TAGS_BY_ID } from './tags';

export type * from './schema';
export { FACTS, ILLUSTRATIVE_FACTS, FACT_SECTIONS } from './facts';
export { QUIZ_BANK, QUIZ_BY_MODULE, ILLUSTRATIVE_QUESTION_IDS } from './quiz';
export { FLASHCARDS } from './flashcards';
export { MODULES, MODULES_BY_ID, MODULE_ORDER, availableModules } from './modules';
export { TOPIC_TAGS, TAGS_BY_ID, MODULE_TAGS, TAG_GROUPS, isKnownTag, rootTag, tagsUnder } from './tags';
export { TEAM_MEMBERS, TEAM, MENTOR_KEYS, teamMember, personName, HARDWARE_LEAD } from './team';
export type { MentorKey } from './team';
export { personText, resolvePeople } from './people';
export { RANKS, RANKS_BY_ID, rankForXp, rankForExam, XP_REWARDS } from './ranks';
export { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from './achievements';
export { GLOSSARY, glossaryLookup, glossarySearch } from './glossary';
export {
  MANUAL_ARTICLES,
  MANUAL_BY_ID,
  MANUAL_CATEGORIES,
  articleById,
  articlesInCategory,
  articlesForTags,
  articlesForFact,
  articlesForPractice,
  parseManual,
  parseInline,
  plainText,
  inlineText,
  references,
} from './manual';
export type { Block, Inline, ListItem, CalloutKind } from './manual';
export type { ManualSearchHit } from './manual/search';
export { EXAMS, EXAMS_BY_ID, EXAM_DRAW_RULES, DISTINCTION, RETAKE_RULES, examPool } from './exams';
export { QUIPS, QUIPS_BY_KEY, ROBOT_PERSONALITIES, quipFor } from './quips';
export { BARKS, BARKS_BY_ID, barksFor } from './barks';

// ── lookups ─────────────────────────────────────────────────────────────────

const FACT_MAP = new Map<string, Fact>([...FACTS, ...ILLUSTRATIVE_FACTS].map((f) => [f.id, f]));
const QUESTION_MAP = new Map<string, QuizQuestion>(QUIZ_BANK.map((q) => [q.id, q]));
const CARD_MAP = new Map<string, Flashcard>(FLASHCARDS.map((c) => [c.id, c]));

/** F### or S## fact by id. */
export function factById(id: string): Fact | undefined {
  return FACT_MAP.get(id);
}

export function questionById(id: string): QuizQuestion | undefined {
  return QUESTION_MAP.get(id);
}

export function flashcardById(id: string): Flashcard | undefined {
  return CARD_MAP.get(id);
}

export function moduleById(id: string): ModuleMeta | undefined {
  return MODULES_BY_ID[id];
}

/** Facts taught in a module (its "Facts covered" list, in order). */
export function factsForModule(moduleId: string): Fact[] {
  return (MODULES_BY_ID[moduleId]?.factIds ?? []).map((id) => FACT_MAP.get(id)).filter((f): f is Fact => !!f);
}

/** All non-retired quiz items of a module (bank order). */
export function questionsForModule(moduleId: string, opts: { includeIllustrative?: boolean } = {}): QuizQuestion[] {
  const { includeIllustrative = true } = opts;
  return (QUIZ_BY_MODULE[moduleId] ?? []).filter((q) => !q.retired && (includeIllustrative || !q.illustrative));
}

/** A module's checkpoint items, in checkpoint order. */
export function checkpointQuestions(moduleId: string): QuizQuestion[] {
  return (MODULES_BY_ID[moduleId]?.checkpointQuestionIds ?? []).map((id) => QUESTION_MAP.get(id)).filter((q): q is QuizQuestion => !!q);
}

/**
 * Quiz items carrying any of `tags`. A module tag also matches every fine tag under it
 * (e.g. "orca.status" matches items tagged "orca.status.reserved").
 */
export function questionsForTags(tags: TopicTag[], opts: { includeIllustrative?: boolean } = {}): QuizQuestion[] {
  const { includeIllustrative = true } = opts;
  const want = new Set<string>();
  for (const t of tags) {
    want.add(t);
    if (TAGS_BY_ID[t]?.kind === 'module') for (const d of Object.values(TAGS_BY_ID)) if (d.parent === t) want.add(d.id);
  }
  return QUIZ_BANK.filter((q) => !q.retired && (includeIllustrative || !q.illustrative) && q.tags.some((t) => want.has(t)));
}

/** Quiz items that test a fact. */
export function questionsForFact(factId: string): QuizQuestion[] {
  return QUIZ_BANK.filter((q) => q.factIds.includes(factId));
}

/** Flashcards in a deck ("deck.M04" or "M04"). */
export function flashcardsForDeck(deckOrModule: string): Flashcard[] {
  const mid = deckOrModule.replace(/^deck\./, '');
  return FLASHCARDS.filter((c) => c.moduleId === mid);
}

/** Flashcards sharing any fact with the given fact ids (Leitner cross-mode demotion, Cur §4.0). */
export function flashcardsForFacts(factIds: string[]): Flashcard[] {
  const want = new Set(factIds);
  return FLASHCARDS.filter((c) => c.factIds.some((f) => want.has(f)));
}

/** Field Manual article by id. */
export function articleFor(id: string): ManualArticle | undefined {
  return MANUAL_BY_ID[id];
}

let searcher: ((q: string, limit?: number) => ManualSearchHit[]) | null = null;

/** Ranked full-text search over the Field Manual (titles, keywords, glossary aliases, tags, bodies, facts). */
export function searchManual(query: string, limit = 20): ManualSearchHit[] {
  searcher ??= createManualSearch(MANUAL_ARTICLES, GLOSSARY, [...FACTS, ...ILLUSTRATIVE_FACTS]);
  return searcher(query, limit);
}

/**
 * Grade a free-text answer with the fill-in rules (Cur §3.0): trim, collapse internal whitespace, compare
 * case-insensitively unless `caseSensitive`. Used for `fill` quiz items and typed flashcard answers.
 */
export function matchesFill(answer: string, accepted: string[], caseSensitive = false): boolean {
  const norm = (s: string) => {
    const t = s.trim().replace(/\s+/g, ' ');
    return caseSensitive ? t : t.toLowerCase();
  };
  const a = norm(answer);
  return accepted.some((x) => norm(x) === a);
}

/** Grade any quiz answer. `answer`: mc/tf = option index (or indices for `answers`); order = options in the
 * player's order; match = right-hand values in left order; fill = text. */
export function gradeQuestion(q: QuizQuestion, answer: number | number[] | string | string[]): boolean {
  switch (q.type) {
    case 'mc':
    case 'tf':
      if (q.answers && Array.isArray(answer)) return [...answer].sort().join() === [...q.answers].sort().join();
      return typeof answer === 'number' && answer === q.answer;
    case 'order':
      return Array.isArray(answer) && answer.length === q.options!.length && answer.every((v, i) => v === q.options![i]);
    case 'match':
      return Array.isArray(answer) && answer.length === q.pairs!.length && answer.every((v, i) => v === q.pairs![i][1]);
    case 'fill':
      return typeof answer === 'string' && matchesFill(answer, q.accepted ?? [], !q.caseInsensitive);
  }
}

/** The correct answer rendered as text (for feedback). */
export function correctAnswerText(q: QuizQuestion): string {
  switch (q.type) {
    case 'mc':
    case 'tf':
      return q.answers ? q.answers.map((i) => q.options![i]).join(' + ') : q.options![q.answer!];
    case 'order':
      return q.options!.join(' → ');
    case 'match':
      return q.pairs!.map(([l, r]) => `${l} → ${r}`).join('; ');
    case 'fill':
      return (q.accepted ?? [])[0] ?? '';
  }
}
