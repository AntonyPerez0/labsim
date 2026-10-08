/**
 * Orchestrator (Orca) — JHipster 7 / Bootstrap 5 web app (docs/design/50-computer-apps.md §2).
 * A pure function of `props.route`; every write goes through `sim.orca.*` (actor 'player').
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame, useGameShallow } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction, type AppProps } from '../../apps';
import { Fa, Whale } from './icons';
import { ACCOUNTS, PAGE_TITLES, matchOrcaRoute, setLogin, setReturnTo, useLogin, type OrcaRouteKey } from './session';
import { OrcaCtx, addAlert, hhmmss, simCall, splitRoute, useOrcaGate, type OrcaCtxValue } from './shared';
import { HomePage } from './pages/Home';
import { RobotsPage } from './pages/Robots';
import { RobotDetailPage } from './pages/RobotDetail';
import { RobotFormPage } from './pages/RobotForm';
import { DeviceDetailPage, DeviceFormPage, DevicesPage } from './pages/Devices';
import { CapabilitiesPage, CapabilityDetailPage, CapabilityFormPage, MatchPreviewPage } from './pages/Capabilities';
import { MerchantDetailPage, MerchantFormPage, MerchantsPage } from './pages/Merchants';
import { ScreenDetailPage, ScreenFormPage, ScreensPage } from './pages/Screens';
import { ScreenLocationDetailPage, ScreenLocationFormPage, ScreenLocationsPage } from './pages/ScreenLocations';
import { CardProfileDetailPage, CardProfileFormPage, CardProfilesPage } from './pages/CardProfiles';
import { ScreenCompareDetailPage, ScreenCompareFormPage, ScreenComparesPage } from './pages/ScreenCompare';
import { AdminPage } from './pages/Admin';
import { SwaggerPage } from './pages/Swagger';
import { AccountPage, LoginPage } from './pages/Account';
import './orca.css';

const ENTITY_MENU: { key: OrcaRouteKey; label: string; path: string }[] = [
  { key: 'robots', label: 'Robot', path: '/robot' },
  { key: 'devices', label: 'Device', path: '/device' },
  { key: 'capabilities', label: 'Robot Capability', path: '/robot-capability' },
  { key: 'merchants', label: 'Merchant Config', path: '/merchant-config' },
  { key: 'screens', label: 'Screen', path: '/screen' },
  { key: 'screenLocations', label: 'Screen Location', path: '/screen-location' },
  { key: 'cardProfiles', label: 'Card Profile', path: '/card-profile' },
  { key: 'screenCompares', label: 'Screen Compare Image', path: '/screen-compare-image' },
];

const ADMIN_MENU: { key: OrcaRouteKey; label: string; path: string; icon: keyof typeof Fa; hint?: string }[] = [
  { key: 'adminUsers', label: 'User management', path: '/admin/user-management', icon: 'usersCog' },
  { key: 'adminMetrics', label: 'Metrics', path: '/admin/metrics', icon: 'tachometer' },
  { key: 'adminHealth', label: 'Health', path: '/admin/health', icon: 'heart' },
  { key: 'adminConfiguration', label: 'Configuration', path: '/admin/configuration', icon: 'cogs' },
  { key: 'adminHealthCheckLog', label: 'Health-check log', path: '/admin/health-check-log', icon: 'list', hint: 'orca.nav.healthCheckLog' },
  { key: 'adminAudits', label: 'Audits', path: '/admin/audits', icon: 'bell' },
  { key: 'adminLogs', label: 'Logs', path: '/admin/logs', icon: 'list' },
  { key: 'adminDocs', label: 'API', path: '/admin/docs', icon: 'book' },
];

/** Entity list key a page belongs to (forms/details unlock with their list page). */
function familyOf(key: OrcaRouteKey): OrcaRouteKey {
  const fam: [RegExp, OrcaRouteKey][] = [
    [/^robot(New|View|Edit)$/, 'robots'],
    [/^device(New|View|Edit)$/, 'devices'],
    [/^capability(New|View|Edit)$/, 'capabilities'],
    [/^merchant(New|View|Edit)$/, 'merchants'],
    [/^screen(New|View|Edit)$/, 'screens'],
    [/^screenLocation(New|View|Edit)$/, 'screenLocations'],
    [/^cardProfile(New|View|Edit)$/, 'cardProfiles'],
    [/^screenCompare(New|View|Edit)$/, 'screenCompares'],
  ];
  for (const [re, k] of fam) if (re.test(key)) return k;
  return key;
}

