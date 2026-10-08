/**
 * Devops fault rows (Sim §4.3.8 repositories, §4.3.9 workstation configuration, §4.3.10 Jenkins) and the
 * devops setup ops (Sim §4.4.1). Edit-style faults go through the same code paths a real edit uses: a
 * commit on the default branch, a config.properties write, a Jenkins job-configuration change (§4.1.8).
 */
import type { TxContext } from '@/core/store';
import type { ActiveFault, FaultParamValue, LabState, RepoId } from '../types';
import { DEVICE_TYPE_CODES } from '../types';
import type { FaultInfo, FaultParamInfo, Result, SetupOpInfo } from '../api';
import { UIA_PATHS } from '../seed/repos/uiaRemote';
import { REGISTER_HOME_SCREEN_STUB } from '../seed/repos/uiaRemote';
import { core } from './coreRef';
import type { FaultDef, SetupOpDef } from './index';
import { hasIsScreenPresent, hasTeardown, hasWaitForScreen, methodBody, openDirection, screenSync } from './codefacts';
import { keyMatchesTarget } from './config';
import { afterMainMoved, clone as gitClone, commitRemote, isRepoId, mirrorConfig } from './git';
import { treeAt } from './gitCore';
import { reopenPr, seedPr, unmergePr } from './github';
import { parseStrictJson } from './json';
import { resolveFixture } from './fixtures';
import { queueBuild } from './jenkins/engine';
import { moveJob, saveJob } from './jenkins/jobs';
import { synthBuild } from './jenkins/history';
import { parseScript } from './jenkins/script';
import { runLocal } from './local';
import { seedReceipt } from './ollama';
import { parseProperties, setProperty, tildify } from './util';

type Rec = (path: (string | number)[], before: unknown, after: unknown) => void;
type P = Record<string, FaultParamValue>;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: string): Result<T> => ({ ok: false, error });

const param = (name: string, kind: FaultParamInfo['kind'], description: string, example: string, o: Partial<FaultParamInfo> = {}): FaultParamInfo => ({ name, kind, description, example, required: false, target: false, ...o });

function info(id: string, title: string, category: FaultInfo['category'], params: FaultParamInfo[], o: Partial<FaultInfo>): FaultInfo {
  return { id, title, description: o.description ?? title, category, owner: 'devops', params, tags: o.tags ?? [], clears: o.clears ?? '', symptoms: o.symptoms ?? [], usedBy: o.usedBy ?? [], injectable: o.injectable ?? true, holdMs: o.holdMs ?? 0, apiOnly: o.apiOnly ?? false };
}

const s = (p: P, k: string, d = ''): string => (p[k] === undefined || p[k] === null ? d : String(p[k]));

/* ── commit-style helper (Sim §4.1.8) ── */
function commitFault(lab: LabState, record: Rec, repoId: RepoId, changes: Record<string, string | null>, by: string, message: string): string {
  const repo = lab.repos[repoId];
  const before = repo.branches[repo.defaultBranch]!;
  const beforeFiles: Record<string, string | null> = {};
  for (const p of Object.keys(changes)) beforeFiles[p] = repo.files[p] ?? null;
  const sha = commitRemote(lab, repoId, repo.defaultBranch, changes, message, by);
  afterMainMoved(lab, repoId, before, sha);
  record(['repos', repoId, 'branches', repo.defaultBranch], before, sha);
  for (const p of Object.keys(changes)) record(['repos', repoId, 'files', p], beforeFiles[p], changes[p]);
  return sha;
}
const mainFile = (lab: LabState, repo: RepoId, path: string): string | undefined => lab.repos[repo]?.files[path];

/** Original text recorded by a commit-style fault (undo `before` of the file path). */
function undoBefore(f: ActiveFault, path: (string | number)[]): unknown {
  const u = f.undo.find((x) => JSON.stringify(x.path) === JSON.stringify(path));
  return u?.before;
}

function actionsOf(text: string | undefined | null): string[] | null {
  if (!text) return null;
  const r = parseStrictJson(text);
  if (!r.ok) return null;
  const a = (r.value as { actions?: { action?: string }[] }).actions;
  return Array.isArray(a) ? a.map((x) => String(x.action ?? '')) : [];
}

/* ── config.properties locations (local clone / Code With Me) ── */
const LOCAL_CFG = '~/IdeaProjects/uia-remote/config.properties';
function cfgRead(lab: LabState, path: string): string | null {
  const p = tildify(path);
  const local = lab.repos['uia-remote'].local;
  if (local && (p === `${local.path}/config.properties` || p === LOCAL_CFG)) return local.files['config.properties'] ?? null;
  return lab.workstation.files[p] ?? null;
}
function cfgWrite(lab: LabState, ctx: TxContext, record: Rec, path: string, text: string): void {
  const p = tildify(path);
  const local = lab.repos['uia-remote'].local;
  if (local && (p === `${local.path}/config.properties` || p === LOCAL_CFG)) {
    record(['repos', 'uia-remote', 'local', 'files', 'config.properties'], local.files['config.properties'] ?? null, text);
    local.files['config.properties'] = text;
    mirrorConfig(lab);
    ctx.emit('git.fileEdited', { repo: 'uia-remote', path: 'config.properties' });
    return;
  }
  record(['workstation', 'files', p], lab.workstation.files[p] ?? null, text);
  lab.workstation.files[p] = text;
}
const cfgPathParam = param('path', 'repoPath', 'config.properties to edit (local clone or a Code With Me copy)', LOCAL_CFG, { default: LOCAL_CFG });

/* ────────────────────────────── §4.3.8 Repositories ────────────────────────────── */

const gortCapabilityDropped: FaultDef = {
  info: info('gort.capabilityDropped', 'Test definition lost a capability', 'repos', [
    param('path', 'repoPath', 'gort test definition', 'go-sdk/tests/sale_receipt.json', { default: 'go-sdk/tests/sale_receipt.json', target: true }),
    param('key', 'string', 'capability key to drop', 'printer', { default: 'printer' }),
    param('by', 'string', 'commit author', 'alex', { default: 'alex' }),
    param('message', 'string', 'commit message', 'go-sdk: tidy sale_receipt capabilities', { default: 'go-sdk: tidy sale_receipt capabilities' }),
  ], {
    tags: ['orca.capabilities', 'hw.devices', 'go.sdk'],
    clears: 'the file on main parses and capabilities[key] === true',
    symptoms: ['[orca] checkout → vision (FLEX_POCKET) OK', '[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE', 'Match preview lists vision'],
    usedBy: ['INC23', 'M08'],
  }),
  validate(lab, p) {
    const path = s(p, 'path');
    const text = mainFile(lab, 'gort', path);
    if (text === undefined) return err(`fault gort.capabilityDropped: invalid param path='${path}' (no such repoPath)`);
    const r = parseStrictJson(text);
    const caps = r.ok ? (r.value as { capabilities?: Record<string, unknown> }).capabilities : undefined;
    if (!caps || caps[s(p, 'key')] !== true) return err(`fault gort.capabilityDropped: nothing to break (capability '${s(p, 'key')}' already absent)`);
    return ok({ target: path });
  },
  apply(lab, ctx, p, record) {
    const path = s(p, 'path');
    const key = s(p, 'key');
    const text = mainFile(lab, 'gort', path)!;
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let next = text.replace(new RegExp(`,\\s*"${k}"\\s*:\\s*true`), '');
    if (next === text) next = text.replace(new RegExp(`"${k}"\\s*:\\s*true\\s*,\\s*`), '');
    commitFault(lab, record, 'gort', { [path]: next }, s(p, 'by'), s(p, 'message'));
    void ctx;
  },
  isResolved(lab, f) {
    const text = mainFile(lab, 'gort', String(f.params['path']));
    const r = text ? parseStrictJson(text) : null;
    return !!r?.ok && (r.value as { capabilities?: Record<string, unknown> }).capabilities?.[String(f.params['key'])] === true;
  },
};

