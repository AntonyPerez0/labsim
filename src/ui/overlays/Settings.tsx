/**
 * Settings (GP §6.3, §7.3): Graphics · Controls · Audio · Gameplay & accessibility · Free Play · Profile.
 * Writes `progress.settings` directly (persisted by core; `core/game.ts` applies quality/FOV/volumes to
 * the engine). Used by the in-game `settings` overlay and the main-menu Settings screen.
 */
import { useEffect, useState } from 'react';
import { mutate, store, useGame } from '@/core/store';
import { createDefaultProgress, DEFAULT_BINDINGS, DEFAULT_SETTINGS, type ControlAction, type QualityPreset, type Settings } from '@/core/state';
import { clearProgress } from '@/core/persistence';
import { Button, FieldRow, Kbd, Modal, Segmented, Select, Slider, Tabs, TextField, Toggle } from '@/ui/kit';
import { hasMission, ma } from '@/ui/services/missions';
import { closeOverlay } from '@/ui/services/nav';
import { pushToast } from '@/ui/services/toasts';
import { uiSound } from '@/ui/services/sound';
import { CONTROL_GROUPS } from './ControlsOverlay';

type Tab = 'graphics' | 'controls' | 'audio' | 'gameplay' | 'freeplay' | 'profile';

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  mutate((s) => {
    s.progress.settings[key] = value;
  });
}

let lastPreview = 0;
/** Audible feedback while dragging a volume slider (throttled). */
function setVolume(key: 'masterVolume' | 'sfxVolume' | 'uiVolume' | 'voiceVolume' | 'ambienceVolume', v: number): void {
  setSetting(key, v);
  const now = performance.now();
  if (now - lastPreview < 140) return;
  lastPreview = now;
  if (key === 'voiceVolume') uiSound('ui-type', 0.5, 'voice');
  else if (key !== 'ambienceVolume') uiSound('ui-click', 0.8);
}

const QUALITY: { value: QualityPreset; label: string; title: string }[] = [
  { value: 'low', label: 'Low', title: 'Integrated GPUs: no shadows/AO, reduced resolution' },
  { value: 'medium', label: 'Medium', title: 'Shadows on key lights, light post-fx' },
  { value: 'high', label: 'High', title: 'Shadows, ambient occlusion, bloom' },
  { value: 'ultra', label: 'Ultra', title: 'Everything on at full resolution' },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsPanel({ initialTab = 'graphics' }: { initialTab?: Tab }) {
  const st = useGame((s) => s.progress.settings);
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="settings">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'graphics', label: 'Graphics', icon: 'monitor' },
          { id: 'controls', label: 'Controls', icon: 'keyboard' },
          { id: 'audio', label: 'Audio', icon: 'volume' },
          { id: 'gameplay', label: 'Gameplay', icon: 'eye' },
          { id: 'freeplay', label: 'Free Play', icon: 'sandbox' },
          { id: 'profile', label: 'Profile', icon: 'user' },
        ]}
      />
      <div className="settings__body">
        {tab === 'graphics' ? (
          <>
            <FieldRow label="Quality preset" hint="Low keeps ≥ 30 fps on integrated GPUs; High adds shadows, ambient occlusion and bloom.">
              <Segmented value={st.quality} options={QUALITY} onChange={(v) => setSetting('quality', v)} ariaLabel="Quality preset" />
            </FieldRow>
            <FieldRow label="Resolution scale" hint="Render resolution on top of the preset.">
              <Slider value={st.resolutionScale} min={0.5} max={1.5} step={0.05} onChange={(v) => setSetting('resolutionScale', v)} format={(v) => `${Math.round(v * 100)}%`} />
            </FieldRow>
            <FieldRow label="Field of view" hint="60–90°, default 75°.">
              <Slider value={st.fov} min={60} max={90} step={1} onChange={(v) => setSetting('fov', v)} format={(v) => `${v}°`} />
            </FieldRow>
            <Toggle label="Show FPS counter" checked={st.showFps} onChange={(v) => setSetting('showFps', v)} />
          </>
        ) : null}
        {tab === 'controls' ? <ControlsSettings /> : null}
        {tab === 'audio' ? (
          <>
            <FieldRow label="Master volume">
              <Slider value={st.masterVolume} min={0} max={1} onChange={(v) => setVolume('masterVolume', v)} format={pct} />
            </FieldRow>
            <FieldRow label="Effects" hint="Steppers, solenoids, relays, sparks.">
              <Slider value={st.sfxVolume} min={0} max={1} onChange={(v) => setVolume('sfxVolume', v)} format={pct} />
            </FieldRow>
            <FieldRow label="Ambience" hint="Rack fans, GPU blade hum, room tone.">
              <Slider value={st.ambienceVolume} min={0} max={1} onChange={(v) => setVolume('ambienceVolume', v)} format={pct} />
            </FieldRow>
            <FieldRow label="Interface">
              <Slider value={st.uiVolume} min={0} max={1} onChange={(v) => setVolume('uiVolume', v)} format={pct} />
            </FieldRow>
            <FieldRow label="Voice blips" hint="Mentor and robot speech blips.">
              <Slider value={st.voiceVolume} min={0} max={1} onChange={(v) => setVolume('voiceVolume', v)} format={pct} disabled={!st.voiceBlips} />
            </FieldRow>
            <Toggle label="Play voice blips" checked={st.voiceBlips} onChange={(v) => setSetting('voiceBlips', v)} />
          </>
        ) : null}
        {tab === 'gameplay' ? <GameplaySettings /> : null}
        {tab === 'freeplay' ? (
          <>
            <FieldRow label="Default time scale" hint="1 real second = N game seconds. Orca pings every 5 game minutes.">
              <Segmented value={st.freeplayTimeScale} options={[1, 2, 5, 10].map((v) => ({ value: v, label: `${v}×` }))} onChange={(v) => setSetting('freeplayTimeScale', v)} />
            </FieldRow>
            <Toggle label="Penalties" hint="Off by default; Teach Cards still fire." checked={st.freeplayPenalties} onChange={(v) => setSetting('freeplayPenalties', v)} />
            <Toggle label="Background pipelines (PL1–PL8)" checked={st.freeplayPipelines} onChange={(v) => setSetting('freeplayPipelines', v)} />
            <FieldRow label="Random faults" hint="Only incidents you have been taught.">
              <Segmented
                value={st.freeplayRandomFaults}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: '3min', label: 'Every 3 min' },
                  { value: '90s', label: 'Every 90 s' },
                ]}
                onChange={(v) => setSetting('freeplayRandomFaults', v)}
              />
            </FieldRow>
          </>
        ) : null}
        {tab === 'profile' ? <ProfileSettings /> : null}
      </div>
    </div>
  );
}

