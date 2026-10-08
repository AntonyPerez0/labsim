/**
 * Canonical topic tags (GP §4.8.1 fine tags + Cur §8 module default tags).
 *
 * Every tag used by facts, quiz items, flashcards, glossary terms, Field Manual articles, incidents and
 * drill items must be declared here (content.test.ts enforces it for src/content). Fine tags roll up to the
 * curriculum module tag of the module that teaches them (`parent`). Where a fine tag has the same string
 * as a module tag it *is* that tag (kind 'module', parent null).
 */
import type { TagDef, TagGroup, TopicTag } from './schema';
import { resolvePeople } from './people';

type Row = [id: TopicTag, label: string, description: string, taughtIn: string, parent: TopicTag | null, group: TagGroup];

/** Curriculum module default tags (Cur §8), one per module. */
const MODULE_ROWS: Row[] = [
  ['lab.orientation', 'Lab orientation', 'Lab tour, safety rules, status tablets at a glance, who does what.', 'M01', null, 'Lab Basics'],
  ['devices', 'LabSim devices', 'Station, Mini, Flex and Compact families; MFD/CFD; tethered test beds.', 'M02', null, 'Hardware'],
  ['power.rails', 'Power rails', '120 V AC → Mean Well → 24 V DC rail → 12 V DC (NUCs) / 5 V DC 10 A (Pis).', 'M03', null, 'Power'],
  ['robots.mechanics', 'Touch-robot mechanics', 'Gantry, steppers, solenoid, dip arm, magnetic lock, Park All, status tablet.', 'M04', null, 'Hardware'],
  ['pi.controller', 'Robot Pi', 'Raspberry Pi Robot Controller, Linux, Wine, and why control left the NUCs.', 'M05', null, 'Hardware'],
  ['orca.status', 'Orca statuses', 'Available, Unavailable, Offline, Connection Failed, Reserved; Orca architecture.', 'M06', null, 'Orca'],
  ['orca.entities', 'Orca entities', 'Robot, Device, Device Type, URL Mappings, tethering and Offsets.', 'M07', null, 'Orca'],
  ['orca.capabilities', 'Capabilities & merchants', 'Robot Capabilities (dynamic JSON vs non-dynamic), Merchant Config, Laz, Ubi.', 'M08', null, 'Orca'],
  ['orca.screens', 'Screens & xy_touch', 'Screens, Screen Locations in mm, xy_touch, ADB vs physical bots, receipt QR.', 'M09', null, 'Orca'],
  ['cards', 'Card profiles', 'Swipe vs Dip/Tap profiles, Gort, Callus, Collis probes, card philosophy.', 'M10', null, 'Bots & Cards'],
  ['jenkins', 'Jenkins', 'The Executor: triggers pipelines, injects env vars, checks out robots.', 'M11', null, 'Jenkins'],
  ['adb.port', 'ADB port 5444', 'Lab ADB runs on 5444; 5555 is the default and caused coworker-device collisions.', 'M12', null, 'ADB'],
  ['uia.pom', 'uia-remote & POM', 'uia-remote structure, Page Object Model, zones and mandatory screen methods.', 'M13', null, 'uia-remote'],
  ['uia.config', 'config.properties', 'config.properties keys and locked values; the tethered Tax test.', 'M14', null, 'uia-remote'],
  ['pigeon', 'Pigeon (LSTR)', 'Legacy Pigeon repo: LSTR runners, raw JSON tests, its bottlenecks.', 'M15', null, 'Pigeon & Receipts'],
  ['duo.ocr', 'Station Duo & OCR', 'The dual-screen problem, Screen Compare/OCR, GIMP, UI Automator 2.3.', 'M16', null, 'Vision & AI'],
  ['infra.ai', 'Infrastructure & AI', 'GPU blade, VMs, Docker/GCP plan, Ollama, Claude, Gen 2 PIN bypass.', 'M17', null, 'Vision & AI'],
  ['teams.history', 'Teams & history', 'Semi, Sedi, Lester, uia-remote, IPX, PayCore, Core OS.', 'M18', null, 'Tools & People'],
];

