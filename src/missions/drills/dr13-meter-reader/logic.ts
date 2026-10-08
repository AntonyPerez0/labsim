/**
 * DR13 Meter Reader (GP §2.4.3): a multimeter reading at a probe point on the power chain → the fault.
 * Power chain (Ref §6, F227): 120 V AC wall → Mean Well → 24 V DC rail → step-down regulators → 12 V DC
 * (NUCs) / 5 V DC 10 A (Pis), protected by inline fuses; LabSim devices (18 V) and Collis probes use
 * commercial AC strips. Readings/values are [illus.] (Cur M03); the logic is the reference's.
 */
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { teach } from '../common/teach';

/** Nodes of the chain diagram; `probe` marks where the leads are. */
export type ChainNode = 'wall' | 'meanwell' | 'rail' | 'reg5' | 'reg12' | 'fuse5' | 'fuse12' | 'pi' | 'nuc' | 'strip' | 'lab';

export interface MeterReading {
  /** Where the leads are. */
  at: ChainNode;
  label: string;
  mode: 'V⎓' | 'V~' | 'Ω';
  value: string;
}

export interface MeterData {
  scenario: string;
  readings: MeterReading[];
  /** Circuit energised while measuring. */
  powered: boolean;
  options: string[];
  answer: number;
  /** The branch shown in the diagram. */
  branch: '5v' | '12v' | 'strip';
}

export const ANS = {
  healthy24: 'Healthy — the 24 V rail is fine',
  blownFuse: 'Blown inline fuse',
  upstream: 'Upstream problem — nothing is reaching the regulator',
  fuseOpen: 'Fuse is open (blown)',
  fuseGood: 'Fuse is good (continuity)',
  stopOhms: 'Stop — never measure resistance on a powered circuit',
  regDead: 'Step-down regulator dead',
  meanwellDead: 'Mean Well (24 V supply) failed',
  healthy12: 'Healthy — 12 V reaches the NUC',
  piSide: 'Power reaches the Pi — the fault is not on the power path',
  normal18: 'Normal — LabSim gear runs from its own PSU on the AC strip (18 V)',
  wrongRail: 'Wrong — it should be fed from the 24 V DC rail',
  regOk: 'Regulator healthy',
} as const;

let n = 0;
function m(
  scenario: string,
  readings: MeterReading[],
  correct: string,
  distractors: string[],
  why: string,
  o: { facts: string[]; tags: string[]; powered?: boolean; branch?: MeterData['branch']; illustrative?: boolean; doInstead?: string },
): DrillItem<MeterData> {
  n++;
  return {
    id: `DR13-${String(n).padStart(2, '0')}`,
    tags: o.tags,
    factIds: o.facts,
    teach: teach(`Answer: ${correct}`, why, { ref: 'Ref §6', factIds: o.facts, illustrative: o.illustrative, doInstead: o.doInstead, tag: o.tags[0] }),
    data: { scenario, readings, powered: o.powered ?? true, options: [correct, ...distractors], answer: 0, branch: o.branch ?? '5v' },
  };
}

