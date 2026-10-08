/**
 * GP §3.5 INC51–INC58: Go SDK credentials, the Canadian PIN on an ADB bot, Dip/Tap Gort paths and the
 * stale scheduled clone, corrupted swipe Track Data, Wine card programming, the Ollama tip-math check
 * and the card-philosophy judgement.
 */
import { nextInt, pick } from '@/core/rng';
import type { IncidentBinding, IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import {
  F,
  OP,
  P,
  buildWith,
  dc,
  dcWithCorrect,
  dev,
  hrn,
  orcaSave,
  pi,
  piIp,
  reply,
  rig,
  sym,
  teach,
  v,
  wm,
} from './helpers';

const PIN_JOB = 'Java/contact-canada-pin-sale';
const FLEX_JOB = 'Java/uia-remote-regression-flex';
const GO_MERCHANT = 'GO-SDK-US-01';
const PL3_RIGS = ['wall-e', 'eve', 'bumblebee', 'johnny-5', 'baymax'];
/** Canonical Visa test-card tracks (Cur M10) — what the card-reader utility prints. */
export const CANONICAL_VISA_TRACKS = '%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?';

export const INC51: IncidentDef = {
  id: 'INC51',
  name: 'Go SDK needs App ID / App Secret / API Key',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { candidates: ['data'], default: 'data', scope: 'shared-pi', describe: 'PL6 (DATA / TARS)' },
  escalatable: false,
  unlockedBy: 'M08',
  tags: ['go.sdk', 'orca.merchant', 'jenkins.envvars'],
  factIds: ['F136', 'F137', 'F138', 'F139', 'F008', 'F009'],
  ticket: { title: 'go-sdk-sale-smoke red: missing credential', reporter: 'jenkins-bot', summary: 'Attachment LAB-2231: API Key key_sim_19c0e2', misleading: { title: 'The Go SDK is broken', reporter: 'alex' } },
  setup: () => ({ scenario: [F('merchant.credentialBlank', { merchant: GO_MERCHANT, field: 'apiKey' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'env APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY= then panic: Terminal SDK: missing credential API_KEY (env var empty)'),
    sym('Orca', 'The Merchant Config table has no App columns; Edit shows App ID app_sim_7f3a, App Secret ••••••, API Key (blank).'),
  ],
  diagnosisPath: ['The SDK panicked on an empty env var.', 'The pipeline exports it from Merchant Config.', 'The table hides those columns — click Edit.', 'Fill the blank field from the ticket attachment.'],
  hints: [
    'Which env var is empty, and where does the pipeline get it from?',
    `Orca → Merchant Config → ${GO_MERCHANT} → Edit (the table does not show every field).`,
    'Edit → paste the API Key from the ticket attachment (key_sim_19c0e2) → Save → rebuild go-sdk-sale-smoke.',
  ],
  fix: { handsOn: 'Edit → paste key_sim_19c0e2 → Save → rebuild → env shows all three set.' },
  success: () =>
    c.all(
      c.eq(p.merchant(GO_MERCHANT).appId, 'app_sim_7f3a'),
      c.eq(p.merchant(GO_MERCHANT).appSecret, 'app_secret_sim_5d21'),
      c.eq(p.merchant(GO_MERCHANT).apiKey, 'key_sim_19c0e2'),
      c.nextBuild({ pipeline: 'PL6' }),
    ),
  diagnosisCall: dc(
    'A credential is missing in Merchant Config (Edit view)',
    ['Go SDK bug', 'The SDK told you exactly which env var is empty. Where does it come from?'],
    ['Wrong device type', 'The checkout worked; the SDK failed on credentials.'],
    ['Ubi route', 'No merchant switch was involved.'],
  ),
  wrongButTempting: [
    wm('hardcode', 'Hardcode the key in the Jenkins job', 150, on('jenkins.jobSaved', { jobId: 'Java/go-sdk-sale-smoke' }), teach('Secrets in plain text.', P('{{tate}} added App ID, App Secret and API Key to Merchant Config so pipelines export them as env vars for the Go SDK. (Ref §3)'), 'Fill the field in Merchant Config → Edit.')),
    wm('ask-tate', P('Ask {{tate}} to "add the column"'), 50, undefined, teach(P('{{tate}}: "The fields exist — click Edit."'), 'Merchant Config hides fields in the table; click Edit to see all of them. (Ref §3)', 'Merchant Config → Edit.')),
  ],
  teaches: P('Ref §3 Merchant Config: {{tate}} added App ID, App Secret and API Key so pipelines export them as runtime env vars for the Go SDK; click Edit to see every field.'),
  variants: [
    {
      id: 'B',
      label: 'App Secret blank',
      overrides: {
        setup: () => ({ scenario: [F('merchant.credentialBlank', { merchant: GO_MERCHANT, field: 'appSecret' })] }),
        ticket: { title: 'go-sdk-sale-smoke red: missing credential', reporter: 'jenkins-bot', summary: 'Attachment LAB-2231: App Secret app_secret_sim_5d21 [illus.]' },
        symptoms: [sym('Jenkins', 'env APP_ID=app_sim_7f3a APP_SECRET= API_KEY=**** then panic: Terminal SDK: missing credential APP_SECRET (env var empty)')],
        hints: ['Which env var is empty, and where does the pipeline get it from?', `Orca → Merchant Config → ${GO_MERCHANT} → Edit.`, 'Paste the App Secret from the ticket attachment → Save → rebuild.'],
      },
    },
    {
      id: 'C',
      label: 'App ID blank',
      overrides: {
        setup: () => ({ scenario: [F('merchant.credentialBlank', { merchant: GO_MERCHANT, field: 'appId' })] }),
        ticket: { title: 'go-sdk-sale-smoke red: missing credential', reporter: 'jenkins-bot', summary: 'Attachment LAB-2231: App ID app_sim_7f3a' },
        symptoms: [sym('Jenkins', 'env APP_ID= APP_SECRET=**** API_KEY=**** then panic: Terminal SDK: missing credential APP_ID (env var empty)')],
        hints: ['Which env var is empty, and where does the pipeline get it from?', `Orca → Merchant Config → ${GO_MERCHANT} → Edit.`, 'Paste the App ID from the ticket attachment → Save → rebuild.'],
      },
    },
  ],
};

export const INC52: IncidentDef = {
  id: 'INC52',
  name: 'Canadian Interac PIN needs a physical bot',
  difficulty: 3,
  base: 400,
  parS: 210,
  severity: 'P1',
  rigs: { candidates: ['tars'], default: 'tars', scope: 'rig', describe: 'PL5 (pinned to an ADB bot)' },
  escalatable: false,
  unlockedBy: 'M09',
  tags: ['bots.pin', 'bots.types', 'orca.capabilities', 'cards.philosophy'],
  factIds: ['F217', 'F218', 'F219', 'F220', 'F222', 'F223', 'F225'],
  ticket: { title: 'contact-canada-pin-sale times out at PIN entry', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('jenkins.namedRobot', { job: PIN_JOB, robot: '$R' }), OP('jenkins.startBuild', { job: PIN_JOB, by: 'jenkins' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `Checked out robot ${rig(b)} (named) · PIN entry requires physical touch · FAILURE`),
    sym('Orca', 'TARS and DATA are ADB bots; SETI is the Compact touch robot on WESTERS-CA-01 (PIN required).'),
  ],
  diagnosisPath: ['The job was pinned to an ADB bot.', 'ADB bots cannot physically enter a PIN; Canada mandates physical PIN entry.', 'Target the physical Compact bot.'],
  hints: [
    'What kind of robot can type a PIN on a Canadian terminal?',
    'Jenkins → contact-canada-pin-sale → Build with Parameters → ROBOT_NAME.',
    'ROBOT_NAME=seti (or blank — SETI is the only match) and CARD_PROFILE=INTERAC_CA_DIP → SETI\'s solenoid taps the four PIN digits.',
  ],
  fix: { handsOn: 'Build with Parameters ROBOT_NAME=seti (or blank) and CARD_PROFILE=INTERAC_CA_DIP → SETI taps the PIN.' },
  success: () => c.nextBuild({ pipeline: 'PL5', robots: ['seti'], params: { CARD_PROFILE: 'INTERAC_CA_DIP' } }),
  diagnosisCall: dc(
    "ADB bots can't enter a PIN; the Canadian flow needs a physical bot",
    ['INTERAC_CA_DIP broken', 'The run never reached the card — it stopped at PIN entry. Which robot was it?'],
    ['COMPACT unsupported', 'The job ran on TARS, not on a Compact. Read the checkout line.'],
    ['Port', 'The bot connected fine; it cannot physically touch.'],
  ),
  wrongButTempting: [
    wm('bypass-merchant', 'Switch to a PIN-bypass merchant', 200, buildWith(PIN_JOB, (pp) => /^AUTO-US-NOPIN/.test(pp.MERCHANT ?? '')), teach("You'd stop testing the Canadian PIN flow.", 'ADB bots only get PIN-bypass merchants, but Canadian workflows mandate physical PIN entry. (Ref §6)', 'Run it on the physical Compact bot.')),
    wm('gen2', 'Use the Gen 2 software PIN bypass', 100, undefined, teach("It doesn't exist yet.", 'Gen 2 Software PIN Bypass is still being built with the Core OS Team. (Ref §6)', 'Use the physical bot.')),
    wm('wall-e', 'ROBOT_NAME=wall-e', 50, buildWith(PIN_JOB, (pp) => pp.ROBOT_NAME === 'wall-e'), teach('capability mismatch: deviceType COMPACT required', 'The Compact is the Canadian-market terminal on the Westers beds. (Ref §1)', 'ROBOT_NAME=seti.')),
  ],
  teaches: 'Ref §6: ADB vs physical bots; Canadian payment flows mandate physical PIN entry; the Gen 2 Software PIN Bypass is future work (physical robotics kept for card dipping); card philosophy (Visa + Canadian Interac).',
};

export const INC53: IncidentDef = {
  id: 'INC53',
  name: 'Dip/Tap card profile: wrong Gort path',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P1',
  rigs: { candidates: ['wall-e', 'eve'], default: 'wall-e', scope: 'rig', describe: 'Rack A card rigs (default WALL-E)' },
  escalatable: false,
  unlockedBy: 'M10',
  tags: ['cards.diptap', 'cards.callus', 'tools.github', 'arch.repos'],
  factIds: ['F145', 'F147', 'F148', 'F149', 'F035'],
  ticket: { title: (b) => `EMV dips fail on ${hrn(b)}: card not loaded`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('card.gortPathWrong', { profile: 'VISA_STD_DIP' }), OP('jenkins.startBuild', { job: FLEX_JOB, params: { ROBOT_NAME: '$R', CARD_PROFILE: 'VISA_STD_DIP' } })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[callus] map cards/visa/visa_std_dip.json → C:\\gort\\cards\\visa\\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)'),
    sym('GitHub', 'gort history: "Reorganise card definitions under cards/emv/ and cards/nfc/"'),
    sym('Terminal', 'ssh automation@10.42.20.1 → dir C:\\gort\\cards\\emv lists visa_std_dip.json, interac_ca_dip.json'),
  ],
  diagnosisPath: ['Callus could not find the file the profile names.', 'Gort moved the card files last week.', 'Point the profile at the new path.'],
  hints: [
    'Callus tried to load a specific file. Does it exist?',
    'GitHub → gort → cards/ history; Orca → Card Profiles → VISA_STD_DIP → Path.',
    'Set VISA_STD_DIP\'s Path to cards/emv/visa_std_dip.json, then dip once (curl POST /api/card/dip) or rebuild.',
  ],
  fix: {
    handsOn: (b) =>
      `Orca → Card Profiles → VISA_STD_DIP → Path cards/emv/visa_std_dip.json; then curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d '{"robot":"${rig(b)}","profile":"VISA_STD_DIP"}' → map cards/emv/visa_std_dip.json → C:\\gort\\cards\\emv\\visa_std_dip.json · load virtual card OK · probe ${rig(b)}: DIP.`,
  },
  success: (b) =>
    c.all(
      c.eq(p.cardProfile('VISA_STD_DIP').gortPath, 'cards/emv/visa_std_dip.json'),
      c.any(
        c.nextBuild({ robots: [rig(b)], params: { CARD_PROFILE: 'VISA_STD_DIP' } }),
        c.verify({ kind: 'event', match: on('orca.cardAction', { robotName: rig(b), profile: 'VISA_STD_DIP', ok: true }) }),
      ),
    ),
  diagnosisCall: dc(
    'The Card Profile points to an old Gort path',
    ['Clone stale', 'The box has the file — under cards/emv. Which path did Callus try?'],
    ['Collis unpowered', 'The failure is a missing file before the probe acts.'],
    ['Track data corrupted', 'Dip profiles store a Gort file path, not Track Data.'],
  ),
  wrongButTempting: [
    wm('track-into-dip', 'Paste Track Data into the dip profile', 100, orcaSave('cardProfile', { fields: ['trackData'] }), teach('Dip profiles do not use Track Data.', 'Swipe profiles store raw Track Data in MySQL; Dip and Tap profiles store file paths into Gort. (Ref §3)', 'Fix the Gort path.')),
    wm('copy-old-path', 'Copy the file back to the old path on the box', 100, on('host.fileWritten', {}, (pl) => /cards\\visa/i.test(pl.path)), teach('The next sync removes it.', 'A scheduled job clones the Gort card files onto the Windows boxes. (Ref §3)', 'Fix the profile path.')),
    wm('revert-gort', "Revert Gort's reorganisation", 150, on('git.committed', { repo: 'gort' }, (pl) => /^Revert/i.test(pl.message)), teach('Everyone else moved on.', 'The profile is the thing pointing at the old path. (Ref §3)', 'Fix the profile path.')),
  ],
  teaches: 'Ref §3: Dip & Tap profiles store file paths into Gort; Callus maps the path and loads the virtual card.',
};

export const INC54: IncidentDef = {
  id: 'INC54',
  name: 'Scheduled clone stale on the Windows box',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P1',
  rigs: { candidates: ['seti'], default: 'seti', scope: 'rig', describe: 'rigs on MINIX-02 (default SETI)' },
  escalatable: false,
  unlockedBy: 'M10',
  tags: ['cards.callus', 'cards.diptap', 'tools.terminal'],
  factIds: ['F148', 'F149', 'F147'],
  ticket: { title: (b) => `New Interac tap profile fails on ${hrn(b)}, path looks right`, reporter: 'riley' },
  setup: () => ({ scenario: [F('callus.syncStale', { host: '$BOX' }), OP('jenkins.startBuild', { job: PIN_JOB, params: { CARD_PROFILE: 'INTERAC_CA_TAP' } })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[callus] map cards/nfc/interac_ca_tap.json → C:\\gort\\cards\\nfc\\interac_ca_tap.json · FileNotFoundException (The system cannot find the path specified)'),
    sym('GitHub', 'The file exists on gort main.'),
    sym('Terminal', (b) => `ssh automation@${v(b, 'boxIp')} → schtasks /query /tn GortCardSync → GortCardSync  10/06/2026 10:00:00  Ready; dir C:\\gort\\cards\\nfc lacks the file`),
  ],
  diagnosisPath: ['The path is right and the file is on Gort.', 'Callus loads from the box\'s local clone.', 'The box missed its scheduled sync — run it now.'],
  hints: [
    'The path is right. Where does Callus actually read the file from?',
    (b) => `ssh automation@${v(b, 'boxIp')} → schtasks /query /tn GortCardSync; dir C:\\gort\\cards\\nfc.`,
    'schtasks /run /tn GortCardSync → 20 s later dir lists the file → rebuild.',
  ],
  fix: { handsOn: 'schtasks /run /tn GortCardSync → SUCCESS: Attempted to run the scheduled task "GortCardSync". → 20 s later dir lists the file → rebuild.' },
  success: (b) =>
    c.all(c.truthy(p.fs(String(b.vars.box), 'C:\\gort\\cards\\nfc\\interac_ca_tap.json').exists), c.nextBuild({ robots: [rig(b)], params: { CARD_PROFILE: 'INTERAC_CA_TAP' } })),
  diagnosisCall: dc(
    "Path is right; the box's scheduled clone is stale",
    ['Gort path wrong', 'The file is on Gort main at exactly that path. Check the box.'],
    ['Collis dead', 'The failure is a missing file before the probe acts.'],
    ['Merchant wrong', 'Callus never found the card file. Look at the Windows box.'],
  ),
  wrongButTempting: [
    wm('older-file', 'Point the profile at an older Interac file', 100, orcaSave('cardProfile', { fields: ['gortPath'] }), teach('That tests the wrong card.', 'A scheduled job clones Gort card files onto the Windows boxes; Callus loads the local copy. (Ref §3)', 'Run the sync on the box.')),
  ],
  teaches: 'Ref §3: a scheduled job clones Gort card files onto the local Windows boxes; Callus loads from the local copy.',
};

export const INC55: IncidentDef = {
  id: 'INC55',
  name: 'Swipe declined: corrupted Track Data',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P1',
  rigs: { candidates: ['wall-e'], default: 'wall-e', scope: 'rig', describe: 'swipe tests (default PL3)' },
  bind: (ctx) => ({ rig: 'wall-e', hrn: 'WALL-E', rigs: [...PL3_RIGS], vars: ctx.defaultVars('wall-e'), seed: 0, variant: ctx.variant }),
  escalatable: false,
  unlockedBy: 'M10',
  tags: ['cards.swipe', 'cards.philosophy'],
  factIds: ['F145', 'F146', 'F224'],
  ticket: { title: "Swipe step: 'Invalid track data'", reporter: 'jenkins-bot', misleading: { title: 'Collis probe broken?', reporter: 'alex' } },
  truth: (_b, lab) => ({ tracks: Object.values(lab.orca.cardProfiles).find((x) => x.name === 'VISA_STD_SWIPE')?.trackData ?? CANONICAL_VISA_TRACKS }),
  setup: () => ({ scenario: [F('card.trackDataCorrupt', { profile: 'VISA_STD_SWIPE' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[callus] swipe VISA_STD_SWIPE → probe collis-wall-e OK · [device] SWIPE_ERROR: invalid track data'),
    sym('Orca', 'Card Profile VISA_STD_SWIPE shows %B4111111111111111^SIM/VISA^301210 (truncated; Track 2 missing).'),
    sym('LED', 'Probe LED green (hardware fine).'),
  ],
  diagnosisPath: ['The probe swiped fine; the device rejected the data.', 'The profile\'s raw Track Data is truncated.', 'Re-extract it with the card reader and paste it.'],
  hints: [
    'The probe worked. What did it swipe?',
    'Orca → Card Profiles → VISA_STD_SWIPE → Track Data.',
    'At your desk, swipe the Visa test card (hotbar 5) through the USB card-reader utility and paste both tracks into the profile; rebuild.',
  ],
  fix: { handsOn: `Swipe the Visa test card through the USB card-reader utility → paste ${CANONICAL_VISA_TRACKS} → rebuild.` },
  success: () => c.all(c.eq(p.cardProfile('VISA_STD_SWIPE').trackData, c.ref(p.truth('tracks')) as never), c.nextBuild({ pipeline: 'PL3' })),
  diagnosisCall: dc(
    "The swipe profile's raw Track Data is corrupted",
    ['Collis offline', 'Callus reported the probe swipe OK and the LED is green.'],
    ['Gort path wrong', 'Swipe profiles store Track Data in MySQL, not a Gort path.'],
    ['Callus offline', 'Callus answered and swiped. Read the device error.'],
  ),
  wrongButTempting: [
    wm('gort-path', 'Give the swipe profile a Gort path', 100, orcaSave('cardProfile', { fields: ['gortPath'] }), teach('Swipe profiles do not use Gort paths.', 'Swipe profiles store raw Track Data strings directly in the MySQL table. (Ref §3)', 'Paste the extracted Track Data.')),
    wm('amex', 'Switch to AMEX_MATRIX_DIP', 100, buildWith(null, (pp) => pp.CARD_PROFILE === 'AMEX_MATRIX_DIP'), teach("That's PayCore's matrix card.", 'Your team standardises on one reliable Visa profile; PayCore runs the Visa/Discover/AmEx matrix. (Ref §6)', 'Fix VISA_STD_SWIPE.')),
  ],
  teaches: 'Ref §3: swipe profiles store raw Track Data strings in MySQL, extracted with a hardware card-reader utility. Ref §6: card philosophy.',
};

export const INC56: IncidentDef = {
  id: 'INC56',
  name: 'Wine card programming broken on a Pi',
  difficulty: 4,
  base: 550,
  parS: 360,
  severity: 'P1',
  rigs: { candidates: ['johnny-5', 'wall-e', 'eve', 'bumblebee', 'baymax', 'seti'], default: 'johnny-5', scope: 'rig', describe: 'touch + collis rigs (default JOHNNY-5)' },
  escalatable: false,
  unlockedBy: 'M05',
  tags: ['cards.wine', 'hw.pi', 'tools.terminal'],
  factIds: ['F021', 'F065', 'F019'],
  ticket: { title: (b) => `${hrn(b)}: card-programming step fails after last night's OS update`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('pi.wineBroken', { host: '$PI' }), OP('jenkins.startBuild', { job: FLEX_JOB, params: { ROBOT_NAME: '$R', DEVICE_TYPE: '$T', CARD_PROFILE: 'VISA_STD_DIP' } })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[pi] cardprog: program VISA_STD_DIP → 503 CARDPROG_UNAVAILABLE [illus.]'),
    sym('Terminal', (b) => `ssh pi@${piIp(b)} → ps aux | grep -i wine → no "wine C:\\CardProg\\CardProgrammer.exe" line; systemctl status cardprog → Active: failed`),
    sym('Terminal', 'journalctl -u cardprog -n 3 → cardprog[903]: wine: could not load kernel32.dll, status c0000135'),
    sym('Terminal', 'ls /opt/cardprog/ → wineprefix-golden/'),
  ],
  diagnosisPath: ['The Pi\'s card-programming service is down.', 'Its journal shows Wine failing to load a Windows DLL.', 'Restore the Wine prefix from the golden copy and restart the service.'],
  hints: [
    'Card programming is Windows-only software. How does it run on a Linux Pi?',
    (b) => `ssh pi@${piIp(b)} → systemctl status cardprog → journalctl -u cardprog -n 3 → ls /opt/cardprog/.`,
    'sudo systemctl stop cardprog → rm -rf /home/pi/.wine-cardprog && cp -a /opt/cardprog/wineprefix-golden /home/pi/.wine-cardprog → sudo systemctl start cardprog → rebuild.',
  ],
  fix: { handsOn: 'sudo systemctl stop cardprog → rm -rf /home/pi/.wine-cardprog && cp -a /opt/cardprog/wineprefix-golden /home/pi/.wine-cardprog → sudo systemctl start cardprog → ps aux | grep -i wine shows wine C:\\CardProg\\CardProgrammer.exe → rebuild.' },
  success: (b) => c.all(c.eq(p.svc(pi(b), 'cardprog'), 'UP'), c.nextBuild({ robots: [rig(b)], params: { CARD_PROFILE: 'VISA_STD_DIP' } })),
  diagnosisCall: dc(
    'The Wine environment for the Windows-only card tool broke',
    ['Collis offline', 'The failure is on the Pi (503 from cardprog), before any probe acts.'],
    ['Callus offline', 'Callus runs on the Minix box; this error comes from the Pi.'],
    ['Gort path', 'The card file was never loaded: the programmer itself is unavailable.'],
  ),
  wrongButTempting: [
    wm('to-nuc', 'Move card programming to NUC-03', 150, undefined, teach("That's the security-monitored Windows box we moved off.", 'Hardware control moved onto the Pis; Wine runs the Windows-only card software there. (Ref §1)', 'Repair the Wine prefix on the Pi.')),
    wm('reflash', 'Reflash the Pi (4 min)', 100, undefined, teach('Slow, and unnecessary.', 'Only the Wine prefix is broken; a golden copy sits in /opt/cardprog.', 'Restore the prefix from the golden copy.')),
  ],
  teaches: 'Ref §1: Wine on Raspberry Pi Linux emulates the Windows-only card-programming software; the Pi runs Wine card-programming emulation.',
};

/* ───────────────────────────── INC57 seeded receipt ───────────────────────────── */

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const n = (b: IncidentBinding, k: string): number => Number(b.vars[`truth.${k}`] ?? 0);

function receiptTruth(b: IncidentBinding, rng: import('@/core/rng').RngState): Record<string, number | string> {
  const subtotal = nextInt(rng, 1000, 12000);
  const pct = pick(rng, [15, 18, 20, 22]);
  const tip = Math.floor((subtotal * pct + 50) / 100);
  const real = b.variant === 'B';
  const printed = real ? tip + pick(rng, [9, 20]) : tip;
  const s = String(printed).padStart(3, '0');
  const swapped = Number(s.slice(0, -2) + s.slice(-1) + s.slice(-2, -1));
  const modelSays = real ? printed : swapped !== printed ? swapped : printed + 9;
  return {
    subtotal: subtotal / 100,
    tipPct: pct,
    expectedTip: tip / 100,
    printedTip: printed / 100,
    expectedTotal: (subtotal + tip) / 100,
    printedTotal: (subtotal + printed) / 100,
    modelSays: modelSays / 100,
    subtotalCents: subtotal,
    printedTipCents: printed,
    misreadAs: money(modelSays),
  };
}

const receiptSetup = (b: IncidentBinding) => ({
  scenario: [
    OP('ollama.seedReceipt', {
      imageRef: `img:receipt:${rig(b)}:0912`,
      deviceId: dev(b),
      subtotalCents: n(b, 'subtotalCents'),
      tipPct: n(b, 'tipPct'),
      printedTipCents: n(b, 'printedTipCents'),
      ...(b.variant === 'B' ? {} : { misreadField: 'tip', misreadAs: String(b.vars['truth.misreadAs'] ?? '') }),
    }),
    OP('jenkins.startBuild', { job: 'Java/vision-poc-receipt-check', by: 'jenkins' }),
  ],
});

const ollamaSays = (b: IncidentBinding): string =>
  `FAIL — tip of ${n(b, 'tipPct')}% on ${money(n(b, 'subtotalCents'))} should be ${money(Math.round(n(b, 'expectedTip') * 100))}; the receipt shows ${money(Math.round(n(b, 'modelSays') * 100))}.`;

const RECEIPT_CALL = (correct: 'A' | 'B') =>
  dcWithCorrect(correct, [
    ['The vision model misread a digit', 'Read the real receipt: does the printed tip match the subtotal × tip %?'],
    ["The receipt's tip math is wrong", 'Compute subtotal × tip % yourself and compare it with the printed tip.'],
    ['Ollama offline', 'Ollama answered — with a verdict. Check the verdict against the receipt.'],
    ['Camera URL wrong', 'The snapshot shows WALL-E\'s receipt. Check the numbers on it.'],
  ]);

const BUG_FIELDS = [
  { id: 'subtotal', label: 'Subtotal', unit: '$' as const, truthKey: 'subtotal' },
  { id: 'tipPct', label: 'Tip %', unit: '%' as const, truthKey: 'tipPct' },
  { id: 'expectedTip', label: 'Expected tip', unit: '$' as const, truthKey: 'expectedTip' },
  { id: 'printedTip', label: 'Printed tip', unit: '$' as const, truthKey: 'printedTip' },
  { id: 'expectedTotal', label: 'Expected total', unit: '$' as const, truthKey: 'expectedTotal' },
  { id: 'printedTotal', label: 'Printed total', unit: '$' as const, truthKey: 'printedTotal' },
];

export const INC57: IncidentDef = {
  id: 'INC57',
  name: 'Ollama tip-math receipt check: bug or misread?',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P3',
  rigs: { candidates: ['wall-e'], default: 'wall-e', scope: 'rig', describe: 'receipt rigs (default WALL-E)' },
  escalatable: false,
  unlockedBy: 'M17',
  tags: ['vision.ollama', 'vision.camera'],
  factIds: ['F031', 'F032'],
  ticket: { title: (b) => `Vision PoC flagged a tip-math failure on ${hrn(b)}'s receipt`, reporter: 'jenkins-bot' },
  truth: (b, _lab, rng) => receiptTruth(b, rng),
  setup: receiptSetup,
  reveal: 'immediate',
  symptoms: [
    sym('Ollama', (b) => `model llava, attachment ${rig(b).replace('-', '')}_receipt_0912.jpg, response: "${ollamaSays(b)}"`),
    sym('Camera', 'A zoomable receipt snapshot.'),
    sym('World', (b) => `The printed receipt can be picked up at ${hrn(b)}'s printer (E).`),
  ],
  diagnosisPath: ['Read the real receipt.', 'Compute subtotal × tip % (round half up) and the total.', 'Compare with the printed values and with what the model claims.', 'Reply (false positive) or file a bug (real bug).'],
  hints: [
    'The model is a proof of concept. What does the paper receipt actually say?',
    (b) => `Pick up the receipt at ${hrn(b)}'s printer; compute ${n(b, 'tipPct')}% of the subtotal yourself.`,
    'If the printed tip is right, reply R_FALSE_POSITIVE; if it is wrong, File bug with subtotal, tip %, expected and printed tip and totals (to the cent).',
  ],
  fix: { handsOn: 'Model misread: reply R_FALSE_POSITIVE (values attached).' },
  replies: {
    wrongPenalty: 150,
    options: [
      reply('R_FALSE_POSITIVE', 'Vision PoC misread the receipt; printed tip and total are correct (values attached).', true),
      reply('R_CONFIRM_BUG', 'Confirmed — the receipt tip math is wrong.', false, { teach: teach('You trusted the model blindly.', 'Ollama runs proof-of-concept vision checks; read the receipt yourself. (Ref §1)', 'Compare the printed values with your own maths.') }),
      reply('R_BLOCKER', 'Marking the vision check as a release blocker.', false, { teach: teach('The PoC is not a release gate.', 'Ollama runs proof-of-concept vision inspections. (Ref §1)', 'Verify the receipt and reply.') }),
    ],
  },
  success: () => c.eq(p.ticket.reply, 'R_FALSE_POSITIVE'),
  diagnosisCall: RECEIPT_CALL('A'),
  wrongButTempting: [
    wm('trust-model', 'Trust the model blindly', 150, undefined, teach('The model misread a digit.', 'Ollama vision checks are a proof of concept. (Ref §1)', 'Read the receipt and do the maths.')),
    wm('release-blocker', 'Mark the PoC as a release blocker', 50, undefined, teach('The PoC is not a release gate.', 'Ollama runs proof-of-concept inspections of receipt layouts and tip math. (Ref §1)', 'Verify, then reply or file a bug.')),
  ],
  teaches: 'Ref §1: Ollama on the 4-GPU blade runs proof-of-concept Vision LLM inspections of webcam streams for receipt layouts and tip math.',
  variants: [
    {
      id: 'B',
      label: 'Real bug: printed tip is wrong',
      overrides: {
        fix: { handsOn: 'File bug with subtotal, tip %, expected tip, printed tip, expected total and printed total (exact to the cent).' },
        replies: {
          wrongPenalty: 150,
          options: [
            reply('R_FALSE_POSITIVE', 'Vision PoC misread the receipt; printed tip and total are correct (values attached).', false, { teach: teach('The receipt really is wrong.', 'Check the printed tip against subtotal × tip %.', 'File a bug with the computed values.') }),
          ],
        },
        task: { kind: 'bug', prompt: 'File bug: receipt tip math', fields: BUG_FIELDS },
        success: () => c.all(...BUG_FIELDS.map((f) => c.approx(p.ticket.bug(f.id) as never, c.ref(p.truth(f.truthKey)) as never, 0.004))),
        diagnosisCall: RECEIPT_CALL('B'),
      },
    },
  ],
};

export const INC58: IncidentDef = {
  id: 'INC58',
  name: '"Add Discover and AmEx to our regression?" (judgement)',
  difficulty: 1,
  base: 150,
  parS: 90,
  severity: 'P3',
  rigs: { default: null, scope: 'none', describe: '—' },
  escalatable: false,
  unlockedBy: 'M10',
  tags: ['cards.philosophy'],
  factIds: ['F224', 'F225', 'F226'],
  ticket: { title: 'Should we add Discover and AmEx to tethered-tax for coverage?', reporter: 'alex' },
  setup: () => ({}),
  reveal: 'immediate',
  symptoms: [],
  diagnosisPath: ['Recall the team\'s card philosophy and who runs the full matrix.'],
  hints: [
    'Which team runs exhaustive card matrices?',
    'Your team: one reliable Visa profile plus Canadian Interac. PayCore: back-to-back Visa/Discover/AmEx.',
    'Reply R1.',
  ],
  fix: { handsOn: 'Reply R1.' },
  replies: {
    wrongPenalty: 50,
    retryAtHalfPoints: true,
    options: [
      reply('R1', 'No — our team standardises on one reliable Visa profile (plus Canadian Interac for regional flows); PayCore runs the back-to-back Visa/Discover/AmEx matrix.', true),
      reply('R2', 'Yes, add all three.', false, { teach: teach('That duplicates PayCore\'s job.', 'Your team standardises on a single reliable Visa profile; PayCore runs exhaustive Visa/Discover/AmEx matrices. (Ref §6)', 'Reply R1.') }),
      reply('R3', 'Replace Visa with AmEx.', false, { teach: teach('Visa is the team standard.', 'Your team standardises on a single reliable Visa profile. (Ref §6)', 'Reply R1.') }),
      reply('R4', 'Use Interac everywhere.', false, { teach: teach('Interac is for regional (Canadian) flows.', 'The team adds Canadian Interac for regional flows only. (Ref §6)', 'Reply R1.') }),
    ],
  },
  success: () => c.eq(p.ticket.reply, 'R1'),
  diagnosisCall: 'none',
  wrongButTempting: [],
  teaches: 'Ref §6 Card Testing Philosophy.',
};
