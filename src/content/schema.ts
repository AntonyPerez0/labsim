/**
 * Content schema — curriculum data authored in `src/content/*` (facts, quizzes, flashcards,
 * glossary, Field Manual articles, module metadata, ranks, achievements, exams, quips, barks).
 * Pure data; no sim imports.
 * Lesson *scripts* (interactive steps with objectives) live in `src/missions/academy/` and
 * reference these ids.
 *
 * Accuracy rule: every non-illustrative string must agree with
 * `docs/reference/REMOVED-internal-reference.md`. Invented details are flagged `illustrative: true`
 * (or marked with `†` inside Field Manual markdown) so the UI can show the "Illustrative (sim only)" badge.
 */

/** Topic tag, e.g. "orca.status", "adb.port", "power.rails". The canonical list is `TOPIC_TAGS` in ./tags.ts. */
export type TopicTag = string;

/** Field Manual chapters / mastery-radar groups (GP §2.6, §4.8.1). */
export type TagGroup =
  | 'Lab Basics'
  | 'Architecture'
  | 'Orca'
  | 'Jenkins'
  | 'uia-remote'
  | 'Pigeon & Receipts'
  | 'ADB'
  | 'Power'
  | 'Hardware'
  | 'Bots & Cards'
  | 'Merchants & SDK'
  | 'Vision & AI'
  | 'Tools & People';

/** A declared topic tag (GP §4.8.1 fine tags + Cur §8 module tags). */
export interface TagDef {
  id: TopicTag;
  label: string;
  description: string;
  /** 'module' = a curriculum module's default tag (Cur §8); 'fine' = a GP §4.8.1 fine tag. */
  kind: 'module' | 'fine';
  /** Parent module tag (Cur §8). `null` for module tags (and for fine tags that *are* the module tag). */
  parent: TopicTag | null;
  /** Module that teaches it ("Taught in"). */
  taughtIn: string;
  group: TagGroup;
}

export type FactTier = 'core' | 'supporting' | 'trivia';

export interface Fact {
  /** "F001" … (reference facts) or "S01" … (sim-only illustrative details, Cur §0.3). */
  id: string;
  text: string;
  /** Reference section, e.g. "3. Orchestrator > The 5 Robot Operational Statuses". */
  section: string;
  /** Short reference code from the curriculum, e.g. "§3.1", "IMG-T". */
  ref?: string;
  tier: FactTier;
  tags: TopicTag[];
  /** Modules whose lesson teaches this fact (Cur §1 "Taught in"). */
  taughtIn?: string[];
  /** True if this is an invented illustrative detail (not from the reference). */
  illustrative?: boolean;
}

export type QuizType = 'mc' | 'tf' | 'order' | 'match' | 'fill';

export interface QuizQuestion {
  /** "Q001" … */
  id: string;
  type: QuizType;
  prompt: string;
  /**
   * mc: options + answer = index of correct option (or indices for multi-select via `answers`).
   * tf: options = ["True","False"], answer = 0|1.
   * order: options = items in CORRECT order (UI shuffles); answer unused (-1).
   * match: pairs = [left, right][] in correct pairing (UI shuffles right side).
   * fill: accepted = exact strings accepted (case-sensitive unless `caseInsensitive`).
   *       Normalisation (Cur §3.0): trim and collapse internal whitespace before comparing.
   */
  options?: string[];
  answer?: number;
  answers?: number[];
  pairs?: [string, string][];
  accepted?: string[];
  caseInsensitive?: boolean;
  explanation: string;
  factIds: string[];
  tags: TopicTag[];
  difficulty: 1 | 2 | 3;
  /** Module this question belongs to (for checkpoints/exams). */
  moduleId: string;
  /** Lesson checkpoint that uses this item, e.g. "CP-M01.1" (Cur §3 "CP-" marks). */
  checkpoint?: string;
  /**
   * † item (Cur §0.2 rule 3): its answer depends on an illustrative sim detail. Allowed in Academy
   * checkpoints and Arcade, **excluded from certification written exams**.
   */
  illustrative?: boolean;
  /** Retired items keep their id but are never drawn (Cur §0.1). */
  retired?: boolean;
}

export interface Flashcard {
  /** "FC001" … */
  id: string;
  front: string;
  back: string;
  factIds: string[];
  tags: TopicTag[];
  moduleId: string;
  /** Deck id, e.g. "deck.M04" (= `deck.${moduleId}`). */
  deck?: string;
  /** Optional typed-answer mode (Cur §4.0): accepted strings, graded with the fill-in rules. */
  typedAnswer?: string[];
  /** Typed answers are case-insensitive unless this is true. */
  typedCaseSensitive?: boolean;
}

