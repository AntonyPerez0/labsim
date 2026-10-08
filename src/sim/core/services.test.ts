/** REST surfaces (Sim §3.23), card actions through Callus (§3.6), GortCardSync (§3.14.6), hosts (§3.14). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { device, fresh, host, lab, run, runUntil, sim } from './testkit';

vi.setConfig({ testTimeout: 120_000 });

describe('Orca REST (Sim §3.23)', () => {
  beforeEach(() => fresh());

  it('JHipster problem JSON with the exact detail texts, filters, health', () => {
    const bad = sim.orca.rest('PUT', '/api/robots/1/status', '{"status":"BROKEN"}', 'player');
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.body)).toEqual({ title: 'Bad Request', status: 400, detail: "Invalid value for status: 'BROKEN'", path: '/api/robots/1/status', message: 'error.validation' });
    const cf = sim.orca.rest('GET', '/api/robots?status.equals=CONNECTION_FAILED', null, 'player');
    expect((JSON.parse(cf.body) as { name: string }[]).map((r) => r.name)).toEqual(['sonny']);
    expect(sim.orca.rest('GET', '/management/health', null, 'player').body).toBe('{"status":"UP"}');
    const caps = sim.orca.rest('GET', '/api/robots/wall-e/capabilities', null, 'player');
    expect(JSON.parse(caps.body)).toMatchObject({ deviceType: 'FLEX_3', physicalTouch: true });
    const forced = sim.orca.rest('POST', '/api/health-check/run', null, 'player');
    expect(forced.status).toBe(202);
    const card = sim.orca.rest('POST', '/api/card/tap', '{"robot":"wall-e","profile":"VISA_STD_DIP"}', 'player');
    expect(JSON.parse(card.body).detail).toBe('profile VISA_STD_DIP is a DIP profile; use /api/card/dip');
  });

  it('MySQL down: entity calls 500 with the JPA message; /management/health 503 DOWN', () => {
    sim.faults.inject({ faultId: 'orca.mysqlDown' });
    sim.tick(50);
    const r = sim.orca.rest('GET', '/api/robots', null, 'player');
    expect(r.status).toBe(500);
    expect(JSON.parse(r.body).detail).toBe('Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection');
    const h = sim.orca.rest('GET', '/management/health', null, 'player');
    expect(h.status).toBe(503);
    expect(h.body).toBe('{"status":"DOWN","components":{"db":{"status":"DOWN"}}}');
  });

  it('Robot Pi and Callus endpoints', () => {
    expect(sim.orca.rest('GET', 'http://10.42.10.11:8000/health', null, 'player').body).toBe('{"status":"ok","robot":"wall-e"}');
    expect(sim.orca.rest('GET', 'http://10.42.10.20:8000/health', null, 'player').body).toBe('{"status":"ok","robots":["megatron","optimus"]}');
    sim.faults.inject({ faultId: 'collis.ribbonUnseated', params: { probe: 'collis-eve' } });
    sim.tick(50);
    expect(sim.orca.rest('GET', 'http://10.42.20.1:9000/status', null, 'player').body).toBe('{"callus":"UP","probes":[{"id":"collis-wall-e","state":"READY"},{"id":"collis-eve","state":"NO_LINK"},{"id":"collis-bumblebee","state":"READY"},{"id":"collis-r2-d2","state":"READY"}]}');
    sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } });
    const t = sim.orca.rest('GET', 'http://10.42.10.11:8000/health', null, 'player');
    expect(t).toMatchObject({ status: 0, body: 'Connection timed out after 10000 milliseconds' });
  });
});

describe('card actions through Callus (Sim §3.6)', () => {
  beforeEach(() => fresh());

  it('exact failure lines: no Tap URL, probe offline / no link, stale Gort path, cardprog down', () => {
    sim.faults.inject({ faultId: 'orca.urlWrong', params: { robot: 'johnny-5', field: 'tap', value: '' } });
    expect(sim.orca.card('johnny-5', 'TAP', 'VISA_STD_TAP', 'player')).toEqual({ ok: false, error: '[orca] 400 Bad Request: robot johnny-5 has no Tap URL' });
    sim.faults.inject({ faultId: 'collis.unpowered', params: { probe: 'collis-wall-e' } });
    sim.tick(50);
    expect(sim.orca.card('wall-e', 'SWIPE', 'VISA_STD_SWIPE', 'player')).toEqual({ ok: false, error: '[callus] probe collis-wall-e: PROBE_OFFLINE' });
    sim.faults.inject({ faultId: 'card.gortPathWrong' });
    expect(sim.orca.card('eve', 'DIP', 'VISA_STD_DIP', 'player')).toEqual({ ok: false, error: '[callus] map cards/visa/visa_std_dip.json → C:\\gort\\cards\\visa\\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)' });
    sim.faults.inject({ faultId: 'pi.wineBroken', params: { host: 'pi-bumblebee' } });
    const r = sim.orca.card('bumblebee', 'TAP', 'VISA_STD_TAP', 'player');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.split('\n')).toEqual(['[callus] map cards/nfc/visa_std_tap.json → C:\\gort\\cards\\nfc\\visa_std_tap.json · load virtual card OK · probe bumblebee: TAP', '[pi] cardprog: program VISA_STD_TAP → 503 CARDPROG_UNAVAILABLE']);
  });

  it('a stale Callus clone (INC54) cannot map the new Interac tap card until GortCardSync runs', () => {
    sim.faults.inject({ faultId: 'callus.syncStale', params: { host: 'minix-02' } });
    expect(sim.orca.card('seti', 'TAP', 'INTERAC_CA_TAP', 'player')).toEqual({ ok: false, error: '[callus] map cards/nfc/interac_ca_tap.json → C:\\gort\\cards\\nfc\\interac_ca_tap.json · FileNotFoundException (The system cannot find the path specified)' });
    expect(host('minix-02').files['C:\\gort\\cards\\nfc\\interac_ca_tap.json']).toBeUndefined();
    expect(sim.host.runSchedTask('minix-02', 'GortCardSync', 'player')).toEqual({ ok: true, value: undefined });
    run(20_100);
    expect(lab().callus.log['minix-02']!.at(-1)).toBe('GortCardSync: pulled c41d9e2 (7 files)');
    expect(sim.orca.card('seti', 'TAP', 'INTERAC_CA_TAP', 'player').ok).toBe(true);
  });

  it('the dip arm one tooth off: Callus OK, then CHIP_READ_ERROR on the device (INC16)', () => {
    sim.faults.inject({ faultId: 'rig.dipArmMisaligned', params: { rig: 'wall-e' } });
    sim.faults.applySetup({ op: 'device.stage', params: { device: 'dev-wall-e-flex3', stage: 'payment-prompt' } });
    expect(sim.orca.card('wall-e', 'DIP', 'VISA_STD_DIP', 'player').ok).toBe(true);
    run(1_500);
    expect(device('dev-wall-e-flex3').logcat.at(-1)).toBe('E CardReader: CHIP_READ_ERROR');
    expect(device('dev-wall-e-flex3').display.screen).toBe('payment-prompt');
  });

  it('a swipe loaded before the payment prompt is armed and fires 0.8 s after the prompt appears', () => {
    sim.faults.applySetup({ op: 'device.stage', params: { device: 'dev-megatron-mfd', stage: 'review-order' } });
    const r = sim.orca.card('megatron', 'SWIPE', 'VISA_STD_SWIPE', 'player');
    expect(r.ok && r.value?.armed).toBe(true);
    expect(r.ok && r.value?.lines.at(-1)).toBe('[callus] swipe VISA_STD_SWIPE armed on smartstripe-megatron (fires at payment prompt)');
    sim.faults.applySetup({ op: 'device.stage', params: { device: 'dev-megatron-mfd', stage: 'payment-prompt' } });
    expect(runUntil(() => device('dev-megatron-cfd').display.screen !== 'payment-prompt', 5_000)).toBeGreaterThanOrEqual(800);
    expect(lab().callus.log['minix-02']!.at(-1)).toBe('[callus] swipe VISA_STD_SWIPE fired → OK');
  });
});

describe('hosts (Sim §3.14)', () => {
  beforeEach(() => fresh());

  it('GortCardSync runs daily at 10:00 on running boxes; a box that is off misses it', () => {
    sim.faults.inject({ faultId: 'callus.down', params: { host: 'minix-02', mode: 'box-off' } });
    sim.fastForward(3_600_000); // 09:00 → 10:00
    expect(host('minix-01').schedTasks.GortCardSync!.running).toBe(true);
    expect(host('minix-02').schedTasks.GortCardSync!.running).toBe(false);
    run(20_100);
    expect(host('minix-01').schedTasks.GortCardSync).toMatchObject({ running: false, lastResult: 0, lastRunMs: 10 * 3_600_000 });
    expect(host('minix-02').schedTasks.GortCardSync!.lastRunMs).toBe(-31_200_000);
  });

  it('Windows box boot is 50 s; Callus answers after the boot completes', () => {
    sim.faults.inject({ faultId: 'callus.down', params: { host: 'minix-01' } });
    sim.host.pressPowerButton('minix-01', false, 'player');
    run(49_000);
    expect(host('minix-01').services.callus!.running).toBe(false);
    run(1_100);
    expect(host('minix-01').services.callus!.running).toBe(true);
  });

  it('NUC-03 disk: cleaning frees 2.0 GB which the corporate agent refills in ~180 s', () => {
    expect(host('nuc-03').diskUsedPct).toBe(100);
    sim.host.cleanDisk('nuc-03', 'player');
    expect(host('nuc-03').diskUsedGb).toBeCloseTo(235.9, 1);
    run(90_000);
    const mid = host('nuc-03').diskUsedGb;
    expect(mid).toBeGreaterThan(236.5);
    expect(mid).toBeLessThan(237.9);
    run(95_000);
    expect(host('nuc-03').diskUsedGb).toBeCloseTo(237.9, 3);
  });
});