/** Fine tags (GP §4.8.1). Tags equal to a module tag are declared above, not repeated here. */
const FINE_ROWS: Row[] = [
  ['people.roles', 'People & escalation', '{{jared}}, {{tate}}, {{david}}, {{morgan}} responsibilities; who gets which escalation.', 'M01', 'lab.orientation', 'Tools & People'],
  ['hw.devices', 'Device families', 'Families; Mini 3 ≡ printerless Duo 2; Flex 3/4/Pocket share a profile; Pocket has no printer; Compact = Canada; upcoming Duo 3 / Mini 4.', 'M02', 'devices', 'Hardware'],
  ['power.fuses', 'Inline fuses', 'Inline fuses on the step-down lines; diagnosing and replacing them safely.', 'M03', 'power.rails', 'Power'],
  ['power.18v', 'The 18 V exception', 'LabSim devices (irregular 18 V) and Collis probes go on commercial AC strips only.', 'M03', 'power.rails', 'Power'],
  ['hw.rigbom', 'Rig bill of materials', 'Steppers, solenoids, magnetic locks, limit switches, 25-pin PCBs, regulators, fuses, webcams, tablets, 10 ft rails, 130 ft wiring, ~300 solder points, 200+ nuts and bolts.', 'M04', 'robots.mechanics', 'Hardware'],
  ['hw.print3d', '3D printing', 'Prusa and Bambu Lab printers; black fixtures drafted in CAD from simple shapes.', 'M04', 'robots.mechanics', 'Hardware'],
  ['hw.motion', 'Magnetic lock & Park All', 'Manual arm move breaks the magnetic lock (yellow); Park All homes to (0,0) (green).', 'M04', 'robots.mechanics', 'Hardware'],
  ['hw.lockout', 'Dashboard lockout', 'The control dashboard locks out external users while a test is active.', 'M04', 'robots.mechanics', 'Hardware'],
  ['hw.tablet', 'Status tablet', 'Front status tablet: Human Readable Name, Status, tabs and Motion Control groups.', 'M04', 'robots.mechanics', 'Hardware'],
  ['hw.pi', 'Raspberry Pi duties', '~$50 Pi Robot Controller: ADB routing, camera, steppers, solenoids, Wine; Linux isolation.', 'M05', 'pi.controller', 'Hardware'],
  ['hw.nuc', 'NUC & Minix boxes', 'Windows NUC/Minix boxes; the corporate agent filled NUC disks, so control moved to Pis.', 'M05', 'pi.controller', 'Hardware'],
  ['cards.wine', 'Wine card programming', 'Wine on the Pi runs the Windows-only card-programming software.', 'M05', 'pi.controller', 'Bots & Cards'],
  ['tools.terminal', 'Terminal basics', 'ssh, curl, systemctl, adb, schtasks basics (specific paths and hosts are illustrative).', 'M05', 'pi.controller', 'Tools & People'],
  ['arch.flow', 'Execution flow', 'Jenkins → test runner → Orca → Pi → device; Callus → Collis → card reader.', 'M06', 'orca.status', 'Architecture'],
  ['arch.roles', 'Controller vs Executor', 'Orca (Orchestrator) is the Controller; Jenkins is the Executor.', 'M06', 'orca.status', 'Architecture'],
  ['arch.stack', 'Tech stack', 'Java, Spring Boot, JHipster, MySQL, JSON; Orca as an on-prem monolith on a lab VM.', 'M06', 'orca.status', 'Architecture'],
  ['orca.status.unavailable', 'Unavailable', 'Named-job only; isolates PayCore standalone rigs; auto-reset after a named job.', 'M06', 'orca.status', 'Orca'],
  ['orca.status.offline', 'Offline', 'Manual placeholder while building a rig or profiles; health checks skipped.', 'M06', 'orca.status', 'Orca'],
  ['orca.status.connfailed', 'Connection Failed', 'Dropped or non-200 health ping; blocked checkouts; Notes; escalate to {{jared}}.', 'M06', 'orca.status', 'Orca'],
  ['orca.status.reserved', 'Reserved', 'Set when running locally; blocks Jenkins pipelines and health-check overrides.', 'M06', 'orca.status', 'Orca'],
  ['orca.healthcheck', 'Health check', 'Every 5 minutes a synchronized background thread pings every Pi; no response / non-200 fails.', 'M06', 'orca.status', 'Orca'],
  ['orca.notes', 'Notes', 'Connection Failed opens Notes with the exact endpoint attempted and the error text.', 'M06', 'orca.status', 'Orca'],
  ['orca.robot', 'Robot entity', 'Robot entity: the 40+ rig pool and status flags; {{tate}}\'s filter UI.', 'M06', 'orca.status', 'Orca'],
  ['orca.names', 'Name vs Human Readable Name', 'Name = system identifier; Human Readable Name = string pushed to the tablet.', 'M07', 'orca.entities', 'Orca'],
  ['orca.device', 'Robot Device', 'Robot Device links to a separate Device entity; upgrades keep the old row for rollback.', 'M07', 'orca.entities', 'Orca'],
  ['orca.devicetype', 'Device Type enum', 'Enum of dimensions, layout metrics and internal strings; why env vars are ALL CAPS.', 'M07', 'orca.entities', 'Orca'],
  ['orca.urls', 'URL Mappings', 'Robot ADB Service URL, Camera Stream URL (dedicated or shared across 4 rigs), Dip/Tap/Swipe URLs.', 'M07', 'orca.entities', 'Orca'],
  ['orca.tethered', 'Tethered configuration', 'MFD/CFD relations; MFD populated ⇒ the pipeline treats the rig as tethered.', 'M07', 'orca.entities', 'Orca'],
  ['orca.offsets', 'Offsets', 'Legacy mm offsets for imprecise limit switches; mostly deprecated after true (0,0) calibration.', 'M07', 'orca.entities', 'Orca'],
  ['orca.merchant', 'Merchant Config', 'Merchant account parameters; click Edit to see every field; App ID / App Secret / API Key.', 'M08', 'orca.capabilities', 'Orca'],
  ['laz.oobe', 'Laz OOBE', 'Zero-touch OOBE: de-provision, wipe caches, setup wizard, swap merchants mid-suite.', 'M08', 'orca.capabilities', 'Merchants & SDK'],
  ['ubi.routing', 'Ubi routing', 'Ubi Platform routes jobs that dynamically switch merchant configurations.', 'M08', 'orca.capabilities', 'Merchants & SDK'],
  ['go.sdk', 'Go SDK', 'Terminal SDK; Orca extensions; tested through Pigeon and mobile runners; credentials as env vars.', 'M08', 'orca.capabilities', 'Merchants & SDK'],
  ['orca.xytouch', 'xy_touch', 'Screen name + button string → Orca mm lookup → Pi fires an ADB touch or a probe tap.', 'M09', 'orca.screens', 'Orca'],
  ['receipt.qr', 'Receipt QR regression', '"Scan for receipt" shifted buttons a few mm; 48 h of broken coordinates until {{jared}}\'s PR.', 'M09', 'orca.screens', 'Pigeon & Receipts'],
  ['receipt.maps', '4- and 5-option maps', 'Separate 4-option and 5-option receipt coordinate maps per device profile.', 'M09', 'orca.screens', 'Pigeon & Receipts'],
  ['bots.types', 'ADB vs physical bots', 'ADB bots are purely programmatic; physical bots have mechanical touch probes.', 'M09', 'orca.screens', 'Bots & Cards'],
  ['bots.pin', 'PIN entry', 'Canadian flows need physical PIN entry; Gen 2 software PIN bypass with the Core OS Team.', 'M09', 'orca.screens', 'Bots & Cards'],
  ['hw.collis', 'Collis probes', 'High-cost UL Transaction Security card emulators on rear ribbon cables: swipe, dip, tap.', 'M10', 'cards', 'Hardware'],
  ['cards.philosophy', 'Card philosophy', 'One reliable Visa (+ Interac for Canada) vs PayCore\'s Visa/Discover/AmEx matrix.', 'M10', 'cards', 'Bots & Cards'],
  ['cards.swipe', 'Swipe profiles', 'Raw Track Data text in MySQL, extracted with a hardware card-reader utility.', 'M10', 'cards', 'Bots & Cards'],
  ['cards.diptap', 'Dip & Tap profiles', 'File paths to card definitions in Gort.', 'M10', 'cards', 'Bots & Cards'],
  ['cards.callus', 'Callus', 'Callus on Windows/Minix boxes; scheduled Gort clone; loads virtual cards; drives Collis.', 'M10', 'cards', 'Bots & Cards'],
  ['jenkins.envvars', 'Env-var injection', 'Runtime environment variables injected by Jenkins; ALL-CAPS enum values.', 'M11', 'jenkins', 'Jenkins'],
  ['jenkins.folders', 'Legacy job layout', 'Legacy jobs organised by platform: Java jobs vs iOS jobs.', 'M11', 'jenkins', 'Jenkins'],
  ['jenkins.checkout', 'Checkout', 'Pipelines check out a matching robot from Orca and release it afterwards.', 'M11', 'jenkins', 'Jenkins'],
  ['adb.usage', 'Using ADB', 'Inspect XML UI hierarchies, locate elements, dispatch programmatic touch events.', 'M12', 'adb.port', 'ADB'],
  ['arch.repos', 'Repositories', 'GitHub repos Gort, uia-remote, pigeon and their roles.', 'M13', 'uia.pom', 'Architecture'],
  ['tools.intellij', 'IntelliJ IDEA', 'Import repos, configure local properties, run suites.', 'M13', 'uia.pom', 'Tools & People'],
  ['tools.github', 'GitHub', 'Branches, pull requests, reviews.', 'M13', 'uia.pom', 'Tools & People'],
  ['uia.layout', 'uia-remote layout', 'app/src/main (QA never edits), test, androidTest; Maven-style layout.', 'M13', 'uia.pom', 'uia-remote'],
  ['uia.packages', 'androidTest packages', 'databases, pageobjects, testactions.', 'M13', 'uia.pom', 'uia-remote'],
  ['uia.multidevice', 'Multi-device runner', 'UI Automator talks to one device at a time; the runner in test hops between handles.', 'M13', 'uia.pom', 'uia-remote'],
  ['uia.sync', 'Synchronization methods', 'Mandatory waitForScreen() and isScreenPresent().', 'M13', 'uia.pom', 'uia-remote'],
  ['uia.scroll', 'open(appName) scrolling', 'Vertical on Flex, horizontal on Mini/Station.', 'M13', 'uia.pom', 'uia-remote'],
  ['uia.taxtest', 'The Tax test', 'MFD_O1 → CFD_O1 → MFD_O2 → Step 4; HomeScreen start and teardown.', 'M14', 'uia.config', 'uia-remote'],
  ['pigeon.lstr', 'LSTR runners', 'REST/Android/Windows/iOS runners; Lester heritage; pidgin pun; iOS rarely touched.', 'M15', 'pigeon', 'Pigeon & Receipts'],
  ['pigeon.json', 'Pigeon JSON', 'Test name, connection type, platforms (4–5 at once), actions array.', 'M15', 'pigeon', 'Pigeon & Receipts'],
  ['pigeon.abstraction', 'Action abstraction', 'High-level actions ("card swipe") become SDK requests or robot actions per platform.', 'M15', 'pigeon', 'Pigeon & Receipts'],
  ['pigeon.nolint', 'No JSON linter', 'Hunt missing commas/brackets by hand; copy-paste known-good blocks.', 'M15', 'pigeon', 'Pigeon & Receipts'],
  ['jenkins.logs', 'Reading logs', 'Reading consoles; the misleading "select print" failure.', 'M15', 'pigeon', 'Jenkins'],
  ['orca.screencompare', 'Screen Compare Image', 'Station Duo OCR workaround; brittleness; deprecation.', 'M16', 'duo.ocr', 'Orca'],
  ['pigeon.gimp', 'GIMP coordinates', 'Bounding-box coordinate extraction in GIMP for screen comparisons.', 'M16', 'duo.ocr', 'Pigeon & Receipts'],
  ['uia.v23', 'UI Automator 2.3', 'Native dual-screen element location tracking.', 'M16', 'duo.ocr', 'uia-remote'],
  ['vision.camera', 'Camera streams', 'Webcam streams (dedicated per Pi or shared across 4 rigs) and snapshots.', 'M16', 'duo.ocr', 'Vision & AI'],
  ['vision.tesseract', 'Tesseract OCR', 'Tesseract OCR on cropped webcam screenshots of ADB-blind displays.', 'M16', 'duo.ocr', 'Vision & AI'],
  ['arch.infra', 'Infrastructure', '4× NVIDIA blade (2 exposed, 2 under) replacing a tower; VMs; Docker & GCP planned.', 'M17', 'infra.ai', 'Architecture'],
  ['vision.ollama', 'Ollama', 'Local LLM runner on the blade; vision PoC for receipt layouts and tip math.', 'M17', 'infra.ai', 'Vision & AI'],
  ['tools.claude', 'Claude', 'Evaluated for repository optimisation and automated test generation.', 'M17', 'infra.ai', 'Vision & AI'],
  ['uia.history', 'uia-remote history', 'Semi, Sedi (Lester), {{morgan}}\'s uia-remote, IPX, PayCore and the native apps covered.', 'M18', 'teams.history', 'uia-remote'],
  ['semi.paydisplay', 'Pay Display apps', 'USB Pay Display & Secure Network Pay Display (Semi Team).', 'M18', 'teams.history', 'Merchants & SDK'],
];

