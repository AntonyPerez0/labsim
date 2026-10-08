/**
 * DR09 Pipeline Order (GP §2.4.3): order the cards of a flow — the Tax test, the architecture (Jenkins →
 * Orca → Pi → device), the power chain, the OCR check, the dip-card flow and the Laz OOBE. 4 sequences, 90 s.
 *
 * Unlocks: the architecture set at M06, every set at M14 (GP §2.4.2); the OCR set also needs M16 (where it
 * is taught). Scoring (custom, GP §2.4.1 flavour): +30 per card in the right slot, +120 for a perfect order,
 * a speed bonus for perfect orders (8 pts per second under 30 s), all × the streak multiplier.
 *
 * Architecture note: the spec's "runner starts" card is folded into the Jenkins card — Ref §2 draws both
 * "triggers the runner" and "checks out a robot" as arrows from Jenkins, and Q112 orders trigger → checkout
 * → runner REST calls (F094–F096), so the drill never asks to order two simultaneous Jenkins actions.
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { moduleUnlocked, recentKeys, shuffle, weightedPick, masteryWeight, type RngState } from '../common/rng';
import { streakMultiplier } from '../common/scoring';
import { teach } from '../common/teach';

export interface SeqData {
  setId: SeqSetId;
  title: string;
  /** Correct order. */
  steps: string[];
  /** Presentation order: indices into `steps`. */
  tray: number[];
}

export type SeqSetId = 'tax' | 'arch' | 'power' | 'ocr' | 'dip' | 'laz';

interface SeqSet {
  id: SeqSetId;
  title: string;
  steps: string[];
  why: string;
  tags: string[];
  facts: string[];
  ref: string;
  /** Modules that must be complete (any empty profile = all unlocked). */
  needs: string[];
  illustrative?: boolean;
}

export const SEQ_SETS: readonly SeqSet[] = [
  {
    id: 'tax',
    title: 'The tethered Tax test',
    steps: [
      'Start explicitly on HomeScreen',
      'MFD_O1 — open Register, add “Tax Item 5”, tap “Review Order” (Orca → Callus loads the swipe card)',
      'CFD_O1 — assert subtotal $10.00, tax $0.83, total $10.83',
      'MFD_O2 — tap “Pay”, then “Charge”',
      'Step 4 — the payment prompt is finalised on the CFD',
      'Teardown — force both devices back to HomeScreen',
    ],
    why: 'Every test starts on HomeScreen; MFD_O1 rings up Tax Item 5 and Review Order (Orca → Callus loads the swipe card); CFD_O1 asserts the totals; MFD_O2 pays and charges; Step 4 finalises on the CFD; teardown returns to HomeScreen.',
    tags: ['uia.taxtest', 'uia.multidevice'],
    facts: ['F182', 'F183', 'F184', 'F185', 'F186', 'F187'],
    ref: 'Ref §4.4',
    needs: ['M14'],
  },
  {
    id: 'arch',
    title: 'Architecture: from Jenkins to the glass',
    steps: [
      'Jenkins triggers the pipeline and injects env vars into the runner (uia-remote / Pigeon)',
      'Jenkins checks out a robot from Orca',
      'The runner calls Orca REST (xy_touch, card swipe/dip/tap)',
      'Orca looks up the mm coordinates in MySQL',
      'The Pi Robot Controller fires an ADB touch or a mechanical tap',
      'The LabSim device reacts',
    ],
    why: 'Jenkins (Executor) triggers and injects env vars, checks out a robot from Orca (Controller); the runner calls Orca over REST; Orca looks up millimetre coordinates in MySQL and tells the Pi to fire an ADB touch or a physical tap.',
    tags: ['arch.flow', 'orca.xytouch'],
    facts: ['F094', 'F095', 'F096', 'F143', 'F144'],
    ref: 'Ref §2, §3.2',
    needs: ['M06'],
  },
  {
    id: 'power',
    title: 'The power chain',
    steps: ['120 V AC wall power', 'Mean Well transformer', '24 V DC rail', 'Step-down regulator', 'Inline fuse', 'Pi (5 V 10 A) / NUC (12 V)'],
    why: '120 V AC enters a Mean Well transformer, drops to the central 24 V DC rail; step-down regulators split it into 12 V (NUCs) and 5 V 10 A (Pis), protected by inline fuses. LabSim devices and Collis probes skip all of this and use AC strips.',
    tags: ['power.rails', 'power.fuses'],
    facts: ['F227', 'F074', 'F085', 'F086', 'F087'],
    ref: 'Ref §6',
    needs: ['M14', 'M03'],
  },
  {
    id: 'ocr',
    title: 'Screen Compare / OCR check',
    steps: ['Screen Compare row: CFD box + expected text', 'Pi captures a webcam screenshot', 'Crop to the bounding box', 'Run Tesseract OCR', 'Return a boolean match'],
    why: 'The Screen Compare Image stores the CFD bounding box and the expected text; the Robot Controller captures a webcam screenshot, crops it to the box, runs Tesseract OCR and returns a boolean match.',
    tags: ['orca.screencompare', 'vision.tesseract'],
    facts: ['F153', 'F154', 'F029'],
    ref: 'Ref §3.2',
    needs: ['M14', 'M16'],
  },
  {
    id: 'dip',
    title: 'A virtual card dip',
    steps: [
      'Card Profile stores a Gort path',
      'Scheduled task GortCardSync clones the Gort cards to the Windows box',
      'The test requests a dip',
      'Callus maps the path and loads the virtual card',
      'The Collis probe presents it to the card reader',
    ],
    why: 'Dip/Tap profiles store paths into Gort; a scheduled job clones the card files onto the Windows boxes; during the run Callus maps the path and loads the virtual card, and the Collis probe feeds the reader.',
    tags: ['cards.diptap', 'cards.callus'],
    facts: ['F147', 'F148', 'F149', 'F097'],
    ref: 'Ref §3.2, §2',
    needs: ['M14', 'M10'],
    illustrative: true,
  },
  {
    id: 'laz',
    title: 'Laz OOBE merchant swap',
    steps: ['ubi: routing merchant switch', 'laz: de-provision', 'laz: wipe caches', 'laz: setup wizard', 'laz: merchant active'],
    why: 'Ubi routes the merchant switch; Laz\'s zero-touch OOBE then de-provisions the hardware, wipes local caches and steps through the setup wizard until the new merchant is active.',
    tags: ['laz.oobe', 'ubi.routing'],
    facts: ['F046', 'F047', 'F051'],
    ref: 'Ref §1',
    needs: ['M14', 'M08'],
    illustrative: true,
  },
];