function lineEdit(text: string, line: number, ch: string): string | null {
  const lines = text.split('\n');
  const l = lines[line - 1];
  if (l === undefined) return null;
  const i = l.lastIndexOf(ch);
  if (i < 0) return null;
  if (ch === ',' && !l.trimEnd().endsWith(',')) return null;
  lines[line - 1] = l.slice(0, i) + l.slice(i + 1);
  return lines.join('\n');
}

function pigeonEditFault(id: string, ch: ',' | '}', title: string, defLine: number | null, defMsg: string, o: Partial<FaultInfo>): FaultDef {
  return {
    info: info(id, title, 'repos', [
      param('path', 'repoPath', 'Pigeon test file', 'tests/sale/tip_sale_print.json', { required: true, target: true, ...(id === 'pigeon.missingComma' ? { default: 'tests/sale/tip_sale_print.json' } : {}) }),
      param('line', 'number', `line whose last '${ch}' is deleted`, String(defLine ?? 9), defLine ? { default: defLine } : { required: true }),
      param('by', 'string', 'commit author', 'alex', { default: 'alex' }),
      param('message', 'string', 'commit message', defMsg, { default: defMsg }),
    ], o),
    validate(lab, p) {
      const path = s(p, 'path');
      const text = mainFile(lab, 'pigeon', path);
      if (text === undefined) return err(`fault ${id}: invalid param path='${path}' (no such repoPath)`);
      const line = Number(p['line']);
      if (!Number.isFinite(line)) return err(`fault ${id}: invalid param line='${s(p, 'line')}' (not a number)`);
      if (lineEdit(text, line, ch) === null) return err(`fault ${id}: nothing to break (line ${line} has no trailing '${ch}')`);
      return ok({ target: path });
    },
    apply(lab, ctx, p, record) {
      const path = s(p, 'path');
      const next = lineEdit(mainFile(lab, 'pigeon', path)!, Number(p['line']), ch)!;
      commitFault(lab, record, 'pigeon', { [path]: next }, s(p, 'by'), s(p, 'message'));
      void ctx;
    },
    isResolved(lab, f) {
      const path = String(f.params['path']);
      const now = actionsOf(mainFile(lab, 'pigeon', path));
      const before = actionsOf(undoBefore(f, ['repos', 'pigeon', 'files', path]) as string | null);
      return !!now && !!before && JSON.stringify(now) === JSON.stringify(before);
    },
  };
}

const pigeonMissingComma = pigeonEditFault('pigeon.missingComma', ',', 'Missing comma in a Pigeon test', 8, 'Add tip step', {
  tags: ['pigeon.json', 'pigeon.nolint', 'tools.github', 'pigeon.abstraction', 'arch.repos'],
  clears: "the file on main parses (strict JSON) and its actions[].action list equals the list before the fault",
  symptoms: ['LSTR ParseError: Unexpected token { in JSON at line 9 column 5', 'Finished: FAILURE (JSON_PARSE)'],
  usedBy: ['INC25', 'M15'],
});
const pigeonMissingBracket = pigeonEditFault('pigeon.missingBracket', '}', 'Missing closing brace', null, 'Tidy actions', {
  tags: ['pigeon.json', 'pigeon.nolint'],
  clears: 'as pigeon.missingComma',
  symptoms: ['LSTR ParseError: Unexpected token { in JSON at line 10 column 5'],
  usedBy: ['P3-2', 'FP'],
});

const COMPARE_TRUTH = { x: 208, y: 512, w: 304, h: 40 };
const pigeonScreenCompareEmpty: FaultDef = {
  info: info('pigeon.screenCompareEmpty', 'Screen-compare region undefined', 'repos', [
    param('path', 'repoPath', 'Pigeon test with a screenCompare action', 'tests/sale/payment_success_compare.json', { default: 'tests/sale/payment_success_compare.json', target: true }),
    param('by', 'string', 'commit author', 'morgan', { default: 'morgan' }),
    param('message', 'string', 'commit message', 'Scaffold payment success compare', { default: 'Scaffold payment success compare' }),
  ], {
    tags: ['pigeon.gimp', 'pigeon.json', 'adb.usage'],
    clears: 'x, y, w, h each within ±3 px of the APPROVED label (208, 512, 304, 40)',
    symptoms: ['LSTR screenCompare: empty region (0x0)'],
    usedBy: ['INC24'],
  }),
  validate(lab, p) {
    const path = s(p, 'path');
    const text = mainFile(lab, 'pigeon', path);
    if (text === undefined || !/"screenCompare"/.test(text)) return err(`fault pigeon.screenCompareEmpty: invalid param path='${path}' (no such repoPath)`);
    if (/"x"\s*:\s*0\s*,\s*"y"\s*:\s*0\s*,\s*"w"\s*:\s*0\s*,\s*"h"\s*:\s*0/.test(text)) return err('fault pigeon.screenCompareEmpty: nothing to break (region already empty)');
    return ok({ target: path });
  },
  apply(lab, ctx, p, record) {
    const path = s(p, 'path');
    const text = mainFile(lab, 'pigeon', path)!;
    const next = text.replace(/("action":\s*"screenCompare",\s*"params":\s*\{[^}]*)/, (m) => m.replace(/"(x|y|w|h)"\s*:\s*\d+/g, '"$1": 0'));
    commitFault(lab, record, 'pigeon', { [path]: next }, s(p, 'by'), s(p, 'message'));
    void ctx;
  },
  isResolved(lab, f) {
    const text = mainFile(lab, 'pigeon', String(f.params['path']));
    const r = text ? parseStrictJson(text) : null;
    if (!r?.ok) return false;
    const acts = ((r.value as { actions?: { action?: string; params?: Record<string, number> }[] }).actions ?? []).filter((a) => a.action === 'screenCompare');
    return acts.length > 0 && acts.every((a) => (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(Number(a.params?.[k] ?? 0) - COMPARE_TRUTH[k]) <= 3));
  },
};

/* uia-remote code faults */
const poPath = (cls: string): string => UIA_PATHS.po(cls);

