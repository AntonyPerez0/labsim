/**
 * Jenkins seed (Sim §2.13): folders = the legacy platform split (`Java/`, `iOS/`), views, the job table
 * with parameter definitions, saved parameters, Jenkinsfiles and next build numbers. Seeded build history
 * is produced by `src/sim/devops/jenkins/history.ts` with the live console formatter.
 */
import type { CapabilityLookup, JenkinsJob, JobParam, RepoId, RunnerKind } from '../types';

export const JENKINS_URL = 'http://jenkins.lab.local:8080';

export const JENKINS_VIEWS: Record<string, { name: string; include: string }> = {
  All: { name: 'All', include: '.*' },
  Java: { name: 'Java', include: '^Java/' },
  iOS: { name: 'iOS', include: '^iOS/' },
  'uia-remote': { name: 'uia-remote', include: 'uia-remote-|contact-canada|paycore-standalone' },
  'SDK-Go': { name: 'SDK-Go', include: 'go-sdk' },
  'Pigeon-LSTR': { name: 'Pigeon-LSTR', include: '/pigeon-' },
  Laz: { name: 'Laz', include: 'laz-' },
  'Vision-PoC': { name: 'Vision-PoC', include: 'vision-poc' },
};

const PARAM_DESC: Record<string, string> = {
  ROBOT_NAME: 'Exact Orca robot Name (lowercase). Blank = any matching Available robot.',
  DEVICE_TYPE: 'Orca DeviceType enum value, ALL CAPS (e.g. FLEX_3). Blank = any.',
  MERCHANT: 'Merchant Config name',
  CARD_PROFILE: 'Card profile name(s), comma separated',
  BACKEND_ENV: 'Backend environment (DEV1, DEV2, STG, QA, INT)',
  BRANCH: 'Git branch',
};
const param = (name: string, def = ''): JobParam => ({ name, type: 'string', default: def, description: PARAM_DESC[name] ?? '' });

/** The job a seeded row describes (Sim §2.13 table). */
export interface JobSeed {
  id: string;
  description: string;
  runner: RunnerKind;
  platform: JenkinsJob['platform'];
  params: string[];
  saved: Record<string, string>;
  /** Jenkinsfile capability line(s) (raw script text lines). */
  capLines: string[];
  lookup: CapabilityLookup;
  testRef: { repo: RepoId; path: string } | null;
  /** uia-remote test classes (run in order). */
  tests?: string[];
  nextNumber: number;
  merchantPolicy: JenkinsJob['merchantPolicy'];
  schedule?: string;
  /** Robots of the seeded history (round-robin), or [] for robot-less jobs. */
  historyRobots: string[];
  /** Game-clock stamp of the newest seeded build ("YYYY-MM-DD HH:MM"); default today 07:xx. */
  lastRun?: string;
  /** PL2-style BACKEND_ENV alternation for history. */
  historyEnvs?: string[];
}

const COMMON = ['ROBOT_NAME', 'DEVICE_TYPE', 'MERCHANT', 'CARD_PROFILE', 'BACKEND_ENV', 'BRANCH'];
const UIA = (cls: string): { repo: RepoId; path: string } => ({ repo: 'uia-remote', path: `app/src/androidTest/java/com/labsim/uia/testactions/${cls}.java` });

