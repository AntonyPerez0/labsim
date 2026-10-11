/**
 * DR12 Entity Atlas (GP §2.4.3): "Where does X live?" → the Orka entity + field (Ref §3.2, F114–F156).
 * Bank of the spec's mappings plus the rest of the seven JHipster entities.
 */
import type { DrillDef } from '../../types';
import { lazyDrill } from '../common/lazy';
import { mcqItem, type McqData } from '../common/mcq';
import { N } from '../common/people';

const E = {
  swipe: 'Card Profile · Swipe (raw Track Data in MySQL)',
  diptap: 'Card Profile · Dip/Tap (file path into Gorth)',
  locations: 'Screen Locations (X/Y in mm)',
  screens: 'Screens',
  compare: 'Screen Compare Image (CFD box + expected text)',
  merchant: 'Merchant Config (click Edit to see every field)',
  urls: 'Robot · URL Mappings',
  tethered: 'Robot · USB Tethered Device Configuration (MFD/CFD)',
  offsets: 'Robot · Offsets',
  deviceType: 'Device Type (enum: dimensions, layout metrics)',
  dynamic: 'Inside the test definition (dynamic JSON, parsed at runtime)',
  nondynamic: 'Hard-coded in the pipeline script (non-dynamic)',
  name: 'Robot · Name (system identifier)',
  hrn: 'Robot · Human Readable Name (tablet text)',
  device: 'Robot · Robot Device → separate Device entity',
  robot: 'Robot entity (status flags)',
  gorth: 'Gorth repository (card definition files)',
};

const R = 'Ref §3.2';

