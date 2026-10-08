/**
 * Camera-focus overlays: the workstation desktop (`computer`) inside a subtle monitor bezel and the
 * rig status tablet (`tablet`) inside a tablet frame. The desktop/tablet own the keyboard (their own
 * Esc stands up / closes); leaving sets the overlay to none and releases the engine camera focus.
 */
import { Desktop, TabletDashboard } from '@/computer';
import { Kbd } from '@/ui/kit';
import { exitFocusOverlay } from '@/ui/services/nav';
import { ErrorBoundary } from '@/ui/app/ErrorBoundary';

function CrashCard({ what, err }: { what: string; err: Error }) {
  return (
    <div className="focus-crash">
      <div className="focus-crash__title">The {what} crashed</div>
      <div className="mono muted">{err.message}</div>
      <button type="button" className="k-btn k-btn--secondary" onClick={exitFocusOverlay}>
        Stand up
      </button>
    </div>
  );
}

export function ComputerOverlay() {
  return (
    <div className="monitor" data-ui-interactive>
      <div className="monitor__bezel">
        <div className="monitor__screen">
          <ErrorBoundary label="computer" fallback={(e) => <CrashCard what="workstation" err={e} />}>
            <Desktop onExit={exitFocusOverlay} />
          </ErrorBoundary>
        </div>
        <div className="monitor__chin">
          <span className="monitor__brand">ws-17 · 10.42.50.17</span>
          <span className="monitor__led" />
        </div>
      </div>
      <div className="monitor__hint">
        <Kbd k="Esc" size="sm" /> stand up
      </div>
    </div>
  );
}

export function TabletOverlay({ robotId }: { robotId: string }) {
  return (
    <div className="tabletov" data-ui-interactive>
      <div className="tabletov__device">
        <span className="tabletov__cam" />
        <div className="tabletov__screen">
          <ErrorBoundary label="tablet" fallback={(e) => <CrashCard what="tablet dashboard" err={e} />}>
            <TabletDashboard robotId={robotId} onExit={exitFocusOverlay} />
          </ErrorBoundary>
        </div>
      </div>
      <div className="monitor__hint">
        <Kbd k="Esc" size="sm" /> step back
      </div>
    </div>
  );
}