function stubWaitForScreen(src: string): string {
  const m = methodBody(src, 'waitForScreen');
  if (!m) return src;
  const start = src.indexOf(m.body);
  let out = `${src.slice(0, start)}\n        // TODO\n    ${src.slice(start + m.body.length)}`;
  out = out.replace(/^\s*waitForScreen\(\);\n/gm, '');
  return out;
}

function removeMethod(src: string, name: string): string {
  const re = new RegExp(`\\n?(?:[ \\t]*/\\*\\*[^]*?\\*/\\s*\\n)?[ \\t]*public\\s+[\\w<>]+\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return src;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  let end = i;
  if (src[end] === '\n') end++;
  return src.slice(0, m.index) + '\n' + src.slice(end).replace(/^\n+/, '');
}

const uiaWaitForScreenStub: FaultDef = {
  info: info('uia.waitForScreenStub', 'Empty waitForScreen()', 'repos', [
    param('class', 'string', 'page-object class', 'RegisterHomeScreen', { default: 'RegisterHomeScreen', target: true }),
    param('by', 'string', 'commit author', 'alex', { default: 'alex' }),
    param('message', 'string', 'commit message', 'RegisterHomeScreen cleanup', { default: 'RegisterHomeScreen cleanup' }),
  ], {
    tags: ['uia.sync', 'uia.pom', 'tools.intellij'],
    clears: 'CF01 holds for the class and CF03 does not',
    symptoms: ['≈55 % of runs: androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order]', 'at com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)'],
    usedBy: ['INC32'],
  }),
  validate(lab, p) {
    const cls = s(p, 'class');
    const src = mainFile(lab, 'uia-remote', poPath(cls));
    if (src === undefined) return err(`fault uia.waitForScreenStub: invalid param class='${cls}' (no such repoPath)`);
    if (!hasWaitForScreen(src)) return err(`fault uia.waitForScreenStub: nothing to break (${cls}.waitForScreen() is already empty)`);
    return ok({ target: cls });
  },
  apply(lab, ctx, p, record) {
    const cls = s(p, 'class');
    const src = mainFile(lab, 'uia-remote', poPath(cls))!;
    const next = cls === 'RegisterHomeScreen' ? REGISTER_HOME_SCREEN_STUB : stubWaitForScreen(src);
    commitFault(lab, record, 'uia-remote', { [poPath(cls)]: next }, s(p, 'by'), s(p, 'message'));
    void ctx;
  },
  isResolved(lab, f) {
    const src = mainFile(lab, 'uia-remote', poPath(String(f.params['class'])));
    if (!src) return false;
    const methods = [...src.matchAll(/public\s+void\s+(\w+)\s*\(\)\s*\{/g)].map((m) => m[1]!).filter((n) => n !== 'waitForScreen');
    return hasWaitForScreen(src) && methods.every((m) => screenSync(src, m).kind === 'wait');
  },
};

function scrollEdit(src: string, mode: string): string {
  const m = methodBody(src, 'open');
  if (!m) return src;
  let body = m.body;
  if (mode === 'horizontal-only') body = body.replace(/scrollVerticallyTo\(/g, 'scrollHorizontallyTo(');
  else body = body.replace(/scrollVerticallyTo\(/g, '\u0000').replace(/scrollHorizontallyTo\(/g, 'scrollVerticallyTo(').replace(/\u0000/g, 'scrollHorizontallyTo(');
  const start = src.indexOf(m.body);
  return src.slice(0, start) + body + src.slice(start + m.body.length);
}
const uiaScrollSwapped: FaultDef = {
  info: info('uia.scrollSwapped', 'open() scrolls the wrong way', 'repos', [
    param('mode', 'string', 'swapped | horizontal-only', 'swapped', { default: 'swapped', values: ['swapped', 'horizontal-only'], target: true }),
    param('by', 'string', 'commit author', 'alex', { default: 'alex' }),
    param('message', 'string', 'commit message', 'HomeScreen: simplify open()', { default: 'HomeScreen: simplify open()' }),
  ], {
    tags: ['uia.scroll', 'uia.pom'],
    clears: 'CF05 = correct',
    symptoms: ['[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)… ×5', "AssertionError: App 'Register' not found on HomeScreen"],
    usedBy: ['M13', 'P3-4'],
  }),
  validate(lab, p) {
    const mode = s(p, 'mode');
    if (!['swapped', 'horizontal-only'].includes(mode)) return err(`fault uia.scrollSwapped: invalid param mode='${mode}' (not one of swapped, horizontal-only)`);
    const src = mainFile(lab, 'uia-remote', poPath('HomeScreen'));
    if (!src || openDirection(src) !== 'correct') return err('fault uia.scrollSwapped: nothing to break (HomeScreen.open() is not correct)');
    return ok({ target: 'HomeScreen' });
  },
  apply(lab, ctx, p, record) {
    const src = mainFile(lab, 'uia-remote', poPath('HomeScreen'))!;
    commitFault(lab, record, 'uia-remote', { [poPath('HomeScreen')]: scrollEdit(src, s(p, 'mode')) }, s(p, 'by'), s(p, 'message'));
    void ctx;
  },
  isResolved(lab) {
    const src = mainFile(lab, 'uia-remote', poPath('HomeScreen'));
    return !!src && openDirection(src) === 'correct';
  },
};

const uiaMissingScreenMethods: FaultDef = {
  info: info('uia.missingScreenMethods', 'Page object without mandatory methods', 'repos', [
    param('class', 'string', 'page-object class', 'ReceiptScreen', { default: 'ReceiptScreen', target: true }),
    param('methods', 'string', 'both | waitForScreen | isScreenPresent', 'both', { default: 'both', values: ['both', 'waitForScreen', 'isScreenPresent'] }),
    param('by', 'string', 'commit author', 'alex', { default: 'alex' }),
    param('message', 'string', 'commit message', 'ReceiptScreen: remove boilerplate', { default: 'ReceiptScreen: remove boilerplate' }),
  ], {
    tags: ['uia.sync', 'uia.pom'],
    clears: 'CF01 and CF04 hold for the class',
    symptoms: ['flaky UiObjectNotFoundException on that screen (CF03 race)', "Morgan: 'Missing mandatory isScreenPresent()'"],
    usedBy: ['M13', 'P3-4'],
  }),
  validate(lab, p) {
    const cls = s(p, 'class');
    const src = mainFile(lab, 'uia-remote', poPath(cls));
    if (src === undefined) return err(`fault uia.missingScreenMethods: invalid param class='${cls}' (no such repoPath)`);
    if (!hasWaitForScreen(src) && !hasIsScreenPresent(src)) return err(`fault uia.missingScreenMethods: nothing to break (${cls} has no mandatory methods)`);
    return ok({ target: cls });
  },
  apply(lab, ctx, p, record) {
    const cls = s(p, 'class');
    let src = mainFile(lab, 'uia-remote', poPath(cls))!;
    const which = s(p, 'methods', 'both');
    if (which !== 'isScreenPresent') {
      src = removeMethod(src, 'waitForScreen');
      src = src.replace(/^\s*waitForScreen\(\);\n/gm, '');
    }
    if (which !== 'waitForScreen') {
      src = removeMethod(src, 'isScreenPresent');
      src = src.replace(/!?\s*isScreenPresent\(\)/g, 'true');
    }
    commitFault(lab, record, 'uia-remote', { [poPath(cls)]: src }, s(p, 'by'), p['message'] === undefined ? `${cls}: remove boilerplate` : s(p, 'message'));
    void ctx;
  },
  isResolved(lab, f) {
    const src = mainFile(lab, 'uia-remote', poPath(String(f.params['class'])));
    return !!src && hasWaitForScreen(src) && hasIsScreenPresent(src);
  },
};

const uiaTeardownMissing: FaultDef = {
  info: info('uia.teardownMissing', 'Test without teardown', 'repos', [
    param('test', 'string', 'test class', 'TaxTest', { default: 'TaxTest', target: true }),
    param('by', 'string', 'commit author', 'alex', { default: 'alex' }),
    param('message', 'string', 'commit message', 'TaxTest: remove unused hook', { default: 'TaxTest: remove unused hook' }),
  ], {
    tags: ['uia.taxtest', 'uia.sync', 'adb.usage'],
    clears: 'CF06 holds for the test',
    symptoms: ['MFD left on register with the paid order', 'next test: AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen'],
    usedBy: ['INC35'],
  }),
  validate(lab, p) {
    const test = s(p, 'test');
    const src = mainFile(lab, 'uia-remote', UIA_PATHS.test(test));
    if (src === undefined) return err(`fault uia.teardownMissing: invalid param test='${test}' (no such repoPath)`);
    if (!hasTeardown(src)) return err(`fault uia.teardownMissing: nothing to break (${test} has no teardown)`);
    return ok({ target: test });
  },
  apply(lab, ctx, p, record) {
    const test = s(p, 'test');
    const src = mainFile(lab, 'uia-remote', UIA_PATHS.test(test))!;
    const next = src.replace(/\n[ \t]*@After\s*\n[ \t]*public\s+void\s+\w+\s*\(\)\s*\{[^}]*\}\n/, '\n');
    commitFault(lab, record, 'uia-remote', { [UIA_PATHS.test(test)]: next }, s(p, 'by'), s(p, 'message'));
    void ctx;
  },
  isResolved(lab, f) {
    const src = mainFile(lab, 'uia-remote', UIA_PATHS.test(String(f.params['test'])));
    return !!src && hasTeardown(src);
  },
};

/* ────────────────────────────── §4.3.9 Workstation configuration ────────────────────────────── */

const configPort5555: FaultDef = {
  info: info('config.port5555', 'ADB default port in config', 'workstation', [{ ...cfgPathParam, target: true }], {
    tags: ['adb.port', 'uia.config', 'adb.usage'],
    clears: "portNumber == '5444' and no workstation.adbConnections entry ends with ':5555'",
    symptoms: ['connect 10.42.30.13:5555 … refused', 'falling back to first known device: 10.42.60.4:5555', "Riley's desk Flex opens Register and adds Tax Item 5"],
    usedBy: ['INC27', 'P3-1'],
  }),
  validate(lab, p) {
    const path = s(p, 'path', LOCAL_CFG);
    const text = cfgRead(lab, path);
    if (text === null) return err(`fault config.port5555: nothing to break (${path} does not exist)`);
    return ok({ target: path });
  },
  apply(lab, ctx, p, record) {
    const path = s(p, 'path', LOCAL_CFG);
    cfgWrite(lab, ctx, record, path, setProperty(cfgRead(lab, path)!, 'portNumber', '5555'));
    const known = lab.workstation.adbConnections.some((c) => c.target === '10.42.60.4:5555');
    if (!known) {
      const before = JSON.parse(JSON.stringify(lab.workstation.adbConnections)) as unknown;
      const r = core().adbConnect(lab, ctx, '10.42.60.4:5555');
      if (!r.ok || !lab.workstation.adbConnections.some((c) => c.target === '10.42.60.4:5555')) {
        lab.workstation.adbServerRunning = true;
        lab.workstation.adbConnections.push({ target: '10.42.60.4:5555', hostId: null, deviceId: 'dev-riley-desk-flex', state: 'device', coworker: true });
      }
      record(['workstation', 'adbConnections'], before, JSON.parse(JSON.stringify(lab.workstation.adbConnections)));
    }
  },
  isResolved(lab, f) {
    const text = cfgRead(lab, String(f.params['path'] ?? LOCAL_CFG));
    return !!text && parseProperties(text).values['portNumber'] === '5444' && !lab.workstation.adbConnections.some((c) => c.target.endsWith(':5555'));
  },
};

const configValue: FaultDef = {
  info: info('config.value', 'One wrong config value', 'workstation', [
    param('key', 'string', 'config.properties key', 'customerFacingDeviceIp', { required: true, target: true }),
    param('value', 'string', 'wrong value', '10.42.30.19', { required: true }),
    cfgPathParam,
  ], {
    tags: ['uia.config', 'orca.tethered', 'uia.scroll'],
    clears: "the key equals the validator target for the file's robotName",
    symptoms: ['[runner] CFD handle 10.42.30.19:5444 → No route to host', "deviceType=Mini on TARS → App 'Register' not found"],
    usedBy: ['INC30', 'INC33'],
  }),
  validate(lab, p) {
    const path = s(p, 'path', LOCAL_CFG);
    if (cfgRead(lab, path) === null) return err(`fault config.value: nothing to break (${path} does not exist)`);
    if (!s(p, 'key')) return err("fault config.value: invalid param key='' (missing)");
    return ok({ target: s(p, 'key') });
  },
  apply(lab, ctx, p, record) {
    const path = s(p, 'path', LOCAL_CFG);
    cfgWrite(lab, ctx, record, path, setProperty(cfgRead(lab, path)!, s(p, 'key'), s(p, 'value')));
  },
  isResolved(lab, f) {
    const text = cfgRead(lab, String(f.params['path'] ?? LOCAL_CFG));
    return !!text && keyMatchesTarget(lab, text, String(f.params['key']));
  },
};

const CWM_ALEX = '~/CodeWithMe/alex/uia-remote/config.properties';
const configThemeKernel: FaultDef = {
  info: info('config.themeKernel', 'Stale wiki values', 'workstation', [{ ...cfgPathParam, default: CWM_ALEX, example: CWM_ALEX, target: true }], {
    tags: ['uia.config'],
    clears: "theme == 'avocado' && kernelType == 'CPA'",
    symptoms: ['java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported', 'Unsupported kernelType "SPA" — use "CPA"'],
    usedBy: ['INC29'],
  }),
  validate(lab, p) {
    const path = s(p, 'path', CWM_ALEX);
    if (cfgRead(lab, path) === null) return err(`fault config.themeKernel: nothing to break (${path} does not exist)`);
    return ok({ target: path });
  },
  apply(lab, ctx, p, record) {
    const path = s(p, 'path', CWM_ALEX);
    cfgWrite(lab, ctx, record, path, setProperty(setProperty(cfgRead(lab, path)!, 'theme', 'classic'), 'kernelType', 'SPA'));
  },
  isResolved(lab, f) {
    const text = cfgRead(lab, String(f.params['path'] ?? CWM_ALEX));
    const v = text ? parseProperties(text).values : {};
    return v['theme'] === 'avocado' && v['kernelType'] === 'CPA';
  },
};

/* ────────────────────────────── §4.3.10 Jenkins ────────────────────────────── */

function jobParam(defJob: string): FaultParamInfo {
  return param('job', 'job', 'Jenkins job (full path)', defJob, { default: defJob, target: true });
}
function setSaved(lab: LabState, ctx: TxContext, record: Rec, jobId: string, k: string, val: string, by: string): void {
  const job = lab.jenkins.jobs[jobId]!;
  record(['jenkins', 'jobs', jobId, 'savedParams', k], job.savedParams[k] ?? null, val);
  job.savedParams[k] = val;
  ctx.emit('jenkins.jobSaved', { jobId, fields: ['params'], actor: by });
}

const jenkinsEnvCase: FaultDef = {
  info: info('jenkins.envCase', 'Enum value not ALL CAPS', 'jenkins', [
    jobParam('Java/uia-remote-regression-flex'),
    param('param', 'string', 'parameter', 'DEVICE_TYPE', { default: 'DEVICE_TYPE' }),
    param('value', 'string', 'saved value', 'flex_3', { default: 'flex_3' }),
    param('by', 'string', 'who saved it', 'riley', { default: 'riley' }),
  ], {
    tags: ['jenkins.envvars', 'orca.devicetype'],
    clears: 'savedParams[param] is exactly one of the 14 DeviceType constants',
    symptoms: ['[orca] checkout request deviceType=flex_3', 'java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.flex_3'],
    usedBy: ['INC39', 'M11', 'M18'],
  }),
  validate(lab, p) {
    const job = lab.jenkins.jobs[s(p, 'job')];
    if (!job || !job.exists) return err(`fault jenkins.envCase: invalid param job='${s(p, 'job')}' (no such job)`);
    if ((DEVICE_TYPE_CODES as readonly string[]).includes(s(p, 'value'))) return err(`fault jenkins.envCase: nothing to break (${s(p, 'value')} is a valid DeviceType)`);
    return ok({ target: job.id });
  },
  apply(lab, ctx, p, record) {
    setSaved(lab, ctx, record, s(p, 'job'), s(p, 'param', 'DEVICE_TYPE'), s(p, 'value'), s(p, 'by'));
  },
  isResolved(lab, f) {
    const job = lab.jenkins.jobs[String(f.params['job'])];
    return !!job && (DEVICE_TYPE_CODES as readonly string[]).includes(job.savedParams[String(f.params['param'] ?? 'DEVICE_TYPE')] ?? '');
  },
};

const jenkinsJobMoved: FaultDef = {
  info: info('jenkins.jobMoved', 'Job filed in the wrong folder', 'jenkins', [jobParam('Java/pigeon-windows-tender'), param('toFolder', 'string', 'folder', 'iOS', { default: 'iOS', values: ['Java', 'iOS'] }), param('by', 'string', 'who moved it', 'alex', { default: 'alex' })], {
    tags: ['jenkins.folders', 'pigeon.lstr', 'go.sdk'],
    clears: "jobs['Java/<name>'].exists and no existing iOS/<name>",
    symptoms: ['Java view lacks it', 'the nightly trigger skips it', 'search finds iOS/pigeon-windows-tender'],
    usedBy: ['INC26'],
  }),
  validate(lab, p) {
    const job = lab.jenkins.jobs[s(p, 'job')];
    if (!job || !job.exists) return err(`fault jenkins.jobMoved: invalid param job='${s(p, 'job')}' (no such job)`);
    if (job.folder === s(p, 'toFolder')) return err(`fault jenkins.jobMoved: nothing to break (already in ${job.folder})`);
    return ok({ target: job.id });
  },
  apply(lab, ctx, p, record) {
    const from = s(p, 'job');
    const r = moveJob(lab, ctx, from, s(p, 'toFolder'), s(p, 'by'));
    if (r.ok) record(['jenkins', 'jobs', r.value.jobId, 'id'], from, r.value.jobId);
  },
  isResolved(lab, f) {
    const name = String(f.params['job']).split('/')[1]!;
    return !!lab.jenkins.jobs[`Java/${name}`]?.exists && !lab.jenkins.jobs[`iOS/${name}`]?.exists;
  },
  revert(lab, ctx, f) {
    const name = String(f.params['job']).split('/')[1]!;
    const fromFolder = String(f.params['job']).split('/')[0]!;
    const cur = Object.values(lab.jenkins.jobs).find((j) => j.name === name && j.exists && j.folder !== fromFolder);
    if (cur) moveJob(lab, ctx, cur.id, fromFolder, 'system');
  },
};

function mergedConflict(lab: LabState, jobId: string): string | null {
  const job = lab.jenkins.jobs[jobId];
  if (!job) return null;
  const parsed = parseScript(job.script, job.savedParams);
  if (!parsed.ok || !parsed.caps.nonDynamic || !parsed.caps.dynamicFile) return null;
  const text = lab.repos['gort'].files[parsed.caps.dynamicFile] ?? lab.repos[job.testRef?.repo ?? 'gort']?.files[parsed.caps.dynamicFile];
  const r = text ? parseStrictJson(text) : null;
  const dyn = r?.ok ? ((r.value as { capabilities?: Record<string, unknown> }).capabilities ?? {}) : {};
  for (const [k, v] of Object.entries(parsed.caps.nonDynamic)) if (k in dyn && String(dyn[k]) !== String(v)) return k;
  return null;
}

const jenkinsCapsConflict: FaultDef = {
  info: info('jenkins.capsConflict', 'Pipeline capability contradicts the test', 'jenkins', [
    jobParam('Java/contact-canada-pin-sale'),
    param('key', 'string', 'capability key', 'deviceType', { default: 'deviceType' }),
    param('value', 'string', 'new value', 'MINI_3', { default: 'MINI_3' }),
    param('by', 'string', 'who edited the script', 'alex', { default: 'alex' }),
  ], {
    tags: ['orca.capabilities', 'hw.devices', 'jenkins.envvars'],
    clears: "the script map merged with the job's dynamic file has no conflicting key",
    symptoms: ['[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT)'],
    usedBy: ['INC49'],
  }),
  validate(lab, p) {
    const job = lab.jenkins.jobs[s(p, 'job')];
    if (!job || !job.exists) return err(`fault jenkins.capsConflict: invalid param job='${s(p, 'job')}' (no such job)`);
    if (!new RegExp(`def capabilities = \\[[^\\]]*\\b${s(p, 'key')}\\s*:`).test(job.script)) return err(`fault jenkins.capsConflict: nothing to break (no '${s(p, 'key')}' in the capability map)`);
    return ok({ target: job.id });
  },
  apply(lab, ctx, p, record) {
    const job = lab.jenkins.jobs[s(p, 'job')]!;
    const before = job.script;
    const next = before.replace(new RegExp(`(def capabilities = \\[[^\\]]*\\b${s(p, 'key')}\\s*:\\s*)('[^']*'|"[^"]*"|params\\.\\w+|true|false|\\d+)`), `$1'${s(p, 'value')}'`);
    record(['jenkins', 'jobs', job.id, 'script'], before, next);
    job.script = next;
    ctx.emit('jenkins.jobSaved', { jobId: job.id, fields: ['script'], actor: s(p, 'by') });
  },
  isResolved(lab, f) {
    return mergedConflict(lab, String(f.params['job'])) === null;
  },
};

