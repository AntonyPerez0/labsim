/**
 * Field Manual articles — basics. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const BASICS_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "lab-tour",
    title: "Lab Tour & Safety Rules",
    category: "Lab Basics",
    summary: "Where everything is in the LabSim automation lab, what each zone is for, and the five rules that keep you (and a lot of expensive hardware) out of trouble.",
    factIds: ["F089", "F115", "F230", "F233", "F236", "F244", "F245", "F072", "F073", "F228", "F229", "F231", "F232", "F111"],
    tags: ["lab.orientation", "people.roles", "hw.tablet", "hw.lockout"],
    related: ["who-is-who", "status-tablet", "power-18v-exception", "maglock-and-park-all", "how-the-sim-differs"],
    keywords: ["safety card", "rules", "map", "zones", "rack", "workstation", "first day"],
    practice: ["INC11", "INC12", "INC17", "DR16"],
    image: "walle-status-tablet-front.jpg",
    body: `## What this lab is for

Everything in the room exists to press buttons on LabSim point-of-sale devices so humans don't have to. Touch robots tap screens and dip cards, Raspberry Pi controllers drive them, and Orca (the Orchestrator) decides which robot runs which Jenkins test. Orca's Robot entity tracks a pool of **40+ rigs** {F115}, each named after a famous robot† (WALL-E, EVE, MEGATRON, OPTIMUS…). Only a dozen of them live in the training room†; the rest are in other racks.

## The zones

| Zone | What lives there | You come here to… |
|---|---|---|
| Touch Rack A / Rack B | Touch robots in black perforated-steel racks, each with a front status tablet | Watch tests, Park All, fix taps |
| Tethered rack | MEGATRON (DEV1) and OPTIMUS (STG): MFD/CFD screen pairs, SmartStripe Probes, connectivity hubs | Run and watch tethered tests |
| ADB bot shelf | DATA and TARS†: devices driven purely over ADB | ADB-only tests |
| Callus shelf | Windows/Minix boxes running Callus, an Intel NUC (no longer used for hardware control), Collis probes on ribbon cables | Card emulation problems |
| Power wall | Mean Well transformer, 24V DC rail, 12V and 5V 10A regulators, inline fuses, AC power strips | Power faults |
| Server shelf | The 4-GPU server blade (two GPUs exposed, two underneath) and the retired tower | Infrastructure |
| 3D print corner | Prusa and Bambu Lab printers | Printing fixtures |
| Your workstation | Orca, Jenkins, IntelliJ IDEA, terminal, GIMP, GitHub, camera streams, Ollama | Most of your day |

## Reading a robot at a glance

Every touch robot has a **front-mounted status tablet** {F089}. Its header shows the robot's Human Readable Name (e.g. \`WALL-E\`), the LabSim logo, \`Status: OK\` and \`Brainbox v6\` {F233}. Next to it, the black 3D-printed **POWER** panel has two green LEDs and two toggles labelled \`MAIN\` and \`MOTOR\` {F236}. The rack rails are marked with numbered rack units (29–40 in the reference photo) {F244}, and a panel lettered **SETI** with USB ports for the Minix box / Raspberry Pi sits to the right of WALL-E's tablet {F245}.

> **Tip:** Identify a rig by its tablet header (which comes from Orca), never by a side panel — panels get reused between rigs†.

All the matte-black plastic you see — cradles, panels, docks — was printed on the lab's **Prusa and Bambu Lab** printers {F072}, drafted in CAD from simple geometric shapes {F073}.

## The five safety rules

1. **Never fight a running robot.** While a test is active the global LabSim control dashboard locks external users out {F230}. Wait for the job, or reserve the rig properly before you work on it ([[orca-statuses]]).
2. **If you move an arm by hand, Park All before you walk away.** Pushing an arm breaks its magnetic lock and turns the banner yellow; Park All homes it to (0,0) and turns it green {F231} {F232}. See [[maglock-and-park-all]].
3. **LabSim terminals and Collis probes go on the commercial AC power strips — never the DC rails.** LabSim devices draw an irregular 18V {F228}, so they and the Collis probes bypass the custom DC rails {F229}. See [[power-18v-exception]].
4. **Broken rig? Tell {{jared}}.** Connection Failed hardware problems are escalated to {{jared}} {F111}. See [[ts-connection-failed]].
5. **Lab devices speak ADB on port 5444.** Port 5555 is the ADB default and reaches coworkers' desk devices. See [[adb-port-5444]].

> **Illustrative (sim only):** The Lab Safety Card's exact wording is invented for the game†; the rules on it restate reference facts.

## Your first day checklist

- Walk the zones above and look at a status tablet up close.
- Find the AC power strips and the DC rails on the power wall — and learn which is which.
- Open Orca on your workstation and filter the Robots list to \`Available\`.
- Read [[who-is-who]] so you know who to ask for what.
`,
  },
]);