export const SEQ_BY_ID: Readonly<Record<SeqSetId, SeqSet>> = Object.fromEntries(SEQ_SETS.map((s) => [s.id, s])) as Record<SeqSetId, SeqSet>;

export function setUnlocked(state: RootState | null, s: SeqSet): boolean {
  return s.needs.every((m) => moduleUnlocked(state, m));
}

export function seqItem(s: SeqSet, rng: RngState): DrillItem<SeqData> {
  let tray = shuffle(rng, s.steps.map((_, i) => i));
  // Never present the cards already in order.
  if (tray.every((v, i) => v === i)) tray = [...tray.slice(1), tray[0]!];
  return {
    id: `DR09:${s.id}`,
    tags: s.tags,
    factIds: s.facts,
    teach: teach(`Order: ${s.steps.map((x) => x.split(' — ')[0]!.split(' (')[0]).join(' → ')}`, s.why, { ref: s.ref, factIds: s.facts, illustrative: s.illustrative, tag: s.tags[0] }),
    data: { setId: s.id, title: s.title, steps: s.steps, tray },
  };
}

/** Number of cards in their correct slot (`placed[i]` = index into steps). */
export function slotsCorrect(placed: readonly number[]): number {
  return placed.reduce((n, v, i) => n + (v === i ? 1 : 0), 0);
}

/** Custom points for one sequence. */
export function sequencePoints(placed: readonly number[], total: number, seconds: number, streakBefore: number): { points: number; perfect: boolean } {
  const k = slotsCorrect(placed);
  const perfect = k === total && placed.length === total;
  const speed = perfect ? Math.max(0, Math.round(8 * (30 - seconds))) : 0;
  const base = 30 * k + (perfect ? 120 : 0) + speed;
  return { points: Math.round(base * (perfect ? streakMultiplier(streakBefore) : 1)), perfect };
}

export function generateSeq(rng: RngState, state: RootState | null, _index: number): DrillItem<SeqData> {
  const open = SEQ_SETS.filter((s) => setUnlocked(state, s));
  const pool = open.length ? open : [SEQ_BY_ID.arch];
  const recent = recentKeys(state, Math.min(3, pool.length - 1));
  const fresh = pool.filter((s) => !recent.includes(`DR09:${s.id}`));
  const s = weightedPick(rng, fresh.length ? fresh : pool, (x) => masteryWeight(state, x.tags));
  return seqItem(s, rng);
}

export const DR09: DrillDef<SeqData> = {
  id: 'DR09',
  name: 'Pipeline Order',
  format: 'Order cards (Tax test, architecture, power chain, OCR check, dip-card flow, Laz OOBE); 4 sequences, 90 s',
  tags: ['uia.taxtest', 'arch.flow', 'power.rails', 'orca.screencompare', 'cards.diptap', 'laz.oobe'],
  unlockedBy: ['M06', 'M14'],
  durationS: 90,
  itemCount: 4,
  medals: { bronze: 700, silver: 1300, gold: 1900 },
  scoring: 'custom',
  tagUnlocks: { M06: ['arch.flow'], M14: ['uia.taxtest', 'power.rails', 'orca.screencompare', 'cards.diptap', 'laz.oobe'] },
  generate: (rng, state, index) => generateSeq(rng, state, index),
  component: lazyDrill(() => import('./View'), '#f2c94c'),
};
