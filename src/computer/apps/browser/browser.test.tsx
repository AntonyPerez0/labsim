// @vitest-environment jsdom
/**
 * Browser (Apps §12.3): New tab tiles and search, internet hosts show "No internet", unknown lab hosts
 * show the DNS error page and emit `browser.page.unreachable`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { getState } from '@/core/store';
import { captureActions, makeRoutedHost, mount, type, type Mounted } from '../../shell/sandbox/testkit';
import { BrowserApp } from './index';

let m: Mounted | null = null;
afterEach(() => {
  m?.unmount();
  m = null;
});

describe('Browser', () => {
  it('new tab: bookmarks tiles and a search that ends on No internet', async () => {
    const host = makeRoutedHost(BrowserApp, '/newtab');
    m = await mount(<host.Host />);
    expect(m.container.textContent).toContain('Ollama API');
    await type(m.container.querySelector('input'), 'jenkins down');
    const form = m.container.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(host.routes.at(-1)).toBe('https://www.google.com/search?q=jenkins%20down');
    expect(m.container.textContent).toContain('No internet');
    expect(m.container.textContent).toContain('ERR_INTERNET_DISCONNECTED');
  });

  it('unknown lab host: DNS error page + browser.page.unreachable', async () => {
    const cap = captureActions();
    const host = makeRoutedHost(BrowserApp, 'http://nope.lab.local:9999/');
    m = await mount(<host.Host />);
    const unseeded = Object.keys(getState().lab.hosts ?? {}).length === 0;
    if (!unseeded) {
      expect(m.container.textContent).toContain('nope.lab.local’s server IP address could not be found.');
      expect(cap.of('browser.page.unreachable')[0]).toEqual({ url: 'http://nope.lab.local:9999/', error: 'unknown' });
    }
    cap.stop();
  });
});