export const ENTITY_ATLAS_ITEMS = [
  mcqItem('DR12-01', 'Raw Track Data for the standard Visa swipe card', E.swipe, [E.diptap, E.merchant, E.compare], 'Swipe profiles store raw Track Data text strings directly in the MySQL table (extracted with a hardware card-reader utility).', { tags: ['cards.swipe'], facts: ['F145', 'F146'], ref: R, category: 'Cards' }),
  mcqItem('DR12-02', 'The Gorth path of a dip card, e.g. `cards/emv/visa_std_dip.json`', E.diptap, [E.swipe, E.urls, E.merchant], 'Dip and Tap profiles store file paths pointing to card definitions inside the Gorth repository; Kallus maps the path and loads the virtual card.', { tags: ['cards.diptap'], facts: ['F147', 'F149'], ref: R, category: 'Cards', illustrative: true }),
  mcqItem('DR12-03', "The X/Y millimetre position of the 'Card' button on TENDER_CASH_DISCOUNT", E.locations, [E.screens, E.offsets, E.deviceType], 'Screen Locations map exact button placements using relative X and Y coordinates in millimetres.', { tags: ['orka.screens', 'orka.xytouch'], facts: ['F142'], ref: R, category: 'Screens' }),
  mcqItem('DR12-04', 'A CFD bounding box plus the expected text `TOTAL $10.83`', E.compare, [E.locations, E.screens, E.urls], 'The Screen Compare Image entity (the Stand Duet workaround) stores spatial bounding coordinates on the CFD alongside the expected text string.', { tags: ['orka.screencompare'], facts: ['F150', 'F153'], ref: R, category: 'Screens' }),
  mcqItem('DR12-05', 'The API Key a Go SDK pipeline exports as an environment variable', E.merchant, [E.dynamic, E.urls, E.robot], `${N.nate} extended Merchant Config with App ID, App Secret and API Key; table display limits mean you click Edit on the row to see them.`, { tags: ['orka.merchant', 'go.sdk'], facts: ['F137', 'F138', 'F139'], ref: R, category: 'Merchants' }),
  mcqItem('DR12-06', 'The Camera Stream URL of a rig (dedicated, or shared across 4 rigs)', E.urls, [E.device, E.deviceType, E.robot], 'URL Mappings hold the Robot ADB Service URL, the Camera Stream URL (dedicated per Pi or shared across 4 rigs) and the Dip, Tap and Swipe URLs.', { tags: ['orka.urls'], facts: ['F123', 'F124'], ref: R, category: 'Robot' }),
  mcqItem('DR12-07', 'Which device is the MFD and which is the CFD on a Stand 2 → Micro 2 test bed', E.tethered, [E.device, E.urls, E.deviceType], 'USB Tethered Device Configuration populates the MFD and CFD relations; if MFD is populated the pipeline treats the rig as tethered.', { tags: ['orka.tethered'], facts: ['F126', 'F127', 'F128'], ref: R, category: 'Robot' }),
  mcqItem('DR12-08', 'A legacy +1.5 mm Y correction for an imprecise limit switch', E.offsets, [E.locations, E.deviceType, E.compare], `Offsets are legacy millimetre adjustments for imprecise limit switches — mostly deprecated since ${N.jaden} calibrated the lab to a true (0,0).`, { tags: ['orka.offsets'], facts: ['F129', 'F130'], ref: R, category: 'Robot' }),
  mcqItem('DR12-09', "A device's dimensions and layout metrics", E.deviceType, [E.screens, E.device, E.locations], 'Device Type is an enum storing device dimensions, layout metrics and internal string definitions.', { tags: ['orka.devicetype'], facts: ['F121'], ref: R, category: 'Devices' }),
  mcqItem('DR12-10', 'Capabilities for a Go SDK test that are parsed at runtime', E.dynamic, [E.nondynamic, E.merchant, E.robot], `Dynamic JSON lookups (SDK frameworks, overseen by ${N.devin}): capabilities are JSON metadata inside individual test definitions, parsed at runtime.`, { tags: ['orka.capabilities'], facts: ['F132', 'F133'], ref: R, category: 'Capabilities' }),
  mcqItem('DR12-11', 'Capabilities of a traditional UI Automator suite', E.nondynamic, [E.dynamic, E.deviceType, E.urls], 'Non-dynamic lookups: traditional UI Automator suites hard-code capabilities inside the pipeline script.', { tags: ['orka.capabilities'], facts: ['F134'], ref: R, category: 'Capabilities' }),
  mcqItem('DR12-12', 'The string pipelines use to identify a robot, e.g. `wall-e`', E.name, [E.hrn, E.device, E.urls], 'A robot has a Name (the system identifier) and a Human Readable Name (the display string). Pipelines and named jobs use the Name.', { tags: ['orka.names'], facts: ['F117'], ref: R, category: 'Robot' }),
  mcqItem('DR12-13', 'The text shown on the front status tablet, e.g. `WALL-E`', E.hrn, [E.name, E.device, E.robot], 'The Human Readable Name is the display string pushed to the physical status tablet on the front of the enclosure.', { tags: ['orka.names', 'hw.tablet'], facts: ['F117', 'F118'], ref: R, category: 'Robot' }),
  mcqItem('DR12-14', 'The App Secret field for a Go SDK merchant', E.merchant, [E.dynamic, E.swipe, E.urls], `App ID, App Secret and API Key live in Merchant Config (added by ${N.nate}) — click Edit to see them.`, { tags: ['orka.merchant'], facts: ['F137', 'F138'], ref: R, category: 'Merchants' }),
  mcqItem('DR12-15', "The Robot ADB Service URL that routes to the rig's Pi", E.urls, [E.device, E.tethered, E.name], 'URL Mappings store the Robot ADB Service URL, which routes to the Pi controller.', { tags: ['orka.urls'], facts: ['F123'], ref: R, category: 'Robot' }),
  mcqItem('DR12-16', "The rig's hardware-specific Dip, Tap and Swipe URLs", E.urls, [E.diptap, E.swipe, E.merchant], 'URL Mappings also store the hardware-specific Dip, Tap and Swipe URLs.', { tags: ['orka.urls', 'cards.diptap'], facts: ['F125'], ref: R, category: 'Robot' }),
  mcqItem('DR12-17', 'The new Flux 2 after a Flux 1 → Flux 2 upgrade (keeping the Flux 1 row for rollback)', E.device, [E.deviceType, E.name, E.offsets], 'Robot Device links to a separate Device entity, so an upgrade leaves the legacy configuration intact for a quick rollback.', { tags: ['orka.device'], facts: ['F119', 'F120'], ref: R, category: 'Devices' }),
  mcqItem('DR12-18', 'A discrete layout in a transaction flow, e.g. the cash-discount tender selection prompt', E.screens, [E.locations, E.compare, E.deviceType], 'The Screens entity maps discrete UI layouts within a transaction flow relative to the target device architecture.', { tags: ['orka.screens'], facts: ['F141'], ref: R, category: 'Screens' }),
  mcqItem('DR12-19', `Operational status flags of the 40+ rigs (and the list ${N.nate} built filters for)`, E.robot, [E.merchant, E.urls, E.name], `The Robot entity tracks the pool of 40+ rigs and their status flags, with custom UI filtering built by ${N.nate}.`, { tags: ['orka.robot'], facts: ['F115', 'F116'], ref: R, category: 'Robot' }),
  mcqItem('DR12-20', 'Merchant account parameters used by Lazo for an OOBE merchant switch', E.merchant, [E.robot, E.dynamic, E.urls], 'Merchant Config stores merchant account parameters and works alongside Lazo Automation for dynamic OOBE merchant switching.', { tags: ['orka.merchant', 'lazo.oobe'], facts: ['F136', 'F140'], ref: R, category: 'Merchants' }),
  mcqItem('DR12-21', 'The virtual card definition file itself (the JSON Kallus loads for a dip)', E.gorth, [E.diptap, E.swipe, E.compare], 'The definition files live in Gorth; the Dip/Tap profile in Orka only stores the path to them. A scheduled job clones them onto the Windows boxes.', { tags: ['cards.diptap', 'arch.repos'], facts: ['F035', 'F147', 'F148'], ref: 'Ref §1, §3.2', category: 'Cards' }),
  mcqItem('DR12-22', 'Whether a rig is Available, Unavailable, Offline, Connection Failed or Reserved', E.robot, [E.device, E.merchant, E.tethered], 'Status flags are tracked on the Robot entity.', { tags: ['orka.robot', 'orka.status'], facts: ['F115', 'F100'], ref: R, category: 'Robot' }),
];

export const DR12: DrillDef<McqData> = {
  id: 'DR12',
  name: 'Entity Atlas',
  format: '“Where does X live?” → Orka entity + field',
  tags: ['orka.entities', 'orka.urls', 'orka.merchant', 'cards.swipe', 'cards.diptap', 'orka.screens'],
  unlockedBy: ['M07'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 800, silver: 1500, gold: 2200 },
  scoring: 'standard',
  items: ENTITY_ATLAS_ITEMS,
  component: lazyDrill(() => import('./View'), '#7b8cff'),
};
