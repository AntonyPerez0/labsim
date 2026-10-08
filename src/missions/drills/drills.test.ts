/**
 * Drill catalogue tests (GP §2.4): the 19 definitions, item validity (tags, facts, Teach Cards, people
 * rules), generator determinism, drill-specific grading/scoring, and a runtime round-trip per drill.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createRngState } from '@/core/rng';
import { createInitialRoot, getState, mutate } from '@/core/store';
import type { RootState } from '@/core/state';
import { factById, isKnownTag, MODULE_ORDER, MODULES_BY_ID, questionById } from '@/content';
import { DEVICE_TYPE_CODES } from '@/sim/types';
import type { DrillDef, DrillItem } from '../types';
import { missions } from '../index';
import { resetWorld } from '../runtime/__tests__/helpers';
import { DRILLS, DRILLS_BY_ID } from './index';
import { STATUS_TRIAGE_ITEMS } from './dr01-status-triage/logic';
import { CONFIG_KEYS, gradeConfig, type ConfigData, completeKey, filePoints } from './dr02-config-speed-build/logic';
import { fixMatches, PORT_TEMPLATES, type PortData } from './dr03-port-patrol/logic';
import { boardPoints, checkBoard, sparkFor, type BoardData, type Wire } from './dr04-power-path/logic';
import { checkBlock, huntPoints, mmOk, PX_PER_MM, SHOTS, targetsFor, type HuntData } from './dr05-coordinate-hunter/logic';
import { jsonErrorAt, renderPayload, type MedicData } from './dr06-json-medic/logic';
import { gradeTap, receiptItem, receiptMaps, type ReceiptData } from './dr07-receipt-map/logic';
import { correctZone, doctorSource, gradeBuild, gradeDoctor, type PomData } from './dr08-pom-builder/logic';
import { SEQ_SETS, sequencePoints, type SeqData } from './dr09-pipeline-order/logic';
import { HOTSPOTS, SCENE_REGIONS, type SpeedData as QuizSpeedData } from './dr10-speed-quiz/logic';
import { applyAction, parkPoints, type ParkData } from './dr16-park-it/logic';
import { launcher, newTerm, runCommand, speedItem, SPEEDRUN_DEVICES, targetPoints, type SpeedData } from './dr19-adb-speedrun/logic';
import { edgeError, edgeErrorPoints, standardPoints } from './common/scoring';

const GENDERED = /\b(he|she|him|her|hers|his|himself|herself)\b/i;

function rootWith(mode: string | null = null): RootState {
  const r = createInitialRoot();
  r.session.drill = { drillId: 'X', mode, daily: false, seed: 1, tags: null, phase: 'running', durationS: 60, timeLeftS: 60, itemTarget: null, queue: [], index: 0, currentItemId: null, itemShownAtS: 0, score: 0, streak: 0, bestStreak: 0, multiplier: 1, correct: 0, wrong: 0, answers: [], teach: null, medal: null, newBest: false };
  return r;
}

/** Items of a drill: the bank, or 40 generated with a fixed seed. */
function itemsOf(def: DrillDef, seed = 7, mode: string | null = null): DrillItem[] {
  if (def.items?.length) return [...def.items] as DrillItem[];
  const rng = createRngState(seed);
  const st = rootWith(mode ?? def.modes?.[0]?.id ?? null);
  const out: DrillItem[] = [];
  for (let i = 0; i < 40; i++) {
    const it = def.generate!(rng, st, i) as DrillItem;
    out.push(it);
    st.session.drill!.queue.push(it.id);
  }
  return out;
}

