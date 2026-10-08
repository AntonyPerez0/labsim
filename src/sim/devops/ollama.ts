/**
 * Ollama on ollama-vm (Sim §3.21.2): `llava:latest` vision checks of receipt layout and tip maths.
 * Requests complete after 6 s physical (+2 s model load on the first request after a restart).
 * Responses are deterministic; `correct` records whether the verdict agrees with the printed receipt's
 * real maths (false-positive detection, INC57).
 */
import type { TxContext } from '@/core/store';
import type { LabState, OllamaRequest, ReceiptScenario } from '../types';
import { core } from './coreRef';
import { draw, fmtMoney, roundHalfUpDiv } from './util';

export const OLLAMA_IP = '10.42.1.12';
export const OLLAMA_PORT = 11434;
const INFER_MS = 6_000;
const LOAD_MS = 2_000;

export function ollamaUp(lab: LabState): boolean {
  const h = lab.hosts['ollama-vm'];
  if (!h) return lab.ollama.up;
  const svc = h.services['ollama'];
  return h.os === 'RUNNING' && (svc ? svc.running && (svc.startedPhysMs === null || svc.startedPhysMs <= lab.time.physMs) : lab.ollama.up);
}

export const CONNECT_REFUSED = `curl: (7) Failed to connect to ${OLLAMA_IP} port ${OLLAMA_PORT}: Connection refused`;

/** Expected / observed values for a receipt scenario. */
export function receiptVerdict(s: ReceiptScenario): { text: string; verdict: 'PASS' | 'FAIL'; correct: boolean } {
  const base = s.subtotalCents + s.taxCents;
  const expectedTip = roundHalfUpDiv(base * s.tipPct, 100);
  const expectedTotal = base + expectedTip;
  const parse = (v: string): number => Math.round(Number(v.replace(/[^0-9.]/g, '')) * 100);
  const obsTip = s.misread?.field === 'tip' ? parse(s.misread.shownAs) : s.printedTipCents;
  const obsTotal = s.misread?.field === 'total' ? parse(s.misread.shownAs) : base + s.printedTipCents;
  let text: string;
  let verdict: 'PASS' | 'FAIL';
  if (obsTip !== expectedTip) {
    verdict = 'FAIL';
    text = `FAIL — tip of ${s.tipPct}% on ${fmtMoney(base)} should be ${fmtMoney(expectedTip)}; the receipt shows ${fmtMoney(obsTip)}.`;
  } else if (obsTotal !== expectedTotal) {
    verdict = 'FAIL';
    text = `FAIL — total should be ${fmtMoney(expectedTotal)}; the receipt shows ${fmtMoney(obsTotal)}.`;
  } else {
    verdict = 'PASS';
    text = `PASS — layout complete (merchant header, items, subtotal, tax, tip, total); tip of ${s.tipPct}% on ${fmtMoney(base)} is ${fmtMoney(expectedTip)} and the total ${fmtMoney(expectedTotal)} is correct.`;
  }
  const reallyCorrect = s.printedTipCents === expectedTip;
  return { text, verdict, correct: (verdict === 'PASS') === reallyCorrect };
}

export function ask(lab: LabState, ctx: TxContext, model: string, prompt: string, image: string | null, actor: string): { ok: true; requestId: string } | { ok: false; error: string } {
  void actor;
  if (!ollamaUp(lab)) return { ok: false, error: 'Model server unreachable' };
  const m = model.includes(':') ? model : `${model}:latest`;
  if (!lab.ollama.models.includes(m)) return { ok: false, error: `model "${model}" not found, try pulling it first` };
  const id = `ollama-${++lab.seq.ollama}`;
  const svcStart = lab.hosts['ollama-vm']?.services['ollama']?.startedPhysMs ?? null;
  const loaded = lab.ollama.requests.some((r) => r.state === 'done' && (svcStart === null || r.donePhysMs >= svcStart));
  const delay = INFER_MS + (loaded ? 0 : LOAD_MS);
  const req: OllamaRequest = { id, model: m, prompt, image, response: null, correct: null, state: 'running', startedMs: lab.time.nowMs, donePhysMs: lab.time.physMs + delay, verdict: null };
  lab.ollama.requests.push(req);
  core().addTimer(lab, 'ollama.done', 'phys', delay, { requestId: id });
  ctx.emit('ollama.requested', { requestId: id, model: m, image });
  return { ok: true, requestId: id };
}

