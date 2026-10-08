/**
 * M02 — Know Your terminals: Device Families (Cur §2 M02). Mentor {{morgan}}, cameo {{jared}}.
 * Setup: the device library (`loc.device-library`) holds one of every LabSim plus the sealed
 * "STATION DUO 3 — UPCOMING" and "MINI 4 — UPCOMING" boxes (props only, Sim §4.4.2).
 */
import { c, on } from '../../types';
import type { Condition, LessonDef } from '../../types';
import { minigameDone, worldAction } from './helpers';

/** The 14 library items of the M02 sort (World `LIBRARY_ITEMS`) and their family tray. */
export const M02_SORT: Readonly<Record<string, 'station' | 'mini' | 'flex' | 'compact'>> = {
  'library.station-2018': 'station',
  'library.station-2': 'station',
  'library.station-duo-1': 'station',
  'library.station-duo-2': 'station',
  'library.box-duo-3': 'station',
  'library.mini-2': 'mini',
  'library.mini-3': 'mini',
  'library.box-mini-4': 'mini',
  'library.flex-1': 'flex',
  'library.flex-2': 'flex',
  'library.flex-3': 'flex',
  'library.flex-4': 'flex',
  'library.flex-pocket': 'flex',
  'library.compact': 'compact',
};

/** Every library item's latest tray placement is correct (world `library.placedOnTray`), or the sort minigame reports 14/14. */
const allSorted: Condition = c.any(
  minigameDone('family-sort', 14),
  c.custom('m02-all-sorted', 'All 14 devices on the right family tray', (_s, ctx) => {
    const last = new Map<string, boolean>();
    trayEvents(ctx.events, last);
    return Object.keys(M02_SORT).every((id) => last.get(id) === true);
  }),
);