function pageAllowed(pages: string[] | null, key: OrcaRouteKey): boolean {
  if (!pages || key === 'home' || key === 'login') return true;
  return pages.includes(key) || pages.includes(familyOf(key));
}

function Dropdown(props: { label: ReactNode; open: boolean; onToggle(): void; children: ReactNode; hint?: string; active?: boolean }) {
  return (
    <div className="orca-nav-item">
      <button type="button" className={`orca-nav-link orca-caret${props.active ? ' orca-nav-link-active' : ''}`} onClick={props.onToggle} aria-haspopup="menu" aria-expanded={props.open} data-hint={props.hint}>
        {props.label}
      </button>
      {props.open ? (
        <div className="orca-dropdown" role="menu">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

function Navbar(props: { path: string; navigate(r: string): void; login: string | null; isAdmin: boolean; pages: string[] | null }) {
  const { navigate, login, isAdmin, pages } = props;
  const [open, setOpen] = useState<null | 'entities' | 'admin' | 'account'>(null);
  const ref = useRef<HTMLElement>(null);
  const showForce = useGame((s) => !!s.session.computer?.forceHealthCheckButton && !!s.lab.config?.forceHealthCheckAllowed);
  const nextRun = useGame((s) => s.lab.orca.healthCheck.nextRunMs);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(null);
      }
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  const go = (p: string) => {
    setOpen(null);
    navigate(p);
  };
  const toggle = (m: 'entities' | 'admin' | 'account') => setOpen((o) => (o === m ? null : m));

  const force = () => {
    const fn = (sim.orca as { forceHealthCheck?: (a: string) => { ok: boolean; error?: string } }).forceHealthCheck;
    const r = simCall(() => (fn ? (fn('player') as never) : (sim.orca.runHealthCheckNow(), { ok: true as const, value: undefined })));
    emitAppAction('orca', 'orca.healthCheck.forced', { ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) addAlert('danger', r.error, props.path);
  };

  const locked = (key: OrcaRouteKey) => !pageAllowed(pages, key);

  return (
    <nav className="orca-navbar" ref={ref} data-cy="navbar">
      <button type="button" className="orca-brand" onClick={() => go('/')}>
        <Whale size={34} />
        <span>
          <span className="orca-brand-title">Orchestrator</span>
          <span className="orca-brand-version">v3.14.2</span>
        </span>
      </button>
      {showForce ? (
        <button type="button" className="orca-tutorial-btn" onClick={force} data-hint="orca.header.forceHealthCheck" title="Tutorial helper — not part of the real Orca">
          <span>⟳ Force health check</span>
          <small>next run {hhmmss(nextRun)}</small>
        </button>
      ) : null}
      <div className="orca-nav">
        <div className="orca-nav-item">
          <button type="button" className={`orca-nav-link${props.path === '/' ? ' orca-nav-link-active' : ''}`} onClick={() => go('/')}>
            <Fa.home /> Home
          </button>
        </div>
        {login ? (
          <Dropdown
            label={
              <>
                <Fa.thList /> Entities
              </>
            }
            open={open === 'entities'}
            onToggle={() => toggle('entities')}
            hint="orca.nav.entities"
          >
            {ENTITY_MENU.map((m) => (
              <button key={m.key} type="button" role="menuitem" className="orca-dropdown-item" disabled={locked(m.key)} onClick={() => go(m.path)} data-hint={`orca.nav.entity:${m.key}`}>
                <Fa.asterisk size={11} />
                {m.label}
                {locked(m.key) ? (
                  <span className="orca-pad" title="This page unlocks later in the Academy.">
                    <Fa.lock size={11} />
                  </span>
                ) : null}
              </button>
            ))}
          </Dropdown>
        ) : null}
        {login && isAdmin ? (
          <Dropdown
            label={
              <>
                <Fa.usersCog /> Administration
              </>
            }
            open={open === 'admin'}
            onToggle={() => toggle('admin')}
            hint="orca.nav.admin"
          >
            {ADMIN_MENU.map((m) => {
              const Icon = Fa[m.icon] ?? Fa.list;
              return (
                <button key={m.key} type="button" role="menuitem" className="orca-dropdown-item" disabled={locked(m.key)} onClick={() => go(m.path)} data-hint={m.hint}>
                  <Icon size={12} />
                  {m.label}
                  {locked(m.key) ? (
                    <span className="orca-pad">
                      <Fa.lock size={11} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </Dropdown>
        ) : null}
        <Dropdown
          label={
            <>
              <Fa.user /> Account
            </>
          }
          open={open === 'account'}
          onToggle={() => toggle('account')}
        >
          {login ? (
            <>
              <button type="button" role="menuitem" className="orca-dropdown-item" onClick={() => go('/account/settings')}>
                <Fa.wrench size={12} /> Settings
              </button>
              <button type="button" role="menuitem" className="orca-dropdown-item" onClick={() => go('/account/password')}>
                <Fa.lock size={12} /> Password
              </button>
              <div className="orca-dropdown-divider" />
              <button
                type="button"
                role="menuitem"
                className="orca-dropdown-item"
                onClick={() => {
                  setOpen(null);
                  setLogin(null);
                  emitAppAction('orca', 'orca.session.signedOut', { login });
                  navigate('/');
                }}
              >
                <Fa.signOut size={12} /> Sign out
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="orca-dropdown-item" onClick={() => go('/login')}>
                <Fa.signIn size={12} /> Sign in
              </button>
              <button type="button" role="menuitem" className="orca-dropdown-item" disabled>
                <Fa.user size={12} /> Register
              </button>
            </>
          )}
        </Dropdown>
      </div>
    </nav>
  );
}

const DB_DOWN_TEXT =
  '500 Internal Server Error — Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection';
const DB_FREE_PAGES: OrcaRouteKey[] = ['adminHealth', 'adminDocs', 'adminConfiguration', 'adminLogs', 'adminMetrics', 'login', 'accountSettings', 'accountPassword'];

function renderPage(key: OrcaRouteKey, params: Record<string, string>): ReactNode {
  const id = params.id != null ? Number(params.id) : NaN;
  switch (key) {
    case 'home':
      return <HomePage />;
    case 'login':
      return <LoginPage />;
    case 'robots':
      return <RobotsPage />;
    case 'robotNew':
      return <RobotFormPage key="new" id={null} />;
    case 'robotView':
      return <RobotDetailPage key={id} id={id} />;
    case 'robotEdit':
      return <RobotFormPage key={id} id={id} />;
    case 'devices':
      return <DevicesPage />;
    case 'deviceNew':
      return <DeviceFormPage key="new" id={null} />;
    case 'deviceView':
      return <DeviceDetailPage key={id} id={id} />;
    case 'deviceEdit':
      return <DeviceFormPage key={id} id={id} />;
    case 'capabilities':
      return <CapabilitiesPage />;
    case 'capabilityNew':
      return <CapabilityFormPage key="new" id={null} />;
    case 'capabilityView':
      return <CapabilityDetailPage key={id} id={id} />;
    case 'capabilityEdit':
      return <CapabilityFormPage key={id} id={id} />;
    case 'matchPreview':
      return <MatchPreviewPage />;
    case 'merchants':
      return <MerchantsPage />;
    case 'merchantNew':
      return <MerchantFormPage key="new" id={null} />;
    case 'merchantView':
      return <MerchantDetailPage key={id} id={id} />;
    case 'merchantEdit':
      return <MerchantFormPage key={id} id={id} />;
    case 'screens':
      return <ScreensPage />;
    case 'screenNew':
      return <ScreenFormPage key="new" id={null} />;
    case 'screenView':
      return <ScreenDetailPage key={id} id={id} />;
    case 'screenEdit':
      return <ScreenFormPage key={id} id={id} />;
    case 'screenLocations':
      return <ScreenLocationsPage />;
    case 'screenLocationNew':
      return <ScreenLocationFormPage key="new" id={null} />;
    case 'screenLocationView':
      return <ScreenLocationDetailPage key={id} id={id} />;
    case 'screenLocationEdit':
      return <ScreenLocationFormPage key={id} id={id} />;
    case 'cardProfiles':
      return <CardProfilesPage />;
    case 'cardProfileNew':
      return <CardProfileFormPage key="new" id={null} />;
    case 'cardProfileView':
      return <CardProfileDetailPage key={id} id={id} />;
    case 'cardProfileEdit':
      return <CardProfileFormPage key={id} id={id} />;
    case 'screenCompares':
      return <ScreenComparesPage />;
    case 'screenCompareNew':
      return <ScreenCompareFormPage key="new" id={null} />;
    case 'screenCompareView':
      return <ScreenCompareDetailPage key={id} id={id} />;
    case 'screenCompareEdit':
      return <ScreenCompareFormPage key={id} id={id} />;
    case 'adminDocs':
      return <SwaggerPage />;
    case 'accountSettings':
    case 'accountPassword':
      return <AccountPage which={key} />;
    default:
      return <AdminPage which={key} />;
  }
}

export function OrcaApp(props: AppProps) {
  const route = props.route ?? '/';
  const navigate = props.navigate ?? (() => undefined);
  const { path, query } = useMemo(() => splitRoute(route), [route]);
  // A new page starts at the top (browser navigation); query-only changes (filters, paging) keep the position.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [path, props.reloadKey]);
  const login = useLogin();
  const isAdmin = !!login && !!ACCOUNTS[login]?.admin;
  const gate = useOrcaGate();
  const db = useGameShallow((s) => ({ up: s.lab.orca.app?.up !== false, connected: s.lab.orca.app?.dbConnected !== false }));
  const match = matchOrcaRoute(path);
  const key = match?.key ?? null;
  const onTitle = props.onTitle;

  // Route guard (signed out) and lesson gating redirects.
  const needsLogin = !!key && !login && key !== 'home' && key !== 'login';
  const blocked = !!key && !pageAllowed(gate.pages, key);
  const adminOnly = !!key && key.startsWith('admin') && !isAdmin;
  useEffect(() => {
    if (needsLogin) {
      setReturnTo(route);
      navigate('/login', { replace: true });
    } else if (blocked) {
      addAlert('info', 'This page unlocks later in the Academy.', '/');
      navigate('/', { replace: true });
    }
  }, [needsLogin, blocked, route, navigate]);

  useEffect(() => {
    const t = key ? PAGE_TITLES[key] : 'Error';
    onTitle?.(key === 'home' ? 'Orchestrator' : `${t} — Orchestrator`);
  }, [key, onTitle]);

  const ctx: OrcaCtxValue = useMemo(
    () => ({ route, path, query, navigate, wm: props.wm, readOnly: gate.readOnly, login, isAdmin, focused: props.focused !== false }),
    [route, path, query, navigate, props.wm, gate.readOnly, login, isAdmin, props.focused],
  );

  let body: ReactNode;
  if (!key) {
    body = (
      <div>
        <h1>Error Page!</h1>
        <div className="orca-alert orca-alert-danger">The page does not exist.</div>
      </div>
    );
  } else if (needsLogin || blocked) {
    body = null;
  } else if (adminOnly) {
    body = (
      <div>
        <h1>Error Page!</h1>
        <div className="orca-alert orca-alert-danger">You are not authorized to access this page.</div>
      </div>
    );
  } else if (!db.connected && !DB_FREE_PAGES.includes(key)) {
    body = (
      <div>
        <h1>Error Page!</h1>
        <div className="orca-alert orca-alert-danger">
          {DB_DOWN_TEXT}
          <br />
          Communications link failure
        </div>
      </div>
    );
  } else {
    body = renderPage(key, match!.params);
  }

  return (
    <OrcaCtx.Provider value={ctx}>
      <div className="orca-root" data-app="orca" data-window={props.windowId}>
        <Navbar path={path} navigate={navigate} login={login} isAdmin={isAdmin} pages={gate.pages} />
        <div className="orca-scroll" ref={scrollRef}>
          <main className="orca-main" key={path}>
            {body}
          </main>
          <footer className="orca-footer">Orchestrator · LabSim automation lab · orca.lab.local (10.42.1.10)</footer>
        </div>
      </div>
    </OrcaCtx.Provider>
  );
}
