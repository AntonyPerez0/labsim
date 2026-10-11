/**
 * M15 — Parrot (LSTR) & Legacy JSON (Cur §2 M15). Mentor {{morgan}}, cameo {{jaden}}.
 * Setup (`academy:M15`, Sim §4.4.2): gorth PR #418 "Update MICRO_3 receipt coordinates" is open
 * (un-merged), `parrot/tests/sale/swipe_sale_print.json` is the expanded fixture with a missing comma
 * after line 22, and `Java/parrot-android-sale-swipe` runs on BUMBLEBEE (MICRO_3, outdated coordinates).
 * Step 5 fails `LSTR ParseError: Unexpected string in JSON at line 23 column 7`; step 8 fails
 * `step 7/9 "select print" … TIMEOUT after 60 s`; step 11 merge → Orka sync → PASS.
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { JOB, consoleOpened, finished, jobRoute, say } from './helpers';

const FILE = 'tests/sale/swipe_sale_print.json';
/** Parrot JSON is edited in VS Code (IntelliJ clicks still count for players who prefer it). */
const tokenClicked = (token: string) => {
  const hit = (d: { path?: unknown; token?: unknown; lineText?: unknown }) => String(d.path ?? '').endsWith('swipe_sale_print.json') && (d.token === token || String(d.lineText ?? '').includes(`"${token}"`));
  return c.any(c.appAction('vscode', 'vscode.editor.clicked', hit), c.appAction('intellij', 'intellij.editor.clicked', hit));
};

