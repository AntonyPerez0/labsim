/**
 * First launch (GP §6.1): title → New profile (name ≤ 16) → one quick-setup screen (mouse sensitivity,
 * invert Y, subtitle size, colour-blind mode, Reduce Motion, Realism) → straight into M01.
 */
import { useEffect, useState } from 'react';
import { mutate, store, useGame } from '@/core/store';
import { Button, LabWordmark, FieldRow, Kbd, Segmented, Select, Slider, TextField, Toggle } from '@/ui/kit';
import { hasMission, ma } from '@/ui/services/missions';
import { goMenu } from '@/ui/services/nav';
import { startModule } from '@/ui/services/actions';
import { setSetting } from '@/ui/overlays/Settings';
import { unlockAudio } from '@/ui/services/sound';

export function TitleScreen() {
  const loading = useGame((s) => s.ui.loading !== null);
  const named = useGame((s) => s.progress.flags.quickSetupDone === true || s.progress.xp > 0 || s.progress.playerName !== 'New Hire');
  useEffect(() => {
    if (loading) return;
    const go = () => {
      unlockAudio();
      goMenu(named ? 'home' : 'new-profile');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') return;
      // F1 (controls), ` (debug) and Esc keep their global meaning on the title screen.
      if (/^F\d{1,2}$/.test(e.key) || e.code === 'Backquote' || e.key === 'Escape') return;
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, named]);
  return (
    <div
      className="title"
      data-ui-interactive
      onClick={() => {
        unlockAudio();
        goMenu(named ? 'home' : 'new-profile');
      }}
    >
      <div className="title__veil" />
      <div className="title__center">
        <LabWordmark size={64} className="title__mark" />
        <h1 className="title__name">LabSim</h1>
        <div className="title__sub">LabSim Automation Lab</div>
        <div className="title__press">
          Press any key <Kbd k="Enter" size="sm" /> or click to start
        </div>
      </div>
      <div className="title__foot">A first-person training simulator · names are configurable · progress stays in this browser</div>
    </div>
  );
}

export function NewProfile() {
  const current = useGame((s) => s.progress.playerName);
  const [name, setName] = useState(current === 'New Hire' ? '' : current);
  const save = () => {
    const n = name.trim().slice(0, 16);
    if (!n) return;
    if (hasMission('setPlayerName')) ma('setPlayerName', n);
    else
      mutate((s) => {
        s.progress.playerName = n;
      });
    goMenu('quick-setup');
  };
  return (
    <div className="onb" data-ui-interactive>
      <div className="onb__card">
        <div className="onb__step">Step 1 of 2</div>
        <h1>Welcome to the lab</h1>
        <p className="muted">You’re the newest engineer on the LabSim automation team. What should your lanyard say?</p>
        <TextField value={name} onChange={setName} placeholder="Your name" maxLength={16} autoFocus onEnter={save} ariaLabel="Your name" />
        <div className="onb__count muted tnum">{name.trim().length}/16</div>
        <div className="onb__actions">
          <Button variant="ghost" onClick={() => goMenu('title')}>
            Back
          </Button>
          <span className="spacer" />
          <Button variant="primary" iconRight="arrow-right" disabled={!name.trim()} onClick={save}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function QuickSetup() {
  const st = useGame((s) => s.progress.settings);
  const realism = useGame((s) => s.progress.realism);
  const finish = (start: boolean) => {
    mutate((s) => {
      s.progress.flags.quickSetupDone = true;
    });
    if (start) startModule('M01');
    // Not started (runtime missing / refused): land on the home menu instead of staying here.
    if (store.getState().session.mode === 'menu' && store.getState().ui.overlay.kind === 'main-menu') goMenu('home');
  };
  return (
    <div className="onb" data-ui-interactive>
      <div className="onb__card onb__card--wide">
        <div className="onb__step">Step 2 of 2</div>
        <h1>Quick setup</h1>
        <p className="muted">You can change all of this later in Settings.</p>
        <div className="onb__form">
          <FieldRow label="Mouse sensitivity">
            <Slider value={st.mouseSensitivity} min={0.2} max={3} step={0.05} onChange={(v) => setSetting('mouseSensitivity', v)} format={(v) => `${v.toFixed(2)}×`} />
          </FieldRow>
          <Toggle label="Invert Y" checked={st.invertY} onChange={(v) => setSetting('invertY', v)} />
          <FieldRow label="Subtitle size">
            <Segmented
              value={st.subtitleSize}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
              onChange={(v) => setSetting('subtitleSize', v)}
            />
          </FieldRow>
          <FieldRow label="Colour-blind mode" hint="Banners and LEDs gain text and shape glyphs.">
            <Select
              value={st.colourBlind}
              onChange={(v) => setSetting('colourBlind', v)}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'deuter', label: 'Deuteranopia' },
                { value: 'prot', label: 'Protanopia' },
                { value: 'trit', label: 'Tritanopia' },
              ]}
            />
          </FieldRow>
          <Toggle label="Reduce motion" checked={st.reducedMotion} onChange={(v) => setSetting('reducedMotion', v)} />
          <FieldRow label="Realism" hint={realism === 'strict' ? 'Strict = “Real Lab”: no markers, history-only terminal, Arcade hints tier 1 only, XP ×1.25.' : 'Standard is recommended for your first week.'}>
            <Segmented
              value={realism}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'strict', label: 'Strict' },
              ]}
              onChange={(r) => {
                if (hasMission('setRealism')) ma('setRealism', r);
                else
                  mutate((s) => {
                    s.progress.realism = r;
                  });
              }}
            />
          </FieldRow>
        </div>
        <div className="onb__actions">
          <Button variant="ghost" onClick={() => finish(false)}>
            Skip to menu
          </Button>
          <span className="spacer" />
          <Button variant="primary" size="lg" icon="play" onClick={() => finish(true)}>
            Start your first day (M01)
          </Button>
        </div>
      </div>
    </div>
  );
}
