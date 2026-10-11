import { describe, expect, it } from 'vitest';
import { fitScale } from './scale';

describe('desktop fitScale', () => {
  it('never scales a desktop-sized screen', () => {
    expect(fitScale(1600, 860)).toBe(1);
    expect(fitScale(1180, 780)).toBe(1);
  });
  it('scales phones so the logical desktop stays ≥ 960×540 (landscape) / 720 wide (portrait)', () => {
    const k = fitScale(820, 350);
    expect(350 / k).toBeGreaterThanOrEqual(539);
    expect(820 / k).toBeGreaterThanOrEqual(960);
    const p = fitScale(370, 780);
    expect(370 / p).toBeGreaterThanOrEqual(719);
  });
  it('handles empty containers', () => {
    expect(fitScale(0, 0)).toBe(1);
  });
});
