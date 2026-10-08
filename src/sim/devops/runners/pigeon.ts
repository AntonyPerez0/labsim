/**
 * Pigeon LSTR runner (Sim §3.20): strict JSON parse with the unhelpful messages, schema + platform checks,
 * variable resolution, and the Android action set — every UI action through Orca xy_touch, waits polling
 * the device, "card swipe" abstracted into robot actions, and the misleading "select print" timeout.
 * REST / WINDOWS / IOS runners are scripted passes unless the JSON is broken (or REST credentials empty).
 */
import type { RunnerStep, ScreenName } from '../../types';
import { core } from '../coreRef';
import { parseStrictJson } from '../json';
import type { JsonValue } from '../json';
import { fmtMoney } from '../util';
import { now, orcaActor, out, registerOps, rendered, runnerAdb, screenOf, ssv, sv, svn, target, TIMEOUT_MS } from './engine';
import type { Outcome, RC, StepHandler } from './engine';

export interface LstrAction {
  action: string;
  params: Record<string, JsonValue>;
  store: string | null;
}

export type LstrCompile = { ok: true; name: string; platforms: string[]; actions: LstrAction[] } | { ok: false; code: string; lines: string[] };

/** Parse + schema + platform check (Sim §3.20.1–§3.20.2). */
export function compileLstr(text: string, platform: string): LstrCompile {
  const r = parseStrictJson(text);
  if (!r.ok) return { ok: false, code: 'JSON_PARSE', lines: [`LSTR ParseError: ${r.error}`] };
  const v = r.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, code: 'JSON_PARSE', lines: ['LSTR SchemaError: missing "name"'] };
  for (const k of ['name', 'connectionType', 'platforms', 'actions']) if (!(k in v)) return { ok: false, code: 'JSON_PARSE', lines: [`LSTR SchemaError: missing "${k}"`] };
  const platforms = Array.isArray(v['platforms']) ? (v['platforms'] as JsonValue[]).map(String) : [];
  if (!Array.isArray(v['actions'])) return { ok: false, code: 'JSON_PARSE', lines: ['LSTR SchemaError: missing "actions"'] };
  if (!platforms.includes(platform)) return { ok: false, code: 'LSTR_PLATFORM', lines: [`LSTR platform ${platform} not in test platforms [${platforms.join(', ')}]`] };
  const actions: LstrAction[] = (v['actions'] as JsonValue[]).map((a) => {
    const o = (a && typeof a === 'object' && !Array.isArray(a) ? a : {}) as Record<string, JsonValue>;
    return { action: String(o['action'] ?? ''), params: (o['params'] && typeof o['params'] === 'object' && !Array.isArray(o['params']) ? o['params'] : {}) as Record<string, JsonValue>, store: typeof o['store'] === 'string' ? o['store'] : null };
  });
  return { ok: true, name: String(v['name']), platforms, actions };
}

let seq = 0;
const S = (label: string, op: string, args: Record<string, string | number | boolean>): RunnerStep => ({ id: `p${++seq}`, label, role: 'DEVICE', op, args });

/** Steps for an LSTR run of `path` on `platform`. */
export function compilePigeonPlan(text: string, path: string, platform: string, env: Record<string, string>, local: boolean): RunnerStep[] {
  seq = 0;
  const c = compileLstr(text, platform);
  if (!c.ok) return [S('parse', 'lstrFail', { code: c.code, lines: c.lines.join('\n') })];
  const steps: RunnerStep[] = [S('header', 'log', { text: `LSTR 2.8.1 · platform ${platform} · ${path} · ${c.actions.length} actions`, silent: true })];
  if (platform === 'ANDROID') steps.push({ id: 'p-conn', label: 'DEVICE handle', role: 'DEVICE', op: 'connect', args: { role: 'DEVICE', ip: env['MFD_IP'] ?? '', port: env['PORT_NUMBER'] || '5444' } });
  const n = c.actions.length;
  c.actions.forEach((a, i) => {
    steps.push(S(a.action, platform === 'ANDROID' ? 'lstr' : 'lstrScripted', { i: i + 1, n, action: a.action, params: JSON.stringify(a.params), store: a.store ?? '', platform }));
  });
  steps.push(S('result', 'log', { text: `LSTR PASSED (${n}/${n} actions) — ${c.name}`, silent: true }));
  void local;
  return steps;
}

/* ── variable resolution (stored outputs, then env, then runner variables) ── */

