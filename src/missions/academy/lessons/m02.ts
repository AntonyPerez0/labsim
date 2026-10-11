/**
 * M02 — Know Your terminals: Device Families (Cur §2 M02). Mentor {{morgan}}, cameo {{jared}}.
 * Setup: the device library (`loc.device-library`) holds one of every LabSim plus the sealed
 * "STAND DUET 3 — UPCOMING" and "MICRO 4 — UPCOMING" boxes (props only, Sim §4.4.2).
 */
import { c, on } from '../../types';
import type { Condition, LessonDef } from '../../types';
import { minigameDone, worldAction } from './helpers';

/** The 14 library items of the M02 sort (World `LIBRARY_ITEMS`) and their family tray. */
export const M02_SORT: Readonly<Record<string, 'stand' | 'micro' | 'flux' | 'compass'>> = {
  'library.stand-2018': 'stand',
  'library.stand-2': 'stand',
  'library.stand-duet-1': 'stand',
  'library.stand-duet-2': 'stand',
  'library.box-duet-3': 'stand',
  'library.micro-2': 'micro',
  'library.micro-3': 'micro',
  'library.box-micro-4': 'micro',
  'library.flux-1': 'flux',
  'library.flux-2': 'flux',
  'library.flux-3': 'flux',
  'library.flux-4': 'flux',
  'library.flux-pocket': 'flux',
  'library.compass': 'compass',
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
    'Name any LabSim on sight by family: Stand (2018, 2, Duet 1/2, upcoming Duet 3), Micro (2, 3, upcoming 4), Flux (1–4, Pocket) or Compass.',
    'Remember Flux 3, Flux 4 and Flux Pocket share one testing profile; the Pocket simply has no printer block.',
    'When a printerless Stand Duet 2 is down, a Micro 3 is the hot-swap stand-in.',
    'Read tethered test-bed labels as rig · role (MFD = merchant, CFD = customer) · environment, e.g. MEGATRON MFD DEV1.',
    'The LabSim Compass is the Canadian-market terminal used on the Westers test beds.',
  ],
  steps: [
    { id: 'M02.01', kind: 'walk-to', hud: 'Meet {{morgan}} at the device library', location: 'loc.device-library' },
    {
      id: 'M02.02',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Every LabSim we test belongs to a family: Stand, Micro, Flux, or the Compass. Learn them like your teammates' names.",
      factIds: ['F055', 'F056', 'F058', 'F061'],
    },
    {
      id: 'M02.03',
      kind: 'inspect',
      hud: 'Inspect the Stand Duet 2',
      prop: 'prop.device-library.stand-duet-2',
      callouts: ['Stand Duet 2 — no printer'],
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
        { id: 'M02.04.stand', text: 'STAND tray: 2018, 2, Duet 1, Duet 2, Duet 3 box', done: c.custom('m02-stand', 'Stand tray', (_s, ctx) => trayDone(ctx.events, 'stand')) },
        { id: 'M02.04.micro', text: 'MICRO tray: Micro 2, Micro 3, Micro 4 box', done: c.custom('m02-micro', 'Micro tray', (_s, ctx) => trayDone(ctx.events, 'micro')) },
        { id: 'M02.04.flux', text: 'FLUX tray: Flux 1, 2, 3, 4 and Pocket', done: c.custom('m02-flux', 'Flux tray', (_s, ctx) => trayDone(ctx.events, 'flux')) },
        { id: 'M02.04.compass', text: 'COMPASS tray: Compass', done: c.custom('m02-compass', 'Compass tray', (_s, ctx) => trayDone(ctx.events, 'compass')) },
      ],
      wrongActions: [
        {
          id: 'wrong-tray',
          on: on('app.action', { app: 'world', action: 'library.placedOnTray' }, (pl) => (pl.data as { correct?: boolean } | undefined)?.correct === false),
          say: 'Not that tray. Read the lip card: the model name tells you the family.',
        },
      ],
      hints: [
        { afterS: 60, effect: 'text', text: 'Upcoming devices still have a family: the Duet 3 box is a Stand, the Micro 4 box is a Micro.' },
        { afterS: 120, effect: 'text', text: 'The Flux family is the biggest: Flux 1, 2, 3, 4 and the Flux Pocket.' },
      ],
      factIds: ['F055', 'F056', 'F058', 'F061', 'F062'],
    },
    {
      id: 'M02.05',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Here's a freebie that saves hours: Flux 3, Flux 4 and Flux Pocket share the exact same testing profile. The Pocket just leaves out the printer block.",
      factIds: ['F059', 'F060'],
    },
    {
      id: 'M02.06',
      kind: 'interact',
      hud: "Hold the Flux Pocket next to the Flux 4 and find what's missing",
      target: 'prop.device-library.flux-pocket',
      success: c.any(
        worldAction('library.compare', (d) => d.item === 'library.flux-4' || d.item === 'library.flux-pocket'),
        c.happened(on('player.interacted', {}, (pl) => pl.interactableId.startsWith('library.flux-4.printer'))),
        c.happened(on('player.inspected', {}, (pl) => pl.interactableId.startsWith('library.flux-4.printer'))),
      ),
      onComplete: [{ do: 'callouts', prop: 'prop.device-library.flux-4', lines: ['Printer block — absent on Pocket'] }],
      factIds: ['F060'],
    },
    {
      id: 'M02.07',
      kind: 'dialogue',
      speaker: 'jared',
      text: "{{jared}} here. The Stand Duet 2 has no printer either. When one is down, we hot-swap a Micro 3 in its place.",
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
      text: 'Last one: the LabSim Compass is our Canadian-market terminal. It runs on the Westers test beds, and SETI carries one in this room. Remember Canada: it matters later for PINs.',
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