describe('drill catalogue (GP §2.4.2)', () => {
  it('has DR01–DR19 with sane definitions', () => {
    expect(DRILLS.map((d) => d.id)).toEqual(Array.from({ length: 19 }, (_, i) => `DR${String(i + 1).padStart(2, '0')}`));
    for (const d of DRILLS) {
      expect(d.medals.bronze).toBeLessThan(d.medals.silver);
      expect(d.medals.silver).toBeLessThan(d.medals.gold);
      expect(d.durationS ?? d.itemCount).toBeTruthy();
      expect(typeof d.component).toBe('function');
      expect(!!d.items?.length || !!d.generate).toBe(true);
      for (const m of d.unlockedBy) expect(MODULES_BY_ID[m], `${d.id} unlock ${m}`).toBeTruthy();
      for (const t of d.tags) expect(isKnownTag(t), `${d.id} tag ${t}`).toBe(true);
    }
    expect(DRILLS_BY_ID.DR05!.modes?.map((m) => m.id)).toEqual(['A', 'B', 'C']);
    expect(DRILLS_BY_ID.DR08!.modes?.map((m) => m.id)).toEqual(['build', 'doctor']);
  });

  it('matches the GP medal table', () => {
    const want: Record<string, [number, number, number]> = {
      DR01: [800, 1500, 2200], DR02: [900, 1600, 2300], DR03: [900, 1600, 2400], DR04: [900, 1500, 2100], DR05: [700, 1300, 1900], DR06: [700, 1300, 2000], DR07: [900, 1600, 2300],
      DR08: [800, 1400, 2000], DR09: [700, 1300, 1900], DR10: [1000, 2000, 3000], DR11: [900, 1600, 2300], DR12: [800, 1500, 2200], DR13: [700, 1300, 1900], DR14: [600, 1100, 1600],
      DR15: [800, 1400, 2000], DR16: [600, 1100, 1700], DR17: [800, 1500, 2200], DR18: [700, 1300, 1900], DR19: [600, 1100, 1600],
    };
    for (const d of DRILLS) expect([d.medals.bronze, d.medals.silver, d.medals.gold], d.id).toEqual(want[d.id]);
  });

  it.each(DRILLS.map((d) => [d.id, d] as const))('%s items are valid (tags, facts, Teach Cards, people)', (_id, def) => {
    const modes = def.modes?.map((m) => m.id) ?? [null];
    for (const mode of modes) {
      const items = itemsOf(def, 11, mode);
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) {
        expect(it.id).toBeTruthy();
        expect(it.tags.length).toBeGreaterThan(0);
        for (const t of it.tags) expect(isKnownTag(t), `${it.id} tag ${t}`).toBe(true);
        for (const f of it.factIds ?? []) expect(factById(f), `${it.id} fact ${f}`).toBeTruthy();
        if (it.questionId) expect(questionById(it.questionId)).toBeTruthy();
        expect(it.teach.whatHappened.length).toBeGreaterThan(3);
        expect(it.teach.why.length).toBeGreaterThan(10);
        const text = `${it.teach.whatHappened} ${it.teach.why} ${JSON.stringify(it.data)}`;
        expect(GENDERED.test(text.replace(/\$\{[^}]+\}/g, '')), `${it.id}: gendered pronoun`).toBe(false);
        expect(text.includes('{{'), `${it.id}: unresolved person token`).toBe(false);
      }
    }
  });

  it('generators are deterministic for a seed', () => {
    for (const def of DRILLS.filter((d) => d.generate)) {
      const a = itemsOf(def, 42).map((i) => i.id);
      const b = itemsOf(def, 42).map((i) => i.id);
      expect(a, def.id).toEqual(b);
    }
  });
});

describe('DR01 Status Triage', () => {
  it('has ≥ 40 items and every required spec answer', () => {
    expect(STATUS_TRIAGE_ITEMS.length).toBeGreaterThanOrEqual(40);
    const req = STATUS_TRIAGE_ITEMS.filter((i) => i.data.required);
    expect(req).toHaveLength(12);
    const find = (s: string) => req.find((i) => i.data.scenario.includes(s))!.data.answer;
    expect(find('rebuilding BAYMAX')).toBe('Offline');
    expect(find('502 Bad Gateway')).toBe('Connection Failed');
    expect(find('Reserved rig\'s Pi loses power')).toBe('Reserved');
    expect(find('Offline rig\'s Pi is unplugged')).toBe('Offline');
    expect(find('named `rosie` just finished')).toBe('Unavailable');
  });
});

