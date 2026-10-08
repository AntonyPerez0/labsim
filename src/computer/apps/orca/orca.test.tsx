// @vitest-environment jsdom
/**
 * Orca key flows (Apps §14): robot filter, edit/save, Notes, checkout, merchant Edit, screen-location
 * test tap, screen-compare test — against the sandbox lab (fakes installed only where the sim is a stub).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getState } from '@/core/store';
import { sim } from '@/sim';
import { seedFakeLab } from '../../shell/sandbox/fakeLab';
import { installFakeSim } from '../../shell/sandbox/fakeSim';
import { byText, captureActions, click, makeRoutedHost, mount, type, type Mounted } from '../../shell/sandbox/testkit';
import { OrcaApp } from './index';
import { clearAlerts } from './shared';

let m: Mounted | null = null;
let cap: ReturnType<typeof captureActions>;

beforeAll(() => {
  // Against the real sim + its factory seed when it has landed; the sandbox lab + fakes otherwise.
  seedFakeLab();
  installFakeSim();
});

afterEach(() => {
  m?.unmount();
  m = null;
  cap?.stop();
  clearAlerts();
  vi.restoreAllMocks();
});

async function open(route: string) {
  cap = captureActions();
  const host = makeRoutedHost(OrcaApp, route);
  m = await mount(<host.Host />);
  return host;
}

describe('Orca robots list (Apps §2.4)', () => {
  it('toggles the Available status filter, updates the URL and emits orca.robots.filtered', async () => {
    // WALL-E is in use by a Jenkins build (the checkout record a pipeline run leaves, Sim §1.3.1).
    const { mutate } = await import('@/core/store');
    mutate((s) => {
      const w = Object.values(s.lab.orca.robots).find((r) => r.name === 'wall-e')!;
      w.checkout = { buildId: 'Java/uia-remote-regression-flex#4127', jobId: 'Java/uia-remote-regression-flex', byName: false, startedMs: s.lab.time.nowMs, statusAtCheckout: 'AVAILABLE', kind: 'jenkins' };
    });
    const host = await open('/robot');
    const btn = m!.container.querySelector('[data-hint="orca.robots.filter.status:AVAILABLE"]');
    expect(btn?.textContent).toMatch(/^Available \(\d+\)$/);
    await click(btn);
    expect(host.routes.at(-1)).toBe('/robot?status.in=AVAILABLE&page=1&sort=id,asc');
    const ev = cap.of('orca.robots.filtered')[0]!;
    const expected = Object.values(getState().lab.orca.robots).filter((r) => r.status === 'AVAILABLE').length;
    expect(ev).toMatchObject({ status: ['AVAILABLE'], deviceType: null, rigKind: null, environment: null, name: '', resultCount: expected });
    // Only Available rows are listed and the in-use line is rendered for WALL-E's Jenkins checkout.
    const rows = m!.container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(Math.min(20, expected));
    expect(m!.container.textContent).toContain('in use by Jenkins #4127');
  });

  it('shows the item count and pagination at 20 rows per page', async () => {
    await open('/robot');
    expect(m!.container.textContent).toContain('Showing 1 - 20 of 42 items.');
  });
});

describe('Orca robot form (Apps §2.5)', () => {
  it('validates the Name pattern with the exact JHipster message', async () => {
    await open('/robot/5/edit');
    const input = m!.container.querySelector('#orca-robot-name');
    await type(input, 'Johnny 5');
    expect(m!.container.textContent).toContain('This field should follow pattern for "Name".');
    expect(m!.container.textContent).toContain('Pipelines and named jobs use the Name. Change it only if the robot is really renamed.');
    const save = m!.container.querySelector('[data-hint="orca.robot.save"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('saves a Human Readable Name change through sim.orca.saveRobot and emits orca.robot.saved', async () => {
    const spy = vi.spyOn(sim.orca, 'saveRobot');
    const host = await open('/robot/5/edit');
    expect(cap.of('orca.robot.editOpened')[0]).toEqual({ robotId: 5, name: 'johnny-5' });
    await type(m!.container.querySelector('#orca-robot-humanReadableName'), 'JONNY-5');
    await click(m!.container.querySelector('[data-hint="orca.robot.save"]'));
    expect(spy).toHaveBeenCalledWith({ id: 5, humanReadableName: 'JONNY-5' }, 'player');
    expect(cap.of('orca.robot.saved')[0]).toEqual({ robotId: 5, name: 'johnny-5', created: false, changed: ['humanReadableName'] });
    expect(host.routes.at(-1)).toBe('/robot');
    expect(m!.container.textContent).toContain('A Robot is updated with identifier 5');
  });

  it('shows the tethered banner when an MFD is selected', async () => {
    await open('/robot/9/edit');
    expect(m!.container.textContent).toContain('Tethered: MFD populated');
  });
});

describe('Orca robot detail (Apps §2.5)', () => {
  it('emits viewed + notesViewed and blocks checkout of a Connection Failed robot', async () => {
    await open('/robot/26/view');
    expect(cap.of('orca.robot.viewed')[0]).toEqual({ robotId: 26, name: 'sonny' });
    expect(cap.of('orca.robot.notesViewed')[0]).toMatchObject({ robotId: 26, name: 'sonny' });
    expect(m!.container.textContent).toContain('HEALTH');
    await click(m!.container.querySelector('[data-hint="orca.robot.checkout"]'));
    expect(m!.container.textContent).toContain('Robot is blocked from checkouts (Connection Failed)');
    expect(cap.of('orca.robot.checkoutAttempted')[0]).toEqual({ robotId: 26, name: 'sonny', status: 'CONNECTION_FAILED', ok: false, message: 'Robot is blocked from checkouts (Connection Failed)' });
  });

  it('resolves a note through sim.orca.resolveNote', async () => {
    const spy = vi.spyOn(sim.orca, 'resolveNote');
    await open('/robot/26/view');
    await click(byText(m!.container, 'button', /Resolve/));
    expect(spy).toHaveBeenCalledWith(26, expect.any(Number), 'player');
    expect(cap.of('orca.robot.noteResolved')[0]).toMatchObject({ robotId: 26, ok: true });
  });
});

describe('Orca merchant config (Apps §2.8)', () => {
  it('hides credentials in the list and View; Edit shows them and emits editOpened / secretRevealed', async () => {
    await open('/merchant-config');
    expect(m!.container.textContent).not.toContain('key_sim_19c0e2');
    m!.unmount();
    await open('/merchant-config/3/view');
    expect(m!.container.textContent).toContain('App credentials: 3 fields — open Edit to see them');
    m!.unmount();
    await open('/merchant-config/3/edit');
    expect(cap.of('orca.merchant.editOpened')[0]).toEqual({ merchantId: 3, name: 'GO-SDK-US-01' });
    const apiKey = m!.container.querySelector('[data-hint="orca.merchant.field:apiKey"] input') as HTMLInputElement;
    expect(apiKey.value).toBe('key_sim_19c0e2');
    const secret = m!.container.querySelector('[data-hint="orca.merchant.field:appSecret"] input') as HTMLInputElement;
    expect(secret.type).toBe('password');
    await click(byText(m!.container, '[data-hint="orca.merchant.field:appSecret"] button', /Show/));
    expect(secret.type).toBe('text');
    expect(cap.of('orca.merchant.secretRevealed')).toHaveLength(1);
  });
});

describe('Orca screens (Apps §2.9)', () => {
  it('runs a test tap through sim.orca.xyTouch and shows the raw response', async () => {
    const screen = Object.values(getState().lab.orca.screens).find((s) => s.name === 'TENDER_CASH_DISCOUNT' && s.deviceType === 'FLEX_3')!;
    await open(`/screen/${screen.id}/view`);
    expect(cap.of('orca.screen.viewed')[0]).toMatchObject({ name: 'TENDER_CASH_DISCOUNT', deviceType: 'FLEX_3' });
    expect(cap.of('orca.screenLocations.viewed')[0]).toMatchObject({ screen: 'TENDER_CASH_DISCOUNT', deviceType: 'FLEX_3', count: 2 });
    await click(m!.container.querySelector('[data-hint="orca.screenLocation.testTap:Cash"]'));
    const spy = vi.spyOn(sim.orca, 'xyTouch');
    await click(byText(m!.container, '.orca-popover button', 'Tap'));
    expect(spy).toHaveBeenCalledWith('wall-e', 'TENDER_CASH_DISCOUNT', 'Cash', 'player');
    expect(m!.container.textContent).toContain('Watch the robot or its camera to confirm the hit.');
    const ev = cap.of('orca.screenLocation.testTap')[0]!;
    expect(ev).toMatchObject({ robotName: 'wall-e', screen: 'TENDER_CASH_DISCOUNT', button: 'Cash' });
  });
});

describe('Orca screen compare (Apps §2.11)', () => {
  it('shows the deprecation banner and the OCR log line after Test', async () => {
    await open('/screen-compare-image/1/view');
    expect(m!.container.textContent).toContain('Screen Compare Images (webcam crop → Tesseract OCR) are being phased out.');
    await click(m!.container.querySelector('[data-hint="orca.screenCompare.test"]'));
    // The OCR verdict is the sim's (what the CFD shows right now); the UI renders the Pi log line verbatim.
    const line = /\[ocr\] capture webcam → crop 236x44@412,288 → tesseract → "([^"]*)" → match=(true|false)/.exec(m!.container.textContent ?? '');
    expect(line).not.toBeNull();
    expect(cap.of('orca.screenCompare.tested')[0]).toMatchObject({ compareId: 1, name: 'CFD_TOTAL', match: line![2] === 'true', ok: true });
  });
});

describe('Orca gating and DB down (Apps §1.11, §2.13)', () => {
  it('renders the JHipster 500 page when the DB is down', async () => {
    const { mutate } = await import('@/core/store');
    mutate((s) => {
      s.lab.orca.app.dbConnected = false;
    });
    await open('/robot');
    expect(m!.container.textContent).toContain('Error Page!');
    expect(m!.container.textContent).toContain('Unable to acquire JDBC Connection');
    m!.unmount();
    m = null;
    mutate((s) => {
      s.lab.orca.app.dbConnected = true;
    });
  });
});

describe('Orca Swagger (Apps §2.12.1)', () => {
  it('pretty-prints response bodies without re-serialising numbers (matches curl)', async () => {
    const { pretty } = await import('./pages/Swagger');
    expect(pretty('{"result":"OK","mode":"PHYSICAL_TAP","x_mm":22.0,"y_mm":58.5,"a":[]}')).toBe(
      '{\n  "result": "OK",\n  "mode": "PHYSICAL_TAP",\n  "x_mm": 22.0,\n  "y_mm": 58.5,\n  "a": []\n}',
    );
    expect(pretty('Internal server error')).toBe('Internal server error');
  });
});
