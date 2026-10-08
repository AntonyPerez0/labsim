/**
 * The global event catalogue. Subsystems add their own events with declaration merging:
 *
 *   declare module '@/core/events' {
 *     interface EventMap {
 *       'power.fuseBlown': { fuseId: string; railId: string };
 *     }
 *   }
 *
 * Naming: `<domain>.<pastTenseOrNoun>` in camelCase, e.g. `robot.statusChanged`, `adb.tap`.
 * Payloads must be plain serialisable data (no class instances, no three.js objects).
 *
 * Core/engine/UI/gameplay events are declared here; simulation events are declared in `@/sim/events`.
 * Gameplay events (mission/ticket/shift/xp/…) are emitted by the mission runtime through `ctx.emit`
 * inside `transact()`; UI-originated events through `emit()` from `@/core/store`.
 * Time fields: `…S` = session real seconds (`session.clockS`), `…Ms` = game ms.
 */
import type {
  CareerRankId,
  GameMode,
  HeatLevel,
  Medal,
  PipelineId,
  Realism,
  Severity,
  ShiftEventId,
  ShiftGrade,
  ToolId,
} from './state';

export interface EventMap {
  /* ── Player / engine ── */
  /** The player pressed an interaction verb on an interactable. */
  'player.interacted': { interactableId: string; verb: string; tool: string };
  /** The player entered a named location anchor. */
  'player.enteredLocation': { locationId: string };
  /** The player looked at (crosshair) an interactable within reach for ≥ 0.5 s. */
  'player.inspected': { interactableId: string };
  /** Hold-RMB inspect zoom showed a prop's callouts (world or lesson callouts). */
  'player.calloutsShown': { propId: string; lines: string[] };
  /** The player sat down at / stood up from the workstation. */
  'player.seated': { seated: boolean };
  /** A carried large item was picked up / set down / installed (`E` on a valid slot). */
  'item.pickedUp': { itemId: string; ref: string | null; from: string };
  'item.placed': { itemId: string; ref: string | null; targetId: string; installed: boolean };
  /** Pocket parts changed (fuse taken from the tray, cable used …). */
  'inventory.changed': { item: string; delta: number; total: number };
  /** Hotbar selection (`1`–`5`, wheel, `Q` holster → `hand`). */
  'tool.selected': { tool: ToolId; slot: number | null };
  /** Tool mode toggled with `R` (multimeter mode, fuse rating, card type, screwdriver bit). */
  'tool.modeChanged': { tool: ToolId; mode: string };

  /* ── UI / apps ── */
  /** An overlay was opened or closed. */
  'ui.overlayChanged': { from: string; to: string };
  /** A computer app navigated to a route (e.g. app "orca", route "/entities/merchant-config/3/edit"). */
  'app.navigated': { app: string; route: string };
  /** A computer app was opened (window created/focused). */
  'app.opened': { app: string };
  /** Generic UI action inside an app that lessons may wait for (e.g. "orca.clickEdit"). */
  'app.action': { app: string; action: string; data?: Record<string, unknown> };
  /** A Field Manual entry was unlocked ("New entry" sparkle). */
  'manual.entryUnlocked': { entryId: string; source: string };
  /** Evidence auto-captured into the Notebook. */
  'notebook.evidenceCaptured': { evidenceId: string; source: string; text: string; rig: string | null };
  /** A one-time control prompt was shown (GP §6.2). */
  'ui.controlHintShown': { hintId: string };
  /** Desktop window list for the world's monitor mirror (apps doc §1.10; emitted by the shell, ≤ 2 Hz). */
  'computer.windowsChanged': { windows: { id: string; app: string; title: string; minimized: boolean; focused: boolean }[] };
  /** The player swiped a test card at the desk card reader (world `desk.player.card-reader`; apps doc §12.1). */
  'workstation.cardSwiped': { card: 'test-card-visa' | 'test-card-interac' };

  /* ── Dialogue & quiz ── */
  /** A dialogue line appeared (UI plays voice blips). */
  'dialogue.shown': { lineId: string; speaker: string; text: string };
  /** A dialogue line was acknowledged. */
  'dialogue.acknowledged': { lineId: string };
  /** A dialogue choice (keys 1–4) was picked. */
  'dialogue.choiceMade': { lineId: string; choiceId: string; correct: boolean | null };
  /** A quiz question was answered. */
  'quiz.answered': { questionId: string; correct: boolean; context: string };
  /** A quiz run (checkpoint / review / exam paper) finished. */
  'quiz.finished': { checkpointId: string | null; context: string; correct: number; total: number; passed: boolean; attempt: number };
  /** A flashcard was self-graded (Leitner). */
  'flashcard.reviewed': { cardId: string; gotIt: boolean; boxBefore: number; boxAfter: number };

  /* ── World / lifecycle ── */
  /** The world finished building and is ready to play. */
  'world.ready': Record<string, never>;
  /** Game clock / session lifecycle. */
  'session.started': { mode: string; activityId: string | null };
  'session.ended': { mode: string; activityId: string | null; passed: boolean };

