/**
 * M07 — Orca Entities: Robot, Device, Device Type, URLs, Tethering & Offsets (Cur §2 M07).
 * Mentor {{tate}}, cameo {{jared}}.
 * Setup (`academy:M07`, Sim §4.4.2): JOHNNY-5's HRN is the typo `JONNY-5`; {{jared}} swapped its Flex 1
 * for the spare Flex 2 (`SIM-F2-000015`, no Orca row yet); its Tap URL is blank; OPTIMUS's MFD/CFD are
 * empty (pipelines treat it as standalone); BUMBLEBEE has legacy `Offset Y = 1.5` mm (low taps).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { deviceByName, deviceRow, robotByName, say } from './helpers';

const NEW_SERIAL = 'SIM-F2-000015';
const OLD_DEVICE = 'johnny-5-flex1';

const newFlex2Linked = c.custom('m07-flex2-linked', 'JOHNNY-5 → new FLEX_2 device', (s) => {
  const r = robotByName(s.lab, 'johnny-5');
  const dev = deviceRow(s.lab, r?.deviceId);
  return !!dev && dev.deviceType === 'FLEX_2' && dev.serial === NEW_SERIAL && dev.ip === '10.42.30.15';
});

const oldDeviceIntact = c.custom('m07-flex1-intact', 'Old FLEX_1 device row kept for rollback', (s) => {
  const d = deviceByName(s.lab, OLD_DEVICE);
  return !!d && d.deviceType === 'FLEX_1' && d.serial === 'SIM-F1-000015' && d.ip === '10.42.30.15';
});

const tetheredOptimus = c.custom('m07-optimus-tethered', 'OPTIMUS MFD = optimus-mfd, CFD = optimus-cfd', (s) => {
  const r = robotByName(s.lab, 'optimus');
  return deviceRow(s.lab, r?.mfdDeviceId)?.name === 'optimus-mfd' && deviceRow(s.lab, r?.cfdDeviceId)?.name === 'optimus-cfd';
});

/**
 * A BUMBLEBEE xy_touch / Test tap that landed exactly on the stored Screen Location (no legacy offset
 * applied). Orca's response never says whether a button was hit (Apps §2.9), so the check compares the
 * fired coordinate with the MINI_3 row; the camera shows the probe on the button centre.
 */
const trueTap = c.happened(
  on('orca.xyTouch', { robotName: 'bumblebee', ok: true }, (pl, s) => {
    const screen = Object.values(s.lab.orca?.screens ?? {}).find((x) => x.deviceType === 'MINI_3' && x.name === pl.screen);
    const loc = screen && Object.values(s.lab.orca?.screenLocations ?? {}).find((l) => l.screenId === screen.id && l.button === pl.button);
    return !!loc && Math.abs(loc.xMm - pl.xMm) < 0.05 && Math.abs(loc.yMm - pl.yMm) < 0.05;
  }),
);

