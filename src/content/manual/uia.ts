/**
 * Field Manual articles — uia. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const UIA_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "uia-remote-structure",
    title: "uia-remote: Structure & the Multi-Device Trick",
    category: "Test Frameworks",
    summary: "The team's modern Java / UI Automator repo: the app/src layout (main, test, androidTest), the three androidTest packages, and how a runner in test drives an MFD and a CFD even though UI Automator talks to one device at a time.",
    factIds: ["F039", "F040", "F005", "F006", "F001", "F010", "F159", "F163", "F164", "F165", "F166", "F167", "F168", "F169", "F170", "F171", "F018"],
    tags: ["uia.pom", "uia.layout", "uia.packages", "uia.multidevice", "arch.repos"],
    related: ["uia-remote-pom", "tax-test", "config-properties", "intellij-and-github", "teams-and-history"],
    keywords: ["uia-remote", "app/src", "main", "test", "androidTest", "databases", "pageobjects", "testactions", "Maven", "runner", "MultiDeviceRunner", "device handle", "UI Automator", "one device"],
    practice: ["INC34", "DR15"],
    body: `## What it is

**uia-remote** is the team's modern **Java / UI Automator** test repository {F039}, built on Google's **Android UI Automator** {F005} — specifically **version 2.3** {F006} — in Java {F001}. It automates **both standalone devices and tethered multi-device setups across native LabSim apps** {F040}. {{morgan}} created it because no prior framework could automate native tethered setups: Station-to-Mini, Mini-to-Mini and Station Duo {F159}. It lives on GitHub with Gort and pigeon {F018}.

## Layout

uia-remote is built inside a standard **Android/Maven** structure under \`app/src/\` {F163} (the layout mirrors Apache Maven {F010}):

| Folder | Holds | Rule |
|---|---|---|
| \`app/src/main\` | Production / application registration code {F164} | **QA engineers never modify it** |
| \`app/src/test\` | Local unit tests and the **multi-device execution runner** scripts {F165} | |
| \`app/src/androidTest\` | Instrumented tests that execute on Android hardware, split into **three packages** {F166} | |

The three \`androidTest\` packages:

| Package | Holds |
|---|---|
| \`databases\` | Database connection and query logic {F167} |
| \`pageobjects\` | Page Object Model classes representing individual device screens {F168} |
| \`testactions\` | Test classes and logical assertions that string page-object methods together {F169} |

**Where does it go?** \`HomeScreen.java\` → \`pageobjects\`; \`TaxTest.java\` → \`testactions\`; \`DbHelper.java\` → \`databases\`; \`MultiDeviceRunner.java\` → \`test\`; app registration code stays in \`main\` (and you don't touch it).

## The multi-device trick

Google designed UI Automator to communicate with **only one Android device at a time** {F170}. To test tethered setups, the **screen definitions live in androidTest** and the **runner lives in test**. The runner targets methods **sequentially across device handles**: Device A (MFD) runs Method X, focus shifts to Device B (CFD) for Method Y, then loops back {F171}.

\`\`\`java
// UI Automator talks to ONE device at a time, so we hop between handles.†
DeviceHandle mfd = DeviceHandle.connect(config.merchantFacingDeviceIp(), config.portNumber());
DeviceHandle cfd = DeviceHandle.connect(config.customerFacingDeviceIp(), config.portNumber());

mfd.run(registerHome::addTaxItem5);     // MFD_O1
mfd.run(registerHome::reviewOrder);
cfd.run(cfdTotals::assertTotals);       // CFD_O1
mfd.run(registerHome::payAndCharge);    // MFD_O2
cfd.run(cfdPayment::finalisePayment);   // Step 4
\`\`\`

> **Illustrative (sim only):** Class names (\`DeviceHandle\`, \`MultiDeviceRunner\`, \`DbHelper\`) and method names are the sim's†; the folder rules and the sequential hand-off are the reference's.
`,
  },
  {
    id: "uia-remote-pom",
    title: "Page Objects: BaseTest, Zones & Mandatory Methods",
    category: "Test Frameworks",
    summary: "One Java class per screen, extending BaseTest; Zone 1 locators, Zone 2 helpers (where device quirks like open() scrolling live); and the two mandatory methods, waitForScreen() and isScreenPresent().",
    factIds: ["F172", "F173", "F174", "F175", "F176", "F177", "F178", "F179", "F180", "F195"],
    tags: ["uia.pom", "uia.sync", "uia.scroll"],
    related: ["uia-remote-structure", "ts-uia-flaky", "tax-test", "config-properties"],
    keywords: ["Page Object Model", "POM", "BaseTest", "Zone 1", "Zone 2", "locators", "helper methods", "waitForScreen", "isScreenPresent", "open", "appName", "scroll vertical", "horizontal", "HomeScreen", "LockScreen", "NavigationBar", "RegisterHomeScreen"],
    practice: ["INC32", "INC33", "INC34", "DR15"],
    body: `## One class per screen

Every screen, pop-up or window has its own Java class — e.g. \`HomeScreen\`, \`LockScreen\`, \`NavigationBar\`, \`RegisterHomeScreen\` {F172}. Every screen class **extends \`BaseTest\`** {F173}, which provides global setup, teardown and instance variables {F174}.

## Two zones

| Zone | Contents |
|---|---|
| **Zone 1 — Element Locators** | Declared UI elements unique to that view, e.g. the app icons on HomeScreen {F175} |
| **Zone 2 — Helper / Action Methods** | The logic driving interactions; **device-specific behaviours are abstracted here** {F176} |

Example of a device quirk in Zone 2: **\`open(String appName)\` scrolls vertically on Flex devices and horizontally on Mini or Station devices** {F177}. Which branch runs is decided by the form factor in \`config.properties\` \`deviceType\` (Mini, Flex, Station), which governs layout and scroll logic {F195}.

## The mandatory methods

Every screen class **must** implement both {F180}:

| Method | Does |
|---|---|
| \`waitForScreen()\` | Pauses execution threads until all UI elements finish rendering, so UI Automator never clicks unrendered buttons {F178} |
| \`isScreenPresent()\` | Returns a **boolean**: is that specific screen currently in focus? {F179} |

A class with only \`waitForScreen()\` does not meet the rules — reviewers should request changes.

## Example

\`\`\`java
/** HomeScreen: LabSim launcher. Every test starts and ends here. */
public class HomeScreen extends BaseTest {

