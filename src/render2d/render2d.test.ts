import { describe, expect, it } from 'vitest';
// Load the store first: it seeds itself from '@/sim/initialState', which (via the sim) imports the store back.
import '@/core/store';
import { render2d, localButtons, effectiveButtons, btnCentre, hitButton, buttonActive, tabletStatusText, type LayoutQuery } from './index';
import type { TerminalDevice, LabState, OrcaRobot, RigState, ScreenName, DeviceTypeCode } from '@/sim/types';
import { createTerminalDevice, createDisplayState, createInitialLabState, createOrderState, createRigState } from '@/sim/initialState';
import { layoutClassFor } from './api';
import { registerFirmwareLayoutProvider } from './deviceScreens/layouts';
import { firmwareButtons } from '@/sim/seed/layouts';

/** Minimal recording CanvasRenderingContext2D stand-in for node tests. */
function fakeCtx(w = 400, h = 800): CanvasRenderingContext2D & { calls: number } {
  const state: Record<string | symbol, unknown> = { calls: 0, canvas: { width: w, height: h }, font: '10px sans-serif' };
  const noop = () => {
    state.calls = (state.calls as number) + 1;
  };
  const special: Record<string, unknown> = {
    measureText: (t: string) => ({ width: String(t).length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? '10') * 0.55) }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy(state, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && p in special) return special[p];
      return noop;
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D & { calls: number };
}

function q(type: DeviceTypeCode, screen: string, extra: Partial<LayoutQuery> = {}): LayoutQuery {
  return { type, display: 'primary', cls: layoutClassFor(type)!, screen, params: {}, receiptOptions: 4, apps: [], scroll: 0, ...extra };
}

const centre = (type: DeviceTypeCode, screen: string, id: string, extra: Partial<LayoutQuery> = {}) => {
  const b = localButtons(q(type, screen, extra)).find((x) => x.id === id);
  if (!b) throw new Error(`${type}/${screen}/${id} missing`);
  return btnCentre(b);
};

