/**
 * `labsim-lab/gort` — the core monorepo (Ref §1): virtual card definitions for Dip/Tap profiles,
 * configuration modules (screen-location maps synced into Orca, environments, Callus probe maps), the
 * Go SDK test runner and test suites. History per Sim §2.12.
 */
import type { RepoSeed, SeedCommit } from './types';
import { SCREEN_TYPES, screenLocationFile, screenLocationPath, screensForType, shifted } from './screenTruth';

interface CardDef {
  profile: string;
  brand: string;
  iface: 'CONTACT' | 'CONTACTLESS';
  pan: string;
  aid: string;
  appLabel: string;
  cvm: string[];
  pin?: string;
  atr: string;
  country: 'US' | 'CA';
}

export function cardFile(c: CardDef): string {
  const lines = [
    '{',
    `  "profile": "${c.profile}",`,
    `  "brand": "${c.brand}",`,
    `  "interface": "${c.iface}",`,
    `  "pan": "${c.pan}",`,
    '  "expiry": "3012",',
    `  "aid": "${c.aid}",`,
    `  "appLabel": "${c.appLabel}",`,
    `  "cvm": [${c.cvm.map((v) => `"${v}"`).join(', ')}],`,
    ...(c.pin ? [`  "pin": "${c.pin}",`] : []),
    `  "atr": "${c.atr}",`,
    `  "issuerCountry": "${c.country}"`,
    '}',
    '',
  ];
  return lines.join('\n');
}

const ATR_VISA = '3B 68 00 00 00 73 C8 40 12 00 90 00';
const ATR_INTERAC = '3B 6E 00 00 80 31 80 66 B0 84 0C 01 6E 01 83 00 90 00';
const ATR_AMEX = '3B 6F 00 00 80 31 E0 6B 04 31 05 02 AF 55 55 55 55 55';
const ATR_DISCOVER = '3B 6A 00 00 80 65 A2 01 01 01 3D 72 D6 43';
const ATR_CL = '3B 8F 80 01 80 4F 0C A0 00 00 03 06 03 00 01 00 00 00 00 6A';

export const CARD_DEFS: Record<string, CardDef> = {
  'cards/emv/visa_std_dip.json': { profile: 'VISA_STD_DIP', brand: 'VISA', iface: 'CONTACT', pan: '4111111111111111', aid: 'A0000000031010', appLabel: 'VISA CREDIT', cvm: ['SIGNATURE', 'NO_CVM'], atr: ATR_VISA, country: 'US' },
  'cards/emv/interac_ca_dip.json': { profile: 'INTERAC_CA_DIP', brand: 'INTERAC', iface: 'CONTACT', pan: '4506440000000017', aid: 'A0000002771010', appLabel: 'Interac', cvm: ['ONLINE_PIN', 'OFFLINE_PIN'], pin: '1234', atr: ATR_INTERAC, country: 'CA' },
  'cards/emv/amex_matrix_dip.json': { profile: 'AMEX_MATRIX_DIP', brand: 'AMEX', iface: 'CONTACT', pan: '378282246310005', aid: 'A00000002501', appLabel: 'AMERICAN EXPRESS', cvm: ['SIGNATURE', 'NO_CVM'], atr: ATR_AMEX, country: 'US' },
  'cards/emv/discover_matrix_dip.json': { profile: 'DISCOVER_MATRIX_DIP', brand: 'DISCOVER', iface: 'CONTACT', pan: '6011111111111117', aid: 'A0000001523010', appLabel: 'DISCOVER', cvm: ['SIGNATURE', 'NO_CVM'], atr: ATR_DISCOVER, country: 'US' },
  'cards/nfc/visa_std_tap.json': { profile: 'VISA_STD_TAP', brand: 'VISA', iface: 'CONTACTLESS', pan: '4111111111111111', aid: 'A0000000031010', appLabel: 'VISA CREDIT', cvm: ['NO_CVM', 'CDCVM'], atr: ATR_CL, country: 'US' },
  'cards/nfc/interac_ca_tap.json': { profile: 'INTERAC_CA_TAP', brand: 'INTERAC', iface: 'CONTACTLESS', pan: '4506440000000017', aid: 'A0000002771010', appLabel: 'Interac Flash', cvm: ['NO_CVM', 'ONLINE_PIN'], pin: '1234', atr: ATR_CL, country: 'CA' },
};