describe('DR02 config.properties Speed-Build', () => {
  const items = itemsOf(DRILLS_BY_ID.DR02!) as DrillItem<ConfigData>[];
  it('targets follow the validator: Duo IPs equal, family deviceType, locks', () => {
    for (const it of items) {
      const t = it.data.target;
      expect(Object.keys(t)).toEqual([...CONFIG_KEYS]);
      expect([t.theme, t.kernelType, t.portNumber]).toEqual(['avocado', 'CPA', '5444']);
      expect(['Mini', 'Flex', 'Station']).toContain(t.deviceType);
      if (it.data.variant === 'duo') expect(t.customerFacingDeviceIp).toBe(t.merchantFacingDeviceIp);
      if (it.data.variant === 'tethered') expect(t.runType).toBe('tethered');
      if (it.data.variant === 'flex') expect(t.deviceType).toBe('Flex');
    }
    expect(items.some((i) => i.data.variant === 'duo') && items.some((i) => i.data.variant === 'wiki')).toBe(true);
  });
  it('MEGATRON target is identical to Cur M14', () => {
    const it = items.find((i) => i.data.rig === 'megatron')!;
    expect(CONFIG_KEYS.map((k) => `${k}=${it.data.target[k]}`)).toEqual([
      'runType=tethered', 'merchantFacingDeviceIp=10.42.30.21', 'customerFacingDeviceIp=10.42.30.22', 'serial=SIM-S2-000021', 'deviceType=Station', 'theme=avocado', 'kernelType=CPA', 'portNumber=5444', 'unlockPasscode=0000', 'backendEnv=DEV1', 'robotName=megatron',
    ]);
  });
  it('grades lines and scores +40/key, +100 all', () => {
    const it = items[0]!;
    const good = CONFIG_KEYS.map((k) => `${k}=${it.data.target[k]}`);
    expect(gradeConfig(it.data, good).correct).toBe(11);
    expect(gradeConfig(it.data, good.map((l) => (l.startsWith('portNumber') ? 'portNumber=5555' : l))).correct).toBe(10);
    expect(gradeConfig(it.data, ['# comment', ' runType = tethered ']).rows[0]!.ok).toBe(it.data.target.runType === 'tethered');
    expect(filePoints(10, 30, 0)).toBe(400);
    expect(filePoints(11, 60, 0)).toBe(540);
    const wiki = items.find((i) => i.data.variant === 'wiki')!;
    expect(gradeConfig(wiki.data, wiki.data.start).correct).toBe(8);
    expect(completeKey('mer', [])).toBe('merchantFacingDeviceIp');
    expect(completeKey('me', [])).toBeNull();
  });
});

describe('DR03 Port Patrol', () => {
  it('classifies by the spec rules', () => {
    const items = itemsOf(DRILLS_BY_ID.DR03!) as DrillItem<PortData>[];
    for (const it of items) {
      const l = it.data.line;
      const risky = /[:=]5555\b/.test(l) || /10\.42\.60\./.test(l) || /^adb connect \S+$/.test(l) && !l.includes(':') || l === 'adb tcpip 5555';
      expect(it.data.risk, l).toBe(risky);
    }
    expect(PORT_TEMPLATES.risky.length).toBeGreaterThan(6);
    expect(fixMatches('  adb   disconnect 10.42.60.4:5555 ', ['adb disconnect 10.42.60.4:5555'])).toBe(true);
  });
});

describe('DR04 Power Path', () => {
  const board: BoardData = { title: '', nodes: ['wall', 'strip', 'meanwell', 'reg12', 'reg5', 'fuseA', 'fuseB', 'pi', 'nuc', 'flex4', 'collis', 'motor'], columns: [] };
  const good: Wire[] = [
    { from: 'wall', to: 'meanwell' }, { from: 'wall', to: 'strip' }, { from: 'meanwell', to: 'reg12' }, { from: 'meanwell', to: 'reg5' }, { from: 'meanwell', to: 'motor' },
    { from: 'reg12', to: 'fuseA' }, { from: 'fuseA', to: 'nuc' }, { from: 'reg5', to: 'fuseB' }, { from: 'fuseB', to: 'pi' }, { from: 'strip', to: 'flex4' }, { from: 'strip', to: 'collis' },
  ];
  it('accepts the reference graph and flags missing fuses', () => {
    expect(checkBoard(board, good).perfect).toBe(true);
    const noFuse = good.filter((w) => w.to !== 'pi' && w.to !== 'fuseB').concat({ from: 'reg5', to: 'pi' });
    const r = checkBoard(board, noFuse);
    expect(r.missingFuse).toBe(1);
    expect(r.perfect).toBe(false);
    expect(boardPoints(r, 0, 10, 0)).toBe(50 * r.correct - 100);
  });
  it('sparks LabSim/Collis on DC and over-voltage', () => {
    expect(sparkFor('reg5', 'flex4', good)).toMatch(/18 V/);
    expect(sparkFor('meanwell', 'collis', good)).toBeTruthy();
    expect(sparkFor('strip', 'flex4', good)).toBeNull();
    expect(sparkFor('reg12', 'pi', good)).toBeTruthy();
    expect(sparkFor('wall', 'pi', good)).toBeTruthy();
    expect(sparkFor('fuseA', 'nuc', good)).toBeNull();
  });
});