/** Complete an inference (timer `ollama.done`). */
export function complete(lab: LabState, ctx: TxContext, requestId: string): void {
  const req = lab.ollama.requests.find((r) => r.id === requestId);
  if (!req || req.state === 'done') return;
  if (!ollamaUp(lab)) {
    req.state = 'done';
    req.response = 'error: model server stopped';
    ctx.emit('ollama.responded', { requestId, correct: null, verdict: null });
    return;
  }
  let response: string;
  let verdict: 'PASS' | 'FAIL' | null = null;
  let correct: boolean | null = null;
  const scenario = req.image ? lab.ollama.receiptScenarios[req.image] : undefined;
  if (!req.image) response = 'I need an image of the receipt to check it.';
  else if (scenario) {
    const v = receiptVerdict(scenario);
    response = v.text;
    verdict = v.verdict;
    correct = v.correct;
  } else if (req.image.startsWith('img:receipt:')) response = 'I can see a receipt but the image is too blurry to read the amounts. Please retake the photo.';
  else if (req.image.startsWith('img:screencap:')) response = 'The image shows a LabSim device screen, not a printed receipt.';
  else response = 'The image shows a lab bench with a LabSim device; I cannot find a receipt in it.';
  req.state = 'done';
  req.response = response;
  req.verdict = verdict;
  req.correct = correct;
  ctx.emit('ollama.responded', { requestId, correct, verdict });
}

/** `ollama.seedReceipt` (Sim §4.4.1). '@random' values draw from the `ollama` stream. */
export function seedReceipt(lab: LabState, p: Record<string, unknown>): string | null {
  const imageRef = String(p['imageRef'] ?? '');
  const deviceId = String(p['deviceId'] ?? '');
  if (!imageRef.startsWith('img:')) return `invalid param imageRef='${imageRef}'`;
  const num = (k: string, lo: number, hi: number, def?: number): number => {
    const v = p[k];
    if (v === '@random') return lo + Math.floor(draw(lab, 'ollama') * (hi - lo + 1));
    if (v === undefined) return def ?? 0;
    return Number(v);
  };
  const subtotal = num('subtotalCents', 1000, 9000);
  const tax = num('taxCents', 0, 800, 0);
  const pctRaw = p['tipPct'] === '@random' ? [15, 18, 20, 22][Math.floor(draw(lab, 'ollama') * 4)]! : Number(p['tipPct']);
  const printed = p['printedTipCents'] === '@random' ? roundHalfUpDiv((subtotal + tax) * pctRaw, 100) + 9 : Number(p['printedTipCents']);
  const field = p['misreadField'] === 'tip' || p['misreadField'] === 'total' ? p['misreadField'] : null;
  lab.ollama.receiptScenarios[imageRef] = {
    imageRef,
    deviceId,
    subtotalCents: subtotal,
    taxCents: tax,
    tipPct: pctRaw,
    printedTipCents: printed,
    misread: field ? { field, shownAs: String(p['misreadAs'] ?? '') } : null,
  };
  const name = imageRef.split(':').slice(1).join('_');
  lab.workstation.files[`~/Downloads/${name}.jpg`] = imageRef;
  return null;
}

/** Factory Ollama state (Sim §2.14, §3.21.2). */
export function seedOllama(lab: LabState): void {
  lab.ollama = {
    up: true,
    models: ['llava:latest'],
    requests: [],
    receiptScenarios: {
      'img:receipt:wall-e:0912': { imageRef: 'img:receipt:wall-e:0912', deviceId: 'dev-wall-e-flex3', subtotalCents: 4200, taxCents: 0, tipPct: 18, printedTipCents: 765, misread: null },
    },
  };
  lab.workstation.files['~/Downloads/walle_receipt_0912.jpg'] ??= 'img:receipt:wall-e:0912';
}

/** REST surface (Sim §3.21.2). */
export function ollamaTagsJson(lab: LabState): string {
  return JSON.stringify({ models: lab.ollama.models.map((m) => ({ name: m, model: m, size: 4733363377, details: { family: 'llama', parameter_size: '7B', quantization_level: 'Q4_0' } })) });
}
