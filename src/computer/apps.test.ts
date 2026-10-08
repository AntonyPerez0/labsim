import { describe, expect, it } from 'vitest';
import { bus } from '@/core/bus';
import {
  APP_ACTIONS,
  APP_IDS,
  APP_META,
  APP_ROUTES,
  buildRoute,
  drainOpenRequests,
  emitAppAction,
  fmtClock,
  fmtDate,
  fmtDuration,
  fmtIdeaDuration,
  fmtJenkins,
  fmtMoney,
  fmtRelative,
  fmtStamp,
  getChatReplies,
  matchRoute,
  onAppAction,
  requestOpenApp,
  resolveUrl,
  setChatReplyProvider,
} from './apps';
import { APP_REGISTRY } from './index';

describe('APP_META / APP_REGISTRY', () => {
  it('has one entry per app id with sane sizes and a home route', () => {
    for (const id of APP_IDS) {
      const m = APP_META[id];
      expect(m.id).toBe(id);
      expect(m.minSize.w).toBeLessThanOrEqual(m.defaultSize.w);
      expect(m.minSize.h).toBeLessThanOrEqual(m.defaultSize.h);
      expect(m.icon.startsWith('<svg')).toBe(true);
      expect(m.homeRoute.length).toBeGreaterThan(0);
      expect(APP_ROUTES[id]).toBeDefined();
    }
    expect(APP_REGISTRY.map((d) => d.id)).toEqual([...APP_IDS]);
  });

  it('lazy-loads every app component under its documented export name', async () => {
    for (const def of APP_REGISTRY) {
      const Comp = await def.load();
      expect(typeof Comp).toBe('function');
      expect((Comp as { name?: string }).name).toBe(def.exportName);
    }
  }, 60_000);

  it('IntelliJ windows are keyed by repo', () => {
    expect(APP_META.intellij.instanceKey?.({ repo: 'pigeon' })).toBe('pigeon');
    expect(APP_META.intellij.instanceKey?.({})).toBe('welcome');
  });
});

describe('routes', () => {
  it('builds and matches parametrised routes', () => {
    const route = buildRoute(APP_ROUTES.orca.robotEdit, { id: 5 });
    expect(route).toBe('/robot/5/edit');
    expect(matchRoute(APP_ROUTES.orca.robotEdit, route)?.params).toEqual({ id: '5' });
    expect(matchRoute(APP_ROUTES.orca.robotView, route)).toBeNull();
  });

  it('keeps query strings out of the template and ignores their order', () => {
    const route = buildRoute(APP_ROUTES.orca.robots, {}, { 'status.in': 'AVAILABLE,RESERVED', page: 1, 'name.contains': '' });
    expect(route).toBe('/robot?status.in=AVAILABLE,RESERVED&page=1');
    const m = matchRoute(APP_ROUTES.orca.robots, '/robot?page=1&status.in=AVAILABLE');
    expect(m?.query).toEqual({ page: '1', 'status.in': 'AVAILABLE' });
  });

  it('ignores trailing slashes (Jenkins) and decodes params', () => {
    const m = matchRoute(APP_ROUTES.jenkins.console, '/job/Java/job/uia-remote-regression-flex/4127/console/');
    expect(m?.params).toEqual({ folder: 'Java', job: 'uia-remote-regression-flex', number: '4127' });
    expect(matchRoute(APP_ROUTES.jenkins.view, '/view/Java')?.params.view).toBe('Java');
  });

  it('captures *rest params including slashes (GitHub branches with "/")', () => {
    const route = buildRoute(APP_ROUTES.github.blob, { repo: 'gort', ref: 'fix/flex4-receipt-qr/config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json' });
    expect(route).toBe('/labsim-lab/gort/blob/fix/flex4-receipt-qr/config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json');
    expect(matchRoute(APP_ROUTES.github.blob, route)?.params.ref).toBe('fix/flex4-receipt-qr/config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json');
    const file = buildRoute(APP_ROUTES.intellij.file, { repo: 'uia-remote', path: 'app/src/main/java/com/labsim/uia/AppRegistration.java' });
    expect(matchRoute(APP_ROUTES.intellij.file, file)?.params).toEqual({ repo: 'uia-remote', path: 'app/src/main/java/com/labsim/uia/AppRegistration.java' });
  });

  it('browser raw route is the full URL', () => {
    expect(matchRoute(APP_ROUTES.browser.raw, 'http://10.42.10.11:8000/health')?.params.url).toBe('http://10.42.10.11:8000/health');
  });
});