describe('DR05 Coordinate Hunter', () => {
  it('opens on the Cur M16 CFD_TOTAL box and scores by edge error', () => {
    const it = itemsOf(DRILLS_BY_ID.DR05!)[0] as DrillItem<HuntData>;
    expect(it.data.rect).toEqual({ x: 412, y: 288, w: 236, h: 44 });
    expect(it.data.expected).toBe('TOTAL $10.83');
    expect(edgeError({ x: 412, y: 288, w: 236, h: 44 }, it.data.rect)).toBe(0);
    expect(edgeErrorPoints(1)).toBe(150);
    expect(edgeErrorPoints(3)).toBe(100);
    expect(edgeErrorPoints(6)).toBe(50);
    expect(edgeErrorPoints(6.1)).toBe(0);
    expect(huntPoints({ x: 408, y: 287, w: 237, h: 43 }, it.data.rect, 0, 'A', false)).toMatchObject({ e: 2.5, edgePts: 100, correct: true });
  });
  it('mode B uses MINI_3 px/mm and only screencaps', () => {
    const t = targetsFor('B');
    expect(t.every((x) => x.shot.source === 'screencap')).toBe(true);
    const items = itemsOf(DRILLS_BY_ID.DR05!, 3, 'B') as DrillItem<HuntData>[];
    for (const i of items) {
      expect(i.data.mm).not.toBeNull();
      expect(mmOk(i.data, ((i.data.rect.x + i.data.rect.w / 2) / PX_PER_MM.x), ((i.data.rect.y + i.data.rect.h / 2) / PX_PER_MM.y))).toBe(true);
    }
    // Print on RECEIPT_OPTIONS_5 (MINI_GEN3 table: 86.0, 43.0 mm).
    const print = SHOTS['mini3-receipt5'].els.find((e) => e.id === 'Print')!;
    expect(Math.abs((print.x + print.w / 2) / PX_PER_MM.x - 86)).toBeLessThan(0.1);
  });
  it('mode C checks the Pigeon block strictly', () => {
    const box = { x: 412, y: 288, w: 236, h: 44 };
    expect(checkBlock('{"x": 412, "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83"}', box, 'TOTAL $10.83').ok).toBe(true);
    expect(checkBlock('{"x": 412, "y": 288, "w": 236, "h": 44 "expected": "TOTAL $10.83"}', box, 'TOTAL $10.83').ok).toBe(false);
    expect(checkBlock('{"x": 412, "y": 288, "w": 236, "h": 44, "expected": "Total $10.83"}', box, 'TOTAL $10.83').why).toMatch(/capitalisation/);
    expect(checkBlock('{"x": "412", "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83"}', box, 'TOTAL $10.83').ok).toBe(false);
  });
});

describe('DR06 JSON Medic', () => {
  it('clean payloads parse; every generated payload has exactly the injected error', () => {
    const clean = renderPayload('t', 'USB', ['REST', 'ANDROID'], [{ action: 'create order', params: { item: 'Tax Item 5' }, store: 'orderId' }, { action: 'select print', params: { robot: '${ROBOT_NAME}' } }]);
    expect(() => JSON.parse(clean.join('\n'))).not.toThrow();
    expect(jsonErrorAt(clean.join('\n'))).toBeNull();
    const items = itemsOf(DRILLS_BY_ID.DR06!, 5) as DrillItem<MedicData>[];
    const kinds = new Set(items.map((i) => i.data.err));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    for (const it of items) {
      const text = it.data.lines.join('\n');
      expect(() => JSON.parse(text), it.id).toThrow();
      const f = jsonErrorAt(text)!;
      expect(f, it.id).not.toBeNull();
      expect(it.data.lines.length).toBeGreaterThanOrEqual(25);
      expect(it.data.lines.length).toBeLessThanOrEqual(60);
      expect(it.data.errLine).toBeGreaterThan(0);
      // The parser fails at or after the mistake — for a missing comma, on the next line.
      expect(f.line, it.id).toBeGreaterThanOrEqual(it.data.errLine);
      if (it.data.err === 'comma-objects' || it.data.err === 'comma-fields') expect(f.line).toBe(it.data.errLine + 1);
      expect(it.data.fixes).toContain(it.data.err);
      if (it.data.console) expect(it.data.console).toBe(`LSTR ParseError: Unexpected ${f.token === '"' ? 'string' : `token ${f.token}`} in JSON at line ${f.line} column ${f.column}`);
    }
    expect(items[0]!.data.err).toBe('comma-objects');
  });
});