const LEGACY_CARD_PATH: Record<string, string> = {
  'cards/emv/visa_std_dip.json': 'cards/visa/visa_std_dip.json',
  'cards/nfc/visa_std_tap.json': 'cards/visa/visa_std_tap.json',
  'cards/emv/interac_ca_dip.json': 'cards/interac/interac_ca_dip.json',
  'cards/emv/amex_matrix_dip.json': 'cards/paycore/amex_matrix_dip.json',
  'cards/emv/discover_matrix_dip.json': 'cards/paycore/discover_matrix_dip.json',
};

const README = `# gort

Core monorepo of the LabSim automation testing ecosystem. Named after the robot from
*The Day the Earth Stood Still* (it is a repo, not a rig).

| Folder | What lives there |
|---|---|
| \`cards/\` | Virtual card definitions for **Dip** (\`cards/emv/\`) and **Tap** (\`cards/nfc/\`) profiles. Orca's Card Profile rows store a path into this folder; the \`GortCardSync\` scheduled task clones the files onto every Windows/Minix box (\`C:\\gort\\cards\\…\`) where Callus loads them into the Collis probes. Swipe profiles are NOT here: their raw Track Data lives in Orca's MySQL table. |
| \`config/\` | Configuration modules. \`config/screen-locations/<DEVICE_TYPE>/<SCREEN>.json\` is the source of truth for Orca's Screens & Screen Locations: a merge to \`main\` syncs the rows into Orca (Jared reviews every coordinate PR). \`config/environments/\` holds backend targets, \`config/callus/\` the probe maps. |
| \`go-sdk/\` | Terminal SDK runner and its JSON test definitions. Capabilities are declared **inside each test** (dynamic JSON lookup — David's SDK frameworks); Orca parses them at checkout. |
| \`suites/\` | Cross-framework suites, e.g. Contact Canada (Westers beds) which uses both the pipeline's hard-coded capabilities and the suite's dynamic JSON. |

## Rules
* Coordinates are **millimetres from the screen's top-left (0,0)**, as calibrated by the limit switches.
  No per-rig offsets — fix the map instead.
* Every Device Type keeps **both** \`RECEIPT_OPTIONS_4\` and \`RECEIPT_OPTIONS_5\` (the "Scan for receipt" QR
  option is conditional per merchant).
* \`main\` is protected: open a PR. CODEOWNERS: \`config/screen-locations/\` → @jared, \`go-sdk/\` → @david.
`;

const CARDS_README = `# Card definitions

One JSON file per Dip/Tap card profile. The file name is referenced by Orca's Card Profile \`Path\`
(e.g. \`cards/emv/visa_std_dip.json\`).

* \`cards/emv/\` — contact (chip) cards, \`"interface": "CONTACT"\`
* \`cards/nfc/\` — contactless cards, \`"interface": "CONTACTLESS"\`

Fields: \`profile\`, \`brand\`, \`interface\`, \`pan\`, \`expiry\` (YYMM), \`aid\`, \`appLabel\`, \`cvm\`, optional
\`pin\` (Interac), \`atr\`, \`issuerCountry\`. Test PANs only. After merging, either wait for the daily
10:00 \`GortCardSync\` or run \`schtasks /run /tn GortCardSync\` on each Callus box.
`;

const ENV = (name: string, host: string): string => `# Backend environment ${name.toUpperCase()}
name: ${name.toUpperCase()}
api: https://api${name}.labsim.example
sandbox: https://apisandbox.${name}.labsim.example/v1
ubi: https://ubi.${name}.labsim.example
payments:
  gateway: ${host}
  timeoutMs: 30000
`;

