/**
 * uia-remote runner (Sim §3.19): handles (with the 5555 fallback, §3.15.3), setup safe state, click
 * routing (xy_touch on gantry-covered displays, UI Automator elsewhere), the render race and
 * `waitForScreen()` (§3.19.5), code facts (§3.19.6) and the test plans (§3.19.4).
 */
import type { TerminalDevice, RunnerStep, ScreenName } from '../../types';
import { UIA_PATHS } from '../../seed/repos/uiaRemote';
import { core } from '../coreRef';
import { hasTeardown, javaSyntaxError, methodBody, openDirection, packageProblems, screenCompareNames, screenSync, usesDisplayId } from '../codefacts';
import { familyOf } from '../config';
import {
  displayOf,
  isCoworker,
  now,
  orcaScreenFor,
  out,
  pageObjectName,
  probeCovers,
  registerOps,
  rendered,
  runnerXyTouch,
  screenOf,
  ssv,
  sv,
  svn,
  target,
  TIMEOUT_MS,
  uiaClick,
  runnerAdb,
  orcaActor,
} from './engine';
import type { Outcome, RC, StepHandler } from './engine';

const NF = (text: string): string => `androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=${text}]`;
const list = (s: unknown): string[] => (typeof s === 'string' && s ? s.split('|') : []);
const fail = (code: string, ...lines: string[]): Outcome => ({ fail: code, lines });

function testFail(rc: RC, step: RunnerStep, code: string, ...lines: string[]): Outcome {
  const test = String(step.args['test'] ?? '');
  if (test) rc.rs.vars[`_tf.${test}`] = '1';
  return test ? { failJump: `td:${test}`, code, lines } : { fail: code, lines };
}

/**
 * CFD-mode idle counts as HomeScreen on a CFD device: the pay-display app's idle screen, linked
 * (`customer-idle`) or not (`waiting-for-merchant`, Sim §3.8.6) — a broken link surfaces later, at
 * CFD_O1 (`[CFD_O1] waitForScreen timed out (CustomerOrderScreen)`, INC47).
 */
function isHome(d: TerminalDevice, display: 'primary' | 'secondary', role: string): boolean {
  const s = screenOf(d, display);
  return s === 'home' || (role === 'CFD' && (s === 'customer-idle' || s === 'waiting-for-merchant'));
}

/** Wait helper: polls `cond` for up to `ms` from the first call (per step). */
function waitUntil(rc: RC, key: string, ms: number, cond: () => boolean): 'ok' | 'wait' | 'timeout' {
  if (cond()) return 'ok';
  const started = svn(rc, `w.${key}`);
  if (started === null) {
    ssv(rc, `w.${key}`, now(rc));
    return 'wait';
  }
  return now(rc) - started >= ms ? 'timeout' : 'wait';
}

const env = (rc: RC, k: string): string => rc.host.env[k] ?? '';

/** Line of the `.click()` inside a page-object method (for stack frames). */
function clickLine(src: string, method: string): number {
  const m = methodBody(src, method);
  if (!m) return 1;
  const off = m.body.split('\n').findIndex((l) => l.includes('.click()'));
  return m.startLine + (off >= 0 ? off : 0);
}

/* ────────────────────────────── Ops ────────────────────────────── */

