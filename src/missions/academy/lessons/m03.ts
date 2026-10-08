/**
 * M03 — Power Distribution: Don't Fry the terminals (Cur §2 M03). Mentor {{jared}}.
 * Setup (`academy:M03`): Rack B's 5V inline fuse `F-RACKB-5V` is blown (JOHNNY-5 / BAYMAX / SETI /
 * ROSIE Pis dark); a new Flex 4 power brick (`psu-flex4-new`) and a spare Collis probe PSU
 * (`psu-collis-spare`) lie unplugged on the power-wall bench. Wrong socket in Academy = spark +
 * mentor line, no damage (Sim §3.13.3).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { loadsOnAcStrip, minigameDone, say, worldAction } from './helpers';

const RACK_B_PIS = ['pi-johnny-5', 'pi-baymax', 'pi-seti', 'pi-rosie'] as const;
const FUSE = 'F-RACKB-5V';
const REG = 'REG-5V-B';
const NEW_LOADS = ['psu-flex4-new', 'psu-collis-spare'] as const;

const isFusePoint = (id: string) => id === FUSE || id === `fuse:${FUSE}:ohms` || id.startsWith('fuse:F-5V-B');

export const M03: LessonDef = {
  moduleId: 'M03',
  mentor: 'jared',
  setup: { preset: 'academy:M03', spawn: 'loc.workstation' },
  deck: 'deck.M03',
  manualChapters: ['Power'],
  realLabChecklist: [
    'Trace the chain before touching anything: 120V AC wall → Mean Well → 24V DC rail → step-down regulators → 12V (NUCs) and 5V 10A (Pis), inline fuses on the DC lines.',
    'A whole shelf of dark Pis points at the shared 5V line or its inline fuse, not at four broken Pis.',
    'Test a fuse out of circuit: a blown fuse reads open (OL). Replace it with the rating printed on the holder.',
    'LabSim devices draw an irregular 18V, so LabSim terminals (and the expensive Collis probes) always go on a commercial AC power strip, never on the DC rails.',
  ],
  steps: [
    { id: 'M03.01', kind: 'walk-to', hud: 'Meet {{jared}} at the power wall', location: 'loc.power-wall' },
    {
      id: 'M03.02',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Power 101. Get this wrong and we're buying new terminals. 120 volts AC comes out of the wall and goes straight into the Mean Well.",
      factIds: ['F074', 'F227'],
    },
    {
      id: 'M03.03',
      kind: 'inspect',
      hud: 'Inspect the Mean Well transformer',
      prop: 'prop.meanwell-psu',
      callouts: ['MEAN WELL · INPUT 120VAC · OUTPUT 24VDC'],
      manualEntryIds: ['power-distribution'],
      factIds: ['F074'],
    },
    {
      id: 'M03.04',
      kind: 'interact',
      hud: 'Trace the power path: click each stage in order',
      target: 'prop.power-trace',
      success: c.any(worldAction('power.trace.complete'), minigameDone('power-trace')),
      wrongActions: [
        {
          id: 'trace-order',
          on: on('app.action', { app: 'world', action: 'power.trace.wrong' }),
          say: 'Follow the electrons: wall, Mean Well, 24-volt rail, regulators, fuses, then the loads.',
        },
      ],
      hints: [{ afterS: 60, effect: 'text', text: 'Start at the wall outlet. The Mean Well turns 120V AC into the 24V DC rail.' }],
      factIds: ['F227', 'F074', 'F085', 'F086', 'F087'],
    },
    {
      id: 'M03.05',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'From the 24-volt rail, step-down regulators split it two ways: 12 volts DC for the Windows NUCs, and 5 volts DC at 10 amps for the Raspberry Pis. Inline fuses protect both lines.',
      factIds: ['F085', 'F086', 'F087'],
    },
    {
      id: 'M03.06',
      kind: 'inspect',
      hud: "Read the Pi regulator's rating",
      prop: 'prop.regulator-5v10a',
      callouts: ['5V DC · 10A'],
      factIds: ['F086'],
    },
    {
      id: 'M03.06a',
      kind: 'inspect',
      hud: 'Now read the NUC regulator',
      prop: 'prop.regulator-12v',
      callouts: ['12V DC · NUC'],
      factIds: ['F085'],
    },
    {
      id: 'M03.07',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Rack B's Pis just went dark. Grab the multimeter and check the 5-volt fuse.",
      onComplete: [{ do: 'grant', tools: ['multimeter'] }],
      factIds: ['F087'],
    },
    {
      id: 'M03.08',
      kind: 'interact',
      hud: "Test Rack B's 5V inline fuse with the multimeter",
      target: 'prop.fuse-5v-b',
      // Cur: "Meter reads OL (open)". De-energise (regulator input off), pull the fuse, Ω → OL.
      success: c.happened(on('power.measured', {}, (pl) => isFusePoint(pl.pointId) && pl.display.trim().toUpperCase() === 'OL')),
      objectives: [
        { id: 'M03.08.off', text: 'Switch the Rack B 5V regulator input off', done: c.happened(on('power.regulatorToggled', { regulatorId: REG, on: false })), hint: 'Aim at the Rack B 5V regulator and press R to switch its input off.' },
        { id: 'M03.08.pull', text: 'Pull the fuse', done: c.happened(on('power.fuseRemoved', { fuseId: FUSE })), hint: 'Empty hand (Q puts the meter away): E opens the holder, R pulls the fuse.' },
        { id: 'M03.08.ohms', text: 'Multimeter on Ω, probe the fuse: read OL', done: c.happened(on('power.measured', {}, (pl) => isFusePoint(pl.pointId) && pl.display.trim().toUpperCase() === 'OL')), hint: 'Select the multimeter (2); R cycles its mode to Ω. Then aim at the open holder: R measures the pulled fuse.' },
      ],
      wrongActions: [
        { id: 'pull-live', on: on('power.fuseRemoved', { fuseId: FUSE, live: true }), say: 'Whoa. Kill the regulator input before you pull a fuse. Never service a live line.', gw: 'GW03' },
        { id: 'ohms-live', on: on('power.measured', { mode: 'OHM' }, (pl) => pl.display.trim().toUpperCase() === 'ERR'), say: 'Ohms on a live circuit just gives you ERR. Power off and pull the fuse first.', gw: 'GW21' },
      ],
      hints: [
        { afterS: 60, effect: 'text', text: 'Regulator input off, pull the fuse, meter on Ω, probe the fuse.' },
        { afterS: 120, effect: 'highlight' },
      ],
      onComplete: [say('jared', 'OL. Open circuit. That fuse is toast, which is why every Pi on that line went dark at once.')],
      factIds: ['F087', 'F086'],
    },
    {
      id: 'M03.09',
      kind: 'interact',
      hud: 'Replace the blown fuse',
      target: 'prop.fuse-5v-b',
      onEnter: [{ do: 'grant', tools: ['spare-fuse-5v'], fuses: { '5': 1, '10': 1 } }],
      success: c.all(
        c.eq(p.fuse(FUSE).state, 'OK'),
        c.eq(p.fuse(FUSE).removed, false),
        c.same(p.fuse(FUSE).rating, p.fuse(FUSE).labelRating),
        c.forAll(RACK_B_PIS, (pi) => c.eq(p.pi(pi).power, 'ON')),
      ),
      objectives: [
        {
          id: 'M03.09.rating',
          text: 'Insert a spare fuse that matches the holder label (10A)',
          done: c.all(c.eq(p.fuse(FUSE).state, 'OK'), c.eq(p.fuse(FUSE).removed, false), c.same(p.fuse(FUSE).rating, p.fuse(FUSE).labelRating)),
          hint: 'With the spare fuse selected, R changes the rating. Red blade = 10 A.',
        },
        { id: 'M03.09.on', text: 'Switch the regulator input back on', done: c.happened(on('power.regulatorToggled', { regulatorId: REG, on: true })) },
        { id: 'M03.09.pis', text: 'Rack B Pis powered', done: c.forAll(RACK_B_PIS, (pi) => c.eq(p.pi(pi).power, 'ON')) },
      ],
      wrongActions: [
        { id: 'wrong-rating', on: on('power.fuseInserted', { fuseId: FUSE }, (pl) => pl.ratingA !== pl.labelA), say: 'Check the holder label: it says 10A. Match the rating printed on the holder.', gw: 'GW04' },
        { id: 'insert-live', on: on('power.fuseInserted', { fuseId: FUSE, live: true }), say: 'Regulator input off before the fuse goes in. Then power up.', gw: 'GW03' },
      ],
      onComplete: [say('jared', 'Green LEDs and a boot chime. Four Pis back from one little fuse.')],
      factIds: ['F087', 'F086'],
    },
    {
      id: 'M03.10',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'Now the exception. LabSim devices draw an irregular 18 volts. They never touch our DC rails, and neither do the Collis probes. Those things cost more than my car.',
      factIds: ['F228', 'F229', 'F069'],
    },
    {
      id: 'M03.11',
      kind: 'interact',
      hud: 'Plug in the new Flex 4 and the spare Collis probe',
      target: 'prop.flex4-psu-brick',
      success: loadsOnAcStrip(NEW_LOADS),
      objectives: [
        { id: 'M03.11.flex4', text: 'New Flex 4 power brick → AC power strip', done: loadsOnAcStrip(['psu-flex4-new']) },
        { id: 'M03.11.collis', text: 'Spare Collis probe → AC power strip', done: loadsOnAcStrip(['psu-collis-spare']) },
      ],
      wrongActions: [
        // Academy damage model: a wrong socket sparks and the lead pops out (`power.spark`, no `power.plugged`).
        { id: 'dc-flex4', on: on('power.spark', {}, (pl) => /Flex 4 power brick/i.test(pl.cause)), say: "That's how we fry a terminal. Commercial AC strip. Always.", gw: 'GW01' },
        { id: 'dc-collis', on: on('power.spark', {}, (pl) => /Collis/i.test(pl.cause)), say: "That's how we fry a probe that costs more than my car. Commercial AC strip. Always.", gw: 'GW02' },
        // Damage model "real" (Free Play replays): the plug goes in, then the load fries.
        { id: 'dc-flex4-plugged', on: on('power.plugged', { loadId: 'psu-flex4-new' }, (pl) => pl.hookup.kind !== 'ac-strip'), say: "That's how we fry a terminal. Commercial AC strip. Always.", gw: 'GW01' },
        { id: 'dc-collis-plugged', on: on('power.plugged', { loadId: 'psu-collis-spare' }, (pl) => pl.hookup.kind !== 'ac-strip'), say: "That's how we fry a probe that costs more than my car. Commercial AC strip. Always.", gw: 'GW02' },
      ],
      factIds: ['F228', 'F229'],
    },
    { id: 'M03.12', kind: 'quiz-checkpoint', checkpointId: 'CP-M03.1', title: 'Power', questionIds: ['Q028', 'Q030', 'Q031', 'Q033', 'Q035'] },
    {
      id: 'M03.13',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Good. Rails for Pis and NUCs, AC strips for terminals and Collis. Tattoo it somewhere. Now let's open up a robot.",
    },
  ],
};
