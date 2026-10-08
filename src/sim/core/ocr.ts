/**
 * Cameras, frame models and the deterministic Tesseract model (Sim §2.11, §3.12): live webcam frames,
 * ADB screencaps, frozen captures, Screen Compare (capture → crop → OCR → exact match), camera probe and
 * snapshot for the Camera app.
 */
import type { CapturedFrame, LabState, ReceiptDoc, ScreenCompareImage, ScreenName } from '../types';
import type { Actor, CameraProbeResult, FrameModel, Result } from '../api';
import type { Ctx } from './util';
import { parseUrl } from './util';
import { CAMERAS, CAMERA_BY_ID, FRAME_H, FRAME_W, PX_PER_DEG_PITCH, PX_PER_DEG_YAW, cameraForUrl } from '../seed/cameras';
import type { CameraDef } from '../seed/cameras';
import { screenOf } from '../seed/deviceTypes';
import { resolveElements } from '../seed/layouts';
import { liveElements } from './devices';
import { reach } from './network';
import { piIpOf } from './orca/health';
import { orcaDown } from './orca/status';
import { receiptText } from '../text/devices';
import { RECEIPT_ADDRESS } from '../seed/merchants';

type Label = FrameModel['labels'][number];

/* ────────────────────────────── frame models ────────────────────────────── */

function cameraRigMisaim(lab: LabState, cam: CameraDef): { dx: number; dy: number } {
  if (!cam.rigId) return { dx: 0, dy: 0 };
  const rig = lab.rigs[cam.rigId];
  if (!rig) return { dx: 0, dy: 0 };
  return { dx: rig.webcam.aimOffsetDeg.yaw * PX_PER_DEG_YAW, dy: rig.webcam.aimOffsetDeg.pitch * PX_PER_DEG_PITCH };
}

/** Text rectangles a camera currently sees (Sim §3.12.1 #4). */
export function cameraLabels(lab: LabState, cam: CameraDef): Label[] {
  const out: Label[] = [];
  const mis = cameraRigMisaim(lab, cam);
  for (const v of cam.views) {
    const d = lab.devices[v.deviceId];
    if (!d) continue;
    const cfd = v.display === 'secondary' || d.role === 'cfd';
    for (const e of liveElements(lab, d, v.display)) {
      if ((e.kind !== 'label' && e.kind !== 'button') || !e.text) continue;
      const shift = cfd && e.kind === 'label' ? d.labelShiftPx : 0;
      out.push({
        text: e.text,
        x: Math.round((v.ox + v.s * (e.x - e.w / 2) + mis.dx) * 100) / 100,
        y: Math.round((v.oy + v.s * (e.y - e.h / 2) + shift + mis.dy) * 100) / 100,
        w: Math.round(v.s * e.w * 100) / 100,
        h: Math.round(v.s * e.h * 100) / 100,
        deviceId: d.id,
        display: v.display,
      });
    }
  }
  return out;
}

/** ADB screencap of a device's primary display (device px, Sim §2.10.2 "Screencap px"). */
export function screencapLabels(lab: LabState, deviceId: string): { labels: Label[]; w: number; h: number } {
  const d = lab.devices[deviceId];
  if (!d) return { labels: [], w: 0, h: 0 };
  const scr = screenOf(d.type, 'primary');
  const labels: Label[] = [];
  for (const e of liveElements(lab, d, 'primary')) {
    if ((e.kind !== 'label' && e.kind !== 'button') || !e.text) continue;
    labels.push({ text: e.text, x: Math.round((e.x - e.w / 2) * scr.px.x), y: Math.round((e.y - e.h / 2) * scr.px.y), w: Math.round(e.w * scr.px.x), h: Math.round(e.h * scr.px.y), deviceId: d.id, display: 'primary' });
  }
  return { labels, w: scr.wPx, h: scr.hPx };
}

