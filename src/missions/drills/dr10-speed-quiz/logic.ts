/**
 * DR10 Speed Quiz (GP §2.4.3): 90 s of curriculum quiz items (`Q###`; † items allowed here, Cur §0.2 rule 3),
 * filtered to completed modules and weighted toward the weakest tags (GP §4.8.4 flavour). Every 5th question
 * is a hotspot on a render (MAIN toggle, Park All, the Pi's ACT LED…). A wrong answer shows the item's
 * curriculum explanation as the Teach Card; quiz items carry `questionId`, so the runtime applies the Leitner
 * cross-mode rule (Cur §4.0).
 */
import type { RootState } from '@/core/state';
import { correctAnswerText, QUIZ_BANK, type QuizQuestion } from '@/content';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { completedModules, masteryWeight, filterByRoundTags, recentKeys, weightedPick, type RngState } from '../common/rng';
import { teach } from '../common/teach';

export type HotspotScene = 'power-panel' | 'motion-control' | 'tablet-tabs' | 'pi-board' | 'station-duo' | 'power-wall';

/** Clickable regions per scene (the View draws them; ids must match). */
export const SCENE_REGIONS: Record<HotspotScene, readonly string[]> = {
  'power-panel': ['led-1', 'led-2', 'main', 'motor', 'logo'],
  'motion-control': ['steppers-enable', 'steppers-disable', 'park-all', 'park-xy', 'park-x', 'park-y', 'dip-in', 'dip-out', 'tap-in', 'tap-out', 'phone-forward', 'phone-back', 'phone-power', 'sol-down', 'sol-up', 'sol-lower', 'sol-raise'],
  'tablet-tabs': ['tab-robot', 'tab-control', 'tab-motion', 'header-name', 'header-status'],
  'pi-board': ['led-act', 'led-pwr', 'eth', 'usb', 'power-in', 'hdmi', 'gpio'],
  'station-duo': ['mfd', 'cfd', 'printer'],
  'power-wall': ['meanwell', 'rail24', 'reg12', 'reg5', 'fuse5', 'ac-strip'],
};

export interface QuizData {
  kind: 'quiz';
  questionId: string;
  /** Generic `{prompt, options, answer}` payload (also lets the UI's generic drill board render it). */
  prompt: string;
  options: string[];
  answer: number;
  moduleId: string;
}

export interface HotspotData {
  kind: 'hotspot';
  scene: HotspotScene;
  prompt: string;
  target: string;
  /** Label of the target (reveal). */
  label: string;
}

export type SpeedData = QuizData | HotspotData;

interface Hot {
  key: string;
  scene: HotspotScene;
  prompt: string;
  target: string;
  label: string;
  why: string;
  facts: string[];
  tags: string[];
  module: string;
  ref: string;
  illustrative?: boolean;
}