export const M07: LessonDef = {
  moduleId: 'M07',
  mentor: 'tate',
  setup: { preset: 'academy:M07', spawn: 'loc.workstation', apps: { unlock: ['orca', 'camera', 'chat'] } },
  deck: 'deck.M07',
  realLabChecklist: [
    'Fix display typos in the Human Readable Name (it is pushed to the status tablet); never edit Name, the system identifier pipelines use.',
    'Hardware upgrade? Create a new Device row and relink Robot Device. Leave the old row untouched so rollback is one dropdown.',
    'Device Type is an enum, so Jenkins env vars like DEVICE_TYPE must be ALL CAPS (FLEX_2, not flex_2).',
    "Check a rig's URL Mappings (ADB Service, Camera Stream, Dip, Tap, Swipe) and its MFD/CFD: if MFD is populated, pipelines treat the rig as tethered.",
    'A non-zero Offset is a red flag: the lab is calibrated to a true (0,0), so Offsets are legacy.',
  ],
  steps: [
    {
      id: 'M07.01',
      kind: 'dialogue',
      speaker: 'tate',
      text: "Orca's brain is MySQL: seven core schemas, all JHipster entities. Robots, robot configuration, capabilities, merchant config, screens and screen locations, card profiles, and screen compare images. Hardware state, merchant profiles, coordinate tables: all of it lives there.",
      factIds: ['F114', 'F014', 'F013'],
    },
    {
      id: 'M07.02',
      kind: 'computer-task',
      hud: "Open JOHNNY-5's robot record",
      app: 'orca',
      route: '/robot',
      success: c.appAction('orca', 'orca.robot.editOpened', (d) => d.name === 'johnny-5'),
      showMe: [{ app: 'orca', route: '/robot', target: 'orca.robots.rowEdit:johnny-5', action: 'click' }],
      factIds: ['F117'],
    },
    {
      id: 'M07.03',
      kind: 'computer-task',
      hud: 'Fix the typo in the Human Readable Name',
      app: 'orca',
      success: c.all(c.eq(p.robot('johnny-5').hrn, 'JOHNNY-5'), c.eq(p.robot('johnny-5').name, 'johnny-5')),
      wrongActions: [
        {
          id: 'edit-name',
          on: on('orca.entitySaved', { entity: 'robot' }, (pl) => pl.fields.includes('name')),
          when: c.not(c.eq(p.robot('johnny-5').name, 'johnny-5')),
          say: 'Name is the system identifier. Pipelines use it. Leave it.',
          speaker: 'tate',
          gw: 'GW22',
        },
      ],
      showMe: [{ app: 'orca', target: 'orca.robot.field:humanReadableName', action: 'type', text: 'JOHNNY-5' }],
      factIds: ['F117', 'F118'],
    },
    {
      id: 'M07.04',
      kind: 'inspect',
      hud: "Check JOHNNY-5's tablet",
      prop: 'prop.johnny5.tablet',
      callouts: ['JOHNNY-5'],
      factIds: ['F118'],
    },
    {
      id: 'M07.05',
      kind: 'dialogue',
      speaker: 'jared',
      text: "I swapped JOHNNY-5's Flex 1 for a Flex 2 this morning. Don't edit the old device record. Make a new one.",
      factIds: ['F119', 'F120'],
    },
    {
      id: 'M07.06',
      kind: 'computer-task',
      hud: 'Create a Device for the new Flex 2 and link it to JOHNNY-5',
      app: 'orca',
      route: '/device/new',
      success: c.all(newFlex2Linked, oldDeviceIntact),
      objectives: [
        {
          id: 'M07.06.create',
          text: 'Devices → Create: FLEX_2 · SIM-F2-000015 · 10.42.30.15',
          done: c.custom('m07-flex2-row', 'FLEX_2 row exists', (s) => Object.values(s.lab.orca?.devices ?? {}).some((d) => d.serial === NEW_SERIAL && d.deviceType === 'FLEX_2')),
        },
        { id: 'M07.06.link', text: 'Robot johnny-5 → Robot Device = the new device', done: newFlex2Linked },
        { id: 'M07.06.keep', text: 'Leave the old FLEX_1 device unchanged', done: oldDeviceIntact },
      ],
      wrongActions: [
        {
          id: 'edit-old-device',
          on: on('orca.entitySaved', { entity: 'device', action: 'update' }, (pl) => pl.fields.some((f) => f === 'deviceType' || f === 'serial' || f === 'ip')),
          when: c.not(oldDeviceIntact),
          say: "Don't edit the old device record. Make a new one.",
          speaker: 'jared',
          gw: 'GW10',
        },
        {
          id: 'delete-old-device',
          on: on('orca.entitySaved', { entity: 'device', action: 'delete' }),
          when: c.not(oldDeviceIntact),
          say: 'Keep the old device row. It is your rollback if the Flex 2 misbehaves.',
          speaker: 'jared',
          gw: 'GW09',
        },
      ],
      showMe: [{ app: 'orca', route: '/device/new', target: 'orca.devices.create', action: 'click' }],
      factIds: ['F119', 'F120', 'F121'],
    },
    {
      id: 'M07.07',
      kind: 'dialogue',
      speaker: 'tate',
      text: "That's why Robot and Device are separate. If the Flex 2 misbehaves, rolling back is one dropdown. Device Type is an enum: dimensions, layout metrics, internal strings. And because it's an enum, Jenkins env vars like DEVICE_TYPE must be ALL CAPS: FLEX_2, not flex_2.",
      factIds: ['F120', 'F121', 'F122'],
    },
    {
      id: 'M07.08',
      kind: 'computer-task',
      hud: "Complete JOHNNY-5's URL mappings",
      app: 'orca',
      success: c.eq(p.robot('johnny-5').url('tap'), 'http://10.42.10.15:8000/tap'),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Every other mapping follows the same pattern on the Pi: http://10.42.10.15:8000/<action>.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Tap URL = http://10.42.10.15:8000/tap' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orca', target: 'orca.robot.field:tapUrl', action: 'type', text: 'http://10.42.10.15:8000/tap' }],
      onComplete: [say('tate', 'Notice the Camera Stream URL: Rack B shares one camera across its four rigs. Rack A rigs each have their own.')],
      factIds: ['F123', 'F124', 'F125'],
    },
    {
      id: 'M07.09',
      kind: 'computer-task',
      hud: 'OPTIMUS jobs are running as standalone. Find out why.',
      app: 'orca',
      success: tetheredOptimus,
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Open OPTIMUS's record and look at the USB Tethered Device Configuration." },
        { afterS: 120, idle: true, effect: 'text', text: 'MFD = optimus-mfd (MINI_3, 10.42.30.23), CFD = optimus-cfd (MINI_3, 10.42.30.24).' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orca', target: 'orca.robot.field:mfdDeviceId', action: 'select', text: 'optimus-mfd' }],
      factIds: ['F126', 'F128'],
    },
    {
      id: 'M07.10',
      kind: 'dialogue',
      speaker: 'tate',
      text: "If MFD is populated, the pipeline treats the rig as tethered. That's how we model nested setups, like a Station 2 tethered to a Mini 2 on MEGATRON, or nested Mini 3s on OPTIMUS.",
      factIds: ['F128', 'F127'],
    },
    {
      id: 'M07.11',
      kind: 'computer-task',
      hud: 'BUMBLEBEE keeps tapping low. Watch the camera, then check Offsets.',
      app: ['camera', 'orca'],
      route: '/stream/10.42.10.13?robot=bumblebee',
      success: c.all(
        c.eq(p.robot('bumblebee').offsetY, 0),
        trueTap,
      ),
      objectives: [
        { id: 'M07.11.watch', text: "Watch BUMBLEBEE's camera stream", done: c.appAction('camera', 'camera.stream.opened', (d) => d.robotName === 'bumblebee' || d.host === '10.42.10.13') },
        { id: 'M07.11.offset', text: 'Set Offset Y to 0.0 and save', done: c.eq(p.robot('bumblebee').offsetY, 0) },
        { id: 'M07.11.test', text: 'Run Test tap: it hits the centre', done: trueTap },
      ],
      wrongActions: [
        {
          id: 'compensate',
          on: on('orca.entitySaved', { entity: 'robot' }, (pl) => pl.fields.some((f) => f === 'offsetXMm' || f === 'offsetYMm')),
          when: c.any(c.neq(p.robot('bumblebee').offsetY, 0), c.neq(p.robot('bumblebee').offsetX, 0)),
          say: 'Offsets go to zero, not to a new fudge. The hardware is calibrated to a true zero-zero.',
          speaker: 'jared',
          gw: 'GW18',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Edit BUMBLEBEE's robot record: Offset Y should be 0.0, not a fudge." },
        { afterS: 120, idle: true, effect: 'text', text: 'Then Entities › Screen, filter MINI_3, open a screen and use ◎ Test tap with robot bumblebee.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orca', target: 'orca.robot.field:offsetYMm', action: 'type', text: '0.0' }],
      factIds: ['F129', 'F130', 'F088'],
    },
    {
      id: 'M07.12',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'Offsets were a legacy fudge for imprecise limit switches. I calibrated the whole lab to a true zero-zero, so they\'re mostly deprecated. If you see a non-zero offset, be suspicious.',
      factIds: ['F129', 'F130', 'F082'],
    },
    { id: 'M07.13', kind: 'quiz-checkpoint', checkpointId: 'CP-M07.1', title: 'Orca Entities', questionIds: ['Q119', 'Q121', 'Q122', 'Q123', 'Q127', 'Q132'] },
  ],
};
