/**
 * Achievements ACH01–ACH46 (GP §4.5). `condition` is the exact unlock rule (evaluated by missions);
 * `description` is the player-facing line. Secret achievements (`hidden`) show "???" until unlocked.
 * Ids referenced in conditions: INCnn incidents (GP §3), DRnn drills (GP §2.4), GWnn global wrong
 * actions and PBnn process bonuses (GP §3.3).
 */
import type { AchievementDef } from './schema';
import { resolvePeople } from './people';

type Row = [id: string, title: string, icon: string, xp: number, category: NonNullable<AchievementDef['category']>, condition: string, description: string, hidden?: boolean];

const ROWS: Row[] = [
  ['ACH01', 'Badge In', '🪪', 100, 'Academy', 'Complete M01', 'Finish your first day: Welcome to the Lab.'],
  ['ACH02', 'Graduate', '🎓', 500, 'Academy', 'Complete M01–M18', 'Complete every Academy module.'],
  ['ACH03', "Straight A's", '⭐', 500, 'Academy', '★★★ on all 18 modules', 'Three stars on all 18 modules.'],
  ['ACH04', 'Green Means Go', '🟢', 100, 'Hardware', 'First Park All that turns a yellow banner green', 'Recover a robot with Park All for the first time.'],
  ['ACH05', 'Five by Five', '🖐', 150, 'Drills', 'DR01 round with ≥ 15 items at 100 % accuracy', 'A perfect status-triage round of 15 or more items.'],
  ['ACH06', 'Fuse Whisperer', '🔌', 200, 'Hardware', 'INC03 hands-on with PB07, a 10 A fuse, no GW03/GW04, first attempt', 'Replace a blown fuse the right way, first time.'],
  ['ACH07', 'Not On My Rail', '🛡', 300, 'Arcade', '10 completed shifts in a row without GW01/GW02', 'Ten shifts in a row without frying a LabSim or a Collis probe.'],
  ['ACH08', 'Magic Smoke', '💨', 50, 'Hardware', 'Trigger GW01 or GW02 once (Academy spark counts)', 'You let the magic smoke out. terminals and Collis probes go on the AC strip.', true],
  ['ACH09', 'Rollback Ready', '⏪', 250, 'Arcade', 'INC42 with PB05, later INC43 using the kept legacy row', 'Upgrade a rig with a new Device row, then roll back using the one you kept.'],
  ['ACH10', 'Pixel Perfect', '📐', 200, 'Drills', 'DR05 round with every box edge error ≤ 1 px (≥ 5 boxes)', 'Five or more GIMP boxes, every edge within 1 px.'],
  ['ACH11', 'Comma Chameleon', '🦎', 150, 'Drills', '10 consecutive DR06 items correct', 'Ten Pigeon JSON fixes in a row without a miss.'],
  ['ACH12', 'Four or Five', '🧾', 150, 'Drills', 'DR07 Gold', 'Gold on the receipt-map drill.'],
  ['ACH13', 'Second Screen Liberation', '🖥', 400, 'Arcade', 'Complete INC38', 'Migrate the last Station Duo OCR check to UI Automator 2.3.'],
  ['ACH14', 'CAPS LOCK IS CRUISE CONTROL', '🔠', 150, 'Drills', 'DR11 Gold', 'Gold on the env-var case drill.'],
  ['ACH15', 'By Name Only', '🏷', 200, 'Arcade', 'INC41 with ROSIE never leaving Unavailable', 'Run a named job on ROSIE without ever changing its status.'],
  ['ACH16', 'Patience Is a Fix', '⏳', 100, 'Arcade', 'INC05 with zero power cycles', 'Wait for the next health check instead of power-cycling again.'],
  ['ACH17', 'Triple Threat', '🔥', 300, 'Arcade', 'Reach combo 8 (×3.0) in a shift', 'Reach a ×3.0 combo in a shift.'],
  ['ACH18', 'Clean Hands', '🧤', 300, 'Arcade', 'Finish a ≥ 10-min shift with zero penalty events', 'A 10-minute shift with no penalties at all.'],
  ['ACH19', 'SLA Slayer', '⏱', 400, 'Arcade', 'Finish a Full Shift with zero SLA breaches', 'A Full Shift with every ticket inside its SLA.'],
  ['ACH20', 'Green Wall', '🟩', 200, 'Arcade', 'All active pipelines unblocked and green for 120 consecutive real s at H3+', 'Keep every pipeline green for two straight minutes at high heat.'],
  ['ACH21', 'S-Rank', '🏆', 300, 'Arcade', 'First S grade', 'Earn your first S grade.'],
  ['ACH22', 'Daily Driver', '📅', 300, 'Streaks', '7 ranked Daily Challenges completed', 'Complete seven ranked Daily Challenges.'],
  ['ACH23', 'Habit Forming', '📆', 500, 'Streaks', '30-day streak', 'Keep a 30-day streak.'],
  ['ACH24', 'Interac Insider', '🍁', 200, 'Arcade', 'INC52 with Fast Diagnosis', 'Route a Canadian Interac PIN test to a physical bot with a fast, correct diagnosis.'],
  ['ACH25', 'Track Star', '💳', 150, 'Arcade', 'INC55 first attempt, no penalties', 'Fix corrupted swipe Track Data first time, cleanly.'],
  ['ACH26', 'Gort Guide', '🗂', 250, 'Arcade', 'INC53 and INC54 in the same shift', 'Fix a wrong Gort card path and a stale scheduled clone in one shift.'],
  ['ACH27', 'Wine Connoisseur', '🍷', 200, 'Arcade', 'Solve INC56', 'Repair Wine card programming on a Pi.'],
  ['ACH28', 'Eviction Notice', '💾', 300, 'Arcade', 'INC19 with PB01 and no GW11', 'Solve the NUC disk-full incident by moving control back to the Pi — without touching security monitoring.'],
  ['ACH29', 'Lord of the Rigs', '🔍', 150, 'Exploration', 'Inspect the Pi, tablet/screen and device of all 12 modelled rigs (36 inspections)', 'Inspect the Pi, tablet or screen, and device of all 12 modelled rigs.'],
  ['ACH30', 'Robot Whisperer', '🤖', 200, 'Exploration', 'Collect all 60 robot quips (§5.3)', 'Hear all 60 robot quips.'],
  ['ACH31', 'Librarian', '📚', 300, 'Exploration', 'Unlock every Field Manual entry', 'Unlock every Field Manual entry.'],
  ['ACH32', 'Total Recall', '🧠', 300, 'Mastery', '500 flashcard reviews', 'Review 500 flashcards.'],
  ['ACH33', 'Weak No More', '📈', 200, 'Mastery', 'Raise any tag from < 0.40 to ≥ 0.85 effective mastery', 'Turn a weak topic into a mastered one.'],
  ['ACH34', 'Full Spectrum', '🌈', 500, 'Mastery', 'All tags ≥ 0.80 effective mastery at once', 'Every topic at 0.80 mastery or better at the same time.'],
  ['ACH35', 'Lab Lead', '👑', 1000, 'Certification', 'Reach career rank Lab Lead', 'Reach the top career rank.'],
  ['ACH36', 'By the Book', '📖', 150, 'Arcade', '5 correct escalations to {{jared}} and zero lifetime GW12', 'Five correct hardware escalations to {{jared}}, and never a bounced one.'],
  ['ACH37', 'Trust but Verify', '🧐', 200, 'Arcade', '5 correct INC57 verdicts', 'Judge five Ollama tip-math verdicts correctly.'],
  ['ACH38', 'Hot Swap', '🔁', 200, 'Arcade', 'Solve INC44', 'Hot-swap a Mini 3 in for a dead printerless Station Duo 2.'],
  ['ACH39', 'Drill Sergeant', '🎖', 500, 'Drills', 'Gold in all 19 drills', 'Gold medals in all 19 drills.'],
  ['ACH40', 'Day One Hero', '🦸', 400, 'Academy', 'M18 (capstone) with ★★★', 'Three stars on the capstone module.'],
  ['ACH41', 'Real Lab', '🧪', 500, 'Arcade', 'Full Shift in Strict realism graded ≥ A', 'An A or better on a Full Shift in Strict realism.'],
  ['ACH42', 'Sandbox Scientist', '🧰', 150, 'Exploration', 'Fix 10 injected faults in Free Play', 'Fix ten injected faults in Free Play.'],
  ['ACH43', 'Port Authority', '⚓', 200, 'Drills', 'DR03 Gold and INC27 solved in < 60 s', 'Gold on the port drill and the 5555 collision solved in under a minute.'],
  ['ACH44', 'Ruler of Coordinates', '📏', 300, 'Arcade', 'INC20 via the PR route (PB03) within par', 'Fix the receipt QR regression with a coordinate PR, within par.'],
  ['ACH45', 'Certified', '📜', 200, 'Certification', 'Pass any certification exam', 'Pass a certification exam.'],
  ['ACH46', 'With Distinction', '🥇', 300, 'Certification', 'Pass any certification with distinction (Cur §5.1)', 'Pass a certification with distinction (written ≥ 95 %, practical with no strikes).'],
];

export const ACHIEVEMENTS: AchievementDef[] = resolvePeople(
  ROWS.map(([id, title, icon, xp, category, condition, description, hidden]) => ({
    id,
    title,
    icon,
    xp,
    category,
    condition,
    description,
    ...(hidden ? { hidden: true } : {}),
  })),
);

export const ACHIEVEMENTS_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