export const M02: LessonDef = {
  moduleId: 'M02',
  mentor: 'morgan',
  setup: { preset: 'academy:M02', spawn: 'loc.coffee' },
  deck: 'deck.M02',
  realLabChecklist: [
    'Name any LabSim on sight by family: Station (2018, 2, Duo 1/2, upcoming Duo 3), Mini (2, 3, upcoming 4), Flex (1–4, Pocket) or Compact.',
    'Remember Flex 3, Flex 4 and Flex Pocket share one testing profile; the Pocket simply has no printer block.',
    'When a printerless Station Duo 2 is down, a Mini 3 is the hot-swap stand-in.',
    'Read tethered test-bed labels as rig · role (MFD = merchant, CFD = customer) · environment, e.g. MEGATRON MFD DEV1.',
    'The LabSim Compact is the Canadian-market terminal used on the Westers test beds.',
  ],
  steps: [
    { id: 'M02.01', kind: 'walk-to', hud: 'Meet {{morgan}} at the device library', location: 'loc.device-library' },
    {
      id: 'M02.02',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Every LabSim we test belongs to a family: Station, Mini, Flex, or the Compact. Learn them like your teammates' names.",
      factIds: ['F055', 'F056', 'F058', 'F061'],
    },
    {
      id: 'M02.03',
      kind: 'inspect',
      hud: 'Inspect the Station Duo 2',
      prop: 'prop.device-library.station-duo-2',
      callouts: ['Station Duo 2 — no printer'],
      manualEntryIds: ['device-families'],
      factIds: ['F055', 'F057'],
    },
    {
      id: 'M02.04',
      kind: 'interact',
      hud: 'Sort all 14 devices onto the right family tray',
      target: 'prop.family-trays',
      success: allSorted,
      objectives: [
        { id: 'M02.04.station', text: 'STATION tray: 2018, 2, Duo 1, Duo 2, Duo 3 box', done: c.custom('m02-station', 'Station tray', (_s, ctx) => trayDone(ctx.events, 'station')) },
        { id: 'M02.04.mini', text: 'MINI tray: Mini 2, Mini 3, Mini 4 box', done: c.custom('m02-mini', 'Mini tray', (_s, ctx) => trayDone(ctx.events, 'mini')) },
        { id: 'M02.04.flex', text: 'FLEX tray: Flex 1, 2, 3, 4 and Pocket', done: c.custom('m02-flex', 'Flex tray', (_s, ctx) => trayDone(ctx.events, 'flex')) },
        { id: 'M02.04.compact', text: 'COMPACT tray: Compact', done: c.custom('m02-compact', 'Compact tray', (_s, ctx) => trayDone(ctx.events, 'compact')) },
      ],
      wrongActions: [
        {
          id: 'wrong-tray',
          on: on('app.action', { app: 'world', action: 'library.placedOnTray' }, (pl) => (pl.data as { correct?: boolean } | undefined)?.correct === false),
          say: 'Not that tray. Read the lip card: the model name tells you the family.',
        },
      ],
      hints: [
        { afterS: 60, effect: 'text', text: 'Upcoming devices still have a family: the Duo 3 box is a Station, the Mini 4 box is a Mini.' },
        { afterS: 120, effect: 'text', text: 'The Flex family is the biggest: Flex 1, 2, 3, 4 and the Flex Pocket.' },
      ],
      factIds: ['F055', 'F056', 'F058', 'F061', 'F062'],
    },
    {
      id: 'M02.05',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Here's a freebie that saves hours: Flex 3, Flex 4 and Flex Pocket share the exact same testing profile. The Pocket just leaves out the printer block.",
      factIds: ['F059', 'F060'],
    },
    {
      id: 'M02.06',
      kind: 'interact',
      hud: "Hold the Flex Pocket next to the Flex 4 and find what's missing",
      target: 'prop.device-library.flex-pocket',
      success: c.any(
        worldAction('library.compare', (d) => d.item === 'library.flex-4' || d.item === 'library.flex-pocket'),
        c.happened(on('player.interacted', {}, (pl) => pl.interactableId.startsWith('library.flex-4.printer'))),
        c.happened(on('player.inspected', {}, (pl) => pl.interactableId.startsWith('library.flex-4.printer'))),
      ),
      onComplete: [{ do: 'callouts', prop: 'prop.device-library.flex-4', lines: ['Printer block — absent on Pocket'] }],
      factIds: ['F060'],
    },
    {
      id: 'M02.07',
      kind: 'dialogue',
      speaker: 'jared',
      text: "{{jared}} here. The Station Duo 2 has no printer either. When one is down, we hot-swap a Mini 3 in its place.",
      factIds: ['F057'],
    },
    { id: 'M02.08', kind: 'walk-to', hud: 'Walk to the tethered rack (MEGATRON / OPTIMUS)', location: 'loc.rack-tethered' },
    {
      id: 'M02.09',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "MFD means Merchant Facing Device: the merchant's screen. CFD means Customer Facing Device: the customer's screen. The labels tell you the rig, the role and the environment.",
      factIds: ['F054', 'F237'],
    },
    {
      id: 'M02.10',
      kind: 'inspect',
      hud: "Read MEGATRON's MFD label",
      prop: 'prop.megatron.mfd',
      callouts: ['MEGATRON  MFD  DEV1'],
      factIds: ['F237'],
    },
    {
      id: 'M02.10a',
      kind: 'inspect',
      hud: "Now read OPTIMUS's CFD label",
      prop: 'prop.optimus.cfd',
      callouts: ['OPTIMUS  CFD  STG'],
      manualEntryIds: ['mfd-cfd-tethered'],
      factIds: ['F237', 'F054'],
    },
    {
      id: 'M02.11',
      kind: 'inspect',
      hud: 'What are the glowing dongles between the screens?',
      prop: 'prop.smartstripe-probe',
      callouts: ['SmartStripe Probe (USB)'],
      factIds: ['F238'],
    },
    {
      id: 'M02.11a',
      kind: 'inspect',
      hud: 'And the white box in the dock below?',
      prop: 'prop.hub-dock',
      callouts: ['LabSim connectivity hub: Ethernet, USB, power'],
      factIds: ['F239'],
    },
    {
      id: 'M02.12',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Last one: the LabSim Compact is our Canadian-market terminal. It runs on the Westers test beds, and SETI carries one in this room. Remember Canada: it matters later for PINs.',
      factIds: ['F061'],
    },
    { id: 'M02.13', kind: 'quiz-checkpoint', checkpointId: 'CP-M02.1', title: 'Device Families', questionIds: ['Q012', 'Q013', 'Q014', 'Q015', 'Q017'] },
  ],
};

/**
 * Latest known placement of each library item from world events: `library.placedOnTray` (one item, plus
 * the tray contents `onTray`) and `library.trays` (tray contents reported when a step starts, so devices
 * sorted before the sort step began still count — they cannot be picked up again once on a tray).
 */
function trayEvents(events: readonly { type: string; payload: unknown }[], last: Map<string, boolean>): void {
  for (const e of events) {
    if (e.type !== 'app.action') continue;
    const pl = e.payload as { app?: string; action?: string; data?: { item?: string; tray?: string; correct?: boolean; onTray?: unknown } };
    if (pl.app !== 'world' || (pl.action !== 'library.placedOnTray' && pl.action !== 'library.trays')) continue;
    if (Array.isArray(pl.data?.onTray)) for (const id of pl.data.onTray) if (typeof id === 'string' && id in M02_SORT) last.set(id, true);
    if (pl.action !== 'library.placedOnTray' || !pl.data?.item) continue;
    const want = M02_SORT[pl.data.item];
    last.set(pl.data.item, pl.data.correct ?? (want !== undefined && pl.data.tray === want));
  }
}

function trayDone(events: readonly { type: string; payload: unknown }[], tray: string): boolean {
  const last = new Map<string, boolean>();
  trayEvents(events, last);
  return Object.entries(M02_SORT)
    .filter(([, t]) => t === tray)
    .every(([id]) => last.get(id) === true);
}