describe('firmware layouts (World §4)', () => {
  it('FLEX_GEN3 seed centres match §4.6 / curriculum S10', () => {
    expect(centre('FLEX_3', 'receipt-options', 'Print')).toEqual([34, 71]);
    expect(centre('FLEX_3', 'receipt-options', 'No Receipt')).toEqual([34, 107]);
    expect(centre('FLEX_3', 'receipt-options', 'Print', { receiptOptions: 5 })).toEqual([34, 74]);
    expect(centre('FLEX_3', 'receipt-options', 'Scan for receipt', { receiptOptions: 5 })).toEqual([34, 122]);
    expect(centre('FLEX_3', 'cash-discount-tender', 'Cash')).toEqual([22, 58.5]);
    expect(centre('FLEX_3', 'tender-select', 'Charge')).toEqual([34, 120]);
    expect(centre('FLEX_3', 'pin-entry', '0')).toEqual([54, 94]);
  });

  it('old 4-option taps miss the 5-option pills (the QR regression)', () => {
    const five = localButtons(q('FLEX_3', 'receipt-options', { receiptOptions: 5 }));
    for (const [x, y] of [
      [34, 71],
      [34, 83],
      [34, 95],
      [34, 107],
    ])
      expect(hitButton(five, x, y)).toBeNull();
  });

  it('derived P-s and L14 centres match §4.5', () => {
    const close = (a: [number, number], b: [number, number]) => {
      expect(a[0]).toBeCloseTo(b[0], 0);
      expect(Math.abs(a[1] - b[1])).toBeLessThanOrEqual(0.11);
    };
    close(centre('FLEX_1', 'register', 'Tax Item 5'), [16.9, 22.4]);
    close(centre('COMPACT', 'tender-select', 'Charge'), [31.2, 97.7]);
    close(centre('FLEX_1', 'pin-entry', '1'), [12.8, 35.0]);
    close(centre('FLEX_1', 'receipt-options', 'Print'), [31.2, 57.8]);
    close(centre('FLEX_1', 'receipt-options', 'No Receipt'), [31.2, 87.1]);
    close(centre('FLEX_1', 'receipt-options', 'Scan for receipt', { receiptOptions: 5 }), [31.2, 99.9]);
    close(centre('STATION_2018', 'register', 'Tax Item 5'), [36.0, 45.3]);
    close(centre('STATION_2018', 'register', 'Review Order'), [253.6, 150.5]);
    close(centre('STATION_2018', 'receipt-options', 'Print'), [155.0, 63.9]);
    close(centre('STATION_2018', 'receipt-options', 'No Receipt', { receiptOptions: 5 }), [155.0, 134.9]);
    close(centre('STATION_2018', 'tip', '15%'), [46.8, 72.8]);
    // receipt pills keep their 5.0 mm height in derived classes
    const pill = localButtons(q('STATION_2018', 'receipt-options')).find((b) => b.id === 'Print')!;
    expect(pill.h).toBe(5);
  });

  it('L8 launcher pages and P launcher scroll', () => {
    const p0 = localButtons(q('MINI_3', 'home'));
    expect(p0.find((b) => b.id === 'Setup')).toBeUndefined();
    const p1 = localButtons(q('MINI_3', 'home', { scroll: 1 }));
    expect(p1.find((b) => b.id === 'Setup')).toBeDefined();
    const flex = localButtons(q('FLEX_3', 'home'));
    expect(flex.find((b) => b.id === 'Setup')).toBeUndefined();
    expect(hitButton(flex, 13, 26)?.id).toBe('Register');
    const scrolled = localButtons(q('FLEX_3', 'home', { scroll: 1 }));
    expect(scrolled.find((b) => b.id === 'Setup')).toBeDefined();
  });

  it('effective layout = the sim firmware layout (drawn = hit), World §4 without a provider', () => {
    const types: DeviceTypeCode[] = ['FLEX_3', 'FLEX_1', 'MINI_3', 'MINI_2', 'STATION_2018', 'COMPACT'];
    const screens = ['register', 'review-order', 'tender-select', 'pin-entry', 'tip', 'receipt-options', 'payment-prompt'];
    for (const type of types)
      for (const screen of screens) {
        const sim = firmwareButtons(type, screen, 'primary', {}, 5);
        const eff = effectiveButtons(q(type, screen, { receiptOptions: 5 }));
        for (const sb of sim) {
          const e = eff.find((b) => b.id === sb.id || (sb.kind === 'pad' && b.id === 'signature.area'));
          expect(e, `${type}/${screen}/${sb.id}`).toBeDefined();
          const [cx, cy] = btnCentre(e!);
          expect(cx).toBeCloseTo(sb.x, 5);
          expect(cy).toBeCloseTo(sb.y, 5);
          // a probe at the centre hits that button (QR blocks are not touch targets)
          if (sb.kind === 'button') expect(hitButton(eff, sb.x, sb.y)?.id).toBe(sb.id);
        }
      }
    registerFirmwareLayoutProvider(null);
    try {
      expect(effectiveButtons(q('MINI_3', 'pin-entry')).map((b) => b.id)).toContain('OK');
    } finally {
      registerFirmwareLayoutProvider((qq) => firmwareButtons(qq.type, qq.screen, qq.display, qq.params, qq.receiptOptions));
    }
  });
});

function labWithDevice(type: DeviceTypeCode, screen: ScreenName, params: Record<string, string | number | boolean> = {}): { lab: LabState; dev: TerminalDevice } {
  const lab = createInitialLabState();
  const dev: TerminalDevice = createTerminalDevice('dev-test', type, {
    serial: 'SIM-0001', ip: '10.42.30.11', rigId: 'wall-e', merchantConfigId: null, theme: 'avocado',
    display: createDisplayState(screen, { params, rev: 1 }),
    secondaryDisplay: type.startsWith('STATION_DUO') ? createDisplayState(screen, { params, rev: 1 }) : null,
    order: createOrderState('ORD-1', { lines: [{ name: 'Tax Item 5', priceCents: 1000, qty: 1, taxable: true }], subtotalCents: 1000, taxCents: 83, totalCents: 1083 }),
    apps: ['Register', 'Dining'],
  });
  lab.devices[dev.id] = dev;
  return { lab, dev };
}

const SCREENS: ScreenName[] = [
  'off', 'boot', 'lock', 'home', 'register', 'review-order', 'customer-idle', 'customer-cart', 'tender-select', 'cash-discount-tender',
  'payment-prompt', 'pin-entry', 'tip', 'signature', 'processing', 'approved', 'declined', 'receipt-options', 'printing',
  'oobe-welcome', 'oobe-network', 'oobe-merchant', 'oobe-employee', 'oobe-complete', 'deprovisioning', 'app-orders', 'app-transactions', 'app-setup', 'app-dining', 'error',
];

