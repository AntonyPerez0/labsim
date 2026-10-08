/**
 * Content integrity — ids unique, references resolve, tags declared, coverage rules (Cur §1/§8),
 * well-formed quiz items, people rules (names only in team.ts, no gendered pronouns), and a few
 * domain guard-rails against contradicting the reference (ADB 5444, 5-minute health check, 5 statuses).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BARKS,
  EXAMS,
  FACTS,
  FLASHCARDS,
  GLOSSARY,
  ILLUSTRATIVE_FACTS,
  MANUAL_ARTICLES,
  MANUAL_CATEGORIES,
  MODULES,
  QUIPS,
  QUIZ_BANK,
  RANKS,
  ROBOT_PERSONALITIES,
  TEAM,
  TEAM_MEMBERS,
  TOPIC_TAGS,
  TAGS_BY_ID,
  MODULE_TAGS,
  checkpointQuestions,
  correctAnswerText,
  examPool,
  factById,
  glossaryLookup,
  gradeQuestion,
  matchesFill,
  parseManual,
  questionById,
  questionsForModule,
  questionsForTags,
  rankForXp,
  references,
  searchManual,
  articleById,
} from './index';
import { hasPeopleToken } from './people';

const ALL_FACTS = [...FACTS, ...ILLUSTRATIVE_FACTS];
const FACT_IDS = new Set(ALL_FACTS.map((f) => f.id));
const REF_FACT_IDS = new Set(FACTS.map((f) => f.id));
const MODULE_IDS = new Set(MODULES.map((m) => m.id));
const ARTICLE_IDS = new Set(MANUAL_ARTICLES.map((a) => a.id));

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

/** Every string inside a value (deep). */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const ALL_DATA = {
  FACTS: ALL_FACTS,
  QUIZ_BANK,
  FLASHCARDS,
  MODULES,
  TOPIC_TAGS,
  TEAM_MEMBERS,
  RANKS,
  ACHIEVEMENTS,
  GLOSSARY,
  MANUAL_ARTICLES,
  EXAMS,
  QUIPS,
  ROBOT_PERSONALITIES,
  BARKS,
};