function toDef(kind: TagDef['kind']) {
  return ([id, label, description, taughtIn, parent, group]: Row): TagDef => ({ id, label, description, taughtIn, parent, group, kind });
}

/** Every declared tag: module tags first (M01→M18), then fine tags (GP §4.8.1 order). */
export const TOPIC_TAGS: TagDef[] = resolvePeople([...MODULE_ROWS.map(toDef('module')), ...FINE_ROWS.map(toDef('fine'))]);

/** Fast lookup by id. */
export const TAGS_BY_ID: Record<TopicTag, TagDef> = Object.fromEntries(TOPIC_TAGS.map((t) => [t.id, t]));

/** Module id → its default topic tag (Cur §8). */
export const MODULE_TAGS: Record<string, TopicTag> = Object.fromEntries(MODULE_ROWS.map((r) => [r[3], r[0]]));

/** Field Manual chapter / radar group order (GP §2.6). */
export const TAG_GROUPS: TagGroup[] = [
  'Lab Basics',
  'Architecture',
  'Orca',
  'Jenkins',
  'uia-remote',
  'Pigeon & Receipts',
  'ADB',
  'Power',
  'Hardware',
  'Bots & Cards',
  'Merchants & SDK',
  'Vision & AI',
  'Tools & People',
];

export function isKnownTag(tag: string): boolean {
  return tag in TAGS_BY_ID;
}

/** The curriculum module tag a tag rolls up to (itself for module tags). */
export function rootTag(tag: TopicTag): TopicTag {
  const def = TAGS_BY_ID[tag];
  return def?.parent ?? tag;
}

/** All fine tags that roll up to a module tag, including the module tag itself. */
export function tagsUnder(moduleTag: TopicTag): TopicTag[] {
  return TOPIC_TAGS.filter((t) => t.id === moduleTag || t.parent === moduleTag).map((t) => t.id);
}
