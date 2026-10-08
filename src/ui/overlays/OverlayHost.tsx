/**
 * Renders the overlay for `ui.overlay` (one at a time; see `docs/ARCHITECTURE.md` "Overlays and input").
 * Each overlay sits in its own error boundary so a crash in one panel never blanks the game.
 */
import { useGame } from '@/core/store';
import type { Overlay } from '@/core/state';
import { ErrorBoundary } from '@/ui/app/ErrorBoundary';
import { closeOverlay } from '@/ui/services/nav';
import { MainMenu } from '@/ui/menu/MainMenu';
import { FieldManual } from '@/ui/manual/FieldManual';
import { TicketDrawer } from '@/ui/hud/TicketDrawer';
import { SandboxPanel } from '@/ui/hud/SandboxPanel';
import { PauseMenu } from './PauseMenu';
import { SettingsOverlay } from './Settings';
import { QuizOverlay } from './quiz/QuizOverlay';
import { Debrief } from './Debrief';
import { Briefing } from './Briefing';
import { ComputerOverlay, TabletOverlay } from './FocusOverlays';
import { InspectOverlay } from './InspectOverlay';
import { DrillHost } from './DrillHost';
import { Notebook } from './Notebook';
import { FlashcardsOverlay } from './Flashcards';
import { CertificationOverlay } from './Certification';
import { ControlsOverlay } from './ControlsOverlay';
import { RankUpOverlay } from './RankUp';
import { TeachCardModal } from './TeachCardModal';

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
        {render(overlay)}
      </ErrorBoundary>
    </div>
  );
}
