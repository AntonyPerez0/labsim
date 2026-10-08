/**
 * Field Manual articles — power. Authored in the markdown subset documented on `ManualArticle`
 * (../schema.ts); `†` marks illustrative (sim-only) details; people appear as `{{key}}` tokens.
 */
import type { ManualArticle } from '../schema';
import { resolvePeople } from '../people';

export const POWER_ARTICLES: ManualArticle[] = resolvePeople<ManualArticle[]>([
  {
    id: "power-distribution",
    title: "Power Distribution: Wall to Pi",
    category: "Power",
    summary: "The lab's power chain — 120V AC into a Mean Well transformer, a central 24V DC rail, step-down regulators to 12V DC for the NUCs and 5V DC 10A for the Pis, protected by inline fuses.",
    factIds: ["F074", "F085", "F086", "F087", "F227", "F228", "F229"],
    tags: ["power.rails", "power.fuses"],
    related: ["power-18v-exception", "fuses-and-multimeter", "ts-power", "robot-pi"],
    keywords: ["Mean Well", "120V AC", "24V DC rail", "12V", "5V 10A", "step-down regulator", "inline fuse", "power wall", "MAIN", "MOTOR"],
    practice: ["INC03", "INC17", "DR04", "DR13"],
    body: `## The chain

\`\`\`text
120V AC wall power
  └─▶ Mean Well transformer
        └─▶ central 24V DC rail
              ├─▶ step-down regulator ─▶ 12V DC line ─▶ Windows Intel NUCs
              └─▶ step-down regulator ─▶ 5V DC, 10A line ─▶ Raspberry Pis
                    (both lines protected by inline fuses)
\`\`\`

- **Mean Well** transformers are the industrial power supplies that convert 120V AC wall power to a central **24V DC rail** {F074}.
- Step-down regulators split the 24V rail into a **12V DC** line for the Intel NUCs {F085} and a **5V DC, 10-Amp** line for the Raspberry Pis {F086}.
- **Inline fuses** protect the DC lines {F087} {F227}.

## The exception you must never forget

LabSim devices draw an irregular **18V**. LabSim terminals and the expensive Collis probes **bypass the custom DC rails entirely** and plug into **commercial AC power strips** to prevent frying components {F228} {F229}. See [[power-18v-exception]].

| Load | Power source |
|---|---|
| Raspberry Pi | 5V DC, 10A line |
| Intel NUC | 12V DC line |
| Mean Well transformer | 120V AC wall power |
| LabSim terminal | Commercial AC power strip (its own power supply) |
| Collis probe | Commercial AC power strip |

## On the power wall†

- The Mean Well's label reads \`INPUT 120VAC · OUTPUT 24VDC\`†.
- Regulator labels read \`12V DC · NUC\` and \`5V DC · 10A\`†.
- Each touch-robot bay has a **MAIN** toggle (controller power) and a **MOTOR** toggle (motor power) on its POWER panel; with MOTOR off, the arm will not move.

> **Illustrative (sim only):** Label wording, the number of 5V regulators per rack and which fuse feeds which bay are the sim's layout†. The voltages, the Mean Well, the 24V rail, the 12V/5V 10A split and the inline fuses are from the reference.

## Diagnosing by symptom

| Symptom | First suspect |
|---|---|
| A whole rack of Pis dark (no red PWR LED) | That rack's 5V inline fuse or regulator ([[fuses-and-multimeter]]) |
| One Pi dark | Its MAIN switch, its lead or its own fuse |
| Arm won't move, Pi fine | MOTOR toggle off, or steppers disabled |
| LabSim device dead after being plugged into a rail | You fried it — terminals go on the AC strip |
`,
  },
  {
    id: "power-18v-exception",
    title: "The 18V Exception: terminals & Collis on AC Strips",
    category: "Power",
    summary: "LabSim devices draw an irregular 18V, so they — and the expensive Collis probes — never touch the lab's DC rails. They plug into commercial AC power strips. Every time.",
    factIds: ["F228", "F229", "F069", "F074"],
    tags: ["power.rails", "power.18v"],
    related: ["power-distribution", "collis-probes", "lab-tour"],
    keywords: ["18V", "AC power strip", "fried", "Collis probe", "LabSim terminal", "DC rail", "24V tap", "magic smoke"],
    practice: ["INC17", "INC18", "DR04"],
    body: `## The rule

> **Warning:** LabSim terminals and Collis probes go on the **commercial AC power strips** — never the 24V rail, the 12V line or the 5V line.

## Why

- LabSim devices draw an **irregular 18V** {F228}. None of the lab's custom DC lines (24V, 12V, 5V) match it.
- Both LabSim terminals and the **expensive Collis probes** bypass the custom DC rails entirely and plug into commercial AC power strips **to prevent frying components** {F229}.
- Collis probes are high-cost proprietary card emulators {F069} — the most expensive thing on the shelf to get wrong.

## What it looks like in practice

| You are holding… | Plug it into… |
|---|---|
| A new Flex 4 power brick | The commercial AC strip |
| A spare Collis probe's power supply | The commercial AC strip |
| A Raspberry Pi lead | The 5V 10A line (rack distribution) |
| A NUC's DC lead | The 12V line |

"The AC strip is full, can I use the spare 24V tap?" — No. Free an outlet on the strip, or ask {{jared}} for another strip. The Mean Well's 24V rail {F074} feeds the regulators and motors, not terminals.

> **In the sim:** In the Academy a wrong plug only sparks and the lead pops out. In the Arcade the device fries (−500 points and a strike) and the branch fuse can blow.
`,
  },
  {
    id: "fuses-and-multimeter",
    title: "Inline Fuses & Using the Multimeter",
    category: "Power",
    summary: "How to find and replace a blown inline fuse safely — follow the power, measure, de-energise, replace with the right rating, verify.",
    factIds: ["F087", "F086", "F227"],
    tags: ["power.rails", "power.fuses"],
    related: ["power-distribution", "ts-power", "robot-pi"],
    keywords: ["fuse", "blown", "multimeter", "OL", "continuity", "10 A", "rating", "ATO", "blade fuse", "replace"],
    practice: ["INC03", "DR13"],
    body: `## Where the fuses are

Inline fuses protect the 12V and 5V DC lines that come off the step-down regulators {F087} {F227}. When one blows, everything downstream of it loses power — typically a whole rack's worth of Pis on the 5V 10A line {F086}.

## The procedure

1. **Follow the power.** Dark Pis with no red PWR LED at all have no power — this is not a crashed Pi (a crashed Pi still shows its red LED).
2. **Measure.** Put the multimeter across the suspect fuse (or measure voltage before and after it). A blown fuse reads **OL** (open) in continuity/resistance mode, or full voltage on one side and 0 V on the other.
3. **De-energise.** Turn the branch off (regulator input or the bay's MAIN) before pulling a fuse. Measure resistance only with power off.
4. **Replace with the rating on the holder label** — the sim's 5V and 12V lines use 10 A blade fuses†.
5. **Verify.** Pi LEDs light, the Pis boot, and the next Orca health check flips the robots back from Connection Failed.

> **Illustrative (sim only):** Fuse ratings, colours and holder labels are the sim's†. Safe-practice steps (power off before servicing, measure resistance de-energised) are general electrical practice.

## Common mistakes

- Swapping the Pis instead of checking the fuse — four Pis do not die at once.
- Replacing the 12V fuse when the 5V Pis are dark.
- Using a higher-rated fuse "so it doesn't blow again" — the fuse protects the line.
`,
  },
]);
