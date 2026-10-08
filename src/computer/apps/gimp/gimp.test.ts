/** GIMP-lite selection maths (Apps §6.3–§6.4). */
import { describe, expect, it } from 'vitest';
import { clampSel, hitHandle, moveSel, resizeSel, toUnit, zoomIn, zoomOut } from './model';

describe('GIMP selection', () => {
  it('normalises negative drags and clamps to the image', () => {
    expect(clampSel({ x: 648, y: 332, w: -236, h: -44 }, 1280, 720)).toEqual({ x: 412, y: 288, w: 236, h: 44 });
    expect(clampSel({ x: -10, y: 700, w: 50, h: 50 }, 1280, 720)).toEqual({ x: 0, y: 700, w: 40, h: 20 });
  });
  it('moves (arrow nudge) inside the image and resizes from handles', () => {
    expect(moveSel({ x: 412, y: 288, w: 236, h: 44 }, 1, 0, 1280, 720)).toEqual({ x: 413, y: 288, w: 236, h: 44 });
    expect(moveSel({ x: 1200, y: 288, w: 236, h: 44 }, 25, 0, 1280, 720).x).toBe(1044);
    expect(resizeSel({ x: 412, y: 288, w: 236, h: 44 }, 'se', 4, -4, 1280, 720)).toEqual({ x: 412, y: 288, w: 240, h: 40 });
    expect(hitHandle({ x: 100, y: 100, w: 100, h: 100 }, 150, 150, 10)).toBe('inside');
    expect(hitHandle({ x: 100, y: 100, w: 100, h: 100 }, 101, 101, 10)).toBe('nw');
    expect(hitHandle({ x: 100, y: 100, w: 100, h: 100 }, 400, 400, 10)).toBeNull();
  });
  it('zooms through GIMP presets and converts units at 72 ppi', () => {
    expect(zoomIn(1)).toBe(1.5);
    expect(zoomOut(1)).toBe(0.667);
    expect(toUnit(72, 'in')).toBe('1.000');
    expect(toUnit(72, 'mm')).toBe('25.4');
  });
});
