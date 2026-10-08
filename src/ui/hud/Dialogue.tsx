/**
 * Mentor dialogue box (Cur §2.0 `dialogue` steps): portrait in the speaker's team colour, name and
 * role from `src/content/team.ts`, typewriter text, choices 1–4. Space / Enter / E / click first
 * completes the line, then acknowledges it (`missions.acknowledgeDialogue`).
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { teamMember } from '@/content';
import { Avatar, Kbd } from '@/ui/kit';
import { ma } from '@/ui/services/missions';
import { uiSound } from '@/ui/services/sound';

/* Shared with the global hotkeys so keyboard and click behave the same. */
let typingControl: { typing: () => boolean; complete: () => void } | null = null;

/** Advance the dialogue: finish the typewriter if it is still typing, else acknowledge. */
export function advanceDialogue(): void {
  if (typingControl?.typing()) {
    typingControl.complete();
    return;
  }
  ma('acknowledgeDialogue');
}

export function isDialogueTyping(): boolean {
  return !!typingControl?.typing();
}

const CPS = 58;

export function DialogueBox({ clickOnly = false }: { clickOnly?: boolean } = {}) {
  const line = useGame((s) => s.session.dialogue);
  const reduced = useGame((s) => s.progress.settings.reducedMotion);
  const blips = useGame((s) => s.progress.settings.voiceBlips && s.progress.settings.voiceVolume > 0);
  const [shown, setShown] = useState(0);
  const startRef = useRef(0);
  const lineId = line?.id ?? null;
  const text = line?.text ?? '';

  useEffect(() => {
    setShown(reduced ? text.length : 0);
    startRef.current = performance.now();
  }, [lineId, text, reduced]);

  useEffect(() => {
    if (!line || shown >= text.length) return;
    let raf = 0;
    let lastBlip = 0;
    const member = teamMember(line.speaker);
    const rate = member?.voice ? Math.max(0.6, Math.min(1.8, member.voice.hz / 480)) : 1;
    const tick = () => {
      const n = Math.min(text.length, Math.floor(((performance.now() - startRef.current) / 1000) * CPS));
      setShown((prev) => (n > prev ? n : prev));
      if (blips && n - lastBlip >= 3 && n < text.length) {
        lastBlip = n;
        try {
          uiSound('ui-type', 0.18 * rate, 'voice');
        } catch {
          /* ignore */
        }
      }
      if (n < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lineId, text, shown >= text.length, blips]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    typingControl = {
      typing: () => !!line && shown < text.length,
      complete: () => setShown(text.length),
    };
    return () => {
      typingControl = null;
    };
  }, [line, shown, text]);

  if (!line) return null;
  const member = teamMember(line.speaker);
  const name = member?.name ?? line.speaker;
  const color = member?.color ?? '#43b02a';
  const done = shown >= text.length;
  const choices = line.choices ?? [];

  return (
    <div
      className="hud-dialogue"
      style={{ '--speaker': color } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        if (!choices.length || !done) advanceDialogue();
      }}
      role="dialog"
      aria-live="polite"
      data-ui-interactive
    >
      <div className="hud-dialogue__portrait">
        <Avatar name={name} color={color} size={64} ring icon={member?.kind === 'system' ? 'robot' : undefined} />
      </div>
      <div className="hud-dialogue__body">
        <div className="hud-dialogue__who">
          <span className="hud-dialogue__name">{name}</span>
          {member?.role ? <span className="hud-dialogue__role">{member.role.split('·')[0]!.trim()}</span> : null}
        </div>
        <p className="hud-dialogue__text">
          {text.slice(0, shown)}
          <span className="hud-dialogue__ghost">{text.slice(shown)}</span>
        </p>
        {choices.length && done ? (
          <div className="hud-dialogue__choices">
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                className="hud-dialogue__choice"
                onClick={(e) => {
                  e.stopPropagation();
                  ma('chooseDialogue', c.id);
                }}
              >
                <Kbd k={String(c.key)} size="sm" />
                <span>{c.text}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {line.requiresAck && !choices.length ? (
        <div className={`hud-dialogue__next${done ? ' is-ready' : ''}`}>
          {done ? (
            <>
              {clickOnly ? 'Click to continue' : <><Kbd k="Space" size="sm" /> continue</>}
            </>
          ) : (
            <>
              <Kbd k="Space" size="sm" /> skip
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
