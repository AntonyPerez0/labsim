/**
 * HUD composition over the 3D view. Layout (GP §5.2, §6.2):
 *   top-left clock + banners · top-centre shift bar + subtitles · top-right objectives / ticket queue ·
 *   centre crosshair + prompt + callouts · bottom-centre dialogue + hotbar · bottom-left pipelines ·
 *   right Teach Cards (Shift / Free Play) · bottom-right toasts.
 */
import { useGame } from '@/core/store';
import { Icon, Kbd } from '@/ui/kit';
import { Crosshair, InteractionPrompt } from './Reticle';
import { Hotbar } from './Hotbar';
import { ObjectiveTracker } from './Objectives';
import { DialogueBox } from './Dialogue';
import { ToastStack } from './Toasts';
import { Banners, Callouts, ClickToResume, ControlHintBar, GameClock } from './Status';
import { PipelineStrip, ShiftBar } from './ShiftHud';
import { TicketQueue } from './TicketQueue';
import { TeachCardPanel } from './TeachCard';
import { Subtitles } from './Subtitles';
import { Waypoint } from './Waypoint';

/** Overlays under which the HUD stays visible (non-pausing panels; the world keeps running). */
const HUD_OVERLAYS = new Set(['none', 'tickets', 'notebook', 'sandbox']);

export function Hud({ engineFocused }: { engineFocused: boolean }) {
  const overlay = useGame((s) => s.ui.overlay.kind);
  const mode = useGame((s) => s.session.mode);
  const pointerLocked = useGame((s) => s.ui.pointerLocked);
  const hasShift = useGame((s) => !!s.session.shift);
  const hasTickets = useGame((s) => s.session.tickets.length > 0);
  const combo = useGame((s) => s.session.shift?.combo ?? 0);
  const reduced = useGame((s) => s.progress.settings.reducedMotion);
  const dialogue = useGame((s) => !!s.session.dialogue);

  if (!HUD_OVERLAYS.has(overlay)) return null;
  const free = overlay === 'none';
  const showResume = free && !pointerLocked && !engineFocused && !dialogue;
  const sidePanel = overlay === 'tickets' || overlay === 'sandbox';

  return (
    <div className={`hud${sidePanel ? ' has-side' : ''}${dialogue ? ' has-dialogue' : ''}`}>
      {combo >= 4 && !reduced ? <div className={`hud-edge-glow${combo >= 8 ? ' is-gold' : ''}`} /> : null}
      <div className="hud-tl">
        <GameClock />
        <Banners />
        {(hasShift || mode === 'freeplay') && !sidePanel ? <TeachCardPanel /> : null}
        {mode === 'freeplay' ? (
          <div className="hud-fp">
            <Icon name="sandbox" size={13} /> Sandbox <Kbd k="F10" size="sm" />
          </div>
        ) : null}
      </div>
      <div className="hud-tc">
        {hasShift ? <ShiftBar /> : null}
      </div>
      <div className={`hud-subwrap${hasShift ? ' is-low' : ''}`}>
        <Subtitles />
      </div>
      {!sidePanel ? (
        <div className="hud-tr">
          <ObjectiveTracker />
          {hasTickets ? <TicketQueue /> : null}
        </div>
      ) : null}
      {free ? (
        <>
          <Waypoint />
          <Crosshair />
          <InteractionPrompt />
          <Callouts />
          <ControlHintBar />
        </>
      ) : null}
      <div className="hud-bl">
        <PipelineStrip />
      </div>
      <div className="hud-bc">
        <DialogueBox />
        <Hotbar />
      </div>
      {showResume ? <ClickToResume /> : null}
    </div>
  );
}

/**
 * Mentor lines that arrive while the workstation or a status tablet is open (Academy `say` lines after a
 * computer-task / tablet step). The regular HUD is hidden under those overlays, so without this the line
 * was invisible and blocked the lesson. Click (or Space/Enter on the tablet) continues.
 */
export function FocusDialogueLayer() {
  const overlay = useGame((s) => s.ui.overlay.kind);
  const dialogue = useGame((s) => !!s.session.dialogue);
  // The tablet hides the HUD: keep the current objective visible on it (e.g. "Wait for build #4120").
  const objective = useGame((s) => (s.ui.overlay.kind === 'tablet' && s.session.mode !== 'menu' ? (s.session.objectives.find((o) => !o.done)?.text ?? null) : null));
  if (overlay !== 'computer' && overlay !== 'tablet') return null;
  if (!dialogue && !objective) return null;
  return (
    <div className="hud hud--focus-dialogue">
      {objective && !dialogue ? (
        <div className="hud-focus-objective" role="status">
          <Icon name="target" size={13} />
          <span>{objective}</span>
        </div>
      ) : null}
      {dialogue ? (
        <div className="hud-bc">
          <DialogueBox clickOnly={overlay === 'computer'} />
        </div>
      ) : null}
    </div>
  );
}

/** Toasts render above everything (also over the computer/tablet overlays and menus). */
export function ToastLayer() {
  return <ToastStack />;
}
