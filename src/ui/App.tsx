/**
 * LabSim UI root (React 19) over the 3D canvas: loading screen, HUD, the overlay for `ui.overlay`,
 * toasts, the debug overlay and the boot-error screen. Installs global hotkeys and the event bridge.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { store, useGame } from '@/core/store';
import { engine } from '@/engine';
import { initComputer } from '@/computer';
import { goMenu } from '@/ui/services/nav';
import { ErrorBoundary, FatalScreen } from './app/ErrorBoundary';
import { getBootError, subscribeBootError } from './app/bootError';
import { installBridge } from './app/bridge';
import { installHotkeys } from './app/hotkeys';
import { installControlCoach } from './hud/controlCoach';
import { LoadingScreen } from './app/LoadingScreen';
import { FocusDialogueLayer, Hud, ToastLayer } from './hud/Hud';
import { DebugOverlay } from './hud/DebugOverlay';
import { FpsCounter } from './hud/FpsCounter';
import { OverlayHost } from './overlays/OverlayHost';

function useEngineFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      let f = false;
      try {
        f = engine.isFocused();
      } catch {
        /* engine not initialised (sandbox) */
      }
      setFocused((prev) => (prev === f ? prev : f));
    }, 200);
    return () => clearInterval(t);
  }, []);
  return focused;
}

/** A brand-new save starts on the title screen (GP §6.1). */
function isNewSave(): boolean {
  const p = store.getState().progress;
  return !p.flags.quickSetupDone && p.xp === 0 && p.playerName === 'New Hire' && Object.keys(p.modules).length === 0;
}

function Root() {
  const mode = useGame((s) => s.session.mode);
  const overlay = useGame((s) => s.ui.overlay.kind);
  const debug = useGame((s) => s.ui.debug);
  const loading = useGame((s) => s.ui.loading !== null);
  const showFps = useGame((s) => s.progress.settings.showFps);
  const engineFocused = useEngineFocused();

  useEffect(() => {
    const offBridge = installBridge();
    const offKeys = installHotkeys();
    const offCoach = installControlCoach();
    // Workstation background services (camera recorder, card-reader swipes, LabChat toasts, window
    // hygiene on session start) must run before the player first sits down (Apps §1.1: "call once at boot").
    initComputer();
    return () => {
      offBridge();
      offKeys();
      offCoach();
    };
  }, []);

  // When loading finishes on a fresh save, show the title screen instead of the home menu.
  useEffect(() => {
    if (loading) return;
    const ov = store.getState().ui.overlay;
    if (ov.kind === 'main-menu' && !ov.screen && isNewSave()) goMenu('title');
  }, [loading]);

  const inWorld = mode !== 'menu' || overlay === 'none';
  return (
    <div className={`ui-root ui-root--${overlay}`}>
      {inWorld ? (
        <ErrorBoundary label="hud" resetKey={mode}>
          <Hud engineFocused={engineFocused} />
        </ErrorBoundary>
      ) : null}
      <OverlayHost />
      <FocusDialogueLayer />
      <ToastLayer />
      {showFps ? <FpsCounter /> : null}
      {debug ? (
        <ErrorBoundary label="debug">
          <DebugOverlay />
        </ErrorBoundary>
      ) : null}
      <LoadingScreen />
    </div>
  );
}

export function App() {
  const bootError = useSyncExternalStore(subscribeBootError, getBootError);
  if (bootError) return <FatalScreen title="LabSim could not start" message={bootError.message} stack={bootError.stack} />;
  return (
    <ErrorBoundary label="app" fallback={(err) => <FatalScreen title="The game UI crashed" message={err.message} stack={err.stack} />}>
      <Root />
    </ErrorBoundary>
  );
}
