/**
 * Go SDK runner (Sim §3.21.1), the vision PoC (Ollama receipt check, §3.21.2) and the iOS mobile runner.
 */
import type { RunnerStep } from '../../types';
import { core } from '../coreRef';
import { parseStrictJson } from '../json';
import type { JsonValue } from '../json';
import { ask, CONNECT_REFUSED, OLLAMA_IP, OLLAMA_PORT } from '../ollama';
import { draw } from '../util';
import { now, out, registerOps, ssv, sv, target } from './engine';
import type { RC, StepHandler } from './engine';
import { compileLstr } from './pigeon';

let seq = 0;
const S = (label: string, op: string, args: Record<string, string | number | boolean> = {}, role: RunnerStep['role'] = 'DEVICE'): RunnerStep => ({ id: `o${++seq}`, label, role, op, args });

/** Go SDK plan from `go-sdk/tests/*.json` (gort). */
export function compileGoSdkPlan(text: string | undefined, path: string, env: Record<string, string>): RunnerStep[] {
  seq = 0;
  if (text === undefined) return [S('load', 'lstrFail', { code: 'JSON_PARSE', lines: `panic: open ${path}: no such file or directory` })];
  const r = parseStrictJson(text);
  if (!r.ok) return [S('load', 'lstrFail', { code: 'JSON_PARSE', lines: `panic: parse ${path}: ${r.error}` })];
  const def = r.value as { name?: JsonValue; steps?: JsonValue };
  const port = env['PORT_NUMBER'] || '5444';
  const steps: RunnerStep[] = [S('header', 'log', { text: `[go-sdk] terminal-sdk v1.14.2 · ${String(def.name ?? path)}`, silent: true })];
  // Shared runner harness (Sim §3.19.2): a rig whose MFD relation is populated is driven as tethered —
  // the SDK talks to whatever device the MFD row points at (INC46).
  if (env['RUN_TYPE'] === 'tethered') steps.push(S('tethered detected', 'log', { text: `[runner] Tethered rig detected (MFD populated) → MFD ${env['MFD_IP'] ?? ''}:${port}, CFD ${env['CFD_IP'] ?? ''}:${port}`, silent: true }));
  steps.push({ id: 'o-conn', label: 'DEVICE handle', role: 'DEVICE', op: 'connect', args: { role: 'DEVICE', ip: env['MFD_IP'] ?? '', port } });
  for (const s of Array.isArray(def.steps) ? def.steps : []) {
    const o = s as { op?: JsonValue; args?: JsonValue };
    const op = String(o.op ?? '');
    const args = (o.args && typeof o.args === 'object' ? o.args : {}) as Record<string, JsonValue>;
    if (op === 'connect') steps.push(S('connect', 'goConnect'));
    else if (op === 'sale') steps.push(S('sale', 'goSale', { amountCents: Number(args['amountCents'] ?? 1000) }));
    else if (op === 'printReceipt') steps.push(S('printReceipt', 'goPrint'));
    else steps.push(S(op, 'lstrFail', { code: 'ASSERTION', lines: `panic: unknown op "${op}"` }));
  }
  steps.push(S('result', 'log', { text: '[go-sdk] PASS', silent: true }));
  return steps;
}

/** Vision PoC plan: a named sale with an 18% tip and Print, then webcam snapshot → llava. */
export function compileVisionPlan(env: Record<string, string>): RunnerStep[] {
  seq = 0;
  const actions: [string, Record<string, JsonValue>, string][] = [
    ['create order', { item: 'Tax Item 5' }, 'orderId'],
    ['review order', {}, ''],
    ['pay', {}, ''],
    ['card swipe', { profile: 'VISA_STD_SWIPE' }, 'paymentId'],
    ['add tip', { percent: 18 }, 'tipId'],
    ['assert approved', {}, ''],
    ['select print', { screen: '${RECEIPT_SCREEN}' }, ''],
  ];
  const steps: RunnerStep[] = [{ id: 'o-conn', label: 'DEVICE handle', role: 'DEVICE', op: 'connect', args: { role: 'DEVICE', ip: env['MFD_IP'] ?? '', port: env['PORT_NUMBER'] || '5444' } }];
  actions.forEach(([a, p, store], i) => steps.push(S(a, 'lstr', { i: i + 1, n: actions.length, action: a, params: JSON.stringify(p), store, platform: 'ANDROID', tag: '[vision]' })));
  steps.push(S('webcam snapshot', 'visionSnap'));
  steps.push(S('llava verdict', 'visionAsk'));
  return steps;
}

