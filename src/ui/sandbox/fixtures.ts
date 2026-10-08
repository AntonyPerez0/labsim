/**
 * Sandbox fixtures for `sandbox-ui.html`: store states for each UI scene and a mocked mission runtime
 * (via `setMissionsOverride`) so menus, HUD, tickets, quiz and debrief render with realistic data.
 * Ticket texts follow GP §3.5 (INC01, INC27, INC39); nothing here ships in the game.
 */
import { mutate } from '@/core/store';
import type { ActivityResult, RootState, TicketState } from '@/core/state';
import { createDefaultSession } from '@/core/state';
import type { MissionsApi, TicketView } from '@/missions';
import { FLASHCARDS, MODULES } from '@/content';
import { setMissionsOverride } from '@/ui/services/missions';
import { masteryViews } from '@/ui/data/views';
import { store } from '@/core/store';

export type SceneId = 'quiz-order' | 'quiz-match' | 'quiz-fill' | 'title' | 'menu' | 'academy' | 'arcade' | 'drills' | 'hud' | 'shift' | 'tickets' | 'quiz' | 'manual' | 'settings' | 'debrief' | 'pause' | 'profile' | 'loading' | 'notebook' | 'flashcards' | 'computer' | 'tablet' | 'inspect' | 'drill' | 'freeplay' | 'controls' | 'debug' | 'cert' | 'freeplay-menu' | 'daily' | 'about' | 'board-arch' | 'board-roadmap' | 'board-history' | 'board-bolts' | 'ruler';

const NOW = 28_800_000 + 15 * 60_000 + 12_000; // 08:15:12

function seedProgress(s: RootState): void {
  const p = s.progress;
  p.playerName = 'Avery';
  p.createdAt = 1;
  p.flags.quickSetupDone = true;
  p.xp = 1840;
  p.rank = 'lab-technician';
  p.cosmetics = { lanyard: 'blue', unlocked: ['lanyard.grey', 'lanyard.blue'] };
  p.streak = { ...p.streak, current: 4, best: 9, freezes: 1 };
  const stars: Record<string, 0 | 1 | 2 | 3> = { M01: 3, M02: 2, M03: 3, M04: 2, M05: 1, M06: 2 };
  for (const [id, st] of Object.entries(stars)) {
    p.modules[id] = { completed: true, bestScore: 100, completedAtDay: 20000, status: 'complete', stars: st, bestCheckpoint: st === 3 ? 1 : 0.8, replays: id === 'M03' ? 1 : 0, starBonusesPaid: { two: st >= 2, three: st === 3 } };
  }
  p.modules.M07 = { completed: false, bestScore: 0, completedAtDay: 0, status: 'in-progress', stars: 0, bestCheckpoint: 0, replays: 0, starBonusesPaid: { two: false, three: false } };
  p.academyCheckpoint = { moduleId: 'M07', stepIndex: 5, stepId: 'M07.06', replay: false, savedAt: 1 };
  p.drills.DR01 = { best: 1720, medal: 'silver', rounds: 6, bestAccuracy: 0.86, medalsPaid: ['bronze', 'silver'], modesUnlocked: [] };
  p.drills.DR04 = { best: 2240, medal: 'gold', rounds: 9, bestAccuracy: 0.95, medalsPaid: ['bronze', 'silver', 'gold'], modesUnlocked: [] };
  p.drills.DR10 = { best: 1310, medal: 'bronze', rounds: 3, bestAccuracy: 0.74, medalsPaid: ['bronze'], modesUnlocked: [] };
  p.drills.DR16 = { best: 1210, medal: 'silver', rounds: 4, bestAccuracy: 0.9, medalsPaid: ['bronze', 'silver'], modesUnlocked: [] };
  p.bestShiftScores['shift-5'] = 3420;
  p.shifts.gradeCounts = { S: 0, A: 2, B: 3, C: 1, D: 0 };
  p.achievements = { ACH01: { unlockedAtDay: 20000, unlockedAt: Date.now() - 86_400_000 * 3 }, ACH08: { unlockedAtDay: 20001, unlockedAt: Date.now() - 86_400_000 } };
  p.stats = { ...p.stats, incidentsResolved: 23, fastDiagnoses: 9, escalationsCorrect: 6, escalationsBounced: 1, fusesReplaced: 4, robotsParked: 17, flashcardsReviewed: 212, drillRounds: 22, shiftsCompleted: 6, playSeconds: 4 * 3600 + 1260 };
  p.fieldManual.read = ['lab-tour', 'orca-statuses'];
  p.fieldManual.unlocked = ['lab-tour', 'orca-statuses', 'adb-port-5444'];
  const now = Date.now();
  FLASHCARDS.slice(0, 64).forEach((c, i) => {
    p.leitner[c.id] = { box: 1 + (i % 5), dueDay: 0, due: now, lastReviewed: now, streak: i % 3, introducedDay: 0 };
  });
  for (const [tag, m] of [
    ['orca.status', 0.82],
    ['orca.status.connfailed', 0.71],
    ['power.fuses', 0.88],
    ['power.18v', 0.5],
    ['adb.port', 0.34],
    ['hw.motion', 0.66],
    ['hw.pi', 0.58],
  ] as const) {
    p.tagMastery[tag] = { m, level: 2, lastEvidenceAt: now, minSeen: m, lastLevelUpAt: 0, evidence: 6 };
  }
  s.lab.time.nowMs = NOW;
}

