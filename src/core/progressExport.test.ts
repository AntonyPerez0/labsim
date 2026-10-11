/**
 * Progress export / import (pure parts of `./persistence`): the export envelope, the file name and
 * validation of imported files, including bad input that must be refused without throwing.
 */
import { describe, expect, it } from 'vitest';
import { createDefaultProgress } from './state';
import { buildExportPayload, EXPORT_FORMAT, EXPORT_VERSION, exportFileName, parseProgressImport, summarizeProgress, withDeviceSettings } from './persistence';

function sample() {
  const p = createDefaultProgress();
  p.playerName = 'Ada Byte';
  p.xp = 1234;
  p.rank = 'lab-technician';
  p.modules.M01 = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } };
  p.modules.M02 = { completed: false, bestScore: 0, completedAtDay: 0, status: 'in-progress', stars: 0, bestCheckpoint: 0, replays: 0, starBonusesPaid: { two: false, three: false } };
  p.flags['coach:menu.start'] = true;
  p.settings.fov = 82;
  return p;
}

describe('progress export', () => {
  it('wraps progress in a versioned envelope (deep copy)', () => {
    const p = sample();
    const now = new Date(2026, 9, 11, 9, 30);
    const out = buildExportPayload(p, now);
    expect(out.format).toBe(EXPORT_FORMAT);
    expect(out.version).toBe(EXPORT_VERSION);
    expect(out.exportedAt).toBe(now.toISOString());
    expect(out.progress).toEqual(p);
    expect(out.progress).not.toBe(p);
    p.xp = 0;
    expect(out.progress.xp).toBe(1234);
  });

  it('names the file after the player and the date', () => {
    const d = new Date(2026, 9, 11);
    expect(exportFileName('Ada Byte', d)).toBe('labsim-progress-ada-byte-2026-10-11.json');
    expect(exportFileName('  Zoë_Ünal!! ', d)).toBe('labsim-progress-zoe-unal-2026-10-11.json');
    expect(exportFileName('???', d)).toBe('labsim-progress-player-2026-10-11.json');
  });

  it('round-trips through import', () => {
    const p = sample();
    const text = JSON.stringify(buildExportPayload(p));
    const r = parseProgressImport(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.playerName).toBe('Ada Byte');
    expect(r.progress.xp).toBe(1234);
    expect(r.progress.modules.M01?.stars).toBe(3);
    expect(r.progress.flags['coach:menu.start']).toBe(true);
    expect(r.progress.settings.fov).toBe(82);
    expect(r.summary).toMatchObject({ playerName: 'Ada Byte', xp: 1234, rank: 'lab-technician', modulesDone: 1 });
    expect(r.summary.exportedAt).toEqual(expect.any(String));
  });

  it('fills in fields an older export lacks (migrateProgress)', () => {
    const r = parseProgressImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, exportedAt: 'x', progress: { playerName: 'Old', xp: 50, pigeonPractice: { 'comma-hunt': { solved: 2, bestS: 30, lastDay: 1 } } } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.streak).toBeDefined();
    expect(r.progress.settings.coachTips).toBe(true);
    expect(r.progress.parrotPractice['comma-hunt']?.solved).toBe(2);
    expect(summarizeProgress(r.progress).modulesDone).toBe(0);
  });
});

describe('import keeps this device’s graphics settings', () => {
  it('takes the player from the file and the hardware settings from the browser', () => {
    const imported = sample();
    imported.settings.quality = 'ultra';
    imported.settings.frameRateCap = 0;
    imported.flags.qualityDetected = true;
    const current = createDefaultProgress();
    current.settings.quality = 'potato';
    current.settings.frameRateCap = 30;
    const out = withDeviceSettings(imported, current);
    expect(out.playerName).toBe('Ada Byte');
    expect(out.settings.fov).toBe(82);
    expect(out.settings.quality).toBe('potato');
    expect(out.settings.frameRateCap).toBe(30);
    expect(out.flags.qualityDetected).toBeUndefined();
    expect(out.flags['coach:menu.start']).toBe(true);
    expect(imported.settings.quality).toBe('ultra');
  });
});

describe('progress import refuses bad files', () => {
  const bad: [string, string][] = [
    ['empty', ''],
    ['not json', '{ nope'],
    ['a json array', '[1,2,3]'],
    ['a plain save without envelope', JSON.stringify(createDefaultProgress())],
    ['wrong format', JSON.stringify({ format: 'something-else', version: 1, progress: { playerName: 'x', xp: 1 } })],
    ['newer version', JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION + 1, progress: { playerName: 'x', xp: 1 } })],
    ['no version', JSON.stringify({ format: EXPORT_FORMAT, progress: { playerName: 'x', xp: 1 } })],
    ['no progress', JSON.stringify({ format: EXPORT_FORMAT, version: 1 })],
    ['progress not an object', JSON.stringify({ format: EXPORT_FORMAT, version: 1, progress: 'hello' })],
    ['negative xp', JSON.stringify({ format: EXPORT_FORMAT, version: 1, progress: { playerName: 'x', xp: -5 } })],
    ['no name', JSON.stringify({ format: EXPORT_FORMAT, version: 1, progress: { xp: 5 } })],
    ['modules not a map', JSON.stringify({ format: EXPORT_FORMAT, version: 1, progress: { playerName: 'x', xp: 5, modules: [1] } })],
    ['settings not a map', JSON.stringify({ format: EXPORT_FORMAT, version: 1, progress: { playerName: 'x', xp: 5, settings: 'loud' } })],
  ];
  for (const [what, text] of bad) {
    it(what, () => {
      const r = parseProgressImport(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(8);
    });
  }
});
