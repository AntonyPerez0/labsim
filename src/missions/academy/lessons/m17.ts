/**
 * M17 — AI, Infrastructure & the Roadmap (Cur §2 M17). Mentor {{jared}}, cameo {{david}}.
 * Setup (`academy:M17`, Sim §4.4.2): GPU blade on `loc.server-shelf` (GPUs 1–2 on top, 3–4 underneath —
 * crouch to tag), retired tower on the floor, Ollama at `10.42.1.12:11434` with the vision model
 * `llava`, receipt image `walle_receipt_0912.jpg` (tip 18 % of $42.00 printed as $7.65 instead of $7.56),
 * and PR `uia-remote#212 [AI eval] Generated tests for ReceiptScreen` re-opened.
 */
import type { RootState } from '@/core/state';
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { minigameDone, worldAction } from './helpers';

/** Cur M17 step 5 prompt (exact). */
export const M17_PROMPT =
  'Check this receipt image. Is the layout complete (merchant header, items, subtotal, tax, tip, total) and is the tip math correct? Answer PASS or FAIL with one reason.';

const gpusTagged = c.any(
  worldAction('server.gpuTagged', (d) => Array.isArray(d.tagged) && (d.tagged as unknown[]).length >= 4),
  minigameDone('gpu-tag', 4),
);

/** The Ollama request (`requestId`) carried the receipt image: an answer to an image-less prompt does not count. */
const withReceipt = (st: RootState, requestId: unknown): boolean => {
  const reqs = (st.lab.ollama?.requests ?? []) as readonly { id: string; image: string | null }[];
  const r = reqs.find((x) => x.id === requestId);
  return !!r?.image && r.image.includes('receipt');
};
const receiptAnswered = c.happened(on('app.action', { app: 'ollama', action: 'ollama.response.received' }, (pl, st) => withReceipt(st, (pl.data as { requestId?: string } | undefined)?.requestId)));
const receiptFlagged = c.happened(
  on('app.action', { app: 'ollama', action: 'ollama.response.flagged' }, (pl, st) => {
    const d = (pl.data ?? {}) as { requestId?: string; flag?: string };
    return d.flag === 'tip-math-error' && withReceipt(st, d.requestId);
  }),
);