const CALLUS_PROBES = `# Callus probe map (which box drives which Collis / SmartStripe probe)
MINIX-01:
  listen: 9000
  probes: [collis-wall-e, collis-eve, collis-bumblebee, collis-r2-d2]
MINIX-02:
  listen: 9000
  probes: [collis-johnny-5, collis-baymax, collis-seti, collis-rosie, smartstripe-megatron, smartstripe-optimus]
NUC-03:
  # Retired from hardware control (corporate agent filled the disk). Do not add probes here. -J
  probes: []
cardsRoot: 'C:\\gort\\cards'
`;

const SYNC_CONFIG = `# gort -> Orca sync (runs on merge to main)
screenLocations:
  source: config/screen-locations/**/*.json
  target: http://orca.lab.local:8080/api/screen-locations
  mode: upsert-replace   # replaces a screen's locations with the file's buttons
  unit: mm
cards:
  source: cards/**
  delivery: GortCardSync   # Windows Task Scheduler, daily 10:00
`;

const GO_MOD = `module github.com/labsim-lab/gort/go-sdk

go 1.22

require (
\tgithub.com/labsim-lab/terminal-sdk v1.14.2
\tgithub.com/stretchr/testify v1.9.0
)
`;

const RUNNER_GO = `// Package runner executes Go SDK JSON test definitions against a lab device checked out from Orca.
package runner

import (
\t"encoding/json"
\t"fmt"
\t"os"

\tlabsim "github.com/labsim-lab/terminal-sdk"
)

// TestDef is the JSON shape of go-sdk/tests/*.json. Capabilities are read by Orca (dynamic lookup);
// the runner ignores them.
type TestDef struct {
\tName         string                 \`json:"name"\`
\tSDK          string                 \`json:"sdk"\`
\tCapabilities map[string]interface{} \`json:"capabilities"\`
\tMerchant     string                 \`json:"merchant"\`
\tSteps        []Step                 \`json:"steps"\`
}

// Step is one SDK operation.
type Step struct {
\tOp   string                 \`json:"op"\`
\tArgs map[string]interface{} \`json:"args"\`
}

// Load reads a test definition and expands \${VAR} from the environment Jenkins injected.
func Load(path string) (*TestDef, error) {
\traw, err := os.ReadFile(path)
\tif err != nil {
\t\treturn nil, err
\t}
\tvar def TestDef
\tif err := json.Unmarshal([]byte(os.ExpandEnv(string(raw))), &def); err != nil {
\t\treturn nil, fmt.Errorf("parse %s: %w", path, err)
\t}
\treturn &def, nil
}

// Run executes every step in order and stops at the first error.
func Run(def *TestDef, log func(string)) error {
\tvar client *labsim.Client
\tfor _, s := range def.Steps {
\t\tswitch s.Op {
\t\tcase "connect":
\t\t\tc, err := connect(s.Args)
\t\t\tif err != nil {
\t\t\t\treturn err
\t\t\t}
\t\t\tclient = c
\t\tcase "sale":
\t\t\tif err := sale(client, s.Args, log); err != nil {
\t\t\t\treturn err
\t\t\t}
\t\tcase "printReceipt":
\t\t\tif err := printReceipt(client, log); err != nil {
\t\t\t\treturn err
\t\t\t}
\t\tdefault:
\t\t\treturn fmt.Errorf("unknown op %q", s.Op)
\t\t}
\t}
\treturn nil
}
`;

const STEPS_GO = `package runner

import (
\t"fmt"
\t"os"
\t"strings"

\tlabsim "github.com/labsim-lab/terminal-sdk"
)

// connect needs the merchant's App ID / App Secret / API Key. Jenkins exports them from Orca's
// Merchant Config (fields added by Tate) as APP_ID, APP_SECRET and API_KEY.
func connect(args map[string]interface{}) (*labsim.Client, error) {
\tfor _, k := range []string{"APP_ID", "APP_SECRET", "API_KEY"} {
\t\tif strings.TrimSpace(os.Getenv(k)) == "" {
\t\t\tpanic(fmt.Sprintf("Terminal SDK: missing credential %s (env var empty)", k))
\t\t}
\t}
\treturn labsim.NewClient(labsim.Config{
\t\tAppID:     os.Getenv("APP_ID"),
\t\tAppSecret: os.Getenv("APP_SECRET"),
\t\tAPIKey:    os.Getenv("API_KEY"),
\t\tDeviceIP:  os.Getenv("MFD_IP"),
\t\tPort:      5444,
\t})
}

func sale(c *labsim.Client, args map[string]interface{}, log func(string)) error {
\tamount := int64(args["amountCents"].(float64))
\tres, err := c.Sale(labsim.SaleRequest{AmountCents: amount, TestCard: args["cardProfile"].(string)})
\tif err != nil {
\t\treturn err
\t}
\tlog(fmt.Sprintf("[go-sdk] Sale %d → %s (%s)", amount, res.Result, res.AuthCode))
\treturn nil
}

func printReceipt(c *labsim.Client, log func(string)) error {
\tif err := c.PrintReceipt(); err != nil {
\t\tlog("[go-sdk] PrintReceipt → " + err.Error())
\t\treturn err
\t}
\tlog("[go-sdk] PrintReceipt → OK")
\treturn nil
}
`;

