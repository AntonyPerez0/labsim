/**
 * Field Manual articles — pipelines. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const PIPELINES_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "jenkins-executor",
    title: "Jenkins: The Executor",
    category: "Pipelines",
    summary: "Jenkins triggers test pipelines, injects runtime environment variables into the test runner and checks robots out of Orca. Legacy jobs are split by platform into Java and iOS.",
    factIds: ["F015", "F016", "F017", "F094", "F095", "F098", "F102", "F189", "F203"],
    tags: ["jenkins", "jenkins.envvars", "jenkins.folders", "jenkins.checkout", "arch.roles"],
    related: ["jenkins-env-vars", "orca-statuses", "orca-overview", "ts-pipeline-failures", "pigeon-lstr"],
    keywords: ["Jenkins", "Executor", "pipeline", "build with parameters", "checkout", "Java view", "iOS view", "ROBOT_NAME", "console", "legacy jobs"],
    practice: ["INC26", "INC39", "INC41", "DR11"],
    body: `## Role

**Jenkins** is the CI/CD execution engine — the **Executor** {F015}. Orca is the Controller {F098}.

For every test pipeline Jenkins:

1. **Triggers** the pipeline and **injects runtime environment variables** {F016} into the test runner (uia-remote or Pigeon) {F094}.
2. **Checks out a robot** from Orca before the test runs {F095}.
3. Releases it when the build ends.

In CI nobody hand-edits \`config.properties\`: Jenkins injects the values dynamically {F189}.

## Legacy job layout

Legacy jobs are organised **by platform**, separating **Java jobs** from **iOS jobs** {F017}. The iOS runner is rarely touched, but iOS Go SDK testing is active {F203} — don't delete iOS jobs.

| View† | Example jobs† |
|---|---|
| \`Java\` | \`uia-remote-regression-flex\`, \`uia-remote-tethered-tax\`, \`go-sdk-sale-smoke\`, \`laz-oobe-merchant-swap\`, \`contact-canada-pin-sale\`, \`pigeon-android-sale-swipe\` |
| \`iOS\` | \`pigeon-ios-go-sdk-smoke\` |

A Java job filed under the iOS view is still a Java job — "the job that disappeared" is usually in the other view.

## How checkout picks a robot

| Parameter | Effect |
|---|---|
| \`ROBOT_NAME\` blank† | Any **Available** robot that matches the job's capabilities |
| \`ROBOT_NAME=<exact Name>\`† | That robot — the only way to use an **Unavailable** robot {F102} |
| \`DEVICE_TYPE\`† | Must be the exact ALL-CAPS enum value ([[jenkins-env-vars]]) |

If no matching robot is Available (all Reserved, Offline, Connection Failed or Unavailable), the build waits in the queue.

\`\`\`log
[orca] candidate wall-e: Reserved — skipped†
[orca] no Available FLEX_3 robot — build waiting in queue†
[orca] checkout → wall-e (FLEX_3) OK†
\`\`\`

> **Illustrative (sim only):** View names, job names, parameter names and console lines are the sim's†.
`,
  },
  {
    id: "jenkins-env-vars",
    title: "Jenkins Environment Variables & the ALL-CAPS Rule",
    category: "Pipelines",
    summary: "What Jenkins injects into a run, why Device Type values must be ALL CAPS, and how to read the console's environment block.",
    factIds: ["F016", "F121", "F122", "F139", "F189", "F198", "F196", "F197"],
    tags: ["jenkins", "jenkins.envvars", "orca.devicetype", "go.sdk"],
    related: ["jenkins-executor", "orca-robot-device", "config-properties", "orca-merchant-config"],
    keywords: ["environment variables", "env vars", "ALL CAPS", "DEVICE_TYPE", "enum", "flex_3", "FLEX_3", "IllegalArgumentException", "No enum constant", "PORT_NUMBER", "APP_ID", "API_KEY"],
    practice: ["INC39", "INC51", "DR11"],
    body: `## Injection

Jenkins injects **runtime environment variables** into each pipeline {F016}; during CI runs it injects the \`config.properties\` values dynamically {F189}. For Go SDK pipelines that includes **App ID, App Secret and API Key** exported from Merchant Config {F139}.

## The ALL-CAPS rule

Orca's **Device Type** is an enum of device dimensions, layout metrics and internal string definitions {F121}. Enum strings must match exactly, which is why **Jenkins pipeline environment variables must be in ALL CAPS** {F122}.

\`\`\`log
[orca] checkout request deviceType=flex_3
java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.flex_3†
FAILURE
\`\`\`

Fix: \`DEVICE_TYPE=FLEX_3\`. Don't "fix" it by editing the enum in Orca.

## What gets injected

| Variable† | Source | Must be |
|---|---|---|
| \`DEVICE_TYPE\` | Job parameter → Orca Device Type | The exact ALL-CAPS enum value |
| \`ROBOT_NAME\` | Job parameter (blank = any matching Available robot) | The robot's exact **Name** (not its Human Readable Name) |
| \`MERCHANT\`, \`CARD_PROFILE\` | Job parameters | Existing Merchant Config / Card Profile names |
| \`APP_ID\`, \`APP_SECRET\`, \`API_KEY\` | Merchant Config (Edit view) | Filled in for Go SDK merchants {F139} |
| \`PORT_NUMBER\`, \`THEME\`, \`KERNEL_TYPE\`, \`RUN_TYPE\` | The locked \`config.properties\` values | \`5444\`, \`avocado\`, \`CPA\`, \`tethered\`/\`standalone\` |

Secrets are masked (\`****\`) in the console; you can still see whether they were set.

## Reading the environment block

\`\`\`log
RUN_TYPE=standalone†
DEVICE_TYPE=FLEX_3
ROBOT_NAME=wall-e
PORT_NUMBER=5444
THEME=avocado
KERNEL_TYPE=CPA
\`\`\`

The values mirror the locked \`config.properties\` settings: port **5444** {F198}, theme **avocado** {F196}, kernel **CPA** {F197} ([[config-properties]]).

> **Illustrative (sim only):** The env-block key names (\`RUN_TYPE\`, \`PORT_NUMBER\`, \`THEME\`, \`KERNEL_TYPE\`, \`APP_ID\`, \`APP_SECRET\`, \`API_KEY\`) and the exception text are the sim's†.
`,
  },
  {
    id: "laz-and-ubi",
    title: "Laz Automation & the Ubi Platform",
    category: "Test Frameworks",
    summary: "Laz runs a zero-touch Out-of-Box Experience routine that de-provisions a device, wipes caches, walks the setup wizard and swaps merchants mid-suite; Ubi routes jobs that switch merchant configurations.",
    factIds: ["F046", "F047", "F051", "F140", "F136"],
    tags: ["orca.capabilities", "laz.oobe", "ubi.routing", "orca.merchant"],
    related: ["orca-merchant-config", "jenkins-executor", "orca-statuses"],
    keywords: ["Laz", "OOBE", "Out-of-Box Experience", "zero-touch", "provisioning", "de-provision", "wipe caches", "setup wizard", "merchant swap", "Ubi", "routing"],
    practice: ["INC50", "INC28", "INC40"],
    body: `## Laz Automation

**Laz Automation** is an automated provisioning framework that runs a **zero-touch OOBE (Out-of-Box Experience)** routine {F046}. The routine {F047}:

1. **De-provisions** the hardware.
2. **Wipes local caches**.
3. **Steps through the setup wizard**.
4. **Swaps merchants mid-suite** — the device comes up on the new merchant.

Merchant Config (merchant account parameters {F136}) works alongside Laz for dynamic OOBE merchant switching {F140}.

## Ubi Platform

The **Ubi Platform** is the internal routing platform used when test jobs **dynamically switch merchant configurations** {F051}.

\`\`\`log
ubi: routing merchant switch → AUTO-US-NOPIN-02†
laz: de-provision
laz: wipe caches
laz: setup wizard 1/6 … 6/6
laz: merchant active
\`\`\`

## Things to watch

- A device that has just been through OOBE may need its lab ADB settings re-applied before it answers on port 5444 again†.
- A merchant swap on a PayCore rig is exactly what Unavailable exists to prevent ([[orca-statuses]]).

> **Illustrative (sim only):** The job \`Java/laz-oobe-merchant-swap\`†, the console lines and the six wizard pages are the sim's.
`,
  },
]);
