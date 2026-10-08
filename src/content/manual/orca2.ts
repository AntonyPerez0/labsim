/**
 * Field Manual articles — orca2. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const ORCA2_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "orca-capabilities",
    title: "Robot Capabilities: Dynamic JSON vs Non-Dynamic Lookups",
    category: "Orchestrator",
    summary: "How Orca matches a pipeline's request to a physical robot — JSON metadata inside SDK test definitions (dynamic) or capabilities hardcoded in UI Automator pipeline scripts (non-dynamic) — and why Westers beds use both.",
    factIds: ["F131", "F132", "F133", "F134", "F135", "F011", "F059", "F060"],
    tags: ["orca.capabilities", "go.sdk"],
    related: ["orca-merchant-config", "device-families", "jenkins-executor", "card-testing-philosophy"],
    keywords: ["capabilities", "dynamic JSON", "non-dynamic", "hardcoded", "pipeline script", "SDK", "Contact Canada", "Westers", "match", "printer", "Flex Pocket"],
    practice: ["INC23", "INC49"],
    body: `## What the entity does

The **Robot Capabilities** entity controls how Orca **matches pipeline requests to physical hardware** {F131}. Capability lookups are expressed in **JSON** at runtime {F011}.

## Two lookup styles

| | Dynamic JSON lookup | Non-dynamic lookup |
|---|---|---|
| Used by | **SDK frameworks** (overseen by {{david}}) {F132} {F133} | **Traditional UI Automator suites** {F134} |
| Where the capabilities live | As **JSON metadata inside each test definition**, parsed at runtime {F132} | **Hardcoded inside the pipeline script** {F134} |
| To change what a test needs | Edit the test's JSON | Edit the pipeline script |

Both lookup methods are used **interchangeably** for the **Contact Canada** automation scripts running on the **Westers** test beds {F135} — so when a Canadian job lands on the wrong rig, check both places and make them agree.

## Example: a receipt test that needs a printer

Flex 3, Flex 4 and Flex Pocket share one testing profile {F059}, but the Pocket has no printer {F060}. A Go SDK receipt test whose capabilities don't ask for a printer may be matched to a Flex Pocket and fail.

\`\`\`json
{
  "name": "Go SDK sale with printed receipt",
  "capabilities": { "deviceType": "FLEX_3", "printer": true }
}
\`\`\`

Adding \`"printer": true\` to the test's capabilities (dynamic JSON) keeps it off printerless devices.

\`\`\`groovy
def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]   // non-dynamic, in the pipeline script†
\`\`\`

> **Illustrative (sim only):** The capability keys (\`deviceType\`, \`printer\`, \`physicalTouch\`, \`dip\`, \`tap\`), file names and the pipeline line are the sim's†.

> **Warning:** Don't set the Flex Pocket Offline to keep a printer test off it — fix the capability request.
`,
  },
  {
    id: "orca-merchant-config",
    title: "Merchant Config & Go SDK Credentials",
    category: "Orchestrator",
    summary: "Where merchant account parameters live in Orca, why you must click Edit to see them all, and the App ID / App Secret / API Key fields {{tate}} added so pipelines can feed the Go SDK.",
    factIds: ["F136", "F137", "F138", "F139", "F140", "F008", "F009", "F051", "F218"],
    tags: ["orca.capabilities", "orca.merchant", "go.sdk", "laz.oobe"],
    related: ["laz-and-ubi", "orca-capabilities", "jenkins-env-vars", "adb-vs-physical-bots"],
    keywords: ["Merchant Config", "Edit", "App ID", "App Secret", "API Key", "Go SDK", "env vars", "merchant", "PIN bypass", "table display limits"],
    practice: ["INC50", "INC51"],
    body: `## What it stores

The **Merchant Config** entity stores merchant account parameters {F136}. It works alongside **Laz Automation** for dynamic OOBE merchant switching {F140} ([[laz-and-ubi]]), and the **Ubi Platform** routes jobs that switch merchant configurations {F051}.

## Click Edit

Because of **UI table display limits**, the Merchant Config table cannot show every column. **You must click Edit on a row to view all of its fields** {F137}. If a field "is missing", it almost certainly isn't — open the row.

## App ID, App Secret, API Key

{{tate}} extended Merchant Config with **App ID**, **App Secret** and **API Key** {F138} so **pipelines can export them as runtime environment variables for the Go SDK** {F139}. The Go SDK is written in Go, supported through custom extensions in Orca and tested through Pigeon and the mobile runners {F008} {F009}.

\`\`\`log
[env] APP_ID=app_sim_7f3a†
[env] APP_SECRET=****
[env] API_KEY=****
\`\`\`

A Go SDK build that fails authentication usually has a blank key in Merchant Config. Fix it there (Edit → API Key) — never hardcode a key into the job.

## Merchants and bots

ADB bots are restricted to merchant configurations that **bypass PIN security** {F218}; Canadian merchants require PIN entry on a physical bot ([[adb-vs-physical-bots]]).

> **Illustrative (sim only):** Merchant names such as \`GO-SDK-US-01\`, \`AUTO-US-NOPIN-01\` and \`WESTERS-CA-01\` and their key values are the sim's†.
`,
  },
  {
    id: "orca-screens-xytouch",
    title: "Screens, Screen Locations & xy_touch",
    category: "Orchestrator",
    summary: "Robots don't see buttons — they know where buttons are, in millimetres, because Orca tells them. Screens map layouts, Screen Locations map button X/Y, and xy_touch turns a screen name and button string into an ADB touch or a probe tap.",
    factIds: ["F141", "F142", "F143", "F144", "F082", "F096", "F217", "F219"],
    tags: ["orca.screens", "orca.xytouch", "bots.types"],
    related: ["receipt-qr-regression", "adb-vs-physical-bots", "orca-urls-tethering-offsets", "ts-taps-missing"],
    keywords: ["Screens", "Screen Locations", "xy_touch", "millimetres", "mm", "coordinates", "button", "ADB touch", "physical tap", "TENDER_CASH_DISCOUNT", "ruler"],
    practice: ["INC20", "INC21", "INC22", "DR07"],
    body: `## The two entities

| Entity | Maps | Example |
|---|---|---|
| **Screens** | Discrete UI layouts within a transaction flow, relative to the target device architecture {F141} | A cash-discount tender selection prompt |
| **Screen Locations** | Exact button placements as relative **X and Y in millimetres** {F142} | \`Cash X 22.0 Y 58.5\`† |

In the sim, coordinates are measured from the screen's top-left†, lined up with the (0,0) that the physical limit switches define {F082}.

## xy_touch

1. The test runner calls Orca's **xy_touch** REST endpoint with a **screen name and a button string** {F143} {F096}.
2. Orca looks up the button's **millimetre coordinates** {F144}.
3. Orca instructs the Raspberry Pi to fire either an **electronic ADB touch** or a **physical mechanical probe tap** {F144}.

\`\`\`bash
curl -X POST http://orca.lab.local:8080/api/xy_touch \\
  -H "Content-Type: application/json" \\
  -d '{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}'
# {"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5}†
\`\`\`

The same call on an ADB bot returns an ADB touch: ADB bots are purely programmatic {F217}; touch robots have mechanical probes {F219}.

> **Illustrative (sim only):** The URL, JSON body, screen names and millimetre values are the sim's†.

## When taps miss

Robots tap exactly where Orca says. If the device's layout moved (a firmware update, a new option), every tap lands in the old place. See [[receipt-qr-regression]] and [[ts-taps-missing]].
`,
  },
  {
    id: "orca-screen-compare",
    title: "Screen Compare Images (the Station Duo OCR Workaround)",
    category: "Orchestrator",
    summary: "The legacy way to check text on the Station Duo's ADB-blind customer screen: a bounding box plus expected text, checked by webcam screenshot, crop and Tesseract OCR. Brittle, and being phased out.",
    factIds: ["F150", "F151", "F152", "F153", "F154", "F155", "F156", "F029", "F088"],
    tags: ["duo.ocr", "orca.screencompare", "vision.tesseract", "vision.camera", "uia.v23"],
    related: ["station-duo-dual-screen", "gimp-coordinates", "pigeon-bottlenecks"],
    keywords: ["Screen Compare Image", "OCR", "Tesseract", "bounding box", "expected text", "webcam", "crop", "boolean", "brittle", "10 pixels", "capitalisation", "typo", "CFD_TOTAL"],
    practice: ["INC36", "INC37", "INC38", "DR05"],
    body: `## Why it exists

On the **Station Duo** one terminal drives two displays, but only the primary **MFD** is exposed to ADB {F151}. Legacy UI Automator was completely blind to the secondary **CFD** {F152}. The **Screen Compare Image** entity is the workaround {F150}.

## What a row stores

Spatial **bounding coordinates on the CFD** plus the **expected text string** {F153}, e.g.:

| Name | X | Y | W | H | Expected text |
|---|---|---|---|---|---|
| \`CFD_TOTAL\`† | 412 | 288 | 236 | 44 | \`TOTAL $10.83\` |

## How a check runs

1. The Robot Controller captures a **webcam screenshot** {F154} {F088}.
2. Crops it to the bounding box.
3. Runs **Tesseract OCR** {F029} on the crop.
4. Returns a **boolean** match result {F154}.

\`\`\`log
capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=true†
\`\`\`

## Why it is brittle

It breaks on **a 10-pixel button shift, a capitalisation change or a typo** {F155}: \`TOTAL\` → \`Total\` is a mismatch; a label 10 px lower gets clipped and misread.

## Why it is going away

Screen Compare / OCR is being **phased out** because **UI Automator 2.3 natively supports dual-screen element tracking** {F156}. New checks should be UIA 2.3 assertions in uia-remote ([[station-duo-dual-screen]]).
`,
  },
]);