function resolveVars(rc: RC, params: Record<string, JsonValue>): { ok: true; p: Record<string, string> } | { ok: false; v: string } {
  const outp: Record<string, string> = {};
  for (const [k, raw] of Object.entries(params)) {
    let s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const m = s.match(/\$\{(\w+)\}/g) ?? [];
    for (const tok of m) {
      const name = tok.slice(2, -1);
      const val = rc.rs.vars[`v.${name}`] ?? rc.host.env[name] ?? rc.rs.vars[`r.${name}`];
      if (val === undefined || val === '') return { ok: false, v: tok };
      s = s.replace(tok, val);
    }
    outp[k] = s;
  }
  return { ok: true, p: outp };
}

const ACTION_TIMEOUTS = { screen: TIMEOUT_MS, card: 30_000, payload: 60_000 };

function lineFor(step: RunnerStep, tail: string): string {
  return `${step.args['tag'] ?? 'LSTR'} step ${step.args['i']}/${step.args['n']} "${step.args['action']}" … ${tail}`;
}
function pFail(step: RunnerStep, code: string, tail: string, extra: string[] = []): Outcome {
  return { fail: code, lines: [...extra, lineFor(step, tail), `FAILED at "${step.args['action']}"`] };
}

/** xy_touch through Orca; returns respondsAfterMs or a failure. */
function touch(rc: RC, step: RunnerStep, robot: string, screen: string, button: string): number | Outcome {
  const res = core().xyTouch(rc.lab, rc.ctx, robot, screen, button, orcaActor(rc));
  if (!res.ok) return { fail: 'XY_TOUCH_ERROR', lines: [`LSTR xy_touch ${robot} ${screen}/${button}`, `[orca] ${res.error.replace(/^\[orca\] /, '')}`, `FAILED at "${step.args['action']}"`] };
  // The REST call returns when the stroke completes (Sim §3.5.2 #8).
  if (res.value.orcaMode === 'PHYSICAL_TAP') ssv(rc, 'xyReq', res.value.requestId);
  return res.value.respondsAfterMs;
}

/**
 * A small per-action program: a queue of sub-ops kept in scratch vars:
 *   T:<screen>:<button>   tap through Orca, then sleep its response time
 *   W:<screens|...>:<ms>  wait until the screen is one of them (fails with "expected screen …")
 *   K:<KEYCODE>           adb keyevent
 */
function program(rc: RC, step: RunnerStep, robot: string, prog: string[]): Outcome | null {
  const t = target(rc, 'DEVICE');
  if (!t) return pFail(step, 'DEVICE_UNREACHABLE', 'device handle lost');
  let pc = svn(rc, 'pc') ?? 0;
  while (pc < prog.length) {
    const ins = prog[pc]!;
    const [kind, a, b] = ins.split('\u0001') as [string, string, string];
    if (kind === 'T') {
      // LSTR polls the hierarchy over ADB before each tap; an element shows up there only once drawn.
      if (!rendered(rc, t.device, 'primary')) {
        const st = svn(rc, 'tstart');
        if (st === null) {
          ssv(rc, 'tstart', now(rc));
          return 'poll';
        }
        if (now(rc) - st < ACTION_TIMEOUTS.screen) return 'poll';
      }
      delete rc.rs.vars['_s.tstart'];
      const r = touch(rc, step, robot, a, b);
      if (typeof r !== 'number') return r;
      ssv(rc, 'pc', ++pc);
      return { sleep: r };
    }
    if (kind === 'K') {
      runnerAdb(rc, t.handle, ['shell', 'input', 'keyevent', a]);
      ssv(rc, 'pc', ++pc);
      return { sleep: 300 };
    }
    if (kind === 'U') {
      if (t.device.locked || screenOf(t.device, 'primary') === 'lock') {
        runnerAdb(rc, t.handle, ['shell', 'input', 'text', rc.host.env['UNLOCK_PASSCODE'] || '0000']);
        runnerAdb(rc, t.handle, ['shell', 'input', 'keyevent', 'KEYCODE_ENTER']);
        ssv(rc, 'pc', ++pc);
        return { sleep: 500 };
      }
      ssv(rc, 'pc', ++pc);
      continue;
    }
    if (kind === 'W') {
      const want = a.split('|') as ScreenName[];
      const cur = screenOf(t.device, 'primary');
      // The runner polls over ADB (hierarchy dumps), which only show a screen once it has rendered.
      if (want.includes(cur) && rendered(rc, t.device, 'primary')) {
        ssv(rc, 'pc', ++pc);
        delete rc.rs.vars['_s.wstart'];
        continue;
      }
      const st = svn(rc, 'wstart');
      if (st === null) {
        ssv(rc, 'wstart', now(rc));
        return 'poll';
      }
      if (now(rc) - st < Number(b)) return 'poll';
      return pFail(step, 'WAIT_TIMEOUT', `expected screen ${want[0]}, still ${cur} after ${Math.round(Number(b) / 1000)} s`);
    }
    ssv(rc, 'pc', ++pc);
  }
  return null;
}
const T = (screen: string, button: string): string => `T\u0001${screen}\u0001${button}`;
const W = (screens: string, ms: number): string => `W\u0001${screens}\u0001${ms}`;
const K = (key: string): string => `K\u0001${key}`;
const U = 'U';

