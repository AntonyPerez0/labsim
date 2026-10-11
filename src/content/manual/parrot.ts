/**
 * Field Manual articles — parrot. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const PARROT_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "parrot-lstr",
    title: "Parrot (LSTR): The Legacy JSON Framework",
    category: "Test Frameworks",
    summary: "Parrot, also called LSTR, is the team's legacy test repo — Lister's descendant, named as a pun on \"parroting\" (one test repeated in every platform's language) — whose Language Specific Test Runner parses raw JSON tests across REST, Android, Windows and iOS.",
    factIds: ["F041", "F042", "F043", "F044", "F045", "F012", "F202", "F203", "F204", "F205", "F206", "F207", "F009", "F158", "F251", "F217", "F220", "F253", "F246"],
    tags: ["parrot", "parrot.lstr", "parrot.json", "parrot.abstraction", "go.sdk", "orka.capabilities", "bots.pin"],
    related: ["parrot-bottlenecks", "receipt-qr-regression", "teams-and-history", "jenkins-executor", "adb-vs-physical-bots"],
    keywords: ["Parrot", "LSTR", "Language Specific Test Runner", "Lister", "parroting", "JSON", "REST", "Android", "Windows", "iOS", "runner", "card swipe", "platforms", "actions", "connection type", "capabilities", "dip", "chip", "PIN", "UI Automator"],
    practice: ["INC25", "INC26", "DR06"],
    body: `## Name and lineage

- **Parrot**, also called **LSTR**, is the team's **legacy** test repository {F041}.
- **LSTR** stands for **Language Specific Test Runner** {F044}.
- The name "Parrot" is a play on words on **"parroting"** (one test, repeated in every platform's language) {F042}.
- Parrot **evolved from the Lister framework** {F043} — the framework the Sedi (QA) Team used to test the Semi Team's apps {F158}.

## Runners

Parrot parses raw JSON test payloads across **REST, Android, Windows and iOS** {F045}, with a dedicated runner for each {F202}. The **iOS runner is rarely touched**, although **iOS Go testing is active** {F203}. Parrot is also one of the ways the LabSim **Go SDK** is tested, alongside the mobile runners {F009}.

## Tests are JSON

Tests are written as **declarative, platform-agnostic JSON payloads** {F012}. A Parrot test specifies {F205}:

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

High-level commands such as **"card swipe"** are abstracted by the runner into **platform-specific SDK payment requests** or **physical robot actions** under the hood {F204}. On the REST runner a card swipe becomes an SDK payment request; on a rig it becomes a robot action through Orka.

## Capabilities and PIN

- Every Parrot test **states the robot capabilities it needs** — for example **swipe** — and **chip (EMV) suites require dip** {F251}. Orka uses them to pick a suitable robot ([[orka-capabilities]]).
- **ADB bots** are purely programmatic: they cannot touch the glass or enter a PIN {F217}, so they only get merchant profiles without PIN. **Canadian flows mandate physical PIN entry**, so they need **physical robots** {F220}.

## Where Parrot is heading

Parrot is legacy: the team is **moving away from Parrot toward UI Automator** (uia-relay), driven by a mandate to **test payments inside the native apps** {F253}. You will still read and fix Parrot tests — in **VS Code** {F246} — so learn its quirks in [[parrot-bottlenecks]].

> **Illustrative (sim only):** Field spellings (\`connectionType\`, \`platforms\`, \`actions\`, \`store\`) and the example file are the sim's†.
`,
  },
  {
    id: "parrot-bottlenecks",
    title: "Parrot's Bottlenecks: No Linter, VS Code, \"select print\" & GIMP",
    category: "Test Frameworks",
    summary: "Living with Parrot — editing its JSON in VS Code (which checks raw syntax but knows nothing about Parrot), testing your branch through Jenkins, decoding the misleading \"select print\" failure as a printer-payload timeout caused by stale coordinates, and extracting screen-compare coordinates in GIMP.",
    factIds: ["F208", "F209", "F246", "F247", "F248", "F249", "F017", "F250", "F210", "F211", "F212", "F030"],
    tags: ["parrot", "parrot.nolint", "tools.vscode", "tools.github", "jenkins.logs", "parrot.gimp"],
    related: ["parrot-lstr", "receipt-qr-regression", "gimp-coordinates", "ts-pipeline-failures", "intellij-and-github", "jenkins-executor"],
    keywords: ["no linter", "missing comma", "bracket", "ParseError", "copy-paste", "known-good", "VS Code", "Visual Studio Code", "Problems panel", "Expected comma", "squiggle", "Source Control", "branch", "BRANCH", "push", "Run LSTR test", "Parrot Practice", "Shift+Alt+Down", "select print", "timeout", "printer payload", "misleading log", "GIMP", "bounding box", "coordinates"],
    practice: ["INC22", "INC24", "INC25", "DR06", "DR08"],
    body: `## No Parrot-aware linter

Parrot has **no high-quality, Parrot-aware linter**: VS Code only checks raw JSON syntax, so engineers still lose time **hunting missing commas or brackets by hand** {F208}. Engineers survive by **copy-pasting working JSON blocks** rather than writing syntax from scratch {F209}.

\`\`\`log
LSTR ParseError: Unexpected string in JSON at line 23 column 7†
\`\`\`

The reported line is where the parser gave up — the missing comma is usually at the **end of the line before**.

> **Tip:** Keep a file of known-good action blocks and paste from it; check the line above the reported error first.

## Editing Parrot tests in VS Code

Parrot's JSON tests are edited in **VS Code (Visual Studio Code)** {F246}. IntelliJ IDEA stays the IDE for uia-relay ([[intellij-and-github]]).

### The workflow

1. **Open the \`parrot\` folder** in VS Code and find the test under \`tests/\`†.
2. **Edit by copy-paste.** Start from a known-good action block {F209}. **Shift+Alt+Down** duplicates the current line, which is handy for cloning an action and changing its params.
3. **Clear the Problems panel.** VS Code's built-in JSON support marks raw *syntax* errors with a red squiggle and a **Problems** entry such as "Expected comma". It reports them at the **token after the gap**, so look at the **end of the previous line** {F247}.
4. **Run it locally** with **Run LSTR test**†, which runs the test against the robot named in your local \`config.properties\`†.
5. **Commit on a branch** in the **Source Control** view and **push** it to GitHub. In Jenkins, point the Parrot job's \`BRANCH\`† parameter at your branch and pick the suite (e.g. US Go Dip) {F249}. Legacy jobs are filed by platform, Java vs iOS {F017}.

### What VS Code catches, and what it doesn't

VS Code knows JSON, not Parrot. It knows nothing about Parrot/LSTR semantics, so these mistakes are **valid JSON** and only fail **at run time** {F248}:

| Mistake | VS Code flags it? | Where it surfaces |
|---|---|---|
| Missing comma or bracket | Yes: squiggle + Problems entry, one token late {F247} | Before you run |
| Unknown action name | No {F248} | Run time (LSTR / Jenkins log) |
| Misspelled \`\${variable}\` | No {F248} | Run time |
| Wrong screen name (\`RECEIPT_OPTIONS_4\`† vs \`RECEIPT_OPTIONS_5\`†) | No {F248} | Run time, often as a "select print" timeout |
| Platform mismatch | No {F248} | Run time |

That is why the team still says Parrot has **no high-quality linter** {F208}, even with VS Code open.

> **In the sim:** The VS Code app's **Parrot Practice** panel† has graded exercises, each checked by an LSTR dry-run† that catches syntax *and* Parrot-semantic mistakes. Use it to drill the comma hunt and the run-time-only errors.

> **Illustrative (sim only):** The \`BRANCH\` parameter name, the **Run LSTR test** command, the Parrot Practice panel and its dry-run check are the sim's†.

## Reading a Parrot failure log

A Jenkins Parrot failure log shows the **test name**, its **description variables** and the **failure message**, which names the **last action attempted** {F250}. That last action is not always the culprit, as the next section shows.

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

When a Parrot test needs a screen comparison, engineers **open a screenshot in GIMP, draw a bounding box around the target text and copy the coordinates into the JSON block** {F212} {F030}. See [[gimp-coordinates]].

\`\`\`json
{ "action": "screenCompare", "params": { "x": 412, "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83" } }
\`\`\`
`,
  },
  {
    id: "receipt-qr-regression",
    title: "The Receipt QR Regression & 4/5-Option Maps",
    category: "Test Frameworks",
    summary: "The day a \"scan for receipt\" QR code shifted every receipt button down a few millimetres, broke ruler-measured coordinates across the lab for 48 hours until {{jaden}} merged a coordinate PR — and why Orka now keeps 4-option and 5-option maps for every device profile.",
    factIds: ["F213", "F214", "F215", "F216", "F142", "F211", "F082"],
    tags: ["orka.screens", "receipt.qr", "receipt.maps"],
    related: ["orka-screens-xytouch", "parrot-bottlenecks", "ts-taps-missing", "intellij-and-github"],
    keywords: ["receipt", "QR", "scan for receipt", "48 hours", "coordinate PR", "ruler", "4-option", "5-option", "map", "RECEIPT_OPTIONS_4", "RECEIPT_OPTIONS_5", "shift", "millimetres"],
    practice: ["INC20", "INC21", "DR07"],
    body: `## What happened

- A **"scan for receipt" QR code** feature shifted the receipt screen's buttons **down by a few millimetres** {F213}.
- The lab's coordinates had been **measured with a ruler**; the shift broke them **across the lab for 48 hours**, until **{{jaden}} merged a coordinate PR** {F214}.
- The feature added a **conditional 5th menu option** to the receipt screen {F215}.

## The lasting change

Because the 5th option is conditional, **Orka must maintain separate coordinate maps for 4-option and 5-option receipt screens across every device profile** {F216}. Screen Locations are X/Y in millimetres {F142}, measured from the limit switches' (0,0) {F082}.

| Map† | Print | Email | Text | No Receipt | Scan for receipt |
|---|---|---|---|---|---|
| \`RECEIPT_OPTIONS_4\` (FLUX_4) | 34.0, 71.0 | 34.0, 83.0 | 34.0, 95.0 | 34.0, 107.0 | — |
| \`RECEIPT_OPTIONS_5\` (FLUX_4) | 34.0, 74.0 | 34.0, 86.0 | 34.0, 98.0 | 34.0, 110.0 | 34.0, 122.0 |

> **Illustrative (sim only):** Screen names and millimetre values are the sim's, and the shift is modelled as 3.0 mm†. The reference says "a few millimetres".

## Recovering from a layout shift

1. **Watch the camera** — taps land just above the buttons.
2. **Measure** the new positions with the ruler from the screen's top-left.
3. **Create a separate 5-option map** — keep the 4-option map; the option is conditional.
4. **Open a coordinate PR**, get it reviewed and merged.
5. Re-run the failing tests. A Parrot log that "failed at select print" {F211} should now pass.

> **Warning:** Don't use Offsets to compensate for a layout change. Offsets are a deprecated legacy fudge for imprecise limit switches.
`,
  },
  {
    id: "stand-duet-dual-screen",
    title: "The Stand Duet Dual-Screen Problem (OCR → UI Automator 2.3)",
    category: "Test Frameworks",
    summary: "One Stand Duet terminal drives two displays but only the MFD is exposed to ADB. Learn the legacy OCR workaround, why it is brittle, and the UI Automator 2.3 replacement — plus the config rule that both IPs are the same.",
    factIds: ["F151", "F152", "F150", "F153", "F154", "F155", "F156", "F006", "F007", "F193", "F221", "F029", "F030"],
    tags: ["duet.ocr", "orka.screencompare", "uia.v23", "vision.tesseract", "parrot.gimp", "bots.types"],
    related: ["orka-screen-compare", "gimp-coordinates", "config-properties", "adb-vs-physical-bots"],
    keywords: ["Stand Duet", "dual screen", "MFD", "CFD", "ADB-blind", "OCR", "Tesseract", "Screen Compare", "UI Automator 2.3", "displayId", "same IP", "R2-D2"],
    practice: ["INC30", "INC36", "INC37", "INC38", "INC64"],
    body: `## The problem

On the **Stand Duet**, one terminal drives two displays, but **only the primary MFD is exposed to ADB** {F151}. Legacy UI Automator was **completely blind** to the secondary CFD {F152}. An ADB-blind display needs a physical bot or another way to see it {F221}.

\`\`\`bash
adb -s 10.42.30.14:5444 shell uiautomator dump†
grep -c "TOTAL" window_dump.xml      # → 0: the CFD's total isn't in the hierarchy
\`\`\`

## The legacy workaround: Screen Compare + OCR

The **Screen Compare Image** entity {F150} stores spatial bounding coordinates on the CFD plus the expected text {F153}. The Robot Controller captures a webcam screenshot, crops it, runs **Tesseract OCR** {F029} and returns a boolean {F154}. Coordinates come from **GIMP** {F030}. See [[orka-screen-compare]].

It is **extremely brittle**: a 10-pixel shift, a capitalisation change or a typo breaks the suite {F155}.

## The modern fix: UI Automator 2.3

uia-relay uses **UI Automator 2.3** {F006} specifically because it adds **native support for dual-screen element location tracking** {F007}. That is why Screen Compare / OCR is being **phased out** {F156}: replace an OCR check with a normal page-object assertion that targets the CFD display.

\`\`\`java
// before (legacy, brittle)
orka.screenCompare("CFD_TOTAL");†
// after (UIA 2.3, dual-screen aware)
cfdTotals.assertTotal("$10.83");†
\`\`\`

## Configuring a Duet locally

On a Stand Duet, **\`merchantFacingDeviceIp\` and \`customerFacingDeviceIp\` are set to the exact same IP address** {F193} — it is one terminal. Leaving the CFD IP blank or pointing it at the Pi is wrong.
`,
  },
]);
