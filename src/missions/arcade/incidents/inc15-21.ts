/**
 * GP §3.5 INC15–INC21: solenoid connector, dip arm, the 18 V device trap, Collis probe power/ribbon,
 * the NUC disk-full migration, the receipt QR regression and the missing 5-option receipt map.
 */
import type { IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import {
  F,
  OP,
  P,
  dc,
  dev,
  deviceIp,
  gw,
  healthUrl,
  hrn,
  locationsMatch,
  orcaSave,
  probe,
  rig,
  sym,
  teach,
  truthMm,
  v,
  wm,
} from './helpers';

const QR_TYPES = ['FLEX_3', 'MINI_3', 'STATION_2018'] as const;

/** Player saved a Screen Location row belonging to `screen`. */
const savedLocationOf = (screen: string) =>
  orcaSave('screenLocation', {
    test: (pl, s) => {
      const loc = s.lab.orca.screenLocations[pl.id as number];
      const scr = loc ? s.lab.orca.screens[loc.screenId] : undefined;
      return scr?.name === screen;
    },
  });

export const INC15: IncidentDef = {
  id: 'INC15',
  name: 'Arm moves, nothing gets tapped (solenoid)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { candidates: ['eve', 'wall-e', 'bumblebee', 'johnny-5', 'baymax'], default: 'eve', scope: 'rig', describe: 'touch rigs (default EVE)' },
  escalatable: false,
  unlockedBy: 'M04',
  tags: ['hw.rigbom', 'hw.tablet', 'orca.xytouch', 'arch.flow'],
  factIds: ['F080', 'F144', 'F243', 'F096'],
  processBonuses: ['PB07', 'PB02'],
  ticket: { title: (b) => `${hrn(b)}: arm reaches the button, button never pressed`, reporter: 'jenkins-bot', misleading: { title: (b) => `${hrn(b)} coordinates are off`, reporter: 'riley' } },
  setup: () => ({ scenario: [F('rig.solenoidLoose', { rig: '$R' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Camera', 'The gantry moves correctly; the plunger never drops.'),
    sym('Jenkins', '{"result":"OK","mode":"PHYSICAL_TAP",…} then [runner] waitForScreen timed out: PaymentScreen'),
    sym('Tablet', 'Motion Control → Solenoid → Down makes no clack.'),
    sym('World', 'The connector on the carriage hangs by its wires.'),
  ],
  diagnosisPath: ['Orca says the physical tap was OK, yet the screen never changed.', 'Watch the camera: the arm arrives, nothing drops.', 'Test Solenoid Down on the tablet; inspect the carriage.', 'Call it, power down MOTOR, re-seat.'],
  hints: [
    'Orca reported the tap as OK. Watch what the plunger actually does.',
    (b) => `${hrn(b)}'s tablet → Motion Control → Solenoid → Down. Then inspect the solenoid connector on the carriage.`,
    'MOTOR off → open the enclosure door → re-seat the solenoid connector → close the door → MOTOR on → Park All → Solenoid Down/Up clacks.',
  ],
  fix: { handsOn: 'MOTOR off (PB07) → open the enclosure door → re-seat the solenoid connector → close the door → MOTOR on → Park All → Solenoid Down/Up clacks.' },
  success: (b) => c.all(c.eq(p.rig(rig(b)).solenoidConnector, 'SEATED'), c.eq(p.rig(rig(b)).banner, 'GREEN'), c.nextBuild({ robots: [rig(b)] })),
  diagnosisCall: dc(
    'Solenoid not firing (connector)',
    ['Coordinates off', 'With stale coordinates the plunger still drops — just in the wrong place. Watch the plunger.'],
    ['Steppers disabled', 'Disabled steppers stop the gantry. This gantry moves.'],
    ['Screen not rendered', 'A render race fails some taps, not every one. Test the solenoid from the tablet.'],
  ),
  wrongButTempting: [
    wm('edit-coords', 'Edit the coordinates', 100, orcaSave('screenLocation'), teach('The coordinates were right.', 'xy_touch fires an ADB touch or a physical probe tap; here the probe never drops. (Ref §3)', 'Test the solenoid from the tablet and inspect its connector.'), { repeatable: true }),
    wm('add-waits', 'Add waits in the test code', 0, undefined, teach('No effect.', 'The screen never changed because nothing touched it.', 'Fix the solenoid connector.')),
  ],
  teaches: 'Ref §1 remote-firing solenoids; Ref §3: xy_touch fires an ADB touch or a physical probe tap.',
};

export const INC16: IncidentDef = {
  id: 'INC16',
  name: 'Chip read errors (dip arm misaligned)',
  difficulty: 3,
  base: 350,
  parS: 240,
  severity: 'P1',
  rigs: { candidates: ['seti'], default: 'seti', scope: 'rig', describe: 'touch + collis rigs (default SETI)' },
  escalatable: false,
  unlockedBy: 'M04',
  tags: ['hw.collis', 'hw.rigbom', 'hw.tablet', 'cards.diptap'],
  factIds: ['F071', 'F223', 'F093', 'F241'],
  processBonuses: ['PB07'],
  ticket: { title: (b) => `${hrn(b)} Interac dips fail: 'Card read error'`, reporter: 'jenkins-bot', misleading: { title: 'INTERAC_CA_DIP profile corrupted?', reporter: 'riley' } },
  setup: () => ({ scenario: [F('rig.dipArmMisaligned', { rig: '$R' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `[callus] map cards/emv/interac_ca_dip.json → C:\\gort\\cards\\emv\\interac_ca_dip.json · load virtual card OK · probe ${rig(b)}: DIP then [device] CHIP_READ_ERROR`),
    sym('Camera', 'The white card ribbon strikes the bezel above the slot.'),
    sym('Tablet', 'Dip → In shows the same miss.'),
    sym('World', 'The arm\'s index mark is one tooth off the "63" gear mark.'),
  ],
  diagnosisPath: ['Callus loaded the card fine — the failure is at the reader.', 'Watch the dip on camera or with Dip → In.', 'Inspect the gear marks.', 'Call it; realign with power off.'],
  hints: [
    'Callus loaded the virtual card. Where does the card go wrong after that?',
    (b) => `${hrn(b)}'s tablet → Motion Control → Dip → In, and watch the ribbon card. Then look at the "63" gear mark.`,
    'Dip → Out → MOTOR off → open the door → screwdriver: loosen the two 2.5 mm hub bolts → align the marks → tighten → close the door → MOTOR on → Park All → Dip → In.',
  ],
  fix: { handsOn: 'Dip → Out → MOTOR off (PB07) → open the enclosure door → screwdriver: loosen the two 2.5 mm hub bolts → align marks → tighten → close the door → MOTOR on → Park All → Dip → In enters the slot.' },
  success: (b) => c.all(c.truthy(p.rig(rig(b)).dipArmAligned), c.eq(p.rig(rig(b)).banner, 'GREEN'), c.nextBuild({ pipeline: 'PL5' })),
  diagnosisCall: dc(
    'Dip arm misaligned',
    ['Gort path wrong', 'A wrong path fails before the dip with FileNotFoundException. Callus loaded this card OK.'],
    ['Callus offline', 'Callus answered and loaded the card. Watch the physical dip.'],
    ['Collis unpowered', 'An unpowered probe reports PROBE_OFFLINE before any dip. Watch the arm.'],
  ),
  wrongButTempting: [
    wm('edit-profile', 'Edit the card profile', 100, orcaSave('cardProfile'), teach('The profile was fine.', 'Callus loaded the virtual card; the miss is mechanical. (Ref §1)', 'Watch the dip arm and realign it.')),
    wm('swap-probe', 'Swap the Collis probe (120 s)', 0, undefined, teach('Same miss with a new probe.', 'The probe card is carried by the dip arm; the arm is off by a tooth.', 'Realign the dip arm.')),
    wm('bolts-5mm', 'Reach for 5 mm bolts', 25, undefined, teach("Those don't fit.", 'The rig uses 2.5 mm and 5 mm hardware; the dip-arm hub uses 2.5 mm. [illus.]', 'Use the 2.5 mm bit.')),
  ],
  teaches: 'Ref §1 Collis probes and dips; Ref §6: physical robotics are kept for card dipping; hardware BOM (2.5 mm / 5 mm bolts).',
};

export const INC17: IncidentDef = {
  id: 'INC17',
  name: '"Can I run it off the 24 V tap?" (18 V device trap)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { candidates: ['eve'], default: 'eve', scope: 'rig', describe: 'any rig whose device sits on a full strip (default EVE on STRIP-A)' },
  escalatable: false,
  unlockedBy: 'M03',
  tags: ['power.18v', 'power.rails'],
  factIds: ['F228', 'F229', 'F227'],
  ticket: { title: (b) => `${hrn(b)}'s device is back from repair with a new power brick. STRIP-A is full — OK to use the spare 24 V rail tap?`, reporter: 'alex' },
  setup: () => ({ scenario: [F('device.unpowered', { device: '$DEV' }), OP('power.plug', { load: 'desk-fan', kind: 'ac-strip', target: 'STRIP-A', socket: 6 })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Orca', (b) => `${hrn(b)} Available (the Pi is fine).`),
    sym('Jenkins', (b) => `PL1 on ${rig(b)} red: adb: failed to connect to '${deviceIp(b)}:5444': No route to host`),
    sym('World', (b) => `${hrn(b)}'s device is dark; its brick lies on the shelf; STRIP-A is full — outlet 6 holds a desk fan; a free 24 V rail tap and the 12 V NUC line are within reach.`),
  ],
  diagnosisPath: ['The device is dark ⇒ it needs power.', 'Recall the 18 V exception: LabSim devices go on commercial AC strips.', 'Find the non-lab load on the strip.', 'Call it and swap the fan for the brick.'],
  hints: [
    'What kind of power does a LabSim device take — and where does it never go?',
    'Look along STRIP-A for something that is not lab equipment.',
    (b) => `Unplug the desk fan from STRIP-A outlet 6 and plug ${hrn(b)}'s device brick in.`,
  ],
  fix: { handsOn: (b) => `Unplug the desk fan from STRIP-A outlet 6, plug the brick in; the device boots (30 s); PL1 on ${rig(b)} goes green.` },
  success: (b) => c.all(c.truthy(p.hwDevice(dev(b)).psuOn), c.eq(p.hwDevice(dev(b)).state, 'OK'), c.nextBuild({ robots: [rig(b)] })),
  diagnosisCall: dc(
    'Device unpowered; LabSim devices go on the AC strip, never the DC rail',
    ['Pi crashed', 'Orca shows the rig Available — the Pi answers its health check. Look at the device.'],
    ['Port 5555', '"No route to host" means nothing answered at that IP at all. Is the device on?'],
    ['ADB TCP reset', 'A reset ADB port answers "Connection refused". This is "No route to host".'],
  ),
  wrongButTempting: [
    gw('dc-tap', 'GW01', 'Plug the device into the 24 V tap, 12 V NUC line or 5 V Pi line'),
    wm('unplug-lab-load', 'Unplug MINIX-01 or the Collis probe to make room', 200, on('power.unplugged', {}, (pl) => pl.loadId === 'brick-minix-01' || pl.loadId === 'psu-collis-eve'), teach('You unplugged lab equipment.', 'MINIX-01 runs Callus and the Collis probe needs its AC power; both are lab loads. (Ref §1, §6)', 'Unplug the non-lab load (the desk fan) instead.')),
    wm('daisy-chain', 'Daisy-chain a second strip', 50, undefined, teach('Not lab practice. [illus.]', 'Free an outlet on the existing strip.', 'Unplug the desk fan.', { illustrative: true })),
  ],
  teaches: 'Ref §6 18 V exception: LabSim devices draw an irregular 18 V; they and the Collis probes bypass the DC rails and use commercial AC power strips.',
};

export const INC18: IncidentDef = {
  id: 'INC18',
  name: 'Collis probe dark',
  difficulty: 3,
  base: 400,
  parS: 210,
  severity: 'P1',
  rigs: { candidates: ['wall-e', 'eve', 'bumblebee'], default: 'wall-e', scope: 'rig', describe: 'touch + collis rigs (default WALL-E / collis-wall-e)' },
  escalatable: false,
  unlockedBy: 'M03',
  tags: ['hw.collis', 'power.18v', 'cards.callus'],
  factIds: ['F069', 'F070', 'F071', 'F229', 'F050'],
  processBonuses: ['PB07'],
  ticket: { title: (b) => `${hrn(b)} swipes fail: 'Card not detected'`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('collis.unpowered', { probe: '$PROBE' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `POST /api/card/swipe {"robot":"${rig(b)}","profile":"VISA_STD_SWIPE"} → [callus] probe ${probe(b)}: PROBE_OFFLINE`),
    sym('Terminal', (b) => {
      const probes = ['wall-e', 'eve', 'bumblebee', 'r2-d2'].map((r) => `{"id":"collis-${r}","state":"${`collis-${r}` === probe(b) ? 'OFFLINE' : 'READY'}"}`);
      return `curl http://${v(b, 'boxIp')}:9000/status → {"callus":"UP","probes":[${probes.join(',')}]}`;
    }),
    sym('LED', 'Probe status LED off.'),
    sym('World', 'Grey "UL Transaction Security" box; a free 24 V barrel lead lies next to it.'),
  ],
  diagnosisPath: ['Callus is up and one probe is offline ⇒ probe-level.', 'Look at the probe LED.', 'Call it and restore AC power.'],
  hints: [
    'Callus answers. Ask it about each probe.',
    (b) => `curl http://${v(b, 'boxIp')}:9000/status, then look at ${probe(b)}'s status LED.`,
    (b) => `Plug ${probe(b)}'s PSU back into its AC strip (never the 24 V lead). LED green, then let the next PL3 run on ${rig(b)} confirm.`,
  ],
  fix: { handsOn: (b) => `Plug ${probe(b)}'s PSU into its AC power strip; the LED turns green; PL3 on ${rig(b)} goes green.` },
  success: (b) =>
    c.all(
      c.eq(p.collis(probe(b)).power, 'AC'),
      c.eq(p.collis(probe(b)).ribbon, 'SEATED'),
      c.eq(p.collis(probe(b)).state, 'OK'),
      c.nextBuild({ pipeline: 'PL3', robots: [rig(b)] }),
    ),
  diagnosisCall: dc(
    'Collis probe unpowered / ribbon unseated',
    ['Callus box offline', 'Callus answered the status request. Which probe is it unhappy about?'],
    ['Track data corrupted', 'Bad track data fails at the device after the probe acts. This probe is offline.'],
    ['Dip arm misaligned', 'This is a swipe and the probe never acted. Look at the probe LED.'],
  ),
  wrongButTempting: [
    gw('barrel-24v', 'GW02', 'Use the free 24 V barrel lead'),
    wm('restart-callus', 'Restart Callus', 0, on('host.serviceChanged', { service: 'callus', running: false }), teach('No effect.', 'Callus was up; one probe had no power.', "Restore the probe's AC power.")),
    wm('edit-profile', 'Edit the card profile', 100, orcaSave('cardProfile'), teach('The profile was fine.', 'The probe reported PROBE_OFFLINE before any card data was used.', 'Look at the probe LED.')),
  ],
  teaches: 'Ref §1 Collis probes (UL Transaction Security): rear ribbon cables, high cost. Ref §6: AC-only power.',
  variants: [
    {
      id: 'B',
      label: 'Ribbon unseated (powered)',
      overrides: {
        setup: () => ({ scenario: [F('collis.ribbonUnseated', { probe: '$PROBE' })] }),
        symptoms: [
          sym('Jenkins', (b) => `[callus] probe ${probe(b)}: PROBE_NO_LINK`),
          sym('Terminal', (b) => `curl http://${v(b, 'boxIp')}:9000/status → {"id":"${probe(b)}","state":"NO_LINK"}`),
          sym('LED', 'Probe status LED amber.'),
        ],
        hints: [
          'Callus answers. Ask it about each probe.',
          (b) => `Look at ${probe(b)}'s LED: amber means power but no ribbon link.`,
          (b) => `Switch ${probe(b)} off, re-seat its rear ribbon cable, switch it on; LED green.`,
        ],
        fix: { handsOn: 'Probe off, re-seat the rear ribbon cable, probe on; LED green.' },
      },
    },
  ],
};

export const INC19: IncidentDef = {
  id: 'INC19',
  name: 'NUC disk full from security monitoring',
  difficulty: 5,
  base: 700,
  parS: 480,
  severity: 'P1',
  rigs: { candidates: ['bumblebee'], default: 'bumblebee', scope: 'rig', describe: 'default BUMBLEBEE' },
  escalatable: false,
  unlockedBy: 'M05',
  plannedWork: true,
  tags: ['hw.nuc', 'hw.pi', 'orca.status.connfailed', 'orca.status.offline'],
  factIds: ['F066', 'F067', 'F068', 'F020', 'F085', 'F105'],
  processBonuses: ['PB01', 'PB07'],
  ticket: { title: (b) => `${hrn(b)} Connection Failed — upstream errors from NUC-03?`, reporter: 'jenkins-bot', misleading: { title: (b) => `${hrn(b)}'s Pi is dying`, reporter: 'alex' } },
  setup: () => ({ scenario: [F('rig.motionOnNuc', { rig: '$R', host: 'nuc-03' })] }),
  reveal: 'healthCheck',
  onSpawn: () => [{ do: 'chat', author: 'jared', text: 'This is exactly why we moved hardware control onto the Pis.', delayS: 60 }],
  symptoms: [
    sym('Notes', (b) => `GET ${healthUrl(b)} → 502 Bad Gateway {"error":"motion upstream 10.42.20.3:9100 error: No space left on device"}`),
    sym('Terminal', 'ssh automation@10.42.20.3 → Get-PSDrive C → Used (GB) 237.9  Free (GB) 0.0'),
    sym('Terminal', 'dir C:\\ProgramData\\SecAgent\\logs ≈ 118 GB [illus. path]'),
    sym('World', P('NUC-03\'s sticky note: "DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J"; a USB cable labelled BUMBLEBEE MOTION runs from the NUC to the rig\'s motor PCB.')),
    sym('LabChat', P('{{jared}} (after 60 s): "This is exactly why we moved hardware control onto the Pis."')),
  ],
  diagnosisPath: [
    'The Notes JSON names the motion upstream on the NUC and "No space left on device".',
    'Confirm on the NUC: the disk is full of security-agent logs.',
    'Recognise the fix: move motion control back to the Pi — never delete security data.',
    'Call it, then migrate step by step.',
  ],
  hints: [
    'The Pi answered — read which upstream it blames.',
    'ssh automation@10.42.20.3 → Get-PSDrive C. Then follow the BUMBLEBEE MOTION cable.',
    (b) => `${hrn(b)} → Offline → MOTOR off → move the BUMBLEBEE MOTION USB to the Pi → ssh pi@${v(b, 'piIp')} → controller.yaml "motion: local" → sudo systemctl restart robot-controller → curl 200 → MOTOR on → Park All → Available.`,
  ],
  fix: {
    handsOn: (b) =>
      `${hrn(b)} → Offline (PB01) → MOTOR off (PB07) → move the BUMBLEBEE MOTION USB from NUC-03 to ${hrn(b)}'s Pi → ssh pi@${v(b, 'piIp')} → in /etc/robot-controller/controller.yaml change "motion: nuc://10.42.20.3:9100" to "motion: local" [illus.] → sudo systemctl restart robot-controller → curl -i ${healthUrl(b)} → 200 OK → MOTOR on → Park All → Available.`,
  },
  success: (b) =>
    c.all(
      c.eq(p.rig(rig(b)).motionHost, 'PI'),
      c.truthy(p.rig(rig(b)).homed),
      c.status(rig(b), 'AVAILABLE'),
      c.label(c.nextHealthCheck(c.all(c.status(rig(b), 'AVAILABLE'), c.eq(p.robot(rig(b)).lastHealthHttp, 200))), 'Waiting for the next health check'),
    ),
  diagnosisCall: dc(
    'Motion control is on a security-monitored NUC whose disk is full; move it back to the Pi',
    ['Pi SD card full', 'A full Pi disk makes the Pi itself return 500. This 502 names an upstream on 10.42.20.3.'],
    ['Callus crashed', 'The error names the motion upstream on :9100, not Callus on :9000.'],
    ['12 V fuse blown', 'A blown NUC fuse makes the NUC unreachable. This NUC answers: its disk is full.'],
  ),
  wrongButTempting: [
    gw('tamper', 'GW11', 'Delete or disable the corporate agent or its logs'),
    wm('temp-files', 'Clear temp files on the NUC', 100, on('host.diskCleaned', { hostId: 'nuc-03' }), teach('That bought a few minutes.', 'The agent refills the disk; hardware control was migrated to the Pis for exactly this reason. (Ref §1)', 'Move motion control back to the Pi.')),
    gw('reboot-nuc', 'GW17', 'Reboot the NUC (full again in 60 s)'),
  ],
  teaches: 'Ref §1: aggressive corporate security monitoring exhausted NUC disks, so physical hardware control migrated onto Raspberry Pis; Linux Pis isolate control loops from corporate Windows machines; the 12 V branch powers the NUCs.',
};

export const INC20: IncidentDef = {
  id: 'INC20',
  name: 'Receipt QR regression (lab-wide coordinate PR)',
  difficulty: 4,
  base: 600,
  parS: 420,
  severity: 'P1',
  rigs: { candidates: ['wall-e'], default: 'wall-e', scope: 'rig', describe: 'receipt rigs on 3 Device Types (FLEX_3, MINI_3, STATION_2018)' },
  bind: (ctx) => ({ rig: 'wall-e', hrn: 'WALL-E', rigs: ['wall-e', 'bumblebee', 'baymax'], vars: ctx.defaultVars('wall-e'), seed: 0, variant: ctx.variant }),
  escalatable: false,
  unlockedBy: 'M09',
  tags: ['receipt.qr', 'receipt.maps', 'orca.screens', 'jenkins.logs', 'tools.github', 'people.roles'],
  factIds: ['F213', 'F214', 'F215', 'F216', 'F129', 'F130', 'F142', 'F210', 'F211'],
  processBonuses: ['PB03', 'PB02'],
  ticket: {
    title: "pigeon-android-sale-swipe red on WALL-E, BUMBLEBEE and BAYMAX at 'select print' after this morning's firmware",
    reporter: 'jenkins-bot',
    misleading: { title: 'Printers all jammed?', reporter: 'alex' },
  },
  setup: () => ({ scenario: [F('orca.screenLocationShift', { deviceTypes: [...QR_TYPES] })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'On each rig: LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s → FAILED at "select print"'),
    sym('Camera', 'The plunger lands ~3 mm above "Print", on the QR block\'s edge.'),
    sym('World', 'The printers have paper.'),
    sym('LabChat', P('{{jared}}: "Firmware drop today. Last time the QR button broke every ruler-measured coordinate for 48 hours. Let\'s beat that."')),
  ],
  diagnosisPath: [
    'The same step fails on several rigs right after an update ⇒ layout, not hardware.',
    'Camera: the tap lands above the button.',
    "Measure each type's new positions (steel ruler snapped to the screen's top-left, or screencap + GIMP + the Device Type's px/mm).",
    'Call it, then land the 5-option coordinates for all three types.',
  ],
  hints: [
    '"select print" is only the last step attempted. Watch where the plunger lands.',
    'Orca → Screens → RECEIPT_OPTIONS_5 for FLEX_3, MINI_3 and STATION_2018: compare with what you measure on the devices.',
    P('GitHub → gort → branch fix/receipt-qr-5opt → edit config/screen-locations/<TYPE>/RECEIPT_OPTIONS_5.json for the three types → PR → {{jared}} merges if every value is within ±0.5 mm.'),
  ],
  fix: {
    handsOn: P(
      'GitHub → gort → branch fix/receipt-qr-5opt → edit config/screen-locations/<DEVICE_TYPE>/RECEIPT_OPTIONS_5.json [illus. path] for FLEX_3, MINI_3 and STATION_2018 (e.g. FLEX_3 Print 34.0/74.0 … Scan for receipt 34.0/122.0) → open a PR → {{jared}} reviews (20 s) and merges if every value is within ±0.5 mm → Orca syncs. Editing the Orca rows directly also works (without PB03). Keep RECEIPT_OPTIONS_4 unchanged.',
    ),
  },
  success: () =>
    c.all(
      ...QR_TYPES.map((t) => locationsMatch(t, 'RECEIPT_OPTIONS_5')),
      ...QR_TYPES.map((t) => locationsMatch(t, 'RECEIPT_OPTIONS_4')),
      c.label(c.nextBuild({ pipeline: 'PL3', count: 2, distinctRobots: 2 }), 'PL3 green on two different rigs'),
    ),
  diagnosisCall: dc(
    'The QR layout shifted the buttons; the 5-option coordinates are stale',
    ['Printers out of paper', '"select print" is the last step attempted before the payload timeout. Do the printers have paper?'],
    ['Callus offline', 'The card step passed; the failure is at the receipt screen. Watch where the plunger lands.'],
    ['Offsets on each rig', 'Three different device types broke at once after a firmware drop. What changed on the screen?'],
  ),
  wrongButTempting: [
    wm('reload-paper', 'Reload paper', 0, undefined, teach('The printers had paper.', '"select print" was the last step attempted before the runner timed out waiting for a printer payload. (Ref §5)', 'Watch where the plunger lands.')),
    gw('offsets', 'GW18', 'Per-rig Offsets'),
    wm('edit-opt4', 'Edit RECEIPT_OPTIONS_4', 150, savedLocationOf('RECEIPT_OPTIONS_4'), teach('You broke the QR-less map.', 'Orca keeps separate 4-option and 5-option maps for every device profile. (Ref §5)', 'Only update RECEIPT_OPTIONS_5.'), { repeatable: true }),
    wm('one-type', 'Fix one Device Type only', 0, undefined, teach('The other types stay red.', 'The QR shift moved buttons on every device profile with the feature. (Ref §5)', 'Update all three types.')),
  ],
  teaches: P('Ref §5 receipt QR regression: buttons shifted a few mm; 48 hours until {{jared}} merged a coordinate PR; a conditional 5th option; separate 4/5-option maps; the misleading "select print". Ref §3: Screen Locations in mm.'),
};

export const INC21: IncidentDef = {
  id: 'INC21',
  name: 'Missing 5-option receipt map',
  difficulty: 3,
  base: 450,
  parS: 270,
  severity: 'P1',
  rigs: { candidates: ['baymax'], default: 'baymax', scope: 'rig', describe: 'a Device Type without RECEIPT_OPTIONS_5 (default STATION_2018 / BAYMAX)' },
  escalatable: false,
  unlockedBy: 'M09',
  tags: ['receipt.maps', 'orca.screens', 'orca.devicetype'],
  factIds: ['F215', 'F216', 'F121', 'F142', 'F141'],
  processBonuses: ['PB03'],
  ticket: { title: (b) => `${hrn(b)} receipt step fails since QR receipts were switched on`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('orca.missingReceiptMap', { deviceType: '$T' })] }),
  reveal: 'pipeline',
  symptoms: [
    // Sim App. A deviation: PL3's test reaches "select print" first, so the 404 names "Print".
    sym('Jenkins', (b) => `LSTR xy_touch ${rig(b)} RECEIPT_OPTIONS_5/Print → [orca] 404 Not Found: no Screen Location for (${v(b, 'deviceType')}, RECEIPT_OPTIONS_5, "Print") → FAILED at "select print"`),
    sym('Camera', (b) => `${hrn(b)} shows 5 options incl. "Scan for receipt"; the arm is idle.`),
    sym('Orca', (b) => `Screens → ${v(b, 'deviceType')} lists only RECEIPT_OPTIONS_4.`),
  ],
  diagnosisPath: ['A 404 from Orca means the lookup had no row to return.', 'Orca → Screens for the Device Type.', 'Measure the five buttons and create the 5-option map.'],
  hints: [
    'The arm never moved — Orca had nothing to send it. Read the 404.',
    (b) => `Orca → Screens → ${v(b, 'deviceType')}: which receipt maps exist?`,
    (b) => {
      const pr = truthMm(v(b, 'deviceType'), 'RECEIPT_OPTIONS_5', 'Print');
      return `Measure the five buttons on ${hrn(b)} (ruler or screencap + GIMP), create RECEIPT_OPTIONS_5 for ${v(b, 'deviceType')} with five locations${pr ? ` (Print ≈ ${pr.x.toFixed(1)}/${pr.y.toFixed(1)} mm)` : ''}, keep _4, Test tap each.`;
    },
  ],
  fix: { handsOn: (b) => `Measure the five buttons on ${hrn(b)} → Screens → New RECEIPT_OPTIONS_5 (${v(b, 'deviceType')}) with 5 locations; keep _4; Test tap each; optionally land it as a Gort PR (PB03).` },
  success: (b) =>
    c.all(locationsMatch(v(b, 'deviceType'), 'RECEIPT_OPTIONS_5'), locationsMatch(v(b, 'deviceType'), 'RECEIPT_OPTIONS_4'), c.nextBuild({ pipeline: 'PL3', robots: [rig(b)] })),
  diagnosisCall: dc(
    (b) => `${v(b, 'deviceType')} has no 5-option map`,
    ['Merchant misconfigured', 'The device shows the 5-option screen as designed. What did Orca answer?'],
    ['Pigeon JSON names the wrong screen', 'The device really shows 5 options. Does Orca have a map for them?'],
    ['Arm not homed', 'An unhomed arm answers 409. This is a 404 from Orca.'],
  ),
  wrongButTempting: [
    wm('switch-to-4', 'Switch the test to RECEIPT_OPTIONS_4', 150, undefined, teach('The 4-option map taps "Text" where "Email" now sits.', 'Orca must keep separate 4- and 5-option maps for every device profile. (Ref §5)', 'Create the 5-option map.')),
    wm('qr-off', 'Switch QR receipts off on the merchant', 100, orcaSave('merchant', { fields: ['qrReceiptsEnabled'] }), teach("You'd stop testing the feature.", 'The QR feature adds a conditional 5th option the lab must support. (Ref §5)', 'Create the 5-option map.')),
    wm('copy-flex3', "Copy FLEX_3's values", 0, undefined, teach('Different layout — still red.', 'Device Type holds dimensions and layout metrics; each type needs its own map. (Ref §3)', 'Measure this device type.')),
    wm('edit-opt4', 'Edit RECEIPT_OPTIONS_4', 150, savedLocationOf('RECEIPT_OPTIONS_4'), teach('You changed the QR-less map.', 'Merchants without QR still use the 4-option map. (Ref §5)', 'Leave _4 alone; add _5.'), { repeatable: true }),
  ],
  teaches: 'Ref §5: Orca keeps separate 4-option and 5-option maps for every device profile. Ref §3: Device Type holds dimensions and layout.',
};
