import { describe, expect, it } from 'vitest';
import {
  LAYOUT_CLASS_SIZE_MM,
  MOTION_GROUPS,
  TABLET_LAYOUT,
  TABLET_MOTION_BUTTONS,
  TABLET_ROBOT_CONTROL_BUTTONS,
  hitTestTablet,
  layoutClassFor,
  screenCanvasSize,
  type PxRect,
} from './api';

const overlap = (a: PxRect, b: PxRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: PxRect, b: PxRect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe('render2d contract', () => {
  it('maps device types to layout classes (World §4.2)', () => {
    expect(layoutClassFor('FLEX_3')).toBe('P');
    expect(layoutClassFor('FLEX_POCKET')).toBe('P');
    expect(layoutClassFor('FLEX_1')).toBe('P-s');
    expect(layoutClassFor('COMPACT')).toBe('P-s');
    expect(layoutClassFor('MINI_3')).toBe('L8');
    expect(layoutClassFor('STATION_2')).toBe('L8');
    expect(layoutClassFor('STATION_2018')).toBe('L14');
    expect(layoutClassFor('STATION_DUO')).toBe('L14');
    expect(layoutClassFor('STATION_DUO', 'secondary')).toBe('L8');
    expect(layoutClassFor('FLEX_3', 'secondary')).toBeNull();
    expect(layoutClassFor('STATION_DUO_3')).toBeNull();
    expect(LAYOUT_CLASS_SIZE_MM.L14.w).toBeCloseTo(172.3 * 1.79861, 1);
  });

  it('caps screen canvases per preset', () => {
    expect(screenCanvasSize(68, 136, 'high')).toEqual({ w: 408, h: 816, pxPerMm: 6 });
    const l14 = screenCanvasSize(309.9, 174.3, 'high');
    expect(l14.w).toBeLessThanOrEqual(1024);
  });

  it('motion buttons sit under their group headers, inside the panel, without overlap', () => {
    const panel = TABLET_LAYOUT.contentPanel;
    for (const b of TABLET_MOTION_BUTTONS) {
      const g = MOTION_GROUPS.find((m) => m.name === b.group)!;
      expect(b.rect.x + b.rect.w / 2, b.id).toBeCloseTo(g.cx, 6);
      expect(b.rect.w, b.id).toBe(g.w);
      expect(inside(b.rect, panel), b.id).toBe(true);
    }
    const all = [...TABLET_MOTION_BUTTONS, ...TABLET_ROBOT_CONTROL_BUTTONS];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        if (all[i]!.tab === all[j]!.tab) expect(overlap(all[i]!.rect, all[j]!.rect), `${all[i]!.id} × ${all[j]!.id}`).toBe(false);
  });

  it('hit-tests tabs, buttons and the lockout', () => {
    expect(hitTestTablet(1000, 130, 'robot')).toEqual({ kind: 'tab', tab: 'motion-control' });
    const park = hitTestTablet(387, 374, 'motion-control');
    expect(park && park.kind === 'button' && park.button.command).toBe('park.all');
    const push = hitTestTablet(955, 600, 'motion-control');
    expect(push && push.kind === 'button' && push.button.command).toBe('phone.pushPower');
    expect(hitTestTablet(387, 374, 'motion-control', true)).toEqual({ kind: 'locked' });
    expect(hitTestTablet(387, 374, 'robot')).toBeNull();
    expect(hitTestTablet(230, 620, 'robot-control')).toEqual({ kind: 'step', stepMm: 0.1 });
  });
});