export const HOTSPOTS: readonly Hot[] = [
  { key: 'main', scene: 'power-panel', prompt: 'Click the MAIN toggle on the POWER panel', target: 'main', label: 'MAIN toggle', why: 'The touch-robot POWER panel has two green LEDs and two toggle switches labelled MAIN and MOTOR.', facts: ['F236'], tags: ['lab.orientation'], module: 'M01', ref: 'Ref photos (IMG-T)' },
  { key: 'motor', scene: 'power-panel', prompt: 'Click the MOTOR toggle', target: 'motor', label: 'MOTOR toggle', why: 'POWER panel: two green LEDs, toggles MAIN and MOTOR. Never toggle MOTOR on a rig that is running a test.', facts: ['F236'], tags: ['lab.orientation', 'hw.motion'], module: 'M01', ref: 'Ref photos (IMG-T)' },
  { key: 'park-all', scene: 'motion-control', prompt: 'The banner is yellow after a manual arm move. Click the one button that clears it.', target: 'park-all', label: 'Park → Park All', why: 'Park All drives the steppers back to the limit switches at (0,0), clearing the error and turning the banner green. Park XY / X / Y only home those axes.', facts: ['F231', 'F232'], tags: ['hw.motion', 'hw.tablet'], module: 'M04', ref: 'Ref §6.4' },
  { key: 'enable', scene: 'motion-control', prompt: 'The arm won\'t move: the steppers were disabled. Click the button that re-energises them.', target: 'steppers-enable', label: 'Steppers → Enable', why: 'The Steppers group has Enable / Disable; disabled steppers cannot move the gantry until enabled again.', facts: ['F235'], tags: ['hw.motion', 'hw.tablet'], module: 'M04', ref: 'Ref photos (IMG-T)' },
  { key: 'sol-down', scene: 'motion-control', prompt: 'Fire the solenoid tap: click the button that drops the plunger', target: 'sol-down', label: 'Solenoid → Down', why: 'The Solenoid group has Down / Up / Lower / Raise; Down drops the plunger onto the screen, Up lifts it.', facts: ['F235', 'F080'], tags: ['hw.motion', 'hw.tablet'], module: 'M04', ref: 'Ref photos (IMG-T)' },
  { key: 'dip-in', scene: 'motion-control', prompt: 'Swing the dip arm\'s card into the chip slot', target: 'dip-in', label: 'Dip → In', why: 'The Dip group (In / Out) swings the rotating dip arm and its ribbon card into the chip slot and back.', facts: ['F235', 'F241'], tags: ['hw.motion'], module: 'M04', ref: 'Ref photos (IMG-G)' },
  { key: 'tab-motion', scene: 'tablet-tabs', prompt: 'Which tab holds the Park buttons? Click it.', target: 'tab-motion', label: 'Motion Control tab', why: 'The status tablet has three tabs — Robot, Robot Control and Motion Control; the Park, Steppers, Dip, Tap, Phone and Solenoid groups live on Motion Control.', facts: ['F234', 'F235'], tags: ['hw.tablet'], module: 'M04', ref: 'Ref photos (IMG-T)' },
  { key: 'hrn', scene: 'tablet-tabs', prompt: 'Click the Human Readable Name Orca pushes to this tablet', target: 'header-name', label: 'WALL-E (header)', why: 'The tablet header shows the robot\'s Human Readable Name — the display string Orca pushes to the front status tablet.', facts: ['F118', 'F233'], tags: ['orca.names', 'hw.tablet'], module: 'M07', ref: 'Ref §3.2' },
  { key: 'act', scene: 'pi-board', prompt: 'Click the Pi\'s green ACT (activity) LED', target: 'led-act', label: 'ACT LED (green)', why: 'A Raspberry Pi has a red PWR LED and a green ACT LED; a dark board with no LEDs points at power (fuse, regulator), not software.', facts: ['F063'], tags: ['hw.pi'], module: 'M05', ref: 'Ref §1.5', illustrative: true },
  { key: 'eth', scene: 'pi-board', prompt: 'The Pi is up but unreachable. Click the port to check first.', target: 'eth', label: 'Ethernet port', why: 'Orca\'s 5-minute health ping reaches the Pi over the network: a lit Pi that fails the ping → check its Ethernet lead.', facts: ['F099', 'F107'], tags: ['hw.pi', 'orca.healthcheck'], module: 'M06', ref: 'Ref §3', illustrative: true },
  { key: 'mfd', scene: 'station-duo', prompt: 'Station Duo: click the display ADB can see', target: 'mfd', label: 'Primary MFD', why: 'On the Station Duo one terminal drives two displays, but only the primary MFD is exposed to ADB; legacy UI Automator was blind to the CFD.', facts: ['F151', 'F152'], tags: ['duo.ocr'], module: 'M16', ref: 'Ref §3.2' },
  { key: 'cfd', scene: 'station-duo', prompt: 'Station Duo: click the display the OCR workaround (webcam + Tesseract) watches', target: 'cfd', label: 'Secondary CFD', why: 'Screen Compare / OCR exists because the CFD is ADB-blind: the webcam captures it, the Pi crops to the box and runs Tesseract.', facts: ['F150', 'F153', 'F154'], tags: ['duo.ocr', 'orca.screencompare'], module: 'M16', ref: 'Ref §3.2' },
  { key: 'strip', scene: 'power-wall', prompt: 'Where does a new Flex 4 power brick plug in? Click it.', target: 'ac-strip', label: 'Commercial AC power strip', why: 'LabSim devices draw an irregular 18 V — LabSim terminals and Collis probes bypass the DC rails and plug into commercial AC power strips.', facts: ['F228', 'F229'], tags: ['power.18v'], module: 'M03', ref: 'Ref §6.3' },
  { key: 'reg5', scene: 'power-wall', prompt: 'Click the regulator that feeds the Raspberry Pis', target: 'reg5', label: '5 V DC 10 A regulator', why: 'Step-down regulators split the 24 V rail: 12 V DC for the NUCs, 5 V DC 10 A for the Pis.', facts: ['F086', 'F227'], tags: ['power.rails'], module: 'M03', ref: 'Ref §6.3' },
  { key: 'meanwell', scene: 'power-wall', prompt: 'Click the part that turns 120 V AC into the 24 V DC rail', target: 'meanwell', label: 'Mean Well transformer', why: 'Mean Well transformers convert 120 V AC wall power to the central 24 V DC rail.', facts: ['F074', 'F227'], tags: ['power.rails'], module: 'M03', ref: 'Ref §1.5' },
  { key: 'fuse', scene: 'power-wall', prompt: 'Rack B\'s Pis went dark. Click what you test first with the multimeter.', target: 'fuse5', label: 'Rack B 5 V inline fuse', why: 'Inline fuses protect the DC lines; a dark Pi shelf with a healthy regulator points at the 5 V inline fuse.', facts: ['F087'], tags: ['power.fuses'], module: 'M03', ref: 'Ref §1.5' },
];