    // ===== Zone 1: Element Locators =====
    private final BySelector registerIcon = By.text("Register");
    private final BySelector clock        = By.res("com.labsim.launcher:id/clock");

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(clock), TIMEOUT_MS);   // never click unrendered buttons
    }

    public boolean isScreenPresent() {
        return device.hasObject(clock);
    }

    public void open(String appName) {
        waitForScreen();
        if (deviceType == DeviceType.FLEX) {
            scrollVerticallyTo(appName);      // Flex: vertical
        } else {                              // Mini, Station
            scrollHorizontallyTo(appName);    // horizontal
        }
        device.findObject(By.text(appName)).click();
    }
}
\`\`\`

> **Illustrative (sim only):** The code is an illustrative sketch†; the class names, zones, \`BaseTest\` and the two mandatory methods are from the reference.

## Symptoms → cause

| Symptom | Cause |
|---|---|
| Flaky \`UiObjectNotFoundException\`, the tap lands before the screen finishes drawing | Missing \`waitForScreen()\` |
| \`open("Register")\` can't find the app on a Flex | Scroll branches swapped (Flex must scroll vertically) |
| Tests start on random screens | Missing \`isScreenPresent()\` checks / teardown ([[tax-test]]) |
`,
  },
  {
    id: "tax-test",
    title: "The Tethered Tax Test, Step by Step",
    category: "Test Frameworks",
    summary: "The reference's end-to-end example: start on HomeScreen, MFD_O1 rings up Tax Item 5 and Orca loads a swipe card via Callus, CFD_O1 asserts the totals, MFD_O2 pays and charges, Step 4 finalises on the customer screen, teardown back to HomeScreen.",
    factIds: ["F181", "F182", "F183", "F184", "F185", "F186", "F187", "F054", "F171"],
    tags: ["uia.config", "uia.taxtest", "cards.callus"],
    related: ["uia-remote-structure", "config-properties", "mfd-cfd-tethered", "callus", "ts-uia-flaky"],
    keywords: ["Tax test", "TaxTest", "MFD_O1", "CFD_O1", "MFD_O2", "Step 4", "Tax Item 5", "Review Order", "Pay", "Charge", "subtotal", "tax", "grand total", "HomeScreen", "teardown", "header"],
    practice: ["INC31", "INC35", "INC47"],
    body: `## Before the steps

- The test file begins with a **plain-text documentation header** explaining the test's intent {F181}.
- Every test **starts explicitly from HomeScreen**, and a **teardown routine forces the hardware back to HomeScreen** at completion {F182}.

## The steps

| Step | Device | What happens |
|---|---|---|
| **1 — MFD_O1** | Merchant display | Open the **Register** app, add **"Tax Item 5"**, click **"Review Order"** {F183}. A backend call goes to **Orchestrator**, which routes to the **Callers/Collos (Callus)** microservice to load a simulated **swipe** card {F184} |
| **2 — CFD_O1** | Customer display | Control shifts to the CFD, which asserts **subtotal, calculated tax and grand total** {F185} |
| **3 — MFD_O2** | Merchant display | Control returns to the MFD to click **"Pay"** and **"Charge"** {F186} |
| **4** | Customer display | The **payment prompt is finalised** on the Customer display {F187} |

MFD = Merchant Facing Device, CFD = Customer Facing Device {F054}. The hand-offs between devices are the runner's sequential device-handle trick {F171}.

## The header (illustrative)

\`\`\`java
/*
 * TaxTest — tethered (MFD + CFD)
 * Intent: verify that a taxable item rings up with the correct subtotal,
 * calculated tax and grand total on the Customer display, then completes
 * payment with a simulated swipe card loaded by Orca via Callus.
 * Safe state: starts on HomeScreen; teardown forces both devices back to HomeScreen.
 * Steps: MFD_O1 → CFD_O1 → MFD_O2 → CFD finalise.
 */
\`\`\`

> **Illustrative (sim only):** The sim prices Tax Item 5 at $10.00 with 8.25 % tax → tax $0.83, total $10.83†.

## Running it locally

1. Fix \`config.properties\` for the tethered rig ([[config-properties]]).
2. **Reserve** the rig in Orca — you're running locally ([[orca-statuses]]).
3. Run \`TaxTest\` from IntelliJ IDEA and watch MFD_O1 → CFD_O1 → MFD_O2 → Step 4.
4. **Release** the rig (back to Available).
`,
  },
  {
    id: "config-properties",
    title: "config.properties (Local Runs)",
    category: "Test Frameworks",
    summary: "Every key in uia-remote's config.properties, the three locked values (avocado, CPA, 5444), the Station Duo same-IP rule, and why you only edit it for local runs.",
    factIds: ["F188", "F189", "F190", "F191", "F192", "F193", "F194", "F195", "F196", "F197", "F198", "F199", "F200", "F201"],
    tags: ["uia.config", "adb.port"],
    related: ["adb-port-5444", "tax-test", "jenkins-env-vars", "ts-adb", "station-duo-dual-screen"],
    keywords: ["config.properties", "runType", "tethered", "merchantFacingDeviceIp", "customerFacingDeviceIp", "serial", "deviceType", "theme", "avocado", "kernelType", "CPA", "SPA", "portNumber", "5444", "5555", "unlockPasscode", "backendEnv", "robotName"],
    practice: ["INC27", "INC29", "INC30", "DR02"],
    body: `## When you edit it

- **Locally (from a laptop):** engineers configure \`config.properties\` **manually** {F188}.
- **In CI:** Jenkins **injects the values dynamically** {F189}. Never commit per-robot values for CI.

## Every key

| Key | Value | Notes |
|---|---|---|
| \`runType\` | \`tethered\` for multi-device setups {F190} | |
| \`merchantFacingDeviceIp\` | Local network IP of the **MFD** terminal {F191} | |
| \`customerFacingDeviceIp\` | Local network IP of the **CFD** terminal {F192} | **Station Duo: both IPs are the exact same address** {F193} |
| \`serial\` | Hardware serial of the primary terminal {F194} | |
| \`deviceType\` | The form factor: \`Mini\`, \`Flex\` or \`Station\` {F195} | Governs layout and scroll logic |
| \`theme\` | Locked to **\`avocado\`** {F196} | Legacy theme toggles are deprecated |
| \`kernelType\` | Locked to **\`CPA\`** (Core Payments Application) {F197} | Replaces the legacy SPA (Secure Processor Application) |
| \`portNumber\` | Locked to **\`5444\`** {F198} | Standard ADB defaults to 5555 {F199} |
| additional keys | Device unlock passcodes, backend testing environment targets, the active robot's registration name {F201} | Sim names: \`unlockPasscode\`, \`backendEnv\`, \`robotName\`† |

## Why 5444

Standard ADB defaults to **5555** {F199}. Using 5555 caused severe office port collisions in which automated scripts **connected to and controlled coworkers' desk devices** {F200}. So \`portNumber\` is locked to **5444** {F198}. See [[adb-port-5444]].

## A broken file and its fix (MEGATRON, tethered)

\`\`\`properties
# as found (broken)          # fixed
runType=standalone           runType=tethered
merchantFacingDeviceIp=…21   merchantFacingDeviceIp=10.42.30.21
customerFacingDeviceIp=      customerFacingDeviceIp=10.42.30.22
deviceType=Mini              deviceType=Station
theme=classic                theme=avocado
kernelType=SPA               kernelType=CPA
portNumber=5555              portNumber=5444
\`\`\`

For a **Station Duo** (one terminal, two displays) set both IPs to the same address, e.g. \`merchantFacingDeviceIp=customerFacingDeviceIp=10.42.30.14\`†, and \`deviceType=Station\`.

> **Illustrative (sim only):** IPs, serials and the extra key names are the sim's†. Key names \`runType\`, \`merchantFacingDeviceIp\`, \`customerFacingDeviceIp\`, \`serial\`, \`deviceType\`, \`theme\`, \`kernelType\`, \`portNumber\` and the locked values are from the reference.
`,
  },
]);
