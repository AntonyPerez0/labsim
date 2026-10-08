/** `xy_touch` (Sim §3.5), firmware hit test (§3.5.4) and the "Scan for receipt" rollout (§3.10). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, device, fresh, lab, run, sim } from './testkit';

vi.setConfig({ testTimeout: 60_000 });

const WALL_E = 'dev-wall-e-flex3';
const stage = (dev: string, s: string) => {
  const r = sim.faults.applySetup({ op: 'device.stage', params: { device: dev, stage: s } });
  expect(r).toEqual({ ok: true, value: undefined });
};
/** Fire an xy_touch and let the rig finish the stroke; returns the solenoid/ADB outcome. */
function tap(robotName: string, screen: string, button: string, opts?: { target?: 'MFD' | 'CFD' }) {
  let res!: ReturnType<typeof sim.orca.xyTouch>;
  const taps = collect('rig.solenoidTap', () => {
    res = sim.orca.xyTouch(robotName, screen, button, 'player', opts);
    if (res.ok) run(res.value.respondsAfterMs + 100);
  });
  return { res, tap: taps[0] ?? null };
}

describe('xy_touch modes (Sim §3.5.3)', () => {
  beforeEach(() => fresh());

  it('PHYSICAL_TAP on a touch rig answers after the stroke; ADB_TOUCH on ADB bots / Duo MFD / tethered CFD', () => {
    stage(WALL_E, 'register-order');
    const { res, tap: t } = tap('wall-e', 'REGISTER_HOME', 'Review Order');
    expect(res).toMatchObject({ ok: true, value: { orcaMode: 'PHYSICAL_TAP', xMm: 56, yMm: 124, body: '{"result":"OK","mode":"PHYSICAL_TAP","x_mm":56.0,"y_mm":124.0}' } });
    expect(t).toMatchObject({ rigId: 'wall-e', result: 'HIT', hitButton: 'Review Order' });
    expect(device(WALL_E).display.screen).toBe('review-order');
    expect(sim.orca.xyTouch('tars', 'TENDER_CASH_DISCOUNT', 'Cash', 'player')).toMatchObject({ ok: true, value: { orcaMode: 'ADB_TOUCH', respondsAfterMs: 120, body: '{"result":"OK","mode":"ADB_TOUCH","x_mm":22.0,"y_mm":58.5}' } });
    expect(sim.orca.xyTouch('r2-d2', 'CFD_RECEIPT_DONE', 'Done', 'player')).toMatchObject({ ok: true, value: { orcaMode: 'PHYSICAL_TAP', display: 'secondary' } });
    expect(sim.orca.xyTouch('r2-d2', 'REVIEW_ORDER', 'Pay', 'player')).toMatchObject({ ok: true, value: { orcaMode: 'ADB_TOUCH', display: 'primary' } });
    expect(sim.orca.xyTouch('megatron', 'TIP', 'No Tip', 'player', { target: 'CFD' })).toMatchObject({ ok: true, value: { orcaMode: 'ADB_TOUCH', deviceId: 'dev-megatron-cfd' } });
    expect(sim.orca.xyTouch('k-9', 'CFD_TIP', 'No Tip', 'player')).toEqual({ ok: false, error: '422 Unprocessable Entity: secondary display of STATION_DUO_2 is not exposed to ADB and robot k-9 has no probe on it' });
  });

  it('errors: unknown robot, missing map, lock held by another build, lock released', () => {
    expect(sim.orca.xyTouch('WALL-E', 'HOME', 'Register', 'player')).toEqual({ ok: false, error: "404 Not Found: no robot named 'WALL-E'" });
    sim.faults.inject({ faultId: 'orca.missingReceiptMap', params: { deviceType: 'STATION_2018' } });
    expect(sim.orca.xyTouch('baymax', 'RECEIPT_OPTIONS_5', 'Email', 'player')).toEqual({ ok: false, error: '404 Not Found: no Screen Location for (STATION_2018, RECEIPT_OPTIONS_5, "Email")' });
    sim.orca.checkout({ buildId: 'Java/uia-remote-regression-flex#4127', jobId: 'Java/uia-remote-regression-flex', robotName: 'wall-e', kind: 'jenkins' });
    expect(sim.orca.xyTouch('wall-e', 'HOME', 'Register', 'player')).toEqual({ ok: false, error: '423 Locked: robot wall-e is in use by Jenkins #4127' });
    sim.faults.inject({ faultId: 'rig.lockReleased', params: { rig: 'eve' } });
    expect(sim.orca.xyTouch('eve', 'HOME', 'Register', 'player')).toEqual({ ok: false, error: '409 Conflict: LOCK_RELEASED (park required)' });
  });

  it('legacy offsets: BUMBLEBEE Y +1.5 hits icons but misses PAYMENT/Charge (core 1.2, INC14)', () => {
    sim.faults.inject({ faultId: 'orca.offsets', params: { robot: 'bumblebee', yMm: 1.5 } });
    const dev = 'dev-bumblebee-mini3';
    stage(dev, 'home');
    expect(tap('bumblebee', 'HOME', 'Register').tap).toMatchObject({ result: 'HIT', hitButton: 'Register' });
    stage(dev, 'review-order');
    run(8_000);
    expect(tap('bumblebee', 'REVIEW_ORDER', 'Pay').tap).toMatchObject({ result: 'HIT' });
    expect(device(dev).display.screen).toBe('tender-select');
    run(8_000); // let the screen finish rendering (render race, Sim §3.19.5)
    const { res, tap: t } = tap('bumblebee', 'PAYMENT', 'Charge');
    expect(res.ok && res.value.yMm).toBe(90.5);
    expect(t).toMatchObject({ result: 'EDGE_REJECT', hitButton: null });
    expect(device(dev).display.screen).toBe('tender-select');
    expect(device(dev).logcat.at(-1)).toBe('I InputReader: touch rejected (edge contact, pressure 0.12)');
  });
});

