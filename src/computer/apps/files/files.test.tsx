// @vitest-environment jsdom
/**
 * File Explorer (Apps §12.2): routes ↔ directories, listing of the workstation file union, double-click opens
 * images in GIMP (`files.opened {with:'gimp'}`) and text files in the preview pane, search, Recycle Bin.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { mutate } from '@/core/store';
import { captureActions, makeRoutedHost, mount, type, type Mounted } from '../../shell/sandbox/testkit';
import { FilesApp } from './index';
import { crumbs, dirFromRoute, parentDir } from './model';

let m: Mounted | null = null;
afterEach(() => {
  m?.unmount();
  m = null;
});

beforeAll(() => {
  mutate((s) => {
    s.lab.workstation.files['~/Downloads/'] = '';
    s.lab.workstation.files['~/Downloads/walle_receipt_0912.jpg'] = 'img:receipt:wall-e:0912';
    s.lab.workstation.files['~/Downloads/notes.txt'] = 'portNumber=5444\n';
  });
});

const dbl = async (el: Element | null | undefined) => {
  if (!el) throw new Error('missing');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
};
const row = (root: ParentNode, name: string) => [...root.querySelectorAll('.fx-table tbody tr')].find((r) => r.querySelector('.fx-name')?.textContent === name);

describe('File Explorer model', () => {
  it('maps routes to directories and breadcrumbs', () => {
    expect(dirFromRoute('/dir/~/Pictures')).toBe('~/Pictures');
    expect(dirFromRoute('/dir/Recycle%20Bin')).toBe('Recycle Bin');
    expect(dirFromRoute('/dir/')).toBe('~');
    expect(crumbs('~/IdeaProjects/gort').map((c) => c.label)).toEqual(['Home', 'IdeaProjects', 'gort']);
    expect(parentDir('~/Pictures')).toBe('~');
    expect(parentDir('~')).toBeNull();
  });
});

describe('File Explorer', () => {
  it('lists ~/Downloads; double-click opens an image in GIMP and a text file in the preview pane', async () => {
    const cap = captureActions();
    const host = makeRoutedHost(FilesApp, '/dir/~/Downloads');
    m = await mount(<host.Host />);
    expect(m.container.textContent).toContain('This PC');
    expect(row(m.container, 'walle_receipt_0912.jpg')?.textContent).toContain('JPG File');
    await dbl(row(m.container, 'walle_receipt_0912.jpg'));
    expect(cap.of('files.opened')[0]).toEqual({ path: '~/Downloads/walle_receipt_0912.jpg', with: 'gimp' });
    await dbl(row(m.container, 'notes.txt'));
    expect(m.container.querySelector('.fx-preview-text')?.textContent).toContain('portNumber=5444');
    cap.stop();
  });

  it('navigates into folders, searches, and shows an empty Recycle Bin', async () => {
    const host = makeRoutedHost(FilesApp, '/dir/~');
    m = await mount(<host.Host />);
    await dbl(row(m.container, 'Downloads'));
    expect(host.routes.at(-1)).toBe('/dir/~/Downloads');
    await type(m.container.querySelector('.fx-search input'), 'notes');
    expect(m.container.querySelectorAll('.fx-table tbody tr').length).toBe(1);
    await host.go('/dir/Recycle Bin');
    expect(m.container.textContent).toContain('This folder is empty.');
  });
});