const jenkinsNamedRobot: FaultDef = {
  info: info('jenkins.namedRobot', 'Job pinned to the wrong robot', 'jenkins', [jobParam('Java/contact-canada-pin-sale'), param('robot', 'robot', 'robot Name', 'tars', { default: 'tars' }), param('by', 'string', 'who saved it', 'alex', { default: 'alex' })], {
    tags: ['bots.pin', 'bots.types', 'orca.capabilities'],
    clears: "saved ROBOT_NAME is '' or names a robot whose capability document satisfies the job's merged requirements",
    symptoms: ['Checked out robot tars (named)', 'PIN entry requires physical touch'],
    usedBy: ['INC52', 'P2-4'],
  }),
  validate(lab, p) {
    const job = lab.jenkins.jobs[s(p, 'job')];
    if (!job || !job.exists) return err(`fault jenkins.namedRobot: invalid param job='${s(p, 'job')}' (no such job)`);
    if (!Object.values(lab.orca.robots).some((r) => r.name === s(p, 'robot'))) return err(`fault jenkins.namedRobot: invalid param robot='${s(p, 'robot')}' (no such robot)`);
    return ok({ target: job.id });
  },
  apply(lab, ctx, p, record) {
    setSaved(lab, ctx, record, s(p, 'job'), 'ROBOT_NAME', s(p, 'robot'), s(p, 'by'));
  },
  isResolved(lab, f) {
    const job = lab.jenkins.jobs[String(f.params['job'])];
    if (!job) return false;
    const name = job.savedParams['ROBOT_NAME'] ?? '';
    if (!name) return true;
    const robot = Object.values(lab.orca.robots).find((r) => r.name === name);
    if (!robot) return false;
    const doc = core().capabilityDocument(lab, robot.id) ?? {};
    const parsed = parseScript(job.script, job.savedParams);
    const R: Record<string, unknown> = { ...(parsed.ok ? (parsed.caps.nonDynamic ?? {}) : {}) };
    if (parsed.ok && parsed.caps.dynamicFile) {
      const r = parseStrictJson(lab.repos['gort'].files[parsed.caps.dynamicFile] ?? '');
      if (r.ok) Object.assign(R, (r.value as { capabilities?: Record<string, unknown> }).capabilities ?? {});
    }
    return Object.entries(R).every(([k, v]) => k === 'tethered' || String(doc[k] ?? false) === String(v));
  },
};