const MAIN_GO = `package main

import (
\t"fmt"
\t"os"

\t"github.com/labsim-lab/gort/go-sdk/runner"
)

func main() {
\tif len(os.Args) < 2 {
\t\tfmt.Fprintln(os.Stderr, "usage: gosdk-run <tests/file.json>")
\t\tos.Exit(2)
\t}
\tdef, err := runner.Load(os.Args[1])
\tif err != nil {
\t\tfmt.Fprintln(os.Stderr, err)
\t\tos.Exit(1)
\t}
\tif err := runner.Run(def, func(s string) { fmt.Println(s) }); err != nil {
\t\tos.Exit(1)
\t}
}
`;

const GO_README = `# Go SDK runner

Runs the JSON tests in \`tests/\` against an ADB bot checked out by Orca (\`Java/go-sdk-sale-smoke\`).

* **Capabilities live in the test** (\`"capabilities": { "goSdk": true, "printer": true }\`). Orca matches them at
  runtime (dynamic JSON lookup). Remove a key and Orca may hand you a rig without that hardware.
* Credentials come from the merchant's Merchant Config (App ID / App Secret / API Key) via Jenkins env vars
  \`APP_ID\`, \`APP_SECRET\`, \`API_KEY\`. An empty value panics at \`connect\`.
* ADB bots cannot press a PIN pad: use PIN-bypass merchants only.
`;

const SALE_RECEIPT_V1 = `{
  "name": "Go SDK sale with printed receipt",
  "sdk": "go",
  "merchant": "\${MERCHANT}",
  "steps": [
    { "op": "connect",       "args": { "appId": "\${APP_ID}", "appSecret": "\${APP_SECRET}", "apiKey": "\${API_KEY}" } },
    { "op": "sale",          "args": { "amountCents": 1000, "cardProfile": "\${CARD_PROFILE}" } },
    { "op": "printReceipt",  "args": {} }
  ]
}
`;

export const SALE_RECEIPT = `{
  "name": "Go SDK sale with printed receipt",
  "sdk": "go",
  "capabilities": { "goSdk": true, "printer": true },
  "merchant": "\${MERCHANT}",
  "steps": [
    { "op": "connect",       "args": { "appId": "\${APP_ID}", "appSecret": "\${APP_SECRET}", "apiKey": "\${API_KEY}" } },
    { "op": "sale",          "args": { "amountCents": 1000, "cardProfile": "\${CARD_PROFILE}" } },
    { "op": "printReceipt",  "args": {} }
  ]
}
`;

const PIN_SALE = `{ "name": "Contact Canada Interac PIN sale",
  "capabilities": { "deviceType": "COMPACT", "physicalTouch": true },
  "card": "INTERAC_CA_DIP", "expectPin": true, "receipt": "RECEIPT_OPTIONS_4" }
`;

const CC_README = `# Contact Canada (Westers test beds)

Canadian payment flows mandate **physical PIN entry** (Secure Touch), so these suites only run on
physical touch robots holding a LabSim Compact (SETI, GERTY, MOTHER).

The pipeline \`Java/contact-canada-pin-sale\` uses BOTH capability styles:
* non-dynamic, hard-coded in the Jenkinsfile: \`[deviceType: 'COMPACT', physicalTouch: true]\`
* dynamic, from \`pin_sale.json\` → \`"capabilities"\`

They must agree; Orca rejects a conflicting key with \`409 Conflict: capability conflict\`.
Card: one Interac profile (\`INTERAC_CA_DIP\`, PIN \`1234\`) — the team's single-card philosophy.
`;

