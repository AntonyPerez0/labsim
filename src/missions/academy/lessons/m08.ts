/**
 * M08 — Capabilities, Merchant Config, Lazo & Ubo (Cur §2 M08). Mentor {{devin}}, cameo {{nate}}.
 * Setup (`academy:M08`, Sim §4.4.2): Merchant Config `GO-SDK-US-01` has a blank API Key; Gorth test
 * definition `go-sdk/tests/sale_receipt.json` lacks its `printer` capability; DATA is on
 * `AUTO-US-NOPIN-01`. Sim deviation (Appendix A.2): the printerless Flux Pocket the Match preview drops
 * in step 5 is VISION (the GO_SDK Flux Pocket), not ROSIE — the lesson text names the device type only.
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { JOB, clearFaults, finished, inject, jobRoute, queued, say } from './helpers';

const RECEIPT_TEST = 'go-sdk/tests/sale_receipt.json';
const API_KEY = 'key_sim_19c0e2';

export const M08: LessonDef = {
  moduleId: 'M08',
  mentor: 'devin',
  setup: { preset: 'academy:M08', spawn: 'loc.coffee', apps: { unlock: ['orka', 'jenkins', 'intellij', 'github', 'chat'] } },
  deck: 'deck.M08',
  realLabChecklist: [
    'Capabilities decide which robot runs your test: SDK frameworks declare them as JSON inside each test definition (dynamic, parsed at runtime); UI Automator suites hardcode them in the pipeline script (non-dynamic).',
    'Contact Canada scripts on the Westerly beds use both lookup styles.',
    'Merchant Config hides fields in its table: always click Edit to see App ID, App Secret and API Key, which pipelines export as env vars for the Go SDK.',
    'Merchant swaps are done by Lazo Automation (zero-touch OOBE: de-provision, wipe caches, setup wizard, new merchant), with the Ubo Platform routing the switch.',
  ],
  steps: [
    { id: 'M08.01', kind: 'walk-to', hud: '{{devin}} is waiting at your desk', location: 'loc.workstation' },
    {
      id: 'M08.02',
      kind: 'dialogue',
      speaker: 'devin',
      text: "I'm {{devin}}, and I look after the SDK frameworks, including the Terminal SDK. Orka supports Go through custom extensions, and we test it through Parrot and the mobile runners. Today: how Orka decides which robot runs your test.",
      factIds: ['F008', 'F009', 'F133', 'F131'],
    },
    {
      id: 'M08.03',
      kind: 'computer-task',
      hud: 'Open Robot Capabilities for WALL-E and ROSIE',
      app: 'orka',
      route: '/robot-capability?tab=documents&robot=wall-e',
      success: c.all(
        c.appAction('orka', 'orka.capabilities.viewed', (d) => d.robotName === 'wall-e'),
        c.appAction('orka', 'orka.capabilities.viewed', (d) => d.robotName === 'rosie'),
      ),
      objectives: [
        { id: 'M08.03.walle', text: 'WALL-E: printer true, physicalTouch true', done: c.appAction('orka', 'orka.capabilities.viewed', (d) => d.robotName === 'wall-e') },
        { id: 'M08.03.rosie', text: 'ROSIE: FLUX_POCKET, printer false', done: c.appAction('orka', 'orka.capabilities.viewed', (d) => d.robotName === 'rosie') },
      ],
      showMe: [{ app: 'orka', target: 'orka.capabilities.robotSelect', action: 'select', text: 'rosie' }],
      factIds: ['F131', 'F011'],
    },
    {
      id: 'M08.04',
      kind: 'dialogue',
      speaker: 'devin',
      text: 'Two ways to ask for capabilities. SDK frameworks use dynamic JSON lookups: the capabilities live as JSON metadata inside each test definition and Orka parses them at runtime. Traditional UI Automator suites use non-dynamic lookups, hardcoded in the pipeline script. The Contact Canada scripts on the Westerly beds use both, interchangeably.',
      factIds: ['F132', 'F134', 'F135', 'F011'],
    },
    {
      id: 'M08.05',
      kind: 'computer-task',
      hud: "This Go SDK receipt test needs a printer. Add it to the test's capabilities.",
      app: 'intellij',
      onEnter: [inject({ op: 'repo.clone', params: { repo: 'gorth' } }), { do: 'openApp', app: 'intellij', route: `/project/gorth/file/${RECEIPT_TEST}` }],
      success: c.all(c.eq(p.gitFile('gorth', RECEIPT_TEST, 'local').parsesJson, true), c.eq(p.gitFile('gorth', RECEIPT_TEST, 'local').json('/capabilities/printer'), true)),
      objectives: [
        { id: 'M08.05.edit', text: 'Add "printer": true to the "capabilities" object and save', done: c.eq(p.gitFile('gorth', RECEIPT_TEST, 'local').json('/capabilities/printer'), true) },
        { id: 'M08.05.valid', text: 'The JSON still parses', done: c.eq(p.gitFile('gorth', RECEIPT_TEST, 'local').parsesJson, true) },
        {
          id: 'M08.05.preview',
          text: 'Optional: run Match preview in Orka and see the printerless Flux Pocket drop out',
          optional: true,
          done: c.appAction('orka', 'orka.matchPreview.ran', (d) => typeof d.capabilities === 'string' && d.capabilities.includes('"printer"')),
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Open go-sdk/tests/sale_receipt.json in the gorth project.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Inside "capabilities": { … } add  "printer": true  (mind the comma).' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'intellij', route: `/project/gorth/file/${RECEIPT_TEST}`, target: `intellij.treeNode:${RECEIPT_TEST}`, action: 'click' }],
      factIds: ['F132', 'F011', 'F060'],
      // Jenkins builds from gorth's protected main, so the local edit alone never reaches the M08.09 build
      // (it would keep failing PRINTER_NOT_AVAILABLE on the printerless Flux Pocket). Pull requests are
      // taught in M09/M13; here {{devin}} lands the reviewed change (the dropped-capability commit is undone).
      onComplete: [
        clearFaults('gorth.capabilityDropped'),
        say('devin', "That's the fix. main is protected, so I've taken your change through review and merged it: the next build reads the printer capability."),
      ],
    },
    {
      id: 'M08.06',
      kind: 'computer-task',
      hud: 'Find the hardcoded capabilities in the UI Automator pipeline',
      app: 'jenkins',
      route: jobRoute(JOB.regressionFlux, 'configure'),
      success: c.appAction('jenkins', 'jenkins.script.lineClicked', (d) => typeof d.text === 'string' && d.text.includes('def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]')),
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlux, 'configure'), target: 'jenkins.scriptEditor', action: 'click' }],
      factIds: ['F134'],
    },
    {
      id: 'M08.07',
      kind: 'computer-task',
      hud: "Open Merchant Config and find GO-SDK-US-01's API Key",
      app: 'orka',
      route: '/merchant-config',
      success: c.appAction('orka', 'orka.merchant.editOpened', (d) => d.name === 'GO-SDK-US-01'),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'The table is truncated. The full form is behind Edit.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Click Edit on the GO-SDK-US-01 row.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orka', route: '/merchant-config', target: 'orka.merchants.rowEdit:GO-SDK-US-01', action: 'click' }],
      factIds: ['F136', 'F137'],
    },
    {
      id: 'M08.08',
      kind: 'dialogue',
      speaker: 'nate',
      text: 'Table display limits: you always have to click Edit to see every field. I added App ID, App Secret and API Key so pipelines can export them as runtime environment variables for the Go SDK.',
      factIds: ['F137', 'F138', 'F139'],
    },
    {
      id: 'M08.09',
      kind: 'computer-task',
      hud: 'Enter the API Key from ticket LAB-2231 and run Java/go-sdk-sale-smoke',
      app: ['orka', 'jenkins'],
      onEnter: [
        {
          do: 'chat',
          author: 'nate',
          channel: 'lab-automation',
          text: `LAB-2231 · GO-SDK-US-01 has a blank API Key, so Java/go-sdk-sale-smoke can't export API_KEY. Value: ${API_KEY}`,
        },
      ],
      success: c.all(c.eq(p.merchant('GO-SDK-US-01').apiKey, API_KEY), c.sequence(queued(JOB.goSdkSmoke), finished(JOB.goSdkSmoke, 'SUCCESS'))),
      objectives: [
        { id: 'M08.09.key', text: `Merchant Config → Edit → API Key = ${API_KEY}`, done: c.eq(p.merchant('GO-SDK-US-01').apiKey, API_KEY) },
        { id: 'M08.09.build', text: 'Build Java/go-sdk-sale-smoke: APP_ID, APP_SECRET, API_KEY exported, build green', done: c.sequence(queued(JOB.goSdkSmoke), finished(JOB.goSdkSmoke, 'SUCCESS')) },
      ],
      showMe: [{ app: 'orka', target: 'orka.merchant.field:apiKey', action: 'type', text: API_KEY }],
      factIds: ['F139', 'F138'],
    },
    {
      id: 'M08.10',
      kind: 'dialogue',
      speaker: 'devin',
      text: "Merchant swaps are Lazo's job. Lazo Automation is our provisioning framework: a zero-touch out-of-box-experience routine. It de-provisions the device, wipes local caches, walks the setup wizard, and can swap merchants mid-suite. Merchant Config feeds it.",
      factIds: ['F046', 'F047', 'F140'],
    },
    {
      id: 'M08.11',
      kind: 'computer-task',
      hud: 'Swap DATA to merchant AUTO-US-NOPIN-02 with Lazo',
      app: 'jenkins',
      route: jobRoute(JOB.lazoSwap, 'build'),
      success: c.happened(queued(JOB.lazoSwap, { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' })),
      wrongActions: [
        {
          id: 'wrong-merchant',
          on: on('jenkins.buildQueued', { jobId: JOB.lazoSwap }, (pl) => pl.params.ROBOT_NAME !== 'data' || pl.params.MERCHANT !== 'AUTO-US-NOPIN-02'),
          say: 'Check the parameters: ROBOT_NAME=data, MERCHANT=AUTO-US-NOPIN-02.',
          speaker: 'devin',
        },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.lazoSwap, 'build'), target: 'jenkins.param:MERCHANT', action: 'type', text: 'AUTO-US-NOPIN-02' }],
      factIds: ['F046', 'F051'],
    },
    {
      id: 'M08.12',
      kind: 'inspect',
      hud: 'Watch DATA go through the setup wizard',
      prop: 'prop.data.device',
      dwellS: 2,
      callouts: ['ubo: routing merchant switch → AUTO-US-NOPIN-02', 'lazo: de-provision · wipe caches', 'lazo: setup wizard 1/6…6/6', 'lazo: merchant active'],
      factIds: ['F047', 'F051'],
    },
    {
      id: 'M08.12a',
      kind: 'wait-for-condition',
      hud: 'Wait for the Lazo build to go green',
      success: c.happened(finished(JOB.lazoSwap, 'SUCCESS'), { scope: 'activity' }),
      timeoutS: 240,
      onComplete: [{ do: 'say', speaker: 'devin', text: 'New merchant, zero hands on the device. Ubo routed the switch, Lazo did the rest.' }],
      factIds: ['F047', 'F140', 'F051'],
    },
    { id: 'M08.13', kind: 'quiz-checkpoint', checkpointId: 'CP-M08.1', title: 'Capabilities & Merchants', questionIds: ['Q144', 'Q145', 'Q146', 'Q151', 'Q153', 'Q158'] },
  ],
};
