// @vitest-environment jsdom
/**
 * Jenkins (Apps §3): routes, Build with Parameters → sim.jenkins.build (Cur M10/M11), console opened + line click,
 * view tabs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { getState } from '@/core/store';
import { sim } from '@/sim';
import { byText, captureActions, click, makeRoutedHost, mount, type, type Mounted } from '../../shell/sandbox/testkit';
import { JenkinsApp } from './index';
import { parseRoute } from './model';

let m: Mounted | null = null;
let cap: ReturnType<typeof captureActions>;
const JOB = 'Java/uia-remote-regression-flex';

beforeEach(() => {
  sim.reset({ preset: 'factory' });
  cap = captureActions();
});
afterEach(() => {
  m?.unmount();
  m = null;
  cap.stop();
  vi.restoreAllMocks();
});

describe('Jenkins routes', () => {
  it('parses job, build, console and lastBuild routes', () => {
    expect(parseRoute('/')).toMatchObject({ kind: 'dashboard' });
    expect(parseRoute('/view/iOS/')).toMatchObject({ kind: 'view', view: 'iOS' });
    expect(parseRoute('/job/Java/')).toMatchObject({ kind: 'folder', folder: 'Java' });
    expect(parseRoute('/job/Java/job/uia-remote-regression-flex/')).toMatchObject({ kind: 'job', jobId: JOB });
    expect(parseRoute('/job/Java/job/uia-remote-regression-flex/build')).toMatchObject({ kind: 'buildWithParameters', jobId: JOB });
    expect(parseRoute('/job/Java/job/uia-remote-regression-flex/4127/console')).toMatchObject({ kind: 'console', jobId: JOB, number: '4127' });
    expect(parseRoute('/job/Java/job/uia-remote-regression-flex/configure')).toMatchObject({ kind: 'configure', jobId: JOB });
  });
});

describe('Jenkins app', () => {
  it('submits Build with Parameters through sim.jenkins.build with the typed values', async () => {
    const spy = vi.spyOn(sim.jenkins, 'build');
    const host = makeRoutedHost(JenkinsApp, '/job/Java/job/uia-remote-regression-flex/build');
    m = await mount(<host.Host />);
    expect(cap.of('jenkins.buildWithParameters.opened')[0]).toMatchObject({ jobId: JOB });
    expect(m.container.textContent).toContain('This build requires parameters:');
    const robot = m.container.querySelector<HTMLInputElement>('input[name="ROBOT_NAME"]') ?? m.container.querySelector<HTMLInputElement>('.jk-param input');
    await type(robot, 'wall-e');
    await click(byText(m.container, 'button', 'Build'));
    expect(spy).toHaveBeenCalled();
    const [jobId, params, actor] = spy.mock.calls[0]!;
    expect(jobId).toBe(JOB);
    expect(actor).toBe('player');
    expect((params as Record<string, string>).ROBOT_NAME).toBe('wall-e');
    const trig = cap.of('jenkins.build.triggered')[0]!;
    expect(trig).toMatchObject({ jobId: JOB, ok: true });
    expect(getState().lab.jenkins.builds[trig.buildId as string]).toBeTruthy();
    expect(host.routes.at(-1)).toBe('/job/Java/job/uia-remote-regression-flex/');
  });

  it('renders the console line by line and reports opened / line clicks', async () => {
    const r = sim.jenkins.build(JOB, { ROBOT_NAME: 'wall-e' }, 'player');
    expect(r.ok).toBe(true);
    for (let i = 0; i < 40; i++) act(() => sim.tick(500));
    const b = getState().lab.jenkins.builds[r.ok ? r.value.buildId : '']!;
    const host = makeRoutedHost(JenkinsApp, `/job/Java/job/uia-remote-regression-flex/${b.number}/console`);
    m = await mount(<host.Host />);
    expect(cap.of('jenkins.console.opened')[0]).toMatchObject({ buildId: b.id, number: b.number });
    const text = m.container.querySelector('pre')?.textContent ?? '';
    const lines = getState().lab.jenkins.builds[b.id]!.console;
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines.slice(0, 5)) expect(text).toContain(l);
    const port = Math.max(0, lines.findIndex((l) => l.includes('PORT_NUMBER=')));
    await click(m.container.querySelector(`[data-line="${port + 1}"]`));
    expect(cap.of('jenkins.console.lineClicked')[0]).toEqual({ buildId: b.id, line: port + 1, text: lines[port] });
  });

  it('emits jenkins.view.opened from the view tabs', async () => {
    const host = makeRoutedHost(JenkinsApp, '/view/Java/');
    m = await mount(<host.Host />);
    expect(cap.of('jenkins.view.opened')[0]).toEqual({ view: 'Java' });
    expect(m.container.textContent).toContain('uia-remote-regression-flex');
  });
});
