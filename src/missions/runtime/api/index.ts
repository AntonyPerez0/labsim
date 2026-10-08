/**
 * The assembled `missions` runtime (MissionsApi). Every mutating method runs in one `transact()`.
 */
import { getState, transact } from '@/core/store';
import type { CareerRankId, HotbarSlot, Realism, ToolId } from '@/core/state';
import type { DrillVerdict } from '../../types';
import type { EscalationRequest, InventoryItemRef, MissionsApi, SandboxPatch } from '../../api';
import { academyApi, api, catalogApi, healthCheckCountdown, last, lifecycleApi, practiceFromCard, quizApi } from './lifecycle';
import { endShift, startShift } from '../arcade/director';
import { ackTicket, callRootCause, escalate, fileBug, openTicketPanel, replyTicket, resolveTicket, submitTask, ticketHint } from '../arcade/tickets';
import { ticketView } from '../arcade/view';
import { answerDrill, drillItem, finishDrill } from '../drills/host';
import { dailyInfo } from '../arcade/plans';
import {
  clearAllFaults,
  clearFault,
  faultInjectorEntries,
  injectFault,
  loadSnapshot,
  resetLab,
  saveSnapshot,
  setSandbox,
  snapshotSlots,
  startFreeplay,
} from '../freeplay';
import { startCertification, startPractical, submitPracticalAnswer, submitWritten } from '../cert/cert';
import { startWeakSpot } from '../weakspot';
import { cycleToolMode, selectHotbar, selectTool, setDownCarried, takeItem, useItem } from '../tools';
import { dismissTeachCard, markManualRead, pinEvidence, setNotes, toggleBookmark, unlockManualEntry } from '../manual';
import { achievementViews, careerRank, isRank, leaderboard, masteryViews, rankFor, weakestTagViews } from '../progression/profile';
import { grantXp, checkPromotion } from '../progression/xp';