function receiptFrame(lab: LabState, ref: string): FrameModel | null {
  const sc = lab.ollama?.receiptScenarios?.[ref];
  let text: string | null = null;
  if (sc) {
    const total = sc.subtotalCents + sc.taxCents + sc.printedTipCents;
    const doc: ReceiptDoc = {
      merchantName: 'LabSim Automation Lab — US 01',
      address: RECEIPT_ADDRESS,
      printedAtMs: 9 * 3_600_000 + 12 * 60_000,
      orderId: 'ORD-WALL-E-0912',
      lines: [{ name: sc.subtotalCents === 4200 ? 'Catering Deposit' : 'Items', qty: 1, priceCents: sc.subtotalCents }],
      subtotalCents: sc.subtotalCents,
      taxCents: sc.taxCents,
      taxRateBp: sc.taxCents === 0 ? 0 : 825,
      cardAdjustCents: 0,
      cardAdjustBp: 0,
      tipCents: sc.printedTipCents,
      tipPct: sc.tipPct,
      totalCents: total,
      currency: 'USD',
      brand: 'VISA',
      panLast4: '1111',
      entry: 'DIP',
      authCode: 'SIM912',
      approved: true,
      qr: false,
    };
    text = receiptText(doc, lab.time);
  } else {
    const m = /^img:receipt:([^:]+)/.exec(ref);
    const dev = m ? Object.values(lab.devices).find((d) => d.rigId === m[1] && d.lastReceipt) : undefined;
    text = dev?.lastReceipt ?? null;
  }
  if (text == null) return null;
  const lines = text.split('\n');
  return {
    imageRef: ref,
    source: 'receipt',
    widthPx: 640,
    heightPx: 40 + lines.length * 28,
    labels: lines.map((t, i) => ({ text: t, x: 40, y: 20 + i * 28, w: 560, h: 24, deviceId: null, display: null })),
    capturedPhysMs: null,
  };
}

/** Frame model behind an image ref (Sim §3.12.1, GIMP / render2d). Pure. */
export function frameOf(lab: LabState, imageRef: string): FrameModel | null {
  const cap = lab.captures?.[imageRef];
  if (cap) return { imageRef, source: cap.source, widthPx: cap.widthPx, heightPx: cap.heightPx, labels: cap.labels.map((l) => ({ ...l })), capturedPhysMs: cap.capturedPhysMs };
  const web = /^img:webcam:([^:]+):live$/.exec(imageRef);
  if (web) {
    const cam = CAMERA_BY_ID[web[1]!];
    if (!cam) return null;
    return { imageRef, source: 'webcam', widthPx: FRAME_W, heightPx: FRAME_H, labels: cameraLabels(lab, cam), capturedPhysMs: null };
  }
  const sc = /^img:screencap:([^:]+):live$/.exec(imageRef);
  if (sc) {
    const s = screencapLabels(lab, sc[1]!);
    return { imageRef, source: 'screencap', widthPx: s.w, heightPx: s.h, labels: s.labels, capturedPhysMs: null };
  }
  if (imageRef.startsWith('img:receipt:')) return receiptFrame(lab, imageRef);
  return null;
}

function storeCapture(lab: LabState, frame: CapturedFrame): void {
  const caps = (lab.captures ??= {});
  caps[frame.imageRef] = frame;
  const keys = Object.keys(caps);
  if (keys.length > 50) {
    const sorted = keys.sort((a, b) => caps[a]!.capturedPhysMs - caps[b]!.capturedPhysMs);
    for (const k of sorted.slice(0, keys.length - 50)) delete caps[k];
  }
}

/** Freeze a screencap (`adb exec-out screencap -p`): returns `img:screencap:<deviceId>:<physMs>`. */
export function captureScreencap(lab: LabState, deviceId: string): string {
  const s = screencapLabels(lab, deviceId);
  const ref = `img:screencap:${deviceId}:${Math.round(lab.time.physMs)}`;
  storeCapture(lab, { imageRef: ref, source: 'screencap', widthPx: s.w, heightPx: s.h, labels: s.labels, capturedPhysMs: lab.time.physMs, cameraId: null, deviceId });
  return ref;
}

/** Freeze a webcam frame: `img:webcam:<cameraId>:<physMs>`. */
export function captureWebcam(lab: LabState, cameraId: string): string | null {
  const cam = CAMERA_BY_ID[cameraId];
  if (!cam) return null;
  const ref = `img:webcam:${cameraId}:${Math.round(lab.time.physMs)}`;
  storeCapture(lab, { imageRef: ref, source: 'webcam', widthPx: FRAME_W, heightPx: FRAME_H, labels: cameraLabels(lab, cam), capturedPhysMs: lab.time.physMs, cameraId, deviceId: null });
  return ref;
}

/* ────────────────────────────── Tesseract (Sim §3.12.2) ────────────────────────────── */

const BOTTOM: Record<string, string> = { L: 'I', E: 'F', '8': 'B', Q: 'O', J: 'I' };
const TOP: Record<string, string> = { T: 'I', E: 'L', '8': 'o', '7': '/' };