export const METER_ITEMS: readonly DrillItem<MeterData>[] = [
  m('Rack B rigs are Connection Failed. First reading, at the Mean Well output:', [{ at: 'meanwell', label: 'MW-1 output', mode: 'V⎓', value: '24.1' }], ANS.healthy24, [ANS.meanwellDead, ANS.blownFuse, ANS.upstream], 'The Mean Well converts 120 V AC to the central 24 V DC rail — 24.1 V means the rail is fine; keep probing downstream.', {
    facts: ['F074', 'F227'],
    tags: ['power.rails'],
    illustrative: true,
  }),
  m('Rack B, the 5 V branch. Two readings:', [
    { at: 'reg5', label: '5 V regulator output', mode: 'V⎓', value: '5.08' },
    { at: 'pi', label: 'Pi side of the Rack B fuse', mode: 'V⎓', value: '0.00' },
  ], ANS.blownFuse, [ANS.regDead, ANS.upstream, ANS.piSide], '5 V before the fuse and 0 V after it: the inline fuse protecting the 5 V 10 A Pi line is open.', { facts: ['F086', 'F087'], tags: ['power.fuses'], illustrative: true }),
  m('You removed the Rack B fuse with the regulator input OFF. Ω mode across the fuse:', [{ at: 'fuse5', label: 'Fuse (removed, power off)', mode: 'Ω', value: 'OL' }], ANS.fuseOpen, [ANS.fuseGood, ANS.stopOhms, ANS.regDead], 'OL (over limit) = no continuity: the fuse element is broken. Replace it with the same rating.', {
    facts: ['F087'],
    tags: ['power.fuses'],
    powered: false,
    illustrative: true,
  }),
  m('A spare fuse, out of the circuit, power off. Ω mode:', [{ at: 'fuse5', label: 'Spare fuse (power off)', mode: 'Ω', value: '0.1' }], ANS.fuseGood, [ANS.fuseOpen, ANS.stopOhms, ANS.blownFuse], 'Near-zero resistance means continuity — the fuse is good.', { facts: ['F087'], tags: ['power.fuses'], powered: false, illustrative: true }),
  m('NUC-03 will not boot. The 12 V branch:', [
    { at: 'nuc', label: 'At the NUC', mode: 'V⎓', value: '0.0' },
    { at: 'reg12', label: '12 V regulator input', mode: 'V⎓', value: '0.0' },
  ], ANS.upstream, [ANS.blownFuse, ANS.regDead, ANS.healthy12], 'No voltage even at the regulator input: the problem is upstream (24 V rail / Mean Well), not the fuse or the regulator.', {
    facts: ['F085', 'F227'],
    tags: ['power.rails'],
    branch: '12v',
    illustrative: true,
  }),
  m('The fuse is still in its holder and the regulator input is ON. You switch the meter to Ω and touch the fuse…', [{ at: 'fuse5', label: 'Fuse in circuit (LIVE)', mode: 'Ω', value: '— —' }], ANS.stopOhms, [ANS.fuseGood, ANS.fuseOpen, ANS.blownFuse], 'Never measure resistance on a powered circuit: switch the regulator input off and pull the fuse first, then measure Ω.', {
    facts: ['F087'],
    tags: ['power.fuses'],
    illustrative: true,
    doInstead: 'Power off, remove the fuse, then measure Ω.',
  }),
  m('The NUC branch:', [
    { at: 'reg12', label: '12 V regulator output', mode: 'V⎓', value: '12.02' },
    { at: 'nuc', label: 'NUC side of the 12 V fuse', mode: 'V⎓', value: '12.00' },
  ], ANS.healthy12, [ANS.blownFuse, ANS.upstream, ANS.regDead], 'A step-down regulator provides the 12 V DC line for the Intel NUCs; 12 V on both sides of the fuse = healthy.', { facts: ['F085', 'F087'], tags: ['power.rails'], branch: '12v', illustrative: true }),
  m('Rack A, the 5 V branch:', [
    { at: 'reg5', label: '5 V regulator input', mode: 'V⎓', value: '24.0' },
    { at: 'reg5', label: '5 V regulator output', mode: 'V⎓', value: '0.00' },
  ], ANS.regDead, [ANS.blownFuse, ANS.upstream, ANS.healthy24], '24 V in but nothing out: the step-down regulator itself has failed.', { facts: ['F086'], tags: ['power.rails'], illustrative: true }),
  m('Everything on the DC side is dead. Readings:', [
    { at: 'wall', label: 'Wall outlet', mode: 'V~', value: '120' },
    { at: 'meanwell', label: 'Mean Well output', mode: 'V⎓', value: '0.0' },
  ], ANS.meanwellDead, [ANS.upstream, ANS.regDead, ANS.blownFuse], '120 V AC reaches the Mean Well but no 24 V DC comes out — the Mean Well transformer is the fault.', { facts: ['F074', 'F227'], tags: ['power.rails'], illustrative: true }),
  m('JOHNNY-5 is Connection Failed but its Pi LEDs are on. 5 V branch:', [
    { at: 'reg5', label: '5 V regulator output', mode: 'V⎓', value: '5.07' },
    { at: 'pi', label: 'Pi side of the fuse', mode: 'V⎓', value: '5.06' },
  ], ANS.piSide, [ANS.blownFuse, ANS.regDead, ANS.upstream], 'Power is fine all the way to the Pi — look at the network cable, the Pi itself or Callus instead.', { facts: ['F086', 'F087'], tags: ['power.rails', 'hw.pi'], illustrative: true }),
  m("A Flex 4's power brick, plugged into the commercial AC strip. Output of the brick:", [{ at: 'lab', label: 'LabSim PSU brick output', mode: 'V⎓', value: '18.2' }], ANS.normal18, [ANS.wrongRail, ANS.regDead, ANS.blownFuse], 'LabSim devices draw an irregular 18 V, so LabSim terminals (and Collis probes) bypass the DC rails entirely and plug into commercial AC power strips.', {
    facts: ['F228', 'F229'],
    tags: ['power.18v'],
    branch: 'strip',
    illustrative: true,
  }),
  m('A Collis probe PSU: where should it be plugged in, given this reading at the strip?', [{ at: 'strip', label: 'AC power strip socket', mode: 'V~', value: '120' }], 'On the commercial AC power strip — never the DC rails', [ANS.wrongRail, 'On the 12 V NUC line', 'On the 5 V 10 A Pi line'], 'Expensive Collis probes bypass the custom DC rails and plug into commercial AC power strips to prevent frying components.', {
    facts: ['F229'],
    tags: ['power.18v', 'hw.collis'],
    branch: 'strip',
  }),
  m('Rack A, 5 V branch, after a fuse swap:', [
    { at: 'reg5', label: '5 V regulator output', mode: 'V⎓', value: '5.09' },
    { at: 'fuse5', label: 'Pi side of the new fuse', mode: 'V⎓', value: '5.08' },
  ], 'Fixed — 5 V reaches the Pis', [ANS.blownFuse, ANS.regDead, ANS.upstream], 'The 5 V DC 10 A line feeds the Pis through the inline fuse; 5 V after the fuse means the repair worked — wait for the Pis to boot and the next health check.', {
    facts: ['F086', 'F087'],
    tags: ['power.fuses'],
    illustrative: true,
  }),
];

export const DR13: DrillDef<MeterData> = {
  id: 'DR13',
  name: 'Meter Reader',
  format: 'Multimeter reading at a probe point → fault',
  tags: ['power.rails', 'power.fuses', 'hw.pi', 'power.18v'],
  unlockedBy: ['M03'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 700, silver: 1300, gold: 1900 },
  scoring: 'standard',
  items: METER_ITEMS,
  component: lazyDrill(() => import('./View'), '#f5b301'),
};