function ticket(over: Partial<TicketState> & Pick<TicketState, 'id' | 'incidentId' | 'title' | 'severity' | 'reporter'>): TicketState {
  const rig = over.robotId ?? null;
  return {
    variantId: 'A',
    misleading: false,
    summary: '',
    robotId: rig,
    binding: { rig, hrn: rig ? rig.toUpperCase() : null, rigs: rig ? [rig] : [], vars: {}, seed: 1 },
    difficulty: 1,
    basePoints: 250,
    parS: 180,
    slaS: 270,
    openedAtMs: NOW,
    arrivedAtS: 30,
    ackedAtS: null,
    startedAtS: null,
    resolvedAtS: null,
    slaSecondsLeft: 200,
    sla: 'green',
    breached: false,
    status: 'new',
    points: 0,
    hintTier: 0,
    canCall: true,
    callOptionOrder: ['A', 'B', 'C', 'D'],
    call: null,
    escalation: null,
    escalationsBounced: 0,
    reply: null,
    replyAttempts: 0,
    bug: null,
    matches: null,
    counters: {},
    penaltyIds: [],
    bonusIds: [],
    fixedAtMs: null,
    verifying: null,
    resolveAttempts: 0,
    score: null,
    compoundWith: null,
    notYetTaught: false,
    plannedWork: false,
    faultInstanceIds: [],
    source: 'shift',
    pinned: false,
    ...over,
  };
}

const TICKETS: TicketState[] = [
  ticket({ id: 'LAB-4127', incidentId: 'INC01', title: 'WALL-E failed checkout — Connection Failed', severity: 'P1', reporter: 'jenkins-bot', robotId: 'wall-e', status: 'in-progress', ackedAtS: 33, startedAtS: 35, slaSecondsLeft: 118, sla: 'amber', summary: 'Java/uia-remote-regression-flex #4131 could not check out WALL-E: the robot is blocked from checkouts (Connection Failed).' }),
  ticket({ id: 'LAB-2210', incidentId: 'INC27', title: 'SOMETHING IS TAPPING MY DESK FLEX BY ITSELF', severity: 'P1', reporter: 'riley', robotId: null, basePoints: 350, slaSecondsLeft: 241, summary: 'My desk Flex keeps opening Register and adding “Tax Item 5”. I didn’t touch it!' }),
  ticket({ id: 'LAB-7783', incidentId: 'INC39', title: 'uia-remote-regression-flex fails at checkout', severity: 'P1', reporter: 'jenkins-bot', robotId: null, basePoints: 200, parS: 120, slaS: 180, slaSecondsLeft: 31, sla: 'red', notYetTaught: true }),
];

