// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { OUTCOME_META, ROBOT_STATUS_META, clampUiScale, cssZoom, focusableIn, localPoint, outcomeKind, pressable, robotStatusMeta, trapTabKey } from './a11y';
import { nextTabIndex } from './Tabs';

describe('status meta (colour is never the only cue)', () => {
  it('gives every robot status a distinct glyph, a label and a CSS var', () => {
    const metas = Object.values(ROBOT_STATUS_META);
    expect(new Set(metas.map((m) => m.glyph)).size).toBe(metas.length);
    for (const m of metas) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.cssVar).toMatch(/^--st-/);
    }
  });

  it('accepts enum values and human labels', () => {
    expect(robotStatusMeta('CONNECTION_FAILED').label).toBe('Connection Failed');
    expect(robotStatusMeta('Connection Failed').glyph).toBe(ROBOT_STATUS_META.CONNECTION_FAILED.glyph);
    expect(robotStatusMeta('reserved').cls).toBe('reserved');
    expect(robotStatusMeta('whatever').label).toBe('whatever');
  });

  it('maps the many outcome spellings', () => {
    expect(outcomeKind('SUCCESS')).toBe('pass');
    expect(outcomeKind('failure')).toBe('fail');
    expect(outcomeKind('UNSTABLE')).toBe('warn');
    expect(outcomeKind('in_progress')).toBe('running');
    expect(outcomeKind('ABORTED')).toBe('aborted');
    expect(outcomeKind(true)).toBe('pass');
    expect(outcomeKind(false)).toBe('fail');
    expect(outcomeKind(null)).toBe('info');
    expect(OUTCOME_META.pass.glyph).not.toBe(OUTCOME_META.fail.glyph);
  });
});

describe('UI scale', () => {
  it('clamps to 0.85–1.5 and defaults bad values to 1', () => {
    expect(clampUiScale(1)).toBe(1);
    expect(clampUiScale(0.5)).toBe(0.85);
    expect(clampUiScale(3)).toBe(1.5);
    expect(clampUiScale(Number.NaN)).toBe(1);
    expect(clampUiScale('1.2')).toBe(1);
    expect(clampUiScale(1.234)).toBe(1.23);
  });

  it('converts visual pointer coordinates into an element’s zoomed px', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'currentCSSZoom', { value: 1.5 });
    el.getBoundingClientRect = () => ({ left: 100, top: 50, right: 400, bottom: 350, width: 300, height: 300, x: 100, y: 50, toJSON: () => ({}) });
    expect(cssZoom(el)).toBe(1.5);
    expect(localPoint(el, 250, 200)).toEqual({ x: 100, y: 100 });
    expect(cssZoom(null)).toBe(1);
  });
});

describe('focus helpers', () => {
  function dialog(): HTMLDivElement {
    const root = document.createElement('div');
    root.tabIndex = -1;
    root.innerHTML = '<button id="a">A</button><input id="b" /><button id="c" disabled>C</button><a id="d" href="#">D</a><span tabindex="-1">x</span>';
    document.body.appendChild(root);
    return root;
  }

  it('lists focusable descendants in order, skipping disabled / tabindex=-1', () => {
    const root = dialog();
    expect(focusableIn(root).map((e) => e.id)).toEqual(['a', 'b', 'd']);
    root.remove();
  });

  it('wraps Tab and Shift+Tab inside the dialog', () => {
    const root = dialog();
    const ev = (shiftKey: boolean) => {
      let prevented = false;
      return { key: 'Tab', shiftKey, preventDefault: () => (prevented = true), get prevented() { return prevented; } };
    };
    (root.querySelector('#d') as HTMLElement).focus();
    const fwd = ev(false);
    expect(trapTabKey(fwd, root)).toBe(true);
    expect(fwd.prevented).toBe(true);
    expect(document.activeElement?.id).toBe('a');
    const back = ev(true);
    expect(trapTabKey(back, root)).toBe(true);
    expect(document.activeElement?.id).toBe('d');
    // Inside the cycle: leave it to the browser.
    (root.querySelector('#a') as HTMLElement).focus();
    expect(trapTabKey(ev(false), root)).toBe(false);
    expect(trapTabKey({ key: 'Enter', shiftKey: false, preventDefault: () => undefined }, root)).toBe(false);
    root.remove();
  });

  it('pressable activates on Enter / Space only for the element itself', () => {
    let n = 0;
    const p = pressable(() => n++);
    const el = document.createElement('div');
    const child = document.createElement('button');
    const key = (k: string, target: EventTarget) => p.onKeyDown({ key: k, target, currentTarget: el, preventDefault: () => undefined });
    key('Enter', el);
    key(' ', el);
    key('a', el);
    key('Enter', child);
    expect(n).toBe(2);
    expect(p.role).toBe('button');
    expect(p.tabIndex).toBe(0);
  });
});

describe('tabs keyboard model', () => {
  it('moves with arrows / Home / End and skips disabled tabs', () => {
    const dis = [false, true, false, false];
    expect(nextTabIndex('ArrowRight', 0, dis)).toBe(2);
    expect(nextTabIndex('ArrowLeft', 0, dis)).toBe(3);
    expect(nextTabIndex('ArrowRight', 3, dis)).toBe(0);
    expect(nextTabIndex('Home', 3, dis)).toBe(0);
    expect(nextTabIndex('End', 0, dis)).toBe(3);
    expect(nextTabIndex('Enter', 0, dis)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, [])).toBeNull();
  });
});