/** Quiz items eligible for the Speed Quiz: single-answer MC and TF (fast to read and answer). */
export function speedQuizPool(state: RootState | null): QuizQuestion[] {
  const done = completedModules(state);
  return QUIZ_BANK.filter((q) => !q.retired && (q.type === 'mc' || q.type === 'tf') && typeof q.answer === 'number' && !q.answers?.length && (q.options?.length ?? 0) >= 2 && (!done || done.has(q.moduleId)));
}

export function quizItem(q: QuizQuestion): DrillItem<QuizData> {
  return {
    id: `DR10:${q.id}`,
    tags: q.tags,
    factIds: q.factIds,
    questionId: q.id,
    teach: teach(`Answer: ${correctAnswerText(q)}`, q.explanation, { factIds: q.factIds, illustrative: q.illustrative, ref: q.id, doInstead: 'Review the fact in the Field Manual.', tag: q.tags[0] }),
    data: { kind: 'quiz', questionId: q.id, prompt: q.prompt, options: [...(q.options ?? [])], answer: q.answer ?? 0, moduleId: q.moduleId },
  };
}

export function hotspotItem(h: Hot): DrillItem<HotspotData> {
  return {
    id: `DR10:hot:${h.key}`,
    tags: h.tags,
    factIds: h.facts,
    teach: teach(`It's the ${h.label}`, h.why, { factIds: h.facts, ref: h.ref, illustrative: h.illustrative, tag: h.tags[0] }),
    data: { kind: 'hotspot', scene: h.scene, prompt: h.prompt, target: h.target, label: h.label },
  };
}

export function generateSpeed(rng: RngState, state: RootState | null, index: number): DrillItem<SpeedData> {
  const done = completedModules(state);
  const recent = recentKeys(state, 30);
  if (index % 5 === 4) {
    const hots = HOTSPOTS.filter((h) => !done || done.has(h.module));
    const fresh = hots.filter((h) => !recent.includes(`DR10:hot:${h.key}`));
    const pool = fresh.length ? fresh : hots.length ? hots : HOTSPOTS;
    return hotspotItem(weightedPick(rng, pool, (h) => masteryWeight(state, h.tags)));
  }
  const all = speedQuizPool(state);
  const tagged = filterByRoundTags(state, all, (q) => q.tags);
  const fresh = tagged.filter((q) => !recent.includes(`DR10:${q.id}`));
  const pool = fresh.length ? fresh : tagged.length ? tagged : QUIZ_BANK.filter((q) => q.type === 'mc');
  const q = weightedPick(rng, pool, (x) => masteryWeight(state, x.tags));
  return quizItem(q);
}

export const DR10: DrillDef<SpeedData> = {
  id: 'DR10',
  name: 'Speed Quiz',
  format: 'Rapid MCQ from the curriculum quiz bank; every 5th question is a hotspot on a render; 90 s',
  tags: ['lab.orientation', 'orca.status', 'power.rails', 'uia.pom'],
  unlockedBy: ['M01'],
  durationS: 90,
  itemCount: null,
  medals: { bronze: 1000, silver: 2000, gold: 3000 },
  scoring: 'standard',
  generate: (rng, state, index) => generateSpeed(rng, state, index),
  component: lazyDrill(() => import('./View'), '#63d443'),
};
