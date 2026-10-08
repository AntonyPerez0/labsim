/**
 * DR17 Lab Lore (GP §2.4.3): rapid recall of numbers, teams, history, stack and hardware. Every required
 * item from the spec, each answer a reference fact (cited).
 */
import type { DrillDef } from '../../types';
import { lazyDrill } from '../common/lazy';
import { mcqItem, type McqData } from '../common/mcq';
import { N } from '../common/people';

let n = 0;
const id = () => `DR17-${String(++n).padStart(2, '0')}`;

export const LAB_LORE_ITEMS = [
  mcqItem(id(), 'How many NVIDIA GPUs sit in the shelf-mounted server blade?', '4 (2 exposed, 2 underneath)', ['2 (both exposed)', '8 (4 per side)', '1 (plus a legacy tower)'], 'Four NVIDIA GPUs in the blade — two exposed, two underneath — which replaced a legacy tower unit.', { tags: ['arch.infra'], facts: ['F075', 'F076', 'F077'], ref: 'Ref §1', category: 'Numbers' }),
  mcqItem(id(), 'Roughly what does each Robot Pi cost?', '~$50', ['~$500', '~$5', '~$1,500'], 'The Raspberry Pis are cheap ~$50 units — one per shelf as the Robot Controller.', { tags: ['hw.pi'], facts: ['F063'], ref: 'Ref §1', category: 'Numbers' }),
  mcqItem(id(), 'Manual solder points in one touch robot?', '~300', ['~30', '~3,000', '~130'], 'About 300 manual solder points per touch robot.', { tags: ['hw.rigbom'], facts: ['F092'], ref: 'Ref §1', category: 'Numbers' }),
  mcqItem(id(), 'How much wiring goes into one touch robot?', '130 ft', ['10 ft', '300 ft', '13 ft'], 'About 130 ft of wiring per touch robot.', { tags: ['hw.rigbom'], facts: ['F091'], ref: 'Ref §1', category: 'Numbers' }),
  mcqItem(id(), 'What are the gantry rails cut from?', '10 ft cut aluminium rails', ['3D-printed PLA rails', '130 ft steel cable', '25-pin ribbon rails'], 'A touch robot uses 10 ft cut aluminium rails.', { tags: ['hw.rigbom'], facts: ['F090'], ref: 'Ref §1', category: 'Hardware' }),
  mcqItem(id(), 'Nuts and bolts per touch robot — count and diameters?', '200+ in 2.5 mm and 5 mm', ['50 in 3 mm', '200+ in 4 mm and 6 mm', '1,000+ in M8'], 'Each touch robot uses 200+ nuts and bolts in 2.5 mm and 5 mm diameters.', { tags: ['hw.rigbom'], facts: ['F093'], ref: 'Ref §1', category: 'Numbers' }),
  mcqItem(id(), 'What drives the rig motors?', 'A custom 25-pin PCB printed in Hong Kong', ['An off-the-shelf Arduino shield', 'The Intel NUC over USB', 'A 40-pin Raspberry Pi HAT'], 'Custom 25-pin motor-controller PCBs, printed in Hong Kong.', { tags: ['hw.rigbom'], facts: ['F083', 'F084'], ref: 'Ref §1', category: 'Hardware' }),
  mcqItem(id(), 'Which 3D printers make the black shelf fixtures?', 'Prusa and Bambu Lab', ['Ultimaker and Formlabs', 'Creality only', 'Markforged and Prusa'], 'Prusa and Bambu Lab printers print all the black modular shelf fixtures, drafted in CAD from simple shapes.', { tags: ['hw.print3d'], facts: ['F072', 'F073'], ref: 'Ref §1', category: 'Hardware' }),
  mcqItem(id(), 'What scaffolded Orca — its UI, REST endpoints and MySQL schemas?', 'JHipster', ['Spring Initializr only', 'Rails scaffolding', 'Django admin'], 'JHipster scaffolded Orchestrator through an interactive questionnaire, generating the frontend, Spring Boot REST endpoints and MySQL schemas.', { tags: ['arch.stack'], facts: ['F003', 'F004'], ref: 'Ref §1', category: 'Stack' }),
  mcqItem(id(), "Orca's planned future home?", 'Docker + GCP', ['Kubernetes on AWS', 'Stay on the NUCs', 'Serverless on Azure'], 'Docker and Google Cloud Platform are the planned migration targets, moving Orca off its on-prem lab VM.', { tags: ['arch.infra'], facts: ['F022', 'F023'], ref: 'Ref §1', category: 'Stack' }),
  mcqItem(id(), "Sedi QA's legacy test framework?", 'Lester', ['Pigeon', 'uia-remote', 'Laz'], 'The Sedi (QA) Team tested the Semi Team\'s apps using the legacy Lester framework.', { tags: ['uia.history'], facts: ['F158'], ref: 'Ref §4.1', category: 'History' }),
  mcqItem(id(), 'What did the Semi Team build?', 'POS SDKs, USB Pay Display and Secure Network Pay Display', ['Orca and Jenkins', 'The Collis probes', 'Laz Automation'], 'The Semi Team developed third-party POS SDKs and the remote pay display apps (USB Pay Display, Secure Network Pay Display).', { tags: ['uia.history', 'semi.paydisplay'], facts: ['F052', 'F157'], ref: 'Ref §4.1', category: 'Teams' }),
  mcqItem(id(), 'Who created uia-remote?', `The presenter (${N.morgan} in-game)`, [N.jared, N.tate, 'The Sedi QA team'], `The presenter (${N.morgan}) created uia-remote because no prior framework could automate native tethered setups.`, { tags: ['uia.history', 'people.roles'], facts: ['F159'], ref: 'Ref §4.1', category: 'History' }),
  mcqItem(id(), 'IPX stands for…', 'Integrated Payment Experience', ['Internal Pipeline eXecutor', 'Interactive POS eXtension', 'Interac Payment eXchange'], 'uia-remote is now integrated with the IPX (Integrated Payment Experience) Team.', { tags: ['uia.history'], facts: ['F160'], ref: 'Ref §4.1', category: 'Teams' }),
  mcqItem(id(), 'PayCore adopted uia-remote for which app?', 'LabSim Dining', ['LabSim Go', 'Register', 'Laz OOBE'], 'The PayCore Team adopted uia-remote for apps like LabSim Dining.', { tags: ['uia.history'], facts: ['F162'], ref: 'Ref §4.1', category: 'Teams' }),
  mcqItem(id(), 'Where does the name "Pigeon" come from?', 'A pun on "pidgin" language — it evolved from Lester', ['A pigeon-hole sort of tests', 'The first rig was named Pigeon', 'Pipeline Generator'], 'Pigeon is a play on words on "pidgin language" and evolved from the Lester framework.', { tags: ['pigeon.lstr'], facts: ['F042', 'F043'], ref: 'Ref §1', category: 'History' }),
  mcqItem(id(), 'Why does uia-remote use UI Automator 2.3?', 'Native dual-screen element location tracking', ['It is the only version with Java support', 'It adds OCR', 'It removes the need for ADB'], 'UI Automator 2.3 adds native support for dual-screen element location tracking — why Screen Compare/OCR is being phased out.', { tags: ['uia.v23'], facts: ['F006', 'F007'], ref: 'Ref §1', category: 'Stack' }),
  mcqItem(id(), 'The Mini 3 is used as the hot-swap equivalent for…', 'The printerless Station Duo 2', ['The Flex Pocket', 'The Station 2018', 'The LabSim Compact'], 'The Mini 3 is the hot-swap equivalent for the printerless Station Duo 2.', { tags: ['hw.devices'], facts: ['F057'], ref: 'Ref §1', category: 'Devices' }),
  mcqItem(id(), 'The LabSim Compact is the target terminal for…', 'The Canadian market (Westers test beds)', ['PayCore standalone rigs', 'Mobile Go SDK testing', 'The US Dining market'], 'The Compact is the Canadian-market terminal used on the Westers test beds.', { tags: ['hw.devices'], facts: ['F061'], ref: 'Ref §1', category: 'Devices' }),
  mcqItem(id(), 'Gen 2 software PIN bypass partner team?', 'Core OS Team', ['PayCore Team', 'Semi Team', 'IPX Team'], 'The team is partnering with the Core OS Team on a software framework that bypasses physical robotics for Secure Touch PIN entry.', { tags: ['bots.pin'], facts: ['F222'], ref: 'Ref §6.1', category: 'Teams' }),
  mcqItem(id(), 'What is Ubi?', 'The routing platform for dynamic merchant switching', ['A card emulator', 'The Pi operating system', 'A Jenkins plugin'], 'Ubi Platform is the internal routing platform used when test jobs dynamically switch merchant configurations.', { tags: ['ubi.routing'], facts: ['F051'], ref: 'Ref §1', category: 'Stack' }),
  mcqItem(id(), 'What was Claude evaluated for?', 'Repository optimisation and automated test generation', ['Receipt OCR on webcam streams', 'Driving the stepper motors', 'Replacing Jenkins'], 'Claude was evaluated during corporate AI initiatives for repository optimisation and automated test generation.', { tags: ['tools.claude'], facts: ['F033'], ref: 'Ref §1', category: 'AI' }),
  mcqItem(id(), 'What is Ollama doing in the lab?', 'Local LLM runner on the GPU blade (vision PoC on webcam streams)', ['Cloud LLM for test generation', 'OCR engine on the Pis', 'Jenkins log summariser on the NUCs'], 'Ollama is a local LLM runner on the 4-GPU blade, running proof-of-concept Vision-LLM inspections of receipt layouts and tip math.', { tags: ['vision.ollama'], facts: ['F031', 'F032'], ref: 'Ref §1', category: 'AI' }),
  mcqItem(id(), 'What is Gort?', 'The core monorepo, incl. Dip/Tap card definitions — not a rig', ['One of the 42 rigs', 'The Pi health service', 'The Jenkins executor'], 'Gort is the core monorepo housing the testing ecosystem and the virtual card definition files for Dip/Tap profiles (despite the robot-style name, it is a repo, not a rig).', { tags: ['arch.repos', 'cards.diptap'], facts: ['F034', 'F035'], ref: 'Ref §1', category: 'Stack' }),
  mcqItem(id(), 'Which OCR engine reads cropped webcam screenshots?', 'Tesseract', ['Ollama', 'GIMP', 'UI Automator'], 'Tesseract OCR runs on cropped webcam screenshots to validate text on ADB-blind displays.', { tags: ['vision.tesseract'], facts: ['F029'], ref: 'Ref §1', category: 'AI' }),
  mcqItem(id(), 'The Pis run Linux. Why?', 'To isolate hardware control loops from the corporate Windows machines', ['Because Wine needs Linux', 'Because Orca only talks to Linux', 'To run Jenkins agents'], 'Linux on the Pis isolates hardware control loops from corporate Windows machines.', { tags: ['hw.pi'], facts: ['F019', 'F020'], ref: 'Ref §1', category: 'Hardware' }),
  mcqItem(id(), 'Why did hardware control move off the Intel NUCs?', 'corporate security-monitoring packages exhausted their disk space', ['The NUCs could not run Wine', 'NUCs are 18 V devices', 'They were too fast for the steppers'], 'Aggressive corporate security-monitoring packages exhausted NUC disk space, so control migrated onto Raspberry Pis.', { tags: ['hw.nuc'], facts: ['F067', 'F068'], ref: 'Ref §1', category: 'History' }),
  mcqItem(id(), 'How many core database schemas (JHipster entities) does Orca have?', '7', ['5', '12', '3'], 'Orca has 7 core database schemas, generated as JHipster entities.', { tags: ['orca.entities'], facts: ['F114'], ref: 'Ref §3', category: 'Numbers' }),
  mcqItem(id(), 'Which Pigeon runner is rarely touched?', 'iOS (though iOS Go testing is active)', ['REST', 'Android', 'Windows'], 'LSTR has REST, Android, Windows and iOS runners; the iOS runner is rarely touched, although iOS Go testing is active.', { tags: ['pigeon.lstr'], facts: ['F202', 'F203'], ref: 'Ref §5', category: 'Stack' }),
];

export const DR17: DrillDef<McqData> = {
  id: 'DR17',
  name: 'Lab Lore',
  format: 'Rapid recall of numbers, teams, history, stack, hardware',
  tags: ['arch.infra', 'uia.history', 'hw.rigbom', 'hw.devices', 'people.roles'],
  unlockedBy: ['M01'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 800, silver: 1500, gold: 2200 },
  scoring: 'standard',
  items: LAB_LORE_ITEMS,
  component: lazyDrill(() => import('./View'), '#34d6c0'),
};