export const M15: LessonDef = {
  moduleId: 'M15',
  mentor: 'morgan',
  setup: { preset: 'academy:M15', spawn: 'loc.workstation', apps: { unlock: ['vscode', 'intellij', 'jenkins', 'camera', 'github', 'terminal', 'chat'] } },
  deck: 'deck.M15',
  manualChapters: ['Test Frameworks'],
  realLabChecklist: [
    'Parrot (LSTR, the Language Specific Test Runner) evolved from Lister; its runners speak REST, Android, Windows and iOS. The iOS runner is rarely touched, but iOS Go testing is active.',
    'A Parrot test is raw JSON: name, connection type, supported platforms (often 4–5 at once) and an array of actions that create requests, pass parameters and store outputs.',
    'Parrot tests are edited in VS Code. It flags raw JSON syntax (one token late: look at the end of the previous line) but knows nothing about LSTR, so wrong action names, ${variables} and screens only fail at run time. Paste known-good blocks instead of writing syntax from scratch.',
    'To test a change: commit on a branch, push, then point the Jenkins Parrot job at your branch.',
    'A failure "at select print" usually means the arm missed the Print button (stale coordinates), so no printer payload arrived before the timeout. Check the camera, then the coordinates.',
  ],
  steps: [
    {
      id: 'M15.01',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Before uia-relay there was Lister, and Lister evolved into Parrot. The name's a pun on parroting: one test, repeated in every platform's language. Its engine is LSTR, the Language Specific Test Runner. Tests are raw JSON, and the runner speaks REST, Android, Windows and iOS.",
      factIds: ['F041', 'F042', 'F043', 'F044', 'F045', 'F202', 'F012'],
    },
    {
      id: 'M15.02',
      kind: 'computer-task',
      hud: "Open the parrot folder in VS Code and click the runner that's rarely touched",
      app: 'vscode',
      route: '/folder/parrot',
      onEnter: [{ do: 'setup', setup: { scenario: [{ op: 'repo.clone', params: { repo: 'parrot' } }] } }],
      success: c.any(
        c.appAction('vscode', 'vscode.tree.nodeClicked', (d) => d.repo === 'parrot' && d.path === 'runners/ios'),
        c.appAction('intellij', 'intellij.tree.nodeClicked', (d) => d.repo === 'parrot' && d.path === 'runners/ios'),
      ),
      wrongActions: [
        {
          id: 'busy-runner',
          on: on('app.action', { app: 'vscode', action: 'vscode.tree.nodeClicked' }, (pl) => /^runners\/(rest|android|windows)$/.test(String((pl.data as { path?: string } | undefined)?.path ?? ''))),
          say: 'That one runs every night. Look for the one we rarely open.',
        },
      ],
      onComplete: [say('morgan', 'Rarely touched, though iOS Go SDK testing is very much alive.')],
      factIds: ['F202', 'F203'],
    },
    {
      id: 'M15.03',
      kind: 'computer-task',
      hud: 'Open swipe_sale_print.json and click the four parts of a Parrot test',
      app: 'vscode',
      route: `/folder/parrot/file/${FILE}`,
      success: c.all(tokenClicked('name'), tokenClicked('connectionType'), tokenClicked('platforms'), tokenClicked('actions')),
      objectives: [
        { id: 'M15.03.name', text: 'name', done: tokenClicked('name') },
        { id: 'M15.03.conn', text: 'connectionType', done: tokenClicked('connectionType') },
        { id: 'M15.03.platforms', text: 'platforms', done: tokenClicked('platforms') },
        { id: 'M15.03.actions', text: 'actions', done: tokenClicked('actions') },
      ],
      factIds: ['F205', 'F206', 'F207'],
    },
    {
      id: 'M15.04',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "See the 'card swipe' action? The runner abstracts it. Over REST it becomes a platform-specific SDK payment request; on a rig it becomes a physical robot action through Orka. One test can target four or five platforms at once.",
      factIds: ['F204', 'F206'],
    },
    {
      id: 'M15.05',
      kind: 'computer-task',
      hud: 'Run Java/parrot-android-sale-swipe',
      app: 'jenkins',
      route: jobRoute(JOB.parrotSwipe, 'build'),
      success: c.all(c.happened(finished(JOB.parrotSwipe, 'FAILURE', 'JSON_PARSE')), consoleOpened(JOB.parrotSwipe, 'FAILURE')),
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.parrotSwipe, 'build'), target: 'jenkins.buildButton', action: 'click' }],
      onComplete: [say('morgan', 'Line 23, column 7. The parser stops where it noticed, which is usually the line after the real mistake.')],
      factIds: ['F208'],
    },
    {
      id: 'M15.06',
      kind: 'computer-task',
      hud: 'Fix the JSON in VS Code, then commit and push from Source Control',
      app: 'vscode',
      route: `/folder/parrot/file/${FILE}`,
      success: c.eq(p.gitFile('parrot', FILE, 'main').parsesJson, true),
      objectives: [
        { id: 'M15.06.fix', text: 'Fix the JSON (missing comma after line 22, or paste from tests/_templates/known_good_actions.json)', done: c.eq(p.gitFile('parrot', FILE, 'local').parsesJson, true) },
        { id: 'M15.06.push', text: 'Commit and push to parrot main', done: c.eq(p.gitFile('parrot', FILE, 'main').parsesJson, true) },
      ],
      hints: [
        { afterS: 45, idle: true, effect: 'text', text: 'Open Problems (Ctrl+Shift+M). VS Code puts the squiggle on line 23, the token AFTER the gap, so look at the end of line 22.' },
        { afterS: 120, idle: true, effect: 'text', text: '"robot": "${ROBOT_NAME}" is missing its trailing comma. Save (Ctrl+S), then Source Control (Ctrl+Shift+G): message, ✓ Commit, Sync Changes.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [
        { app: 'vscode', route: `/folder/parrot/file/${FILE}`, target: 'vscode.problemsWidget', action: 'click' },
        { app: 'vscode', route: `/folder/parrot/file/${FILE}`, target: 'vscode.activity:scm', action: 'click' },
        { app: 'vscode', route: `/folder/parrot/file/${FILE}`, target: 'vscode.commitButton', action: 'click' },
      ],
      factIds: ['F208', 'F209'],
    },
    {
      id: 'M15.07',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "VS Code only checks raw JSON syntax. It knows nothing about LSTR, so a misspelled action or ${variable} looks fine until the run fails. That's why we say Parrot has no real linter, and why the survival skill is pasting JSON blocks that already work. Drill it any time in VS Code's Parrot Practice panel.",
      factIds: ['F209', 'F246', 'F247', 'F248'],
    },
    {
      id: 'M15.08',
      kind: 'computer-task',
      hud: 'Rebuild and read the failure',
      app: 'jenkins',
      route: jobRoute(JOB.parrotSwipe, 'build'),
      success: c.all(c.happened(finished(JOB.parrotSwipe, 'FAILURE', 'PRINTER_TIMEOUT')), consoleOpened(JOB.parrotSwipe, 'FAILURE')),
      factIds: ['F210'],
    },
    {
      id: 'M15.09',
      kind: 'interact',
      hud: 'What broke?',
      target: 'npc.morgan',
      prompt: 'FAILED at "select print". What broke?',
      success: c.happened(on('dialogue.choiceMade', { choiceId: 'missed-print', correct: true })),
      choices: [
        {
          id: 'paper',
          text: 'The printer is out of paper.',
          correct: false,
          response: [{ speaker: 'morgan', text: "Possible, but it's not what that log usually means. The runner timed out waiting for a printer payload, and the usual reason is that the arm never pressed Print." }],
        },
        {
          id: 'json',
          text: "The 'select print' JSON is invalid.",
          correct: false,
          response: [{ speaker: 'morgan', text: 'The JSON parsed this time: the runner reached step 7. "select print" is just the last step it attempted before timing out.' }],
        },
        {
          id: 'missed-print',
          text: 'The arm missed the Print button, so no printer payload arrived before the timeout.',
          correct: true,
          response: [{ speaker: 'morgan', text: 'Exactly. The log names the last step attempted, not the cause. Outdated screen coordinates made the arm miss Print.' }],
        },
      ],
      factIds: ['F210', 'F211'],
    },
    {
      id: 'M15.10',
      kind: 'computer-task',
      hud: "Prove it on BUMBLEBEE's recording",
      app: 'camera',
      route: '/recordings',
      success: c.appAction('camera', 'camera.recording.finished', (d) => d.robotName === 'bumblebee'),
      showMe: [{ app: 'camera', route: '/recordings', target: 'camera.recording:', action: 'click' }],
      onComplete: [say('jaden', 'About 3 mm above Print. Those are the old MICRO_3 coordinates from before the QR shift. My PR fixes them.')],
      factIds: ['F211', 'F213'],
    },
    {
      id: 'M15.11',
      kind: 'computer-task',
      hud: "Approve {{jaden}}'s coordinate PR, then rerun",
      app: ['github', 'jenkins'],
      route: '/labsim-lab/gorth/pull/418',
      success: c.sequence(on('github.prMerged', { repo: 'gorth', number: 418 }), on('jenkins.buildFinished', { jobId: JOB.parrotSwipe, result: 'SUCCESS' })),
      objectives: [
        { id: 'M15.11.approve', text: 'Review gorth#418: Approve', done: c.appAction('github', 'github.pr.reviewSubmitted', (d) => d.repo === 'gorth' && d.number === 418 && d.verdict === 'APPROVE') },
        { id: 'M15.11.merge', text: '{{jaden}} merges; Orka syncs the coordinates', done: c.happened(on('github.prMerged', { repo: 'gorth', number: 418 })) },
        { id: 'M15.11.green', text: 'Rebuild Java/parrot-android-sale-swipe: PASSED', done: c.sequence(on('github.prMerged', { repo: 'gorth', number: 418 }), on('jenkins.buildFinished', { jobId: JOB.parrotSwipe, result: 'SUCCESS' })) },
      ],
      showMe: [{ app: 'github', route: '/labsim-lab/gorth/pull/418/files', target: 'github.reviewChanges', action: 'click' }],
      factIds: ['F214', 'F211'],
    },
    { id: 'M15.12', kind: 'quiz-checkpoint', checkpointId: 'CP-M15.1', title: 'Parrot', questionIds: ['Q308', 'Q309', 'Q311', 'Q312', 'Q316', 'Q320', 'Q322'] },
  ],
};
