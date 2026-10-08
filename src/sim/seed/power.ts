/**
 * Power network seed (Sim §2.6): wall outlets, the Mean Well 24 V supply, step-down regulators, inline
 * fuses, DC terminals (rig MAIN/MOTOR feeds, spare taps), commercial AC strips and every modelled load.
 */
import type { AcStrip, DcRail, DcTerminal, Fuse, PowerHookup, PowerLoad, PowerOutlet, PowerState, PowerSupplyUnit, Regulator } from '../types';

/** Touch/standalone rigs in the power graph, by rack. */
export const RACK_A_RIGS = ['wall-e', 'eve', 'bumblebee', 'r2-d2'];
export const RACK_B_RIGS = ['johnny-5', 'baymax', 'seti', 'rosie'];
export const POWERED_RIGS = [...RACK_A_RIGS, ...RACK_B_RIGS];
/** Rigs whose MAIN feed also powers their own webcam (Rack A). */
const OWN_WEBCAM = new Set(RACK_A_RIGS);

/** Accessory current on a rig's MAIN terminal besides the Pi: tablet charger 0.50 (+ webcam 0.25). */
export function mainAccessoryA(rigId: string): number {
  return OWN_WEBCAM.has(rigId) ? 0.75 : 0.5;
}
/** Extra current drawn by host loads besides the Pi itself (webcams, SmartStripes). */
export const HOST_EXTRA_A: Record<string, number> = { 'pi-cam-rackb': 0.25, 'pi-tethered': 0.45, 'pi-adb-shelf': 0 };

const STRIP_LAYOUT: Record<string, { label: string; outlet: string; loads: (string | null)[] }> = {
  'STRIP-A': { label: 'Rack A AC strip', outlet: 'WALL-2', loads: ['psu-wall-e-flex3', 'psu-bumblebee-mini3', 'psu-r2-d2-duo', 'brick-minix-01', 'psu-collis-eve', 'psu-eve-flex4'] },
  'STRIP-B': { label: 'Rack B AC strip', outlet: 'WALL-3', loads: ['psu-johnny-5-flex1', 'psu-baymax-st2018', 'psu-seti-compact', 'psu-rosie-pocket', 'brick-minix-02', 'psu-collis-rosie'] },
  'STRIP-T': { label: 'Tethered rack + ADB shelf AC strip', outlet: 'WALL-4', loads: ['psu-megatron-mfd', 'psu-megatron-cfd', 'psu-optimus-mfd', 'psu-optimus-cfd', 'psu-data-mini3', 'psu-tars-flex4'] },
  'STRIP-C': { label: 'Callus shelf AC strip', outlet: 'WALL-5', loads: ['psu-collis-wall-e', 'psu-collis-bumblebee', 'psu-collis-r2-d2', 'psu-collis-johnny-5', 'psu-collis-baymax', 'psu-collis-seti'] },
  'STRIP-W': { label: 'Power-wall bench AC strip', outlet: 'WALL-6', loads: ['soldering-station', 'desk-lamp', null, null, null, null] },
};

/** AC loads on strips that are not devices/probes/boxes. */
const MISC_AC: Record<string, { label: string; drawA: number }> = {
  'soldering-station': { label: 'Soldering station', drawA: 0.6 },
  'desk-lamp': { label: 'Desk lamp', drawA: 0.2 },
  'desk-fan': { label: 'Desk fan', drawA: 0.4 },
};

