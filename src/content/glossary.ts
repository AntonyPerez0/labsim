/**
 * Glossary — every system, repo, tool, device, status, entity, config key and acronym a trainee meets.
 * Definitions agree with docs/reference/REMOVED-internal-reference.md; `illustrative` marks sim-only names.
 * People appear as `{{key}}` tokens (resolved from team.ts).
 */
import type { GlossaryTerm } from './schema';
import { resolvePeople } from './people';

function g(term: string, aliases: string[], definition: string, tags: string[], articleId?: string, illustrative?: boolean): GlossaryTerm {
  return { term, aliases, definition, tags, ...(articleId ? { articleId } : {}), ...(illustrative ? { illustrative: true } : {}) };
}

export const GLOSSARY: GlossaryTerm[] = resolvePeople<GlossaryTerm[]>([
  // ── Systems & repositories ────────────────────────────────────────────────
  g('Orchestrator', ['Orca'], 'The on-premise Spring Boot monolith that acts as the central Controller between Jenkins pipelines and the physical lab robots. Backed by MySQL; runs on a lab VM.', ['orca.status', 'arch.roles', 'arch.stack'], 'orca-overview'),
  g('Jenkins', ['Executor', 'CI/CD'], 'The CI/CD execution engine ("Executor"): triggers test pipelines, injects runtime environment variables and checks robots out of Orca. Legacy jobs are split into Java and iOS.', ['jenkins', 'arch.roles'], 'jenkins-executor'),
  g('Gort', ['Gort monorepo'], 'The core monorepo housing the automated testing ecosystem, its configuration modules and the virtual card definition files used by Dip and Tap profiles. Despite the robot-style name, it is a repo, not a rig.', ['cards', 'arch.repos', 'cards.diptap'], 'card-profiles'),
  g('uia-remote', ['UIA Remote', 'uia remote'], 'The team\'s modern Java / Android UI Automator (2.3) test repository; automates standalone devices and tethered multi-device setups across native LabSim apps. Created by {{morgan}}.', ['uia.pom', 'arch.repos'], 'uia-remote-structure'),
  g('Pigeon', ['LSTR', 'pigeon repo'], 'The legacy test repository (aka LSTR), evolved from Lester; parses raw JSON test payloads across REST, Android, Windows and iOS. The name puns on "pidgin language".', ['pigeon', 'pigeon.lstr'], 'pigeon-lstr'),
  g('LSTR', ['Language Specific Test Runner'], 'Language Specific Test Runner — Pigeon\'s engine, with dedicated runners for REST, Android, Windows and iOS.', ['pigeon', 'pigeon.lstr'], 'pigeon-lstr'),
  g('Lester', ['Lester framework'], 'The legacy framework the Sedi (QA) Team used to test the Semi Team\'s apps; Pigeon evolved from it.', ['pigeon.lstr', 'uia.history'], 'teams-and-history'),
  g('Laz Automation', ['Laz'], 'Automated provisioning framework running a zero-touch OOBE routine: de-provisions hardware, wipes local caches, steps through the setup wizard and swaps merchants mid-suite.', ['orca.capabilities', 'laz.oobe'], 'laz-and-ubi'),
  g('Callus', ['Callers', 'Collos'], 'Microservice on the local Windows/Minix boxes that reads card-profile paths from Gort, loads the virtual card and drives the physical Collis probes. Not to be confused with Collis (the probe).', ['cards', 'cards.callus'], 'callus'),
  g('Ubi Platform', ['Ubi'], 'Internal routing platform used when test jobs dynamically switch merchant configurations.', ['orca.capabilities', 'ubi.routing'], 'laz-and-ubi'),
  g('USB Pay Display', [], 'Semi Team application that links a Merchant Facing Device and a Customer Facing Device over USB.', ['teams.history', 'semi.paydisplay'], 'mfd-cfd-tethered'),
  g('Secure Network Pay Display', [], 'Semi Team application that links MFDs and CFDs over the local network.', ['teams.history', 'semi.paydisplay'], 'mfd-cfd-tethered'),
  g('Robot Controller', ['Robot Pi', 'controller'], 'The Raspberry Pi on each shelf: ADB routing, camera streams, stepper motors, solenoids and Wine card-programming emulation. Orca pings it every 5 minutes.', ['pi.controller', 'hw.pi'], 'robot-pi'),
  // ── Languages, frameworks, tools ──────────────────────────────────────────
  g('Java', ['Oracle Java'], 'Primary programming language of both the Orchestrator backend and the uia-remote test suites.', ['arch.stack'], 'tech-stack'),
  g('Spring Boot', [], 'Backend web framework used to build the Orchestrator monolith and its REST API endpoints.', ['arch.stack'], 'tech-stack'),
  g('JHipster', [], 'Rapid application development platform that scaffolded Orchestrator through an interactive setup questionnaire, generating the frontend UI, Spring Boot REST endpoints and MySQL schemas.', ['arch.stack'], 'tech-stack'),
  g('MySQL', [], 'The relational database backing Orchestrator: hardware states, merchant profiles, screen-coordinate tables, card profiles.', ['arch.stack'], 'orca-overview'),
  g('Android UI Automator', ['UI Automator', 'UIA'], 'Google\'s native Android instrumentation framework, used inside uia-remote. Designed to talk to one Android device at a time.', ['uia.pom', 'uia.multidevice'], 'tech-stack'),
  g('UI Automator 2.3', ['UIA 2.3'], 'The UI Automator version uia-remote uses, because it adds native dual-screen element location tracking — the reason Station Duo OCR checks are being phased out.', ['duo.ocr', 'uia.v23'], 'station-duo-dual-screen'),
  g('Go', ['Golang', 'Terminal SDK', 'Go SDK'], 'Language of the Terminal SDK, supported via custom extensions in Orchestrator and tested through Pigeon and mobile runners. Go pipelines receive App ID / App Secret / API Key as env vars.', ['go.sdk'], 'orca-merchant-config'),
  g('Apache Maven', ['Maven'], 'Build-structure standard mirrored by the uia-remote Android project layout (app/src/main, test, androidTest).', ['uia.layout'], 'uia-remote-structure'),
  g('JSON', [], 'Data format for Orca\'s runtime capability lookups and for Pigeon\'s declarative, platform-agnostic test payloads.', ['arch.stack', 'pigeon.json'], 'pigeon-lstr'),
  g('ADB', ['Android Debug Bridge', 'adb'], 'Command-line tool used to inspect XML UI hierarchies, locate elements and dispatch programmatic touch events. In the lab it runs over port 5444.', ['adb.port', 'adb.usage'], 'adb-commands'),
  g('IntelliJ IDEA', ['IntelliJ', 'IDE'], 'The team\'s primary IDE: import repositories, configure local properties and execute test suites.', ['tools.intellij'], 'intellij-and-github'),
  g('GitHub', [], 'Hosts the team\'s repositories (Gort, uia-remote, pigeon) for branch management and pull requests.', ['tools.github', 'arch.repos'], 'intellij-and-github'),
  g('Tesseract OCR', ['Tesseract'], 'Open-source OCR engine run on cropped webcam screenshots to validate text on displays that are blind to ADB.', ['duo.ocr', 'vision.tesseract'], 'orca-screen-compare'),
  g('GIMP', [], 'Image editor used to open device screenshots, draw bounding boxes around text and extract exact coordinates for screen comparisons.', ['duo.ocr', 'pigeon.gimp'], 'gimp-coordinates'),
  g('Ollama', [], 'Local LLM runner on the lab\'s 4-GPU blade; runs proof-of-concept vision-LLM checks of webcam streams to validate receipt layouts and tip math.', ['infra.ai', 'vision.ollama'], 'ollama-and-claude'),
  g('Claude', [], 'AI model evaluated during corporate AI initiatives for repository optimisation and automated test generation.', ['infra.ai', 'tools.claude'], 'ollama-and-claude'),
  g('Linux', [], 'Operating system on the Raspberry Pi controllers; isolates hardware control loops from corporate Windows machines.', ['pi.controller', 'hw.pi'], 'linux-and-wine'),
  g('Wine', [], 'Compatibility layer on the Pi\'s Linux that emulates the Windows-only card-programming software.', ['pi.controller', 'cards.wine'], 'linux-and-wine'),
  g('Docker', [], 'Container platform; with GCP, the planned migration target for Orchestrator (today on an on-prem lab VM).', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  g('Google Cloud Platform', ['GCP', 'Google Cloud'], 'Planned cloud home for a containerised Orchestrator.', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  g('Virtual Machine', ['VM', 'lab VM'], 'Orca runs on a local, on-premise lab VM; the shelf-mounted GPU server blade hosts the VMs, Orca, Jenkins and Ollama.', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  // ── Hardware ──────────────────────────────────────────────────────────────
  g('GPU server blade', ['blade', 'server blade', 'NVIDIA GPUs'], 'Shelf-mounted server with four NVIDIA GPUs (two exposed, two underneath) that replaced a legacy tower; hosts the VMs, Orca, Jenkins and Ollama.', ['infra.ai', 'arch.infra'], 'infrastructure-overview'),
  g('Raspberry Pi', ['Pi', 'RPi'], 'About $50 single-board computer running Linux; one per shelf as the Robot Controller. Powered from the 5V DC, 10A line.', ['pi.controller', 'hw.pi'], 'robot-pi'),
  g('Intel NUC', ['NUC', 'ASUS NUC'], 'Small Windows execution machine powered from the 12V DC line. corporate security monitoring filled their disks, so hardware control moved to the Pis.', ['pi.controller', 'hw.nuc'], 'nuc-minix-history'),
  g('Minix box', ['Minix'], 'Small Windows execution machine; runs the Callus service that drives the Collis probes. A Minix box going offline is a typical Connection Failed cause.', ['pi.controller', 'hw.nuc', 'cards.callus'], 'nuc-minix-history'),
  g('corporate security monitoring', ['security agent', 'corporate'], 'Aggressive corporate security-monitoring packages that exhausted the NUCs\' disk space — the reason hardware control was migrated onto Raspberry Pis.', ['pi.controller', 'hw.nuc'], 'nuc-minix-history'),
  g('Collis probe', ['Collis', 'UL Transaction Security'], 'High-cost proprietary card emulator (UL Transaction Security) on a rear ribbon cable; simulates mag-stripe swipes, EMV chip dips and contactless NFC taps. AC strip power only.', ['cards', 'hw.collis'], 'collis-probes'),
  g('Mean Well transformer', ['Mean Well', 'PSU'], 'Industrial power supply converting 120V AC wall power to the lab\'s central 24V DC rail.', ['power.rails'], 'power-distribution'),
  g('24V DC rail', ['24V rail', 'central rail'], 'The central DC rail fed by the Mean Well; step-down regulators split it into 12V and 5V 10A lines. Never for LabSim devices or Collis probes.', ['power.rails'], 'power-distribution'),
  g('Step-down regulator', ['DC-DC converter', 'regulator'], 'Converts the 24V rail to the 12V DC line (NUCs) and the 5V DC, 10A line (Pis).', ['power.rails'], 'power-distribution'),
  g('Inline fuse', ['fuse'], 'Fuse protecting a DC line from the step-down regulators. A blown 5V fuse darkens a rack\'s Pis.', ['power.rails', 'power.fuses'], 'fuses-and-multimeter'),
  g('Commercial AC power strip', ['AC strip', 'power strip'], 'Where LabSim terminals and Collis probes plug in (with their own power supplies) — never the custom DC rails.', ['power.rails', 'power.18v'], 'power-18v-exception'),
  g('18V exception', ['18V', 'irregular 18V'], 'LabSim devices draw an irregular 18V, so they and the Collis probes bypass the custom DC rails and use commercial AC power strips to prevent frying components.', ['power.rails', 'power.18v'], 'power-18v-exception'),
  g('Stepper motor', ['NEMA-17', 'steppers'], 'Sub-millimetre motors (NEMA-17 with GT2 pulleys in the photos) that move the gantry; enabled/disabled from the tablet\'s Steppers group.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Solenoid', ['push-pull solenoid', 'plunger'], 'Remote-firing solenoid on the gantry carriage; its plunger drops onto the screen to tap.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Magnetic lock', ['maglock', 'mag lock'], 'Holds each robot arm. Moving an arm by hand breaks it and turns the status banner yellow.', ['robots.mechanics', 'hw.motion'], 'maglock-and-park-all'),
  g('Limit switch', ['limit switches', 'endstop'], 'Physical switches calibrated to the (0,0) origin; Park All drives the steppers back to them.', ['robots.mechanics', 'hw.motion'], 'maglock-and-park-all'),
  g('Motor controller PCB', ['25-pin PCB', 'motor board'], 'Custom 25-pin motor-controller boards, printed in Hong Kong.', ['robots.mechanics', 'hw.rigbom'], 'fabrication-and-bom'),
  g('Dip arm', ['sector gear'], 'Black rotating arm (sector gear marked 63) that carries the Collis probe\'s flat white ribbon card into the device\'s chip slot.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Gantry', ['XY gantry', '2020 extrusion', 'V-slot'], 'The XY frame of a touch robot: 2020 aluminium extrusion with V-slot wheels, NEMA-17 steppers on GT2 belts and a carriage carrying the solenoid.', ['robots.mechanics', 'hw.rigbom'], 'touch-robot-anatomy'),
  g('Webcam', ['rig camera', 'camera'], 'Rig camera served by the Pi as a camera stream; the source of monitoring video and OCR screenshots.', ['duo.ocr', 'vision.camera'], 'touch-robot-anatomy'),
  g('Status tablet', ['tablet', 'dashboard'], 'Front-mounted tablet on each touch robot: Human Readable Name, LabSim logo, "Status: OK", "Brainbox v6"; tabs Robot, Robot Control, Motion Control.', ['robots.mechanics', 'hw.tablet'], 'status-tablet'),
  g('Brainbox v6', ['Brainbox'], 'The board/firmware string shown in the status tablet header beneath "Status: OK".', ['robots.mechanics', 'hw.tablet'], 'status-tablet'),
  g('Motion Control', ['Motion Control tab'], 'Tablet tab with button groups Steppers, Park, Dip, Tap, Phone and Solenoid.', ['robots.mechanics', 'hw.tablet'], 'status-tablet'),
  g('Park All', ['park', 'home'], 'Tablet command (Park group) that drives the steppers back to the limit switches at (0,0), clears errors and turns the banner green.', ['robots.mechanics', 'hw.motion'], 'maglock-and-park-all'),
  g('Dashboard lockout', ['lockout', 'controls locked'], 'While a test is active the global LabSim control dashboard locks out external users.', ['robots.mechanics', 'hw.lockout'], 'status-tablet'),
  g('POWER panel', ['MAIN', 'MOTOR'], 'Black 3D-printed panel beside the tablet with two green LEDs and toggles MAIN (controller power) and MOTOR (motor power).', ['lab.orientation', 'hw.tablet'], 'lab-tour'),
  g('SmartStripe Probe', ['SmartStripe'], 'Black USB dongle with a green LED between the tethered test-bed screens (reference photo).', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('LabSim connectivity hub', ['hub', 'connectivity hub'], 'White LabSim hub (Ethernet, USB, power) held in a black 3D-printed dock below each tethered screen, labelled per device.', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('3D printers', ['Prusa', 'Bambu Lab'], 'The Prusa and Bambu Lab printers that print all of the lab\'s black plastic modular fixtures, drafted in CAD from simple shapes.', ['lab.orientation', 'hw.print3d'], 'fabrication-and-bom'),
  g('Rack unit', ['RU', 'rack units'], 'Numbered positions on the rack rails (29–40 in the reference photo).', ['lab.orientation', 'hw.rigbom'], 'lab-tour'),
  // ── Devices ───────────────────────────────────────────────────────────────
  g('Station', ['Station 2018', 'Station 2'], 'LabSim countertop family: Station 2018, Station 2 and Station Duo (Duo 1, Duo 2, upcoming Duo 3).', ['devices', 'hw.devices'], 'device-families'),
  g('Station Duo', ['Duo', 'Station Duo 2', 'Duo 2', 'Duo 3'], 'One terminal driving two displays; only the primary MFD is exposed to ADB. The Duo 2 is printerless; the Duo 3 is upcoming.', ['devices', 'hw.devices', 'duo.ocr'], 'station-duo-dual-screen'),
  g('Mini', ['Mini 2', 'Mini 3', 'Mini 4'], 'Mini family: Mini 2, Mini 3 (the hot-swap equivalent for a printerless Station Duo 2) and the upcoming Mini 4.', ['devices', 'hw.devices'], 'device-families'),
  g('Flex', ['Flex 1', 'Flex 2', 'Flex 3', 'Flex 4'], 'Flex family: Flex 1, 2, 3, 4 and Pocket. Flex 3, Flex 4 and Flex Pocket share the exact same testing profile.', ['devices', 'hw.devices'], 'device-families'),
  g('Flex Pocket', ['Pocket'], 'Flex model sharing the Flex 3/4 testing profile but omitting the physical printer block.', ['devices', 'hw.devices'], 'device-families'),
  g('LabSim Compact', ['Compact'], 'Target terminal for the Canadian market, used on the Westers test beds.', ['devices', 'hw.devices'], 'device-families'),
  g('MFD', ['Merchant Facing Device'], 'The merchant\'s screen/device. If Orca\'s MFD field is populated the pipeline treats the rig as tethered.', ['devices', 'hw.devices', 'orca.tethered'], 'mfd-cfd-tethered'),
  g('CFD', ['Customer Facing Device'], 'The customer\'s screen/device (totals, payment prompt). On a Station Duo it is blind to ADB.', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('Tethered setup', ['tethered', 'nested setup'], 'Two devices working as MFD + CFD, e.g. a Station 2 tethered to a Mini 2, or nested Mini 3 rigs.', ['orca.entities', 'orca.tethered'], 'mfd-cfd-tethered'),
  g('Westers test bed', ['Westers'], 'Test beds for the Canadian market (LabSim Compact); Contact Canada scripts run there using both capability lookup styles.', ['devices', 'hw.devices', 'orca.capabilities'], 'card-testing-philosophy'),
  g('Hot-swap', ['hot swap'], 'Replacing a down device with an equivalent: a Mini 3 for a printerless Station Duo 2.', ['devices', 'hw.devices'], 'device-families'),
  // ── Robot statuses & Orca behaviour ───────────────────────────────────────
  g('Available', [], 'Robot status: online, healthy and open to general pipeline checkouts.', ['orca.status'], 'orca-statuses'),
  g('Unavailable', [], 'Robot status: strictly reserved; only jobs passing the robot\'s exact unique name can check it out. Isolates rigs like PayCore standalone setups; Orca resets it to Unavailable after a named job.', ['orca.status', 'orca.status.unavailable'], 'orca-statuses'),
  g('Offline', [], 'Robot status: manual placeholder while a rig is being built or its data profiles assembled. Orca skips its 5-minute health checks.', ['orca.status', 'orca.status.offline'], 'orca-statuses'),
  g('Connection Failed', ['CONNECTION_FAILED'], 'Robot status set automatically when the 5-minute REST ping to the Pi drops or returns non-200. Blocks checkouts, opens Notes, escalated to {{jared}}.', ['orca.status', 'orca.status.connfailed'], 'ts-connection-failed'),
  g('Reserved', [], 'Robot status set manually by an engineer running tests locally; blocks Jenkins pipelines and health-check overrides.', ['orca.status', 'orca.status.reserved'], 'orca-statuses'),
  g('Health check', ['health ping', 'ping'], 'Orca\'s synchronized background thread that pings every Pi\'s Robot Controller every 5 minutes.', ['orca.status', 'orca.healthcheck'], 'orca-health-check'),
  g('Notes', ['Orca Notes'], 'Section Orca opens on Connection Failed, logging the exact endpoint attempted and the error text.', ['orca.status', 'orca.notes'], 'orca-health-check'),
  g('Checkout', ['check out', 'robot checkout'], 'Jenkins reserving a matching robot from Orca for a pipeline run; blocked for Offline, Connection Failed and Reserved rigs, and for Unavailable unless named.', ['jenkins', 'jenkins.checkout'], 'jenkins-executor'),
  g('Controller', ['Controller vs Executor'], 'Orca\'s role in the architecture; Jenkins is the Executor.', ['orca.status', 'arch.roles'], 'orca-overview'),
  // ── Orca entities & fields ────────────────────────────────────────────────
  g('JHipster entities', ['core schemas', '7 schemas'], 'Orca\'s 7 core database schemas: Robot, Robot Creation & Configuration, Robot Capabilities, Merchant Config, Screens & Screen Locations, Card Profile, Screen Compare Image.', ['orca.entities', 'arch.stack'], 'orca-robot-device'),
  g('Robot entity', ['Robots'], 'Tracks the pool of 40+ rigs and their status flags, with {{tate}}\'s custom filter UI.', ['orca.status', 'orca.robot'], 'orca-statuses'),
  g('Name', ['robot name', 'system name'], 'A robot\'s system identifier, used by Orca and pipelines (e.g. in ROBOT_NAME). Never edit it to fix a display typo.', ['orca.entities', 'orca.names'], 'orca-robot-device'),
  g('Human Readable Name', ['HRN', 'display name'], 'A robot\'s display string, pushed to the physical status tablet on the front of the enclosure.', ['orca.entities', 'orca.names'], 'orca-robot-device'),
  g('Robot Device', ['Device entity', 'Device'], 'Field linking a robot to a separate Device entity, so hardware upgrades (e.g. Flex 1 → Flex 2) keep the legacy configuration for quick rollback.', ['orca.entities', 'orca.device'], 'orca-robot-device'),
  g('Device Type', ['DeviceType', 'device type enum'], 'Enum storing device dimensions, layout metrics and internal string definitions — the reason Jenkins env vars must be ALL CAPS.', ['orca.entities', 'orca.devicetype'], 'orca-robot-device'),
  g('URL Mappings', ['URL mapping'], 'Per-robot URLs: Robot ADB Service URL, Camera Stream URL and the hardware-specific Dip, Tap and Swipe URLs.', ['orca.entities', 'orca.urls'], 'orca-urls-tethering-offsets'),
  g('Robot ADB Service URL', ['ADB Service URL'], 'URL mapping that routes ADB to the robot\'s Pi controller.', ['orca.entities', 'orca.urls'], 'orca-urls-tethering-offsets'),
  g('Camera Stream URL', ['camera stream'], 'URL mapping for the webcam feed — dedicated per Pi or shared across 4 rigs.', ['orca.entities', 'orca.urls', 'vision.camera'], 'orca-urls-tethering-offsets'),
  g('Dip / Tap / Swipe URLs', ['Dip URL', 'Tap URL', 'Swipe URL'], 'Hardware-specific card-action URL mappings stored per robot.', ['orca.entities', 'orca.urls'], 'orca-urls-tethering-offsets'),
  g('USB Tethered Device Configuration', ['MFD/CFD fields'], 'Orca configuration populating MFD and CFD relations for nested setups. A populated MFD field makes the pipeline treat the rig as tethered.', ['orca.entities', 'orca.tethered'], 'orca-urls-tethering-offsets'),
  g('Offsets', ['Offset X', 'Offset Y'], 'Legacy millimetre coordinate adjustments for imprecise limit switches; mostly deprecated since {{jared}} calibrated the lab to a true (0,0).', ['orca.entities', 'orca.offsets'], 'orca-urls-tethering-offsets'),
  g('Robot Capabilities', ['capabilities'], 'Entity controlling how Orca matches pipeline requests to physical hardware, via dynamic JSON or non-dynamic lookups.', ['orca.capabilities'], 'orca-capabilities'),
  g('Dynamic JSON lookup', ['dynamic lookup'], 'Capability lookup used by SDK frameworks: capabilities are JSON metadata inside each test definition, parsed at runtime. Overseen by {{david}}.', ['orca.capabilities'], 'orca-capabilities'),
  g('Non-dynamic lookup', ['hardcoded capabilities'], 'Capability lookup used by traditional UI Automator suites: capabilities are hardcoded inside the pipeline script.', ['orca.capabilities'], 'orca-capabilities'),
  g('Merchant Config', ['merchant configuration'], 'Entity storing merchant account parameters. Table display limits mean you must click Edit on a row to see every field.', ['orca.capabilities', 'orca.merchant'], 'orca-merchant-config'),
  g('App ID / App Secret / API Key', ['App ID', 'App Secret', 'API Key'], 'Merchant Config fields {{tate}} added so pipelines can export them as runtime environment variables for the Go SDK.', ['orca.capabilities', 'orca.merchant', 'go.sdk'], 'orca-merchant-config'),
  g('Screens', ['Screens entity'], 'Entity mapping discrete UI layouts within a transaction flow relative to the device architecture (e.g. a cash-discount tender prompt).', ['orca.screens'], 'orca-screens-xytouch'),
  g('Screen Locations', ['Screen Locations entity', 'coordinates'], 'Entity mapping exact button placements as relative X/Y coordinates in millimetres.', ['orca.screens'], 'orca-screens-xytouch'),
  g('xy_touch', ['xy touch'], 'Orca REST endpoint: a script sends a screen name and button string; Orca looks up the mm coordinates and has the Pi fire an ADB touch or a physical probe tap.', ['orca.screens', 'orca.xytouch'], 'orca-screens-xytouch'),
  g('Card Profile', ['card profiles'], 'Entity for test cards: swipe profiles store raw Track Data in MySQL; dip and tap profiles store file paths into Gort.', ['cards'], 'card-profiles'),
  g('Track Data', ['swipe profile'], 'Raw magnetic-stripe text stored directly in MySQL for swipe profiles, extracted with a hardware card-reader utility.', ['cards', 'cards.swipe'], 'card-profiles'),
  g('Dip & Tap profiles', ['dip profile', 'tap profile'], 'Card profiles storing file paths to card definitions in Gort; a scheduled job clones them to the Windows boxes where Callus loads them.', ['cards', 'cards.diptap'], 'card-profiles'),
  g('Scheduled clone', ['scheduled job', 'GortCardSync'], 'Scheduled job that clones Gort\'s card-definition files onto the local Windows boxes for Callus. (The task name GortCardSync is the sim\'s.)', ['cards', 'cards.callus'], 'card-profiles'),
  g('Screen Compare Image', ['Screen Compare', 'screen comparison'], 'Entity for the Station Duo workaround: CFD bounding coordinates plus expected text, checked by webcam screenshot → crop → Tesseract → boolean. Brittle; being phased out.', ['duo.ocr', 'orca.screencompare'], 'orca-screen-compare'),
  // ── config.properties ─────────────────────────────────────────────────────
  g('config.properties', ['config properties'], 'uia-remote\'s local run configuration, edited manually for local runs; Jenkins injects the values during CI.', ['uia.config'], 'config-properties'),
  g('runType', [], 'config.properties key; set to tethered for multi-device testing setups.', ['uia.config'], 'config-properties'),
  g('merchantFacingDeviceIp', [], 'config.properties key: the MFD terminal\'s local network IP. Same as the CFD IP on a Station Duo.', ['uia.config'], 'config-properties'),
  g('customerFacingDeviceIp', [], 'config.properties key: the CFD terminal\'s local network IP. Same as the MFD IP on a Station Duo.', ['uia.config'], 'config-properties'),
  g('serial', [], 'config.properties key: hardware serial number of the primary terminal.', ['uia.config'], 'config-properties'),
  g('deviceType', [], 'config.properties key: the target form factor (Mini, Flex, Station), governing layout and scroll logic.', ['uia.config', 'uia.scroll'], 'config-properties'),
  g('theme', ['avocado'], 'config.properties key locked strictly to avocado; legacy theme toggles are deprecated.', ['uia.config'], 'config-properties'),
  g('kernelType', ['CPA', 'SPA'], 'config.properties key locked strictly to CPA (Core Payments Application), which replaces the legacy SPA (Secure Processor Application).', ['uia.config'], 'config-properties'),
  g('CPA', ['Core Payments Application'], 'Core Payments Application — the only allowed kernelType.', ['uia.config'], 'config-properties'),
  g('SPA', ['Secure Processor Application'], 'Secure Processor Application — the legacy kernelType replaced by CPA.', ['uia.config'], 'config-properties'),
  g('portNumber', ['5444'], 'config.properties key locked to 5444; the ADB default 5555 caused office collisions with coworkers\' desk devices.', ['uia.config', 'adb.port'], 'config-properties'),
  g('Port 5444', ['ADB port'], 'The TCP port lab LabSim devices use for ADB.', ['adb.port'], 'adb-port-5444'),
  g('Port 5555', ['ADB default port'], 'The standard ADB default port — never used for lab devices because it let scripts connect to and control coworkers\' desk devices.', ['adb.port'], 'adb-port-5444'),
  // ── uia-remote ────────────────────────────────────────────────────────────
  g('app/src/main', ['main'], 'uia-remote folder reserved for production / application registration code. QA engineers never modify it.', ['uia.pom', 'uia.layout'], 'uia-remote-structure'),
  g('app/src/test', ['test folder'], 'uia-remote folder with local unit tests and the multi-device execution runner scripts.', ['uia.pom', 'uia.layout', 'uia.multidevice'], 'uia-remote-structure'),
  g('app/src/androidTest', ['androidTest'], 'uia-remote folder of instrumented tests that run on Android hardware, split into databases, pageobjects and testactions.', ['uia.pom', 'uia.layout'], 'uia-remote-structure'),
  g('databases', ['databases package'], 'androidTest package for database connection and query logic.', ['uia.pom', 'uia.packages'], 'uia-remote-structure'),
  g('pageobjects', ['pageobjects package'], 'androidTest package holding the Page Object Model classes for device screens.', ['uia.pom', 'uia.packages'], 'uia-remote-structure'),
  g('testactions', ['testactions package'], 'androidTest package holding test classes and assertions that chain page-object methods.', ['uia.pom', 'uia.packages'], 'uia-remote-structure'),
  g('Page Object Model', ['POM', 'page object'], 'Pattern where every screen, pop-up or window has its own Java class extending BaseTest, with Zone 1 locators and Zone 2 helpers.', ['uia.pom'], 'uia-remote-pom'),
  g('BaseTest', [], 'Base class every screen class extends; provides global setup, teardown and instance variables.', ['uia.pom'], 'uia-remote-pom'),
  g('Zone 1 / Zone 2', ['Zone 1', 'Zone 2', 'Element Locators', 'Helper Methods'], 'The two parts of a screen class: Zone 1 element locators unique to the view; Zone 2 helper/action methods where device-specific behaviour is abstracted.', ['uia.pom'], 'uia-remote-pom'),
  g('waitForScreen()', ['waitForScreen'], 'Mandatory screen method that pauses execution until all UI elements finish rendering, so UI Automator never clicks unrendered buttons.', ['uia.pom', 'uia.sync'], 'uia-remote-pom'),
  g('isScreenPresent()', ['isScreenPresent'], 'Mandatory screen method returning a boolean: is that screen currently in focus?', ['uia.pom', 'uia.sync'], 'uia-remote-pom'),
  g('open(String appName)', ['open()'], 'HomeScreen helper that scrolls vertically on Flex devices and horizontally on Mini or Station devices to open an app.', ['uia.pom', 'uia.scroll'], 'uia-remote-pom'),
  g('HomeScreen', [], 'The launcher page object. Every test starts explicitly from HomeScreen and a teardown forces the hardware back to it.', ['uia.pom', 'uia.taxtest'], 'tax-test'),
  g('Multi-device runner', ['MultiDeviceRunner', 'device handle'], 'The runner in app/src/test that targets methods sequentially across device handles (MFD runs X, CFD runs Y, loop) because UI Automator talks to one device at a time.', ['uia.pom', 'uia.multidevice'], 'uia-remote-structure'),
  g('Tax test', ['TaxTest'], 'The reference\'s tethered example: MFD_O1 adds Tax Item 5 and Review Order (Orca → Callus loads a swipe card); CFD_O1 asserts subtotal, tax and total; MFD_O2 Pay and Charge; Step 4 finalises on the CFD.', ['uia.config', 'uia.taxtest'], 'tax-test'),
  g('MFD_O1 / CFD_O1 / MFD_O2', ['MFD_O1', 'CFD_O1', 'MFD_O2'], 'Tax test step labels: Merchant display step 1, Customer display step 1, Merchant display step 2.', ['uia.config', 'uia.taxtest'], 'tax-test'),
  // ── Pigeon, receipts, logs ────────────────────────────────────────────────
  g('select print', ['"select print"'], 'Pigeon step that often appears as the failure point in Jenkins logs — it was merely the last step before the runner timed out waiting for a printer payload, usually because stale coordinates made the arm miss Print.', ['pigeon', 'jenkins.logs'], 'pigeon-bottlenecks'),
  g('JSON linter', ['linter', 'no linter'], 'What Pigeon lacks: missing commas or brackets must be hunted by hand, so engineers copy-paste known-good JSON blocks.', ['pigeon', 'pigeon.nolint'], 'pigeon-bottlenecks'),
  g('Scan for receipt', ['receipt QR', 'QR code'], 'Receipt-screen QR feature that shifted buttons down a few millimetres (48 hours of broken coordinates until {{jared}}\'s PR) and added a conditional 5th option.', ['orca.screens', 'receipt.qr'], 'receipt-qr-regression'),
  g('4-option / 5-option maps', ['receipt maps', 'RECEIPT_OPTIONS_4', 'RECEIPT_OPTIONS_5'], 'Separate receipt-screen coordinate maps Orca keeps for every device profile because the QR option is conditional. (The screen names are the sim\'s.)', ['orca.screens', 'receipt.maps'], 'receipt-qr-regression'),
  // ── Bots, cards, teams ────────────────────────────────────────────────────
  g('ADB bot', ['ADB-only bot'], 'Purely programmatic robot: cannot physically touch the screen or enter PINs; restricted to merchant configs that bypass PIN security.', ['orca.screens', 'bots.types'], 'adb-vs-physical-bots'),
  g('Physical bot', ['interactive bot', 'touch robot'], 'Robot with mechanical touch probes; required for Canadian payment workflows (physical PIN entry) and ADB-blind displays.', ['orca.screens', 'bots.types'], 'adb-vs-physical-bots'),
  g('Secure Touch', ['Secure Touch PIN entry'], 'The PIN-entry mode the Gen 2 Software PIN Bypass will handle in software instead of with robots.', ['orca.screens', 'bots.pin'], 'adb-vs-physical-bots'),
  g('Gen 2 Software PIN Bypass', ['Gen 2', 'software PIN bypass'], 'Framework being built with the Core OS Team to bypass physical robotics for Secure Touch PIN entry, reserving robots for non-negotiables like card dipping.', ['infra.ai', 'bots.pin'], 'adb-vs-physical-bots'),
  g('Interac', [], 'Canadian card network; your team adds an Interac profile for regional (Canadian) flows alongside its single Visa profile.', ['cards', 'cards.philosophy'], 'card-testing-philosophy'),
  g('Card matrix', ['back-to-back card matrix'], 'PayCore\'s exhaustive back-to-back validations across Visa, Discover and AmEx.', ['cards', 'cards.philosophy'], 'card-testing-philosophy'),
  g('EMV', ['chip', 'chip dip'], 'Chip-card standard; Collis probes simulate EMV chip dips (carried in by the dip arm on touch robots).', ['cards', 'hw.collis'], 'collis-probes'),
  g('NFC', ['contactless', 'Near Field Communication'], 'Contactless technology; Collis probes simulate NFC taps.', ['cards', 'hw.collis'], 'collis-probes'),
  g('Magnetic stripe', ['mag stripe', 'swipe'], 'Card stripe read by swiping; Collis probes simulate swipes, and swipe profiles store its raw Track Data.', ['cards', 'hw.collis', 'cards.swipe'], 'collis-probes'),
  g('Semi Team', ['Semi'], 'Historically developed third-party POS SDKs and the remote pay display apps (USB Pay Display, Secure Network Pay Display).', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('Sedi Team', ['Sedi', 'Sedi (QA) Team'], 'The QA team that tested the Semi Team\'s apps using the Lester framework.', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('IPX', ['Integrated Payment Experience'], 'Integrated Payment Experience Team; uia-remote is integrated with IPX to test Register, Orders, Authorizations, Sale, Transactions and Setup.', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('PayCore Team', ['PayCore'], 'Adopted uia-remote for apps like LabSim Dining; runs exhaustive Visa/Discover/AmEx card matrices; its standalone rigs stay Unavailable.', ['teams.history', 'uia.history', 'cards.philosophy'], 'teams-and-history'),
  g('Core OS Team', ['Core OS'], 'Partner team for the Gen 2 Software PIN Bypass.', ['teams.history', 'bots.pin'], 'teams-and-history'),
  g('Contact Canada', [], 'Canadian automation scripts running on the Westers test beds; they use dynamic and non-dynamic capability lookups interchangeably.', ['orca.capabilities'], 'orca-capabilities'),
  g('LabSim Dining', ['Dining'], 'Native LabSim app PayCore tests with uia-remote.', ['teams.history', 'uia.history'], 'teams-and-history'),
  g('Register', ['Register app'], 'Native LabSim app; the Tax test opens it on the MFD to add Tax Item 5.', ['uia.config', 'uia.taxtest', 'uia.history'], 'tax-test'),
  // ── Acronyms & general ────────────────────────────────────────────────────
  g('OOBE', ['Out-of-Box Experience'], 'Out-of-Box Experience — the device setup flow Laz Automation drives zero-touch.', ['orca.capabilities', 'laz.oobe'], 'laz-and-ubi'),
  g('OCR', ['Optical Character Recognition'], 'Optical Character Recognition; Tesseract runs it on cropped webcam screenshots of ADB-blind displays.', ['duo.ocr', 'vision.tesseract'], 'orca-screen-compare'),
  g('LLM', ['Large Language Model', 'Vision LLM'], 'Large Language Model; Ollama runs vision LLMs locally for the receipt proof of concept.', ['infra.ai', 'vision.ollama'], 'ollama-and-claude'),
  g('PoC', ['proof of concept'], 'Proof of concept — the status of the Ollama vision checks: useful, not a production gate.', ['infra.ai', 'vision.ollama'], 'ollama-and-claude'),
  g('REST', ['REST API'], 'HTTP API style used between the test runners and Orca (xy_touch, card actions) and by Orca\'s health pings to the Pis.', ['orca.status', 'arch.flow'], 'orca-overview'),
  g('Non-200 response', ['HTTP 200', 'non-200'], 'Any health-ping response other than HTTP 200 (e.g. 500, 502) — it triggers Connection Failed just like a dropped ping.', ['orca.status', 'orca.healthcheck'], 'orca-health-check'),
  g('Pull request', ['PR', 'coordinate PR'], 'GitHub change request; coordinate fixes land through PRs (e.g. {{jared}}\'s PR that ended the receipt-QR breakage).', ['uia.pom', 'tools.github'], 'intellij-and-github'),
  g('Environment variables', ['env vars', 'DEVICE_TYPE'], 'Runtime variables Jenkins injects into pipelines; Device Type values must be ALL CAPS to match Orca\'s enum.', ['jenkins', 'jenkins.envvars'], 'jenkins-env-vars'),
  g('Famous-robot names', ['rig names', 'WALL-E', 'MEGATRON', 'OPTIMUS'], 'Every rig is named after a famous robot; Name is lower-case-kebab (wall-e), the tablet shows the caps Human Readable Name (WALL-E). The full 42-rig roster is the sim\'s.', ['lab.orientation', 'orca.names'], 'lab-tour'),
  g('DEV1 / STG', ['DEV1', 'STG'], 'Environment labels on the tethered test-bed screens (MEGATRON … DEV1, OPTIMUS … STG).', ['devices', 'hw.devices'], 'mfd-cfd-tethered'),
  g('Illustrative (sim only)', ['†', 'illustrative', 'sim only'], 'Badge on any detail LabSim invents because the reference is silent (IPs, job names, merchants, mm values). Never quote these as real-world facts.', ['lab.orientation'], 'illustrative-details'),
]);

/** Case-insensitive lookup by term or alias (exact match after trimming). */
const LOOKUP = new Map<string, GlossaryTerm>();
for (const t of GLOSSARY) {
  for (const k of [t.term, ...t.aliases]) {
    const key = k.trim().toLowerCase();
    if (!LOOKUP.has(key)) LOOKUP.set(key, t);
  }
}

export function glossaryLookup(termOrAlias: string): GlossaryTerm | undefined {
  return LOOKUP.get(termOrAlias.trim().toLowerCase());
}

/** Terms whose term/alias/definition contains `query` (case-insensitive), term matches first. */
export function glossarySearch(query: string): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (t: GlossaryTerm) => [t.term, ...t.aliases].some((k) => k.toLowerCase().includes(q));
  return [...GLOSSARY.filter(hit), ...GLOSSARY.filter((t) => !hit(t) && t.definition.toLowerCase().includes(q))];
}
