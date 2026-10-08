/**
 * M04 — Touch Robot Mechanics & the Status Tablet (Cur §2 M04). Mentor {{jared}}.
 * Setup (`academy:M04` = factory): WALL-E idle and Available (tablet unlocked), enclosure door closed,
 * bolt bins at `loc.jared-bench`. Sim: `rig.command` for every tablet group, `rig.setDoor`,
 * `rig.dragCarriage` (≥ 20 mm breaks the magnetic lock), banner (Sim §3.7).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { cmd, minigameDone, pressed, say, tabOpened } from './helpers';

const R = 'wall-e';

export const M04: LessonDef = {
  moduleId: 'M04',
  mentor: 'jared',
  setup: { preset: 'academy:M04', spawn: 'loc.workstation', inventory: { tools: ['screwdriver'] } },
  deck: 'deck.M04',
  manualChapters: ['Robots'],
  realLabChecklist: [
    'Know the gantry by name: 2020 extrusion, NEMA-17 stepper on a GT2 belt, V-slot wheels, carriage, blue push-pull solenoid, dip arm, limit switches, magnetic lock, webcam.',
    "Drive a rig only from its tablet's Motion Control tab: Steppers, Park, Dip, Tap, Phone and Solenoid groups.",
    'If an arm gets pushed by hand the magnetic lock breaks and the banner turns yellow: press Park All to home to (0,0) and get the banner green again.',
    'Every robot is hand-built: 10 ft cut aluminium rails, about 130 ft of wiring, ~300 solder points, 200+ nuts and bolts in 2.5 mm and 5 mm, custom 25-pin PCBs printed in Hong Kong.',
  ],
  steps: [
    { id: 'M04.01', kind: 'walk-to', hud: 'Meet {{jared}} at WALL-E', location: 'loc.rack-a' },
    {
      id: 'M04.02',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'A touch robot is basically a 3D-printer gantry that taps instead of prints. Aluminium 2020 extrusion, V-slot wheels, a NEMA-17 stepper on a GT2 belt, and a blue push-pull solenoid on the carriage. The steppers move in sub-millimetre steps.',
      factIds: ['F240', 'F079', 'F080'],
    },
    {
      id: 'M04.03',
      kind: 'inspect',
      hud: 'Inspect the X-axis stepper',
      prop: 'prop.walle.stepper-x',
      callouts: ['NEMA-17', 'GT2 pulley', 'V-slot wheels', '2020 extrusion'],
      manualEntryIds: ['touch-robot-anatomy'],
      factIds: ['F240', 'F079'],
    },
    {
      id: 'M04.04',
      kind: 'inspect',
      hud: 'Find the motor controller board',
      prop: 'prop.walle.motor-pcb',
      callouts: ['25-PIN MOTOR CTRL · MADE IN HONG KONG'],
      factIds: ['F083', 'F084'],
    },
    {
      id: 'M04.05',
      kind: 'inspect',
      hud: 'Look at how the Flex 3 is held',
      prop: 'prop.walle.cradle',
      callouts: ['Angled 3D-printed cradle', 'Collis probe box (UL Transaction Security)', 'Webcam'],
      factIds: ['F242', 'F088'],
    },
    {
      id: 'M04.06',
      kind: 'interact',
      hud: 'On the tablet open Robot, then Robot Control, then Motion Control',
      target: 'prop.walle.tablet',
      success: c.all(tabOpened(R, 'robot'), tabOpened(R, 'robot-control'), tabOpened(R, 'motion-control')),
      objectives: [
        { id: 'M04.06.robot', text: 'Robot', done: tabOpened(R, 'robot') },
        { id: 'M04.06.control', text: 'Robot Control', done: tabOpened(R, 'robot-control') },
        { id: 'M04.06.motion', text: 'Motion Control', done: tabOpened(R, 'motion-control') },
      ],
      factIds: ['F234'],
    },
    {
      id: 'M04.07',
      kind: 'interact',
      hud: 'Fire the solenoid: Solenoid → Down, then Up',
      target: 'prop.walle.tablet',
      success: c.sequence(cmd(R, 'solenoid.down'), cmd(R, 'solenoid.up')),
      factIds: ['F080', 'F243', 'F235'],
    },
    {
      id: 'M04.08',
      kind: 'interact',
      hud: 'Move the head with Park → X, then Park → Y, then tap a button with Solenoid → Lower / Raise',
      target: 'prop.walle.tablet',
      success: c.all(pressed(R, 'park.x'), pressed(R, 'park.y'), pressed(R, 'solenoid.lower'), pressed(R, 'solenoid.raise')),
      objectives: [
        { id: 'M04.08.x', text: 'Park → X', done: pressed(R, 'park.x') },
        { id: 'M04.08.y', text: 'Park → Y', done: pressed(R, 'park.y') },
        { id: 'M04.08.lower', text: 'Solenoid → Lower', done: pressed(R, 'solenoid.lower') },
        { id: 'M04.08.raise', text: 'Solenoid → Raise', done: pressed(R, 'solenoid.raise') },
      ],
      onComplete: [say('jared', 'Lower and Raise are the slow version of the same tap. Down and Up fire it fast.')],
      factIds: ['F235', 'F243'],
    },
    {
      id: 'M04.09',
      kind: 'interact',
      hud: 'Run the card mechanics: Dip → In, Dip → Out, Tap → In, Tap → Out',
      target: 'prop.walle.tablet',
      success: c.all(pressed(R, 'dip.in'), pressed(R, 'dip.out'), pressed(R, 'tap.in'), pressed(R, 'tap.out')),
      objectives: [
        { id: 'M04.09.dipin', text: 'Dip → In', done: pressed(R, 'dip.in') },
        { id: 'M04.09.dipout', text: 'Dip → Out', done: pressed(R, 'dip.out') },
        { id: 'M04.09.tapin', text: 'Tap → In', done: pressed(R, 'tap.in') },
        { id: 'M04.09.tapout', text: 'Tap → Out', done: pressed(R, 'tap.out') },
      ],
      onComplete: [
        { do: 'callouts', prop: 'prop.walle.dip-arm', lines: ['Dip arm · sector gear 63', 'White ribbon card → chip slot'] },
      ],
      factIds: ['F241', 'F235'],
    },
    {
      id: 'M04.10',
      kind: 'interact',
      hud: 'Try the Phone group: Forward, Back, Push Power Button. Then Steppers → Disable, Steppers → Enable',
      target: 'prop.walle.tablet',
      success: c.all(pressed(R, 'phone.forward'), pressed(R, 'phone.back'), pressed(R, 'phone.pushPower'), c.sequence(cmd(R, 'steppers.disable'), cmd(R, 'steppers.enable'))),
      objectives: [
        { id: 'M04.10.fwd', text: 'Phone → Forward', done: pressed(R, 'phone.forward') },
        { id: 'M04.10.back', text: 'Phone → Back', done: pressed(R, 'phone.back') },
        { id: 'M04.10.power', text: 'Phone → Push Power Button', done: pressed(R, 'phone.pushPower') },
        { id: 'M04.10.steppers', text: 'Steppers → Disable, then Enable', done: c.sequence(cmd(R, 'steppers.disable'), cmd(R, 'steppers.enable')) },
      ],
      factIds: ['F235'],
    },
    {
      id: 'M04.11',
      kind: 'interact',
      hud: 'Open the door and push the carriage by hand',
      target: 'prop.walle.carriage',
      success: c.eq(p.rig(R).banner, 'YELLOW'),
      objectives: [
        { id: 'M04.11.door', text: 'Open the enclosure door', done: c.happened(on('rig.doorChanged', { rigId: R, open: true })) },
        // The push itself (not just a released lock: Steppers → Disable in M04.10 already releases it).
        {
          id: 'M04.11.push',
          text: 'Drag the carriage at least 20 mm',
          done: c.all(c.happened(on('rig.carriageDragged', { rigId: R })), c.eq(p.rig(R).magLock, 'RELEASED')),
        },
      ],
      onComplete: [say('jared', 'Hear that clunk? You broke the magnetic lock. Look at the banner.')],
      factIds: ['F081', 'F231'],
    },
    {
      id: 'M04.12',
      kind: 'interact',
      hud: 'Recover WALL-E',
      target: 'prop.walle.tablet',
      success: c.all(c.eq(p.rig(R).banner, 'GREEN'), c.eq(p.rig(R).homed, true), c.eq(p.rig(R).magLock, 'ENGAGED')),
      wrongActions: [
        {
          id: 'partial-park',
          on: on('rig.command', { rigId: R }, (pl) => pl.command === 'park.x' || pl.command === 'park.y' || pl.command === 'park.xy'),
          say: 'Park X, Park Y and Park XY only home those axes. The banner stays yellow until Park All.',
        },
        {
          id: 'push-again',
          on: on('rig.carriageDragged', { rigId: R }),
          say: "Hands off the carriage. Pushing it is what broke the lock. Let the steppers do the work.",
          gw: 'GW06',
        },
      ],
      onComplete: [
        { do: 'callouts', prop: 'prop.walle.limit-switch-x', lines: ['Limit switches · (0,0)', 'Status: OK'] },
      ],
      factIds: ['F232', 'F082', 'F231'],
    },
    {
      id: 'M04.13',
      kind: 'dialogue',
      speaker: 'jared',
      text: "That's the whole trick: push an arm, break the magnetic lock, banner goes yellow. Park All drives the steppers back to the limit switches at zero-zero, clears the error, banner goes green. And for the record, each robot took ten-foot aluminium rails cut to size, a hundred and thirty feet of wiring, about three hundred hand solder points, and two-hundred-plus nuts and bolts, in 2.5 and 5 millimetre.",
      factIds: ['F231', 'F232', 'F090', 'F091', 'F092', 'F093'],
    },
    { id: 'M04.13a', kind: 'walk-to', hud: "Head to {{jared}}'s bench", location: 'loc.jared-bench' },
    {
      id: 'M04.14',
      kind: 'interact',
      hud: "Sort {{jared}}'s bolts into the 2.5 mm and 5 mm bins (10 bolts)",
      target: 'prop.bolt-bins',
      success: minigameDone('bolt-sort', 10),
      factIds: ['F093'],
    },
    { id: 'M04.15', kind: 'quiz-checkpoint', checkpointId: 'CP-M04.1', title: 'Touch Robot', questionIds: ['Q040', 'Q041', 'Q042', 'Q043', 'Q047'] },
  ],
};
