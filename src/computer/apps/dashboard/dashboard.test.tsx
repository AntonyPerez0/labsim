// @vitest-environment jsdom
/**
 * Dashboard / tablet (Apps §10): every Motion Control button sends its RigCommandName; the lockout
 * overlay blocks commands and emits `<host>.lockout.shown`; tabs emit `<host>.tab.opened`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { mutate } from '@/core/store';
import { sim } from '@/sim';
import { TABLET_MOTION_BUTTONS } from '@/render2d/api';
import { seedFakeLab } from '../../shell/sandbox/fakeLab';
import { installFakeSim } from '../../shell/sandbox/fakeSim';
import { captureActions, click, makeRoutedHost, mount, type Mounted } from '../../shell/sandbox/testkit';
import { DashboardApp, DashboardSurface } from './index';
import { TabletDashboard } from './Tablet';

let m: Mounted | null = null;
let cap: ReturnType<typeof captureActions>;

beforeAll(() => {
  // Against the real sim + its factory seed when it has landed; the sandbox lab + fakes otherwise.
  seedFakeLab();
  installFakeSim();
});

afterEach(() => {
  m?.unmount();
  m = null;
  cap?.stop();
  vi.restoreAllMocks();
});

describe('DashboardSurface — Motion Control (Apps §10.3)', () => {
  it('sends every button command with actor player and emits tablet.command.sent', async () => {
    mutate((s) => {
      s.lab.rigs['bumblebee']!.tablet.tab = 'motion-control';
    });
    cap = captureActions();
    const spy = vi.spyOn(sim.rig, 'command');
    m = await mount(<DashboardSurface robotId="bumblebee" host="tablet" />);
    for (const b of TABLET_MOTION_BUTTONS) {
      await click(m.container.querySelector(`[data-hint="rdash.button:${b.command}"]`));
    }
    expect(spy.mock.calls.map((c) => c[1])).toEqual(TABLET_MOTION_BUTTONS.map((b) => b.command));
    expect(spy.mock.calls.every((c) => c[0] === 'bumblebee' && c[2] === 'player')).toBe(true);
    const sent = cap.of('tablet.command.sent');
    expect(sent).toHaveLength(TABLET_MOTION_BUTTONS.length);
    expect(sent[0]).toMatchObject({ robot: 'bumblebee', command: 'steppers.enable', ok: true, error: null });
  });

  it('shows the sim error as a toast strip when a command is rejected', async () => {
    mutate((s) => {
      s.lab.rigs['r2-d2']!.steppersEnabled = false;
      s.lab.rigs['r2-d2']!.tablet.tab = 'motion-control';
    });
    m = await mount(<DashboardSurface robotId="r2-d2" host="tablet" />);
    await click(m.container.querySelector('[data-hint="rdash.button:park.all"]'));
    expect(m.container.querySelector('.rdash-toast')?.textContent).toBe('Steppers disabled');
  });

  it('lockout: overlay text, no command on click, lockout.shown emitted', async () => {
    // A Jenkins build holds WALL-E (Sim §3.7.6: checkout locks the dashboard).
    mutate((s) => {
      const rig = s.lab.rigs['wall-e']!;
      rig.dashboardLocked = true;
      rig.lockedBy = { kind: 'jenkins', ref: 'Java/uia-remote-regression-flex#4127' };
    });
    cap = captureActions();
    const spy = vi.spyOn(sim.rig, 'command');
    m = await mount(<DashboardSurface robotId="wall-e" host="tablet" tab="motion-control" />);
    expect(m.container.textContent).toContain('TEST IN PROGRESS — CONTROLS LOCKED');
    expect(m.container.textContent).toContain('Java/uia-remote-regression-flex #4127');
    expect(m.container.textContent).toContain('Checked out via Orca · unlocks when the build finishes');
    expect(cap.of('tablet.lockout.shown')[0]).toEqual({ robot: 'wall-e', holder: 'Java/uia-remote-regression-flex #4127', blockedClick: false });
    await click(m.container.querySelector('.rdash-lock'));
    expect(spy).not.toHaveBeenCalled();
    expect(cap.of('tablet.lockout.shown')[1]).toMatchObject({ blockedClick: true });
    await act(async () => {
      mutate((s) => {
        s.lab.rigs['wall-e']!.dashboardLocked = false;
        s.lab.rigs['wall-e']!.lockedBy = null;
      });
    });
  });

  it('tabs emit tablet.tab.opened and the Robot tab lists the rig facts', async () => {
    // EVE's magnetic lock was released by hand (GP INC "lock released"): yellow banner, park required.
    mutate((s) => {
      const rig = s.lab.rigs['eve']!;
      rig.magneticLock.engaged = false;
      rig.banner = 'yellow';
      rig.bannerText = 'Status: LOCK RELEASED — PARK REQUIRED';
      rig.tablet.statusText = 'Status: LOCK RELEASED — PARK REQUIRED';
    });
    cap = captureActions();
    m = await mount(<DashboardSurface robotId="eve" host="tablet" />);
    await click(m.container.querySelector('[data-hint="rdash.tab:robot"]'));
    expect(cap.of('tablet.tab.opened').at(-1)).toEqual({ robot: 'eve', tab: 'robot' });
    expect(m.container.textContent).toContain('RELEASED');
    expect(m.container.textContent).toContain('Home = limit switches (0,0)');
    expect(m.container.textContent).toContain('Status: LOCK RELEASED — PARK REQUIRED');
  });
});

describe('DashboardApp (Apps §10.6)', () => {
  it('selecting a robot emits dashboard.robot.selected and navigates to /robot/<name>/<tab>', async () => {
    cap = captureActions();
    const host = makeRoutedHost(DashboardApp, '/');
    m = await mount(<host.Host />);
    expect(m.container.textContent).toContain('Select a robot to open its dashboard.');
    await click(m.container.querySelector('[data-hint="dashboard.robot:bumblebee"]'));
    expect(cap.of('dashboard.robot.selected')[0]).toEqual({ robot: 'bumblebee' });
    expect(host.routes.at(-1)).toBe('/robot/bumblebee/motion-control');
    expect(m.container.textContent).toContain('http://10.42.10.13:8000/dashboard');
  });

  it('shows the unreachable strip when the rig Pi has no Ethernet (desktop only)', async () => {
    mutate((s) => {
      s.lab.hosts[s.lab.rigs['bumblebee']!.piHostId!]!.eth = 'UNPLUGGED';
    });
    const host = makeRoutedHost(DashboardApp, '/robot/bumblebee/motion-control');
    m = await mount(<host.Host />);
    expect(m.container.textContent).toContain('Controller unreachable — http://10.42.10.13:8000 (connect timed out after 10000 ms)');
    expect(m.container.textContent).toContain('Reconnecting to robot controller…');
    m.unmount();
    // The physical tablet talks USB: still green.
    m = await mount(<TabletDashboard robotId="bumblebee" onExit={() => undefined} />);
    expect(m.container.textContent).not.toContain('Reconnecting to robot controller…');
    act(() =>
      mutate((s) => {
        s.lab.hosts[s.lab.rigs['bumblebee']!.piHostId!]!.eth = 'LINKED';
      }),
    );
  });
});
