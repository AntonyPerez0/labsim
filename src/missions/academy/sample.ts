/**
 * Built-in M01 lesson (Cur §2 "M01 — Welcome to the Lab"), transcribed from the curriculum table with
 * the exact texts. It is the runtime's fallback until `src/missions/academy/lessons/` provides M01 (that
 * file wins when present) and the fixture the lesson-runner tests drive.
 */
import { c, on } from '../types';
import type { LessonDef } from '../types';

export const SAMPLE_M01: LessonDef = {
  moduleId: 'M01',
  mentor: 'morgan',
  setup: { preset: 'academy:M01', spawn: 'loc.entrance' },
  deck: 'deck.M01',
  manualChapters: ['Lab Basics'],
  realLabChecklist: [
    "Read a rig's status tablet header (robot name, Status: OK, Brainbox v6) before touching anything.",
    'Never fight a running robot: while a test is active the dashboard locks you out — wait for the job.',
    'Find the POWER panel (MAIN and MOTOR) and the rack-unit numbers on the rails.',
    'Remember where the black fixtures come from: the Prusa and Bambu Lab printers.',
    'LabSim terminals and Collis probes go on the AC power strips — never the DC rails. Broken rig? Tell {{jared}}.',
  ],
  steps: [
    {
      id: 'M01.01',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Welcome to the LabSim automation lab! I'm {{morgan}}. I built uia-remote, and today I'm your onboarding buddy. Everything in this room exists to press buttons on LabSim devices so humans don't have to.",
      factIds: ['F244'],
    },
    { id: 'M01.02', kind: 'walk-to', hud: 'Walk to Touch Rack A', location: 'loc.rack-a' },
    {
      id: 'M01.03',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Meet WALL-E. Every rig here is named after a famous robot. Orca tracks a pool of 40-plus rigs, and a dozen of them live in this room.',
      factIds: ['F115', 'F073'],
    },
    {
      id: 'M01.04',
      kind: 'inspect',
      hud: "Look at WALL-E's status tablet",
      prop: 'prop.walle.tablet',
      callouts: ['WALL-E', 'Status: OK', 'Brainbox v6', 'Robot / Robot Control / Motion Control'],
      factIds: ['F089'],
    },
    {
      id: 'M01.05',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "That's the front-mounted status tablet, the robot's face. The name across the top comes straight from Orca.",
    },
    {
      id: 'M01.06',
      kind: 'interact',
      hud: 'Tap the Motion Control tab and press Park All',
      target: 'prop.walle.tablet',
      success: c.any(
        c.happened(on('rig.command', { rigId: 'wall-e', command: 'park.all', ok: false })),
        c.happened(on('app.action', { action: 'tablet.lockout.shown' })),
        c.happened(on('app.action', { action: 'dashboard.lockout.shown' })),
      ),
      factIds: ['F230'],
    },
    {
      id: 'M01.07',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "See that? While a test is active, the global LabSim control dashboard locks out external users. Never fight a running robot. Wait for the job, or learn to reserve the rig properly. That's Module 6.",
    },
    {
      id: 'M01.08',
      kind: 'inspect',
      hud: "Inspect WALL-E's POWER panel",
      prop: 'prop.walle.power-panel',
      callouts: ['Green LEDs: MAIN · MOTOR', 'MAIN', 'MOTOR'],
    },
    { id: 'M01.09', kind: 'inspect', hud: 'Find rack unit 33 on the rail', prop: 'prop.rack-a.rail-labels', part: 'rack.a.rails.u33', dwellS: 0.5 },
    {
      id: 'M01.10',
      kind: 'inspect',
      hud: "What's the lettered panel to the right of the tablet?",
      prop: 'prop.seti-panel',
      callouts: ['SETI — USB ports for the Minix box / Raspberry Pi'],
    },
    { id: 'M01.11', kind: 'walk-to', hud: 'Walk to the 3D print corner', location: 'loc.print-corner' },
    {
      id: 'M01.12',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'All of those matte-black fixtures were printed right here on the Prusa and Bambu Lab printers, drafted in CAD from simple geometric shapes. If it\'s black plastic and holds a LabSim, we made it.',
      factIds: ['F072', 'F233'],
    },
    {
      id: 'M01.13',
      kind: 'interact',
      hud: 'Pick up the Lab Safety Card',
      target: 'prop.safety-card',
      success: c.any(
        c.happened(on('item.pickedUp', { itemId: 'safety-card' })),
        c.happened(on('player.interacted', {}, (p) => p.interactableId === 'wall.safety-card' || p.interactableId === 'prop.safety-card')),
      ),
      onComplete: [{ do: 'unlockManual', entryIds: ['lab-safety-card'] }],
    },
    { id: 'M01.14', kind: 'quiz-checkpoint', checkpointId: 'CP-M01.1', title: 'Lab Basics', questionIds: ['Q001', 'Q002', 'Q003', 'Q004', 'Q005'] },
    {
      id: 'M01.15',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Nice work. Next stop: the devices themselves. Grab a coffee, then meet me at the device library.',
    },
  ],
};

export const SAMPLE_LESSONS: Record<string, LessonDef> = { M01: SAMPLE_M01 };