export interface GlossaryTerm {
  term: string;
  /** Aliases/abbreviations, e.g. ["Orca", "Orchestrator"]. */
  aliases: string[];
  definition: string;
  tags: TopicTag[];
  /** Related Field Manual article id. */
  articleId?: string;
  /** True if the term itself is a sim-only invention (e.g. an illustrative host name). */
  illustrative?: boolean;
}

export type ManualCategory =
  | 'Lab Basics'
  | 'Hardware'
  | 'Power'
  | 'Robots'
  | 'Orchestrator'
  | 'Pipelines'
  | 'Test Frameworks'
  | 'Tools'
  | 'Cards & Payments'
  | 'Infrastructure'
  | 'Teams & History'
  | 'Troubleshooting'
  | 'About the Sim';

/**
 * Field Manual article — rendered with a tiny markdown subset. `body` grammar (one construct per block,
 * blocks separated by blank lines; see `parseManual()` in ./manual/markdown.ts for a reference parser):
 *
 * Blocks
 *   `## Heading` / `### Subheading`      — section headings (no `#` h1: the title is rendered separately).
 *   paragraph                           — consecutive non-blank lines, joined with a space.
 *   `- item` (or `* item`)              — bullet list; `  - sub` (2-space indent) = one nested level.
 *   `1. item`                           — numbered list (numbers are ignored; rendered in order).
 *   ```lang … ```                       — fenced code block (verbatim; `lang` optional: text, bash, java,
 *                                         json, properties, log, groovy). A `†` inside code is literal text.
 *   `| a | b |` rows                    — table; the first row is the header, the second row is `|---|---|`.
 *   `> text`                            — callout. `> **Tip:** …`, `> **Warning:** …`, `> **Illustrative
 *                                         (sim only):** …`, `> **In the sim:** …` pick the callout style
 *                                         from the leading bold label (default: note).
 *   `---`                               — horizontal rule.
 * Inline (inside paragraphs, list items, table cells, callouts)
 *   `**bold**`, `*italic*`, `` `code` ``,
 *   `[[article-id]]` / `[[article-id|label]]` — link to another Field Manual article,
 *   `{F123}`                            — fact reference chip (shows the fact text on hover),
 *   `†`                                  — marks the immediately preceding word / code span as an
 *                                         **illustrative (sim-only)** detail; renderers show the badge.
 */
export interface ManualArticle {
  id: string; // "orca-statuses"
  title: string;
  category: ManualCategory;
  summary: string;
  body: string;
  factIds: string[];
  tags: TopicTag[];
  /** Related reference photo: a file name in docs/reference/images (served from /reference/…), optional. */
  image?: string;
  /** Related article ids ("See also"). */
  related?: string[];
  /** Extra search keywords / exact strings (e.g. "5444", "UiObjectNotFoundException"). */
  keywords?: string[];
  /** Arcade incidents (GP §3, INCnn) and drills (DRnn) that practise this article. */
  practice?: string[];
}

export interface ModuleMeta {
  /** "M01" … */
  id: string;
  title: string;
  /** Mentor key from team.ts, e.g. "morgan", "jared", "tate", "david". */
  mentor: string;
  summary: string;
  objectives: string[];
  prerequisites: string[];
  factIds: string[];
  tags: TopicTag[];
  estMinutes: number;
  /** Quiz question ids used for the module's end checkpoint. */
  checkpointQuestionIds: string[];
  /** Rank required to unlock (by XP), or null. */
  unlockXp: number;
  /** Team keys making cameo appearances (Cur §2.1 "cameo"). */
  cameos?: string[];
  /** Checkpoint id and title, e.g. "CP-M01.1" / "Lab Basics". */
  checkpointId?: string;
  checkpointTitle?: string;
  /** Flashcard deck unlocked on completion, e.g. "deck.M01". */
  deck?: string;
  /** Things the module unlocks outside the Academy (Arcade incidents/drills, terminal commands, chapters). */
  unlocks?: string[];
  /** Est. duration range from the curriculum (minutes), e.g. [10, 12]. */
  estMinutesRange?: [number, number];
  /** One-line world setup on start (Cur §2 module header). */
  setup?: string;
}