describe('resolveUrl (browser host table)', () => {
  it('maps lab hosts to apps', () => {
    expect(resolveUrl('http://orca.lab.local:8080/robot/5/view')).toEqual({ app: 'orca', route: '/robot/5/view', origin: 'http://orca.lab.local:8080' });
    expect(resolveUrl('10.42.1.10:8080').app).toBe('orca');
    expect(resolveUrl('http://jenkins.lab.local:8080/view/Java/')).toMatchObject({ app: 'jenkins', route: '/view/Java/' });
    expect(resolveUrl('https://github.com/labsim-lab/gort')).toMatchObject({ app: 'github', route: '/labsim-lab/gort' });
    expect(resolveUrl('http://10.42.1.12:3000/')).toMatchObject({ app: 'ollama', route: '/' });
    expect(resolveUrl('http://10.42.10.40:8081/stream.mjpg')).toMatchObject({ app: 'camera', route: '/stream/10.42.10.40' });
    expect(resolveUrl('http://10.42.10.11:8000/health')).toMatchObject({ app: 'browser', route: 'http://10.42.10.11:8000/health' });
  });
});

describe('actions', () => {
  it('APP_ACTIONS names are unique and prefixed with their source', () => {
    const all: string[] = [];
    for (const [source, actions] of Object.entries(APP_ACTIONS)) {
      for (const name of Object.values(actions)) {
        expect(name.startsWith(`${source}.`)).toBe(true);
        all.push(name);
      }
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it('emitAppAction delivers a typed payload to onAppAction', () => {
    const seen: unknown[] = [];
    const off = onAppAction('orca.merchant.editOpened', (data, app) => seen.push({ data, app }));
    emitAppAction('orca', 'orca.merchant.editOpened', { merchantId: 3, name: 'GO-SDK-US-01' });
    emitAppAction('orca', 'orca.merchant.saved', { merchantId: 3, name: 'GO-SDK-US-01', changed: ['apiKey'] });
    off();
    expect(seen).toEqual([{ data: { merchantId: 3, name: 'GO-SDK-US-01' }, app: 'orca' }]);
  });
});

describe('mission bridge', () => {
  it('queues open requests and emits them', () => {
    drainOpenRequests();
    const seen: string[] = [];
    const off = bus.on('computer.openAppRequested', (e) => seen.push(e.app));
    requestOpenApp('orca', { route: '/robot' });
    off();
    expect(seen).toEqual(['orca']);
    expect(drainOpenRequests()).toEqual([{ app: 'orca', params: { route: '/robot' } }]);
    expect(drainOpenRequests()).toEqual([]);
  });

  it('chat reply provider is optional and fault-tolerant', () => {
    const ctx = { channel: '#lab-automation', lastMessage: null };
    expect(getChatReplies(ctx)).toEqual([]);
    setChatReplyProvider(() => [{ id: 'R_WAIT_PING', label: 'Wait for the ping', text: "Orca hasn't re-pinged yet." }]);
    expect(getChatReplies(ctx).map((o) => o.id)).toEqual(['R_WAIT_PING']);
    setChatReplyProvider(() => {
      throw new Error('boom');
    });
    expect(getChatReplies(ctx)).toEqual([]);
    setChatReplyProvider(null);
  });
});

describe('formatters (game clock, epoch 2026-10-05)', () => {
  const t0941 = (9 * 3600 + 41 * 60 + 7) * 1000;
  it('formats clock, date and stamps', () => {
    expect(fmtClock(t0941)).toBe('9:41 AM');
    expect(fmtClock(13 * 3600 * 1000)).toBe('1:00 PM');
    expect(fmtClock(0)).toBe('12:00 AM');
    expect(fmtDate(t0941)).toBe('10/5/2026');
    expect(fmtStamp(t0941)).toBe('2026-10-05 09:41:07');
    expect(fmtStamp(-22_680_000)).toBe('2026-10-04 17:42:00');
    expect(fmtJenkins(t0941)).toBe('Oct 5, 2026, 9:41:07 AM');
  });

  it('formats relative times and durations', () => {
    expect(fmtRelative(t0941 - 30_000, t0941)).toBe('just now');
    expect(fmtRelative(t0941 - 3 * 60_000, t0941)).toBe('3 minutes ago');
    expect(fmtRelative(t0941 - 2 * 3_600_000, t0941)).toBe('2 hours ago');
    expect(fmtRelative(t0941 - 30 * 3_600_000, t0941)).toBe('yesterday');
    expect(fmtRelative(t0941 - 3 * 86_400_000, t0941)).toBe('3 days ago');
    expect(fmtDuration(4_100)).toBe('4.1 sec');
    expect(fmtDuration(62_000)).toBe('1 min 2 sec');
    expect(fmtDuration(3_840_000)).toBe('1 hr 4 min');
    expect(fmtIdeaDuration(24_512)).toBe('24 s 512 ms');
    expect(fmtMoney(1083)).toBe('$10.83');
  });
});