const MATRIX = `{
  "name": "PayCore card matrix (back-to-back)",
  "owner": "PayCore",
  "capabilities": { "cardMatrix": true },
  "cards": ["VISA_STD_DIP", "DISCOVER_MATRIX_DIP", "AMEX_MATRIX_DIP"],
  "amountCents": 1000
}
`;

function screenFiles(filter: (screen: string) => boolean, dyFor?: (type: string, screen: string) => number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const type of SCREEN_TYPES) {
    const screens = screensForType(type);
    for (const [screen, buttons] of Object.entries(screens)) {
      if (!filter(screen)) continue;
      const dy = dyFor ? dyFor(type, screen) : 0;
      out[screenLocationPath(type, screen)] = screenLocationFile(type, screen, dy ? shifted(buttons, dy) : buttons);
    }
  }
  return out;
}

const isFive = (s: string): boolean => s === 'RECEIPT_OPTIONS_5' || s === 'CFD_RECEIPT_OPTIONS_5';

function cardsAt(paths: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(paths).map(([p, def]) => [p, cardFile(CARD_DEFS[def]!)]));
}

const INITIAL: SeedCommit = {
  short: '1e7b2a0',
  message: 'Initial import from the legacy automation share',
  author: 'jared',
  at: '2026-08-03 10:14',
  changes: {
    'README.md': README,
    'cards/README.md': CARDS_README,
    ...Object.fromEntries(Object.entries(LEGACY_CARD_PATH).map(([now, legacy]) => [legacy, cardFile(CARD_DEFS[now]!)])),
    'config/environments/dev1.yaml': ENV('dev1', 'gw-dev1.lab.local:443'),
    'config/environments/dev2.yaml': ENV('dev2', 'gw-dev2.lab.local:443'),
    'config/environments/stg.yaml': ENV('stg', 'gw-stg.lab.local:443'),
    'config/environments/qa.yaml': ENV('qa', 'gw-qa.lab.local:443'),
    'config/environments/int.yaml': ENV('int', 'gw-int.lab.local:443'),
    'config/callus/probes.yaml': CALLUS_PROBES,
    'config/sync.yaml': SYNC_CONFIG,
    ...screenFiles((s) => !isFive(s)),
    'go-sdk/go.mod': GO_MOD,
    'go-sdk/README.md': GO_README,
    'go-sdk/cmd/gosdk-run/main.go': MAIN_GO,
    'go-sdk/runner/runner.go': RUNNER_GO,
    'go-sdk/runner/steps.go': STEPS_GO,
    'go-sdk/tests/sale_receipt.json': SALE_RECEIPT_V1,
    'suites/contact-canada/README.md': CC_README,
    'suites/contact-canada/pin_sale.json': PIN_SALE,
    'suites/paycore/card_matrix.json': MATRIX,
  },
};

/** MINI_3 5-option rows were measured on a pre-release build: 3.0 mm too high until #418. */
export const STALE_MINI3_DY = -3.0;

const REORG: Record<string, string | null> = {};
for (const [now, legacy] of Object.entries(LEGACY_CARD_PATH)) {
  REORG[legacy] = null;
  REORG[now] = cardFile(CARD_DEFS[now]!);
}

const MINI3_FIX = screenFiles((s) => s === 'RECEIPT_OPTIONS_5');
const MINI3_FIX_ONLY = { 'config/screen-locations/MINI_3/RECEIPT_OPTIONS_5.json': MINI3_FIX['config/screen-locations/MINI_3/RECEIPT_OPTIONS_5.json']! };