export function seedPower(deviceLoads: { loadId: string; deviceId: string; label: string }[], collisLoads: { loadId: string; collisId: string; rigId: string }[]): PowerState {
  const outlets: Record<string, PowerOutlet> = {};
  const plugged: Record<string, string> = { 'WALL-1': 'MW-1', 'WALL-2': 'STRIP-A', 'WALL-3': 'STRIP-B', 'WALL-4': 'STRIP-T', 'WALL-5': 'STRIP-C', 'WALL-6': 'STRIP-W' };
  for (let n = 1; n <= 6; n++) {
    const id = `WALL-${n}`;
    outlets[id] = { id, voltage: 120, live: true, plugged: plugged[id] ?? null, propId: `power.outlet.${n}` };
  }
  const psus: Record<string, PowerSupplyUnit> = {
    'MW-1': { id: 'MW-1', model: 'Mean Well LRS-600-24', label: 'MEAN WELL · INPUT 120VAC · OUTPUT 24VDC', outletId: 'WALL-1', outputVoltage: 24, maxAmps: 25, on: true, hiccupUntilPhysMs: null, propId: 'prop.meanwell-psu' },
  };
  const reg = (id: string, outRail: string, nominalV: 12 | 5, maxA: number, label: string, propId: string): Regulator => ({ id, inRail: 'rail-24v', outRail, nominalV, maxA, inputSwitch: true, label, propId });
  const regulators: Record<string, Regulator> = {
    'REG-5V-A': reg('REG-5V-A', 'rail-5v-a', 5, 10, '24V→5V 10A STEP-DOWN · RACK A', 'power.reg.5v-a'),
    'REG-5V-B': reg('REG-5V-B', 'rail-5v-b', 5, 10, '24V→5V 10A STEP-DOWN · RACK B', 'prop.regulator-5v10a'),
    'REG-5V-BENCH': reg('REG-5V-BENCH', 'rail-5v-bench', 5, 10, '24V→5V 10A STEP-DOWN · BENCH', 'power.reg.5v-bench'),
    'REG-12V': reg('REG-12V', 'rail-12v', 12, 8, '24V→12V 8A STEP-DOWN · NUC', 'prop.regulator-12v'),
  };
  const rail = (id: string, nominal: 24 | 12 | 5, source: string, fuseId: string | null, maxAmps: number, voltage: number): DcRail => ({ id, nominalVoltage: nominal, source, fuseId, maxAmps, voltage, currentA: 0, propId: `power.${id}` });
  const rails: Record<string, DcRail> = {
    'rail-24v': rail('rail-24v', 24, 'MW-1', null, 25, 24.1),
    'rail-5v-a': rail('rail-5v-a', 5, 'REG-5V-A', 'F-RACKA-5V', 10, 5.06),
    'rail-5v-b': rail('rail-5v-b', 5, 'REG-5V-B', 'F-RACKB-5V', 10, 5.05),
    'rail-5v-bench': rail('rail-5v-bench', 5, 'REG-5V-BENCH', 'F-BENCH-5V', 10, 5.08),
    'rail-12v': rail('rail-12v', 12, 'REG-12V', 'F-NUC-12V', 8, 12.02),
  };
  const fuse = (id: string, railId: string, propId: string): Fuse => ({ id, railId, ratingA: 10, labelA: 10, blown: false, removed: false, stress: 0, propId });
  const fuses: Record<string, Fuse> = {
    'F-RACKA-5V': fuse('F-RACKA-5V', 'rail-5v-a', 'power.fuse.5v-a'),
    'F-RACKB-5V': fuse('F-RACKB-5V', 'rail-5v-b', 'prop.fuse-5v-b'),
    'F-BENCH-5V': fuse('F-BENCH-5V', 'rail-5v-bench', 'power.fuse.5v-bench'),
    'F-NUC-12V': fuse('F-NUC-12V', 'rail-12v', 'power.fuse.12v'),
  };

  const terminals: Record<string, DcTerminal> = {};
  const term = (id: string, railId: string, label: string, via: DcTerminal['via'], plug: string | null, rigId?: string): void => {
    terminals[id] = { id, railId, label, via, plugged: plug, propId: null, energised: true, ...(rigId ? { rigId } : {}) };
  };
  for (const rig of POWERED_RIGS) {
    const r5 = RACK_A_RIGS.includes(rig) ? 'rail-5v-a' : 'rail-5v-b';
    term(`MAIN-${rig}`, r5, `${rig.toUpperCase()} MAIN (5 V: Pi, tablet, webcam)`, 'rig-main', `pi-${rig}`, rig);
    term(`MOTOR-${rig}`, 'rail-24v', `${rig.toUpperCase()} MOTOR (24 V stepper + solenoid drivers)`, 'rig-motor', `motor-${rig}`, rig);
  }
  term('T-5V-B-CAM', 'rail-5v-b', 'Rack B camera Pi 5 V', 'fuse-bus', 'pi-cam-rackb');
  term('T-5V-BENCH-1', 'rail-5v-bench', 'Tethered shelf Pi 5 V', 'fuse-bus', 'pi-tethered');
  term('T-5V-BENCH-2', 'rail-5v-bench', 'ADB shelf Pi 5 V', 'fuse-bus', 'pi-adb-shelf');
  term('T-5V-SPARE', 'rail-5v-bench', 'Spare 5 V tap', 'spare', null);
  term('T-12V-NUC', 'rail-12v', 'NUC-03 12 V', 'fuse-bus', 'nuc-03');
  term('T-12V-SPARE', 'rail-12v', 'Spare 12 V line ("the 12 V NUC line")', 'spare', null);
  term('T-24V-SPARE', 'rail-24v', 'Spare 24 V rail tap', 'spare', null);
  term('T-24V-CALLUS', 'rail-24v', 'Free 24 V barrel lead (Callus shelf)', 'spare', null);
  for (const t of Object.values(terminals)) t.propId = t.id.startsWith('T-') ? `power.${t.id.toLowerCase()}` : null;

  const strips: Record<string, AcStrip> = {};
  const socketOf: Record<string, PowerHookup> = {};
  for (const [id, s] of Object.entries(STRIP_LAYOUT)) {
    strips[id] = { id, label: s.label, outletId: s.outlet, switchOn: true, sockets: 6, loads: [...s.loads], breakerTripped: false, propId: `power.${id.toLowerCase()}` };
    s.loads.forEach((l, i) => {
      if (l) socketOf[l] = { kind: 'ac-strip', targetId: id, socket: i + 1 };
    });
  }

  const loads: Record<string, PowerLoad> = {};
  const load = (l: PowerLoad): void => {
    loads[l.id] = l;
  };
  const termOf: Record<string, string> = {};
  for (const t of Object.values(terminals)) if (t.plugged) termOf[t.plugged] = t.id;
  const dc = (id: string): PowerHookup => ({ kind: 'dc-rail', targetId: termOf[id] ?? null });
  for (const rig of POWERED_RIGS) {
    load({ id: `pi-${rig}`, label: `${rig.toUpperCase()} Raspberry Pi (USB-C 5 V)`, expects: '5V', drawA: 0.9, supply: dc(`pi-${rig}`), powered: true, damaged: false, hostId: `pi-${rig}`, rigId: rig });
    load({ id: `motor-${rig}`, label: `${rig.toUpperCase()} stepper/solenoid drivers`, expects: '24V', drawA: 0.8, supply: dc(`motor-${rig}`), powered: true, damaged: false, rigId: rig });
  }
  load({ id: 'pi-cam-rackb', label: 'Rack B camera Pi (USB-C 5 V)', expects: '5V', drawA: 0.9, supply: dc('pi-cam-rackb'), powered: true, damaged: false, hostId: 'pi-cam-rackb' });
  load({ id: 'pi-tethered', label: 'Tethered shelf Pi (USB-C 5 V)', expects: '5V', drawA: 0.9, supply: dc('pi-tethered'), powered: true, damaged: false, hostId: 'pi-tethered' });
  load({ id: 'pi-adb-shelf', label: 'ADB shelf Pi (USB-C 5 V)', expects: '5V', drawA: 0.9, supply: dc('pi-adb-shelf'), powered: true, damaged: false, hostId: 'pi-adb-shelf' });
  load({ id: 'nuc-03', label: 'NUC-03 (12 V DC lead)', expects: '12V', drawA: 3.5, supply: dc('nuc-03'), powered: true, damaged: false, hostId: 'nuc-03' });
  load({ id: 'brick-minix-01', label: 'MINIX-01 power brick', expects: 'AC', drawA: 0.3, supply: socketOf['brick-minix-01']!, powered: true, damaged: false, hostId: 'minix-01' });
  load({ id: 'brick-minix-02', label: 'MINIX-02 power brick', expects: 'AC', drawA: 0.3, supply: socketOf['brick-minix-02']!, powered: true, damaged: false, hostId: 'minix-02' });
  for (const d of deviceLoads) {
    load({ id: d.loadId, label: d.label, expects: 'AC-BRICK-18V', drawA: 0.5, supply: socketOf[d.loadId] ?? { kind: 'none', targetId: null }, powered: !!socketOf[d.loadId], damaged: false, deviceId: d.deviceId });
  }
  for (const c of collisLoads) {
    load({ id: c.loadId, label: `Collis probe PSU (${c.rigId.toUpperCase()})`, expects: 'AC-BRICK-18V', drawA: 0.3, supply: socketOf[c.loadId] ?? { kind: 'none', targetId: null }, powered: true, damaged: false, collisId: c.collisId, rigId: c.rigId });
  }
  for (const [id, m] of Object.entries(MISC_AC)) {
    const s = socketOf[id];
    load({ id, label: m.label, expects: 'AC', drawA: m.drawA, supply: s ?? { kind: 'none', targetId: null }, powered: !!s, damaged: false });
  }

  return { outlets, strips, psus, regulators, rails, terminals, fuses, loads, spareFuses: { '5': 4, '10': 4, '15': 2, '20': 1 }, sparks: [] };
}