  /* ── Missions: Academy lesson runner ── */
  'mission.started': { mode: GameMode; activityId: string; runId: number; replay: boolean };
  'mission.stepStarted': { moduleId: string; stepId: string; index: number; kind: string };
  'mission.stepCompleted': { moduleId: string; stepId: string; index: number; xp: number; hintsUsed: number };
  /** Step or module restarted from its checkpoint (pause menu). */
  'mission.restarted': { moduleId: string; stepId: string | null; scope: 'step' | 'module' };
  'mission.objectiveCompleted': { objectiveId: string; text: string };
  /** A hint tier was revealed (Academy step or Arcade ticket). */
  'mission.hintShown': { scope: 'step' | 'ticket'; ref: string; tier: number; text: string };
  /** A wrong action produced a mentor correction (Academy). */
  'mission.wrongAction': { stepId: string; text: string; count: number };
  /** "Show me" ghost demo started (−50 % step XP). */
  'mission.showMe': { stepId: string };
  'mission.checkpointResult': { checkpointId: string; correct: number; total: number; passed: boolean; firstTry: boolean };
  'mission.completed': { moduleId: string; stars: number; xp: number; replay: boolean };

  /* ── Arcade: tickets ── */
  'ticket.opened': { ticketId: string; incidentId: string; variantId: string; rig: string | null; severity: Severity; reporter: string; title: string; misleading: boolean };
  'ticket.acked': { ticketId: string; fast: boolean };
  /** Ticket panel opened on this ticket (IN_PROGRESS). */
  'ticket.focused': { ticketId: string };
  'ticket.callMade': { ticketId: string; optionId: string; correct: boolean; fast: boolean; points: number };
  'ticket.escalated': { ticketId: string; cause: string; endpoint: string; outcome: 'queued' | 'pending' | 'accepted' | 'bounced'; points: number };
  'ticket.replied': { ticketId: string; replyId: string; correct: boolean };
  /** Resolve pressed; condition waits for its deferred trigger. */
  'ticket.verifying': { ticketId: string; label: string };
  'ticket.resolved': { ticketId: string; incidentId: string; points: number; rS: number; fastDiagnosis: boolean; comboAfter: number; escalated: boolean };
  /** Resolve pressed with a false success condition (GW16) or verification failed. */
  'ticket.resolveRejected': { ticketId: string; reason: string };
  'ticket.breached': { ticketId: string };
  'ticket.handover': { ticketId: string };
  'ticket.closed': { ticketId: string; status: string };

  /* ── Arcade: shift ── */
  'shift.started': { configId: string; kind: string; seed: string; lengthMinutes: number; realism: Realism; ranked: boolean; wildcard: boolean };
  'shift.heatChanged': { heat: HeatLevel };
  'shift.scoreChanged': { score: number; delta: number; reason: string; ticketId: string | null };
  'shift.comboChanged': { combo: number; multiplier: number; reset: boolean };
  'shift.strike': { strikes: number; reason: string; gwId: string | null };
  'shift.eventStarted': { eventId: ShiftEventId };
  'shift.eventEnded': { eventId: ShiftEventId };
  'shift.ended': { configId: string; score: number; grade: ShiftGrade; ratio: number; reason: 'time' | 'strikes' | 'quit' | 'early' };
  'pipeline.attempted': { pipelineId: PipelineId; robot: string | null; blocked: boolean; consoleLine: string };
  'pipeline.finished': { pipelineId: PipelineId; robot: string | null; result: 'SUCCESS' | 'FAILURE'; points: number; buildId: string | null };
  /** Global wrong action (GP §3.3) — also fired in Academy/Free Play (points 0 when penalties are off). */
  'gw.triggered': { gwId: string; points: number; strike: boolean; ticketId: string | null; detail: string; tag: string | null };
  /** Process bonus (GP §3.3). */
  'pb.awarded': { pbId: string; points: number; ticketId: string | null };
  'teachCard.shown': { teachCardId: string; trigger: string; ref: string };
  /** Jared walked over and performed an escalated fix (narration lines are chat/dialogue). */
  'npc.jaredFix': { ticketId: string; phase: 'started' | 'finished' };

  /* ── Drills ── */
  'drill.started': { drillId: string; mode: string | null; daily: boolean };
  'drill.itemAnswered': { drillId: string; itemId: string; correct: boolean; points: number; ms: number; streak: number };
  'drill.finished': { drillId: string; score: number; accuracy: number; medal: Medal | null; newBest: boolean };

  /* ── Free Play ── */
  'freeplay.faultInjected': { injectionId: string; incidentId: string; variantId: string; rig: string | null; random: boolean };
  'freeplay.faultFixed': { injectionId: string; incidentId: string; xp: number };
  'freeplay.faultCleared': { injectionId: string; incidentId: string };

  /* ── Certification ── */
  'cert.started': { examId: string; part: 'written' | 'practical' };
  'cert.taskFinished': { examId: string; taskId: string; passed: boolean; reason: string | null };
  'cert.finished': { examId: string; passed: boolean; distinction: boolean; writtenPct: number };

  /* ── Progression ── */
  'xp.gained': { amount: number; source: string; detail: string; total: number };
  'rank.changed': { from: CareerRankId; to: CareerRankId };
  'rank.pending': { rank: CareerRankId; missing: string[] };
  'achievement.unlocked': { achievementId: string; title: string; xp: number };
  'streak.updated': { current: number; best: number; freezeUsed: boolean };
  'mastery.changed': { tag: string; before: number; after: number; source: string };
  /** A robot quip was heard/seen (ACH30). */
  'quip.collected': { quipId: string; rig: string };
}