const rigTestRunning: FaultDef = {
  info: info('rig.testRunning', 'A test holds the rig', 'jenkins', [
    param('rig', 'rig', 'robot Name', 'wall-e', { required: true, target: true }),
    param('job', 'job', 'Jenkins job', 'Java/uia-remote-regression-flex', { default: 'Java/uia-remote-regression-flex' }),
    param('number', 'number', 'build number', '4127'),
    param('durationMs', 'number', 'loop duration (physical ms); empty = until cleared', '30000'),
    param('by', 'string', 'trigger', 'jenkins', { default: 'jenkins' }),
  ], {
    tags: ['hw.lockout', 'hw.tablet'],
    clears: 'the build is finished',
    symptoms: ['tablet overlay TEST IN PROGRESS — CONTROLS LOCKED', 'Orca: Available · in use by Jenkins #4127'],
    usedBy: ['M01', 'INC12', 'DR16'],
  }),
  validate(lab, p) {
    const job = lab.jenkins.jobs[s(p, 'job', 'Java/uia-remote-regression-flex')];
    if (!job || !job.exists) return err(`fault rig.testRunning: invalid param job='${s(p, 'job')}' (no such job)`);
    const robot = Object.values(lab.orca.robots).find((r) => r.name === s(p, 'rig'));
    if (!robot) return err(`fault rig.testRunning: invalid param rig='${s(p, 'rig')}' (no such rig)`);
    if (robot.checkout) return err(`fault rig.testRunning: nothing to break (${robot.name} is already in use by Jenkins #${robot.checkout.buildId.split('#')[1]})`);
    return ok({ target: robot.name });
  },
  apply(lab, ctx, p, record) {
    const jobId = s(p, 'job', 'Java/uia-remote-regression-flex');
    if (p['number'] !== undefined && p['number'] !== '' && p['number'] !== null) {
      record(['jenkins', 'nextBuildNumber', jobId], lab.jenkins.nextBuildNumber[jobId], Number(p['number']));
      lab.jenkins.nextBuildNumber[jobId] = Number(p['number']);
    }
    const r = queueBuild(lab, ctx, jobId, { ROBOT_NAME: s(p, 'rig') }, s(p, 'by', 'jenkins'));
    if (!r.ok) return;
    const b = lab.jenkins.builds[r.buildId]!;
    b.runner.vars['j.loopFault'] = `f${lab.seq.fault + 1}`;
    if (p['durationMs'] !== undefined && p['durationMs'] !== '' && p['durationMs'] !== null) b.runner.vars['j.loopUntil'] = String(lab.time.physMs + Number(p['durationMs']));
    record(['jenkins', 'builds', r.buildId, 'state'], null, 'queued');
  },
  isResolved(lab, f) {
    const b = Object.values(lab.jenkins.builds).find((x) => x.runner.vars['j.loopFault'] === f.id);
    return !b || b.state === 'finished';
  },
  revert(lab, ctx, f) {
    for (const b of Object.values(lab.jenkins.builds)) if (b.runner.vars['j.loopFault'] === f.id && b.state !== 'finished') b.runner.vars['j.loopStop'] = '1';
    void ctx;
  },
};

