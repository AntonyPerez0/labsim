// @vitest-environment jsdom
/**
 * GitHub (Apps §7): blob view (Cur M10 s9), clone popover SSH URL (Cur M13 s2), protected-branch merge box.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sim } from '@/sim';
import { byText, captureActions, click, makeRoutedHost, mount, type Mounted } from '../../shell/sandbox/testkit';
import { GitHubApp } from './index';
import { parseRoute } from './model';

let m: Mounted | null = null;
let cap: ReturnType<typeof captureActions>;

beforeEach(() => {
  sim.reset({ preset: 'factory' });
  cap = captureActions();
});
afterEach(() => {
  m?.unmount();
  m = null;
  cap.stop();
});

describe('GitHub', () => {
  it('parses repo routes', () => {
    expect(parseRoute('/labsim-lab')).toMatchObject({ kind: 'org' });
    expect(parseRoute('/labsim-lab/gort/pull/418/files')).toMatchObject({ repo: 'gort' });
    expect(parseRoute('/labsim-lab/gort/actions')).toMatchObject({ kind: 'actions', repo: 'gort' });
    expect(parseRoute('/labsim-lab/gort/actions/runs/12345/job/987')).toMatchObject({ kind: 'actions', repo: 'gort' });
  });

  it('views a blob and reports github.file.viewed', async () => {
    const host = makeRoutedHost(GitHubApp, '/labsim-lab/gort/blob/main/cards/emv/visa_std_dip.json');
    m = await mount(<host.Host />);
    expect(cap.of('github.file.viewed')[0]).toEqual({ repo: 'gort', ref: 'main', path: 'cards/emv/visa_std_dip.json' });
    expect(m.container.textContent).toContain('visa_std_dip.json');
  });

  it('shows the SSH clone URL in the Code popover', async () => {
    const host = makeRoutedHost(GitHubApp, '/labsim-lab/uia-remote');
    m = await mount(<host.Host />);
    await click(byText(m.container, 'button', /Code/) ?? m.container.querySelector('.gh-btn-primary'));
    const field = [...m.container.querySelectorAll<HTMLInputElement>('input')].find((i) => i.value.includes('labsim-lab/uia-remote'));
    expect(field?.value).toBe('git@github.com:labsim-lab/uia-remote.git');
  });

  it('blocks merging an unapproved PR on a protected repo', async () => {
    const host = makeRoutedHost(GitHubApp, '/labsim-lab/orchestrator/pull/81');
    m = await mount(<host.Host />);
    expect(cap.of('github.pr.viewed')[0]).toMatchObject({ repo: 'orchestrator', number: 81 });
    expect(m.container.textContent).toContain('Merging is blocked');
  });
});
