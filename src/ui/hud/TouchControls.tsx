/**
 * On-screen touch controls for phones and tablets (the desktop keeps keyboard + mouse + pointer
 * lock; GP §6.3). Mounted by the HUD only on coarse-pointer devices while the 3D view is free.
 *
 * Writes into the engine's touch state (`@/engine/touch`), which the engine consumes per frame:
 *  - bottom-left: floating move joystick — analog, pushed into the outer ring = walk fast;
 *  - anywhere else on the view: drag to look (the right thumb);
 *  - bottom-right: interact / jump / crouch / tool-mode / holster / head-torch / pause buttons,
 *    driven by the same verb prompts as the keyboard (`ui.prompt`), so what is pressable matches
 *    exactly what the crosshair offers.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { mutate, useGame } from '@/core/store';
import { touch, touchClear, touchPress, joystick } from '@/engine/touch';
import { hasMission, ma, maQuiet } from '@/ui/services/missions';
import { openPause } from '@/ui/services/nav';
import { selectHotbarSlot } from './Hotbar';
import { advanceDialogue } from './Dialogue';
import { Icon } from '@/ui/kit';

/** Coarse-pointer device (phone / tablet; desktops with a touch screen keep the mouse flow). */
export const TOUCH_DEVICE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

// Lets the stylesheets adapt HUD layout to the touch layer (dialogue width, panel offsets…).
if (TOUCH_DEVICE && typeof document !== 'undefined') document.documentElement.dataset.touch = 'on';

/** Joystick knob travel in px (the visible base is 124px wide). */
const JOY_TRAVEL = 44;

function LookPad() {
  const st = useRef({ pid: -1, x: 0, y: 0 });
  return (
    <div
      className="tc-look pe-auto"
      onPointerDown={(e) => {
        if (st.current.pid !== -1) return;
        st.current.pid = e.pointerId;
        st.current.x = e.clientX;
        st.current.y = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
        // Also stops the compatibility mouse events (→ no pointer-lock attempt) and selection.
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (st.current.pid !== e.pointerId) return;
        touch.lookDX += e.clientX - st.current.x;
        touch.lookDY += e.clientY - st.current.y;
        st.current.x = e.clientX;
        st.current.y = e.clientY;
      }}
      onPointerUp={(e) => {
        if (st.current.pid === e.pointerId) st.current.pid = -1;
      }}
      onPointerCancel={() => {
        st.current.pid = -1;
      }}
      onLostPointerCapture={() => {
        st.current.pid = -1;
      }}
    />
  );
}

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const st = useRef({ pid: -1, x: 0, y: 0 });

  const end = (): void => {
    st.current.pid = -1;
    touch.jx = touch.jy = 0;
    touch.fast = false;
    baseRef.current?.classList.remove('is-active');
    knobRef.current?.classList.remove('is-fast');
    if (knobRef.current) knobRef.current.style.transform = '';
  };

  return (
    <div
      ref={baseRef}
      className="tc-joy pe-auto"
      onPointerDown={(e) => {
        if (st.current.pid !== -1) return;
        st.current.pid = e.pointerId;
        st.current.x = e.clientX;
        st.current.y = e.clientY;
        baseRef.current?.classList.add('is-active');
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (st.current.pid !== e.pointerId) return;
        const dx = e.clientX - st.current.x;
        const dy = e.clientY - st.current.y;
        // Show the knob clamped to the travel ring; the vector itself can exceed it.
        const len = Math.hypot(dx, dy) || 1;
        const k = len > JOY_TRAVEL ? JOY_TRAVEL / len : 1;
        if (knobRef.current) knobRef.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        const out = joystick(dx, dy, JOY_TRAVEL);
        touch.jx = out.x;
        touch.jy = out.y;
        touch.fast = out.fast;
        knobRef.current?.classList.toggle('is-fast', out.fast);
      }}
      onPointerUp={(e) => {
        if (st.current.pid === e.pointerId) end();
      }}
      onPointerCancel={() => end()}
      onLostPointerCapture={() => {
        if (st.current.pid !== -1) end();
      }}
    >
      <div ref={knobRef} className="tc-joy__knob" />
    </div>
  );
}

function CircleBtn({
  className = '',
  label,
  text,
  pressed,
  onPress,
  children,
}: {
  className?: string;
  label: string;
  /** Text content instead of an icon (verb letters). */
  text?: string;
  pressed?: boolean;
  onPress(): void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tc-btn ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {text ? <span className="tc-btn__text">{text}</span> : children}
    </button>
  );
}