function shiftState(): RootState['session']['shift'] {
  return {
    configId: 'shift-10',
    kind: 'standard',
    lengthMinutes: 10,
    seed: '7c1e44a0',
    seedMode: 'random',
    rngSeed: 1,
    wildcard: true,
    realism: 'standard',
    startPosition: 'desk',
    ranked: false,
    practice: false,
    phase: 'running',
    durationS: 600,
    elapsedS: 263,
    heat: 3,
    heatCap: 4,
    difficultyCap: 3,
    nextSpawnAtS: 290,
    spawnHoldUntilS: null,
    score: 2184,
    target: 1650,
    combo: 4,
    maxCombo: 4,
    multiplier: 2,
    strikes: 1,
    strikeLog: [],
    penalties: [],
    bonuses: [],
    pipelines: (['PL1', 'PL2', 'PL3', 'PL4', 'PL5'] as const).map((id, i) => ({
      id,
      job: ['Java/uia-remote-regression-flex', 'Java/uia-remote-tethered-tax', 'Java/pigeon-android-sale-swipe', 'Java/uia-remote-regression-mini', 'Java/contact-canada-pin-sale'][i]!,
      active: true,
      activationOrder: i + 1,
      phase: i === 0 ? 'blocked' : i === 1 ? 'running' : 'waiting',
      nextAttemptInS: 12,
      runEndsInS: i === 1 ? 31 : null,
      buildId: null,
      robot: i === 1 ? 'megatron' : null,
      params: {},
      lastResult: i === 0 ? 'BLOCKED' : i === 2 ? 'SUCCESS' : i === 3 ? 'FAILURE' : null,
      lastRobot: i === 2 ? 'eve' : i === 3 ? 'bumblebee' : null,
      lastConsoleLine: i === 0 ? '[orca] no Available FLEX_3 robot — build waiting in queue' : null,
      runIndex: 3,
      attempts: 8,
      gotRig: 6,
      green: 4,
      red: 1,
      blocked: 2,
      greenStreak: {},
    })),
    pipelinePoints: 60,
    uptime: { attempts: 31, gotRig: 28 },
    event: null,
    jaredAwayUntilS: null,
    queuedEscalations: [],
    plannedWorkTicketId: null,
    plan: null,
    pickHistory: [],
    stats: { spawned: 6, resolved: 3, breaches: 0, fastDiagnoses: 2, calls: 3, wrongCalls: 0, escalationsCorrect: 1, escalationsBounced: 0, hintsUsed: 1, penaltyEvents: 1 },
    greenWallS: 0,
    nextHealthCheckInS: 42,
    rules: { scoring: true, hintsMaxTier: 3, diagnosisCall: true, hudObjectives: true, pipelines: true, strikesToEnd: 3, forceHealthCheck: false },
    grade: null,
    ratio: null,
    endReason: null,
  };
}

const RESULT: ActivityResult = {
  kind: 'academy',
  activityId: 'M06',
  title: 'M06 · Orca Architecture & the Five Robot Statuses',
  passed: true,
  points: 0,
  xp: 395,
  accuracy: 1,
  durationSeconds: 1140,
  takeaways: [
    'Read a robot’s status in Orca and know which of the five statuses lets Jenkins check it out.',
    'Open the robot’s Notes to find the failed health-check endpoint and its error.',
    'Wait for the next 5-minute health check before calling a fix verified.',
    'Escalate a crashed Pi or offline Callus box to Jared with the exact endpoint.',
  ],
  newAchievements: ['ACH04'],
  xpBreakdown: [
    { label: '14 steps', xp: 185 },
    { label: 'Module complete', xp: 100 },
    { label: 'First ★★★', xp: 100 },
    { label: 'Checkpoint 100 % first try', xp: 10 },
  ],
  rank: { before: 'lab-technician', after: 'lab-technician', pending: ['xp:660', 'CERT-R2'] },
  teachCards: [
    {
      id: 'tc1',
      whatHappened: 'You overrode a failed health check.',
      why: 'Connection Failed blocks checkouts for a reason; the next ping will flip it back. (Ref §3)',
      doInstead: 'Find the cause or escalate to Jared with the endpoint.',
      ref: 'Ref §3',
      factIds: [],
      practiceDrillId: 'DR01',
      trigger: { kind: 'academy', ref: 'GW24' },
      ticketId: null,
      masteryChange: { tag: 'orca.status.connfailed', before: 0.71, after: 0.55 },
      createdAtS: 0,
      collapsed: false,
    },
  ],
  academy: {
    moduleId: 'M06',
    stars: 3,
    hintsUsed: 0,
    checkpoint: { checkpointId: 'CP-M06.1', attempts: 1, total: 6, firstTryCorrect: 6, firstTryPassed: true, firstTryPerfect: true, passed: true, missedIds: [] },
    replay: false,
    unlocked: { incidents: ['INC01', 'INC02', 'INC04', 'INC05', 'INC06', 'INC07'], drills: ['DR01', 'DR09'], modes: ['Weak Spot'], hotbar: ['ethernet-cable'], decks: ['deck.M06'], manualChapters: [] },
    playNow: { kind: 'drill', drillId: 'DR01' },
    nextModules: ['M07', 'M12'],
  },
};