describe('DR07 Receipt Map', () => {
  it('FLEX_4 maps are the Cur §0.6 reference set', () => {
    const m = receiptMaps('FLEX_4').maps;
    expect(m[4].map((b) => [b.name, b.x, b.y])).toEqual([['Print', 34, 71], ['Email', 34, 83], ['Text', 34, 95], ['No Receipt', 34, 107]]);
    expect(m[5].map((b) => [b.name, b.y])).toEqual([['Print', 74], ['Email', 86], ['Text', 98], ['No Receipt', 110], ['Scan for receipt', 122]]);
  });
  it('a tap on the other map\'s spot is caught', () => {
    const d = receiptItem('FLEX_4', 5, 'Print').data as ReceiptData;
    expect(gradeTap(d, 34, 74).result).toBe('hit');
    expect(gradeTap(d, 34, 71).result).toBe('other-map');
    expect(gradeTap(d, 34, 86).result).toBe('wrong-button');
    expect(gradeTap(d, 34, 80).result).toBe('miss');
  });
});

describe('DR08 POM Builder / Doctor', () => {
  it('build: correct zones + pageobjects + BaseTest is perfect', () => {
    const it = itemsOf(DRILLS_BY_ID.DR08!, 2, 'build')[0] as DrillItem<PomData>;
    if (it.data.mode !== 'build') throw new Error('mode');
    const zones = Object.fromEntries(it.data.cards.map((c) => [c.id, correctZone(c)]));
    expect(gradeBuild(it.data, zones, 'pageobjects', 'BaseTest').perfect).toBe(true);
    expect(gradeBuild(it.data, zones, 'testactions', 'BaseTest').perfect).toBe(false);
    expect(it.data.cards.filter((c) => c.kind === 'mandatory').map((c) => c.id).sort()).toEqual(['isScreenPresent', 'waitForScreen']);
  });
  it('doctor: broken sources contain their bugs', () => {
    const items = itemsOf(DRILLS_BY_ID.DR08!, 4, 'doctor') as DrillItem<PomData>[];
    for (const it of items) {
      if (it.data.mode !== 'doctor') throw new Error('mode');
      const src = it.data.lines.join('\n');
      const n = it.data.needed;
      expect(src.includes('waitForScreen() {')).toBe(!n.includes('add-wait'));
      expect(src.includes('isScreenPresent() {')).toBe(!n.includes('add-present'));
      expect(src.includes('extends BaseTest')).toBe(!n.includes('add-extends'));
      if (n.includes('swap-scroll')) expect(src).toMatch(/FLEX\) \{\n\s+scrollHorizontallyTo/);
      expect(gradeDoctor(it.data, n).perfect).toBe(true);
      expect(gradeDoctor(it.data, [...n, it.data.options.find((o) => !n.includes(o))!]).perfect).toBe(false);
    }
    expect(doctorSource({ cls: 'HomeScreen', locators: [['a', 'By.text("A")']], helpers: [] } as never, []).join('\n')).toMatch(/FLEX\) \{\n\s+scrollVerticallyTo/);
  });
});

describe('DR09 Pipeline Order', () => {
  it('has the six spec sequences and scores order', () => {
    expect(SEQ_SETS.map((s) => s.id)).toEqual(['tax', 'arch', 'power', 'ocr', 'dip', 'laz']);
    expect(SEQ_SETS.find((s) => s.id === 'laz')!.steps).toEqual(['ubi: routing merchant switch', 'laz: de-provision', 'laz: wipe caches', 'laz: setup wizard', 'laz: merchant active']);
    const items = itemsOf(DRILLS_BY_ID.DR09!) as DrillItem<SeqData>[];
    for (const it of items) expect(it.data.tray.every((v, i) => v === i)).toBe(false);
    expect(sequencePoints([0, 1, 2, 3, 4], 5, 30, 0)).toEqual({ points: 30 * 5 + 120, perfect: true });
    expect(sequencePoints([1, 0, 2, 3, 4], 5, 10, 0)).toEqual({ points: 90, perfect: false });
  });
});