export function TouchControls() {
  const prompt = useGame((s) => s.ui.prompt);
  const dialogue = useGame((s) => !!s.session.dialogue);
  const activeTool = useGame((s) => s.session.activeTool);
  const carried = useGame((s) => !!s.session.items.carried);
  const hasTorch = useGame((s) => s.session.inventory.includes('flashlight'));
  const torchOn = useGame((s) => s.session.toolModes.flashlightOn);
  const crouched = useGame((s) => s.session.player.crouched);

  useEffect(() => {
    touch.enabled = true;
    return () => {
      touch.enabled = false;
      touchClear();
    };
  }, []);

  // The verb buttons mirror the keyboard: a context verb wins (the engine consumes the press);
  // otherwise the button does what the global hotkey does (torch, tool mode, holster, continue).
  const eVerb = prompt?.verbs.find((v) => v.key === 'E' && !v.disabled) ?? null;
  const fVerb = prompt?.verbs.find((v) => v.key === 'F' && !v.disabled) ?? null;
  const rVerb = prompt?.verbs.find((v) => v.key === 'R' && !v.disabled) ?? null;
  const gVerb = prompt?.verbs.find((v) => v.key === 'G' && !v.disabled) ?? null;
  const qVerb = prompt?.verbs.find((v) => v.key === 'Q' && !v.disabled) ?? null;
  // Dialogue handling mirrors the global hotkeys: continue only when there is nothing to choose
  // (choice lines are picked with their own buttons; a crosshair E verb still wins).
  const choiceCount = useGame((s) => s.session.dialogue?.choices?.length ?? 0);
  const advance = dialogue && !eVerb && choiceCount === 0;
  const showInteract = !dialogue || !!eVerb || choiceCount === 0;

  return (
    <>
      <LookPad />
      <Joystick />
      <div className="tc-cluster">
        <div className="tc-cluster__row">
          <CircleBtn className="tc-btn--sm" label="Pause (Esc)" onPress={openPause}>
            <Icon name="pause" size={15} />
          </CircleBtn>
          {hasTorch || fVerb ? (
            <CircleBtn
              className="tc-btn--sm"
              label="Head torch (F)"
              pressed={torchOn}
              onPress={() => {
                if (fVerb) touchPress('F');
                else
                  mutate((d) => {
                    d.session.toolModes.flashlightOn = !d.session.toolModes.flashlightOn;
                  });
              }}
            >
              <Icon name="flashlight" size={15} />
            </CircleBtn>
          ) : null}
          {rVerb || activeTool !== 'hand' ? (
            <CircleBtn
              className="tc-btn--sm"
              label={rVerb?.label ?? 'Tool mode (R)'}
              text="R"
              onPress={() => {
                if (rVerb) touchPress('R');
                else if (hasMission('cycleToolMode')) void ma('cycleToolMode');
              }}
            />
          ) : null}
          {gVerb ? <CircleBtn className="tc-btn--sm" label={gVerb.label} text="G" onPress={() => touchPress('G')} /> : null}
          {qVerb || activeTool !== 'hand' || carried ? (
            <CircleBtn
              className="tc-btn--sm"
              label="Holster / set down (Q)"
              text="Q"
              onPress={() => {
                if (qVerb) touchPress('Q');
                else if (carried) maQuiet('setDownCarried');
                else selectHotbarSlot(null);
              }}
            />
          ) : null}
        </div>
        <div className="tc-cluster__row">
          <CircleBtn className="tc-btn--md" label="Crouch (C)" pressed={crouched} onPress={() => (touch.crouch = true)}>
            <Icon name="chevron-down" size={20} />
          </CircleBtn>
          <CircleBtn className="tc-btn--md" label="Jump (Space)" onPress={() => (touch.jump = true)}>
            <Icon name="arrow-up" size={20} />
          </CircleBtn>
        </div>
        {showInteract ? (
          <CircleBtn
            className="tc-btn--lg"
            label={eVerb?.label ?? 'Interact (E)'}
            onPress={() => {
              if (advance) advanceDialogue();
              else touchPress('E');
            }}
          >
            <Icon name="hand" size={24} />
            <span className="tc-btn__label">{advance ? 'Continue' : (eVerb?.label ?? 'Interact')}</span>
          </CircleBtn>
        ) : null}
      </div>
      <div className="tc-rotate" role="status">
        <Icon name="refresh" size={22} />
        <span>Rotate to landscape</span>
        <small>The lab is built for a wide view</small>
      </div>
    </>
  );
}