export const missions: MissionsApi = {
  /* lifecycle */
  init: lifecycleApi.init,
  tick: lifecycleApi.tick,
  frame: lifecycleApi.frame,
  restart: lifecycleApi.restart,
  quit: lifecycleApi.quit,
  setPaused: lifecycleApi.setPaused,
  continueFromDebrief: lifecycleApi.continueFromDebrief,

  /* catalogue */
  modules: catalogApi.modules,
  moduleState: catalogApi.moduleState,
  moduleView: catalogApi.moduleView,
  lesson: catalogApi.lesson,
  shifts: catalogApi.shifts,
  shiftUnlock: catalogApi.shiftUnlock,
  drills: catalogApi.drills,
  drillView: catalogApi.drillView,
  incidents: catalogApi.incidents,
  incident: catalogApi.incident,
  certifications: catalogApi.certifications,
  certView: catalogApi.certView,
  dailyInfo: catalogApi.dailyInfo,
  menuBadges: catalogApi.menuBadges,

  /* academy */
  startAcademy: academyApi.startAcademy,
  continueAcademy: academyApi.continueAcademy,
  acknowledgeDialogue: academyApi.acknowledgeDialogue,
  chooseDialogue: academyApi.chooseDialogue,
  requestHint: academyApi.requestHint,
  showMe: academyApi.showMe,
  fastForward: academyApi.fastForward,
  restartStep: academyApi.restartStep,
  restartModule: academyApi.restartModule,

  /* quiz & flashcards */
  answerQuiz: quizApi.answerQuiz,
  nextQuizQuestion: quizApi.nextQuizQuestion,
  finishQuiz: quizApi.finishQuiz,
  dueFlashcards: quizApi.dueFlashcards,
  startFlashcards: quizApi.startFlashcards,
  reviewFlashcard: quizApi.reviewFlashcard,
  endFlashcards: quizApi.endFlashcards,
  leitnerSummary: quizApi.leitnerSummary,

  /* shift */
  startShift: api.startShift,
  startDaily(opts?: { practice?: boolean }): void {
    api.startShift({ configId: 'daily', seedMode: 'daily', ...(opts?.practice ? { practice: true } : {}) });
  },
  startDailyDrill(): void {
    api.startDrill(dailyInfo(getState().progress).drillId, { daily: true });
  },
  startWeakSpot(): void {
    const r = transact((d, ctx) => startWeakSpot(d, ctx));
    if (r.ok) last.value = { kind: 'weakspot' };
  },
  endShift(): void {
    transact((d, ctx) => endShift(d, ctx, 'early'));
  },
  nextHealthCheckInS: healthCheckCountdown,

  /* tickets */
  ackTicket: (id: string) => transact((d, ctx) => ackTicket(d, ctx, id)),
  openTicket: (id: string) => transact((d, ctx) => openTicketPanel(d, ctx, id)),
  claimTicket: (id: string) =>
    transact((d, ctx) => {
      ackTicket(d, ctx, id);
      openTicketPanel(d, ctx, id);
    }),
  selectTicket: (id: string | null) =>
    transact((d) => {
      d.ui.selectedTicketId = id;
    }),
  ticketView: (id: string) => ticketView(getState(), id),
  callRootCause: (id: string, optionId: string) => transact((d, ctx) => callRootCause(d, ctx, id, optionId)),
  escalate: (id: string, req: EscalationRequest) => transact((d, ctx) => escalate(d, ctx, id, req.cause, req.endpoint)),
  resolveTicket: (id: string) => transact((d, ctx) => resolveTicket(d, ctx, id)),
  replyTicket: (id: string, replyId: string) => transact((d, ctx) => replyTicket(d, ctx, id, replyId)),
  fileBug: (id: string, fields: Record<string, string | number>) => transact((d, ctx) => fileBug(d, ctx, id, fields)),
  submitTask: (id: string, answers: { matches: Record<string, string>; statusLineId?: string }) => transact((d, ctx) => submitTask(d, ctx, id, answers)),
  ticketHint: (id: string, confirm?: boolean) => transact((d, ctx) => ticketHint(d, ctx, id, confirm)),

  /* drills */
  startDrill: api.startDrill,
  drillItem: (itemId: string) => drillItem(itemId),
  answerDrill: (itemId: string, verdict: DrillVerdict) => transact((d, ctx) => answerDrill(d, ctx, itemId, verdict)),
  finishDrill: () => transact((d, ctx) => finishDrill(d, ctx)),

  /* free play */
  startFreeplay(opts?: { slot?: 1 | 2 | 3; fresh?: boolean }): void {
    transact((d, ctx) => startFreeplay(d, ctx, opts ?? {}));
    last.value = { kind: 'freeplay' };
  },
  faultInjectorEntries: () => faultInjectorEntries(getState()),
  injectFault: (incidentId: string, opts?: { variantId?: string; rig?: string; createTicket?: boolean }) => transact((d, ctx) => injectFault(d, ctx, incidentId, opts ?? {})),
  clearFault: (injectionId: string) => transact((d, ctx) => clearFault(d, ctx, injectionId)),
  clearAllFaults: () => transact((d, ctx) => clearAllFaults(d, ctx)),
  setSandbox: (patch: SandboxPatch) => transact((d, ctx) => setSandbox(d, ctx, patch)),
  resetLab: () => transact((d, ctx) => resetLab(d, ctx)),
  saveSnapshot: (slot: 1 | 2 | 3) => transact((d) => saveSnapshot(d, slot)),
  loadSnapshot: (slot: 1 | 2 | 3) => transact((d, ctx) => loadSnapshot(d, ctx, slot)),
  snapshotSlots: () => snapshotSlots(),

  /* certification */
  startCertification(examId: string) {
    const r = transact((d, ctx) => startCertification(d, ctx, examId));
    if (r.ok) last.value = { kind: 'cert', examId };
    return r;
  },
  submitWritten: () => transact((d, ctx) => submitWritten(d, ctx)),
  startPractical: () => transact((d, ctx) => startPractical(d, ctx)),
  submitPracticalAnswer: (taskId: string, answer: string) => transact((d, ctx) => submitPracticalAnswer(d, ctx, taskId, answer)),

  /* tools */
  selectHotbar: (slot: HotbarSlot | null) => transact((d, ctx) => selectHotbar(d, ctx, slot)),
  selectTool: (tool: ToolId) => transact((d, ctx) => selectTool(d, ctx, tool)),
  cycleToolMode: () => transact((d, ctx) => cycleToolMode(d, ctx)),
  takeItem: (item: InventoryItemRef, count?: number) => transact((d, ctx) => takeItem(d, ctx, item, count)),
  useItem: (item: InventoryItemRef, count?: number) => transact((d, ctx) => useItem(d, ctx, item, count)),
  setDownCarried: (targetId?: string) => transact((d, ctx) => setDownCarried(d, ctx, targetId)),

  /* teach cards, manual, notebook */
  dismissTeachCard: (id: string) => transact((d) => dismissTeachCard(d, id)),
  practiceTeachCard: (id: string) => practiceFromCard(id),
  unlockManualEntry: (entryId: string, source: string) => transact((d, ctx) => unlockManualEntry(d, ctx, entryId, source)),
  markManualRead: (entryId: string) => transact((d) => markManualRead(d, entryId)),
  toggleBookmark: (entryId: string) => transact((d) => toggleBookmark(d, entryId)),
  setNotes: (text: string) => transact((d) => setNotes(d, text)),
  pinEvidence: (evidenceId: string, pinned: boolean) => transact((d) => pinEvidence(d, evidenceId, pinned)),

  /* profile */
  rankFor,
  careerRank: () => careerRank(getState()),
  achievements: () => achievementViews(getState()),
  mastery: () => masteryViews(getState()),
  weakestTags: (n: number) => weakestTagViews(getState(), n),
  leaderboard: (boardId: string) => leaderboard(getState(), boardId),
  setRealism: (realism: Realism) =>
    transact((d) => {
      d.progress.realism = realism;
      if (d.session.mode === 'menu') d.session.realism = realism;
    }),
  setPlayerName: (name: string) =>
    transact((d) => {
      const n = name.trim().slice(0, 16);
      if (n) d.progress.playerName = n;
    }),
  debugGrant(xp: number, rank?: CareerRankId): void {
    transact((d, ctx) => {
      if (xp > 0) grantXp(d, ctx, xp, 'freeplay', 'Debug grant', { final: true });
      if (rank && isRank(rank)) d.progress.rank = rank;
      checkPromotion(d, ctx);
    });
  },
};

export { startShift };