/** Team member / NPC. Real first names from the reference live ONLY in team.ts (anonymisable). */
export interface TeamMember {
  key: string;
  name: string;
  role: string;
  /** Short bio line used in dialogue intros. */
  blurb: string;
  /** Portrait colour for the dialogue box. */
  color: string;
  /** World/lesson NPC id, e.g. "npc.jared", "npc.coworker". */
  npcId?: string;
  kind?: 'mentor' | 'coworker' | 'system';
  /** True if the person appears in the reference (a real colleague's first name). */
  fromReference?: boolean;
  /** True if invented for the game (badged illustrative where a trainee might take it as fact). */
  illustrative?: boolean;
  /** What to escalate to / ask this person about. */
  askAbout?: string[];
  /** Voice-blip recipe (World §8, voice-blip). */
  voice?: { wave: 'sine' | 'square' | 'triangle' | 'sawtooth'; hz: number; lowpassHz?: number };
  /** Default world anchor (World §1.9). */
  anchor?: string;
  /** Outfit description (World Appendix A). */
  outfit?: string;
}

export interface RankDef {
  id: string;
  title: string;
  minXp: number;
  /** 0 = Intern … 5 = Lab Lead. */
  index?: number;
  /** Certification exam required for promotion (Cur §5), or null for Intern. */
  certExamId?: string | null;
  /** The curriculum's certification title for this rank (Cur §5.1), e.g. "Lab Trainee". */
  certTitle?: string | null;
  /** Extra promotion gate from GP §4.3. */
  extraGate?: string | null;
  /** Max Arcade shift difficulty for this rank. */
  shiftDifficultyCap?: number;
  cosmetic?: string;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string; // emoji or short glyph
  hidden?: boolean;
  /** XP awarded (GP §4.5). */
  xp?: number;
  /** Exact unlock condition text (GP §4.5) — evaluated by missions. */
  condition?: string;
  category?: 'Academy' | 'Arcade' | 'Drills' | 'Hardware' | 'Streaks' | 'Mastery' | 'Exploration' | 'Certification';
}

/** Certification exam blueprint (Cur §5). */
export interface ExamBlueprint {
  id: string; // "CERT-R1"
  rank: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  /** Curriculum title (Cur §5.1), e.g. "Lab Trainee". */
  title: string;
  /** Career rank id this exam promotes to (GP §4.3). */
  careerRankId: string;
  eligibility: {
    /** Modules that must be complete. */
    modules: string[];
    /** Exam that must already be passed. */
    previousExam: string | null;
    /** Leitner mastery required (fraction of all cards in box ≥ 4), R5 only. */
    leitnerMastery?: number;
    /** Arcade "Full Shift" score ratio required, R5 only. */
    fullShiftRatio?: number;
    text: string;
  };
  written: {
    items: number;
    minutes: number;
    passPercent: number;
    passCount: number;
    /** Items per module. */
    moduleQuotas: Record<string, number>;
    /** Extra items beyond the module quotas. */
    extra?: { count: number; rule: 'weakest-modules-core' | 'trivia-any-module'; text: string };
    tierMix: { core: number; supporting: number; trivia: number };
    /** Must-pass facts: one item per fact is always included and must be answered correctly. */
    criticalFactIds: string[];
    criticalNotes: string;
  };
  practical: {
    summary: string;
    minutes: number;
    tasks: PracticalTask[];
    pass: string;
  };
  /** Base XP for passing (GP §4.2); "with distinction" adds 50 %. */
  xp: number;
}

export interface PracticalTask {
  id: string; // "P1-1"
  setup: string;
  playerMust: string;
  pass: string;
  factIds: string[];
}

/** Robot quip (GP §5.3), key `QUIP_<RIG>_<TRIGGER>`. */
export type QuipTrigger = 'idle' | 'pass' | 'yellow' | 'fail' | 'recovered' | 'park' | 'reserved';
export interface QuipDef {
  key: string;
  /** Orca system name, e.g. "wall-e". */
  rig: string;
  trigger: QuipTrigger;
  text: string;
}
export interface RobotPersonality {
  rig: string;
  humanName: string;
  personality: string;
  voice: string;
  /** Stepper pitch offset in semitones (touch robots only). */
  stepperSemitones: number | null;
}

/** Mentor / coworker bark (GP §5.4), id `BARK_<SPEAKER>_<NN>`. */
export interface BarkDef {
  id: string;
  /** Team key from team.ts. */
  speaker: string;
  trigger: string;
  text: string;
  /** Verbatim from the curriculum. */
  fromCurriculum?: boolean;
}