describe('DR10 Speed Quiz', () => {
  it('every 5th item is a hotspot; quiz items are curriculum questions', () => {
    const items = itemsOf(DRILLS_BY_ID.DR10!) as DrillItem<QuizSpeedData>[];
    items.forEach((it, i) => {
      if (i % 5 === 4) {
        expect(it.data.kind).toBe('hotspot');
        if (it.data.kind === 'hotspot') expect(SCENE_REGIONS[it.data.scene]).toContain(it.data.target);
      } else {
        expect(it.data.kind).toBe('quiz');
        if (it.data.kind === 'quiz') {
          const q = questionById(it.data.questionId)!;
          expect(it.questionId).toBe(q.id);
          expect(q.options![it.data.answer]).toBe(it.data.options[it.data.answer]);
        }
      }
    });
    for (const h of HOTSPOTS) expect(SCENE_REGIONS[h.scene]).toContain(h.target);
  });
});

describe('DR11 Caps Lock', () => {
  it('only exact enum strings are valid DEVICE_TYPE values', () => {
    const items = itemsOf(DRILLS_BY_ID.DR11!) as DrillItem<{ context: string; value: string; valid: boolean }>[];
    for (const it of items) {
      if (it.data.context === 'jenkins') expect((DEVICE_TYPE_CODES as readonly string[]).includes(it.data.value)).toBe(it.data.valid);
      else expect(['Mini', 'Flex', 'Station'].includes(it.data.value)).toBe(it.data.valid);
    }
  });
});

describe('DR16 Park It!', () => {
  const d = (c: ParkData['case']): ParkData => ({ rig: 'wall-e', hrn: 'WALL-E', slot: 0, case: c, job: null });
  it('only Park All clears a yellow banner; locked rigs are hands-off', () => {
    expect(applyAction(d('yellow'), 'park-all', false).kind).toBe('done');
    for (const a of ['park-xy', 'park-x', 'park-y', 'drag', 'motor', 'leave'] as const) expect(applyAction(d('yellow'), a, false).kind).toBe('wrong');
    expect(applyAction(d('locked'), 'leave', false).kind).toBe('done');
    const touch = applyAction(d('locked'), 'park-all', false);
    expect(touch).toMatchObject({ kind: 'wrong', locked: true });
    expect(parkPoints(touch, 1000, 0)).toBe(-100);
    expect(applyAction(d('steppers'), 'park-all', false).kind).toBe('wrong');
    expect(applyAction(d('steppers'), 'enable', false).kind).toBe('progress');
    expect(applyAction(d('steppers'), 'park-all', true).kind).toBe('done');
    expect(parkPoints({ kind: 'done', correct: true }, 1000, 0)).toBe(200);
    expect(applyAction(d('motor-off'), 'park-all', false).kind).toBe('wrong');
    expect(applyAction(d('motor-off'), 'motor', false).kind).toBe('progress');
    expect(applyAction(d('motor-off'), 'park-all', true).kind).toBe('done');
    expect(applyAction(d('yellow'), 'motor', false).kind).toBe('wrong');
  });
});

