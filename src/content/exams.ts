/**
 * Certification blueprints CERT-R1 … CERT-R5 (Cur §5). Each exam has a written part drawn from the quiz
 * bank (illustrative † items excluded) and a practical part (live sim tasks, no hints, no Force health check,
 * time scale 1 unless stated). Both parts must pass. Critical facts are must-pass: the paper always includes
 * one item per critical fact and missing any of them fails the written part whatever the score.
 */
import type { ExamBlueprint, QuizQuestion } from './schema';
import { resolvePeople } from './people';

const ALL_MODULES = Array.from({ length: 18 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
const each = (n: number): Record<string, number> => Object.fromEntries(ALL_MODULES.map((m) => [m, n]));

const R1_CRITICAL = ['F229', 'F232', 'F086', 'F231'];
const R2_CRITICAL = ['F100', 'F102', 'F107', 'F111', 'F113', 'F120', 'F218'];
const R3_CRITICAL = ['F198', 'F200', 'F164', 'F180', 'F193', 'F197', 'F210'];
const R4_CRITICAL = ['F098', 'F229', 'F232', 'F198', 'F107', 'F217', 'F122', 'F171'];
const R5_CRITICAL = Array.from(new Set([...R1_CRITICAL, ...R2_CRITICAL, ...R3_CRITICAL, ...R4_CRITICAL]));

export const EXAMS: ExamBlueprint[] = resolvePeople<ExamBlueprint[]>([
  {
    id: 'CERT-R1',
    rank: 'R1',
    title: 'Lab Trainee',
    careerRankId: 'lab-technician',
    eligibility: { modules: ['M01', 'M02', 'M03', 'M04', 'M05'], previousExam: null, text: 'M01–M05 complete' },
    written: {
      items: 30,
      minutes: 20,
      passPercent: 80,
      passCount: 24,
      moduleQuotas: { M01: 4, M02: 6, M03: 6, M04: 8, M05: 6 },
      tierMix: { core: 0.75, supporting: 0.25, trivia: 0 },
      criticalFactIds: R1_CRITICAL,
      criticalNotes: 'F229 (terminals & Collis on AC strips) · F232 (Park All) · F086 (Pis on 5V 10A) · F231 (yellow banner)',
    },
    practical: {
      summary: '3 tasks · 15 min total',
      minutes: 15,
      pass: 'All 3 tasks passed',
      tasks: [
        { id: 'P1-1', setup: "A random touch robot's arm is pushed (yellow banner).", playerMust: 'Walk to the right rig and press Park All.', pass: 'Banner green within 3 game-min; no other buttons pressed first.', factIds: ['F231', 'F232', 'F235'] },
        { id: 'P1-2', setup: "A rack's 5V fuse is blown and a new LabSim + Collis probe await power.", playerMust: 'Find the dead Pis, test and replace the fuse, plug the LabSim and the probe into the AC strip.', pass: 'Pis powered; both devices on the AC strip; zero wrong-socket attempts.', factIds: ['F086', 'F087', 'F227', 'F228', 'F229'] },
        { id: 'P1-3', setup: 'None.', playerMust: "SSH into a named Pi and report its health endpoint result.", pass: 'curl returns 200; the answer typed in the exam form = 200.', factIds: ['F064', 'F019', 'F099'] },
      ],
    },
    xp: 300,
  },
  {
    id: 'CERT-R2',
    rank: 'R2',
    title: 'Rig Technician',
    careerRankId: 'automation-engineer-1',
    eligibility: { modules: ['M06', 'M07', 'M08', 'M09', 'M10'], previousExam: 'CERT-R1', text: 'R1 + M06–M10 complete' },
    written: {
      items: 40,
      minutes: 25,
      passPercent: 80,
      passCount: 32,
      moduleQuotas: { M06: 12, M07: 9, M08: 7, M09: 7, M10: 5 },
      tierMix: { core: 0.75, supporting: 0.25, trivia: 0 },
      criticalFactIds: R2_CRITICAL,
      criticalNotes: 'F100 (5 statuses) · F102 (named Unavailable) · F107 + F111 (Connection Failed → {{jared}}) · F113 (Reserved) · F120 (device decoupling) · F218 (ADB bots: PIN-bypass merchants)',
    },
    practical: {
      summary: '4 tasks · 25 min',
      minutes: 25,
      pass: 'All 4 tasks passed',
      tasks: [
        { id: 'P2-1', setup: "A random rig's Pi is unplugged.", playerMust: 'Detect Connection Failed, read the Notes, escalate to {{jared}} with the endpoint.', pass: 'Correct escalation choice; status never manually overridden.', factIds: ['F107', 'F108', 'F109', 'F110', 'F111'] },
        { id: 'P2-2', setup: 'JOHNNY-5-style hardware swap on a random rig.', playerMust: 'Create a Device, relink Robot Device, keep the old Device; fix the Human Readable Name.', pass: 'Old device untouched; robot linked; tablet shows the right Human Readable Name.', factIds: ['F117', 'F118', 'F119', 'F120'] },
        { id: 'P2-3', setup: 'A firmware drop adds a conditional receipt option on one device type.', playerMust: 'Measure, create the 5-option map, keep the 4-option map, PR → merge.', pass: 'Both maps exist, coordinates ±0.5 mm.', factIds: ['F213', 'F214', 'F215', 'F216', 'F142'] },
        { id: 'P2-4', setup: 'Canadian PIN job queued with an ADB bot selected.', playerMust: 'Re-target to the Compact touch robot and choose Interac.', pass: 'Job runs on a physical bot with INTERAC_CA_DIP.', factIds: ['F217', 'F218', 'F219', 'F220', 'F225'] },
      ],
    },
    xp: 500,
  },
  {
    id: 'CERT-R3',
    rank: 'R3',
    title: 'Automation Engineer',
    careerRankId: 'automation-engineer-2',
    eligibility: { modules: ['M11', 'M12', 'M13', 'M14', 'M15', 'M16'], previousExam: 'CERT-R2', text: 'R2 + M11–M16 complete' },
    written: {
      items: 45,
      minutes: 30,
      passPercent: 85,
      passCount: 39,
      moduleQuotas: { M11: 6, M12: 5, M13: 12, M14: 10, M15: 6, M16: 6 },
      tierMix: { core: 0.8, supporting: 0.2, trivia: 0 },
      criticalFactIds: R3_CRITICAL,
      criticalNotes: 'F198 + F200 (5444, collisions) · F164 (never modify main) · F180 (mandatory screen methods) · F193 (Duo same IP) · F197 (CPA) · F210 (misleading "select print")',
    },
    practical: {
      summary: '4 tasks · 35 min',
      minutes: 35,
      pass: 'All 4 tasks passed',
      tasks: [
        { id: 'P3-1', setup: 'Broken config.properties (port 5555, wrong theme/kernel, empty CFD IP) for a tethered rig.', playerMust: 'Fix the file, reserve the rig, run TaxTest, release the rig.', pass: 'Validator 11/11; test passes; rig Reserved during the run and Available after; no coworker device touched.', factIds: ['F188', 'F189', 'F190', 'F191', 'F192', 'F193', 'F194', 'F195', 'F196', 'F197', 'F198', 'F199', 'F200', 'F201', 'F112', 'F183', 'F184', 'F185', 'F186', 'F187'] },
        { id: 'P3-2', setup: 'Pigeon test with a missing bracket, then a "select print" timeout.', playerMust: 'Fix the JSON; diagnose stale coordinates via the camera; approve the coordinate PR.', pass: 'Build green; diagnosis choice correct.', factIds: ['F208', 'F209', 'F210', 'F211'] },
        { id: 'P3-3', setup: 'Station Duo test using Screen Compare fails after a 10 px shift.', playerMust: 'Replace it with a UIA 2.3 dual-screen assertion; both IPs equal in config.', pass: 'Run green with the layout shifted.', factIds: ['F151', 'F152', 'F153', 'F154', 'F155', 'F156', 'F193'] },
        { id: 'P3-4', setup: 'New screen class without mandatory methods + Flex scroll bug.', playerMust: 'Add waitForScreen() / isScreenPresent(); fix open().', pass: '3 consecutive green runs on a Flex and a Mini.', factIds: ['F177', 'F178', 'F179', 'F180'] },
      ],
    },
    xp: 700,
  },
  {
    id: 'CERT-R4',
    rank: 'R4',
    title: 'Senior Automation Engineer',
    careerRankId: 'senior-automation-engineer',
    eligibility: { modules: ['M17', 'M18'], previousExam: 'CERT-R3', text: 'R3 + M17–M18 complete' },
    written: {
      items: 60,
      minutes: 45,
      passPercent: 85,
      passCount: 51,
      moduleQuotas: each(3),
      extra: { count: 6, rule: 'weakest-modules-core', text: "6 extra core items from the player's weakest modules (lowest Leitner mastery)" },
      tierMix: { core: 0.8, supporting: 0.2, trivia: 0 },
      criticalFactIds: R4_CRITICAL,
      criticalNotes: 'F098 · F229 · F232 · F198 · F107 · F217 · F122 · F171',
    },
    practical: {
      summary: 'Mixed incident shift: 5 incidents in 20 game-min',
      minutes: 20,
      pass: 'All 5 incidents resolved in 20 game-min with ≤ 1 strike (wrong fix, fried hardware, status override, coworker device touched)',
      tasks: [
        { id: 'P4', setup: '5 incidents drawn from the Arcade catalogue (≥ 1 hardware, ≥ 1 Orca, ≥ 1 code/config).', playerMust: 'Resolve all.', pass: 'All resolved in 20 game-min, ≤ 1 strike.', factIds: [] },
      ],
    },
    xp: 1000,
  },
  {
    id: 'CERT-R5',
    rank: 'R5',
    title: 'Lab Lead',
    careerRankId: 'lab-lead',
    eligibility: {
      modules: ALL_MODULES,
      previousExam: 'CERT-R4',
      leitnerMastery: 0.9,
      fullShiftRatio: 0.8,
      text: 'R4 + Leitner mastery ≥ 90 % of all cards in box ≥ 4 + one Arcade "Full Shift" score ≥ 80 %',
    },
    written: {
      items: 80,
      minutes: 60,
      passPercent: 92,
      passCount: 74,
      moduleQuotas: each(4),
      extra: { count: 8, rule: 'trivia-any-module', text: '8 trivia items from any module' },
      tierMix: { core: 0.65, supporting: 0.25, trivia: 0.1 },
      criticalFactIds: R5_CRITICAL,
      criticalNotes: 'All R1–R4 critical facts (each appears once)',
    },
    practical: {
      summary: 'Hard shift: 8 incidents in 30 game-min, no HUD objective text',
      minutes: 30,
      pass: 'All 8 incidents resolved in 30 game-min, 0 strikes',
      tasks: [
        { id: 'P5', setup: '8 incidents drawn from the Arcade catalogue, two simultaneous at minute 10, no HUD objective text.', playerMust: 'Resolve all.', pass: 'All resolved in 30 game-min, 0 strikes.', factIds: [] },
      ],
    },
    xp: 1500,
  },
]);

export const EXAMS_BY_ID: Record<string, ExamBlueprint> = Object.fromEntries(EXAMS.map((e) => [e.id, e]));

/** General draw rules shared by every written exam (Cur §5.2). */
export const EXAM_DRAW_RULES = {
  sampleWithoutReplacement: true,
  avoidPreviousAttemptItems: true,
  excludeIllustrative: true,
  /** At least one item of every type. */
  requireEveryType: ['mc', 'tf', 'order', 'match', 'fill'] as QuizQuestion['type'][],
  /** MC share cap. */
  maxMcFraction: 0.65,
  reshuffleOptions: true,
  onePerFactUnlessQuotaRequires: true,
  /** Module quotas take precedence over the tier mix; critical items count towards their module's quota. */
  quotasBeforeTierMix: true,
} as const;

/** "With distinction": written ≥ 95 % and practical completed with no strikes (gold seal). */
export const DISTINCTION = { writtenPercent: 95, practicalStrikes: 0 } as const;

/** Retake rules (Cur §5.4). */
export const RETAKE_RULES = {
  cooldownRealMinutes: 10,
  requiresLeitnerSessionWithMissedCards: true,
  unlimited: true,
  storageKey: 'labsim.cert.v1',
} as const;

/**
 * Eligible written-exam pool for an exam: non-retired, non-illustrative items of the modules in its quotas.
 * Draw logic (quotas, tier mix, critical items, type coverage) is implemented by missions.
 */
export function examPool(exam: ExamBlueprint, bank: QuizQuestion[]): QuizQuestion[] {
  const modules = new Set(Object.keys(exam.written.moduleQuotas));
  return bank.filter((q) => modules.has(q.moduleId) && !q.illustrative && !q.retired);
}
