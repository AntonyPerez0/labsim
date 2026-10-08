/** Checkout / release (Sim §3.4), capability documents (§2.7) and Match preview (§3.4.3). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transact } from '@/core/store';
import type { CheckoutOutcome, CheckoutRequest } from '../api';
import { checkout, release } from './orca/checkout';
import { fresh, lab, robot, sim } from './testkit';

vi.setConfig({ testTimeout: 60_000 });

function co(req: Partial<CheckoutRequest>): CheckoutOutcome {
  return transact((root, ctx) => checkout(root.lab, ctx, { buildId: 'Java/job#1', jobId: 'Java/job', environment: 'DEV1', kind: 'jenkins', ...req }));
}
const rel = (robotId: number, buildId = 'Java/job#1') => transact((root, ctx) => release(root.lab, ctx, robotId, buildId));

describe('capability documents (Sim §2.7.1)', () => {
  beforeEach(() => fresh());

  it('renders the canonical key order (WALL-E, ROSIE)', () => {
    expect(JSON.stringify(sim.orca.capabilityDocument(robot('wall-e').id))).toBe('{"deviceType":"FLEX_3","printer":true,"physicalTouch":true,"dip":true,"tap":true,"swipe":true,"pinEntry":true,"tethered":false,"duo":false,"adbOnly":false,"testingProfile":"FLEX_GEN3"}');
    expect(JSON.stringify(sim.orca.capabilityDocument(robot('rosie').id))).toMatch(/^\{"deviceType":"FLEX_POCKET","printer":false,/);
    expect(sim.orca.capabilityDocument(robot('data').id)).toMatchObject({ adbOnly: true, physicalTouch: false, goSdk: true });
    expect(sim.orca.capabilityDocument(robot('megatron').id)).toMatchObject({ tethered: true, duo: false, deviceType: 'STATION_2' });
  });
});

describe('checkout (Sim §3.4.2)', () => {
  beforeEach(() => fresh());

  it('validates DeviceType case exactly (ENUM_CASE)', () => {
    for (const raw of ['flex_3', 'Flex_3', 'FLEX3', 'FLEX-3', 'FLEX_GEN3', 'mini_3']) {
      const out = co({ deviceType: raw, capabilities: { deviceType: raw, physicalTouch: true } });
      expect(out).toEqual({ kind: 'fail', code: 'ENUM_CASE', lines: [`[orca] checkout request deviceType=${raw}`, `java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.${raw}`] });
    }
  });

  it('picks the least-recently-used Available matching robot and locks its dashboard', () => {
    const out = co({ deviceType: 'FLEX_3', capabilities: { deviceType: 'FLEX_3', physicalTouch: true } });
    expect(out).toEqual({ kind: 'ok', robotId: 1, robotName: 'wall-e', byName: false, lines: ['[orca] checkout request deviceType=FLEX_3', '[orca] capabilities: deviceType=FLEX_3, physicalTouch=true (non-dynamic)', '[orca] checkout → wall-e (FLEX_3) OK'] });
    expect(robot('wall-e').checkout).toMatchObject({ buildId: 'Java/job#1', byName: false, statusAtCheckout: 'AVAILABLE', kind: 'jenkins' });
    expect(robot('wall-e').status).toBe('AVAILABLE');
    sim.tick(50);
    expect(lab().rigs['wall-e']!.dashboardLocked).toBe(true);
    expect(sim.rig.command('wall-e', 'park.all', 'player')).toEqual({ ok: false, error: 'LOCKED' });
  });

  it('skips Unavailable rigs for general jobs and names them in ONLY_UNAVAILABLE', () => {
    const out = co({ capabilities: { deviceType: 'FLEX_POCKET', physicalTouch: true } });
    expect(out.kind).toBe('fail');
    expect(out).toMatchObject({ code: 'ONLY_UNAVAILABLE' });
    expect((out as { lines: string[] }).lines.at(-1)).toBe('No Available robot matches FLEX_POCKET (rosie is Unavailable)');
  });

  it('a named job may use an Unavailable rig and Orca resets it to Unavailable after the run (auto-reset)', () => {
    const rosie = robot('rosie');
    const out = co({ robotName: 'rosie', buildId: 'Java/paycore-standalone-matrix#2077', jobId: 'Java/paycore-standalone-matrix' });
    expect(out).toMatchObject({ kind: 'ok', byName: true });
    expect((out as { lines: string[] }).lines.at(-1)).toBe('Checked out robot rosie (named)');
    // Someone flips it Available during the run …
    expect(sim.orca.setRobotStatus(rosie.id, 'AVAILABLE', 'alex').ok).toBe(true);
    sim.tick(60_000);
    const r = rel(rosie.id, 'Java/paycore-standalone-matrix#2077');
    expect(r).toEqual({ lines: ['[orca] released rosie → Unavailable'], statusAfter: 'UNAVAILABLE' });
    expect(robot('rosie').status).toBe('UNAVAILABLE');
    expect(robot('rosie').notes[0]!.text).toBe('2026-10-05 09:01:00 STATUS Available → Unavailable (orca: named job Java/paycore-standalone-matrix#2077 finished)');
  });

  it('a general job that took an Available rig releases it as Available (nothing resets it, INC40)', () => {
    const rosie = robot('rosie');
    sim.orca.setRobotStatus(rosie.id, 'AVAILABLE', 'alex');
    const out = co({ capabilities: { deviceType: 'FLEX_POCKET', physicalTouch: true } });
    expect(out).toMatchObject({ kind: 'ok', robotName: 'rosie', byName: false });
    expect(rel(rosie.id).lines).toEqual(['[orca] released rosie → Available']);
  });

  it('blocks Reserved / Offline / Connection Failed by name with 409s and 404s unknown names', () => {
    expect(co({ robotName: 'mother' })).toMatchObject({ kind: 'fail', code: 'ROBOT_BLOCKED', lines: ['[orca] 409 Conflict: robot mother is Reserved (morgan)'] });
    expect(co({ robotName: 'robby' })).toMatchObject({ code: 'ROBOT_BLOCKED', lines: ['[orca] 409 Conflict: robot robby is Offline'] });
    expect(co({ robotName: 'sonny' })).toMatchObject({ code: 'ROBOT_BLOCKED', lines: ['[orca] 409 Conflict: robot sonny is Connection Failed'] });
    expect(co({ robotName: 'ROSIE' })).toMatchObject({ code: 'ROBOT_NOT_FOUND', lines: ["[orca] 404 Not Found: no robot named 'ROSIE'"] });
  });

  it('waits forever with skip lines when every match is busy or blocked (INC48)', () => {
    sim.faults.inject({ faultId: 'orca.staleReservation', params: { robot: 'eve' } });
    const out = co({ deviceType: 'FLEX_4', capabilities: { deviceType: 'FLEX_4', physicalTouch: true } });
    expect(out.kind).toBe('wait');
    expect(out.lines).toEqual(['[orca] checkout request deviceType=FLEX_4', '[orca] capabilities: deviceType=FLEX_4, physicalTouch=true (non-dynamic)', '[orca] candidate eve: Reserved — skipped', '[orca] no Available FLEX_4 robot — build waiting in queue']);
    expect(robot('eve').notes[0]!.text).toBe('2026-10-04 17:42:00 STATUS Available → Reserved (riley)');
  });

  it('reports capability conflicts, unknown keys and NO_MATCH exactly', () => {
    expect(co({ capabilities: { deviceType: 'MINI_3' }, dynamicCapabilitiesJson: '{"deviceType":"COMPACT"}' })).toMatchObject({ code: 'CAPABILITY_CONFLICT', lines: ['[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT)'] });
    expect(co({ capabilities: { warpDrive: true } })).toMatchObject({ code: 'UNKNOWN_CAPABILITY', lines: ["[orca] 400 Bad Request: unknown capability 'warpDrive'"] });
    expect((co({ capabilities: { goSdk: true, phone: true } }) as { lines: string[] }).lines.at(-1)).toBe('[orca] No robot matches goSdk=true, phone=true');
  });

  it('environment isolates pools: STG only matches OPTIMUS for the tethered Tax job', () => {
    expect(co({ capabilities: { tethered: true, duo: false }, environment: 'STG' })).toMatchObject({ kind: 'ok', robotName: 'optimus' });
  });
});

describe('Match preview (Sim §3.4.3)', () => {
  beforeEach(() => fresh());

  it('INC23: goSdk lists vision, tars, data on DEV1; printer drops vision', () => {
    const r = sim.orca.matchPreview('{"goSdk": true}');
    expect(r.ok && r.value.filter((x) => x.matches).map((x) => x.robot).sort()).toEqual(['data', 'tars', 'vision']);
    const p = sim.orca.matchPreview('{"goSdk": true, "printer": true}');
    expect(p.ok && p.value.find((x) => x.robot === 'vision')).toMatchObject({ matches: false, firstMismatch: 'printer: required true, robot false' });
  });

  it('Orca UI Check out toasts (Sim §3.2.2)', () => {
    expect(sim.orca.checkout({ buildId: '', jobId: '', robotName: 'sonny', kind: 'manual' })).toEqual({ ok: false, error: 'Robot is blocked from checkouts (Connection Failed)' });
    expect(sim.orca.checkout({ buildId: '', jobId: '', robotName: 'rosie', kind: 'manual' })).toEqual({ ok: false, error: 'Robot is Unavailable — pass its exact Name in the job to use it' });
  });
});