describe('DR19 ADB Speedrun', () => {
  it('TARS Register sits at [96,412][288,604] (Cur M12)', () => {
    const tars = SPEEDRUN_DEVICES.find((x) => x.name === 'tars')!;
    const reg = launcher(tars.type).apps.find((a) => a.text === 'Register')!;
    expect([reg.l, reg.t, reg.r, reg.b]).toEqual([96, 412, 288, 604]);
    expect(speedItem(tars, 'Register').data.centre).toEqual([192, 508]);
  });
  it('runs the accepted sequence and counts :5555', () => {
    const item = speedItem(SPEEDRUN_DEVICES.find((x) => x.name === 'data')!, 'Orders').data as SpeedData;
    const ip = item.device.ip;
    let st = newTerm();
    const run = (cmd: string) => {
      const r = runCommand(st, cmd, item);
      st = r.state;
      return r;
    };
    expect(run(`adb connect ${ip}`).lines[0]!.text).toBe(`failed to connect to '${ip}:5555': Connection refused`);
    expect(st.port5555).toBe(1);
    expect(run(`adb connect ${ip}:5444`).lines[0]!.text).toBe(`connected to ${ip}:5444`);
    expect(run(`grep -o 'text="Orders"[^>]*' window_dump.xml`).lines[0]!.text).toBe('grep: window_dump.xml: No such file or directory');
    expect(run(`adb -s ${ip}:5444 shell uiautomator dump`).lines[0]!.text).toBe('UI hierchary dumped to: /sdcard/window_dump.xml');
    expect(run(`adb -s ${ip}:5444 pull /sdcard/window_dump.xml`).lines[0]!.text).toMatch(/^\/sdcard\/window_dump\.xml: 1 file pulled\. 0\.4 MB\/s \(\d+ bytes in 0\.017s\)$/);
    const g = run(`grep -o 'text="Orders"[^>]*' window_dump.xml`).lines[0]!.text;
    const [l, t, r, b] = item.bounds;
    expect(g).toMatch(new RegExp(`^text="Orders" .*bounds="\\[${l},${t}\\]\\[${r},${b}\\]" /$`));
    expect(st.steps).toMatchObject({ connect: true, dump: true, pull: true, bounds: true, tap: false });
    run(`adb -s ${ip}:5444 shell input tap ${item.centre[0]} ${item.centre[1]}`);
    expect(st.done).toBe(true);
    expect(targetPoints(10, st.port5555, 0)).toBe(200 - 100);
    expect(targetPoints(40, 0, 0)).toBe(50);
  });
});

describe('scoring helpers (GP §2.4.1)', () => {
  it('standard: +100, speed +50 at ≤ 2 s → 0 at 8 s, streak ×(1+0.1·n) max ×2, wrong −50', () => {
    expect(standardPoints(true, 1500, 0).points).toBe(150);
    expect(standardPoints(true, 8000, 0).points).toBe(100);
    expect(standardPoints(true, 5000, 0).points).toBe(125);
    expect(standardPoints(true, 1000, 5).points).toBe(225);
    expect(standardPoints(true, 1000, 30).points).toBe(300);
    expect(standardPoints(false, 1000, 9).points).toBe(-50);
  });
});

describe('runtime round-trip', () => {
  beforeEach(() => {
    resetWorld();
    mutate((d) => {
      for (const id of MODULE_ORDER) d.progress.modules[id] = { ...(d.progress.modules[id] ?? {}), completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } } as never;
    });
  });

  it.each(DRILLS.map((d) => d.id))('%s starts, draws items and scores answers', (id) => {
    missions.startDrill(id);
    const run = getState().session.drill!;
    expect(run.drillId).toBe(id);
    expect(run.currentItemId).toBeTruthy();
    for (let i = 0; i < 3; i++) {
      const cur = getState().session.drill?.currentItemId;
      if (!cur) break;
      expect(missions.drillItem(cur)).toBeTruthy();
      missions.answerDrill(cur, { correct: true, elapsedMs: 1000 });
    }
    expect(getState().session.drill!.score).toBeGreaterThan(0);
  });
});

describe('mixed rounds', () => {
  it('routes items to their owning drill', async () => {
    const { ownerOf } = await import('./common/mixed');
    expect(ownerOf('DR01-07')).toBe('DR01');
    expect(ownerOf('DR11:jenkins:flex_3')).toBe('DR11');
    expect(ownerOf('q:Q123')).toBe('DR10');
    expect(ownerOf('weird')).toBeNull();
  });
});

describe('DR03 last-15-s fix cards', () => {
  it('turn up when the clock is low and accept the documented fixes', async () => {
    const { generatePort } = await import('./dr03-port-patrol/logic');
    const st = rootWith(null);
    st.session.drill!.timeLeftS = 10;
    const rng = createRngState(3);
    const items = Array.from({ length: 20 }, (_, i) => generatePort(rng, st, 30 + i));
    const fixes = items.filter((i) => i.data.mode === 'fix');
    expect(fixes.length).toBeGreaterThan(5);
    for (const f of fixes) {
      expect(f.data.risk).toBe(true);
      expect(f.data.fix!.accept.every((a) => /5444|disconnect 10\.42\.60\./.test(a))).toBe(true);
    }
  });
});
