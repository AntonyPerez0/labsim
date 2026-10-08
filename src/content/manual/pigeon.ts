/**
 * Field Manual articles — pigeon. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const PIGEON_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "pigeon-lstr",
    title: "Pigeon (LSTR): The Legacy JSON Framework",
    category: "Test Frameworks",
    summary: "Pigeon, also called LSTR, is the team's legacy test repo — Lester's descendant, named as a pun on \"pidgin language\" — whose Language Specific Test Runner parses raw JSON tests across REST, Android, Windows and iOS.",
    factIds: ["F041", "F042", "F043", "F044", "F045", "F012", "F202", "F203", "F204", "F205", "F206", "F207", "F009", "F158"],
    tags: ["pigeon", "pigeon.lstr", "pigeon.json", "pigeon.abstraction", "go.sdk"],
    related: ["pigeon-bottlenecks", "receipt-qr-regression", "teams-and-history", "jenkins-executor"],
    keywords: ["Pigeon", "LSTR", "Language Specific Test Runner", "Lester", "pidgin", "JSON", "REST", "Android", "Windows", "iOS", "runner", "card swipe", "platforms", "actions", "connection type"],
    practice: ["INC25", "INC26", "DR06"],
    body: `## Name and lineage

- **Pigeon**, also called **LSTR**, is the team's **legacy** test repository {F041}.
- **LSTR** stands for **Language Specific Test Runner** {F044}.
- The name "Pigeon" is a play on words on **"pidgin language"** {F042}.
- Pigeon **evolved from the Lester framework** {F043} — the framework the Sedi (QA) Team used to test the Semi Team's apps {F158}.

## Runners

Pigeon parses raw JSON test payloads across **REST, Android, Windows and iOS** {F045}, with a dedicated runner for each {F202}. The **iOS runner is rarely touched**, although **iOS Go testing is active** {F203}. Pigeon is also one of the ways the LabSim **Go SDK** is tested, alongside the mobile runners {F009}.

## Tests are JSON

Tests are written as **declarative, platform-agnostic JSON payloads** {F012}. A Pigeon test specifies {F205}:

1. the **test name**,
2. the **connection type**,
3. the **supported platforms** — versatile tests target **4 to 5 platforms at once** {F206},
4. an **array of test actions** — creating requests, passing parameters and storing output variables {F207}.

\`\`\`json
{
  "name": "Swipe sale with printed receipt",
  "connectionType": "USB",
  "platforms": ["REST", "ANDROID", "WINDOWS", "IOS"],
  "actions": [
    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "card swipe",   "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "select print", "params": { "robot": "\${ROBOT_NAME}", "screen": "RECEIPT_OPTIONS_5" } }
  ]
}
\`\`\`

## Abstraction

High-level commands such as **"card swipe"** are abstracted by the runner into **platform-specific SDK payment requests** or **physical robot actions** under the hood {F204}. On the REST runner a card swipe becomes an SDK payment request; on a rig it becomes a robot action through Orca.

> **Illustrative (sim only):** Field spellings (\`connectionType\`, \`platforms\`, \`actions\`, \`store\`) and the example file are the sim's†.
`,
  },
  {
    id: "pigeon-bottlenecks",
    title: "Pigeon's Bottlenecks: No Linter, \"select print\" & GIMP",
    category: "Test Frameworks",
    summary: "Living with Pigeon — hunting missing commas without a JSON linter, decoding the misleading \"select print\" failure as a printer-payload timeout caused by stale coordinates, and extracting screen-compare coordinates in GIMP.",
    factIds: ["F208", "F209", "F210", "F211", "F212", "F030"],
    tags: ["pigeon", "pigeon.nolint", "jenkins.logs", "pigeon.gimp"],
    related: ["pigeon-lstr", "receipt-qr-regression", "gimp-coordinates", "ts-pipeline-failures"],
    keywords: ["no linter", "missing comma", "bracket", "ParseError", "copy-paste", "known-good", "select print", "timeout", "printer payload", "misleading log", "GIMP", "bounding box", "coordinates"],
    practice: ["INC22", "INC24", "INC25", "DR06", "DR08"],
    body: `## No JSON linter

Pigeon has **no JSON linter**: missing commas or brackets have to be **hunted down manually** {F208}. Engineers survive by **copy-pasting working JSON blocks** rather than writing syntax from scratch {F209}.

\`\`\`log
LSTR ParseError: Unexpected string in JSON at line 23 column 7†
\`\`\`

The reported line is where the parser gave up — the missing comma is usually at the **end of the line before**.

> **Tip:** Keep a file of known-good action blocks and paste from it; check the line above the reported error first.

## The misleading "select print" failure

If a Jenkins log reports a failure at **"select print"**, that action was simply the **last step attempted before the runner timed out waiting for a printer payload** {F210}. The usual root cause: **outdated screen coordinates made the robot arm miss the Print button** {F211}.

\`\`\`log
step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s†
FAILED at "select print"
\`\`\`

| Tempting diagnosis | Reality |
|---|---|
| "The printer is out of paper" | No print was ever requested — the tap missed |
| "The select print JSON is invalid" | Invalid JSON fails at parse time, not at step 7 |
| **"The arm missed Print; no payload arrived before the timeout"** | ✔ Check the camera recording, then fix the coordinates ([[receipt-qr-regression]]) |

## Screen comparisons with GIMP

When a Pigeon test needs a screen comparison, engineers **open a screenshot in GIMP, draw a bounding box around the target text and copy the coordinates into the JSON block** {F212} {F030}. See [[gimp-coordinates]].

\`\`\`json
{ "action": "screenCompare", "params": { "x": 412, "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83" } }
\`\`\`
`,
  },
  {
    id: "receipt-qr-regression",
    title: "The Receipt QR Regression & 4/5-Option Maps",
    category: "Test Frameworks",
    summary: "The day a \"scan for receipt\" QR code shifted every receipt button down a few millimetres, broke ruler-measured coordinates across the lab for 48 hours until {{jared}} merged a coordinate PR — and why Orca now keeps 4-option and 5-option maps for every device profile.",
    factIds: ["F213", "F214", "F215", "F216", "F142", "F211", "F082"],
    tags: ["orca.screens", "receipt.qr", "receipt.maps"],
    related: ["orca-screens-xytouch", "pigeon-bottlenecks", "ts-taps-missing", "intellij-and-github"],
    keywords: ["receipt", "QR", "scan for receipt", "48 hours", "coordinate PR", "ruler", "4-option", "5-option", "map", "RECEIPT_OPTIONS_4", "RECEIPT_OPTIONS_5", "shift", "millimetres"],
    practice: ["INC20", "INC21", "DR07"],
    body: `## What happened

- A **"scan for receipt" QR code** feature shifted the receipt screen's buttons **down by a few millimetres** {F213}.
- The lab's coordinates had been **measured with a ruler**; the shift broke them **across the lab for 48 hours**, until **{{jared}} merged a coordinate PR** {F214}.
- The feature added a **conditional 5th menu option** to the receipt screen {F215}.

## The lasting change

Because the 5th option is conditional, **Orca must maintain separate coordinate maps for 4-option and 5-option receipt screens across every device profile** {F216}. Screen Locations are X/Y in millimetres {F142}, measured from the limit switches' (0,0) {F082}.

| Map† | Print | Email | Text | No Receipt | Scan for receipt |
|---|---|---|---|---|---|
| \`RECEIPT_OPTIONS_4\` (FLEX_4) | 34.0, 71.0 | 34.0, 83.0 | 34.0, 95.0 | 34.0, 107.0 | — |
| \`RECEIPT_OPTIONS_5\` (FLEX_4) | 34.0, 74.0 | 34.0, 86.0 | 34.0, 98.0 | 34.0, 110.0 | 34.0, 122.0 |

> **Illustrative (sim only):** Screen names and millimetre values are the sim's, and the shift is modelled as 3.0 mm†. The reference says "a few millimetres".

## Recovering from a layout shift

1. **Watch the camera** — taps land just above the buttons.
2. **Measure** the new positions with the ruler from the screen's top-left.
3. **Create a separate 5-option map** — keep the 4-option map; the option is conditional.
4. **Open a coordinate PR**, get it reviewed and merged.
5. Re-run the failing tests. A Pigeon log that "failed at select print" {F211} should now pass.

> **Warning:** Don't use Offsets to compensate for a layout change. Offsets are a deprecated legacy fudge for imprecise limit switches.
`,
  },
  {
    id: "station-duo-dual-screen",
    title: "The Station Duo Dual-Screen Problem (OCR → UI Automator 2.3)",
    category: "Test Frameworks",
    summary: "One Station Duo terminal drives two displays but only the MFD is exposed to ADB. Learn the legacy OCR workaround, why it is brittle, and the UI Automator 2.3 replacement — plus the config rule that both IPs are the same.",
    factIds: ["F151", "F152", "F150", "F153", "F154", "F155", "F156", "F006", "F007", "F193", "F221", "F029", "F030"],
    tags: ["duo.ocr", "orca.screencompare", "uia.v23", "vision.tesseract", "pigeon.gimp", "bots.types"],
    related: ["orca-screen-compare", "gimp-coordinates", "config-properties", "adb-vs-physical-bots"],
    keywords: ["Station Duo", "dual screen", "MFD", "CFD", "ADB-blind", "OCR", "Tesseract", "Screen Compare", "UI Automator 2.3", "displayId", "same IP", "R2-D2"],
    practice: ["INC30", "INC36", "INC37", "INC38", "INC64"],
    body: `## The problem

On the **Station Duo**, one terminal drives two displays, but **only the primary MFD is exposed to ADB** {F151}. Legacy UI Automator was **completely blind** to the secondary CFD {F152}. An ADB-blind display needs a physical bot or another way to see it {F221}.

\`\`\`bash
adb -s 10.42.30.14:5444 shell uiautomator dump†
grep -c "TOTAL" window_dump.xml      # → 0: the CFD's total isn't in the hierarchy
\`\`\`

## The legacy workaround: Screen Compare + OCR

The **Screen Compare Image** entity {F150} stores spatial bounding coordinates on the CFD plus the expected text {F153}. The Robot Controller captures a webcam screenshot, crops it, runs **Tesseract OCR** {F029} and returns a boolean {F154}. Coordinates come from **GIMP** {F030}. See [[orca-screen-compare]].

It is **extremely brittle**: a 10-pixel shift, a capitalisation change or a typo breaks the suite {F155}.

## The modern fix: UI Automator 2.3

uia-remote uses **UI Automator 2.3** {F006} specifically because it adds **native support for dual-screen element location tracking** {F007}. That is why Screen Compare / OCR is being **phased out** {F156}: replace an OCR check with a normal page-object assertion that targets the CFD display.

\`\`\`java
// before (legacy, brittle)
orca.screenCompare("CFD_TOTAL");†
// after (UIA 2.3, dual-screen aware)
cfdTotals.assertTotal("$10.83");†
\`\`\`

## Configuring a Duo locally

On a Station Duo, **\`merchantFacingDeviceIp\` and \`customerFacingDeviceIp\` are set to the exact same IP address** {F193} — it is one terminal. Leaving the CFD IP blank or pointing it at the Pi is wrong.
`,
  },
]);
