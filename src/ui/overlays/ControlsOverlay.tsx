/**
 * Controls overlay (`F1`, GP §6.3): every action with its current binding (defaults merged with
 * `settings.bindings`), grouped. Rebinding lives in Settings → Controls.
 */
import { useGame } from '@/core/store';
import { DEFAULT_BINDINGS, type ControlAction } from '@/core/state';
import { Kbd, Modal, SectionTitle } from '@/ui/kit';
import { closeOverlay } from '@/ui/services/nav';

export const CONTROL_GROUPS: { title: string; rows: { action?: ControlAction; keys?: string[]; label: string; note?: string }[] }[] = [
  {
    title: 'Move & look',
    rows: [
      { keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], label: 'Move', note: '1.4 m/s — no running in the lab' },
      { action: 'walkFast', label: 'Walk fast (hold)', note: '2.4 m/s' },
      { action: 'crouch', label: 'Crouch', note: 'Under-shelf Pis, fuses, lower panels' },
      { keys: ['Mouse'], label: 'Look', note: 'Click the view to capture the mouse' },
    ],
  },
  {
    title: 'Interact',
    rows: [
      { action: 'interact', label: 'Interact / continue', note: 'Left click works too · Space or click advances dialogue' },
      { keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], label: 'Dialogue choices' },
      { keys: ['Mouse'], label: 'Inspect', note: 'Rest the crosshair on a tablet, label, LED or panel for a moment' },
      { action: 'useTool', label: 'Use held tool', note: 'Probe, screw, insert, swipe (or E)' },
      { action: 'toolMode', label: 'Tool mode', note: 'Meter V⎓ / V~ / Ω / continuity · fuse rating · Visa / Interac' },
      { keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'], label: 'Hotbar', note: 'Screwdriver · multimeter · spare fuse · Ethernet cable · test card' },
      { action: 'holster', label: 'Holster / set down' },
      { action: 'flashlight', label: 'Head torch' },
    ],
  },
  {
    title: 'Panels',
    rows: [
      { action: 'notebook', label: 'Notebook', note: 'Notes, evidence log, checklist; Field Manual from the menu' },
      { action: 'tickets', label: 'Ticket board', note: 'Shift & Weak Spot — J works too' },
      { action: 'hint', label: 'Hint', note: 'Academy ladder · Arcade Nudge → Pointer → Walkthrough' },
      { action: 'pause', label: 'Pause / close', note: 'At the workstation the first Esc stands up' },
      { action: 'fastForward', label: 'Fast-forward ×30 (hold)', note: 'Free Play' },
      { action: 'sandboxPanel', label: 'Sandbox panel', note: 'Free Play' },
      { action: 'controlsOverlay', label: 'This overlay' },
      { action: 'debug', label: 'Debug overlay' },
    ],
  },
];

export function ControlsOverlay() {
  const bindings = useGame((s) => s.progress.settings.bindings);
  return (
    <Modal width={860} onClose={() => closeOverlay({ lock: true })} labelledBy="controls-title" backdrop="blur" closeOnBackdrop>
      <div className="ov-head">
        <h2 id="controls-title">Controls</h2>
        <span className="muted">Rebind keys in Settings → Controls.</span>
      </div>
      <div className="controls-grid">
        {CONTROL_GROUPS.map((g) => (
          <section key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <dl className="controls-list">
              {g.rows.map((r) => {
                const keys = r.action ? [bindings[r.action] ?? DEFAULT_BINDINGS[r.action]] : (r.keys ?? []);
                return (
                  <div key={r.label} className="controls-row">
                    <dt>
                      {keys.map((k) => (
                        <Kbd key={k} k={k} size="sm" />
                      ))}
                    </dt>
                    <dd>
                      <div>{r.label}</div>
                      {r.note ? <div className="muted">{r.note}</div> : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
