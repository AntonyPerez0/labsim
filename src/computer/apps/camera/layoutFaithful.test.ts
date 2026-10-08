/**
 * The materializer's label placement must equal the sim frame model (Apps §6.5): R2-D2's CFD `TOTAL $10.83` at
 * 412, 288, 236 × 44 in the webcam frame (Cur M16 s6) and FLEX_3 `Payment Successful` at 208, 512, 304 × 40 in a
 * screencap (GP INC24).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getState } from '@/core/store';
import { sim } from '@/sim';
import { CAMERA_BY_ID } from '@/sim/seed/cameras';
import { screenOf } from '@/sim/seed/deviceTypes';
import { displayElements } from './layoutFaithful';

beforeEach(() => {
  sim.reset({ preset: 'academy:M16' });
});

describe('layout-faithful labels', () => {
  it('places the R2-D2 CFD labels where the sim frame model measures them', () => {
    const lab = getState().lab;
    const cam = CAMERA_BY_ID['cam-r2-d2']!;
    const v = cam.views[0]!;
    const dev = lab.devices[v.deviceId]!;
    const els = displayElements(lab, dev, v.display, v.s, v.s, dev.labelShiftPx ?? 0).filter((e) => e.kind === 'label');
    const model = sim.ocr.frame('img:webcam:cam-r2-d2:live');
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    const total = model.value.labels.find((l) => l.text === 'TOTAL $10.83')!;
    expect([Math.round(total.x), Math.round(total.y), Math.round(total.w), Math.round(total.h)]).toEqual([412, 288, 236, 44]);
    for (const l of model.value.labels) {
      const e = els.find((x) => x.text === l.text)!;
      expect(e).toBeTruthy();
      expect(Math.abs(Math.round(v.ox) + e.x - l.x)).toBeLessThan(1);
      expect(Math.abs(Math.round(v.oy) + e.y - l.y)).toBeLessThan(1);
      expect(Math.abs(e.w - l.w)).toBeLessThan(1);
    }
  });

  it('places FLEX_3 Payment Successful where the screencap frame model has it', () => {
    expect(sim.faults.applySetup({ op: 'device.stage', params: { device: 'dev-wall-e-flex3', stage: 'approved' } }).ok).toBe(true);
    const lab = getState().lab;
    const dev = lab.devices['dev-wall-e-flex3']!;
    const scr = screenOf(dev.type, 'primary');
    const els = displayElements(lab, dev, 'primary', scr.px.x, scr.px.y);
    const model = sim.ocr.frame('img:screencap:dev-wall-e-flex3:live');
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    const l = model.value.labels.find((x) => x.text === 'Payment Successful')!;
    expect([l.x, l.y, l.w, l.h]).toEqual([208, 512, 304, 40]);
    const e = els.find((x) => x.text === 'Payment Successful')!;
    expect(Math.round(e.x)).toBe(208);
    expect(Math.round(e.y)).toBe(512);
    expect(Math.round(e.w)).toBe(304);
    expect(Math.round(e.h)).toBe(40);
  });
});
