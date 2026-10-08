/**
 * M01 — Welcome to the Lab: Orientation & Safety (Cur §2 M01). Mentor {{morgan}}.
 * Setup: preset `academy:M01` starts scripted build `Java/uia-remote-regression-flex #4120` on WALL-E
 * (`rig.testRunning`, tablet locked); the runner clears it after step 7 (Sim §4.4.2).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { clearFaults, pressed, say, worldAction } from './helpers';

export const M01: LessonDef = {
  moduleId: 'M01',
  mentor: 'morgan',
  setup: { preset: 'academy:M01', spawn: 'loc.entrance', apps: { unlock: ['chat'] } },
  deck: 'deck.M01',
  manualChapters: ['Lab Basics'],
  realLabChecklist: [
    "Read a rig's status tablet header (robot name, Status: OK, Brainbox v6) before you touch anything.",
    'Never fight a running robot: while a test is active the control dashboard locks you out. Wait for the job.',
    'Find each rig\'s POWER panel (MAIN and MOTOR) and use the rack-unit numbers on the rails to say where things are.',
    'All the matte-black fixtures were printed in-house on the Prusa and Bambu Lab printers.',
    'LabSim terminals and Collis probes go on the commercial AC power strips, never the DC rails. Broken rig? Tell {{jared}}.',
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
      manualEntryIds: ['status-tablet'],
      factIds: ['F089', 'F233'],
    },
    {
      id: 'M01.05',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "That's the front-mounted status tablet, the robot's face. The name across the top comes straight from Orca.",
      factIds: ['F089'],
    },
    {
      id: 'M01.06',
      kind: 'interact',
      hud: 'Tap the Motion Control tab and press Park All',
      target: 'prop.walle.tablet',
      // Cur: "Overlay has been shown once" — the lockout overlay (blocked click) or the rejected command.
      success: c.any(
        c.happened(on('rig.command', { rigId: 'wall-e', command: 'park.all', ok: false })),
        c.appAction('tablet', 'tablet.lockout.shown', (d) => d.robot === 'wall-e'),
        c.appAction('dashboard', 'dashboard.lockout.shown', (d) => d.robot === 'wall-e'),
      ),
      hints: [
        { afterS: 30, effect: 'text', text: 'Press E on the tablet, open the Motion Control tab and press Park All in the Park group.' },
        { afterS: 75, effect: 'highlight' },
      ],
      factIds: ['F230'],
    },
    {
      id: 'M01.07',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "See that? While a test is active, the global LabSim control dashboard locks out external users. Never fight a running robot. Wait for the job, or learn to reserve the rig properly. That's Module 6.",
      factIds: ['F230'],
      // Sim §4.4.2: the runner ends build #4120 after this line.
      // Clearing the fault ends the build's loop; the runner still finishes its current pass and releases WALL-E.
      onComplete: [clearFaults('rig.testRunning')],
    },
    {
      id: 'M01.07w',
      kind: 'wait-for-condition',
      hud: 'Wait for build #4120 to finish',
      marker: { kind: 'prop', id: 'prop.walle.tablet' },
      success: c.eq(p.rig('wall-e').lockedOut, false),
      onComplete: [say('morgan', 'There, build #4120 just finished. The lock is gone, so the tablet is yours again.')],
      factIds: ['F230'],
    },
    {
      id: 'M01.07a',
      kind: 'interact',
      hud: 'Now that the job is done, press Park All again',
      target: 'prop.walle.tablet',
      success: c.happened(on('rig.command', { rigId: 'wall-e', command: 'park.all', ok: true })),
      onComplete: [say('morgan', 'Same button, no lock. The head drove home to zero-zero. You only touch a rig when nothing is running on it.')],
      factIds: ['F230', 'F232'],
    },
    {
      id: 'M01.08',
      kind: 'inspect',
      hud: "Inspect WALL-E's POWER panel",
      prop: 'prop.walle.power-panel',
      callouts: ['Green LEDs: MAIN · MOTOR', 'MAIN', 'MOTOR'],
      factIds: ['F236'],
    },
    { id: 'M01.09', kind: 'inspect', hud: 'Find rack unit 33 on the rail', prop: 'prop.rack-a.rail-labels', part: 'rack.a.rails.u33', dwellS: 0.5, callouts: ['Rack unit 33'], factIds: ['F244'] },
    {
      id: 'M01.10',
      kind: 'inspect',
      hud: "What's the lettered panel to the right of the tablet?",
      prop: 'prop.seti-panel',
      callouts: ['SETI — USB ports for the Minix box / Raspberry Pi'],
      factIds: ['F245'],
    },
    { id: 'M01.11', kind: 'walk-to', hud: 'Walk to the 3D print corner', location: 'loc.print-corner' },
    {
      id: 'M01.12',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "All of those matte-black fixtures were printed right here on the Prusa and Bambu Lab printers, drafted in CAD from simple geometric shapes. If it's black plastic and holds a LabSim, we made it.",
      factIds: ['F072', 'F233'],
    },
    {
      id: 'M01.13',
      kind: 'interact',
      hud: 'Pick up the Lab Safety Card',
      target: 'prop.safety-card',
      success: c.any(
        worldAction('safetyCard.taken'),
        c.happened(on('item.pickedUp', { itemId: 'safety-card' })),
        c.happened(on('player.interacted', {}, (pl) => pl.interactableId === 'wall.safety-card' || pl.interactableId === 'prop.safety-card')),
      ),
      onComplete: [
        {
          do: 'callouts',
          prop: 'prop.safety-card',
          lines: [
            '1. Never touch a robot while a test is running.',
            '2. If you move an arm by hand, Park All before you walk away.',
            '3. LabSim terminals and Collis probes go on the AC power strips — never the DC rails.',
            '4. Broken rig? Tell {{jared}}.',
          ],
        },
        { do: 'unlockManual', entryIds: ['lab-tour'] },
        // Blocking line so the card's rules stay on screen before the checkpoint quiz takes over.
        say('morgan', 'Four rules, and every one of them exists because someone learned it the hard way. Keep that card in your pocket.'),
      ],
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