describe('counts (Cur totals)', () => {
  it('has every fact, item, card and module', () => {
    expect(FACTS).toHaveLength(245);
    expect(ILLUSTRATIVE_FACTS).toHaveLength(20);
    expect(FACTS.filter((f) => f.tier === 'core')).toHaveLength(169);
    expect(FACTS.filter((f) => f.tier === 'supporting')).toHaveLength(64);
    expect(FACTS.filter((f) => f.tier === 'trivia')).toHaveLength(12);
    expect(QUIZ_BANK).toHaveLength(382);
    const byType = (t: string) => QUIZ_BANK.filter((q) => q.type === t).length;
    expect([byType('mc'), byType('tf'), byType('fill'), byType('order'), byType('match')]).toEqual([251, 73, 31, 14, 13]);
    expect(FLASHCARDS).toHaveLength(159);
    expect(MODULES).toHaveLength(18);
    expect(ACHIEVEMENTS).toHaveLength(46);
    expect(RANKS).toHaveLength(6);
    expect(EXAMS).toHaveLength(5);
    expect(QUIPS).toHaveLength(60);
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(90);
    expect(MANUAL_ARTICLES.length).toBeGreaterThanOrEqual(35);
  });

  it('ids follow the curriculum schemes and are contiguous', () => {
    expect(FACTS.map((f) => f.id)).toEqual(Array.from({ length: 245 }, (_, i) => `F${String(i + 1).padStart(3, '0')}`));
    expect(QUIZ_BANK.map((q) => q.id)).toEqual(Array.from({ length: 382 }, (_, i) => `Q${String(i + 1).padStart(3, '0')}`));
    expect(FLASHCARDS.map((c) => c.id)).toEqual(Array.from({ length: 159 }, (_, i) => `FC${String(i + 1).padStart(3, '0')}`));
    expect(MODULES.map((m) => m.id)).toEqual(Array.from({ length: 18 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`));
  });
});

describe('unique ids', () => {
  it.each([
    ['facts', ALL_FACTS.map((f) => f.id)],
    ['questions', QUIZ_BANK.map((q) => q.id)],
    ['flashcards', FLASHCARDS.map((c) => c.id)],
    ['modules', MODULES.map((m) => m.id)],
    ['tags', TOPIC_TAGS.map((t) => t.id)],
    ['team', TEAM_MEMBERS.map((t) => t.key)],
    ['team npc ids', TEAM_MEMBERS.flatMap((t) => (t.npcId ? [t.npcId] : []))],
    ['ranks', RANKS.map((r) => r.id)],
    ['achievements', ACHIEVEMENTS.map((a) => a.id)],
    ['glossary terms', GLOSSARY.map((g) => g.term.toLowerCase())],
    ['articles', MANUAL_ARTICLES.map((a) => a.id)],
    ['exams', EXAMS.map((e) => e.id)],
    ['quips', QUIPS.map((q) => q.key)],
    ['barks', BARKS.map((b) => b.id)],
  ])('%s', (_name, ids) => {
    expect(dupes(ids)).toEqual([]);
  });
});

describe('references resolve', () => {
  it('quiz items cite existing reference facts (never S## facts) and modules', () => {
    for (const q of QUIZ_BANK) {
      expect(q.factIds.length, q.id).toBeGreaterThan(0);
      for (const f of q.factIds) expect(REF_FACT_IDS.has(f), `${q.id} → ${f}`).toBe(true);
      expect(MODULE_IDS.has(q.moduleId), q.id).toBe(true);
    }
  });

  it('flashcards cite existing facts and their deck is the earliest teaching module', () => {
    for (const c of FLASHCARDS) {
      for (const f of c.factIds) expect(REF_FACT_IDS.has(f), `${c.id} → ${f}`).toBe(true);
      expect(c.deck).toBe(`deck.${c.moduleId}`);
      const earliest = c.factIds
        .flatMap((f) => factById(f)!.taughtIn ?? [])
        .sort()[0];
      expect(c.moduleId, c.id).toBe(earliest);
    }
  });

  it('modules reference existing facts, prerequisites, mentors and checkpoint items', () => {
    for (const m of MODULES) {
      for (const f of m.factIds) expect(REF_FACT_IDS.has(f), `${m.id} → ${f}`).toBe(true);
      for (const p of m.prerequisites) expect(MODULE_IDS.has(p) && p < m.id, `${m.id} prereq ${p}`).toBe(true);
      expect(TEAM[m.mentor], m.mentor).toBeDefined();
      for (const c of m.cameos ?? []) expect(TEAM[c], c).toBeDefined();
      expect(m.checkpointQuestionIds.length).toBeGreaterThanOrEqual(5);
      expect(m.estMinutes).toBeGreaterThan(0);
      expect(m.objectives.length).toBeGreaterThan(0);
    }
  });

  it('module facts agree with the facts\' "Taught in" lists', () => {
    for (const f of FACTS) {
      expect(f.taughtIn?.length, f.id).toBeGreaterThan(0);
      for (const m of f.taughtIn!) expect(MODULES.find((x) => x.id === m)!.factIds, `${f.id} in ${m}`).toContain(f.id);
    }
    for (const m of MODULES) for (const id of m.factIds) expect(factById(id)!.taughtIn).toContain(m.id);
  });

  it('articles: facts, related, links and fact chips resolve; bodies parse', () => {
    for (const a of MANUAL_ARTICLES) {
      expect(MANUAL_CATEGORIES).toContain(a.category);
      for (const f of a.factIds) expect(FACT_IDS.has(f), `${a.id} → ${f}`).toBe(true);
      for (const r of a.related ?? []) expect(ARTICLE_IDS.has(r), `${a.id} related ${r}`).toBe(true);
      const blocks = parseManual(a.body);
      expect(blocks.length, a.id).toBeGreaterThanOrEqual(3);
      const { links, facts } = references(a.body);
      for (const l of links) expect(ARTICLE_IDS.has(l), `${a.id} links [[${l}]]`).toBe(true);
      for (const f of facts) {
        expect(FACT_IDS.has(f), `${a.id} chip ${f}`).toBe(true);
        expect(a.factIds, `${a.id} chip ${f} listed`).toContain(f);
      }
      for (const p of a.practice ?? []) expect(p).toMatch(/^(INC\d{2}|DR\d{2})$/);
    }
  });

  it('glossary terms link to existing articles', () => {
    for (const g of GLOSSARY) if (g.articleId) expect(ARTICLE_IDS.has(g.articleId), `${g.term} → ${g.articleId}`).toBe(true);
  });

  it('exams reference real facts, modules and ranks', () => {
    for (const e of EXAMS) {
      for (const f of e.written.criticalFactIds) expect(REF_FACT_IDS.has(f), `${e.id} critical ${f}`).toBe(true);
      for (const t of e.practical.tasks) for (const f of t.factIds) expect(REF_FACT_IDS.has(f)).toBe(true);
      for (const m of Object.keys(e.written.moduleQuotas)) expect(MODULE_IDS.has(m)).toBe(true);
      for (const m of e.eligibility.modules) expect(MODULE_IDS.has(m)).toBe(true);
      expect(RANKS.find((r) => r.id === e.careerRankId)?.certExamId).toBe(e.id);
      const quota = Object.values(e.written.moduleQuotas).reduce((a, b) => a + b, 0) + (e.written.extra?.count ?? 0);
      expect(quota, e.id).toBe(e.written.items);
      expect(Math.ceil((e.written.items * e.written.passPercent) / 100), e.id).toBe(e.written.passCount);
      const mix = e.written.tierMix;
      expect(mix.core + mix.supporting + mix.trivia).toBeCloseTo(1);
    }
  });

  it('exam pools exclude illustrative († ) items and can meet every module quota', () => {
    for (const e of EXAMS) {
      const pool = examPool(e, QUIZ_BANK);
      expect(pool.some((q) => q.illustrative)).toBe(false);
      for (const [m, n] of Object.entries(e.written.moduleQuotas)) expect(pool.filter((q) => q.moduleId === m).length, `${e.id} ${m}`).toBeGreaterThanOrEqual(n);
      // every critical fact has at least one eligible item
      for (const f of e.written.criticalFactIds) expect(QUIZ_BANK.some((q) => !q.illustrative && q.factIds.includes(f)), `${e.id} ${f}`).toBe(true);
    }
    expect(QUIZ_BANK.filter((q) => q.illustrative).map((q) => q.id)).toEqual(['Q128', 'Q137', 'Q220']);
  });

  it('team, barks, quips and ranks are consistent', () => {
    for (const b of BARKS) expect(TEAM[b.speaker], b.id).toBeDefined();
    const rigs = new Set(ROBOT_PERSONALITIES.map((r) => r.rig));
    for (const q of QUIPS) {
      expect(rigs.has(q.rig)).toBe(true);
      expect(q.text.length, q.key).toBeLessThanOrEqual(90);
    }
    expect(RANKS.map((r) => r.minXp)).toEqual([...RANKS.map((r) => r.minXp)].sort((a, b) => a - b));
    expect(rankForXp(0).id).toBe('intern');
    expect(rankForXp(2500).id).toBe('automation-engineer-1');
    expect(rankForXp(99999).nextXp).toBeNull();
    for (const t of TEAM_MEMBERS) expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('tags', () => {
  const declared = new Set(TOPIC_TAGS.map((t) => t.id));

  it('every tag used anywhere is declared', () => {
    const used: [string, string[]][] = [
      ...ALL_FACTS.map((f) => [f.id, f.tags] as [string, string[]]),
      ...QUIZ_BANK.map((q) => [q.id, q.tags] as [string, string[]]),
      ...FLASHCARDS.map((c) => [c.id, c.tags] as [string, string[]]),
      ...MODULES.map((m) => [m.id, m.tags] as [string, string[]]),
      ...GLOSSARY.map((g) => [g.term, g.tags] as [string, string[]]),
      ...MANUAL_ARTICLES.map((a) => [a.id, a.tags] as [string, string[]]),
    ];
    for (const [id, tags] of used) {
      expect(tags.length, id).toBeGreaterThan(0);
      for (const t of tags) expect(declared.has(t), `${id} uses undeclared tag ${t}`).toBe(true);
    }
  });

  it('declared tags are well-formed and all used', () => {
    const usedTags = new Set(
      [...ALL_FACTS, ...QUIZ_BANK, ...FLASHCARDS, ...MODULES, ...GLOSSARY, ...MANUAL_ARTICLES].flatMap((x) => x.tags),
    );
    for (const t of TOPIC_TAGS) {
      expect(MODULE_IDS.has(t.taughtIn), t.id).toBe(true);
      if (t.kind === 'module') expect(MODULE_TAGS[t.taughtIn]).toBe(t.id);
      else expect(t.parent && TAGS_BY_ID[t.parent]?.kind, t.id).toBe('module');
      expect(usedTags.has(t.id), `tag ${t.id} unused`).toBe(true);
    }
    expect(Object.keys(MODULE_TAGS)).toHaveLength(18);
  });

  it('module tags lead each item\'s tag list (Cur §8)', () => {
    for (const q of QUIZ_BANK) expect(q.tags[0], q.id).toBe(MODULE_TAGS[q.moduleId]);
    for (const c of FLASHCARDS) expect(c.tags[0], c.id).toBe(MODULE_TAGS[c.moduleId]);
    for (const f of FACTS) expect(f.tags[0], f.id).toBe(MODULE_TAGS[f.taughtIn![0]]);
  });
});

describe('coverage (Cur §1)', () => {
  it('core facts are tested by ≥ 2 items, supporting and trivia by ≥ 1', () => {
    for (const f of FACTS) {
      const n = QUIZ_BANK.filter((q) => q.factIds.includes(f.id)).length;
      expect(n, `${f.id} (${f.tier})`).toBeGreaterThanOrEqual(f.tier === 'core' ? 2 : 1);
    }
  });

  it('every reference fact is explained in at least one Field Manual article', () => {
    const inManual = new Set(MANUAL_ARTICLES.flatMap((a) => a.factIds));
    const missing = FACTS.filter((f) => !inManual.has(f.id)).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it('checkpoint items belong to their module and carry its CP id', () => {
    for (const m of MODULES) {
      const items = checkpointQuestions(m.id);
      expect(items).toHaveLength(m.checkpointQuestionIds.length);
      for (const q of items) {
        expect(q.moduleId, q.id).toBe(m.id);
        expect(q.checkpoint, q.id).toBe(m.checkpointId);
      }
      const flagged = questionsForModule(m.id).filter((q) => q.checkpoint).map((q) => q.id);
      expect(flagged.sort()).toEqual([...m.checkpointQuestionIds].sort());
    }
  });

  it('every reference section is represented in the manual', () => {
    const sections = new Set(FACTS.map((f) => f.ref));
    const covered = new Set(MANUAL_ARTICLES.flatMap((a) => a.factIds).map((id) => factById(id)?.ref));
    for (const s of sections) expect(covered.has(s), String(s)).toBe(true);
  });
});

describe('quiz items are well-formed', () => {
  it.each(QUIZ_BANK.map((q) => [q.id, q] as const))('%s', (_id, q) => {
    expect(q.prompt.trim().length).toBeGreaterThan(5);
    expect(q.explanation.trim().length).toBeGreaterThan(5);
    switch (q.type) {
      case 'mc':
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.answers).toBeUndefined(); // exactly one correct option (Cur §8)
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(4);
        break;
      case 'tf':
        expect(q.options).toEqual(['True', 'False']);
        expect([0, 1]).toContain(q.answer);
        break;
      case 'order':
        expect(q.options!.length).toBeGreaterThanOrEqual(3);
        expect(new Set(q.options).size).toBe(q.options!.length);
        expect(q.answer).toBe(-1);
        break;
      case 'match':
        expect(q.pairs!.length).toBeGreaterThanOrEqual(2);
        expect(new Set(q.pairs!.map((p) => p[0])).size).toBe(q.pairs!.length);
        expect(new Set(q.pairs!.map((p) => p[1])).size).toBe(q.pairs!.length);
        break;
      case 'fill':
        expect(q.accepted!.length).toBeGreaterThan(0);
        expect(typeof q.caseInsensitive).toBe('boolean');
        break;
    }
    // Cur §3.0 difficulty rule.
    const expected = q.type === 'order' || q.type === 'match' ? 3 : q.type === 'fill' ? 2 : q.factIds.length > 1 ? 2 : 1;
    if (!['Q367', 'Q377'].includes(q.id)) expect(q.difficulty).toBe(expected);
    // grading round-trips
    const right =
      q.type === 'order' ? q.options! : q.type === 'match' ? q.pairs!.map((p) => p[1]) : q.type === 'fill' ? q.accepted![0] : q.answer!;
    expect(gradeQuestion(q, right)).toBe(true);
    expect(correctAnswerText(q).length).toBeGreaterThan(0);
  });

  it('case-sensitive fill-ins are exactly the ones the curriculum marks', () => {
    const sensitive = QUIZ_BANK.filter((q) => q.type === 'fill' && !q.caseInsensitive).map((q) => q.id);
    expect(sensitive).toEqual(['Q128', 'Q273', 'Q276', 'Q284', 'Q286']);
    expect(gradeQuestion(questionById('Q284')!, 'Avocado')).toBe(false);
    expect(gradeQuestion(questionById('Q284')!, ' avocado ')).toBe(true);
    expect(gradeQuestion(questionById('Q079')!, 'orchestrator')).toBe(true);
    expect(matchesFill('Tax  Item 5', ['Tax Item 5'])).toBe(true);
  });
});

describe('people rules', () => {
  const GENDERED = /\b(he|she|him|his|her|hers|himself|herself)\b/i;

  it('no gendered pronouns anywhere in content', () => {
    for (const [name, data] of Object.entries(ALL_DATA)) {
      for (const s of strings(data)) expect(GENDERED.test(s) ? `${name}: ${s}` : '').toBe('');
    }
  });

  it('every people token is resolved', () => {
    for (const s of strings(ALL_DATA)) expect(hasPeopleToken(s), s).toBe(false);
  });

  it('real and NPC names appear only in team.ts (sources use {{key}} tokens)', () => {
    const names = TEAM_MEMBERS.filter((t) => t.kind !== 'system').map((t) => t.name);
    const re = new RegExp(`\\b(${names.join('|')})\\b`);
    const root = __dirname;
    const files: string[] = [];
    const walk = (dir: string) =>
      readdirSync(dir).forEach((f) => {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== 'team.ts') files.push(p);
      });
    walk(root);
    for (const f of files) {
      const hit = readFileSync(f, 'utf8').split('\n').find((l) => re.test(l));
      expect(hit ? `${f}: ${hit.trim()}` : '').toBe('');
    }
  });

  it('resolved data does name the mentors', () => {
    expect(factById('F111')!.text).toContain(TEAM.jared.name);
    expect(questionById('Q108')!.options).toContain(TEAM.tate.name);
  });
});

describe('domain guard-rails (never contradict the reference)', () => {
  const sentences = (s: string) => s.split(/(?<=[.!?])\s+|\n/);
  const CONTEXT_5555 = /(default|story|collision|coworker|desk|refused|broken|never|not\b|5444|wrong|instead|falls? back|fallback|avoid|controlled|leaving the port off|no port)/i;

  it('the lab ADB port is 5444; 5555 only appears as the default / the collision story', () => {
    for (const f of ALL_FACTS) expect(/5555/.test(f.text) && !CONTEXT_5555.test(f.text) ? f.id : '').toBe('');
    for (const c of FLASHCARDS) expect(/5555/.test(c.back) && !CONTEXT_5555.test(c.back) ? c.id : '').toBe('');
    for (const q of QUIZ_BANK) {
      const ans = correctAnswerText(q);
      if (/5555/.test(ans)) expect(/default/i.test(q.prompt), q.id).toBe(true);
    }
    const prose = [
      ...MANUAL_ARTICLES.flatMap((a) => [a.summary, a.body]),
      ...GLOSSARY.map((g) => g.definition),
      ...strings(MODULES),
      ...TEAM_MEMBERS.map((t) => t.blurb),
    ];
    for (const s of prose) for (const sent of sentences(s)) if (/5555/.test(sent)) expect(CONTEXT_5555.test(sent), sent).toBe(true);
    expect(factById('F026')!.text).toMatch(/5444/);
  });

  it('health check is every 5 minutes; there are exactly 5 statuses', () => {
    const text = strings(ALL_DATA).join('\n');
    expect(text).not.toMatch(/every (1|2|3|4|6|10|15|30|60|ten|fifteen|thirty) minutes/i);
    expect(text).not.toMatch(/\b(four|six|seven|4|6) (robot )?(operational )?statuses\b/i);
    // Locked config values, checked where the game *asserts* them (facts, cards, glossary, correct answers).
    const claims = [
      ...FACTS.map((f) => f.text),
      ...FLASHCARDS.map((c) => c.back),
      ...GLOSSARY.map((g) => g.definition),
      ...QUIZ_BANK.map((q) => correctAnswerText(q)),
    ].join('\n');
    expect(claims).not.toMatch(/kernelType\s*(is|=)\s*(locked to\s*)?SPA\b/);
    expect(claims).not.toMatch(/theme\s*=\s*(?!avocado)[a-z]+/i);
    expect(claims).not.toMatch(/theme is locked (strictly )?to (?!avocado)/i);
    expect(claims).not.toMatch(/portNumber\s*(is|=)\s*(locked to\s*)?(?!5444)\d+/);
  });

  it('power facts: Pis on 5V 10A, NUCs on 12V, Mean Well to 24V, terminals on AC strips', () => {
    expect(factById('F086')!.text).toMatch(/5V DC, 10-Amp/);
    expect(factById('F085')!.text).toMatch(/12V DC/);
    expect(factById('F074')!.text).toMatch(/24V DC/);
    expect(factById('F229')!.text).toMatch(/AC power strips/);
    const text = strings([MANUAL_ARTICLES, GLOSSARY, FLASHCARDS]).join('\n');
    expect(text).not.toMatch(/LabSim (devices|terminals?) (plug|go|are powered) (in)?to the (24V|12V|5V|DC)/i);
  });

  it('UI Automator version is 2.3 and statuses are spelled as in the reference', () => {
    const text = strings([FACTS, FLASHCARDS, MANUAL_ARTICLES, GLOSSARY]).join('\n');
    expect(text).not.toMatch(/UI Automator (2\.[0-24-9]|1\.\d|3\.\d)/);
    for (const s of ['Available', 'Unavailable', 'Offline', 'Connection Failed', 'Reserved']) expect(text).toContain(s);
  });
});

describe('helpers', () => {
  it('searchManual ranks the obvious article first', () => {
    const top = (q: string) => searchManual(q)[0]?.article.id;
    expect(top('Park All')).toBe('maglock-and-park-all');
    expect(top('config.properties')).toBe('config-properties');
    expect(top('Connection Failed')).toMatch(/connection-failed|orca-statuses|orca-health-check/);
    expect(top('Callers')).toBe('callus');
    expect(top('select print')).toBe('pigeon-bottlenecks');
    const ids5444 = searchManual('5444').map((h) => h.article.id);
    expect(ids5444.slice(0, 5)).toContain('adb-port-5444');
    expect(ids5444).toContain('config-properties');
    expect(searchManual('').length).toBe(0);
    expect(searchManual('xyzzy-nothing')).toEqual([]);
    for (const h of searchManual('Station Duo')) expect(h.snippet.length).toBeLessThanOrEqual(162);
  });

  it('glossary lookup works by term and alias', () => {
    expect(glossaryLookup('Orca')?.term).toBe('Orchestrator');
    expect(glossaryLookup('callers')?.term).toBe('Callus');
    expect(glossaryLookup('LSTR')).toBeDefined();
    expect(glossaryLookup('nope')).toBeUndefined();
  });

  it('questionsForTags expands module tags to their fine tags', () => {
    const reserved = questionsForTags(['orca.status.reserved']);
    expect(reserved.length).toBeGreaterThan(0);
    expect(questionsForTags(['orca.status']).length).toBeGreaterThan(reserved.length);
    expect(questionsForTags(['orca.status'], { includeIllustrative: false }).some((q) => q.illustrative)).toBe(false);
  });

  it('articleById / factById / questionById', () => {
    expect(articleById('orca-statuses')?.title).toMatch(/Statuses/);
    expect(factById('S19')?.illustrative).toBe(true);
    expect(questionById('Q382')?.moduleId).toBe('M18');
  });
});
