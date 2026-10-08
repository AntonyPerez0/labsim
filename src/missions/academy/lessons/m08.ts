/**
 * M08 — Capabilities, Merchant Config, Laz & Ubi (Cur §2 M08). Mentor {{david}}, cameo {{tate}}.
 * Setup (`academy:M08`, Sim §4.4.2): Merchant Config `GO-SDK-US-01` has a blank API Key; Gort test
 * definition `go-sdk/tests/sale_receipt.json` lacks its `printer` capability; DATA is on
 * `AUTO-US-NOPIN-01`. Sim deviation (Appendix A.2): the printerless Flex Pocket the Match preview drops
 * in step 5 is VISION (the GO_SDK Flex Pocket), not ROSIE — the lesson text names the device type only.
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { JOB, clearFaults, finished, inject, jobRoute, queued, say } from './helpers';

const RECEIPT_TEST = 'go-sdk/tests/sale_receipt.json';
const API_KEY = 'key_sim_19c0e2';

export const M08: LessonDef = {
  moduleId: 'M08',
  mentor: 'david',
  setup: { preset: 'academy:M08', spawn: 'loc.coffee', apps: { unlock: ['orca', 'jenkins', 'intellij', 'github', 'chat'] } },
  deck: 'deck.M08',
  realLabChecklist: [
    'Capabilities decide which robot runs your test: SDK frameworks declare them as JSON inside each test definition (dynamic, parsed at runtime); UI Automator suites hardcode them in the pipeline script (non-dynamic).',
    'Contact Canada scripts on the Westers beds use both lookup styles.',
    'Merchant Config hides fields in its table: always click Edit to see App ID, App Secret and API Key, which pipelines export as env vars for the Go SDK.',
    'Merchant swaps are done by Laz Automation (zero-touch OOBE: de-provision, wipe caches, setup wizard, new merchant), with the Ubi Platform routing the switch.',
  ],
  steps: [
    { id: 'M08.01', kind: 'walk-to', hud: '{{david}} is waiting at your desk', location: 'loc.workstation' },
    {
      id: 'M08.02',
      kind: 'dialogue',
      speaker: 'david',
      text: "I'm {{david}}, and I look after the SDK frameworks, including the Terminal SDK. Orca supports Go through custom extensions, and we test it through Pigeon and the mobile runners. Today: how Orca decides which robot runs your test.",
      factIds: ['F008', 'F009', 'F133', 'F131'],
    },
    {
      id: 'M08.03',
      kind: 'computer-task',
      hud: 'Open Robot Capabilities for WALL-E and ROSIE',
      app: 'orca',
      route: '/robot-capability?tab=documents&robot=wall-e',
      success: c.all(
        c.appAction('orca', 'orca.capabilities.viewed', (d) => d.robotName === 'wall-e'),
        c.appAction('orca', 'orca.capabilities.viewed', (d) => d.robotName === 'rosie'),
      ),
      objectives: [
        { id: 'M08.03.walle', text: 'WALL-E: printer true, physicalTouch true', done: c.appAction('orca', 'orca.capabilities.viewed', (d) => d.robotName === 'wall-e') },
        { id: 'M08.03.rosie', text: 'ROSIE: FLEX_POCKET, printer false', done: c.appAction('orca', 'orca.capabilities.viewed', (d) => d.robotName === 'rosie') },
      ],
      showMe: [{ app: 'orca', target: 'orca.capabilities.robotSelect', action: 'select', text: 'rosie' }],
      factIds: ['F131', 'F011'],
    },
    {
      id: 'M08.04',
      kind: 'dialogue',
      speaker: 'david',
      text: 'Two ways to ask for capabilities. SDK frameworks use dynamic JSON lookups: the capabilities live as JSON metadata inside each test definition and Orca parses them at runtime. Traditional UI Automator suites use non-dynamic lookups, hardcoded in the pipeline script. The Contact Canada scripts on the Westers beds use both, interchangeably.',
      factIds: ['F132', 'F134', 'F135', 'F011'],
    },
    {
      id: 'M08.05',
      kind: 'computer-task',
      hud: "This Go SDK receipt test needs a printer. Add it to the test's capabilities.",
      app: 'intellij',
      onEnter: [inject({ op: 'repo.clone', params: { repo: 'gort' } }), { do: 'openApp', app: 'intellij', route: `/project/gort/file/${RECEIPT_TEST}` }],
      success: c.all(c.eq(p.gitFile('gort', RECEIPT_TEST, 'local').parsesJson, true), c.eq(p.gitFile('gort', RECEIPT_TEST, 'local').json('/capabilities/printer'), true)),
      objectives: [
        { id: 'M08.05.edit', text: 'Add "printer": true to the "capabilities" object and save', done: c.eq(p.gitFile('gort', RECEIPT_TEST, 'local').json('/capabilities/printer'), true) },
        { id: 'M08.05.valid', text: 'The JSON still parses', done: c.eq(p.gitFile('gort', RECEIPT_TEST, 'local').parsesJson, true) },
        {
          id: 'M08.05.preview',
          text: 'Optional: run Match preview in Orca and see the printerless Flex Pocket drop out',
          optional: true,
          done: c.appAction('orca', 'orca.matchPreview.ran', (d) => typeof d.capabilities === 'string' && d.capabilities.includes('"printer"')),
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Open go-sdk/tests/sale_receipt.json in the gort project.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Inside "capabilities": { … } add  "printer": true  (mind the comma).' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'intellij', route: `/project/gort/file/${RECEIPT_TEST}`, target: `intellij.treeNode:${RECEIPT_TEST}`, action: 'click' }],
      factIds: ['F132', 'F011', 'F060'],
      // Jenkins builds from gort's protected main, so the local edit alone never reaches the M08.09 build
      // (it would keep failing PRINTER_NOT_AVAILABLE on the printerless Flex Pocket). Pull requests are
      // taught in M09/M13; here {{david}} lands the reviewed change (the dropped-capability commit is undone).
      onComplete: [
        clearFaults('gort.capabilityDropped'),
        say('david', "That's the fix. main is protected, so I've taken your change through review and merged it: the next build reads the printer capability."),
      ],
    },
    {
      id: 'M08.06',
      kind: 'computer-task',
      hud: 'Find the hardcoded capabilities in the UI Automator pipeline',
      app: 'jenkins',
      route: jobRoute(JOB.regressionFlex, 'configure'),
      success: c.appAction('jenkins', 'jenkins.script.lineClicked', (d) => typeof d.text === 'string' && d.text.includes('def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]')),
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlex, 'configure'), target: 'jenkins.scriptEditor', action: 'click' }],
      factIds: ['F134'],
    },
    {
      id: 'M08.07',
      kind: 'computer-task',
      hud: "Open Merchant Config and find GO-SDK-US-01's API Key",
      app: 'orca',
      route: '/merchant-config',
      success: c.appAction('orca', 'orca.merchant.editOpened', (d) => d.name === 'GO-SDK-US-01'),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'The table is truncated. The full form is behind Edit.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Click Edit on the GO-SDK-US-01 row.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orca', route: '/merchant-config', target: 'orca.merchants.rowEdit:GO-SDK-US-01', action: 'click' }],
      factIds: ['F136', 'F137'],
    },
    {
      id: 'M08.08',
      kind: 'dialogue',
      speaker: 'tate',
      text: 'Table display limits: you always have to click Edit to see every field. I added App ID, App Secret and API Key so pipelines can export them as runtime environment variables for the Go SDK.',
      factIds: ['F137', 'F138', 'F139'],
    },
    {
      id: 'M08.09',
      kind: 'computer-task',
      hud: 'Enter the API Key from ticket LAB-2231 and run Java/go-sdk-sale-smoke',
      app: ['orca', 'jenkins'],
      onEnter: [
        {
          do: 'chat',
          author: 'tate',
          channel: 'lab-automation',
          text: `LAB-2231 · GO-SDK-US-01 has a blank API Key, so Java/go-sdk-sale-smoke can't export API_KEY. Value: ${API_KEY}`,
        },
      ],
      success: c.all(c.eq(p.merchant('GO-SDK-US-01').apiKey, API_KEY), c.sequence(queued(JOB.goSdkSmoke), finished(JOB.goSdkSmoke, 'SUCCESS'))),
      objectives: [
        { id: 'M08.09.key', text: `Merchant Config → Edit → API Key = ${API_KEY}`, done: c.eq(p.merchant('GO-SDK-US-01').apiKey, API_KEY) },
        { id: 'M08.09.build', text: 'Build Java/go-sdk-sale-smoke: APP_ID, APP_SECRET, API_KEY exported, build green', done: c.sequence(queued(JOB.goSdkSmoke), finished(JOB.goSdkSmoke, 'SUCCESS')) },
      ],
      showMe: [{ app: 'orca', target: 'orca.merchant.field:apiKey', action: 'type', text: API_KEY }],
      factIds: ['F139', 'F138'],
    },
    {
      id: 'M08.10',
      kind: 'dialogue',
      speaker: 'david',
      text: "Merchant swaps are Laz's job. Laz Automation is our provisioning framework: a zero-touch out-of-box-experience routine. It de-provisions the device, wipes local caches, walks the setup wizard, and can swap merchants mid-suite. Merchant Config feeds it.",
      factIds: ['F046', 'F047', 'F140'],
    },
    {
      id: 'M08.11',
      kind: 'computer-task',
      hud: 'Swap DATA to merchant AUTO-US-NOPIN-02 with Laz',
      app: 'jenkins',
      route: jobRoute(JOB.lazSwap, 'build'),
      success: c.happened(queued(JOB.lazSwap, { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' })),
      wrongActions: [
        {
          id: 'wrong-merchant',
          on: on('jenkins.buildQueued', { jobId: JOB.lazSwap }, (pl) => pl.params.ROBOT_NAME !== 'data' || pl.params.MERCHANT !== 'AUTO-US-NOPIN-02'),
          say: 'Check the parameters: ROBOT_NAME=data, MERCHANT=AUTO-US-NOPIN-02.',
          speaker: 'david',
        },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.lazSwap, 'build'), target: 'jenkins.param:MERCHANT', action: 'type', text: 'AUTO-US-NOPIN-02' }],
      factIds: ['F046', 'F051'],
    },
    {
      id: 'M08.12',
      kind: 'inspect',
      hud: 'Watch DATA go through the setup wizard',
      prop: 'prop.data.device',
      dwellS: 2,
      callouts: ['ubi: routing merchant switch → AUTO-US-NOPIN-02', 'laz: de-provision · wipe caches', 'laz: setup wizard 1/6…6/6', 'laz: merchant active'],
      factIds: ['F047', 'F051'],
    },
    {
      id: 'M08.12a',
      kind: 'wait-for-condition',
      hud: 'Wait for the Laz build to go green',
      success: c.happened(finished(JOB.lazSwap, 'SUCCESS'), { scope: 'activity' }),
      timeoutS: 240,
      onComplete: [{ do: 'say', speaker: 'david', text: 'New merchant, zero hands on the device. Ubi routed the switch, Laz did the rest.' }],
      factIds: ['F047', 'F140', 'F051'],
    },
    { id: 'M08.13', kind: 'quiz-checkpoint', checkpointId: 'CP-M08.1', title: 'Capabilities & Merchants', questionIds: ['Q144', 'Q145', 'Q146', 'Q151', 'Q153', 'Q158'] },
  ],
};