export const JOB_SEEDS: JobSeed[] = [
  {
    id: 'Java/uia-remote-regression-flex',
    description: 'uia-remote regression on Flex touch robots (FLEX_3 / FLEX_4). Non-dynamic capabilities in the script.',
    runner: 'uia-remote',
    platform: 'android',
    params: COMMON,
    saved: { ROBOT_NAME: '', DEVICE_TYPE: 'FLEX_3', MERCHANT: 'AUTO-US-NOPIN-01', CARD_PROFILE: 'VISA_STD_SWIPE', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]'],
    lookup: 'NON_DYNAMIC',
    testRef: UIA('HomeScreenTest'),
    tests: ['HomeScreenTest', 'SaleTest'],
    nextNumber: 4120,
    merchantPolicy: 'swap',
    historyRobots: ['wall-e', 'eve'],
  },
  {
    id: 'Java/uia-remote-regression-mini',
    description: 'uia-remote regression on Mini touch robots.',
    runner: 'uia-remote',
    platform: 'android',
    params: COMMON,
    saved: { ROBOT_NAME: '', DEVICE_TYPE: 'MINI_3', MERCHANT: 'AUTO-US-NOPIN-01', CARD_PROFILE: 'VISA_STD_SWIPE', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [deviceType: params.DEVICE_TYPE, physicalTouch: true]'],
    lookup: 'NON_DYNAMIC',
    testRef: UIA('HomeScreenTest'),
    tests: ['HomeScreenTest', 'SaleTest'],
    nextNumber: 2210,
    merchantPolicy: 'swap',
    historyRobots: ['bumblebee'],
  },
  {
    id: 'Java/uia-remote-tethered-tax',
    description: 'Tethered MFD/CFD Tax test (TaxTest, then RefundTest). Tethered = MFD populated in Orca.',
    runner: 'uia-remote',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'CARD_PROFILE', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: '', MERCHANT: 'AUTO-US-NOPIN-01', CARD_PROFILE: 'VISA_STD_SWIPE', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [tethered: true, duo: false]'],
    lookup: 'NON_DYNAMIC',
    testRef: UIA('TaxTest'),
    tests: ['TaxTest', 'RefundTest'],
    nextNumber: 1830,
    merchantPolicy: 'swap',
    historyRobots: ['megatron', 'optimus'],
    historyEnvs: ['DEV1', 'STG'],
  },
  {
    id: 'Java/uia-remote-duo-cfd',
    description: 'Station Duo customer display suite (legacy OCR checks being migrated to UIA 2.3).',
    runner: 'uia-remote',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: '', MERCHANT: 'AUTO-US-NOPIN-01', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ["def capabilities = [deviceType: 'STATION_DUO', tethered: true]"],
    lookup: 'NON_DYNAMIC',
    testRef: UIA('DuoCfdSuite'),
    tests: ['DuoCfdSuite', 'DuoCheckoutTest'],
    nextNumber: 640,
    merchantPolicy: 'swap',
    historyRobots: ['r2-d2'],
  },
  {
    id: 'Java/uia-remote-printerless-smoke',
    description: 'Smoke sale on printerless devices (Station Duo 2 / its Mini 3 hot-swap).',
    runner: 'uia-remote',
    platform: 'android',
    params: ['ROBOT_NAME', 'DEVICE_TYPE', 'MERCHANT', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: '', DEVICE_TYPE: 'STATION_DUO_2', MERCHANT: '', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [deviceType: params.DEVICE_TYPE]'],
    lookup: 'NON_DYNAMIC',
    testRef: UIA('PrinterlessSmokeTest'),
    tests: ['PrinterlessSmokeTest'],
    nextNumber: 310,
    merchantPolicy: 'swap',
    historyRobots: ['k-9'],
  },
  {
    id: 'Java/pigeon-android-sale-swipe',
    description: 'Pigeon LSTR Android: swipe sale with printed receipt.',
    runner: 'pigeon',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: '', MERCHANT: '', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [physicalTouch: true, printer: true, tethered: false]'],
    lookup: 'NON_DYNAMIC',
    testRef: { repo: 'pigeon', path: 'tests/sale/swipe_sale_print.json' },
    nextNumber: 5402,
    merchantPolicy: 'swap',
    historyRobots: ['wall-e', 'eve', 'bumblebee', 'johnny-5', 'baymax'],
  },
  {
    id: 'Java/pigeon-android-tip-sale',
    description: 'Pigeon LSTR Android: swipe sale with an 18% tip and printed receipt (4-option rig).',
    runner: 'pigeon',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: 'johnny-5', MERCHANT: '', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [physicalTouch: true, printer: true, tethered: false]'],
    lookup: 'NON_DYNAMIC',
    testRef: { repo: 'pigeon', path: 'tests/sale/tip_sale_print.json' },
    nextNumber: 880,
    merchantPolicy: 'swap',
    historyRobots: ['johnny-5'],
  },
  {
    id: 'Java/pigeon-android-payment-compare',
    description: 'Pigeon LSTR Android: "Payment Successful" screen compare (GIMP coordinates).',
    runner: 'pigeon',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: 'eve', MERCHANT: '', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [physicalTouch: true]'],
    lookup: 'NON_DYNAMIC',
    testRef: { repo: 'pigeon', path: 'tests/sale/payment_success_compare.json' },
    nextNumber: 45,
    merchantPolicy: 'swap',
    historyRobots: ['eve'],
  },
  {
    id: 'Java/pigeon-windows-tender',
    description: 'Pigeon LSTR Windows: cash tender on the Windows POS (no robot).',
    runner: 'pigeon',
    platform: 'windows',
    params: ['BACKEND_ENV', 'BRANCH'],
    saved: { BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: [],
    lookup: 'NON_DYNAMIC',
    testRef: { repo: 'pigeon', path: 'tests/tender/windows_tender.json' },
    nextNumber: 212,
    merchantPolicy: 'none',
    historyRobots: [],
    lastRun: '2026-10-05 02:07',
  },
  {
    id: 'Java/go-sdk-sale-smoke',
    description: 'Go SDK smoke: sale + printed receipt on an ADB bot. Dynamic JSON capabilities from the test definition (gort).',
    runner: 'go-sdk',
    platform: 'go',
    params: ['ROBOT_NAME', 'MERCHANT', 'CARD_PROFILE', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: '', MERCHANT: 'GO-SDK-US-01', CARD_PROFILE: 'VISA_STD_DIP', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ["def capabilities = readJSON(file: 'go-sdk/tests/sale_receipt.json').capabilities"],
    lookup: 'DYNAMIC_JSON',
    testRef: { repo: 'gort', path: 'go-sdk/tests/sale_receipt.json' },
    nextNumber: 1290,
    merchantPolicy: 'swap',
    historyRobots: ['data', 'tars'],
  },
  {
    id: 'Java/contact-canada-pin-sale',
    description: 'Contact Canada (Westers): Interac PIN sale on a Compact touch robot. Uses BOTH capability lookups.',
    runner: 'uia-remote',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'CARD_PROFILE', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: '', MERCHANT: 'WESTERS-CA-01', CARD_PROFILE: 'INTERAC_CA_DIP', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ["def capabilities = [deviceType: 'COMPACT', physicalTouch: true]", "def dynamicCaps = readJSON(file: 'suites/contact-canada/pin_sale.json').capabilities"],
    lookup: 'BOTH',
    testRef: UIA('ContactCanadaPinSaleTest'),
    tests: ['ContactCanadaPinSaleTest'],
    nextNumber: 733,
    merchantPolicy: 'swap',
    historyRobots: ['seti'],
  },
  {
    id: 'Java/laz-oobe-merchant-swap',
    description: 'Laz Automation: zero-touch OOBE merchant switch (de-provision, wipe caches, setup wizard, assign merchant). Named robots only.',
    runner: 'laz',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'BACKEND_ENV'],
    saved: { ROBOT_NAME: '', MERCHANT: '', BACKEND_ENV: 'DEV1' },
    capLines: [],
    lookup: 'NON_DYNAMIC',
    testRef: null,
    nextNumber: 512,
    merchantPolicy: 'none',
    historyRobots: ['data'],
  },
  {
    id: 'Java/paycore-standalone-matrix',
    description: "PayCore's back-to-back card matrix on ROSIE (Unavailable — named only). Asserts the merchant, never swaps it.",
    runner: 'uia-remote',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'CARD_PROFILE', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: 'rosie', MERCHANT: 'PAYCORE-STANDALONE-01', CARD_PROFILE: 'VISA_STD_DIP,DISCOVER_MATRIX_DIP,AMEX_MATRIX_DIP', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ["def capabilities = [deviceType: 'FLEX_POCKET', physicalTouch: true]"],
    lookup: 'NON_DYNAMIC',
    testRef: UIA('PaycoreMatrixTest'),
    tests: ['PaycoreMatrixTest'],
    nextNumber: 2077,
    merchantPolicy: 'assert',
    historyRobots: ['rosie'],
  },
  {
    id: 'Java/vision-poc-receipt-check',
    description: 'PoC: Ollama vision model (llava) checks the printed receipt layout and tip math from a webcam snapshot. UNSTABLE on FAIL — not a release gate.',
    runner: 'vision',
    platform: 'android',
    params: ['ROBOT_NAME', 'MERCHANT', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: 'wall-e', MERCHANT: '', BACKEND_ENV: 'DEV1', BRANCH: 'main' },
    capLines: ['def capabilities = [physicalTouch: true, printer: true]'],
    lookup: 'NON_DYNAMIC',
    testRef: null,
    nextNumber: 96,
    merchantPolicy: 'none',
    historyRobots: ['wall-e'],
  },
  {
    id: 'Java/nightly-java-regression',
    description: 'Nightly trigger (02:00): builds every job in the Java folder. iOS jobs are not triggered.',
    runner: 'uia-remote',
    platform: 'java',
    params: [],
    saved: {},
    capLines: [],
    lookup: 'NON_DYNAMIC',
    testRef: null,
    nextNumber: 61,
    merchantPolicy: 'none',
    schedule: 'H 2 * * *',
    historyRobots: [],
    lastRun: '2026-10-05 02:00',
  },
  {
    id: 'iOS/pigeon-ios-go-sdk-smoke',
    description: 'iOS Go SDK smoke on the phone carriage (ASTRO). iOS Go testing is active.',
    runner: 'ios',
    platform: 'ios',
    params: ['ROBOT_NAME', 'BACKEND_ENV', 'BRANCH'],
    saved: { ROBOT_NAME: 'astro', BACKEND_ENV: 'QA', BRANCH: 'main' },
    capLines: ['def capabilities = [phone: true]'],
    lookup: 'NON_DYNAMIC',
    testRef: { repo: 'pigeon', path: 'tests/go/ios_go_smoke.json' },
    nextNumber: 377,
    merchantPolicy: 'none',
    historyRobots: ['astro'],
    lastRun: '2026-10-05 06:12',
  },
  {
    id: 'iOS/pigeon-ios-lstr-legacy',
    description: 'Legacy LSTR iOS runner (rarely touched).',
    runner: 'ios',
    platform: 'ios',
    params: ['BACKEND_ENV', 'BRANCH'],
    saved: { BACKEND_ENV: 'QA', BRANCH: 'main' },
    capLines: [],
    lookup: 'NON_DYNAMIC',
    testRef: { repo: 'pigeon', path: 'tests/ios/legacy_smoke.json' },
    nextNumber: 19,
    merchantPolicy: 'none',
    historyRobots: [],
    lastRun: '2026-03-02 14:30',
  },
];

/** Jobs that only trigger other jobs (`build job:` lines). */
export const TRIGGER_JOBS = new Set(['Java/nightly-java-regression']);

const REPO_URL: Record<RepoId, string> = {
  gort: 'git@github.com:labsim-lab/gort.git',
  'uia-remote': 'git@github.com:labsim-lab/uia-remote.git',
  pigeon: 'git@github.com:labsim-lab/pigeon.git',
  orchestrator: 'git@github.com:labsim-lab/orchestrator.git',
};

/** Jenkinsfile text for a job (Sim §2.13 example shape). */
export function jenkinsfile(s: JobSeed): string {
  const L: string[] = [`// ${s.id} — Jenkinsfile`];
  for (const c of s.capLines) L.push(c);
  if (s.tests) L.push(`def tests = [${s.tests.map((t) => `'${t}'`).join(', ')}]`);
  if (s.runner === 'pigeon' || s.runner === 'ios') L.push(`def testFile = '${s.testRef?.path ?? 'tests/ios/legacy_smoke.json'}'`);
  L.push('');
  if (TRIGGER_JOBS.has(s.id)) {
    L.push(
      'pipeline {',
      "  agent { label 'lab-executor' }",
      "  triggers { cron('H 2 * * *') }",
      '  stages {',
      "    stage('Trigger Java jobs') {",
      '      steps {',
      '        script {',
      "          jenkins.jobs('Java').findAll { it.name != 'nightly-java-regression' }.each { build job: it.fullName, wait: false }",
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
    );
    return `${L.join('\n')}\n`;
  }
  const repo = s.testRef?.repo ?? (s.runner === 'go-sdk' ? 'gort' : 'uia-remote');
  const hasRobot = s.historyRobots.length > 0 || s.capLines.some((c) => c.includes('capabilities'));
  L.push('pipeline {', "  agent { label 'lab-executor' }", '  stages {');
  if (s.runner !== 'laz') L.push(`    stage('Checkout SCM')      { steps { git url: '${REPO_URL[repo]}', branch: params.BRANCH } }`);
  if (hasRobot) {
    const caps = s.capLines.length ? ', capabilities: capabilities' : '';
    const dyn = s.capLines.some((c) => c.startsWith('def dynamicCaps')) ? ', dynamicCapabilities: dynamicCaps' : '';
    L.push(`    stage('Checkout robot')    { steps { script { robot = orca.checkout(name: params.ROBOT_NAME, env: params.BACKEND_ENV${caps}${dyn}) } } }`);
  }
  if (s.runner === 'laz') {
    L.push("    stage('Laz OOBE')          { steps { script { laz.swapMerchant(robot, params.MERCHANT) } } }");
  } else {
    if (hasRobot && s.merchantPolicy !== 'none') L.push(`    stage('Merchant')          { steps { script { orca.${s.merchantPolicy === 'assert' ? 'assertMerchant' : 'ensureMerchant'}(robot, params.MERCHANT) } } }`);
    if (hasRobot) L.push("    stage('Inject environment'){ steps { script { env.putAll(orca.runtimeEnv(robot, params)) } } }");
    const run =
      s.runner === 'uia-remote'
        ? "sh \"./gradlew connectedAndroidTest -Pclasses=${tests.join(',')}\""
        : s.runner === 'pigeon'
          ? `sh "lstr run --platform ${s.platform.toUpperCase()} \${testFile}"`
          : s.runner === 'go-sdk'
            ? "sh 'go run ./go-sdk/cmd/gosdk-run go-sdk/tests/sale_receipt.json'"
            : s.runner === 'vision'
              ? "sh './vision/receipt_check.sh --model llava:latest --ollama http://10.42.1.12:11434'"
              : 'sh "lstr run --platform IOS ${testFile}"';
    L.push(`    stage('Run tests')         { steps { ${run} } }`);
  }
  L.push('  }');
  if (hasRobot) L.push('  post { always { script { orca.release(robot) } } }');
  L.push('}');
  return `${L.join('\n')}\n`;
}

/** Build the factory JenkinsJob records (history added separately). */
export function seedJenkinsJobs(nextScheduled: (schedule: string) => number | null): Record<string, JenkinsJob> {
  const out: Record<string, JenkinsJob> = {};
  for (const s of JOB_SEEDS) {
    const [folder, name] = s.id.split('/') as [string, string];
    const views = Object.values(JENKINS_VIEWS)
      .filter((v) => new RegExp(v.include).test(s.id))
      .map((v) => v.name);
    out[s.id] = {
      id: s.id,
      folder,
      name,
      description: s.description,
      runner: s.runner,
      platform: s.platform,
      params: s.params.map((p) => param(p, p === 'BACKEND_ENV' ? 'DEV1' : p === 'BRANCH' ? 'main' : '')),
      capabilityLookup: s.lookup,
      requiredCapabilities: [],
      testRef: s.testRef,
      schedule: s.schedule ?? null,
      scheduleEveryMs: s.schedule ? 86_400_000 : null,
      nextScheduledMs: s.schedule ? nextScheduled(s.schedule) : null,
      buildIds: [],
      disabled: false,
      views,
      script: jenkinsfile(s),
      savedParams: { ...s.saved },
      exists: true,
      merchantPolicy: s.merchantPolicy,
    };
  }
  return out;
}
