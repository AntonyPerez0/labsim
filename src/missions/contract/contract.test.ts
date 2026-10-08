import { describe, expect, it } from 'vitest';
import { c, on, p } from '../types';
import type { AchievementRule, Condition, IncidentBinding, IncidentDef, LessonDef, PracticalTaskDef } from '../types';
import { ACADEMY_STEP_XP } from '../types';
import { createDefaultProgress, createDefaultSession, createDefaultUi, PAUSING_OVERLAY_KINDS } from '@/core/state';

const binding: IncidentBinding = {
  rig: 'bumblebee',
  hrn: 'BUMBLEBEE',
  rigs: ['bumblebee'],
  vars: { pi: 'pi-bumblebee', piIp: '10.42.10.13' },
  seed: 42,
  variant: 'A',
};

/** GP §3.5 INC04 (abridged) — compiles against the contract. */
const INC04: IncidentDef = {
  id: 'INC04',
  name: 'Connection Failed: Ethernet unplugged',
  difficulty: 1,
  base: 200,
  parS: 150,
  severity: 'P1',
  escalatable: true,
  unlockedBy: 'M06',
  rigs: { roles: ['touch'], default: 'bumblebee', scope: 'rig', describe: 'any rig with its own Pi (default BUMBLEBEE)' },
  tags: ['orca.status.connfailed', 'hw.pi', 'orca.notes'],
  ticket: {
    title: (b) => `${b.hrn} Connection Failed`,
    reporter: 'jenkins-bot',
    misleading: { title: (b) => `${b.hrn}'s Pi crashed again` },
  },
  setup: () => ({ scenario: [{ faultId: 'eth.unplugged', params: { host: '$PI' } }] }),
  reveal: 'healthCheck',
  symptoms: [{ where: 'Notes', text: (b) => `GET http://${b.vars.piIp}:8000/health → connect timed out after 10000 ms` }],
  diagnosisPath: ['Tablet green but Orca red ⇒ Pi alive, network not', 'Inspect the jack', 'Call or escalate'],
  hints: ['Compare the tablet with Orca.', "Look at the Pi's Ethernet jack LEDs.", 'Re-seat the cable at the jack.'],
  fix: { byTheBook: 'Escalate with the health endpoint, cause A.', handsOn: 'Re-seat the cable; wait for the next health check.' },
  escalation: {
    endpoints: (b) => [`http://${b.vars.piIp}:8000/health`],
    jaredFix: (b) => [{ do: 'npc', npc: 'jared', action: 'fix', target: `rig.${b.rig}.pi` }],
  },
  success: (b) => c.all(c.eq(p.pi(String(b.vars.pi)).eth, 'LINKED'), c.status(b.rig!, 'AVAILABLE'), c.nextHealthCheck()),
  diagnosisCall: {
    options: [
      { id: 'A', text: 'Network cable disconnected', correct: true },
      { id: 'B', text: 'Pi hung', wrongCallHint: 'A hung Pi freezes its ACT LED and greys the tablet. This tablet is green.' },
      { id: 'C', text: 'Rack A fuse blown', wrongCallHint: 'A blown fuse darkens every Pi on the rack. Only one rig is down.' },
      { id: 'D', text: 'Orca health thread stuck', wrongCallHint: 'Other rigs were checked at the same time and passed.' },
    ],
  },
  wrongButTempting: [{ id: 'cycle', text: 'Power-cycle the Pi', gw: 'GW17' }],
  counters: (b) => ({ powerCycles: on('host.powerChanged', { hostId: String(b.vars.pi), to: 'booting' }) }),
  teaches: 'Ref §3 — the health check is a REST ping over the network.',
};

const LESSON: LessonDef = {
  moduleId: 'M01',
  mentor: 'morgan',
  setup: { preset: 'academy:M01', spawn: 'loc.entrance', scenario: [{ op: 'orca.setStatus', params: { robot: 'baymax', status: 'OFFLINE' } }] },
  realLabChecklist: ["Read a rig's status tablet header before touching anything."],
  steps: [
    { id: 'M01.01', kind: 'dialogue', speaker: 'morgan', text: 'Welcome to the LabSim automation lab!' },
    { id: 'M01.02', kind: 'walk-to', hud: 'Walk to Touch Rack A', location: 'loc.rack-a' },
    { id: 'M01.04', kind: 'inspect', hud: "Look at WALL-E's status tablet", prop: 'prop.walle.tablet', callouts: ['WALL-E', 'Status: OK'] },
    {
      id: 'M01.06',
      kind: 'interact',
      hud: 'Tap the Motion Control tab and press Park All',
      target: 'prop.walle.tablet',
      success: c.happened(on('rig.command', { rigId: 'wall-e', command: 'park.all', ok: false })),
    },
    {
      id: 'M06.12',
      kind: 'computer-task',
      hud: 'Reserve WALL-E, then build …',
      app: ['orca', 'jenkins'],
      success: c.sequence(on('orca.checkoutRejected', { jobId: 'Java/uia-remote-regression-flex' }), on('robot.checkedOut', { name: 'wall-e' })),
      offerFastForward: true,
    },
    { id: 'M01.10', kind: 'branch', if: c.eq(p.v('choice'), 'a'), goto: 'M01.14' },
    { id: 'M01.14', kind: 'quiz-checkpoint', checkpointId: 'CP-M01.1', title: 'Lab Basics', questionIds: ['Q001', 'Q002'] },
  ],
};

