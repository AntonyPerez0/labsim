/**
 * Mounts an app component inside a window: lazy-loads the app chunk (Apps §0.7 Performance) and isolates it
 * with an error boundary so one broken app never takes the desktop down.
 */
import { Component, memo, useEffect, useMemo, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import type { AppId, AppParams, AppProps } from '../apps';
import { loadAppComponent, peekAppComponent } from './loaders';
import { navigate as wmNavigate, setTitle as wmSetTitle, wmApi } from './wmStore';

class AppErrorBoundary extends Component<{ app: AppId; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[computer] app "${this.props.app}" crashed`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="ws-appcrash" role="alert">
          <div className="ws-appcrash-title">This app stopped working</div>
          <div className="ws-appcrash-msg">{this.state.error.message}</div>
          <button type="button" className="ws-btn" onClick={() => this.setState({ error: null })}>
            Restart app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function useAppComponent(app: AppId): ComponentType<AppProps> | null | 'error' {
  const [comp, setComp] = useState<ComponentType<AppProps> | null | 'error'>(() => peekAppComponent(app));
  useEffect(() => {
    if (comp && comp !== 'error') return;
    let alive = true;
    loadAppComponent(app)
      .then((c) => alive && setComp(() => c))
      .catch((err) => {
        console.error(`[computer] failed to load app "${app}"`, err);
        if (alive) setComp('error');
      });
    return () => {
      alive = false;
    };
  }, [app, comp]);
  return comp;
}

export interface AppSlotProps {
  windowId: string;
  app: AppId;
  route: string;
  params: AppParams;
  focused: boolean;
  reloadKey: number;
  /** Browser-hosted apps remount their page on Reload (Apps §1.4). */
  remountOnReload: boolean;
}

/** Memoised: window moves/resizes never re-render the app. */
export const AppSlot = memo(function AppSlot(props: AppSlotProps) {
  const { windowId, app, route, params, focused, reloadKey, remountOnReload } = props;
  const Comp = useAppComponent(app);
  const onTitle = useMemo(() => (t: string) => wmSetTitle(windowId, t), [windowId]);
  const navigate = useMemo(() => (r: string, opts?: { replace?: boolean }) => wmNavigate(windowId, r, opts), [windowId]);
  if (Comp === 'error') {
    return (
      <div className="ws-appcrash" role="alert">
        <div className="ws-appcrash-title">The application could not be started.</div>
      </div>
    );
  }
  if (!Comp) return <div className="ws-apploading" aria-busy="true" />;
  return (
    <AppErrorBoundary app={app}>
      <Comp
        key={remountOnReload ? reloadKey : 0}
        windowId={windowId}
        params={params}
        onTitle={onTitle}
        route={route}
        navigate={navigate}
        focused={focused}
        reloadKey={reloadKey}
        wm={wmApi}
        embedded={false}
      />
    </AppErrorBoundary>
  );
});