export const DEVOPS_FAULT_DEFS: FaultDef[] = [
  gortCapabilityDropped,
  pigeonMissingComma,
  pigeonMissingBracket,
  pigeonScreenCompareEmpty,
  uiaWaitForScreenStub,
  uiaScrollSwapped,
  uiaMissingScreenMethods,
  uiaTeardownMissing,
  configPort5555,
  configValue,
  configThemeKernel,
  jenkinsEnvCase,
  jenkinsJobMoved,
  jenkinsCapsConflict,
  jenkinsNamedRobot,
  rigTestRunning,
];

/* ────────────────────────────── Setup ops (Sim §4.4.1, devops rows) ────────────────────────────── */

const sop = (op: string, description: string, params: FaultParamInfo[], presetOnly = false): SetupOpInfo => ({ op, description, params, owner: 'devops', presetOnly });
const R = (name: string, kind: FaultParamInfo['kind'], description: string, example: string): FaultParamInfo => param(name, kind, description, example, { required: true });
const str = (v: unknown, d = ''): string => (v === undefined || v === null ? d : String(v));

function need(p: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) if (p[k] === undefined || p[k] === null || p[k] === '') return `invalid param ${k}='' (missing)`;
  return null;
}
const repoCheck = (p: Record<string, unknown>): string | null => (isRepoId(str(p['repo'])) ? null : `invalid param repo='${str(p['repo'])}' (not one of gort, uia-remote, pigeon, orchestrator)`);