const ops: Record<string, StepHandler> = {
  log(rc, step) {
    out(rc, String(step.args['text']));
    return 'done';
  },
  delay(rc, step) {
    if (sv(rc, 'd') === undefined) {
      ssv(rc, 'd', 1);
      return { sleep: Number(step.args['ms'] ?? 0) };
    }
    return 'done';
  },
  uiaHeader(rc) {
    out(rc, `[runner] uia-remote 4.2.0 · UI Automator ${rc.lab.flags.uiaVersion} · runType=${env(rc, 'RUN_TYPE')} · deviceType=${env(rc, 'DEVICE_FAMILY')}`);
    return 'done';
  },
  /** Compile check (CF12, CF09, missing classes) over the test sources. */
  compile(rc, step) {
    const tests = list(step.args['tests']);
    const tree = rc.host.tree;
    const javaFiles = Object.entries(tree).filter(([p]) => p.endsWith('.java') && (p.includes('/androidTest/') || p.includes('/src/test/')));
    for (const [p, src] of javaFiles) {
      const e = javaSyntaxError(src);
      if (e) return fail('SCRIPT', '> Task :app:compileDebugAndroidTestJavaWithJavac FAILED', `${p}:${e.line}: error: ${e.message}`, '1 error', '', 'FAILURE: Build failed with an exception.');
    }
    const bad = packageProblems(tree);
    for (const t of tests) {
      const src = tree[UIA_PATHS.test(t)];
      if (src === undefined) return fail('SCRIPT', `No tests found for given includes: [com.labsim.uia.testactions.${t}]`);
      const imports = [...src.matchAll(/import\s+com\.labsim\.uia\.pageobjects\.(\w+);/g)].map((m) => m[1]!);
      for (const cls of imports) {
        const at = tree[UIA_PATHS.po(cls)];
        const misplaced = bad.find((b) => b.cls === cls);
        if (at === undefined || (misplaced && misplaced.path === UIA_PATHS.po(cls))) {
          return fail('SCRIPT', '> Task :app:compileDebugAndroidTestJavaWithJavac FAILED', `${UIA_PATHS.test(t)}:${src.split('\n').findIndex((l) => l.includes(`pageobjects.${cls};`)) + 1}: error: cannot find symbol`, `import com.labsim.uia.pageobjects.${cls};`, '                                ^', `  symbol:   class ${cls}`, '  location: package com.labsim.uia.pageobjects', '1 error');
        }
      }
    }
    return 'done';
  },
  /** Open a device handle (Sim §3.19.2, §3.15.3). */
  connect(rc, step) {
    const role = String(step.args['role']);
    const ip = String(step.args['ip'] ?? '');
    const port = String(step.args['port'] ?? '5444');
    const t = `${ip}:${port}`;
    const label = role === 'DEVICE' ? 'DEVICE' : role;
    const set = (h: string): void => {
      if (role === 'CFD') rc.rs.handles.cfd = h;
      else rc.rs.handles.mfd = h;
    };
    if (rc.host.kind === 'build') {
      const r = core().reach(rc.lab, rc.ctx, rc.host.fromHost, ip, Number(port));
      if (r.ok) {
        set(t);
        out(rc, `[runner] ${label} handle ${t} connected`);
        return 'done';
      }
      const err = r.kind === 'refused' ? 'Connection refused' : r.kind === 'timeout' ? 'Connection timed out' : 'No route to host';
      return fail(r.kind === 'refused' ? 'ADB_CONNECT' : 'DEVICE_UNREACHABLE', `[runner] adb connect ${t}`, `adb: failed to connect to '${t}': ${err}`, `[runner] ${label} handle ${t} → ${err}`);
    }
    if (!ip) return fail('CONFIG_INVALID', `[runner] ${label} handle ${t} → No route to host`);
    const res = core().adbConnect(rc.lab, rc.ctx, t);
    if (res.ok) {
      set(t);
      out(rc, `[runner] ${label} handle ${t} connected`);
      return 'done';
    }
    const refused = /Connection refused/.test(res.line);
    const known = rc.lab.workstation.adbConnections.filter((c) => c.state === 'device');
    if (refused && known.length) {
      const first = known[0]!.target;
      set(first);
      out(rc, `connect ${t} … refused`, `falling back to first known device: ${first}`);
      return 'done';
    }
    if (refused) return fail('ADB_CONNECT', `DeviceConnectionException: cannot connect to ${t} (Connection refused)`);
    const err = /timed out/.test(res.line) ? 'Connection timed out' : 'No route to host';
    return fail('DEVICE_UNREACHABLE', `[runner] ${label} handle ${t} → ${err}`);
  },
  /** `[setup] wake + unlock … OK` then HomeScreen.waitForScreen() on every handle. */
  setup(rc, step) {
    const roles = list(step.args['roles']);
    if (sv(rc, 'unlocked') === undefined) {
      for (const role of roles) {
        const t = target(rc, role);
        if (!t) continue;
        if (t.device.locked || screenOf(t.device, t.display) === 'lock') {
          runnerAdb(rc, t.handle, ['shell', 'input', 'text', env(rc, 'UNLOCK_PASSCODE') || '0000']);
          runnerAdb(rc, t.handle, ['shell', 'input', 'keyevent', 'KEYCODE_ENTER']);
        } else if (isCoworker(rc, t.handle)) runnerAdb(rc, t.handle, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
      }
      out(rc, '[setup] wake + unlock (passcode ****) … OK');
      ssv(rc, 'unlocked', 1);
      return { sleep: 400 };
    }
    const w = waitUntil(rc, 'home', TIMEOUT_MS, () =>
      roles.every((role) => {
        const t = target(rc, role);
        return !t || (isHome(t.device, t.display, role) && rendered(rc, t.device, t.display));
      }),
    );
    if (w === 'wait') return 'poll';
    out(rc, `[setup] HomeScreen.waitForScreen() … ${w === 'ok' ? 'OK' : 'timed out'}  (${roles.join(', ')})`);
    return 'done';
  },
  tetherGuard(rc, step) {
    if (env(rc, 'RUN_TYPE') === 'tethered') return 'done';
    const lines = rc.host.kind === 'build' ? ['[runner] MFD relation empty → standalone'] : [];
    return testFail(rc, step, 'TETHER_REQUIRED', ...lines, `AssertionError: ${step.args['test']} requires a tethered rig (MFD/CFD)`);
  },
  testStart(rc, step) {
    out(rc, `[runner] ${step.args['test']}`);
    return 'done';
  },
  assertHome(rc, step) {
    const role = String(step.args['role']);
    const t = target(rc, role);
    if (!t) return testFail(rc, step, 'DEVICE_UNREACHABLE', `[runner] ${role} handle lost`);
    if (isHome(t.device, t.display, role)) return 'done';
    return testFail(rc, step, 'ASSERTION', `AssertionError: HomeScreen.isScreenPresent() == false — current screen: ${pageObjectName(t.device, t.display)}`);
  },
  /** HomeScreen.open(appName) — CF05 against the device family's launcher axis. */
  open(rc, step) {
    const role = String(step.args['role']);
    const app = String(step.args['app']);
    const t = target(rc, role);
    if (!t) return testFail(rc, step, 'DEVICE_UNREACHABLE', `[runner] ${role} handle lost`);
    const src = rc.host.tree[UIA_PATHS.po('HomeScreen')] ?? '';
    const phase = sv(rc, 'ph') ?? 'a';
    if (phase === 'a') {
      const w = waitUntil(rc, 'home', TIMEOUT_MS, () => isHome(t.device, t.display, role) && (screenSync(src).kind !== 'wait' || rendered(rc, t.device, t.display)));
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', '[runner] waitForScreen timed out: HomeScreen');
      const fam = env(rc, 'DEVICE_FAMILY');
      const codeFlex = fam === 'Flex' || fam === 'Compact';
      const dir = openDirection(src);
      const codeVertical = dir === 'correct' ? codeFlex : dir === 'swapped' ? !codeFlex : dir === 'vertical-only';
      const actualFam = familyOf(t.device.type);
      const launcherVertical = actualFam === 'Flex' || actualFam === 'Compact';
      if (codeVertical !== launcherVertical) {
        ssv(rc, 'ph', 's');
        ssv(rc, 'n', 0);
        ssv(rc, 'dirText', codeVertical ? 'vertically (Flex)' : 'horizontally (Mini/Station)');
      } else ssv(rc, 'ph', 'c');
      return { sleep: 0 };
    }
    if (phase === 's') {
      const n = svn(rc, 'n') ?? 0;
      if (n < 5) {
        out(rc, `[HomeScreen] open("${app}"): scrolling ${sv(rc, 'dirText')}…`);
        if (t.display === 'primary') runnerAdb(rc, t.handle, ['shell', 'input', 'swipe', '540', '1200', '540', '1200', '200']);
        ssv(rc, 'n', n + 1);
        return { sleep: 600 };
      }
      return testFail(rc, step, 'UI_NOT_FOUND', `AssertionError: App '${app}' not found on HomeScreen`);
    }
    if (phase === 'c') {
      const r = click(rc, role, app);
      if (r) return testFail(rc, step, r.code, ...r.lines);
      ssv(rc, 'ph', 'd');
      return { sleep: Number(sv(rc, 'after') ?? 150) };
    }
    const toScreen = APP_SCREEN[app] ?? 'register';
    // HomeScreen.open() ends with the launch wait `device.wait(Until.hasObject(By.pkg(…).depth(0)), …)`:
    // the app has launched and drawn before open() returns.
    const launchWait = /Until\.hasObject\(\s*By\.pkg\(/.test(methodBody(src, 'open')?.body ?? '');
    const w = waitUntil(rc, 'to', TIMEOUT_MS, () => screenOf(t.device, t.display) === toScreen && (!launchWait || rendered(rc, t.device, t.display)));
    if (w === 'wait') return 'poll';
    if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: ${toScreen === 'register' ? 'RegisterHomeScreen' : `${app}Screen`}`);
    if (step.args['log']) out(rc, String(step.args['log']));
    return 'done';
  },
  /** Generic page-object click with render sync (Sim §3.19.5). */
  ui(rc, step) {
    const role = String(step.args['role']);
    const text = String(step.args['text']);
    const cls = String(step.args['cls'] ?? '');
    const method = String(step.args['method'] ?? '');
    const from = list(step.args['from']);
    const to = list(step.args['to']);
    const t = target(rc, role);
    if (!t) return testFail(rc, step, 'DEVICE_UNREACHABLE', `[runner] ${role} handle lost`);
    const src = rc.host.tree[UIA_PATHS.po(cls)] ?? '';
    const sync = screenSync(src, method);
    const phase = sv(rc, 'ph') ?? 'a';
    if (phase === 'a') {
      const w = waitUntil(rc, 'from', TIMEOUT_MS, () => !from.length || from.includes(screenOf(t.device, t.display)));
      if (w === 'wait') {
        if (rc.host.kind === 'local' && rc.host.robot?.checkout?.kind === 'jenkins') {
          rc.rs.vars['_overlap'] = '1';
          return testFail(rc, step, 'UI_NOT_FOUND', NF(text));
        }
        return 'poll';
      }
      if (w === 'timeout') {
        if (rc.host.kind === 'build' && rc.lab.workstation.locallyRunningTest && from.length) return testFail(rc, step, 'UI_NOT_FOUND', `[runner] unexpected screen: ${screenOf(t.device, t.display)} (expected ${from[0]})`);
        return sync.kind === 'wait' ? testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: ${cls}`) : testFail(rc, step, 'UI_NOT_FOUND', NF(text));
      }
      ssv(rc, 'obs', now(rc));
      ssv(rc, 'ph', 'b');
    }
    if ((sv(rc, 'ph') ?? 'b') === 'b') {
      const obs = svn(rc, 'obs') ?? now(rc);
      if (sync.kind === 'wait') {
        const w = waitUntil(rc, 'render', TIMEOUT_MS, () => rendered(rc, t.device, t.display));
        if (w === 'wait') return 'poll';
        if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: ${cls}`);
      } else {
        // No working waitForScreen(): the click lands 700 ms (or the sleep) after the screen's last
        // (re-)render started, or at once when that is already past (Sim §3.19.5).
        const start = displayOf(t.device, t.display).renderStartMs ?? obs;
        const at = Math.max(obs, Math.min(obs, start) + (sync.kind === 'sleep' ? sync.ms : 700));
        if (now(rc) < at) return { sleep: at - now(rc) };
        if (!rendered(rc, t.device, t.display)) {
          const frame = cls && method ? [`\tat com.labsim.uia.pageobjects.${cls}.${method}(${cls}.java:${clickLine(src, method)})`] : [];
          return testFail(rc, step, 'UI_NOT_FOUND', NF(text), ...frame);
        }
      }
      // Collision: the screen moved under us (INC31).
      if (from.length && !from.includes(screenOf(t.device, t.display))) {
        if (rc.host.kind === 'local') rc.rs.vars['_overlap'] = rc.host.robot?.checkout?.kind === 'jenkins' ? '1' : (rc.rs.vars['_overlap'] ?? '');
        return rc.host.kind === 'local' ? testFail(rc, step, 'UI_NOT_FOUND', NF(text)) : testFail(rc, step, 'UI_NOT_FOUND', `[runner] unexpected screen: ${screenOf(t.device, t.display)} (expected ${from[0]})`);
      }
      const r = click(rc, role, text);
      if (r) return testFail(rc, step, r.code, ...r.lines);
      ssv(rc, 'ph', 'c');
      ssv(rc, 'prev', screenOf(t.device, t.display));
      return { sleep: Number(sv(rc, 'after') ?? 150) };
    }
    if (!to.length) {
      if (step.args['log']) out(rc, String(step.args['log']));
      return 'done';
    }
    const w = waitUntil(rc, 'to', Number(step.args['toTimeout'] ?? TIMEOUT_MS), () => to.includes(screenOf(t.device, t.display)));
    if (w === 'wait') return 'poll';
    if (w === 'timeout') {
      const cur = screenOf(t.device, t.display);
      if (cur !== sv(rc, 'prev') && !from.includes(cur)) return testFail(rc, step, 'UI_NOT_FOUND', `[runner] unexpected screen: ${cur} (expected ${to[0]})`);
      return testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: ${PO_FOR_SCREEN[to[0]!] ?? cls}`);
    }
    if (step.args['log']) out(rc, String(step.args['log']));
    return 'done';
  },
  /** Orca card action (armed on the probe for the payment prompt, Sim §3.6). */
  card(rc, step) {
    if (sv(rc, 'sent') !== undefined) return 'done';
    const r = rc.host.robot;
    const profile = String(step.args['profile'] || env(rc, 'CARD_PROFILE') || 'VISA_STD_SWIPE');
    const entry = (String(step.args['entry'] ?? '') || entryOf(rc, profile)) as 'SWIPE' | 'DIP' | 'TAP';
    if (!r) return testFail(rc, step, 'CARD_ERROR', '[orca] 404 Not Found: no robot');
    const res = core().cardAction(rc.lab, rc.ctx, r.name, entry, profile, orcaActor(rc));
    if (!res.ok) return testFail(rc, step, 'CARD_ERROR', ...res.error.split('\n'));
    for (const l of res.value?.lines ?? []) out(rc, l);
    if (step.args['log']) out(rc, String(step.args['log']).replace('{entry}', entry.toLowerCase()).replace('{profile}', profile));
    ssv(rc, 'sent', 1);
    return { sleep: res.value?.respondsAfterMs ?? 500 };
  },
  /** CFD_O1 — totals on the customer display (UIA read, or the legacy OCR compare). */
  cfdTotals(rc, step) {
    const t = target(rc, 'CFD');
    if (!t) return testFail(rc, step, 'DEVICE_UNREACHABLE', '[runner] CFD handle lost');
    const via = String(step.args['via'] ?? 'uia');
    const w = waitUntil(rc, 'cart', TIMEOUT_MS, () => screenOf(t.device, t.display) === 'customer-cart' && rendered(rc, t.device, t.display));
    if (w === 'wait') return 'poll';
    if (w === 'timeout') {
      if (via === 'ocr') return testFail(rc, step, 'OCR_MISMATCH', `AssertionError: screenCompare ${step.args['name']} returned false`);
      return testFail(rc, step, 'WAIT_TIMEOUT', `[CFD_O1] waitForScreen timed out (${t.display === 'secondary' ? 'CfdTotalsScreen' : 'CustomerOrderScreen'})`);
    }
    if (via === 'ocr') return ocrCompare(rc, step, String(step.args['name']));
    if (t.display === 'secondary') {
      const cls = rc.host.tree[UIA_PATHS.po('CfdTotalsScreen')] ?? '';
      if (rc.lab.flags.uiaVersion !== '2.3' || !usesDisplayId(cls)) return testFail(rc, step, 'UI_NOT_FOUND', 'androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT_STARTS_WITH=TOTAL]');
    }
    const texts = cartTexts(rc, t.device, t.display);
    const checks: [string, string, RegExp][] = step.args['only'] === 'total' ? [['total', '$10.83', /^(?:TOTAL|Total) (\$[\d.]+)$/]] : [
      ['subtotal', '$10.00', /^Subtotal (\$[\d.]+)$/],
      ['tax', '$0.83', /^Tax (\$[\d.]+)$/],
      ['total', '$10.83', /^(?:TOTAL|Total) (\$[\d.]+)$/],
    ];
    for (const [name, expected, re] of checks) {
      const got = texts.map((x) => re.exec(x)?.[1]).find(Boolean) ?? null;
      if (got !== expected) return testFail(rc, step, 'ASSERTION', `AssertionError: [CFD_O1] ${name} expected ${expected} but was ${got ?? '(missing)'}`);
      out(rc, `[CFD_O1] ${name} ${expected} ✓`);
    }
    return 'done';
  },
  /** Legacy OCR Screen Compare from a test (`orca.screenCompare("NAME")`). */
  screenCompare(rc, step) {
    return ocrCompare(rc, step, String(step.args['name']));
  },
  /** Customer-facing flow segment (screen-driven; tolerant of transient screens). */
  cust(rc, step) {
    return customer(rc, step);
  },
  /** UIA 2.3 page-object check on a CFD screen (migrated Duo checks). */
  uiaCheck(rc, step) {
    const t = target(rc, String(step.args['role'] ?? 'CFD'));
    if (!t) return testFail(rc, step, 'DEVICE_UNREACHABLE', '[runner] CFD handle lost');
    const cls = String(step.args['cls']);
    const src = rc.host.tree[UIA_PATHS.po(cls)] ?? '';
    const screen = String(step.args['screen']);
    const text = String(step.args['text']);
    if (t.display === 'secondary' && (rc.lab.flags.uiaVersion !== '2.3' || !usesDisplayId(src))) return testFail(rc, step, 'UI_NOT_FOUND', NF(text));
    const w = waitUntil(rc, 'scr', TIMEOUT_MS, () => screenOf(t.device, t.display) === screen);
    if (w === 'wait') return 'poll';
    if (w === 'timeout') return testFail(rc, step, 'ASSERTION', `AssertionError: ${cls}.isScreenPresent() == false — current screen: ${pageObjectName(t.device, t.display)}`);
    if (step.args['log']) out(rc, String(step.args['log']));
    return 'done';
  },
  keyHome(rc, step) {
    const t = target(rc, String(step.args['role']));
    if (t) runnerAdb(rc, t.handle, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    return 'done';
  },
  /** `@After tearDown()` — only when the test class has one (CF06). */
  teardown(rc, step) {
    const test = String(step.args['test']);
    const src = rc.host.tree[UIA_PATHS.test(test)] ?? '';
    if (!hasTeardown(src)) return 'done';
    if (sv(rc, 'sent') === undefined) {
      const roles = list(step.args['roles']);
      for (const role of roles) {
        const t = target(rc, role);
        if (t) runnerAdb(rc, t.handle, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
      }
      out(rc, `[teardown] ${roles.map((r) => `${r} → HomeScreen`).join(' · ')}`);
      ssv(rc, 'sent', 1);
      return { sleep: 500 };
    }
    return 'done';
  },
  testEnd(rc, step) {
    const test = String(step.args['test']);
    const logical = list(step.args['steps']);
    const ok = logical.filter((l) => rc.rs.vars[`_ok.${l}`]).length;
    if (rc.rs.vars[`_tf.${test}`]) out(rc, `${test} FAILED (${ok}/${logical.length} steps)`);
    else out(rc, `${test} PASSED (${logical.length}/${logical.length} steps)`);
    rc.rs.vars[`_tests`] = String(Number(rc.rs.vars['_tests'] ?? 0) + 1);
    if (rc.rs.vars[`_tf.${test}`]) rc.rs.vars['_testsFailed'] = String(Number(rc.rs.vars['_testsFailed'] ?? 0) + 1);
    return 'done';
  },
  /** Evidence frame from the rig camera (ContactCanadaPinSaleTest, Sim §3.19.4). */
  evidence(rc, step) {
    const url = rc.host.robot?.cameraStreamUrl ?? '';
    const m = /^https?:\/\/([^/:]+)(?::(\d+))?/.exec(url);
    if (!m) return testFail(rc, step, 'EVIDENCE_CAPTURE', `[vision] GET ${url || '(no camera stream URL)'} → No route to host`);
    const r = core().reach(rc.lab, rc.ctx, rc.host.fromHost, m[1]!, Number(m[2] ?? 80));
    if (!r.ok) return testFail(rc, step, 'EVIDENCE_CAPTURE', `[vision] GET ${url} → ${r.kind === 'refused' ? 'Connection refused' : r.kind === 'timeout' ? 'connect timed out after 10000 ms' : 'No route to host'}`);
    out(rc, `[vision] GET ${url} → 200 (frame saved)`);
    return 'done';
  },
  /** PayCore matrix line after each approved sale. */
  paycoreLog(rc, step) {
    const t = target(rc, 'DEVICE');
    const auth = t?.device.order?.authCode ?? t?.device.lastReceiptDoc?.authCode ?? 'SIM000';
    out(rc, `[paycore] ${step.args['profile']} → APPROVED (${auth})`);
    return 'done';
  },
};

const APP_SCREEN: Record<string, ScreenName> = { Register: 'register', Orders: 'app-orders', Setup: 'app-setup', Transactions: 'app-transactions', Sale: 'app-sale', Authorizations: 'app-authorizations', Customers: 'app-customers', Inventory: 'app-inventory', Settings: 'app-settings' };
const PO_FOR_SCREEN: Record<string, string> = { register: 'RegisterHomeScreen', 'review-order': 'ReviewOrderScreen', 'tender-select': 'PaymentScreen', 'payment-prompt': 'PaymentPromptScreen', 'waiting-for-customer': 'PaymentScreen', tip: 'TipScreen', 'receipt-options': 'ReceiptScreen', 'thank-you': 'ThankYouScreen', home: 'HomeScreen' };

function entryOf(rc: RC, profile: string): string {
  const p = Object.values(rc.lab.orca.cardProfiles).find((c) => c.name === profile);
  return p?.entry ?? 'SWIPE';
}

/** Click routing (Sim §3.19.3). Returns null on success or a failure. */
function click(rc: RC, role: string, text: string): { code: string; lines: string[] } | null {
  const t = target(rc, role);
  if (!t) return { code: 'DEVICE_UNREACHABLE', lines: [`[runner] ${role} handle lost`] };
  if (probeCovers(rc, t.display) && !isCoworker(rc, t.handle)) {
    const screen = orcaScreenFor(t.device, t.display);
    if (!screen) return { code: 'UI_NOT_FOUND', lines: [NF(text)] };
    const r = runnerXyTouch(rc, screen, text);
    if (!r.ok) return { code: 'XY_TOUCH_ERROR', lines: [r.line] };
    ssv(rc, 'after', r.respondsAfterMs);
    return null;
  }
  if (t.device.secureTouch || screenOf(t.device, t.display) === 'pin-entry') return { code: 'PIN_NEEDS_PHYSICAL', lines: ['PIN entry requires physical touch'] };
  const e = uiaClick(rc, role, text);
  if (e) return { code: 'UI_NOT_FOUND', lines: [e] };
  ssv(rc, 'after', 150);
  return null;
}

function cartTexts(rc: RC, d: TerminalDevice, display: 'primary' | 'secondary'): string[] {
  const texts = core()
    .layout(rc.lab, d.id, display)
    .filter((b) => b.visible)
    .map((b) => b.id);
  if (texts.some((x) => /^(?:TOTAL|Total) \$/.test(x))) return texts;
  // Fallback: the order mirrored from the MFD (tethered pay display).
  const mfd = target(rc, 'MFD')?.device ?? d;
  const o = mfd.order ?? d.order;
  if (!o) return texts;
  const $ = (c: number): string => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
  const v2 = d.cfdLayout === 'v2';
  return [`Subtotal ${$(o.subtotalCents)}`, `Tax ${$(o.taxCents)}`, `${v2 ? 'Total' : 'TOTAL'} ${$(o.totalCents)}`];
}

function ocrCompare(rc: RC, step: RunnerStep, name: string): Outcome {
  if (sv(rc, 'ocr') === undefined) {
    const r = core().screenCompare(rc.lab, rc.ctx, name, orcaActor(rc));
    if (!r.ok) return testFail(rc, step, 'OCR_CAPTURE', `[ocr] ${r.error}`);
    out(rc, r.value.line);
    if (!r.value.match) return testFail(rc, step, 'OCR_MISMATCH', `AssertionError: screenCompare ${name} returned false`);
    ssv(rc, 'ocr', 1);
  }
  return 'done';
}

/* ── customer flow segments ── */

const TRANSIENT: ScreenName[] = ['processing', 'printing', 'receipt-sent'];

function customer(rc: RC, step: RunnerStep): Outcome {
  const role = String(step.args['role'] ?? 'DEVICE');
  const seg = String(step.args['seg']);
  const t = target(rc, role);
  if (!t) return testFail(rc, step, 'DEVICE_UNREACHABLE', `[runner] ${role} handle lost`);
  const scr = (): ScreenName => screenOf(t.device, t.display);
  const prefix = String(step.args['prefix'] ?? '');
  const say = (s: string): void => {
    if (prefix) out(rc, `${prefix} ${s}`);
  };
  switch (seg) {
    case 'prompt': {
      if (scr() === 'cash-discount-tender' && sv(rc, 'card') === undefined) {
        const r = click(rc, role, 'Card');
        if (r) return testFail(rc, step, r.code, ...r.lines);
        ssv(rc, 'card', 1);
        return { sleep: 300 };
      }
      const w = waitUntil(rc, 'p', TIMEOUT_MS, () => ['payment-prompt', 'pin-entry', 'tip', 'processing', 'approved'].includes(scr()));
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', role === 'CFD' ? '[CFD] waitForScreen timed out (PaymentPromptScreen)' : '[runner] waitForScreen timed out: PaymentPromptScreen');
      say('payment prompt');
      return 'done';
    }
    case 'fired': {
      const w = waitUntil(rc, 'f', 30_000, () => !['payment-prompt', 'cash-discount-tender', 'declined'].includes(scr()));
      if (w === 'wait') return 'poll';
      const profile = String(step.args['profile'] || env(rc, 'CARD_PROFILE') || 'VISA_STD_SWIPE');
      if (w === 'timeout') {
        const toast = displayOf(t.device, t.display).toast?.text;
        // The reader's own error (Sim §3.6 #10: `[device] CHIP_READ_ERROR`, INC16/INC55) from the device log.
        const readErr = t.device.logcat
          .slice(-5)
          .reverse()
          .map((l) => /CardReader: ((?:SWIPE|CHIP|NFC)_\w*ERROR.*)$/.exec(l)?.[1])
          .find(Boolean);
        const lines = [`[callus] ${entryOf(rc, profile).toLowerCase()} ${profile} fired → ${readErr ? 'card read error' : (toast ?? 'no card event')}`];
        if (readErr) lines.push(`[device] ${readErr}`);
        return testFail(rc, step, 'CARD_ERROR', ...lines);
      }
      if (step.args['log'] !== false) out(rc, `[callus] ${entryOf(rc, profile).toLowerCase()} ${profile} fired → OK`);
      return 'done';
    }
    case 'pin': {
      const digits = String(step.args['pin'] ?? '1234').split('');
      const keys = [...digits, 'Enter'];
      if (sv(rc, 'k') === undefined) {
        // The device decides whether to ask (Sim §3.9.3): no PIN pad when it moved on (e.g. a contactless
        // tap under the CVM limit).
        const past = ['tip', 'processing', 'approved', 'receipt-options', 'thank-you'];
        const w = waitUntil(rc, 'pin', TIMEOUT_MS, () => (scr() === 'pin-entry' && rendered(rc, t.device, t.display)) || past.includes(scr()));
        if (w === 'wait') return 'poll';
        if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', '[runner] waitForScreen timed out: PinEntryScreen');
        if (scr() !== 'pin-entry') return 'done';
        if (!probeCovers(rc, t.display)) return testFail(rc, step, 'PIN_NEEDS_PHYSICAL', 'PIN entry requires physical touch');
        ssv(rc, 'k', 0);
      }
      const k = svn(rc, 'k') ?? 0;
      if (k < keys.length) {
        const screen = orcaScreenFor(t.device, t.display) ?? 'PIN_ENTRY';
        const r = runnerXyTouch(rc, screen, keys[k]!);
        if (!r.ok) return testFail(rc, step, 'XY_TOUCH_ERROR', r.line);
        ssv(rc, 'k', k + 1);
        return { sleep: Math.max(400, r.respondsAfterMs) };
      }
      const w = waitUntil(rc, 'after', TIMEOUT_MS, () => scr() !== 'pin-entry');
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'ASSERTION', `AssertionError: PIN not accepted — current screen: PinEntryScreen (${displayOf(t.device, t.display).toast?.text ?? 'no response'})`);
      return 'done';
    }
    case 'tip': {
      const button = String(step.args['button'] ?? 'No Tip');
      if (sv(rc, 'clicked') === undefined) {
        const w = waitUntil(rc, 'tip', 30_000, () => (scr() === 'tip' && rendered(rc, t.device, t.display)) || ['approved', 'receipt-options', 'thank-you'].includes(scr()));
        if (w === 'wait') return 'poll';
        if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: TipScreen`);
        if (scr() !== 'tip') return 'done';
        const r = click(rc, role, button);
        if (r) return testFail(rc, step, r.code, ...r.lines);
        ssv(rc, 'clicked', 1);
        return { sleep: Number(sv(rc, 'after') ?? 150) };
      }
      const w = waitUntil(rc, 'left', TIMEOUT_MS, () => scr() !== 'tip');
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: ${scr() === 'tip' ? 'TipScreen' : pageObjectName(t.device, t.display)}`);
      if (scr() === 'signature') return testFail(rc, step, 'ASSERTION', 'AssertionError: unexpected signature request (total above the merchant\'s signature threshold)');
      return 'done';
    }
    case 'approved': {
      const w = waitUntil(rc, 'ap', 30_000, () => ['approved', 'receipt-options', 'receipt-done', 'printing', 'thank-you'].includes(scr()));
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', scr() === 'declined' ? `AssertionError: payment declined (${displayOf(t.device, t.display).toast?.text ?? 'Declined'})` : '[runner] waitForScreen timed out: ApprovedScreen');
      const order = t.device.order ?? target(rc, 'MFD')?.device.order ?? target(rc, 'DEVICE')?.device.order ?? null;
      const auth = order?.tender === 'cash' ? 'cash' : (order?.authCode ?? t.device.lastReceiptDoc?.authCode ?? 'SIM000');
      say(`approved (${auth})`);
      return 'done';
    }
    case 'receipt': {
      const button = String(step.args['button'] ?? 'No Receipt');
      if (sv(rc, 'clicked') === undefined) {
        const cls = rc.host.tree[UIA_PATHS.po('ReceiptScreen')] ?? '';
        const sync = screenSync(cls, button === 'Print' ? 'print' : 'noReceipt');
        const w = waitUntil(rc, 'ro', TIMEOUT_MS, () => scr() === 'receipt-options');
        if (w === 'wait') return 'poll';
        if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', '[runner] waitForScreen timed out: ReceiptScreen');
        if (sv(rc, 'obs') === undefined) ssv(rc, 'obs', now(rc));
        if (sync.kind === 'wait') {
          const w2 = waitUntil(rc, 'rr', TIMEOUT_MS, () => rendered(rc, t.device, t.display));
          if (w2 === 'wait') return 'poll';
        } else {
          const at = (svn(rc, 'obs') ?? now(rc)) + (sync.kind === 'sleep' ? sync.ms : 700);
          if (now(rc) < at) return { sleep: at - now(rc) };
          if (!rendered(rc, t.device, t.display)) return testFail(rc, step, 'UI_NOT_FOUND', NF(button));
        }
        const r = click(rc, role, button);
        if (r) return testFail(rc, step, r.code, ...r.lines);
        ssv(rc, 'clicked', 1);
        return { sleep: Number(sv(rc, 'after') ?? 150) };
      }
      const w = waitUntil(rc, 'left', TIMEOUT_MS, () => scr() !== 'receipt-options');
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', `[runner] waitForScreen timed out: ThankYouScreen`);
      say(`receipt: ${button}`);
      return 'done';
    }
    case 'done': {
      if (sv(rc, 'clicked') === undefined) {
        const w = waitUntil(rc, 'rd', TIMEOUT_MS, () => (scr() === 'receipt-done' && rendered(rc, t.device, t.display)) || scr() === 'thank-you' || scr() === 'customer-idle');
        if (w === 'wait') return 'poll';
        if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', '[runner] waitForScreen timed out: ReceiptDoneScreen');
        if (scr() !== 'receipt-done') return 'done';
        const r = click(rc, role, 'Done');
        if (r) return testFail(rc, step, r.code, ...r.lines);
        ssv(rc, 'clicked', 1);
        return { sleep: Number(sv(rc, 'after') ?? 150) };
      }
      const w = waitUntil(rc, 'left', TIMEOUT_MS, () => scr() !== 'receipt-done');
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', '[runner] waitForScreen timed out: ThankYouScreen');
      return 'done';
    }
    case 'thanks': {
      const w = waitUntil(rc, 'ty', TIMEOUT_MS, () => ['thank-you', 'customer-idle', 'register', 'home'].includes(scr()) && !TRANSIENT.includes(scr()));
      if (w === 'wait') return 'poll';
      if (w === 'timeout') return testFail(rc, step, 'WAIT_TIMEOUT', '[runner] waitForScreen timed out: ThankYouScreen');
      return 'done';
    }
    default:
      return fail('ASSERTION', `[runner] internal: unknown customer segment ${seg}`);
  }
}

registerOps(ops);

/* ────────────────────────────── Plan compiler (Sim §3.19.4) ────────────────────────────── */

let stepSeq = 0;
function S(label: string, role: RunnerStep['role'], op: string, args: Record<string, string | number | boolean> = {}): RunnerStep {
  return { id: `s${++stepSeq}`, label, role, op, args };
}

export const TETHERED_TESTS = new Set(['TaxTest', 'TaxTestDuo', 'RefundTest', 'DuoCfdSuite', 'DuoCheckoutTest']);
const PIN_TESTS = new Set(['ContactCanadaPinSaleTest']);
export const testNeedsPin = (tests: string[]): boolean => tests.some((t) => PIN_TESTS.has(t));

export interface UiaPlanInput {
  tests: string[];
  env: Record<string, string>;
  tree: Record<string, string>;
  local: boolean;
}

/** Compile the run: compile check, header, handles, then per test setup → steps → teardown → result. */
export function compileUiaPlan(p: UiaPlanInput): RunnerStep[] {
  stepSeq = 0;
  const steps: RunnerStep[] = [];
  const e = p.env;
  const tethered = e['RUN_TYPE'] === 'tethered';
  const anyTethered = p.tests.some((t) => TETHERED_TESTS.has(t));
  const port = e['PORT_NUMBER'] || '5444';
  steps.push(S('compile', 'SETUP', 'compile', { tests: p.tests.join('|'), silent: true }));
  steps.push(S('header', 'SETUP', 'uiaHeader', { silent: true }));
  const roles: ('MFD' | 'CFD' | 'DEVICE')[] = [];
  if (tethered && anyTethered) {
    steps.push(S('MFD handle', 'MFD', 'connect', { role: 'MFD', ip: e['MFD_IP'] ?? '', port }));
    steps.push(S('CFD handle', 'CFD', 'connect', { role: 'CFD', ip: e['CFD_IP'] ?? '', port }));
    roles.push('MFD', 'CFD');
  } else {
    if (tethered && !p.local) steps.push(S('tethered detected', 'SETUP', 'log', { text: `[runner] Tethered rig detected (MFD populated) → MFD ${e['MFD_IP']}:${port}, CFD ${e['CFD_IP']}:${port}`, silent: true }));
    steps.push(S('DEVICE handle', 'DEVICE', 'connect', { role: 'DEVICE', ip: e['MFD_IP'] ?? '', port }));
    roles.push('DEVICE');
  }
  for (const test of p.tests) steps.push(...compileTest(test, p, roles));
  return steps;
}

function compileTest(test: string, p: UiaPlanInput, roles: string[]): RunnerStep[] {
  const out: RunnerStep[] = [];
  const src = p.tree[UIA_PATHS.test(test)] ?? '';
  const tethered = TETHERED_TESTS.has(test);
  const logical: string[] = [];
  const L = (id: string): string => {
    logical.push(id);
    return id;
  };
  const r = tethered ? 'MFD' : 'DEVICE';
  const R = r as RunnerStep['role'];
  out.push(S(`${test}`, 'SETUP', 'testStart', { test, silent: true }));
  if (tethered) out.push(S(`${test} tether guard`, 'SETUP', 'tetherGuard', { test }));
  out.push(S(`${test} setup`, 'SETUP', 'setup', { roles: roles.join('|'), silent: true }));
  for (const role of tethered ? ['MFD', ...(test === 'TaxTest' || test === 'RefundTest' ? ['CFD'] : [])] : roles) {
    out.push(S(`HomeScreen.isScreenPresent (${role})`, role as RunnerStep['role'], 'assertHome', { role, test }));
  }
  const ui = (label: string, role: string, cls: string, method: string, text: string, from: string, to: string, logicalId: string | null, log?: string, extra: Record<string, string | number | boolean> = {}): RunnerStep =>
    S(label, role as RunnerStep['role'], 'ui', { role, cls, method, text, from, to, test, ...(logicalId ? { logical: logicalId } : {}), ...(log ? { log } : {}), ...extra });
  const pfx = (s: string): string => (tethered ? s : '[DEVICE]');
  const saleStart = (prefixA: string, idA: string | null, idB: string | null, idC: string | null, idD: string | null): void => {
    out.push(S(`open Register`, R, 'open', { role: r, app: 'Register', test, ...(idA ? { logical: idA } : {}), log: `${prefixA} open Register` }));
    out.push(ui('addTaxItem5', r, 'RegisterHomeScreen', 'addTaxItem5', 'Tax Item 5', 'register', 'register', idB, `${prefixA} add "Tax Item 5"`));
    out.push(ui('reviewOrder', r, 'RegisterHomeScreen', 'reviewOrder', 'Review Order', 'register', 'review-order', idC, `${prefixA} Review Order`));
    void idD;
  };

  switch (test) {
    case 'HomeScreenTest': {
      for (const app of ['Register', 'Orders', 'Setup']) {
        const id = L(`open-${app}`);
        out.push(S(`open ${app}`, R, 'open', { role: r, app, test, log: `[DEVICE] open ${app}` }));
        out.push(S(`goHome`, R, 'keyHome', { role: r, silent: true }));
        out.push(S(`HomeScreen after ${app}`, R, 'assertHome', { role: r, test, logical: id }));
      }
      out.push(S('return home', R, 'assertHome', { role: r, test, logical: L('home') }));
      break;
    }
    case 'SaleTest':
    case 'PrinterlessSmokeTest':
    case 'ReceiptScreenTest': {
      const ids = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => L(`${test}-${n}`));
      // Station Duo (one device, two displays): the customer steps happen on the CFD display (Sim §3.9.5).
      const duoDev = /^STATION_DUO/.test(p.env['DEVICE_TYPE'] ?? '');
      const c = duoDev ? 'CFD' : r;
      const C = c as RunnerStep['role'];
      const cp = duoDev ? '[CFD]' : '[DEVICE]';
      out.push(S('open Register', R, 'open', { role: r, app: 'Register', test, logical: ids[0]!, log: '[DEVICE] open Register' }));
      out.push(ui('addTaxItem5', r, 'RegisterHomeScreen', 'addTaxItem5', 'Tax Item 5', 'register', 'register', ids[1]!, '[DEVICE] add "Tax Item 5"'));
      out.push(ui('reviewOrder', r, 'RegisterHomeScreen', 'reviewOrder', 'Review Order', 'register', 'review-order', ids[2]!, '[DEVICE] Review Order'));
      out.push(ui('pay', r, 'ReviewOrderScreen', 'pay', 'Pay', 'review-order', 'tender-select', ids[3]!, '[DEVICE] Pay'));
      if (test === 'PrinterlessSmokeTest') {
        // Printerless smoke runs on ADB bots (no Dip/Tap/Swipe URLs, Sim §2.3): `payment.cash()`.
        out.push(ui('cash', r, 'PaymentScreen', 'cash', 'Cash', 'tender-select', duoDev ? 'waiting-for-customer|approved|receipt-options' : 'approved|receipt-options', ids[4]!, '[DEVICE] Cash'));
        logical.splice(logical.indexOf(ids[5]!), 1);
      } else {
        out.push(ui('charge', r, 'PaymentScreen', 'charge', 'Charge', 'tender-select', duoDev ? 'waiting-for-customer|payment-prompt' : 'payment-prompt|cash-discount-tender', null, '[DEVICE] Charge'));
        out.push(S('card', R, 'card', { test, profile: '', logical: ids[4]!, log: '[DEVICE] orca → callus: {entry} {profile} … OK' }));
        out.push(S('payment prompt', C, 'cust', { role: c, seg: 'prompt', test, ...(duoDev ? { prefix: cp } : {}) }));
        out.push(S('card fired', C, 'cust', { role: c, seg: 'fired', test, profile: '' }));
        out.push(S('noTip', C, 'cust', { role: c, seg: 'tip', button: 'No Tip', test, logical: ids[5]! }));
      }
      out.push(S('approved', C, 'cust', { role: c, seg: 'approved', test, prefix: cp }));
      out.push(S('noReceipt', C, 'cust', { role: c, seg: 'receipt', button: 'No Receipt', test, logical: ids[6]!, prefix: cp }));
      if (duoDev) out.push(S('done', C, 'cust', { role: c, seg: 'done', test }));
      out.push(S('thank you', C, 'cust', { role: c, seg: 'thanks', test, logical: ids[7]! }));
      break;
    }
    case 'TaxTest':
    case 'TaxTestDuo': {
      const duo = test === 'TaxTestDuo';
      const o1 = L('MFD_O1');
      const c1 = L('CFD_O1');
      const o2 = L('MFD_O2');
      const s4 = L('Step 4');
      out.push(S('MFD_O1 open Register', 'MFD', 'open', { role: 'MFD', app: 'Register', test, log: '[MFD_O1] open Register' }));
      out.push(ui('MFD_O1 addTaxItem5', 'MFD', 'RegisterHomeScreen', 'addTaxItem5', 'Tax Item 5', 'register', 'register', null, '[MFD_O1] add "Tax Item 5"'));
      out.push(ui('MFD_O1 reviewOrder', 'MFD', 'RegisterHomeScreen', 'reviewOrder', 'Review Order', 'register', 'review-order', null, '[MFD_O1] Review Order'));
      out.push(S('MFD_O1 card', 'MFD', 'card', { test, entry: 'SWIPE', logical: o1, log: '[MFD_O1] orca → callus: load swipe card {profile} … OK' }));
      const ocr = screenCompareNames(src);
      if (duo && ocr.includes('CFD_TOTAL')) out.push(S('CFD_O1 screenCompare', 'CFD', 'cfdTotals', { via: 'ocr', name: 'CFD_TOTAL', test, logical: c1 }));
      else out.push(S('CFD_O1 totals', 'CFD', 'cfdTotals', { via: 'uia', test, logical: c1, ...(duo ? { only: 'total' } : {}) }));
      out.push(ui('MFD_O2 pay', 'MFD', 'ReviewOrderScreen', 'pay', 'Pay', 'review-order', 'tender-select', null, '[MFD_O2] Pay'));
      out.push(ui('MFD_O2 charge', 'MFD', 'PaymentScreen', 'charge', 'Charge', 'tender-select', 'waiting-for-customer|payment-prompt|register|review-order', o2, '[MFD_O2] Charge'));
      out.push(S('Step 4 prompt', 'CFD', 'cust', { role: 'CFD', seg: 'prompt', test, prefix: '[CFD]' }));
      out.push(S('Step 4 card fired', 'CFD', 'cust', { role: 'CFD', seg: 'fired', test }));
      out.push(S('Step 4 noTip', 'CFD', 'cust', { role: 'CFD', seg: 'tip', button: 'No Tip', test }));
      out.push(S('Step 4 approved', 'CFD', 'cust', { role: 'CFD', seg: 'approved', test, prefix: '[CFD]' }));
      out.push(S('Step 4 noReceipt', 'CFD', 'cust', { role: 'CFD', seg: 'receipt', button: 'No Receipt', test, prefix: '[CFD]' }));
      if (duo) out.push(S('Step 4 done', 'CFD', 'cust', { role: 'CFD', seg: 'done', test }));
      out.push(S('Step 4 thank you', 'CFD', 'cust', { role: 'CFD', seg: 'thanks', test, logical: s4 }));
      break;
    }
    case 'RefundTest': {
      const a = L('open-Orders');
      const b = L('home');
      out.push(S('open Orders', 'MFD', 'open', { role: 'MFD', app: 'Orders', test, logical: a, log: '[MFD] open Orders' }));
      out.push(S('goHome', 'MFD', 'keyHome', { role: 'MFD', silent: true }));
      out.push(S('HomeScreen', 'MFD', 'assertHome', { role: 'MFD', test, logical: b }));
      break;
    }
    case 'DuoCfdSuite':
    case 'DuoCheckoutTest': {
      const ids = ['MFD', 'CFD_TOTAL', 'payment', 'customer', 'final'].map((x) => L(`${test}-${x}`));
      saleStart('[MFD]', null, null, null, null);
      out[out.length - 1]!.args['logical'] = ids[0]!;
      const compares = screenCompareNames(src);
      if (test === 'DuoCfdSuite' || compares.includes('CFD_TOTAL')) {
        if (compares.includes('CFD_TOTAL')) out.push(S('screenCompare CFD_TOTAL', 'CFD', 'cfdTotals', { via: 'ocr', name: 'CFD_TOTAL', test, logical: ids[1]! }));
        else out.push(S('CFD total (UIA 2.3)', 'CFD', 'cfdTotals', { via: 'uia', only: 'total', test, logical: ids[1]! }));
      } else logical.splice(logical.indexOf(ids[1]!), 1);
      out.push(ui('pay', 'MFD', 'ReviewOrderScreen', 'pay', 'Pay', 'review-order', 'tender-select', null, '[MFD] Pay'));
      out.push(ui('charge', 'MFD', 'PaymentScreen', 'charge', 'Charge', 'tender-select', 'waiting-for-customer|payment-prompt', null, '[MFD] Charge'));
      out.push(S('card', 'MFD', 'card', { test, entry: 'SWIPE', profile: 'VISA_STD_SWIPE', logical: ids[2]!, log: '[MFD] orca → callus: load swipe card {profile} … OK' }));
      out.push(S('prompt', 'CFD', 'cust', { role: 'CFD', seg: 'prompt', test, prefix: '[CFD]' }));
      out.push(S('fired', 'CFD', 'cust', { role: 'CFD', seg: 'fired', test, profile: 'VISA_STD_SWIPE' }));
      out.push(S('CFD_TIP No Tip', 'CFD', 'cust', { role: 'CFD', seg: 'tip', button: 'No Tip', test }));
      out.push(S('approved', 'CFD', 'cust', { role: 'CFD', seg: 'approved', test, prefix: '[CFD]' }));
      out.push(S('No Receipt', 'CFD', 'cust', { role: 'CFD', seg: 'receipt', button: 'No Receipt', test, prefix: '[CFD]' }));
      out.push(S('CFD_RECEIPT_DONE Done', 'CFD', 'cust', { role: 'CFD', seg: 'done', test, logical: ids[3]! }));
      if (test === 'DuoCheckoutTest') {
        if (compares.includes('CFD_THANK_YOU')) out.push(S('screenCompare CFD_THANK_YOU', 'CFD', 'screenCompare', { name: 'CFD_THANK_YOU', test, logical: ids[4]! }));
        else out.push(S('CfdThankYouScreen', 'CFD', 'uiaCheck', { role: 'CFD', cls: 'CfdThankYouScreen', screen: 'thank-you', text: 'Thank you', test, logical: ids[4]!, log: '[CFD] Thank you ✓ (UIA 2.3)' }));
      } else {
        out.push(S('thank you', 'CFD', 'cust', { role: 'CFD', seg: 'thanks', test, logical: ids[4]! }));
      }
      break;
    }
    case 'ContactCanadaPinSaleTest': {
      const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => L(`${test}-${n}`));
      out.push(S('open Register', R, 'open', { role: r, app: 'Register', test, logical: ids[0]!, log: '[DEVICE] open Register' }));
      out.push(ui('addTaxItem5', r, 'RegisterHomeScreen', 'addTaxItem5', 'Tax Item 5', 'register', 'register', ids[1]!, '[DEVICE] add "Tax Item 5"'));
      out.push(ui('reviewOrder', r, 'RegisterHomeScreen', 'reviewOrder', 'Review Order', 'register', 'review-order', ids[2]!, '[DEVICE] Review Order'));
      out.push(ui('pay', r, 'ReviewOrderScreen', 'pay', 'Pay', 'review-order', 'tender-select', ids[3]!, '[DEVICE] Pay'));
      out.push(ui('charge', r, 'PaymentScreen', 'charge', 'Charge', 'tender-select', 'payment-prompt|cash-discount-tender', null, '[DEVICE] Charge'));
      // CARD_PROFILE (job default INTERAC_CA_DIP); the entry follows the profile (Sim §3.6), so
      // INTERAC_CA_TAP taps — and under the contactless CVM limit the device asks for no PIN.
      const prof = p.env['CARD_PROFILE'] || 'INTERAC_CA_DIP';
      out.push(S(`card ${prof}`, R, 'card', { test, profile: prof, logical: ids[4]!, log: '[DEVICE] orca → callus: {entry} {profile} … OK' }));
      out.push(S('prompt', R, 'cust', { role: r, seg: 'prompt', test }));
      out.push(S('fired', R, 'cust', { role: r, seg: 'fired', test, profile: prof }));
      out.push(S('PIN', R, 'cust', { role: r, seg: 'pin', pin: '1234', test, logical: ids[5]! }));
      out.push(S('noTip', R, 'cust', { role: r, seg: 'tip', button: 'No Tip', test, logical: ids[6]! }));
      out.push(S('approved', R, 'cust', { role: r, seg: 'approved', test, prefix: '[DEVICE]' }));
      out.push(S('noReceipt', R, 'cust', { role: r, seg: 'receipt', button: 'No Receipt', test, logical: ids[7]!, prefix: '[DEVICE]' }));
      out.push(S('evidence', R, 'evidence', { test, logical: ids[8]! }));
      break;
    }
    case 'PaycoreMatrixTest': {
      const profiles = (p.env['CARD_PROFILE'] || 'VISA_STD_DIP').split(',').map((x) => x.trim()).filter(Boolean);
      for (const prof of profiles) {
        const id = L(`paycore-${prof}`);
        out.push(S(`open Register (${prof})`, R, 'open', { role: r, app: 'Register', test }));
        out.push(ui('addTaxItem5', r, 'RegisterHomeScreen', 'addTaxItem5', 'Tax Item 5', 'register', 'register', null));
        out.push(ui('reviewOrder', r, 'RegisterHomeScreen', 'reviewOrder', 'Review Order', 'register', 'review-order', null));
        out.push(ui('pay', r, 'ReviewOrderScreen', 'pay', 'Pay', 'review-order', 'tender-select', null));
        out.push(ui('charge', r, 'PaymentScreen', 'charge', 'Charge', 'tender-select', 'payment-prompt|cash-discount-tender', null));
        out.push(S(`dip ${prof}`, R, 'card', { test, entry: 'DIP', profile: prof }));
        out.push(S('prompt', R, 'cust', { role: r, seg: 'prompt', test }));
        out.push(S('fired', R, 'cust', { role: r, seg: 'fired', test, profile: prof, log: false }));
        out.push(S('noTip', R, 'cust', { role: r, seg: 'tip', button: 'No Tip', test }));
        out.push(S('approved', R, 'cust', { role: r, seg: 'approved', test }));
        out.push(S(`[paycore] ${prof}`, R, 'paycoreLog', { profile: prof, test }));
        out.push(S('noReceipt', R, 'cust', { role: r, seg: 'receipt', button: 'No Receipt', test }));
        out.push(S('thanks', R, 'cust', { role: r, seg: 'thanks', test, logical: id }));
        out.push(S('goHome', R, 'keyHome', { role: r, silent: true }));
        out.push(S('settle', R, 'delay', { ms: 600, silent: true }));
      }
      break;
    }
    default:
      out.push(S(`${test}`, R, 'log', { text: `[runner] ${test}: no runnable steps`, silent: true }));
  }
  out.push({ ...S(`${test} teardown`, 'SETUP', 'teardown', { test, roles: (tethered ? (test === 'TaxTest' || test === 'TaxTestDuo' || test === 'RefundTest' ? ['MFD', 'CFD'] : ['MFD']) : roles).join('|'), silent: true }), id: `td:${test}` });
  out.push(S(`${test} result`, 'SETUP', 'testEnd', { test, steps: logical.join('|'), silent: true }));
  void pfx;
  return out;
}

/** Test classes listed in a Jenkinsfile (`def tests = ['A', 'B']`), else the job's testRef class. */
export function testsFromScript(script: string, fallbackPath: string | null): string[] {
  const m = /^\s*def\s+tests\s*=\s*\[([^\]]*)\]/m.exec(script);
  if (m) return [...m[1]!.matchAll(/['"]([\w]+)['"]/g)].map((x) => x[1]!);
  if (fallbackPath) return [fallbackPath.slice(fallbackPath.lastIndexOf('/') + 1).replace(/\.java$/, '')];
  return [];
}

export { familyOf };