const ACH16: AchievementRule = {
  id: 'ACH16',
  triggers: [on('ticket.resolved', { incidentId: 'INC05' })],
  check: (s, _prog, ev) => {
    const id = (ev?.payload as { ticketId: string } | undefined)?.ticketId;
    const t = s.session.tickets.find((x) => x.id === id);
    return (t?.counters.powerCycles ?? 0) === 0;
  },
};

const P1_1: PracticalTaskDef = {
  id: 'P1-1',
  examId: 'CERT-R1',
  setup: { run: (sim) => void sim.rig.pushHead('wall-e', 40, 25, 'system') },
  pass: c.forAll(['wall-e', 'eve'], (r) => c.eq(p.rig(r).banner, 'GREEN')),
  timeLimitGameMin: 3,
};

describe('missions contract builders', () => {
  it('builds plain condition data', () => {
    const cond = INC04.success(binding);
    expect(cond).toEqual({
      op: 'all',
      of: [
        { op: 'cmp', probe: { p: 'hw.pi', host: 'pi-bumblebee', field: 'eth' }, cmp: 'eq', value: 'LINKED' },
        { op: 'cmp', probe: { p: 'orca.robot', robot: 'bumblebee', field: 'status' }, cmp: 'eq', value: 'AVAILABLE' },
        { op: 'verify', on: { kind: 'health-check' } },
      ],
    });
    expect(JSON.parse(JSON.stringify(cond))).toEqual(cond);
  });

  it('supports probe references, tolerances, quantifiers and deferred builds', () => {
    const duoSameIp = c.same(p.prop('config', 'merchantFacingDeviceIp'), p.prop('config', 'customerFacingDeviceIp'));
    expect(duoSameIp).toMatchObject({ cmp: 'eq', value: { probe: { p: 'prop', key: 'customerFacingDeviceIp' } } });
    const qr: Condition = c.forAll(['FLEX_3', 'MINI_3'] as const, (t) =>
      c.approx(p.screenLocation(t, 'RECEIPT_OPTIONS_5', 'Print').y, c.ref(p.truth(`${t}.Print.y`)), 0.5),
    );
    expect(qr).toMatchObject({ op: 'all', of: [{ cmp: 'approx', tolerance: 0.5 }, { cmp: 'approx' }] });
    expect(c.nextBuild({ pipeline: 'PL3', distinctRobots: 2 })).toEqual({ op: 'verify', on: { kind: 'build', pipeline: 'PL3', distinctRobots: 2 } });
    expect(c.never(c.status('rosie', 'AVAILABLE'))).toMatchObject({ op: 'never', scope: 'owner' });
    expect(c.appAction('orca', 'orca.robot.notesOpened')).toMatchObject({ op: 'happened', match: { event: 'app.action', where: { app: 'orca', action: 'orca.robot.notesOpened' } } });
    const visited = c.visited('jenkins', '/job/Java/');
    expect(visited.op === 'happened' && visited.match.event === 'app.navigated' && visited.match.test?.({ app: 'jenkins', route: '/job/Java/job/x/' }, {} as never)).toBe(true);
  });

  it('type-checks values against probes', () => {
    // @ts-expect-error — not a RobotStatus
    c.eq(p.robot('eve').status, 'AVAILABL');
    // @ts-expect-error — Pi eth vocabulary is LINKED/UNPLUGGED/DAMAGED
    c.eq(p.pi('pi-eve').eth, 'CONNECTED');
    // @ts-expect-error — unknown event name
    on('robot.exploded', {});
    // @ts-expect-error — payload field typo
    on('robot.statusChanged', { nme: 'eve' });
    expect(c.eq(p.fuse('F-RACKB-5V').rating, 10)).toMatchObject({ value: 10 });
  });

  it('example definitions are well-formed', () => {
    expect(LESSON.steps.map((s) => ACADEMY_STEP_XP[s.kind])).toEqual([10, 10, 10, 15, 25, 0, 10]);
    expect(ACH16.triggers[0]).toEqual({ event: 'ticket.resolved', where: { incidentId: 'INC05' } });
    expect(P1_1.pass.op).toBe('all');
    expect(INC04.counters?.(binding).powerCycles).toEqual({ event: 'host.powerChanged', where: { hostId: 'pi-bumblebee', to: 'booting' } });
  });

  it('core defaults are valid', () => {
    const prog = createDefaultProgress();
    expect(prog.rank).toBe('intern');
    expect(prog.settings.fov).toBe(75);
    const s = createDefaultSession();
    expect(s.items.fuses['10']).toBe(0);
    expect(s.toolModes.fuseRating).toBe(10);
    expect(createDefaultUi().teachCards).toEqual([]);
    expect(PAUSING_OVERLAY_KINDS.has('quiz')).toBe(true);
    expect(PAUSING_OVERLAY_KINDS.has('tickets')).toBe(false);
  });
});