/** iOS mobile runner (phone carriage on ASTRO) — scripted LSTR pass. */
export function compileIosPlan(text: string | undefined, path: string): RunnerStep[] {
  seq = 0;
  if (text === undefined) return [S('load', 'lstrFail', { code: 'JSON_PARSE', lines: `LSTR ParseError: file not found ${path}` })];
  const c = compileLstr(text, 'IOS');
  if (!c.ok) return [S('parse', 'lstrFail', { code: c.code, lines: c.lines.join('\n') })];
  const steps: RunnerStep[] = [S('phone', 'iosPhone')];
  c.actions.forEach((a, i) => steps.push(S(a.action, 'lstrScripted', { i: i + 1, n: c.actions.length, action: a.action, params: JSON.stringify(a.params), store: a.store ?? '', platform: 'IOS' })));
  steps.push(S('result', 'log', { text: `LSTR PASSED (${c.actions.length}/${c.actions.length} actions) — ${c.name}`, silent: true }));
  return steps;
}

const env = (rc: RC, k: string): string => rc.host.env[k] ?? '';

const ops: Record<string, StepHandler> = {
  goConnect(rc) {
    for (const k of ['APP_ID', 'APP_SECRET', 'API_KEY']) {
      if (!env(rc, k).trim()) {
        return { fail: 'MISSING_CREDENTIAL', lines: [`panic: Terminal SDK: missing credential ${k} (env var empty)`, '', 'goroutine 1 [running]:', 'github.com/labsim-lab/gort/go-sdk/runner.connect(...)', '\t/var/lib/jenkins/workspace/Java/go-sdk-sale-smoke/go-sdk/runner/steps.go:16 +0x1c5', 'exit status 2'] };
      }
    }
    const t = target(rc, 'DEVICE');
    out(rc, `[go-sdk] connect app=${env(rc, 'APP_ID')} device=${t?.handle ?? '?'} … OK`);
    return 'done';
  },
  goSale(rc, step) {
    const t = target(rc, 'DEVICE');
    if (!t) return { fail: 'DEVICE_UNREACHABLE', lines: ['[go-sdk] Sale → device unreachable'] };
    if (sv(rc, 'st') === undefined) {
      ssv(rc, 'st', now(rc));
      return { sleep: 3_000 };
    }
    const amount = Number(step.args['amountCents'] ?? 1000);
    const m = t.device.merchantConfigId != null ? rc.lab.orca.merchants[t.device.merchantConfigId] : undefined;
    if (m && !m.pinBypass) return { fail: 'CARD_ERROR', lines: [`[go-sdk] Sale ${amount} → DECLINED (PIN_REQUIRED: ${m.name} is not a PIN-bypass merchant)`] };
    if (t.device.power !== 'on') return { fail: 'DEVICE_UNREACHABLE', lines: [`[go-sdk] Sale ${amount} → device not responding`] };
    const auth = `SIM${String(Math.floor(1000 * draw(rc.lab, 'devices'))).padStart(3, '0')}`;
    rc.rs.vars['r.AUTH'] = auth;
    out(rc, `[go-sdk] Sale ${amount} → APPROVED (${auth})`);
    return 'done';
  },
  goPrint(rc) {
    const t = target(rc, 'DEVICE');
    if (!t) return { fail: 'DEVICE_UNREACHABLE', lines: ['[go-sdk] PrintReceipt → device unreachable'] };
    if (!t.device.printer.present) return { fail: 'PRINTER_NOT_AVAILABLE', lines: ['[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE'] };
    if (!t.device.printer.paper) return { fail: 'PRINTER_NOT_AVAILABLE', lines: ['[go-sdk] PrintReceipt → PRINTER_OUT_OF_PAPER'] };
    out(rc, '[go-sdk] PrintReceipt → OK');
    return 'done';
  },
  iosPhone(rc) {
    const robot = rc.host.robot;
    if (!robot) {
      out(rc, '[ios] LSTR iOS runner · iOS Simulator (iPhone 15, iOS 17.5)');
      return 'done';
    }
    const phone = rc.lab.rigs[robot.name]?.phone.mounted ?? null;
    if (!phone) return { fail: 'ASSERTION', lines: [`[ios] no phone mounted on ${robot?.name ?? '?'}`] };
    out(rc, `[ios] LSTR iOS runner · ${phone} on ${robot!.name} · Go SDK mobile build 1.14.2`);
    return 'done';
  },
  visionSnap(rc) {
    const robot = rc.host.robot;
    const url = robot?.cameraStreamUrl ?? '';
    const m = /^https?:\/\/([^/:]+)(?::(\d+))?/.exec(url);
    const r = m ? core().reach(rc.lab, rc.ctx, rc.host.fromHost, m[1]!, Number(m[2] ?? 80)) : null;
    if (!r || !r.ok) return { fail: 'EVIDENCE_CAPTURE', lines: [`[vision] GET ${url || '(no camera stream URL)'} → ${!r ? 'No route to host' : r.kind === 'refused' ? 'Connection refused' : r.kind === 'timeout' ? 'connect timed out after 10000 ms' : 'No route to host'}`] };
    const cam = robot ? (rc.lab.rigs[robot.name]?.webcam.cameraId ?? robot.name) : 'cam';
    const ref = `img:webcam:${cam}:${now(rc)}`;
    const t = target(rc, 'DEVICE');
    const doc = t?.device.lastReceiptDoc;
    if (doc) {
      rc.lab.ollama.receiptScenarios[ref] = { imageRef: ref, deviceId: t!.device.id, subtotalCents: doc.subtotalCents, taxCents: doc.taxCents, tipPct: doc.tipPct ?? 0, printedTipCents: doc.tipCents, misread: null };
    }
    rc.rs.vars['r.IMAGE'] = ref;
    out(rc, `[vision] GET ${url} → 200 (frame saved)`);
    return 'done';
  },
  visionAsk(rc) {
    if (sv(rc, 'req') === undefined) {
      const reach = core().reach(rc.lab, rc.ctx, rc.host.fromHost, OLLAMA_IP, OLLAMA_PORT);
      if (!reach.ok) return { fail: 'OLLAMA_DOWN', lines: [reach.kind === 'timeout' ? `curl: (28) Connection timed out after 10001 milliseconds` : CONNECT_REFUSED] };
      const prompt = 'Check this receipt image. Is the layout complete (merchant header, items, subtotal, tax, tip, total) and is the tip math correct? Answer PASS or FAIL with one reason.';
      const r = ask(rc.lab, rc.ctx, 'llava:latest', prompt, rc.rs.vars['r.IMAGE'] ?? null, 'jenkins');
      if (!r.ok) return { fail: 'OLLAMA_DOWN', lines: [CONNECT_REFUSED] };
      out(rc, `[vision] POST http://${OLLAMA_IP}:${OLLAMA_PORT}/api/generate (llava:latest) …`);
      ssv(rc, 'req', r.requestId);
      return 'poll';
    }
    const req = rc.lab.ollama.requests.find((x) => x.id === sv(rc, 'req'));
    if (!req || req.state !== 'done') return 'poll';
    if (!req.verdict) return { fail: 'OLLAMA_DOWN', lines: [`[vision] llava: ${req.response ?? 'no response'}`] };
    out(rc, `[vision] llava verdict: ${req.verdict}`);
    if (req.verdict === 'FAIL') {
      out(rc, `[vision] ${req.response}`);
      rc.rs.vars['_unstable'] = '1';
      rc.rs.vars['_failCode'] ??= 'VISION_FAIL';
    }
    return 'done';
  },
};

registerOps(ops);