export function tesseract(labels: Label[], bbox: { x: number; y: number; w: number; h: number }): { text: string; confidence: number } {
  const C = bbox;
  const reads: { top: number; left: number; text: string; confused: boolean }[] = [];
  if (C.w <= 0 || C.h <= 0) return { text: '', confidence: 0 };
  for (const L of labels) {
    const ow = Math.max(0, Math.min(L.x + L.w, C.x + C.w) - Math.max(L.x, C.x));
    const oh = Math.max(0, Math.min(L.y + L.h, C.y + C.h) - Math.max(L.y, C.y));
    if (L.w <= 0 || L.h <= 0) continue;
    const fx = ow / L.w;
    const fy = oh / L.h;
    if (fx * fy < 0.1) continue;
    const n = L.text.length;
    let chars = '';
    for (let i = 0; i < n; i++) {
      const cx = L.x + ((i + 0.5) * L.w) / n;
      if (cx >= C.x && cx <= C.x + C.w) chars += L.text[i];
    }
    chars = chars.trim();
    const c = 1 - fy;
    let confused = false;
    if (c >= 0.6) chars = '';
    else if (c >= 0.15) {
      const topClip = Math.max(0, C.y - L.y);
      const bottomClip = Math.max(0, L.y + L.h - (C.y + C.h));
      const map = bottomClip >= topClip ? BOTTOM : TOP;
      const mapped = [...chars].map((ch) => map[ch] ?? ch).join('');
      confused = true;
      chars = mapped;
    }
    if (chars) reads.push({ top: L.y, left: L.x, text: chars, confused });
  }
  reads.sort((a, b) => a.top - b.top || a.left - b.left);
  const text = reads.map((r) => r.text).join('\n').trim();
  return { text, confidence: text === '' ? 0 : reads.some((r) => r.confused) ? 58 : 91 };
}

/* ────────────────────────────── Screen Compare (Sim §3.12.1) ────────────────────────────── */

export interface CompareOutcome {
  text: string;
  expected: string;
  match: boolean;
  line: string;
}

/** Can the robot's Pi capture `url`? Returns the camera or the `[ocr]` failure line tail. */
function captureFrom(lab: LabState, fromHostId: string, url: string): { cam: CameraDef } | { error: string } {
  const u = parseUrl(url);
  if (!u) return { error: `GET ${url} → invalid URL` };
  const r = reach(lab, fromHostId, u.host, u.port, { noLatency: true });
  if (!r.ok) return { error: `GET ${url} → ${r.kind === 'refused' ? 'Connection refused' : 'connect timed out after 10000 ms'}` };
  const host = r.hostId ? lab.hosts[r.hostId] : undefined;
  if (!host || !host.usb.includes('webcam')) return { error: `GET ${url} → Connection refused` };
  const cam = cameraForUrl(url);
  if (!cam) return { error: `GET ${url} → 404 Not Found` };
  return { cam };
}

export function screenCompare(lab: LabState, ctx: Ctx, ref: string | number, actor: Actor, source: 'orca' | 'runner' = 'orca'): Result<CompareOutcome> {
  const down = orcaDown(lab);
  if (down) return { ok: false, error: down };
  const row: ScreenCompareImage | undefined = typeof ref === 'number' ? lab.orca.screenCompareImages[ref] : Object.values(lab.orca.screenCompareImages).find((c) => c.name === ref);
  if (!row) return { ok: false, error: `404 Not Found: no screen compare image '${ref}'` };
  const robot = lab.orca.robots[row.robotId];
  const finish = (text: string, match: boolean, line: string): Result<CompareOutcome> => {
    ctx.emit('ocr.ran', { compareId: row.id, text, expected: row.expectedText, match, source, robotName: robot?.name, line });
    return { ok: true, value: { text, expected: row.expectedText, match, line } };
  };
  const piIp = robot ? piIpOf(robot.adbServiceUrl) : null;
  const pr = piIp ? reach(lab, 'orca-vm', piIp, 8000, { noLatency: true }) : null;
  if (!robot || !piIp || !pr || !pr.ok) return finish('', false, `[ocr] robot controller ${piIp ?? '?'}:8000 unreachable → match=false`);
  const cap = captureFrom(lab, pr.hostId!, robot.cameraStreamUrl);
  if ('error' in cap) return finish('', false, `[ocr] capture webcam → ${cap.error} → match=false`);
  const b = row.bbox;
  const t = tesseract(cameraLabels(lab, cap.cam), b);
  const match = t.text === row.expectedText;
  return finish(t.text, match, `[ocr] capture webcam → crop ${b.w}x${b.h}@${b.x},${b.y} → tesseract → "${t.text}" → match=${match}`);
}

/* ────────────────────────────── canonical frames (fault predicates) ────────────────────────────── */