const ops: Record<string, StepHandler> = {
  lstrFail(rc, step) {
    return { fail: String(step.args['code']), lines: String(step.args['lines']).split('\n') };
  },
  /** REST / WINDOWS / IOS: scripted pass per action (Sim §3.20.3 "Other runners"). */
  lstrScripted(rc, step) {
    if (sv(rc, 'st') === undefined) {
      ssv(rc, 'st', now(rc));
      return { sleep: 1200 };
    }
    const platform = String(step.args['platform']);
    const action = String(step.args['action']);
    const secs = ((now(rc) - (svn(rc, 'st') ?? now(rc))) / 1000).toFixed(1);
    if (platform === 'REST') {
      const isCard = /^card (swipe|dip|tap)$/.test(action);
      const url = `https://apisandbox.${(rc.host.env['BACKEND_ENV'] || 'DEV1').toLowerCase()}.labsim.example/v1/${isCard ? 'payments' : `lstr/${action.replace(/ /g, '-')}`}`;
      if (isCard && !rc.host.env['API_KEY']) return pFail(step, 'MISSING_CREDENTIAL', `POST ${url} → 401 Unauthorized (API_KEY empty)`);
      out(rc, lineFor(step, `POST ${url} → 200 OK (${secs} s)`));
    } else out(rc, lineFor(step, `OK (${secs} s)`));
    if (step.args['store']) rc.rs.vars[`v.${step.args['store']}`] = `${String(step.args['store'])}-${rc.lab.seq.run}${step.args['i']}`;
    return 'done';
  },
  /** Android LSTR action (Sim §3.20.3). */
  lstr(rc, step) {
    const action = String(step.args['action']);
    const t = target(rc, 'DEVICE');
    if (!t) return pFail(step, 'DEVICE_UNREACHABLE', 'device handle lost');
    if (sv(rc, 'start') === undefined) ssv(rc, 'start', now(rc));
    const params = JSON.parse(String(step.args['params'])) as Record<string, JsonValue>;
    const receiptAction = /^select (print|email|text|no receipt|scan)$/.test(action);
    // Receipt actions: count the options on screen first (runner variable RECEIPT_SCREEN).
    if (receiptAction && sv(rc, 'counted') === undefined) {
      const cur = screenOf(t.device, 'primary');
      // Counting options needs the rendered hierarchy (ADB dump).
      if (cur !== 'receipt-options' || !rendered(rc, t.device, 'primary')) {
        const st = svn(rc, 'rwait');
        // The payment is still being authorised / shown as Approved: the 10 s screen wait starts after it.
        if (cur === 'processing' || cur === 'approved') {
          if (st !== null) ssv(rc, 'rwait', now(rc));
          return 'poll';
        }
        if (st === null) {
          ssv(rc, 'rwait', now(rc));
          return 'poll';
        }
        if (now(rc) - st < ACTION_TIMEOUTS.screen) return 'poll';
        return pFail(step, 'WAIT_TIMEOUT', `expected screen receipt-options, still ${cur} after 10 s`);
      }
      rc.rs.vars['r.RECEIPT_SCREEN'] = `RECEIPT_OPTIONS_${t.device.display.receiptOptions ?? 4}`;
      ssv(rc, 'counted', 1);
    }
    const res = resolveVars(rc, params);
    if (!res.ok) return pFail(step, 'ASSERTION', `LSTR unresolved variable ${res.v}`);
    const p = res.p;
    const robot = p['robot'] || rc.host.env['ROBOT_NAME'] || rc.host.robot?.name || '';
    const done = (): Outcome => {
      const secs = ((now(rc) - (svn(rc, 'start') ?? now(rc))) / 1000).toFixed(1);
      out(rc, lineFor(step, `OK (${secs} s)`));
      return 'done';
    };
    const store = (v: string): void => {
      if (step.args['store']) rc.rs.vars[`v.${step.args['store']}`] = v;
    };
    let prog: string[] | null = null;
    switch (action) {
      case 'create order':
        prog = [U, K('KEYCODE_HOME'), W('home', ACTION_TIMEOUTS.screen), T('HOME', 'Register'), W('register', ACTION_TIMEOUTS.screen), T('REGISTER_HOME', p['item'] || 'Tax Item 5')];
        break;
      case 'review order':
        prog = [W('register', ACTION_TIMEOUTS.screen), T('REGISTER_HOME', 'Review Order'), W('review-order', ACTION_TIMEOUTS.screen)];
        break;
      case 'pay':
        prog = [W('review-order', ACTION_TIMEOUTS.screen), T('REVIEW_ORDER', 'Pay'), W('tender-select', ACTION_TIMEOUTS.screen), T('PAYMENT', 'Charge'), W('payment-prompt|cash-discount-tender', ACTION_TIMEOUTS.screen)];
        break;
      case 'select tip':
        prog = [W('tip', ACTION_TIMEOUTS.card), T(p['screen'] || 'TIP', p['button'] || 'No Tip'), W('processing|approved|signature|receipt-options|pin-entry', ACTION_TIMEOUTS.screen)];
        break;
      case 'add tip':
        prog = [W('tip', ACTION_TIMEOUTS.card), T('TIP', `${p['percent'] ?? '18'}%`), W('processing|approved|signature|receipt-options', ACTION_TIMEOUTS.screen)];
        break;
      case 'assert approved':
        prog = [W('approved|receipt-options|printing|thank-you', ACTION_TIMEOUTS.card)];
        break;
      case 'assert screen':
        prog = [W(p['screen'] || 'home', ACTION_TIMEOUTS.screen)];
        break;
      case 'assert home':
        prog = [W('thank-you|register|home|receipt-options', ACTION_TIMEOUTS.screen), K('KEYCODE_HOME'), W('home', ACTION_TIMEOUTS.screen)];
        break;
      case 'tap':
        prog = [T(p['screen'] || '', p['button'] || '')];
        break;
      case 'select email':
      case 'select text':
      case 'select no receipt':
      case 'select scan': {
        const button = { 'select email': 'Email', 'select text': 'Text', 'select no receipt': 'No Receipt', 'select scan': 'Scan for receipt' }[action]!;
        prog = [T(p['screen'] || rc.rs.vars['r.RECEIPT_SCREEN'] || 'RECEIPT_OPTIONS_4', button), W('thank-you|receipt-sent|register', ACTION_TIMEOUTS.screen)];
        break;
      }
      default:
        break;
    }
    if (prog) {
      const r = program(rc, step, robot, prog);
      if (r) return r;
      if (action === 'create order') store(t.device.order?.id ?? `ORD-${robot.toUpperCase()}`);
      if (action === 'add tip') store(`TIP-${t.device.order?.id ?? robot}`);
      return done();
    }
    switch (action) {
      case 'wait': {
        if (sv(rc, 'w') === undefined) {
          ssv(rc, 'w', 1);
          return { sleep: Number(p['ms'] ?? 1000) };
        }
        return done();
      }
      case 'card swipe':
      case 'card dip':
      case 'card tap': {
        const entry = action.slice(5).toUpperCase() as 'SWIPE' | 'DIP' | 'TAP';
        // The abstraction drives the order to the payment prompt first when needed.
        const pre = [W('register|review-order|tender-select|payment-prompt|cash-discount-tender', ACTION_TIMEOUTS.screen)];
        const cur = screenOf(t.device, 'primary');
        if (sv(rc, 'sent') === undefined) {
          const drive: string[] = [];
          if (cur === 'register') drive.push(T('REGISTER_HOME', 'Review Order'), W('review-order', ACTION_TIMEOUTS.screen));
          if (cur === 'register' || cur === 'review-order') drive.push(T('REVIEW_ORDER', 'Pay'), W('tender-select', ACTION_TIMEOUTS.screen));
          if (cur === 'register' || cur === 'review-order' || cur === 'tender-select') drive.push(T('PAYMENT', 'Charge'), W('payment-prompt|cash-discount-tender', ACTION_TIMEOUTS.screen));
          if (sv(rc, 'drive') === undefined) ssv(rc, 'drive', JSON.stringify([...pre, ...drive]));
          const r = program(rc, step, robot, JSON.parse(sv(rc, 'drive')!) as string[]);
          if (r) return r;
          if (screenOf(t.device, 'primary') === 'cash-discount-tender') {
            const rr = touch(rc, step, robot, 'TENDER_CASH_DISCOUNT', 'Card');
            if (typeof rr !== 'number') return rr;
          }
          const res2 = core().cardAction(rc.lab, rc.ctx, robot, entry, p['profile'] || 'VISA_STD_SWIPE', orcaActor(rc));
          if (!res2.ok) return pFail(step, 'CARD_ERROR', res2.error.split('\n').pop() ?? res2.error, res2.error.split('\n').slice(0, -1));
          for (const l of res2.value?.lines ?? []) out(rc, l);
          ssv(rc, 'sent', now(rc));
          return { sleep: res2.value?.respondsAfterMs ?? 500 };
        }
        const sent = svn(rc, 'sent') ?? now(rc);
        if (['payment-prompt', 'declined'].includes(cur)) {
          if (now(rc) - sent < ACTION_TIMEOUTS.card) return 'poll';
          const log = t.device.logcat[t.device.logcat.length - 1] ?? '';
          const err = /ERROR/.exec(log) ? log.replace(/^.*?((?:SWIPE|CHIP|NFC)_?\w*ERROR.*)$/, '$1') : 'no card event';
          return pFail(step, 'CARD_ERROR', `[device] ${err}`);
        }
        store(`PAY-${t.device.order?.id ?? robot}`);
        return done();
      }
      case 'select print': {
        if (sv(rc, 'tapped') === undefined) {
          const r = touch(rc, step, robot, p['screen'] || rc.rs.vars['r.RECEIPT_SCREEN'] || 'RECEIPT_OPTIONS_4', 'Print');
          if (typeof r !== 'number') return r;
          ssv(rc, 'tapped', now(rc));
          return { sleep: r };
        }
        const tapped = svn(rc, 'tapped') ?? now(rc);
        const last = t.device.printer.lastPayloadMs;
        if (last !== null && last >= tapped) return done();
        if (now(rc) - tapped < ACTION_TIMEOUTS.payload) return 'poll';
        return pFail(step, 'PRINTER_TIMEOUT', 'waiting for printer payload … TIMEOUT after 60 s');
      }
      case 'verify receipt': {
        const want = Number(p['totalCents']);
        const doc = t.device.lastReceiptDoc;
        if (!doc) return pFail(step, 'ASSERTION', 'AssertionError: no receipt printed');
        if (doc.totalCents !== want) return pFail(step, 'ASSERTION', `AssertionError: receipt total ${fmtMoney(doc.totalCents)} != ${fmtMoney(want)}`);
        return done();
      }
      case 'screenCompare': {
        const x = Number(p['x'] ?? 0);
        const y = Number(p['y'] ?? 0);
        const w = Number(p['w'] ?? 0);
        const h = Number(p['h'] ?? 0);
        if (w === 0 || h === 0) return pFail(step, 'OCR_CAPTURE', 'LSTR screenCompare: empty region (0x0)');
        const src = p['source'] || 'screencap';
        let ref: string | null = null;
        if (src === 'webcam') {
          const cam = rc.host.robot ? rc.lab.rigs[rc.host.robot.name]?.webcam.cameraId : null;
          const url = rc.host.robot?.cameraStreamUrl ?? '';
          const m = /^https?:\/\/([^/:]+)(?::(\d+))?/.exec(url);
          const reach = m ? core().reach(rc.lab, rc.ctx, rc.host.fromHost, m[1]!, Number(m[2] ?? 80)) : null;
          if (!cam || !reach?.ok) return pFail(step, 'OCR_CAPTURE', `LSTR screenCompare: camera unavailable — ${url || '(no camera stream URL)'}`);
          ref = `img:webcam:${cam}:${now(rc)}`;
        } else {
          const sh = runnerAdb(rc, t.handle, ['exec-out', 'screencap', '-p']);
          ref = sh.file?.contents && sh.file.contents.startsWith('img:') ? sh.file.contents : `img:screencap:${t.device.id}:${now(rc)}`;
        }
        const ocr = core().tesseract(rc.lab, ref, { x, y, w, h });
        const expected = p['expected'] ?? '';
        rc.ctx.emit('ocr.ran', { compareId: 0, text: ocr.text, expected, match: ocr.text === expected, source: 'pigeon', line: `LSTR screenCompare: read "${ocr.text}" expected "${expected}"` });
        if (ocr.text !== expected) return pFail(step, 'OCR_MISMATCH', `LSTR screenCompare: read "${ocr.text}" expected "${expected}"`);
        return done();
      }
      default:
        return { fail: 'LSTR_UNKNOWN_ACTION', lines: [`LSTR UnknownAction: "${action}"`, `FAILED at "${action}"`] };
    }
  },
};

registerOps(ops);