describe('receipt QR rollout (Sim §3.10) — 4- vs 5-option maps', () => {
  beforeEach(() => fresh());

  it('factory QR firmware: the _5 map hits, the stale (−3 mm) _5 map misses every row, the _4 map misses', () => {
    stage(WALL_E, 'receipt-options');
    expect(device(WALL_E).display.receiptOptions).toBe(5);
    expect(tap('wall-e', 'RECEIPT_OPTIONS_4', 'Print').tap).toMatchObject({ result: 'EDGE_REJECT' });
    expect(device(WALL_E).display.screen).toBe('receipt-options');
    sim.faults.inject({ faultId: 'orca.screenLocationShift', params: { deviceTypes: ['FLEX_3'] } });
    expect(tap('wall-e', 'RECEIPT_OPTIONS_5', 'Print').tap).toMatchObject({ result: 'EDGE_REJECT' });
    expect(device(WALL_E).display.screen).toBe('receipt-options');
    expect(device(WALL_E).printer.lastPayloadMs).toBeNull();
    // Jared's fix: put the rows back on firmware truth (here via the Orca editor).
    const scr = Object.values(lab().orca.screens).find((s) => s.deviceType === 'FLEX_3' && s.name === 'RECEIPT_OPTIONS_5')!;
    const loc = Object.values(lab().orca.screenLocations).find((l) => l.screenId === scr.id && l.button === 'Print')!;
    expect(loc.yMm).toBe(71);
    sim.orca.saveScreenLocation({ id: loc.id, yMm: 74 }, 'player');
    expect(tap('wall-e', 'RECEIPT_OPTIONS_5', 'Print').tap).toMatchObject({ result: 'HIT', hitButton: 'Print' });
    expect(device(WALL_E).display.screen).toBe('printing');
    run(3_000);
    expect(device(WALL_E).lastReceiptDoc).toMatchObject({ totalCents: 1083, qr: true, taxCents: 83 });
  });

  it('before the rollout the device shows 4 options and the _4 map hits; the rollout re-renders 5 and the _4 map misses', () => {
    sim.setFlag('receiptQrFeature', false);
    expect(device(WALL_E).firmwareInfo).toEqual({ version: '2.26.08.3', receiptQr: false });
    expect(device('dev-johnny-5-flex1').firmwareInfo).toEqual({ version: '2.19.4', receiptQr: false });
    stage(WALL_E, 'receipt-options');
    expect(device(WALL_E).display.receiptOptions).toBe(4);
    expect(sim.device.layout(WALL_E, 'primary').filter((b) => b.kind === 'button').map((b) => `${b.id}@${b.yMm}`)).toEqual(['Print@71', 'Email@83', 'Text@95', 'No Receipt@107']);
    const rev = device(WALL_E).display.rev;
    sim.setFlag('receiptQrFeature', true);
    expect(device(WALL_E).display.receiptOptions).toBe(5);
    expect(device(WALL_E).display.rev).toBeGreaterThan(rev);
    expect(sim.device.layout(WALL_E, 'primary').filter((b) => b.kind === 'button').map((b) => `${b.id}@${b.yMm}`)).toEqual(['Print@74', 'Email@86', 'Text@98', 'No Receipt@110', 'Scan for receipt@122']);
    expect(sim.device.layout(WALL_E, 'primary').some((b) => b.kind === 'qr')).toBe(true);
    expect(tap('wall-e', 'RECEIPT_OPTIONS_4', 'No Receipt').tap).toMatchObject({ result: 'EDGE_REJECT' });
    expect(tap('wall-e', 'RECEIPT_OPTIONS_5', 'No Receipt').tap).toMatchObject({ result: 'HIT', hitButton: 'No Receipt' });
    expect(device(WALL_E).display.screen).toBe('thank-you');
  });

  it('a merchant without QR receipts keeps 4 options on QR firmware (cash-discount merchant 02)', () => {
    const r = sim.faults.applySetup({ op: 'device.provision', params: { device: WALL_E, merchant: 'AUTO-US-NOPIN-02' } });
    expect(r.ok).toBe(true);
    stage(WALL_E, 'receipt-options');
    expect(device(WALL_E).display.receiptOptions).toBe(4);
  });

  it('FLEX_1 JOHNNY-5: Print at 62.5 instead of 66.5 lands in the gap (INC22)', () => {
    sim.faults.inject({ faultId: 'orca.screenLocationTypo' });
    stage('dev-johnny-5-flex1', 'receipt-options');
    expect(device('dev-johnny-5-flex1').display.receiptOptions).toBe(4);
    expect(tap('johnny-5', 'RECEIPT_OPTIONS_4', 'Print').tap).toMatchObject({ result: 'MISS' });
  });
});