describe('drawDeviceDisplay', () => {
  it('draws every screen on every layout class without throwing', () => {
    for (const type of ['FLEX_3', 'FLEX_1', 'MINI_3', 'STATION_2018', 'STATION_DUO'] as DeviceTypeCode[]) {
      for (const screen of SCREENS) {
        const { lab, dev } = labWithDevice(type, screen, { pad: screen === 'lock', qr: false, strokes: '[[10,40],[20,50],[30,45]]' });
        const ctx = fakeCtx();
        render2d.drawDeviceDisplay(ctx, lab, dev, 'primary', { pxPerMm: 4, timeMs: 1234, showTouchTargets: true, ripple: { xMm: 30, yMm: 60, ageMs: 100 } });
        expect(ctx.calls, `${type}/${screen}`).toBeGreaterThan(0);
        if (dev.secondaryDisplay) render2d.drawDeviceDisplay(fakeCtx(), lab, dev, 'secondary', { pxPerMm: 4, timeMs: 0 });
      }
    }
  });
});

describe('drawTablet', () => {
  const rig = (over: Partial<RigState> = {}): RigState =>
    createRigState('wall-e', 1, 'touch', {
      gantry: { ...createRigState('x', 1, 'touch').gantry, xMm: 12, yMm: 58.5, targetXMm: 12, targetYMm: 58.5, maxXMm: 80, maxYMm: 148 },
      piHostId: 'pi-wall-e', callusHostId: 'minix-01', collisId: 'collis-wall-e', shelfPropId: 'rack.a',
      tablet: { tab: 'motion-control', statusText: 'OK', brainbox: 'Brainbox v6', hrnShown: 'WALL-E', reachable: true },
      ...over,
    });
  const robot = { id: 1, name: 'wall-e', humanReadableName: 'WALL-E', status: 'AVAILABLE', checkout: { buildId: 'Java/uia-remote-regression-flex#4120', jobId: 'Java/uia-remote-regression-flex', byName: false, startedMs: 0 } } as unknown as OrcaRobot;

  it('draws all tabs, banners, boot phases and the lockout', () => {
    const lab = createInitialLabState();
    for (const tab of ['robot', 'robot-control', 'motion-control'] as const)
      for (const banner of ['green', 'yellow', 'grey', 'red'] as const)
        for (const locked of [false, true]) {
          const ctx = fakeCtx(1024, 640);
          render2d.drawTablet(ctx, lab, rig({ banner, dashboardLocked: locked }), robot, { widthPx: 1024, heightPx: 640, tab, timeMs: 500, quip: 'Beep.', colorBlind: true, wipe: { from: 'yellow', progress01: 0.5 } });
          expect(ctx.calls).toBeGreaterThan(10);
        }
    for (const boot of ['black', 'splash', 'connecting'] as const) render2d.drawTablet(fakeCtx(), lab, rig(), robot, { widthPx: 512, heightPx: 320, boot });
  });

  it('status text and state highlights', () => {
    expect(tabletStatusText(rig({ tablet: { tab: 'motion-control', statusText: 'Status: LOCK RELEASED — PARK REQUIRED', brainbox: 'Brainbox v6', hrnShown: 'WALL-E', reachable: true } }))).toBe('LOCK RELEASED — PARK REQUIRED');
    expect(buttonActive(rig({ steppersEnabled: false }), '!steppersEnabled')).toBe(true);
    expect(buttonActive(rig({ dipArm: 'extended' }), "dipArm in ('extended','extending')")).toBe(true);
    expect(buttonActive(rig({ solenoid: { down: true, heightAdjustMm: 0, lastTapMs: null, taps: 0, mode: 'fast' } }), 'solenoid.down')).toBe(true);
  });
});

describe('drawReceipt', () => {
  it('sizes and draws a receipt', () => {
    const text = 'Lab Test Merchant\n123 LAB WAY\n\nTax Item 5  $10.00\nTOTAL  $10.83\nAPPROVED';
    const h = render2d.receiptHeightPx(text, 384);
    expect(h).toBeGreaterThan(100);
    const ctx = fakeCtx(384, h);
    render2d.drawReceipt(ctx, text, { widthPx: 384, qrSeed: 'ORD-1' });
    expect(ctx.calls).toBeGreaterThan(5);
  });
});