export const M17: LessonDef = {
  moduleId: 'M17',
  mentor: 'jared',
  setup: { preset: 'academy:M17', spawn: 'loc.workstation', apps: { unlock: ['ollama', 'github', 'orca', 'jenkins', 'terminal', 'chat'] } },
  deck: 'deck.M17',
  manualChapters: ['Infrastructure'],
  realLabChecklist: [
    'One shelf-mounted blade with four NVIDIA GPUs (two exposed, two underneath) replaced the old tower and hosts the VMs, Orca, Jenkins and Ollama. Restarting it takes all of them down.',
    'Orca runs on an on-premise lab VM backed by MySQL; the plan is to containerise it with Docker and move it to Google Cloud.',
    'Ollama runs a local vision LLM as a proof of concept on webcam streams (receipt layout, tip math). It is a PoC, not a gate.',
    'Claude was evaluated for repository optimisation and test generation. Generated code still gets a human review against the team rules.',
    'Gen 2 Software PIN Bypass, built with the Core OS Team, will leave physical robots only for interactions that cannot be faked, like dipping a card.',
  ],
  steps: [
    { id: 'M17.01', kind: 'walk-to', hud: 'Meet {{jared}} at the server shelf', location: 'loc.server-shelf' },
    {
      id: 'M17.02',
      kind: 'interact',
      hud: 'Find all four GPUs',
      target: 'prop.gpu-blade',
      success: gpusTagged,
      objectives: [
        { id: 'M17.02.top', text: 'GPUs 1–2 on top', done: worldAction('server.gpuTagged', (d) => Array.isArray(d.tagged) && [1, 2].every((n) => (d.tagged as unknown[]).includes(n))) },
        { id: 'M17.02.under', text: 'Crouch (C): GPUs 3–4 underneath', done: worldAction('server.gpuTagged', (d) => Array.isArray(d.tagged) && [3, 4].every((n) => (d.tagged as unknown[]).includes(n))) },
      ],
      wrongActions: [
        {
          id: 'power-button',
          on: on('player.interacted', { interactableId: 'server.blade' }, (pl) => /power/i.test(pl.verb)),
          say: 'Hands off the power button. That blade runs Orca, Jenkins and Ollama: every build in the lab dies with it.',
          gw: 'GW13',
        },
      ],
      hints: [{ afterS: 45, effect: 'text', text: 'Two GPUs are exposed. Crouch with C and look under the shelf for the other two.' }],
      factIds: ['F075', 'F076'],
    },
    {
      id: 'M17.03',
      kind: 'inspect',
      hud: "What's that old tower?",
      prop: 'prop.legacy-tower',
      callouts: ['RETIRED — replaced by GPU blade'],
      manualEntryIds: ['infrastructure-overview'],
      factIds: ['F077'],
    },
    {
      id: 'M17.04',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'The blade replaced that tower. Four NVIDIA GPUs, two exposed, two underneath. It hosts our VMs, Orca and Jenkins, and Ollama. Orca is still on an on-prem VM with MySQL behind it. The plan is to containerise it with Docker and move it to Google Cloud.',
      factIds: ['F075', 'F076', 'F077', 'F078', 'F023', 'F013', 'F022'],
    },
    {
      id: 'M17.05',
      kind: 'computer-task',
      hud: "Ask the vision model to check WALL-E's last receipt",
      app: 'ollama',
      route: '/',
      success: c.all(receiptAnswered, receiptFlagged),
      objectives: [
        { id: 'M17.05.model', text: 'Model llava · attach walle_receipt_0912.jpg', done: c.appAction('ollama', 'ollama.image.attached', (d) => String(d.path ?? '').includes('walle_receipt_0912')) },
        { id: 'M17.05.ask', text: 'Send the receipt-check prompt', done: receiptAnswered },
        { id: 'M17.05.flag', text: 'Tick "Tip math error"', done: receiptFlagged },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Attach ~/Downloads/walle_receipt_0912.jpg with the paperclip and pick the llava model.' },
        { afterS: 120, idle: true, effect: 'text', text: `Prompt: ${M17_PROMPT}` },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'ollama', route: '/', target: 'ollama.attach', action: 'click' }],
      factIds: ['F031', 'F032'],
    },
    {
      id: 'M17.06',
      kind: 'dialogue',
      speaker: 'david',
      text: "Ollama is a local LLM runner on that blade. Right now it's a proof of concept: a vision LLM watching webcam streams to validate receipt layouts and tip math. Useful, but it's a PoC, not a gate.",
      factIds: ['F031', 'F032'],
    },
    {
      id: 'M17.07',
      kind: 'dialogue',
      speaker: 'david',
      text: "Corporate AI initiatives also evaluated Claude, for repository optimisation and automated test generation. Generated tests still get a human review. Here's one.",
      factIds: ['F033'],
    },
    {
      id: 'M17.08',
      kind: 'computer-task',
      hud: 'Review PR #212 in uia-remote',
      app: 'github',
      route: '/labsim-lab/uia-remote/pull/212/files',
      success: c.all(
        c.eq(p.pr('uia-remote', 212).verdict, 'REQUEST_CHANGES'),
        c.appAction('github', 'github.pr.reviewSubmitted', (d) => {
          if (d.repo !== 'uia-remote' || d.number !== 212 || d.verdict !== 'REQUEST_CHANGES') return false;
          const comments = (d.comments as { reason?: string | null; body?: string }[] | undefined) ?? [];
          return comments.some((cm) => cm.reason === 'missing-isScreenPresent' || /isScreenPresent/.test(cm.body ?? '')) || /isScreenPresent/.test(String(d.body ?? ''));
        }),
      ),
      wrongActions: [
        {
          id: 'approve-ai',
          on: on('app.action', { app: 'github', action: 'github.pr.reviewSubmitted' }, (pl) => {
            const d = (pl.data ?? {}) as { number?: number; verdict?: string };
            return d.number === 212 && d.verdict === 'APPROVE';
          }),
          say: 'Look again: waitForScreen() is there, but isScreenPresent() is missing. Both are mandatory on every screen class.',
          speaker: 'david',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Check the new screen class against the rule: which mandatory methods must every screen class have?' },
        { afterS: 120, idle: true, effect: 'text', text: 'Review changes → Request changes, reason "Missing mandatory isScreenPresent()".' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'github', route: '/labsim-lab/uia-remote/pull/212/files', target: 'github.reviewChanges', action: 'click' }],
      factIds: ['F033', 'F180', 'F179'],
    },
    { id: 'M17.09', kind: 'walk-to', hud: 'Go to the roadmap board', location: 'loc.whiteboard' },
    {
      id: 'M17.10',
      kind: 'interact',
      hud: 'Sort the roadmap cards',
      target: 'prop.roadmap-board',
      success: minigameDone('roadmap-sort', 8),
      hints: [
        { afterS: 60, effect: 'text', text: 'Orca still runs on the on-prem VM today; Docker on GCP is the plan.' },
        { afterS: 120, effect: 'text', text: 'The NUCs no longer control hardware, and Station Duo OCR is being phased out for UI Automator 2.3.' },
      ],
      factIds: ['F022', 'F023', 'F068', 'F032', 'F222', 'F156', 'F018'],
    },
    {
      id: 'M17.11',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Gen 2 is the big one. We're working with the Core OS Team on a software framework that bypasses the robots for Secure Touch PIN entry. Then the robots only do what can't be faked, like dipping a card.",
      factIds: ['F222', 'F223'],
    },
    { id: 'M17.12', kind: 'quiz-checkpoint', checkpointId: 'CP-M17.1', title: 'Infra & AI', questionIds: ['Q351', 'Q354', 'Q355', 'Q358', 'Q359'] },
  ],
};
