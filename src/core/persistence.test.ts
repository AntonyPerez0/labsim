import { describe, expect, it } from 'vitest';
import { mergeDefaults, migrateProgress } from './persistence';
import { createDefaultProgress, PROGRESS_VERSION } from './state';

describe('progress migration', () => {
  it('fills nested defaults an older save lacks and keeps saved values', () => {
    const base = createDefaultProgress();
    const old = {
      version: 1,
      playerName: 'Riley',
      xp: 1200,
      shifts: { history: [{ configId: 'shift-5' }] },
      streak: { current: 3 },
      settings: { quality: 'low', bindings: { notebook: 'KeyN' } },
    };
    const p = migrateProgress(old);
    expect(p.version).toBe(PROGRESS_VERSION);
    expect(p.playerName).toBe('Riley');
    expect(p.xp).toBe(1200);
    expect(p.shifts.history).toEqual([{ configId: 'shift-5' }]);
    expect(p.shifts.gradeCounts).toEqual(base.shifts.gradeCounts);
    expect(p.shifts.bestFullShiftRatio).toBe(0);
    expect(p.streak.current).toBe(3);
    expect(p.streak.best).toBe(base.streak.best);
    expect(p.fieldManual).toEqual(base.fieldManual);
    expect(p.settings.quality).toBe('low');
    expect(p.settings.fov).toBe(base.settings.fov);
    expect(p.settings.bindings).toEqual({ notebook: 'KeyN' });
  });

  it('returns fresh defaults for garbage', () => {
    expect(migrateProgress(null)).toEqual(createDefaultProgress());
    expect(migrateProgress('nope')).toEqual(createDefaultProgress());
  });

  it('takes arrays and nulls from the save as they are', () => {
    expect(mergeDefaults({ a: [1, 2], b: { c: 1 } }, { a: [3], b: null })).toEqual({ a: [3], b: null });
    expect(mergeDefaults({ a: null as null | { x: number } }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });
});