const VIEW_OPTIONS: Record<string, { id: string; text: string }[]> = {
  INC01: [
    { id: 'A', text: 'Pi board hung — needs a power cycle' },
    { id: 'B', text: 'Ethernet cable unplugged' },
    { id: 'C', text: 'Rack A 5 V fuse blown' },
    { id: 'D', text: 'Callus box offline' },
  ],
  INC27: [
    { id: 'A', text: 'portNumber 5555 — the runner fell back to a coworker’s device' },
    { id: 'B', text: 'Riley’s Flex has malware' },
    { id: 'C', text: 'Orca routed to the wrong rig' },
    { id: 'D', text: 'Wrong deviceType' },
  ],
  INC39: [
    { id: 'A', text: 'The env var value isn’t the exact ALL-CAPS enum' },
    { id: 'B', text: 'No Flex rigs available' },
    { id: 'C', text: 'Orca down' },
    { id: 'D', text: 'Wrong folder' },
  ],
};

function installMissionMocks(): void {
  const mock: Partial<MissionsApi> = {
    menuBadges: () => ({ cardsDue: 14, weakestTag: 'adb.port', examReady: 'CERT-R2' }),
    dueFlashcards: () => FLASHCARDS.slice(0, 14).map((c) => c.id),
    weakestTags: (n: number) =>
      masteryViews(store.getState().progress, Date.now())
        .filter((m) => m.label !== 'new')
        .sort((a, b) => a.mEff - b.mEff)
        .slice(0, n),
    lesson: (id: string) => ({ moduleId: id, steps: new Array(15).fill(null) }) as unknown as ReturnType<MissionsApi['lesson']>,
    ticketView: (id: string): TicketView | null => {
      const t = store.getState().session.tickets.find((x) => x.id === id);
      if (!t) return null;
      return {
        ticket: t,
        incidentName: t.incidentId,
        callOptions: VIEW_OPTIONS[t.incidentId] ?? null,
        replies: null,
        task: null,
        escalatable: t.incidentId === 'INC01',
        endpointCandidates: t.incidentId === 'INC01' ? ['http://10.42.10.11:8000/health'] : [],
        nextHintTier: 1,
        hints: t.incidentId === 'INC01' ? ['Orca keeps a log for every robot. Start there.'] : [],
        verifyingLabel: null,
        slaFraction: t.slaS ? t.slaSecondsLeft / t.slaS : 0,
      };
    },
  };
  setMissionsOverride(mock);
}

