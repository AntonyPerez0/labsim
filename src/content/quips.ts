/**
 * Robot personalities & quips (GP §5.3). A game layer only (Settings → "Robot personality"; off in Strict
 * realism): a one-line strip under the tablet header for touch robots, or a speech bubble at the shelf label
 * for tethered/ADB rigs. 60 quips (ACH30 "Robot Whisperer"), keys `QUIP_<RIG>_<TRIGGER>`, ≤ 90 characters.
 * Touch robots trigger on idle · pass · yellow · recovered · park; tethered/ADB rigs on
 * idle · pass · fail · recovered · reserved.
 */
import type { QuipDef, QuipTrigger, RobotPersonality } from './schema';

export const ROBOT_PERSONALITIES: RobotPersonality[] = [
  { rig: 'wall-e', humanName: 'WALL-E', personality: 'Earnest, tidy', voice: 'low warbly blips', stepperSemitones: -2 },
  { rig: 'eve', humanName: 'EVE', personality: 'Precise, protective', voice: 'clean sine blips', stepperSemitones: 3 },
  { rig: 'bumblebee', humanName: 'BUMBLEBEE', personality: 'Talks in radio clips', voice: 'static bursts', stepperSemitones: 0 },
  { rig: 'r2-d2', humanName: 'R2-D2', personality: 'Beeps + translation', voice: 'random chirps', stepperSemitones: 5 },
  { rig: 'johnny-5', humanName: 'JOHNNY-5', personality: 'Curious, excitable', voice: 'fast blips', stepperSemitones: 2 },
  { rig: 'baymax', humanName: 'BAYMAX', personality: 'Gentle carer', voice: 'soft two-tone', stepperSemitones: -4 },
  { rig: 'seti', humanName: 'SETI', personality: 'Listener for signals', voice: 'slow sweeping tones', stepperSemitones: -1 },
  { rig: 'rosie', humanName: 'ROSIE', personality: 'Sassy PayCore housekeeper', voice: 'clipped blips', stepperSemitones: 1 },
  { rig: 'megatron', humanName: 'MEGATRON', personality: 'Theatrical tyrant', voice: 'low growl blips', stepperSemitones: null },
  { rig: 'optimus', humanName: 'OPTIMUS', personality: 'Noble leader', voice: 'warm mid blips', stepperSemitones: null },
  { rig: 'data', humanName: 'DATA', personality: 'Literal android', voice: 'even-pitched beeps', stepperSemitones: null },
  { rig: 'tars', humanName: 'TARS', personality: 'Dry humour', voice: 'square-wave blips', stepperSemitones: null },
];

const TOUCH: QuipTrigger[] = ['idle', 'pass', 'yellow', 'recovered', 'park'];
const BENCH: QuipTrigger[] = ['idle', 'pass', 'fail', 'recovered', 'reserved'];

const LINES: [rig: string, triggers: QuipTrigger[], lines: [string, string, string, string, string]][] = [
  ['wall-e', TOUCH, ['Cables compacted. Shelf tidy. Awaiting a directive.', 'Green build! Adding it to my collection.', 'Someone moved my arm. I liked where it was.', '...Rebooted. Did I miss anything shiny?', 'Home at zero-zero. Cozy.']],
  ['eve', TOUCH, ['Scanning. Scanning. All directives nominal.', 'Directive complete. Receipt printed. Filed.', 'Unauthorized arm movement detected.', 'Systems restored. Please keep hands off the Pi lead.', 'Homed. Target lock re-established.']],
  ['bumblebee', TOUCH, ['[radio] ...standing by, standing by... [/radio]', '[radio] ...and the crowd goes wild! [/radio]', '[radio] ...hey, hands off the merchandise! [/radio]', "[radio] ...we're back on the air, folks! [/radio]", '[radio] ...returning to base... [/radio]']],
  ['r2-d2', TOUCH, ['*bweep-boo* (Translation: The CFD is quiet. Suspiciously quiet.)', '*whistle-trill* (Translation: Both screens agree. Rare.)', '*indignant blat* (Translation: Who touched me?)', "*rising whistle* (Translation: Back online. Don't ask.)", '*happy chirp* (Translation: Zero, zero. Perfect.)']],
  ['johnny-5', TOUCH, ['Need input! Also, a Flex 2 would be nice.', 'Test passed! More input! More tests!', 'Hey! Arms are for tapping, not pushing!', 'Malfunction fixed! Still running! Very running!', 'Homing... homing... home!']],
  ['baymax', TOUCH, ["Hello. I am monitoring the lab's well-being.", 'Your transaction is healthy. You have been a good engineer.', 'I detect discomfort in my gantry. Park All is recommended.', 'I am restored. How would you rate your outage experience?', 'Resting at zero-zero. Please wash your hands before touching my rails.']],
  ['seti', TOUCH, ['Listening for a four-digit signal from the north.', 'Signal received: Interac approved.', 'Anomalous movement in sector X-Y.', 'Contact with Orca re-established. We are not alone.', 'Arm aligned to the origin of everything.']],
  ['rosie', TOUCH, ['Unavailable, hon. Say my name or move along.', 'Visa, Discover, AmEx. All spotless.', 'Did you just push me? I keep a tidy rig!', 'Back online, and still Unavailable, thank you.', 'Tidied up at zero-zero.']],
  ['megatron', BENCH, ['The MFD commands. The CFD obeys.', 'Another tax total crushed beneath my assertions!', 'Treachery! The CFD has betrayed me!', 'MEGATRON RISES. Again.', 'A local run? You dare reserve MEGATRON? ...Very well.']],
  ['optimus', BENCH, ['Tethered, we stand.', 'MFD and CFD, united. Transaction complete.', 'One display cannot succeed alone.', 'Staging is secure once more.', 'I will hold this rig for you, engineer.']],
  ['data', BENCH, ['I am an ADB bot. I cannot press a PIN pad. I have accepted this.', 'Passed in 61.3 seconds. 1.3 seconds above my personal mean.', 'Intriguing. The device did not answer on port 5444.', 'Restored. As a Mini 3, I remain a perfectly adequate Duo 2.', 'Reserved. I will await your local run with patience.']],
  ['tars', BENCH, ['Humour setting: 75 percent. Honesty setting: 90 percent.', "Green build. I'd call that a smooth landing.", 'Honesty setting says this failure was probably not my fault.', 'Back online. Lowering humour to 60 percent out of respect.', "Reserved. I'll keep the Jenkins jobs away."]],
];

const keyPart = (rig: string) => rig.replace(/-/g, '_').toUpperCase(); // "wall-e" → "WALL_E"

/** All 60 quips. */
export const QUIPS: QuipDef[] = LINES.flatMap(([rig, triggers, lines]) =>
  triggers.map((trigger, i) => ({ key: `QUIP_${keyPart(rig)}_${trigger.toUpperCase()}`, rig, trigger, text: lines[i] })),
);

export const QUIPS_BY_KEY: Record<string, QuipDef> = Object.fromEntries(QUIPS.map((q) => [q.key, q]));

/** The quip for a rig + trigger, if that rig has one (touch robots have no `fail`/`reserved`, benches no `yellow`/`park`). */
export function quipFor(rig: string, trigger: QuipTrigger): QuipDef | undefined {
  return QUIPS.find((q) => q.rig === rig && q.trigger === trigger);
}