/** Runtime screen behind an Orca compare row's `screenName` (canonical frame, Sim §4.3.7). */
const CANONICAL_SCREEN: Record<string, ScreenName> = {
  CFD_CART: 'customer-cart',
  CUSTOMER_CART: 'customer-cart',
  CFD_THANK_YOU: 'thank-you',
  CFD_RECEIPT_DONE: 'receipt-done',
  CFD_PAYMENT_PROMPT: 'payment-prompt',
};

/** Label text on the canonical Tax Item 5 order (subtotal $10.00, tax $0.83). */
function canonicalText(id: string, cfdLayout: 'v1' | 'v2'): string {
  switch (id) {
    case '@cartSubtotal':
      return 'Subtotal $10.00';
    case '@cartTax':
      return 'Tax $0.83';
    case '@cartTotal':
      return `${cfdLayout === 'v2' ? 'Total' : 'TOTAL'} $10.83`;
    case '@amount':
      return '$10.83';
    default:
      return id.startsWith('@') ? '' : id;
  }
}

/**
 * Does Screen Compare row `row` read `match=true` on the canonical frame of its screen (Tax Item 5 →
 * CFD_CART `TOTAL $10.83`; CFD_THANK_YOU → `Thank you`)? Pure evaluation of Sim §3.12 on a
 * hypothetical frame through the robot's Orca camera URL, with the device's current label shift,
 * CFD copy version and webcam aim. Used by the `ocr.*` fault predicates (Sim §4.3.7).
 */
export function canonicalCompareMatch(lab: LabState, row: ScreenCompareImage): boolean {
  const robot = lab.orca.robots[row.robotId];
  if (!robot) return false;
  const cam = cameraForUrl(robot.cameraStreamUrl);
  if (!cam) return false;
  const runtimeIds = new Set<string>();
  for (const id of [robot.deviceId, robot.mfdDeviceId, robot.cfdDeviceId]) {
    const r = id != null ? lab.orca.devices[id] : undefined;
    if (r?.simDeviceId) runtimeIds.add(r.simDeviceId);
  }
  const screen = CANONICAL_SCREEN[row.screenName] ?? 'customer-cart';
  const mis = cameraRigMisaim(lab, cam);
  const labels: Label[] = [];
  for (const v of cam.views) {
    if (!runtimeIds.has(v.deviceId)) continue;
    const d = lab.devices[v.deviceId];
    if (!d) continue;
    const cfd = v.display === 'secondary' || d.role === 'cfd';
    for (const e of resolveElements(d.type, v.display, screen, {}, undefined)) {
      if (e.kind !== 'label' && e.kind !== 'button') continue;
      const text = e.kind === 'label' ? canonicalText(e.id, d.cfdLayout) : e.id;
      if (!text) continue;
      const shift = cfd && e.kind === 'label' ? d.labelShiftPx : 0;
      labels.push({ text, x: v.ox + v.s * (e.x - e.w / 2) + mis.dx, y: v.oy + v.s * (e.y - e.h / 2) + shift + mis.dy, w: v.s * e.w, h: v.s * e.h, deviceId: d.id, display: v.display });
    }
  }
  return tesseract(labels, row.bbox).text === row.expectedText;
}

/* ────────────────────────────── Camera app ────────────────────────────── */

export function cameraProbe(lab: LabState, url: string): CameraProbeResult {
  const u = parseUrl(url);
  const unavailable = { ok: false as const, url, error: `Stream unavailable — ${url}` };
  if (!u) return unavailable;
  const r = reach(lab, 'ws-17', u.host, u.port, { noLatency: true });
  if (!r.ok || !r.hostId) return unavailable;
  const host = lab.hosts[r.hostId]!;
  if (!host.usb.includes('webcam')) return unavailable;
  const cam = cameraForUrl(url);
  if (!cam) return unavailable;
  return { ok: true, cameraId: cam.id, url, frameRef: `img:webcam:${cam.id}:live` };
}

export function cameraSnapshot(lab: LabState, ctx: Ctx, url: string, fileName: string): Result<{ imageRef: string; path: string }> {
  const p = cameraProbe(lab, url);
  if (!p.ok) return { ok: false, error: p.error };
  const ref = captureWebcam(lab, p.cameraId)!;
  const name = fileName.trim() || `${p.cameraId.replace(/^cam-/, '')}_snapshot.png`;
  const path = name.startsWith('~/') ? name : `~/Pictures/${name}`;
  lab.workstation.files[path] = ref;
  ctx.emit('camera.snapshot', { cameraId: p.cameraId, path, imageRef: ref });
  return { ok: true, value: { imageRef: ref, path } };
}

export { CAMERAS };