/** Apply a scene's store state. */
export function applyScene(scene: SceneId): void {
  installMissionMocks();
  mutate((s) => {
    seedProgress(s);
    s.session = createDefaultSession();
    s.ui.loading = scene === 'loading' ? { progress: 0.62, label: 'Wiring Rack B power rails…' } : null;
    s.ui.pointerLocked = true;
    s.ui.prompt = null;
    s.ui.toasts = [];
    s.ui.teachCards = [];
    s.ui.banners = [];
    switch (scene) {
      case 'title':
        s.ui.overlay = { kind: 'main-menu', screen: 'title' };
        break;
      case 'loading':
      case 'menu':
        s.ui.overlay = { kind: 'main-menu', screen: 'home' };
        break;
      case 'academy':
        s.ui.overlay = { kind: 'main-menu', screen: 'academy' };
        break;
      case 'arcade':
        s.ui.overlay = { kind: 'main-menu', screen: 'shift-setup' };
        break;
      case 'drills':
        s.ui.overlay = { kind: 'main-menu', screen: 'drills' };
        break;
      case 'profile':
        s.ui.overlay = { kind: 'main-menu', screen: 'profile' };
        break;
      case 'hud':
      case 'pause':
      case 'notebook': {
        s.session.mode = 'academy';
        s.session.activityId = 'M06';
        s.session.realism = 'standard';
        s.session.inventory = ['hand', 'flashlight', 'screwdriver', 'multimeter', 'spare-fuse-5v'];
        s.session.activeTool = 'multimeter';
        s.session.items.fuses = { '5': 1, '7.5': 0, '10': 2, '15': 0 };
        s.session.objectives = [
          { id: 'o1', text: 'Open Orca and filter the robot list to Connection Failed', done: true },
          { id: 'o2', text: 'Open WALL-E’s Notes and find the failed health-check endpoint', done: false },
          { id: 'o3', text: 'Check the Pi’s LEDs on WALL-E’s shelf', done: false, progress: [1, 2] },
        ];
        s.session.academy = {
          moduleId: 'M06',
          replay: false,
          stepIndex: 6,
          stepId: 'M06.07',
          stepKind: 'computer-task',
          phase: 'active',
          stepStartedAtMs: NOW,
          stepElapsedS: 75,
          idleS: 40,
          hintTier: 1,
          hintText: 'Notes live on the robot’s detail page — click WALL-E’s row in the robot list.',
          wrongActions: 0,
          showMeUsed: false,
          highlight: null,
          breadcrumb: false,
          fastForwardOffered: true,
          stepsDone: [],
          hintsUsedTotal: 1,
          showMeUsedTotal: 0,
          xpEarned: 85,
          checkpoints: {},
          stars: null,
        };
        s.session.dialogue = {
          id: 'M06.07.d1',
          speaker: 'tate',
          text: 'Orca pings every robot’s Pi every five minutes. No answer, and the robot goes to Connection Failed — blocked from checkouts until the next ping succeeds. The Notes tab tells you exactly which endpoint failed and why.',
          requiresAck: true,
          shownAtS: 0,
        };
        s.ui.prompt = { label: 'Raspberry Pi — WALL-E', verbs: [{ key: 'E', label: 'Unplug Pi power lead' }, { key: 'F', label: 'Probe 5 V input (needs multimeter)', disabled: false }, { key: 'R', label: 'Reseat Ethernet (needs Ethernet cable)', disabled: true }] };
        s.ui.toasts = [
          { id: 't1', kind: 'xp', title: '+25 XP', body: 'Step complete: open Orca’s robot list', createdAtMs: NOW },
          { id: 't2', kind: 'manual', title: 'New Field Manual entry', body: 'Orca: the five robot statuses', createdAtMs: NOW },
        ];
        s.ui.overlay = scene === 'pause' ? { kind: 'pause' } : scene === 'notebook' ? { kind: 'notebook' } : { kind: 'none' };
        s.session.notebook.evidence = [
          { id: 'e1', source: 'notes', text: 'GET http://10.42.10.11:8000/health → connect timed out after 10000 ms', atGameMs: NOW - 60_000, rig: 'wall-e', ticketId: null },
          { id: 'e2', source: 'led', text: 'Pi PWR red solid · ACT solid on (no flicker)', atGameMs: NOW - 20_000, rig: 'wall-e', ticketId: null },
          { id: 'e3', source: 'terminal', text: 'ping -c 3 10.42.10.11 → 100% packet loss', atGameMs: NOW - 5_000, rig: 'wall-e', ticketId: null },
        ];
        break;
      }
      case 'shift':
      case 'tickets': {
        s.session.mode = 'arcade-shift';
        s.session.activityId = 'shift-10';
        s.session.inventory = ['hand', 'flashlight', 'screwdriver', 'multimeter', 'spare-fuse-5v', 'ethernet-cable', 'test-card-visa'];
        s.session.items.ethernetCables = 2;
        s.session.tickets = TICKETS.map((t) => ({ ...t }));
        s.session.shift = shiftState();
        s.lab.time.timeScale = 5;
        s.session.clockS = 263;
        s.ui.selectedTicketId = 'LAB-4127';
        s.ui.banners = [{ id: 'b1', kind: 'info', text: 'Verifying… waiting for the 08:20 health check', untilS: null }];
        s.ui.teachCards = [
          {
            id: 'tc-gw17',
            whatHappened: 'Extra power cycle.',
            why: 'Recovery shows at the next 5-minute health check; cycling again delays it. (Ref §3)',
            doInstead: 'Verify with curl and wait for the ping.',
            ref: 'Ref §3',
            practiceDrillId: 'DR01',
            trigger: { kind: 'gw', ref: 'GW17' },
            ticketId: 'LAB-4127',
            masteryChange: { tag: 'orca.healthcheck', before: 0.71, after: 0.58 },
            createdAtS: 260,
            collapsed: false,
          },
        ];
        s.ui.prompt = { label: 'Status tablet — EVE', verbs: [{ key: 'E', label: 'Use tablet' }] };
        s.ui.overlay = scene === 'tickets' ? { kind: 'tickets', ticketId: 'LAB-4127', panel: 'detail' } : { kind: 'none' };
        break;
      }
      case 'quiz':
        s.session.mode = 'academy';
        s.session.activityId = 'M01';
        s.ui.overlay = { kind: 'quiz', questionIds: MODULES[0]!.checkpointQuestionIds, context: 'lesson' };
        break;
      case 'quiz-order':
      case 'quiz-match':
      case 'quiz-fill':
        s.session.mode = 'academy';
        s.ui.overlay = { kind: 'quiz', questionIds: [scene === 'quiz-order' ? 'Q058' : scene === 'quiz-match' ? 'Q014' : 'Q005'], context: 'review' };
        break;
      case 'manual':
        s.ui.overlay = { kind: 'manual', articleId: 'adb-port-5444' };
        break;
      case 'flashcards':
        s.ui.overlay = { kind: 'flashcards', deck: 'deck.M06' };
        break;
      case 'settings':
        s.session.mode = 'academy';
        s.ui.overlay = { kind: 'settings' };
        break;
      case 'board-arch':
      case 'board-roadmap':
      case 'board-history':
      case 'board-bolts':
      case 'ruler':
        s.session.mode = 'freeplay';
        s.session.activityId = 'freeplay';
        s.session.inventory = scene === 'ruler' ? ['hand', 'flashlight', 'ruler'] : ['hand', 'flashlight'];
        s.session.activeTool = scene === 'ruler' ? 'ruler' : 'hand';
        s.ui.overlay = {
          kind: 'inspect',
          propId: scene === 'board-arch' ? 'wall.whiteboard' : scene === 'board-roadmap' ? 'wall.roadmap' : scene === 'board-history' ? 'wall.history.match' : scene === 'board-bolts' ? 'jared.bolt-bins' : 'rig.eve.device',
        };
        break;
      case 'computer':
      case 'tablet':
      case 'inspect':
      case 'controls':
      case 'debug':
        s.session.mode = 'freeplay';
        s.session.activityId = 'freeplay';
        s.session.inventory = ['hand', 'flashlight', 'screwdriver', 'multimeter', 'spare-fuse-5v', 'ethernet-cable', 'test-card-visa'];
        s.ui.prompt = { label: 'Raspberry Pi — WALL-E', verbs: [{ key: 'E', label: 'Unplug Pi power lead' }, { key: 'F', label: 'Probe 5 V input (needs multimeter)', disabled: true }] };
        s.ui.debug = scene === 'debug';
        s.ui.overlay =
          scene === 'computer' ? { kind: 'computer' } : scene === 'tablet' ? { kind: 'tablet', robotId: 'wall-e' } : scene === 'inspect' ? { kind: 'inspect', propId: 'power.fuse-block.5v' } : scene === 'controls' ? { kind: 'controls' } : { kind: 'none' };
        break;
      case 'freeplay':
        s.session.mode = 'freeplay';
        s.session.activityId = 'freeplay';
        s.session.inventory = ['hand', 'flashlight', 'screwdriver', 'multimeter', 'spare-fuse-5v', 'ethernet-cable', 'test-card-visa'];
        s.ui.overlay = { kind: 'sandbox' };
        break;
      case 'drill':
        s.session.mode = 'arcade-drill';
        s.session.activityId = 'DR01';
        s.ui.overlay = { kind: 'drill', drillId: 'DR01' };
        break;
      case 'cert':
        s.ui.overlay = { kind: 'main-menu', screen: 'certification' };
        break;
      case 'freeplay-menu':
        s.ui.overlay = { kind: 'main-menu', screen: 'freeplay' };
        break;
      case 'daily':
        s.ui.overlay = { kind: 'main-menu', screen: 'daily' };
        break;
      case 'about':
        s.ui.overlay = { kind: 'main-menu', screen: 'home' };
        break;
      case 'debrief':
        s.session.mode = 'academy';
        s.session.result = RESULT;
        s.ui.overlay = { kind: 'debrief' };
        break;
    }
  });
}
