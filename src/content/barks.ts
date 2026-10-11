/**
 * Mentor & coworker barks (GP §5.4): subtitled one-liners (top-centre, 4 s, queue max 2; priority
 * safety > ticket > flavour) with the speaker's voice blips. Ids `BARK_<SPEAKER>_<NN>`; `fromCurriculum`
 * lines are verbatim from the curriculum's lesson scripts. Triggers name GP ids (GWnn wrong actions,
 * PBnn process bonuses, INCnn incidents) and are evaluated by missions.
 */
import type { BarkDef } from './schema';
import { resolvePeople } from './people';

export const BARKS: BarkDef[] = resolvePeople<BarkDef[]>([
  { id: 'BARK_JADEN_01', speaker: 'jaden', trigger: 'Player near an AC strip carrying a device PSU', text: 'LabSim gear goes on the strip. Never the rails.' },
  { id: 'BARK_JADEN_02', speaker: 'jaden', trigger: 'GW01 / GW02', text: "That's how we fry a terminal. Commercial AC strip. Always.", fromCurriculum: true },
  { id: 'BARK_JADEN_03', speaker: 'jaden', trigger: 'Fuse replaced with PB07', text: "Power off first. That's how you keep your eyebrows." },
  { id: 'BARK_JADEN_04', speaker: 'jaden', trigger: 'Correct escalation', text: 'On it. Probably the Pi, or a Minix box running Kallus. Same symptom.', fromCurriculum: true },
  { id: 'BARK_JADEN_04B', speaker: 'jaden', trigger: 'Correct escalation (per-cause variant)', text: 'On my way. Watch what I check first.' },
  { id: 'BARK_JADEN_05', speaker: 'jaden', trigger: 'GW12', text: "That's config, not hardware. Read the Notes and the Edit view." },
  { id: 'BARK_JADEN_06', speaker: 'jaden', trigger: 'INC20 spawn', text: 'Firmware drop today. Last time the QR button cost us 48 hours of coordinates.' },
  { id: 'BARK_JADEN_07', speaker: 'jaden', trigger: 'GW18', text: 'Offsets were a legacy fudge. I calibrated the lab to a true zero-zero for a reason.' },
  { id: 'BARK_JADEN_08', speaker: 'jaden', trigger: 'First shift of the day', text: "Morning. Forty-two rigs, one of you. Let's keep them green." },
  { id: 'BARK_NATE_01', speaker: 'nate', trigger: 'Merchant Config table opened', text: 'Table display limits: you always have to click Edit to see every field.', fromCurriculum: true },
  { id: 'BARK_NATE_02', speaker: 'nate', trigger: 'GW24', text: 'Never paper over a failed ping. Hardware goes to {{jaden}}.', fromCurriculum: true },
  { id: 'BARK_NATE_03', speaker: 'nate', trigger: 'GW05', text: "ROSIE is PayCrest's. Unavailable means only jobs that name it get it." },
  { id: 'BARK_NATE_04', speaker: 'nate', trigger: 'GW20', text: "That reservation wasn't yours. Ask first." },
  { id: 'BARK_NATE_05', speaker: 'nate', trigger: 'GW22', text: 'Name is the system identifier. Pipelines use it. Leave it.', fromCurriculum: true },
  { id: 'BARK_DEVIN_01', speaker: 'devin', trigger: 'INC39 spawn', text: 'Enums are ALL CAPS. FLUX_3, not flux_3.' },
  { id: 'BARK_DEVIN_02', speaker: 'devin', trigger: 'INC49 resolved', text: 'Dynamic JSON in the test, hardcoded in the pipeline. Canada uses both — keep them agreeing.' },
  { id: 'BARK_DEVIN_03', speaker: 'devin', trigger: 'INC51 resolved', text: 'Go SDK needs all three: App ID, App Secret, API Key.' },
  { id: 'BARK_MORGAN_01', speaker: 'morgan', trigger: 'First local run in Arcade', text: "Reserve the rig before you hit Run. Jenkins doesn't know you're there otherwise." },
  { id: 'BARK_MORGAN_02', speaker: 'morgan', trigger: 'GW14', text: 'We never touch app/src/main. Tests live in androidTest.' },
  { id: 'BARK_MORGAN_03', speaker: 'morgan', trigger: 'INC36/INC37 resolved', text: 'Every OCR fix is one more reason to move that check to UI Automator 2.3.' },
  { id: 'BARK_MORGAN_04', speaker: 'morgan', trigger: 'Fast Diagnosis', text: 'Evidence first, then the fix. Nice read.' },
  { id: 'BARK_MORGAN_05', speaker: 'morgan', trigger: 'Combo 4', text: 'Four clean calls in a row.' },
  { id: 'BARK_MORGAN_05B', speaker: 'morgan', trigger: 'Combo 8', text: "Eight. You're running this lab." },
  { id: 'BARK_RILEY_01', speaker: 'riley', trigger: 'GW07 / GW19', text: 'Hey! That was my run!' },
  { id: 'BARK_RILEY_02', speaker: 'riley', trigger: 'INC27 resolved', text: 'Ha. Welcome to the club.', fromCurriculum: true },
  { id: 'BARK_SAM_01', speaker: 'sam', trigger: 'INC41 resolved', text: 'Matrix is green and ROSIE is back to Unavailable. Perfect.' },
  { id: 'BARK_ALEX_01', speaker: 'alex', trigger: 'INC34 Request changes', text: 'Ah — main is off limits. Got it, fixing.' },
]);

export const BARKS_BY_ID: Record<string, BarkDef> = Object.fromEntries(BARKS.map((b) => [b.id, b]));

export function barksFor(speaker: string): BarkDef[] {
  return BARKS.filter((b) => b.speaker === speaker);
}