/** Actions the UI handles itself (and can therefore rebind). Movement/interact keys are fixed by the engine. */
const REBINDABLE: ControlAction[] = ['notebook', 'tickets', 'hint', 'fastForward', 'controlsOverlay', 'sandboxPanel', 'debug', 'toolMode', 'holster', 'flashlight', 'hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5'];

/** Keys the 3D controller and the global navigation own; never assignable to a UI action. */
const RESERVED_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'Space', 'KeyE', 'KeyG', 'Escape', 'Enter', 'NumpadEnter', 'Backspace', 'MetaLeft', 'MetaRight']);

function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/(Left|Right)$/, '');
}

function actionLabel(a: ControlAction): string {
  for (const g of CONTROL_GROUPS) for (const r of g.rows) if (r.action === a) return r.label;
  if (a.startsWith('hotbar')) return `Hotbar slot ${a.slice(6)}`;
  return a;
}

function ControlsSettings() {
  const st = useGame((s) => s.progress.settings);
  const [listening, setListening] = useState<ControlAction | null>(null);
  const [bindNote, setBindNote] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setListening(null);
        setBindNote(null);
        return;
      }
      const code = e.code;
      if (RESERVED_CODES.has(code)) {
        // Keep listening: movement / interaction keys belong to the 3D controller.
        setBindNote(`${keyLabel(code)} is used for movement or interaction — pick another key.`);
        return;
      }
      const bindings = store.getState().progress.settings.bindings;
      const current = bindings[listening] ?? DEFAULT_BINDINGS[listening];
      const clash = REBINDABLE.find((a) => a !== listening && (bindings[a] ?? DEFAULT_BINDINGS[a]) === code);
      mutate((s) => {
        s.progress.settings.bindings[listening] = code;
        // Two actions on one key would make one of them unreachable: swap instead.
        if (clash) s.progress.settings.bindings[clash] = current;
      });
      setBindNote(clash ? `Swapped with “${actionLabel(clash)}” (now ${keyLabel(current)}).` : null);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [listening]);

  return (
    <>
      <FieldRow label="Mouse sensitivity">
        <Slider value={st.mouseSensitivity} min={0.2} max={3} step={0.05} onChange={(v) => setSetting('mouseSensitivity', v)} format={(v) => `${v.toFixed(2)}×`} />
      </FieldRow>
      <Toggle label="Invert Y" checked={st.invertY} onChange={(v) => setSetting('invertY', v)} />
      <div className="settings__bindings">
        <div className="settings__bindings-head">
          <span className="caps">Key bindings</span>
          <Button size="sm" variant="ghost" onClick={() => setSetting('bindings', {})}>
            Reset to defaults
          </Button>
        </div>
        <p className="muted settings__note">Movement (WASD, Shift, C, Space) and the interaction keys E / F / R / G / Q follow the 3D controller.</p>
        {bindNote ? <p className="settings__note settings__note--warn" role="status">{bindNote}</p> : null}
        {REBINDABLE.map((a) => {
          const code = st.bindings[a] ?? DEFAULT_BINDINGS[a];
          return (
            <div key={a} className="settings__binding">
              <span className="grow">{actionLabel(a)}</span>
              {listening === a ? <span className="settings__listening">Press a key… (Esc cancels)</span> : <Kbd k={code} />}
              <Button size="sm" variant="subtle" onClick={() => setListening(a)}>
                Rebind
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function GameplaySettings() {
  const st = useGame((s) => s.progress.settings);
  const realism = useGame((s) => s.progress.realism);
  const setRealism = (r: 'standard' | 'strict') => {
    if (hasMission('setRealism')) ma('setRealism', r);
    else
      mutate((s) => {
        s.progress.realism = r;
      });
  };
  return (
    <>
      <FieldRow
        label="Realism"
        hint={realism === 'strict' ? 'Strict = “Real Lab”: no markers, history-only terminal, Arcade hints tier 1 only, robot quips off, XP ×1.25.' : 'Standard: markers, terminal tab-completion, full hint ladder.'}
      >
        <Segmented
          value={realism}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'strict', label: 'Strict' },
          ]}
          onChange={setRealism}
        />
      </FieldRow>
      <FieldRow label="Academy guidance" hint="Floor markers, arrows and highlights during lessons.">
        <Segmented
          value={st.guidance}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'light', label: 'Light' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) => setSetting('guidance', v)}
        />
      </FieldRow>
      <Toggle label="Subtitles" hint="Mentor and coworker barks as captions." checked={st.subtitles} onChange={(v) => setSetting('subtitles', v)} />
      <FieldRow label="Subtitle size">
        <Segmented
          value={st.subtitleSize}
          options={[
            { value: 'small', label: 'S' },
            { value: 'medium', label: 'M' },
            { value: 'large', label: 'L' },
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
      <Toggle label="Reduce motion" hint="No camera shake, nudges or confetti; instant transitions." checked={st.reducedMotion} onChange={(v) => setSetting('reducedMotion', v)} />
      <Toggle label="Robot personality quips" hint="Always off in Strict realism." checked={st.quipsEnabled} onChange={(v) => setSetting('quipsEnabled', v)} disabled={realism === 'strict'} />
    </>
  );
}

function ProfileSettings() {
  const name = useGame((s) => s.progress.playerName);
  const [draft, setDraft] = useState(name);
  const [confirm, setConfirm] = useState(false);
  const saveName = () => {
    const n = draft.trim().slice(0, 16);
    if (!n) return;
    if (hasMission('setPlayerName')) ma('setPlayerName', n);
    else
      mutate((s) => {
        s.progress.playerName = n;
      });
    pushToast({ kind: 'success', title: 'Name saved', body: n });
  };
  return (
    <>
      <FieldRow label="Your name" hint="Shown on your lanyard and local leaderboards (max 16 characters).">
        <div className="row">
          <TextField value={draft} onChange={setDraft} maxLength={16} onEnter={saveName} ariaLabel="Player name" />
          <Button onClick={saveName} disabled={!draft.trim() || draft.trim() === name}>
            Save
          </Button>
        </div>
      </FieldRow>
      <FieldRow label="Restore default settings" hint="Graphics, audio, controls and accessibility.">
        <Button
          onClick={() =>
            mutate((s) => {
              s.progress.settings = { ...DEFAULT_SETTINGS, bindings: {} };
            })
          }
        >
          Restore defaults
        </Button>
      </FieldRow>
      <div className="settings__danger">
        <div>
          <div className="settings__danger-title">Reset all progress</div>
          <div className="muted">XP, rank, module stars, flashcards, achievements, shift history and certifications. Settings are kept. This cannot be undone.</div>
        </div>
        {confirm ? (
          <div className="row">
            <Button
              variant="danger"
              onClick={() => {
                clearProgress();
                mutate((s) => {
                  const settings = s.progress.settings;
                  s.progress = createDefaultProgress();
                  s.progress.settings = settings;
                });
                setConfirm(false);
                pushToast({ kind: 'warning', title: 'Progress reset', body: 'Welcome back, new hire.' });
              }}
            >
              Yes, erase everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Reset progress…
          </Button>
        )}
      </div>
    </>
  );
}

export function SettingsOverlay() {
  return (
    <Modal width={820} onClose={() => closeOverlay()} labelledBy="settings-title" backdrop="blur" className="settings-modal">
      <div className="ov-head">
        <h2 id="settings-title">Settings</h2>
      </div>
      <SettingsPanel />
    </Modal>
  );
}
