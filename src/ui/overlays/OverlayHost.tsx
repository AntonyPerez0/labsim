/**
 * Renders the overlay for `ui.overlay` (one at a time; see `docs/ARCHITECTURE.md` "Overlays and input").
 * Each overlay sits in its own error boundary so a crash in one panel never blanks the game.
 */
import { lazy, Suspense } from 'react';
import { useGame } from '@/core/store';
import type { Overlay } from '@/core/state';
import { ErrorBoundary } from '@/ui/app/ErrorBoundary';
import { closeOverlay } from '@/ui/services/nav';
import { MainMenu } from '@/ui/menu/MainMenu';
import { TicketDrawer } from '@/ui/hud/TicketDrawer';
import { SandboxPanel } from '@/ui/hud/SandboxPanel';
import { PauseMenu } from './PauseMenu';
import { SettingsOverlay } from './Settings';
import { Debrief } from './Debrief';
import { Briefing } from './Briefing';
import { InspectOverlay } from './InspectOverlay';
import { Notebook } from './Notebook';
import { ControlsOverlay } from './ControlsOverlay';
import { RankUpOverlay } from './RankUp';
import { TeachCardModal } from './TeachCardModal';

// Heavy, not-needed-at-boot overlays load on first use (separate chunks: faster first load on phones).
const FieldManual = lazy(() => import('@/ui/manual/FieldManual').then((m) => ({ default: m.FieldManual })));
const QuizOverlay = lazy(() => import('./quiz/QuizOverlay').then((m) => ({ default: m.QuizOverlay })));
const ComputerOverlay = lazy(() => import('./FocusOverlays').then((m) => ({ default: m.ComputerOverlay })));
const TabletOverlay = lazy(() => import('./FocusOverlays').then((m) => ({ default: m.TabletOverlay })));
const DrillHost = lazy(() => import('./DrillHost').then((m) => ({ default: m.DrillHost })));
const FlashcardsOverlay = lazy(() => import('./Flashcards').then((m) => ({ default: m.FlashcardsOverlay })));
const CertificationOverlay = lazy(() => import('./Certification').then((m) => ({ default: m.CertificationOverlay })));

function render(o: Overlay) {
  switch (o.kind) {
    case 'none':
      return null;
    case 'main-menu':
      return <MainMenu screen={o.screen} />;
    case 'pause':
      return <PauseMenu />;
    case 'settings':
      return <SettingsOverlay />;
    case 'manual':
      return (
        <div className="manual-ov">
          <FieldManual articleId={o.articleId} onClose={() => closeOverlay({ lock: true })} />
        </div>
      );
    case 'quiz':
      return <QuizOverlay questionIds={o.questionIds} context={o.context} />;
    case 'briefing':
      return <Briefing />;
    case 'debrief':
      return <Debrief />;
    case 'computer':
      return <ComputerOverlay />;
    case 'tablet':
      return <TabletOverlay robotId={o.robotId} />;
    case 'inspect':
      return <InspectOverlay propId={o.propId} />;
    case 'drill':
      return <DrillHost drillId={o.drillId} />;
    case 'tickets':
      return <TicketDrawer ticketId={o.ticketId} panel={o.panel} />;
    case 'notebook':
      return <Notebook tab={o.tab} />;
    case 'flashcards':
      return <FlashcardsOverlay deck={o.deck} tags={o.tags} />;
    case 'certification':
      return <CertificationOverlay examId={o.examId} />;
    case 'sandbox':
      return <SandboxPanel />;
    case 'controls':
      return <ControlsOverlay />;
    case 'rank-up':
      return <RankUpOverlay rank={o.rank} />;
    case 'teach-card':
      return <TeachCardModal teachCardId={o.teachCardId} />;
  }
}

export function OverlayHost() {
  const overlay = useGame((s) => s.ui.overlay);
  const key = overlay.kind === 'main-menu' ? 'main-menu' : overlay.kind;
  return (
    <div className={`ov-layer ov-layer--${overlay.kind}`} key={key}>
      <ErrorBoundary label={`overlay ${overlay.kind}`} resetKey={key}>
        <Suspense fallback={null}>{render(overlay)}</Suspense>
      </ErrorBoundary>
    </div>
  );
}
