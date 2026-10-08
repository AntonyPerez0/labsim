/**
 * GP §3.5 INC08–INC14: camera URL mappings (shared Rack B camera, copy-pasted URL), Ollama down,
 * magnetic lock / Park All, dashboard lockout, disabled steppers / MOTOR, legacy Offsets.
 */
import type { Condition, IncidentBinding, IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import { truthFor } from '@/sim/seed/repos/screenTruth';
import {
  F,
  OP,
  P,
  allRigs,
  cameraUrl,
  dc,
  deviceType,
  gw,
  hrn,
  hrnList,
  orcaSave,
  rig,
  boundRigCommand,
  boundRigSwitch,
  boundTo,
  sym,
  teach,
  wm,
  TOUCH_RIGS,
} from './helpers';

/** Park All was issued on the bound rig while the ticket was open (the only way to re-home and re-lock). */
const parkedAll = (b: IncidentBinding): Condition => c.label(c.happened(on('rig.parkStarted', { rigId: rig(b), axes: 'all' })), 'Park All issued');

const RACKB_CAM = 'http://10.42.10.40:8081/stream.mjpg';

export const INC08: IncidentDef = {
  id: 'INC08',
  name: 'Four camera streams go dark (shared camera)',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P1',
  rigs: { candidates: ['seti'], default: 'seti', scope: 'rack', describe: 'shared Rack B camera (JOHNNY-5, BAYMAX, SETI, ROSIE)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.urls', 'vision.camera', 'hw.pi'],
  factIds: ['F124', 'F088', 'F065'],
  ticket: { title: 'contact-canada-pin-sale red: evidence capture failed', reporter: 'jenkins-bot', misleading: { title: "SETI's webcam is broken", reporter: 'riley' } },
  setup: () => ({ scenario: [F('camera.sharedHostDown', { host: 'pi-cam-rackb' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', `PL5 on SETI: [vision] GET ${RACKB_CAM} → Connection refused → Finished: FAILURE`),
    sym('Camera', (b) => `${hrnList(allRigs(b))} all show: Stream unavailable — ${RACKB_CAM}`),
    sym('Orca', 'The four rigs stay Available (the health endpoint does not cover the camera [illus.]); their URL Mappings show the same Camera Stream URL.'),
    sym('Terminal', 'ssh pi@10.42.10.40 → systemctl status camera-stream → Active: failed'),
  ],
  diagnosisPath: ['Four rigs, one symptom ⇒ a shared resource.', 'Orca URL Mappings: the four rigs share one Camera Stream URL.', 'ssh the camera host and check the service.', 'Call it, restart the service, rebuild PL5.'],
  hints: [
    'Four streams died together. What do those rigs share?',
    'Orca → each Rack B robot → URL Mappings → Camera Stream URL. Which host serves it?',
    'ssh pi@10.42.10.40 → sudo systemctl restart camera-stream → check the Camera app → rebuild contact-canada-pin-sale.',
  ],
  fix: { handsOn: 'sudo systemctl restart camera-stream on 10.42.10.40; confirm in the Camera app; rebuild PL5.' },
  success: () => c.all(c.eq(p.svc('pi-cam-rackb', 'camera-stream'), 'UP'), c.nextBuild({ pipeline: 'PL5' })),
  diagnosisCall: dc(
    'The shared Rack B camera service is down (one camera serves four rigs)',
    ["SETI's webcam died", 'Three other rigs lost their streams at the same moment. Compare their Camera Stream URLs.'],
    ['Camera URLs corrupted', 'The URLs are unchanged and identical. Is the host behind them serving?'],
    ['Ollama down', 'The failing request is the MJPEG stream on port 8081, not the model server.'],
  ),
  wrongButTempting: [
    wm('own-pi-url', "Point each rig's Camera URL at its own Pi", 100, orcaSave('robot', { fields: ['cameraStreamUrl'] }), teach('Those Pis have no camera.', 'A Camera Stream URL is dedicated per Pi or shared across 4 rigs; Rack B shares one camera host. (Ref §3)', 'Restore the shared URL and fix the camera service.'), { repeatable: true }),
    gw('cycle-pis', 'GW17', 'Power-cycle the four rig Pis'),
    wm('unplug-webcam', 'Unplug the webcam', 0, on('host.usbChanged', { hostId: 'pi-cam-rackb', attached: false }), teach('Now the service cannot open the camera at all.', 'The camera host serves the MJPEG stream from its USB webcam.', 'Re-plug the webcam, then restart camera-stream.')),
  ],
  teaches: 'Ref §3 URL Mappings: the Camera Stream URL is dedicated per Pi or shared across 4 rigs.',
  variants: [
    {
      id: 'B',
      label: 'Webcam USB lead pulled',
      overrides: {
        setup: () => ({ scenario: [F('camera.usbUnplugged', { host: 'pi-cam-rackb' })] }),
        symptoms: [
          sym('Camera', `Stream unavailable — ${RACKB_CAM} on all four Rack B rigs.`),
          sym('Terminal', "journalctl -u camera-stream -n 3 → camera-stream[640]: Cannot open '/dev/video0': No such file or directory"),
        ],
        hints: [
          'Four streams died together. What do those rigs share?',
          'ssh pi@10.42.10.40 → journalctl -u camera-stream -n 3. What can the service not open?',
          'Re-plug the camera host\'s webcam USB lead, then sudo systemctl restart camera-stream and rebuild PL5.',
        ],
        fix: { handsOn: 'Re-plug the webcam USB lead on the camera host, then restart camera-stream; rebuild PL5.' },
      },
    },
  ],
};

export const INC09: IncidentDef = {
  id: 'INC09',
  name: 'Wrong rig on camera (copy-pasted URL)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { candidates: ['r2-d2'], default: 'r2-d2', scope: 'rig', describe: 'dedicated-camera rigs (default R2-D2)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.urls', 'orca.screencompare', 'vision.camera'],
  factIds: ['F124', 'F154', 'F123'],
  ticket: { title: 'Duo CFD suite red: OCR reads nonsense', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('orca.urlWrong', { robot: '$R', field: 'camera', value: 'http://10.42.10.11:8081/stream.mjpg' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'PL7: [ocr] capture webcam → crop 236x44@412,288 → tesseract → "Tap, insert or swipe" → match=false (the text belongs to another device)'),
    sym('Camera', (b) => `${hrn(b)}'s stream shows a Flex 3 under a solenoid — WALL-E's shelf.`),
    sym('Notes', P('CONFIG urls.camera changed ({{alex}}) [illus.]')),
  ],
  diagnosisPath: ['The OCR text belongs to another device.', 'Open the rig\'s stream in the Camera app: wrong rig.', 'Orca → URL Mappings → Camera Stream URL.', 'Call it and fix the URL.'],
  hints: [
    'The OCR read text that is not on the Duo\'s customer screen. Whose screen is it?',
    (b) => `Camera app → ${hrn(b)}. Then Orca → ${hrn(b)} → URL Mappings → Camera Stream URL.`,
    (b) => `Set ${hrn(b)}'s Camera Stream URL to ${cameraUrl(b)} and rebuild PL7.`,
  ],
  fix: { handsOn: (b) => `Camera Stream URL → ${cameraUrl(b)}.` },
  success: (b) => c.all(c.eq(p.robot(rig(b)).url('camera'), cameraUrl(b)), c.nextBuild({ pipeline: 'PL7' })),
  diagnosisCall: dc(
    'Camera Stream URL points at another rig\'s camera',
    ['CFD copy changed', 'The OCR text is not a variant of the expected string — it is another screen entirely. Look at the stream.'],
    ['Tesseract broken', 'Tesseract read the text cleanly. What image was it given?'],
    ['Box shifted', 'A shifted box clips the right text; this is different text. Open the rig\'s stream.'],
  ),
  wrongButTempting: [
    wm('expected-nonsense', 'Set the expected text to the nonsense', 150, orcaSave('screenCompareImage', { fields: ['expectedText'] }), teach('You made the check match the wrong screen.', 'The OCR workaround crops the webcam screenshot — here it is the wrong webcam. (Ref §3)', 'Fix the Camera Stream URL.')),
    wm('move-box', 'Move the Screen Compare box', 0, orcaSave('screenCompareImage', { fields: ['bbox', 'x', 'y', 'w', 'h'] }), teach('Moving the box changed nothing.', 'The crop is taken from whatever camera Orca points at.', 'Check which stream the rig\'s Camera Stream URL shows.')),
  ],
  teaches: 'Ref §3 URL Mappings; the OCR workaround crops the webcam screenshot.',
};

export const INC10: IncidentDef = {
  id: 'INC10',
  name: 'Ollama down on the GPU blade',
  difficulty: 2,
  base: 250,
  parS: 180,
  severity: 'P3',
  rigs: { default: null, scope: 'none', describe: '— (infra)' },
  escalatable: false,
  unlockedBy: 'M17',
  tags: ['vision.ollama', 'arch.infra', 'tools.terminal'],
  factIds: ['F031', 'F032', 'F078'],
  ticket: { title: "Vision PoC job red: can't reach the model", reporter: 'jenkins-bot', summary: 'Java/vision-poc-receipt-check [illus.]' },
  setup: () => ({ scenario: [F('ollama.down'), OP('jenkins.startBuild', { job: 'Java/vision-poc-receipt-check', by: 'jenkins' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Jenkins', 'curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused'),
    sym('Terminal', 'curl http://10.42.1.12:11434/api/tags → curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused'),
    sym('Ollama', 'Model server unreachable'),
    sym('World', 'GPU blade fans spinning; Orca and Jenkins work (same blade ⇒ the blade is fine).'),
  ],
  diagnosisPath: ['Orca and Jenkins are up ⇒ the blade is up.', 'Port refused ⇒ the service, not the machine.', 'ssh automation@10.42.1.12 → systemctl status ollama → inactive (dead).'],
  hints: [
    'Orca and Jenkins live on the same blade and still answer. What does that rule out?',
    'Terminal: ssh automation@10.42.1.12 → systemctl status ollama.',
    'sudo systemctl restart ollama → curl http://10.42.1.12:11434/api/tags → rebuild Java/vision-poc-receipt-check.',
  ],
  fix: { handsOn: 'sudo systemctl restart ollama → curl http://10.42.1.12:11434/api/tags → {"models":[{"name":"llava:latest", …}]} → rebuild.' },
  success: () => c.all(c.eq(p.svc('ollama-vm', 'ollama'), 'UP'), c.nextBuild({ jobs: ['Java/vision-poc-receipt-check'] })),
  diagnosisCall: dc(
    'Ollama service stopped',
    ['GPU blade off', 'Orca and Jenkins run on the same blade and still answer.'],
    ['Camera stream down', 'The failing request is to port 11434 on the Ollama VM, not a camera.'],
    ['llava model deleted', 'A missing model still lets the server answer /api/tags. Here the port refuses connections.'],
  ),
  wrongButTempting: [gw('cycle-blade', 'GW13', 'Power-cycle the GPU blade (Orca, Jenkins and Ollama all live on it)')],
  teaches: 'Ref §1: Ollama runs on the 4-GPU blade as a proof of concept; the blade also hosts the Orca and Jenkins VMs.',
};

export const INC11: IncidentDef = {
  id: 'INC11',
  name: 'Banner yellow after a manual arm move',
  difficulty: 1,
  base: 200,
  parS: 120,
  severity: 'P1',
  rigs: { candidates: [...TOUCH_RIGS], default: 'wall-e', scope: 'rig', describe: 'any touch rig (default WALL-E)' },
  escalatable: false,
  unlockedBy: 'M04',
  tags: ['hw.motion', 'hw.tablet'],
  factIds: ['F231', 'F232', 'F081', 'F082', 'F235'],
  ticket: {
    title: (b) => `${hrn(b)} taps aren't landing`,
    reporter: 'jenkins-bot',
    misleading: { title: (b) => `Screen coordinates broke on ${hrn(b)}?`, reporter: 'riley' },
  },
  setup: () => ({ scenario: [F('rig.lockReleased', { rig: '$R' })] }),
  reveal: 'pipeline',
  onSpawn: () => [{ do: 'chat', author: 'riley', text: 'I just nudged the arm aside to wipe the screen.', delayS: 20 }],
  symptoms: [
    sym('Tablet', 'Yellow `Status: LOCK RELEASED — PARK REQUIRED`'),
    sym('Jenkins', (b) => `[orca] xy_touch ${rig(b)} REGISTER_HOME/Register → 409 Conflict: LOCK_RELEASED (park required)`),
    sym('Camera', 'The carriage is parked off to one side.'),
    sym('LabChat', P('{{riley}}: "I just nudged the arm aside to wipe the screen."')),
  ],
  diagnosisPath: ['409 / yellow banner ⇒ the magnetic lock.', 'Go to the rig\'s tablet.', 'Call it and Park All.'],
  hints: [
    'Read the colour of the rig\'s status banner.',
    (b) => `${hrn(b)}'s tablet → Motion Control → Park group.`,
    'Motion Control → Park → Park All. The steppers drive to the limit switches and the banner turns green.',
  ],
  fix: { handsOn: 'Tablet → Motion Control → Park → Park All. Steppers drive to the limit switches (click-click), coordinates (0,0), banner green.' },
  success: (b) => c.all(parkedAll(b), c.truthy(p.rig(rig(b)).homed), c.eq(p.rig(rig(b)).magLock, 'ENGAGED'), c.eq(p.rig(rig(b)).banner, 'GREEN')),
  diagnosisCall: dc(
    'Manual move released the magnetic lock — Park All',
    ['Screen Locations outdated', 'Stale coordinates make taps miss; this rig refuses to tap at all (409). Read the banner.'],
    ['Steppers disabled', 'Disabled steppers return 503 STEPPERS_DISABLED. This error is a 409.'],
    ['Offsets wrong', 'Offsets shift taps; they do not stop the arm. What does the tablet banner say?'],
  ),
  wrongButTempting: [
    gw('push-back', 'GW06', 'Push the carriage back by hand'),
    wm('steppers-disable', 'Steppers → Disable', 50, boundRigCommand('INC11', 'steppers.disable'), teach('Disabling the steppers left the banner yellow.', 'Only Park All drives the motors back to the limit switches at (0,0) and turns the banner green. (Ref §6)', 'Motion Control → Park All.')),
    wm('park-axis', 'Park XY / X / Y only', 0, on('rig.parkCompleted', {}, (pl, s) => pl.axes !== undefined && pl.axes !== 'all' && boundTo(s, 'INC11', pl.rigId)), teach('Partial park: the banner stays yellow.', 'Park All re-homes every axis and re-engages the lock. (Ref §6)', 'Park → Park All.')),
    wm('motor-cycle', 'MOTOR off/on', 50, boundRigSwitch('INC11', 'motor', false), teach('Cycling MOTOR did not home the arm.', 'Park All is what clears the error and turns the banner green. (Ref §6)', 'Motion Control → Park All.')),
    gw('offsets', 'GW18', 'Enter Offsets to compensate'),
  ],
  teaches: 'Ref §6: a manual move breaks the magnetic lock → yellow banner; Park All → limit switches (0,0) → green.',
};

export const INC12: IncidentDef = {
  id: 'INC12',
  name: '"The tablet is frozen" (dashboard lockout)',
  difficulty: 2,
  base: 250,
  parS: 180,
  severity: 'P2',
  rigs: { candidates: ['wall-e', 'eve'], default: 'wall-e', scope: 'rig', describe: 'any touch rig running a job (default WALL-E)' },
  escalatable: false,
  unlockedBy: 'M04',
  tags: ['hw.lockout', 'hw.tablet', 'hw.motion'],
  factIds: ['F230', 'F234', 'F235'],
  ticket: { title: (b) => `${hrn(b)}'s tablet won't respond, buttons greyed out — broken?`, reporter: 'riley' },
  setup: () => ({ scenario: [F('rig.testRunning', { rig: '$R', number: 4127, durationMs: 60000 })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Tablet', 'Overlay `TEST IN PROGRESS — CONTROLS LOCKED`'),
    sym('Orca', 'Available · in use by Jenkins #4127'),
    sym('Camera', 'The solenoid is tapping normally.'),
  ],
  diagnosisPath: ['Read the tablet overlay and the Orca row.', 'Recognise the dashboard lockout.', 'Reply; don\'t touch the rig.'],
  hints: [
    'Read exactly what the tablet overlay says.',
    (b) => `Orca → ${hrn(b)}: is a build holding it?`,
    P('Reply to {{riley}} that a test is running and the dashboard locks out during runs. Touch nothing.'),
  ],
  fix: { handsOn: 'Reply R_LOCKOUT and touch nothing until the build ends.' },
  counters: (b) => ({
    motionCommandsDuringRun: on('rig.command', { rigId: rig(b) }, (_pl, s) => {
      const r = s.lab.rigs?.[rig(b)] as { dashboardLocked?: boolean; lockedBy?: unknown } | undefined;
      return !!(r?.dashboardLocked || r?.lockedBy);
    }),
  }),
  replies: {
    wrongPenalty: 50,
    to: 'riley',
    options: [
      { id: 'R_LOCKOUT', text: 'A test is running; the dashboard locks out during runs. It frees when the job finishes.', correct: true },
      { id: 'R_REBOOT_TABLET', text: "I'll reboot the tablet.", correct: false, teach: teach('The tablet is fine.', 'The global control dashboard locks out external users while tests are active. (Ref §6)', 'Wait for the job to finish.') },
      { id: 'R_ABORT', text: "I'll abort the job so you can use it.", correct: false, teach: teach('That is someone else\'s run.', 'The lockout protects an active test. (Ref §6)', 'Wait for the job to finish.') },
    ],
  },
  success: () => c.all(c.eq(p.ticket.reply, 'R_LOCKOUT'), c.eq(p.counter('motionCommandsDuringRun'), 0)),
  diagnosisCall: dc(
    'Working as designed — dashboard lockout during an active test',
    ['Tablet crashed', 'A crashed tablet shows nothing. This one shows a specific overlay — read it.'],
    ['Pi hung', 'A hung Pi greys the banner with CONTROLLER UNREACHABLE, and the rig would not be tapping.'],
    ['Lock released', 'A released lock turns the banner yellow. What does the overlay say?'],
  ),
  wrongButTempting: [
    gw('main-motor', 'GW07', 'MAIN/MOTOR to "unfreeze" it'),
    gw('abort', 'GW19', 'Abort #4127'),
    wm('reboot-tablet', 'Reboot the tablet', 0, undefined, teach('No effect.', 'The lockout comes from the dashboard while a test is active. (Ref §6)', 'Wait for the job to finish.')),
  ],
  teaches: 'Ref §6: the global control dashboard locks out external users when tests are active.',
  variants: [
    {
      id: 'B',
      label: 'Locked and yellow — park after the run',
      overrides: {
        ticket: { title: (b) => `${hrn(b)}'s tablet is yellow and won't let me park it`, reporter: 'riley' },
        setup: () => ({ scenario: [F('rig.testRunning', { rig: '$R', number: 4127, durationMs: 60000 }), F('rig.lockReleased', { rig: '$R' })] }),
        hints: [
          'Read exactly what the tablet overlay says — and the banner colour under it.',
          'The run will end; Park All is only possible once the dashboard unlocks.',
          'Reply R_LOCKOUT, wait for #4127 to finish, then Motion Control → Park All.',
        ],
        fix: { handsOn: 'Reply R_LOCKOUT; wait for #4127 to finish; then Park All.' },
        success: (b) =>
          c.all(c.eq(p.ticket.reply, 'R_LOCKOUT'), c.eq(p.counter('motionCommandsDuringRun'), 0), c.eq(p.rig(rig(b)).banner, 'GREEN'), c.truthy(p.rig(rig(b)).homed)),
      },
    },
  ],
};

export const INC13: IncidentDef = {
  id: 'INC13',
  name: "Arm won't move (steppers disabled / MOTOR off)",
  difficulty: 1,
  base: 200,
  parS: 120,
  severity: 'P1',
  rigs: { candidates: [...TOUCH_RIGS], default: 'bumblebee', scope: 'rig', describe: 'any touch rig (default BUMBLEBEE)' },
  escalatable: false,
  unlockedBy: 'M04',
  tags: ['hw.motion', 'hw.tablet', 'hw.rigbom'],
  factIds: ['F079', 'F235', 'F236', 'F232'],
  ticket: { title: (b) => `${hrn(b)} taps nothing, arm never moves`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('rig.steppersDisabled', { rig: '$R' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `xy_touch ${rig(b)} … → 503 Service Unavailable: STEPPERS_DISABLED`),
    sym('Camera', 'No motion.'),
    sym('Tablet', 'Motion Control → Steppers shows Disable active; motion buttons toast "Steppers disabled".'),
  ],
  diagnosisPath: ['Read the 503 reason in the console.', 'Go to the rig\'s tablet (or POWER panel).', 'Call it; re-enable and Park All.'],
  hints: [
    'The console names why the arm refused to move.',
    (b) => `${hrn(b)}'s tablet → Motion Control → Steppers group.`,
    'Steppers → Enable (the banner turns yellow — position unknown) → Park → Park All.',
  ],
  fix: { handsOn: 'Steppers → Enable → banner yellow (position unknown) → Park All.' },
  success: (b) =>
    c.all(parkedAll(b), c.truthy(p.rig(rig(b)).steppersEnabled), c.eq(p.rig(rig(b)).motor, 'ON'), c.truthy(p.rig(rig(b)).homed), c.eq(p.rig(rig(b)).banner, 'GREEN')),
  diagnosisCall: dc(
    'Motor drive disabled (steppers off / MOTOR off)',
    ['Pi crashed', 'A crashed Pi fails the health check and greys the tablet. This tablet answers.'],
    ['Solenoid unplugged', 'A loose solenoid still lets the gantry move. Here nothing moves.'],
    ['Dashboard lockout', 'A lockout shows the TEST IN PROGRESS overlay. Read the console error.'],
  ),
  wrongButTempting: [
    wm('main-cycle', 'MAIN off/on (reboots the Pi)', 50, boundRigSwitch('INC13', 'main', false), teach('MAIN rebooted the Pi, not the motors.', 'MAIN feeds the controller side (Pi, tablet, webcam); MOTOR feeds the stepper/solenoid driver.', 'Use Motion Control (Steppers / Park All) or the MOTOR switch.')),
    gw('no-park', 'GW16', 'Enable without Park All, then Resolve'),
  ],
  teaches: 'Ref §1/§6 rig components; tablet Steppers/Park groups; POWER panel MAIN vs MOTOR.',
  variants: [
    {
      id: 'B',
      label: 'MOTOR switch off',
      overrides: {
        setup: () => ({ scenario: [F('rig.motorOff', { rig: '$R' })] }),
        symptoms: [
          sym('Jenkins', (b) => `xy_touch ${rig(b)} … → 503 Service Unavailable: MOTOR_POWER_LOST`),
          sym('Tablet', 'Green banner, but the motion buttons do nothing.'),
          sym('LED', 'POWER panel: MOTOR LED off, MAIN on.'),
        ],
        hints: [
          'The console names why the arm refused to move.',
          (b) => `Look at ${hrn(b)}'s front POWER panel LEDs.`,
          'MOTOR on → banner yellow → Motion Control → Park All.',
        ],
        fix: { handsOn: 'MOTOR on → banner yellow → Park All.' },
      },
    },
  ],
};

export const INC14: IncidentDef = {
  id: 'INC14',
  name: 'Taps 1.5 mm low (legacy Offsets)',
  difficulty: 3,
  base: 350,
  parS: 210,
  severity: 'P1',
  rigs: { candidates: [...TOUCH_RIGS], default: 'bumblebee', scope: 'rig', describe: 'any touch rig (default BUMBLEBEE)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.offsets', 'orca.screens', 'hw.motion'],
  factIds: ['F129', 'F130', 'F082'],
  ticket: { title: (b) => `${hrn(b)} misses 'Charge' by a hair — low on every screen`, reporter: 'morgan' },
  setup: () => ({ scenario: [F('orca.offsets', { robot: '$R', yMm: 1.5 })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Camera', 'Every tap lands ~1.5 mm below its button on all screens.'),
    sym('Jenkins', (b) => {
      const ch = truthFor(deviceType(b), 'PAYMENT')?.Charge;
      return ch ? `[orca] xy_touch ${rig(b)} PAYMENT/Charge → PHYSICAL_TAP (${ch.x.toFixed(1)}, ${(ch.y + 1.5).toFixed(1)}) (offsets +0.0/+1.5)` : `[orca] xy_touch ${rig(b)} … (offsets +0.0/+1.5)`;
    }),
    sym('Orca', 'Offset X 0.0 / Offset Y 1.5 (tooltip "Legacy").'),
  ],
  diagnosisPath: ['The error is uniform across screens ⇒ robot-level, not one Screen Location.', 'The console prints the offsets.', 'Open the robot record.', 'Call it and zero the Offsets.'],
  hints: [
    'Is the miss the same on every screen? Then the cause is per robot, not per button.',
    (b) => `Orca → ${hrn(b)} → Offset X / Offset Y.`,
    (b) => `Set ${hrn(b)}'s Offset Y to 0.0, Test tap, and let the next build confirm.`,
  ],
  fix: { handsOn: 'Offset Y = 0.0 → Test tap hits the centre; optional Park All.' },
  success: (b) => c.all(c.eq(p.robot(rig(b)).offsetX, 0), c.eq(p.robot(rig(b)).offsetY, 0), c.nextBuild({ robots: [rig(b)] })),
  diagnosisCall: dc(
    'Leftover legacy Offsets',
    ['Screen Locations wrong for this device type', 'Stale locations break one screen; this miss is identical on every screen. Look per robot.'],
    ['Limit switch broken', 'A broken limit switch fails homing with a red MOTION FAULT banner.'],
    ['Receipt QR shift', 'The QR change moved receipt buttons only. These misses are on every screen.'],
  ),
  wrongButTempting: [
    wm('edit-locations', 'Edit each Screen Location', 100, orcaSave('screenLocation'), teach('You moved shared coordinates.', 'Screen Locations are per Device Type — every rig of that type now misses. Offsets are legacy; the lab is calibrated to true (0,0). (Ref §3)', 'Zero the robot\'s Offsets.'), { repeatable: true }),
    gw('cancel-offset', 'GW18', 'Set Offset Y to −1.5 to cancel'),
  ],
  teaches: P('Ref §3 Offsets: legacy mm adjustments for imprecise limit switches; {{jared}} calibrated the lab to true (0,0), so the field is mostly deprecated.'),
};
