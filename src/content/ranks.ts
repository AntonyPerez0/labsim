/**
 * Career ranks (GP §4.3) and their 1:1 mapping onto the curriculum's certification ranks (Cur §5.1).
 * Promotion = exam passed AND XP threshold met AND extra gate met. The UI shows the career rank name;
 * certificates read e.g. "CERT-R2 passed — Automation Engineer I".
 */
import type { RankDef } from './schema';
import { resolvePeople } from './people';

export const RANKS: RankDef[] = resolvePeople<RankDef[]>([
  {
    id: 'intern',
    index: 0,
    title: 'Intern',
    minXp: 0,
    certExamId: null,
    certTitle: null,
    extraGate: null,
    shiftDifficultyCap: 2,
    cosmetic: 'Grey visitor lanyard',
  },
  {
    id: 'lab-technician',
    index: 1,
    title: 'Lab Technician',
    minXp: 800,
    certExamId: 'CERT-R1',
    certTitle: 'Lab Trainee',
    extraGate: null,
    shiftDifficultyCap: 3,
    cosmetic: 'Blue lanyard; personal yellow multimeter',
  },
  {
    id: 'automation-engineer-1',
    index: 2,
    title: 'Automation Engineer I',
    minXp: 2500,
    certExamId: 'CERT-R2',
    certTitle: 'Rig Technician',
    extraGate: null,
    shiftDifficultyCap: 4,
    cosmetic: 'Green lanyard; desk plant',
  },
  {
    id: 'automation-engineer-2',
    index: 3,
    title: 'Automation Engineer II',
    minXp: 5000,
    certExamId: 'CERT-R3',
    certTitle: 'Automation Engineer',
    extraGate: null,
    shiftDifficultyCap: 5,
    cosmetic: 'lab-green hoodie on your chair',
  },
  {
    id: 'senior-automation-engineer',
    index: 4,
    title: 'Senior Automation Engineer',
    minXp: 9000,
    certExamId: 'CERT-R4',
    certTitle: 'Senior Automation Engineer',
    extraGate: '5 shifts of ≥ 10 min graded ≥ A',
    shiftDifficultyCap: 5,
    cosmetic: 'Your name label on a rig shelf',
  },
  {
    id: 'lab-lead',
    index: 5,
    title: 'Lab Lead',
    minXp: 18000,
    certExamId: 'CERT-R5',
    certTitle: 'Lab Lead',
    extraGate: '≥ 45 of 54 Academy stars (CERT-R5 eligibility already requires Leitner mastery ≥ 90 % and a Full Shift ratio ≥ 0.80)',
    shiftDifficultyCap: 5,
    cosmetic: '{{jared}} hands you the label maker; name plate on the lab door',
  },
]);

export const RANKS_BY_ID: Record<string, RankDef> = Object.fromEntries(RANKS.map((r) => [r.id, r]));

/**
 * Highest rank whose XP threshold is met (XP only — exam and extra gates are checked by missions).
 * `nextXp` is the next rank's threshold, or null at the top.
 */
export function rankForXp(xp: number): RankDef & { nextXp: number | null } {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].minXp) idx = i;
  const next = RANKS[idx + 1];
  return { ...RANKS[idx], nextXp: next ? next.minXp : null };
}

/** Career rank promoted to by passing a certification exam (CERT-R1 → lab-technician …). */
export function rankForExam(examId: string): RankDef | undefined {
  return RANKS.find((r) => r.certExamId === examId);
}

/** XP reward table (GP §4.2) — numbers missions use when awarding XP. */
export const XP_REWARDS = {
  academyStep: 10,
  academyInteract: 15,
  academyComputerTask: 25,
  /** Multiplier applied to a step's XP when "Show me" was used. */
  showMeMultiplier: 0.5,
  moduleComplete: 100,
  firstTwoStars: 50,
  firstThreeStars: 100,
  /** Module replay earns this fraction of the above. */
  replayMultiplier: 0.25,
  certification: { 'CERT-R1': 300, 'CERT-R2': 500, 'CERT-R3': 700, 'CERT-R4': 1000, 'CERT-R5': 1500 } as Record<string, number>,
  /** "With distinction" bonus fraction. */
  distinctionBonus: 0.5,
  shiftGradeBonus: { S: 300, A: 200, B: 100, C: 50, D: 0 } as Record<string, number>,
  /** Shift XP = floor(finalScore / shiftScoreDivisor) + grade bonus; × strictMultiplier in Strict. */
  shiftScoreDivisor: 10,
  strictMultiplier: 1.25,
  dailyRanked: 250,
  /** Drill XP = floor(score / drillScoreDivisor), capped per round. */
  drillScoreDivisor: 20,
  drillRoundCap: 150,
  drillFirstMedal: { bronze: 50, silver: 100, gold: 200 } as Record<string, number>,
  flashcardReview: 2,
  flashcardGotIt: 3,
  flashcardDailyCap: 200,
  freeplayFix: 30,
  freeplayDailyCap: 300,
} as const;
