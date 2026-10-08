/** Fault catalogue §4.3.2 — power (core). */
import type { LabState } from '../../types';
import type { CoreFaultDef } from './helpers';
import { info, nothing, num, ok, p, str, w } from './helpers';

const FUSES_5V = ['F-RACKA-5V', 'F-RACKB-5V', 'F-BENCH-5V'];
const FUSES = [...FUSES_5V, 'F-NUC-12V'];
const REGULATORS = ['REG-5V-A', 'REG-5V-B', 'REG-5V-BENCH', 'REG-12V'];
const OUTLETS = ['WALL-1', 'WALL-2', 'WALL-3', 'WALL-4', 'WALL-5', 'WALL-6'];

const invalid = (id: string, name: string, v: string, reason: string) => ({ ok: false as const, error: `fault ${id}: invalid param ${name}='${v}' (${reason})` });

function fuseOk(lab: LabState, id: string): boolean {
  const f = lab.power.fuses[id];
  return !!f && !f.blown && !(f.removed ?? false);
}

export const POWER_FAULTS: CoreFaultDef[] = [
  {
    info: info('fuse.blown', 'Inline fuse blown', 'power', [p('fuse', 'fuse', 'F-RACKA-5V, F-RACKB-5V, F-BENCH-5V or F-NUC-12V; @random = the three 5 V fuses', { required: true, target: true, values: FUSES, example: 'F-RACKB-5V' })], {
      tags: ['power.fuses', 'power.rails', 'hw.pi', 'orca.status.connfailed'],
      clears: '!blown && !removed, hold 20 000 ms',
      symptoms: ['its rail reads 0 V: every load on the branch unpowered (Rack B: Pis .15–.18 and camera Pi .40 dark)', 'all their rigs connect timed out with the same timestamp', 'tablets grey', 'F-RACKB-5V.load 0.00 V DC, fuse removed Ω OL', 'ROSIE returns to Unavailable on recovery'],
      usedBy: ['INC03', 'M03', 'P1-2', 'FP'],
      holdMs: 20_000,
    }),
    randomPools: { fuse: FUSES_5V },
    validate(lab, params) {
      const id = str(params.fuse);
      const f = lab.power.fuses[id];
      if (!f) return invalid('fuse.blown', 'fuse', id, 'no such fuse');
      if (f.blown) return nothing('fuse.blown', `${id} is already blown`);
      if (f.removed) return nothing('fuse.blown', `${id} holder is empty`);
      return ok(id);
    },
    apply(lab, ctx, params, record) {
      const id = str(params.fuse);
      w(lab, record, ['power', 'fuses', id, 'blown'], true);
      w(lab, record, ['power', 'fuses', id, 'stress'], 5.0);
      ctx.emit('power.fuseBlown', { fuseId: id, railId: lab.power.fuses[id]!.railId, currentA: lab.power.rails[lab.power.fuses[id]!.railId]?.currentA ?? 0 });
    },
    isResolved: (lab, f) => fuseOk(lab, f.target),
  },
  {
    info: info('fuse.underRated', 'Under-rated fuse fitted', 'power', [p('fuse', 'fuse', 'Any inline fuse', { required: true, target: true, values: FUSES, example: 'F-RACKB-5V' }), p('ratingA', 'number', 'Rating of the blade fitted (the holder label is unchanged)', { default: 5, values: ['5', '10', '15', '20'] })], {
      tags: ['power.fuses'],
      clears: 'ratingA == labelA && !blown && !removed, hold 20 000 ms',
      symptoms: ["under-rated: blows in ≈ 6 s under the rack's load, then as fuse.blown", 'over-rated values never blow (flagged by the review)'],
      usedBy: ['FP', 'DR13'],
      holdMs: 20_000,
    }),
    randomPools: { fuse: FUSES_5V },
    validate(lab, params) {
      const id = str(params.fuse);
      const f = lab.power.fuses[id];
      if (!f) return invalid('fuse.underRated', 'fuse', id, 'no such fuse');
      const r = num(params.ratingA, 5);
      if (![5, 10, 15, 20].includes(r)) return invalid('fuse.underRated', 'ratingA', String(params.ratingA), 'not one of 5, 10, 15, 20');
      if (f.blown || f.removed) return nothing('fuse.underRated', `${id} is blown or removed`);
      if (f.ratingA !== (f.labelA ?? f.ratingA)) return nothing('fuse.underRated', `${id} already carries a ${f.ratingA} A blade`);
      if (r === f.ratingA) return nothing('fuse.underRated', `${id} is already ${r} A`);
      return ok(id);
    },
    apply(lab, _ctx, params, record) {
      const id = str(params.fuse);
      w(lab, record, ['power', 'fuses', id, 'ratingA'], num(params.ratingA, 5));
      w(lab, record, ['power', 'fuses', id, 'stress'], 0);
    },
    isResolved(lab, f) {
      const fu = lab.power.fuses[f.target];
      return !!fu && fu.ratingA === (fu.labelA ?? fu.ratingA) && fuseOk(lab, f.target);
    },
  },
  {
    info: info('power.regulatorOff', 'Regulator input switched off', 'power', [p('regulator', 'regulator', 'REG-5V-A, REG-5V-B, REG-5V-BENCH or REG-12V', { required: true, target: true, values: REGULATORS, example: 'REG-5V-B' })], {
      tags: ['power.rails'],
      clears: 'inputSwitch',
      symptoms: ['as fuse.blown for the branch, but REG-*.out reads 0.00 V and the fuse Ω reads 0.1 Ω (de-energised)'],
      usedBy: ['FP', 'DR13'],
    }),
    validate(lab, params) {
      const id = str(params.regulator);
      const r = lab.power.regulators[id];
      if (!r) return invalid('power.regulatorOff', 'regulator', id, 'no such regulator');
      if (!r.inputSwitch) return nothing('power.regulatorOff', `${id} input is already off`);
      return ok(id);
    },
    apply(lab, ctx, params, record) {
      const id = str(params.regulator);
      w(lab, record, ['power', 'regulators', id, 'inputSwitch'], false);
      ctx.emit('power.regulatorToggled', { regulatorId: id, on: false });
    },
    isResolved: (lab, f) => !!lab.power.regulators[f.target]?.inputSwitch,
  },
  {
    info: info('power.outletDead', 'Wall outlet dead', 'power', [p('outlet', 'outlet', 'WALL-1 … WALL-6', { required: true, target: true, values: OUTLETS, example: 'WALL-3' })], {
      tags: ['power.rails'],
      clears: 'outlets[outlet].live || outlets[outlet].plugged == null',
      symptoms: ['everything downstream unpowered', 'WALL-1 = MW-1 ⇒ every DC rail 0 V (all Pis, NUC-03, every MOTOR)'],
      usedBy: ['FP'],
    }),
    validate(lab, params) {
      const id = str(params.outlet);
      const o = lab.power.outlets[id];
      if (!o) return invalid('power.outletDead', 'outlet', id, 'no such outlet');
      if (!o.live) return nothing('power.outletDead', `${id} is already dead`);
      return ok(id);
    },
    apply(lab, _ctx, params, record) {
      w(lab, record, ['power', 'outlets', str(params.outlet), 'live'], false);
    },
    isResolved(lab, f) {
      const o = lab.power.outlets[f.target];
      return !!o && (o.live || o.plugged == null);
    },
  },
];