export const DEVOPS_SETUP_OP_DEFS: SetupOpDef[] = [
  {
    info: sop('ollama.seedReceipt', 'Add a ReceiptScenario and a ~/Downloads/<name>.jpg pointing at it', [R('imageRef', 'string', 'image ref', 'img:receipt:wall-e:1015'), R('deviceId', 'device', 'device', 'dev-wall-e-flex3'), R('subtotalCents', 'number', 'subtotal', '4200'), param('taxCents', 'number', 'tax', '0', { default: 0 }), R('tipPct', 'number', 'tip %', '18'), R('printedTipCents', 'number', 'printed tip', '756'), param('misreadField', 'string', 'tip | total', 'tip'), param('misreadAs', 'string', 'what the model reads', '$7.65')]),
    validate: (_lab, p) => {
      const e = need(p, 'imageRef', 'deviceId', 'subtotalCents', 'tipPct', 'printedTipCents');
      return e ? err(e) : ok(undefined);
    },
    apply: (lab, _ctx, p) => {
      seedReceipt(lab, p);
    },
  },
  {
    info: sop('repo.clone', 'git.clone(repo) at main head (~/IdeaProjects/<repo>)', [R('repo', 'string', 'repo id', 'uia-remote')]),
    validate: (lab, p) => {
      const e = repoCheck(p);
      if (e) return err(e);
      return lab.repos[str(p['repo']) as RepoId].local ? err(`fatal: destination path '${str(p['repo'])}' already exists and is not an empty directory.`) : ok(undefined);
    },
    apply: (lab, ctx, p) => {
      gitClone(lab, ctx, str(p['repo']) as RepoId, 'system');
      if (str(p['repo']) === 'uia-remote') mirrorConfig(lab);
    },
  },
  {
    info: sop('repo.commitFixture', 'Commit fixture text (Sim §4.4.4) at path', [R('repo', 'string', 'repo id', 'pigeon'), R('path', 'repoPath', 'path', 'tests/sale/swipe_sale_print.json'), R('fixture', 'string', 'fixture id', 'm15-expanded'), R('by', 'string', 'author', 'alex'), R('message', 'string', 'commit message', 'Expand swipe sale actions'), param('branch', 'string', 'branch', 'main', { default: 'main' })]),
    validate: (lab, p) => {
      const e = need(p, 'repo', 'path', 'fixture', 'by', 'message') ?? repoCheck(p);
      if (e) return err(e);
      return resolveFixture(lab, str(p['fixture']), { path: str(p['path']) }) ? ok(undefined) : err(`invalid param fixture='${str(p['fixture'])}' (no such fixture)`);
    },
    apply: (lab, ctx, p) => {
      const repoId = str(p['repo']) as RepoId;
      const files = resolveFixture(lab, str(p['fixture']), { path: str(p['path']), base: lab.repos[repoId].files })!;
      const branch = str(p['branch'], 'main');
      const repo = lab.repos[repoId];
      const before = repo.branches[branch] ?? null;
      const sha = commitRemote(lab, repoId, branch, files, str(p['message']), str(p['by']));
      if (branch === repo.defaultBranch) afterMainMoved(lab, repoId, before, sha);
      void ctx;
    },
  },
  {
    info: sop('repo.deleteFile', 'Commit deleting path', [R('repo', 'string', 'repo id', 'gort'), R('path', 'repoPath', 'path', 'config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json'), R('by', 'string', 'author', 'jared'), R('message', 'string', 'commit message', 'Remove unverified FLEX_4 5-option map')]),
    validate: (lab, p) => {
      const e = need(p, 'repo', 'path', 'by', 'message') ?? repoCheck(p);
      if (e) return err(e);
      return lab.repos[str(p['repo']) as RepoId].files[str(p['path'])] === undefined ? err(`invalid param path='${str(p['path'])}' (no such repoPath)`) : ok(undefined);
    },
    apply: (lab, _ctx, p) => {
      const repoId = str(p['repo']) as RepoId;
      const before = lab.repos[repoId].branches['main']!;
      const sha = commitRemote(lab, repoId, 'main', { [str(p['path'])]: null }, str(p['message']), str(p['by']));
      afterMainMoved(lab, repoId, before, sha);
    },
  },
  {
    info: sop('github.seedPr', 'Branch <author>/<slug> with the fixture committed on main + an open PR (reviewer: the player)', [R('repo', 'string', 'repo id', 'uia-remote'), R('number', 'number', 'PR number', '431'), R('fixture', 'string', 'fixture id', 'uia-431-lockscreen'), R('author', 'string', 'author', 'alex'), R('title', 'string', 'title', 'Add LockScreen page object'), param('state', 'string', 'open | closed', 'open', { default: 'open' })]),
    validate: (lab, p) => {
      const e = need(p, 'repo', 'number', 'fixture', 'author', 'title') ?? repoCheck(p);
      if (e) return err(e);
      if (lab.repos[str(p['repo']) as RepoId].pullRequests.some((x) => x.number === Number(p['number']))) return err(`${str(p['repo'])}#${str(p['number'])} already exists`);
      return resolveFixture(lab, str(p['fixture'])) ? ok(undefined) : err(`invalid param fixture='${str(p['fixture'])}' (no such fixture)`);
    },
    apply: (lab, ctx, p) => {
      seedPr(lab, ctx, { repo: str(p['repo']) as RepoId, number: Number(p['number']), fixture: str(p['fixture']), author: str(p['author']), title: str(p['title']), state: str(p['state'], 'open') });
    },
  },
  {
    info: sop('github.reopenPr', 'A closed PR → open (branch restored at its head)', [R('repo', 'string', 'repo id', 'uia-remote'), R('number', 'number', 'PR number', '212')]),
    validate: (lab, p) => {
      const e = repoCheck(p);
      if (e) return err(e);
      const pr = lab.repos[str(p['repo']) as RepoId].pullRequests.find((x) => x.number === Number(p['number']));
      return !pr ? err(`${str(p['repo'])}#${str(p['number'])} not found`) : pr.state !== 'closed' ? err(`${str(p['repo'])}#${str(p['number'])} is ${pr.state}`) : ok(undefined);
    },
    apply: (lab, _ctx, p) => {
      reopenPr(lab, str(p['repo']) as RepoId, Number(p['number']));
    },
  },
  {
    info: sop('github.unmergePr', "Rewrite history so the PR's merge commit is not on main (PR open again)", [R('repo', 'string', 'repo id', 'gort'), R('number', 'number', 'PR number', '418')], true),
    validate: (lab, p) => {
      const e = repoCheck(p);
      if (e) return err(e);
      const pr = lab.repos[str(p['repo']) as RepoId].pullRequests.find((x) => x.number === Number(p['number']));
      return !pr ? err(`${str(p['repo'])}#${str(p['number'])} not found`) : pr.state !== 'merged' ? err(`${str(p['repo'])}#${str(p['number'])} is ${pr.state}`) : ok(undefined);
    },
    apply: (lab, _ctx, p) => {
      unmergePr(lab, str(p['repo']) as RepoId, Number(p['number']));
    },
  },
  {
    info: sop('config.write', 'Write config.properties (git-ignored, not a commit)', [R('fixture', 'string', 'm14-broken | broken | target', 'm14-broken'), param('robot', 'robot', 'robot for generators', 'megatron', { default: 'megatron' }), cfgPathParam]),
    validate: (lab, p) => {
      const path = str(p['path'], LOCAL_CFG);
      const isLocal = tildify(path) === LOCAL_CFG || path.endsWith('IdeaProjects/uia-remote/config.properties');
      if (isLocal && !lab.repos['uia-remote'].local) return err('uia-remote is not cloned (repo.clone first)');
      return resolveFixture(lab, str(p['fixture']), { robot: str(p['robot'], 'megatron') }) ? ok(undefined) : err(`invalid param fixture='${str(p['fixture'])}' (no such fixture or robot)`);
    },
    apply: (lab, ctx, p) => {
      const files = resolveFixture(lab, str(p['fixture']), { robot: str(p['robot'], 'megatron') })!;
      cfgWrite(lab, ctx, () => undefined, str(p['path'], LOCAL_CFG), files['config.properties']!);
    },
  },
  {
    info: sop('jenkins.setParam', 'savedParams[param] ≔ value (config history)', [R('job', 'job', 'job', 'Java/pigeon-android-sale-swipe'), R('param', 'string', 'parameter', 'ROBOT_NAME'), R('value', 'string', 'value', 'bumblebee'), param('by', 'string', 'who', 'morgan', { default: 'morgan' })]),
    validate: (lab, p) => (lab.jenkins.jobs[str(p['job'])]?.exists ? ok(undefined) : err(`invalid param job='${str(p['job'])}' (no such job)`)),
    apply: (lab, ctx, p) => {
      saveJob(lab, ctx, str(p['job']), { savedParams: { ...lab.jenkins.jobs[str(p['job'])]!.savedParams, [str(p['param'])]: str(p['value']) } }, str(p['by'], 'morgan'));
    },
  },
  {
    info: sop('jenkins.startBuild', 'jenkins.build (a real build)', [R('job', 'job', 'job', 'Java/pigeon-android-tip-sale'), param('params', 'list', 'parameters', '{"ROBOT_NAME":"eve"}', { default: [] }), param('by', 'string', 'trigger', 'jenkins', { default: 'jenkins' }), param('number', 'number', 'build number', '')]),
    validate: (lab, p) => (lab.jenkins.jobs[str(p['job'])]?.exists ? ok(undefined) : err(`invalid param job='${str(p['job'])}' (no such job)`)),
    apply: (lab, ctx, p) => {
      const jobId = str(p['job']);
      if (p['number'] !== undefined && p['number'] !== '') lab.jenkins.nextBuildNumber[jobId] = Number(p['number']);
      const params = p['params'] && typeof p['params'] === 'object' && !Array.isArray(p['params']) ? (p['params'] as Record<string, string>) : {};
      queueBuild(lab, ctx, jobId, params, str(p['by'], 'jenkins'));
    },
  },
  {
    info: sop('jenkins.seedBuild', 'A finished historical build (console from the engine formatter)', [R('job', 'job', 'job', 'Java/uia-remote-regression-flex'), param('params', 'list', 'parameters', '{}'), R('result', 'string', 'SUCCESS | FAILURE | UNSTABLE | ABORTED', 'FAILURE'), param('failureCode', 'string', 'failure code', 'ENUM_CASE'), param('robot', 'robot', 'robot', 'wall-e'), R('atMs', 'number', 'game ms', '-3600000'), R('by', 'string', 'trigger', 'riley')], true),
    validate: (lab, p) => (lab.jenkins.jobs[str(p['job'])] ? ok(undefined) : err(`invalid param job='${str(p['job'])}' (no such job)`)),
    apply: (lab, _ctx, p) => {
      const job = lab.jenkins.jobs[str(p['job'])]!;
      const number = lab.jenkins.nextBuildNumber[job.id] ?? 1;
      lab.jenkins.nextBuildNumber[job.id] = number + 1;
      const params = { ...job.savedParams, ...(p['params'] && typeof p['params'] === 'object' ? (p['params'] as Record<string, string>) : {}) };
      const result = str(p['result'], 'SUCCESS') as 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED';
      const b = synthBuild(lab, job, number, params, p['robot'] ? str(p['robot']) : null, result, p['failureCode'] ? str(p['failureCode']) : null, Number(p['atMs']), str(p['by']));
      lab.jenkins.builds[b.id] = b;
      job.buildIds.push(b.id);
    },
  },
  {
    info: sop('runner.startLocal', 'runner.runLocal (a real IntelliJ run)', [param('repo', 'string', 'uia-remote | pigeon', 'uia-remote', { default: 'uia-remote' }), R('test', 'string', 'test class or Pigeon file', 'SaleTest'), param('configPath', 'repoPath', 'config.properties', LOCAL_CFG)]),
    validate: (lab, p) => {
      const repo = str(p['repo'], 'uia-remote');
      if (repo !== 'uia-remote' && repo !== 'pigeon') return err(`invalid param repo='${repo}' (not one of uia-remote, pigeon)`);
      return lab.repos[repo].local ? ok(undefined) : err(`${repo} is not cloned (repo.clone first)`);
    },
    apply: (lab, ctx, p) => {
      const repo = str(p['repo'], 'uia-remote') as 'uia-remote' | 'pigeon';
      const test = str(p['test']);
      const path = repo === 'uia-remote' && !test.includes('/') ? UIA_PATHS.test(test) : test;
      runLocal(lab, ctx, repo, path, 'player', p['configPath'] ? str(p['configPath']) : undefined);
    },
  },
];

/** Tree helper for tests and tools. */
export const mainTree = (lab: LabState, repo: RepoId): Record<string, string> => treeAt(lab.repos[repo], lab.repos[repo].branches['main'] ?? null);
