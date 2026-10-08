/**
 * Crosshair and the interaction prompt under it (`ui.prompt`, written by the engine).
 * Disabled verbs are greyed; the engine appends "(needs <tool>)" which renders as a reason chip.
 */
import { useGame } from '@/core/store';
import { Kbd } from '@/ui/kit';

export function Crosshair() {
  const hasPrompt = useGame((s) => s.ui.prompt !== null);
  const anyEnabled = useGame((s) => !!s.ui.prompt?.verbs.some((v) => !v.disabled));
  return (
    <div className={`hud-crosshair${hasPrompt ? ' is-target' : ''}${hasPrompt && !anyEnabled ? ' is-blocked' : ''}`} aria-hidden>
      <span className="hud-crosshair__dot" />
      <span className="hud-crosshair__ring" />
    </div>
  );
}

const NEEDS_RE = /^(.*?)\s*\((needs [^)]+)\)\s*$/;

export function InteractionPrompt() {
  const prompt = useGame((s) => s.ui.prompt);
  if (!prompt) return null;
  return (
    <div className="hud-prompt" role="status">
      <div className="hud-prompt__label">{prompt.label}</div>
      {prompt.verbs.length ? (
        <div className="hud-prompt__verbs">
          {prompt.verbs.map((v, i) => {
            const m = NEEDS_RE.exec(v.label);
            const text = m ? m[1] : v.label;
            const reason = m ? m[2] : null;
            return (
              <div key={`${v.key}-${i}`} className={`hud-prompt__verb${v.disabled ? ' is-disabled' : ''}`}>
                <Kbd k={v.key === 'E' ? 'E' : v.key} size="sm" tone={v.disabled ? 'muted' : 'green'} />
                <span className="hud-prompt__verb-label">{text}</span>
                {reason ? <span className={`hud-prompt__reason${v.disabled ? '' : ' is-ok'}`}>{reason}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
