/** LabSim devices (Sim §3.8–§3.11), OCR Screen Compare (§3.12) and Laz / Ubi (§3.17). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transact } from '@/core/store';
import type { TxContext } from '@/core/store';
import type { LabState } from '../types';
import { adbConnect, adbShell, uiDump } from './adb';
import { roundHalfUp } from './devices';
import { bus } from '@/core/bus';
import { device, fresh, lab, run, runUntil, sim } from './testkit';

vi.setConfig({ testTimeout: 60_000 });

const R2 = 'dev-r2-d2-duo';
const stage = (dev: string, s: string) => expect(sim.faults.applySetup({ op: 'device.stage', params: { device: dev, stage: s } })).toEqual({ ok: true, value: undefined });
const press = (dev: string, disp: 'primary' | 'secondary', id: string) => {
  const b = sim.device.layout(dev, disp).find((x) => x.id === id && x.kind === 'button');
  expect(b, `${id} on ${dev} ${disp}`).toBeTruthy();
  run(9_000); // past any render race
  return sim.device.touch(dev, disp, b!.xMm, b!.yMm, 'player');
};

describe('money maths (Sim §3.9.2)', () => {
  it('rounds half up at order level', () => {
    expect(roundHalfUp(1000 * 825, 10_000)).toBe(83);
    expect(roundHalfUp(2000 * 825, 10_000)).toBe(165);
    expect(roundHalfUp(350 * 825, 10_000)).toBe(29);
    expect(roundHalfUp(1083 * 400, 10_000)).toBe(43);
    expect(roundHalfUp(4200 * 18, 100)).toBe(756);
    expect(roundHalfUp(1083 * 18, 100)).toBe(195);
  });
});

describe('transactions on a device (Sim §3.9)', () => {
  beforeEach(() => fresh());

  it('a cash-discount merchant adds the 4 % non-cash adjustment when paying by card (1126)', () => {
    sim.faults.applySetup({ op: 'device.provision', params: { device: 'dev-wall-e-flex3', merchant: 'AUTO-US-NOPIN-02' } });
    stage('dev-wall-e-flex3', 'review-order');
    press('dev-wall-e-flex3', 'primary', 'Pay');
    press('dev-wall-e-flex3', 'primary', 'Charge');
    expect(device('dev-wall-e-flex3').display.screen).toBe('cash-discount-tender');
    press('dev-wall-e-flex3', 'primary', 'Card');
    expect(device('dev-wall-e-flex3').order).toMatchObject({ subtotalCents: 1000, taxCents: 83, cardAdjustCents: 43, totalCents: 1126, status: 'awaiting-card' });
  });

  it('a swipe ≥ $25 needs a signature; Done without strokes toasts "Please sign"', () => {
    const d = 'dev-wall-e-flex3';
    stage(d, 'register-order');
    for (let i = 0; i < 2; i++) press(d, 'primary', 'Tax Item 5');
    press(d, 'primary', 'Review Order');
    press(d, 'primary', 'Pay');
    press(d, 'primary', 'Charge');
    expect(sim.device.presentCard(d, 'SWIPE', 'VISA_STD_SWIPE', 'player').ok).toBe(true);
    expect(device(d).display.screen).toBe('tip');
    press(d, 'primary', '18%');
    expect(device(d).order).toMatchObject({ subtotalCents: 3000, taxCents: 248, tipPct: 18, tipCents: 585, totalCents: 3833 });
    expect(device(d).display.screen).toBe('signature');
    press(d, 'primary', 'Done');
    expect(device(d).display.toast?.text).toBe('Please sign');
    const pad = sim.device.layout(d, 'primary').find((b) => b.kind === 'pad')!;
    sim.device.signStroke(d, 'primary', [{ xMm: pad.xMm - 10, yMm: pad.yMm }, { xMm: pad.xMm + 10, yMm: pad.yMm + 5 }], 'player');
    press(d, 'primary', 'Done');
    expect(device(d).display.screen).toBe('processing');
    run(1_600);
    expect(device(d).display.screen).toBe('approved');
    expect(device(d).order!.authCode).toMatch(/^SIM\d{3}$/);
  });

  it('corrupt Track Data is rejected by the reader: SWIPE_ERROR + "Card read error, try again"', () => {
    sim.faults.inject({ faultId: 'card.trackDataCorrupt' });
    stage('dev-wall-e-flex3', 'payment-prompt');
    const r = sim.orca.card('wall-e', 'SWIPE', 'VISA_STD_SWIPE', 'player');
    expect(r).toMatchObject({ ok: true });
    run(500);
    expect(device('dev-wall-e-flex3').logcat.at(-1)).toBe('E CardReader: SWIPE_ERROR: invalid track data');
    expect(device('dev-wall-e-flex3').display.toast?.text).toBe('Card read error, try again');
  });

  it('Interac dip on a Westers bed asks for the PIN; ADB input is rejected by Secure Touch', () => {
    const d = 'dev-seti-compact';
    stage(d, 'payment-prompt');
    const r = sim.orca.card('seti', 'DIP', 'INTERAC_CA_DIP', 'player');
    expect(r.ok && r.value?.lines).toEqual(['[callus] map cards/emv/interac_ca_dip.json → C:\\gort\\cards\\emv\\interac_ca_dip.json · load virtual card OK · probe seti: DIP', '[pi] cardprog: program INTERAC_CA_DIP → OK']);
    run(1_500);
    expect(device(d).display.screen).toBe('pin-entry');
    expect(device(d).secureTouch).toBe(true);
    const one = sim.device.layout(d, 'primary').find((b) => b.id === '1')!;
    run(9_000);
    expect(sim.device.touch(d, 'primary', one.xMm, one.yMm, 'adb')).toEqual({ ok: true, value: { hitButton: null } });
    expect(device(d).logcat.at(-1)).toBe('W SecureTouch: injected input rejected');
    expect(transact((root) => uiDump(root.lab, d, 'primary'))).not.toContain('text="1"');
  });
});

describe('Station Duo and the dual-screen ADB problem (Sim §3.11)', () => {
  beforeEach(() => fresh());

  it('UIA 2.2 sees only the MFD; 2.3 displayId 1 reaches the CFD; input tap lands on the MFD', () => {
    stage(R2, 'review-order');
    expect(device(R2).secondaryDisplay!.screen).toBe('customer-cart');
    const mfd = transact((root) => uiDump(root.lab, R2, 'primary'));
    expect((mfd.match(/TOTAL/g) ?? []).length).toBe(0);
    expect(mfd).toContain('text="Pay"');
    sim.setFlag('uiaVersion', '2.2');
    expect(transact((root) => uiDump(root.lab, R2, 'secondary'))).not.toContain('TOTAL');
    sim.setFlag('uiaVersion', '2.3');
    const cfd = transact((root) => uiDump(root.lab, R2, 'secondary'));
    expect(cfd).toContain('displayId="1"');
    expect(cfd).toContain('text="TOTAL $10.83"');
    // adb shell input tap → display 0 (the MFD) — the INC64 wrong move taps the MFD, never the CFD.
    run(9_000);
    expect(transact((root, ctx) => adbConnect(root.lab, ctx, '10.42.30.14:5444').line)).toBe('connected to 10.42.30.14:5444');
    const px = (mm: number) => String(Math.round(mm * 6.196));
    transact((root, ctx) => adbShell(root.lab, ctx, '10.42.30.14:5444', ['shell', 'input', 'tap', px(262), px(158)], 'terminal'));
    expect(device(R2).display.screen).toBe('tender-select');
    expect(device(R2).secondaryDisplay!.screen).toBe('customer-cart');
  });

  it('adb connect: 5444 lab devices, 5555 default, coworker desk devices only on 5555', () => {
    const con = (t: string) => transact((root, ctx) => adbConnectLine(root.lab, ctx, t));
    expect(con('10.42.30.32:5444')).toBe('connected to 10.42.30.32:5444');
    expect(con('10.42.30.32:5444')).toBe('already connected to 10.42.30.32:5444');
    expect(con('10.42.30.32')).toBe("failed to connect to '10.42.30.32:5555': Connection refused");
    expect(con('10.42.60.4:5444')).toBe("failed to connect to '10.42.60.4:5444': Connection refused");
    expect(con('10.42.60.4')).toBe('connected to 10.42.60.4:5555');
    expect(con('10.42.30.99:5444')).toBe("failed to connect to '10.42.30.99:5444': No route to host");
    expect(lab().workstation.adbConnections.map((x) => `${x.target}${x.coworker ? '*' : ''}`)).toEqual(['10.42.30.32:5444', '10.42.60.4:5555*']);
    const t = transact((root, ctx) => adbShell(root.lab, ctx, '10.42.60.4:5555', ['shell', 'input', 'tap', '192', '508'], 'terminal'));
    expect(t.ok).toBe(true);
    expect(lab().workstation.coworkerDevicesDisturbed).toBe(1);
    expect(device('dev-riley-desk-flex').display.screen).toBe('register');
  });
});

function adbConnectLine(l: LabState, ctx: TxContext, t: string): string {
  return adbConnect(l, ctx, t).line;
}

describe('OCR Screen Compare (Sim §3.12.2 worked results)', () => {
  beforeEach(() => {
    fresh();
    stage(R2, 'review-order');
  });
  const cmp = () => {
    const r = sim.ocr.compare(1);
    return r.ok ? `${r.value.text}|${r.value.match}` : r.error;
  };

  it('v1, no shift → TOTAL $10.83 matches, with the exact [ocr] console line', () => {
    const lines: string[] = [];
    const off = bus.on('ocr.ran', (e) => lines.push(e.line ?? ''));
    expect(cmp()).toBe('TOTAL $10.83|true');
    off();
    expect(lines).toEqual(['[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=true']);
  });
  it('label shifted 10 px (INC36) → TOTAI $10.B3', () => {
    sim.faults.inject({ faultId: 'ocr.labelShift' });
    expect(cmp()).toBe('TOTAI $10.B3|false');
  });
  it('v2 copy (INC37-A) → Total $10.83 fails on capitalisation, passes once Expected is updated', () => {
    const f = sim.faults.inject({ faultId: 'ocr.capitalisation' });
    expect(cmp()).toBe('Total $10.83|false');
    expect(sim.faults.isResolved(f.ok ? f.value.instanceId : '')).toBe(false);
    sim.orca.saveScreenCompareImage({ id: 1, expectedText: 'Total $10.83' }, 'player');
    expect(cmp()).toBe('Total $10.83|true');
    expect(sim.faults.isResolved(f.ok ? f.value.instanceId : '')).toBe(true);
  });
  it('the M16 toggle (v2 copy + 10 px) → Total $10.B3', () => {
    sim.setFlag('cfdLayoutV2Toggle', true);
    expect(cmp()).toBe('Total $10.B3|false');
  });
  it('INC36 fixed by re-measuring the box to y 298 → match', () => {
    sim.faults.inject({ faultId: 'ocr.labelShift' });
    sim.orca.saveScreenCompareImage({ id: 1, bbox: { x: 412, y: 298, w: 236, h: 44 } }, 'player');
    expect(cmp()).toBe('TOTAL $10.83|true');
  });
  it('a typo in Expected (INC37-B) fails; whole-screen box reads three lines', () => {
    sim.faults.inject({ faultId: 'ocr.typo' });
    expect(cmp()).toBe('TOTAL $10.83|false');
    const r = sim.ocr.tesseract('img:webcam:cam-r2-d2:live', { x: 0, y: 0, w: 1280, h: 720 });
    expect(r.text.split('\n').slice(0, 3)).toEqual(['Subtotal $10.00', 'Tax $0.83', 'TOTAL $10.83']);
  });
  it('a camera URL pointing at WALL-E (INC09) reads WALL-E’s screen', () => {
    sim.faults.inject({ faultId: 'orca.urlWrong', params: { robot: 'r2-d2', field: 'camera', value: 'http://10.42.10.11:8081/stream.mjpg' } });
    stage('dev-wall-e-flex3', 'payment-prompt');
    sim.orca.saveScreenCompareImage({ id: 1, bbox: { x: 397 + 3.5 * 6, y: 112 + 3.5 * 52, w: Math.round(3.5 * 64), h: Math.round(3.5 * 8) } }, 'player');
    expect(cmp()).toBe('Tap, insert or swipe|false');
  });
});

describe('Laz zero-touch OOBE and Ubi (Sim §3.17)', () => {
  beforeEach(() => fresh());

  it('swaps the merchant in ≈ 53 s with the exact console lines and restores ADB over TCP', () => {
    const r = sim.laz.start('dev-data-mini3', 2, 'player');
    expect(r.ok).toBe(true);
    const id = r.ok ? r.value.runId : '';
    const t = runUntil(() => ['done', 'failed'].includes(lab().laz.runs[id]!.step), 70_000);
    expect(t).toBeGreaterThan(52_000);
    expect(t).toBeLessThan(54_000);
    expect(lab().laz.runs[id]!.log).toEqual([
      'ubi: routing merchant switch → AUTO-US-NOPIN-02',
      'ubi: route us-east → US-EAST OK',
      'laz: de-provision',
      'laz: wipe caches',
      'laz: setup wizard 1/6',
      'laz: setup wizard 2/6',
      'laz: setup wizard 3/6',
      'laz: setup wizard 4/6',
      'laz: setup wizard 5/6',
      'laz: setup wizard 6/6',
      'laz: merchant active',
      'laz: adb tcpip 5444 via adb-shelf-pi → OK',
      'laz: verify OK (SIM-M3-000031 on AUTO-US-NOPIN-02)',
    ]);
    expect(device('dev-data-mini3')).toMatchObject({ merchantConfigId: 2, provisioned: true, adbTcpPort: 5444 });
    expect(lab().orca.robots[11]!.merchantConfigId).toBe(1); // Orca says what it SHOULD hold
  });

  it('laz.skipAdbRestore: the next run leaves ADB over TCP off until `adb tcpip 5444` (INC28)', () => {
    const f = sim.faults.inject({ faultId: 'laz.skipAdbRestore' });
    const fid = f.ok ? f.value.instanceId : '';
    const r = sim.laz.start('dev-data-mini3', 2, 'player');
    const id = r.ok ? r.value.runId : '';
    runUntil(() => lab().laz.runs[id]!.step === 'done', 70_000);
    expect(lab().laz.runs[id]!.log).not.toContain('laz: adb tcpip 5444 via adb-shelf-pi → OK');
    expect(device('dev-data-mini3').adbTcpPort).toBeNull();
    expect(sim.faults.isResolved(fid)).toBe(false);
    const out = transact((root, ctx) => adbShell(root.lab, ctx, 'SIM-M3-000031', ['tcpip', '5444'], 'terminal'));
    expect(out.lines).toEqual(['restarting in TCP mode port: 5444']);
    run(1_100);
    expect(device('dev-data-mini3').adbTcpPort).toBe(5444);
    expect(sim.faults.isResolved(fid)).toBe(true);
  });

  it('a wrong Ubi route fails before de-provisioning (INC50)', () => {
    sim.faults.inject({ faultId: 'merchant.ubiRouteWrong' });
    const r = sim.laz.start('dev-gerty-compact', 7, 'player');
    expect(r.ok).toBe(true);
    const r2 = sim.laz.start('dev-seti-compact', 7, 'player');
    const id = r2.ok ? r2.value.runId : '';
    run(2_100);
    expect(lab().laz.runs[id]!).toMatchObject({ step: 'failed' });
    expect(lab().laz.runs[id]!.log).toEqual(['ubi: routing merchant switch → WESTERS-CA-02', 'ubi: ERROR route us-east cannot resolve merchant WESTERS-CA-02']);
    expect(device('dev-seti-compact').provisioned).toBe(true);
  });
});