const COMMITS: SeedCommit[] = [
  INITIAL,
  {
    short: 'a11f2c3',
    message: 'go-sdk: sale_receipt capabilities',
    author: 'david',
    at: '2026-09-22 14:05',
    changes: { 'go-sdk/tests/sale_receipt.json': SALE_RECEIPT },
  },
  {
    short: '0d3e441',
    message: 'Add 5-option receipt maps for all profiles (#417)',
    author: 'jared',
    at: '2026-09-25 17:48',
    changes: screenFiles(isFive, (type, screen) => (type === 'MINI_3' && screen === 'RECEIPT_OPTIONS_5' ? STALE_MINI3_DY : 0)),
  },
  {
    short: '5be7c90',
    message: 'Reorganise card definitions under cards/emv/ and cards/nfc/',
    author: 'jared',
    at: '2026-09-28 11:20',
    changes: REORG,
  },
  {
    short: '9f02a1b',
    message: 'Update MINI_3 receipt coordinates (#418)',
    author: 'jared',
    at: '2026-10-02 16:31',
    changes: MINI3_FIX_ONLY,
  },
  {
    short: 'c41d9e2',
    message: 'Add INTERAC_CA_TAP card definition',
    author: 'riley',
    at: '2026-10-04 15:12',
    changes: cardsAt({ 'cards/nfc/interac_ca_tap.json': 'cards/nfc/interac_ca_tap.json' }),
  },
];
// The reorganisation predates INTERAC_CA_TAP: keep it out of 5be7c90.
delete COMMITS[3]!.changes['cards/nfc/interac_ca_tap.json'];

export const GORT: RepoSeed = {
  id: 'gort',
  remoteUrl: 'git@github.com:labsim-lab/gort.git',
  description: 'Monorepo: card definitions, screen-location maps, Go SDK tests, suites',
  protectedMain: true,
  commits: COMMITS,
  prs: [
    {
      number: 415,
      title: 'Per-rig offsets for QR shift',
      author: 'alex',
      body: 'Quick fix for the receipt QR regression: add a -3.0 mm Offset Y on every receipt rig instead of touching the maps.',
      sourceBranch: 'alex/qr-offsets',
      state: 'closed',
      createdAt: '2026-09-24 09:12',
      branchCommits: [
        {
          short: '6aa0c51',
          message: 'Add per-rig Offset Y for the QR receipt shift',
          author: 'alex',
          at: '2026-09-24 09:10',
          changes: {
            'config/offsets.yaml': '# Per-rig legacy offsets (mm)\nwall-e: { y: 3.0 }\neve: { y: 3.0 }\nbumblebee: { y: 3.0 }\nbaymax: { y: 3.0 }\n',
          },
        },
      ],
      reviewers: ['jared'],
      approvals: [],
      comments: [{ id: 1, author: 'jared', path: null, line: null, body: 'No offsets. Fix the maps.', at: '2026-09-24 09:31' }],
      verdict: 'CHANGES_REQUESTED',
      checks: 'success',
    },
    {
      number: 417,
      title: 'Add 5-option receipt maps for all profiles',
      author: 'jared',
      body: 'QR receipt hotfix, 48 h. Adds RECEIPT_OPTIONS_5 next to RECEIPT_OPTIONS_4 for every Device Type (both maps must exist — the 5th option is conditional per merchant).',
      sourceBranch: 'jared/receipt-options-5',
      state: 'merged',
      createdAt: '2026-09-25 15:02',
      mergedAt: '2026-09-25 17:48',
      branchCommits: [],
      mergeShort: '0d3e441',
      reviewers: ['tate'],
      approvals: ['tate'],
      comments: [],
      verdict: 'APPROVED',
      checks: 'success',
    },
    {
      number: 418,
      title: 'Update MINI_3 receipt coordinates',
      author: 'jared',
      body: 'Re-measured RECEIPT_OPTIONS_5 on the release firmware (QR block pushes every option 3.0 mm down). Values from BUMBLEBEE with the steel ruler, checked with Test tap.',
      sourceBranch: 'jared/mini3-receipt-coords',
      state: 'merged',
      createdAt: '2026-10-02 15:55',
      mergedAt: '2026-10-02 16:31',
      branchCommits: [],
      mergeShort: '9f02a1b',
      reviewers: ['morgan'],
      approvals: ['morgan'],
      comments: [],
      verdict: 'APPROVED',
      checks: 'success',
    },
  ],
};
