/**
 * Pause menu (`Esc`): Resume · Settings · Field Manual · Controls · Restart step / module (Academy,
 * GP §2.2.1) · Restart · Call it a day (Shift) · Quit to menu. The sim clock, shift clock, SLAs and
 * hint timers are frozen while it is open.
 */
import { useState } from 'react';
import { mutate, useGame } from '@/core/store';
import { createDefaultSession } from '@/core/state';
import { MODULES_BY_ID } from '@/content';
import { Button, LabWordmark, Kbd } from '@/ui/kit';
import { hasMission, ma } from '@/ui/services/missions';
import { goMenu, openOverlay, resumeFromPause, setExploring } from '@/ui/services/nav';
import { shortTitle } from '@/ui/services/format';

/** Leave the current activity for the main menu (runtime `quit`, or a local reset when it is missing). */
export function quitToMenu(): void {
  if (hasMission('quit')) {
    ma('quit');
    return;
  }
  setExploring(false);
  mutate((s) => {
    s.session = createDefaultSession(s.progress.realism);
  });
  goMenu('home');
}

const MODE_TITLE: Record<string, string> = {
  academy: 'Academy',
  'arcade-shift': 'Arcade Shift',
  'arcade-drill': 'Drill',
  freeplay: 'Free Play',
  'arcade-weakspot': 'Weak Spot',
  certification: 'Certification',
  menu: 'Lab',
};

export function PauseMenu() {
  const mode = useGame((s) => s.session.mode);
  const activityId = useGame((s) => s.session.activityId);
  const academy = useGame((s) => s.session.academy);
  const shift = useGame((s) => s.session.shift);
  const ranked = useGame((s) => s.session.shift?.ranked ?? false);
  const [confirm, setConfirm] = useState<null | 'quit' | 'restart' | 'restart-module' | 'end'>(null);

  const meta = mode === 'academy' && activityId ? MODULES_BY_ID[activityId] : null;
  const subtitle = meta ? `${meta.id} · ${shortTitle(meta.title)}${academy ? ` · step ${academy.stepIndex + 1}` : ''}` : (shift?.configId ?? activityId ?? '');

  return (
    <div className="pause" data-ui-interactive>
      <div className="pause__panel">
        <div className="pause__brand">
          <LabWordmark size={26} />
          <div>
            <div className="pause__title">Paused</div>
            <div className="pause__sub">
              {MODE_TITLE[mode] ?? mode}
              {subtitle ? ` · ${subtitle}` : ''}
            </div>
          </div>
        </div>
        {confirm ? (
          <div className="pause__confirm">
            <p>
              {confirm === 'quit'
                ? ranked
                  ? 'Quit the ranked Daily? Your current score is submitted as your one ranked attempt today.'
                  : mode === 'arcade-shift'
                    ? 'Abandon this shift? It is recorded as abandoned and earns no grade.'
                    : 'Quit to the main menu? Academy progress is kept at the last step checkpoint.'
                : confirm === 'end'
                  ? 'Call it a day? Open tickets become handover debt (−50 each) and the shift is graded now.'
                  : confirm === 'restart-module'
                    ? 'Restart this module from step 1? Progress through its steps is lost.'
                    : 'Restart from the beginning with the same seed?'}
            </p>
            <div className="row">
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm === 'quit') quitToMenu();
                  else if (confirm === 'end') ma('endShift');
                  else if (confirm === 'restart-module') ma('restartModule');
                  else ma('restart');
                  setConfirm(null);
                }}
              >
                {confirm === 'quit' ? 'Quit' : confirm === 'end' ? 'End shift' : confirm === 'restart-module' ? 'Restart module' : 'Restart'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <nav className="pause__menu">
            <Button variant="primary" size="lg" icon="play" kbd="Esc" block onClick={resumeFromPause} autoFocus>
              Resume
            </Button>
            {academy ? (
              <div className="pause__pair">
                <Button icon="refresh" block onClick={() => ma('restartStep')}>
                  Restart step
                </Button>
                <Button icon="refresh" block onClick={() => setConfirm('restart-module')}>
                  Restart module
                </Button>
              </div>
            ) : mode !== 'menu' && mode !== 'freeplay' ? (
              <Button icon="refresh" block onClick={() => setConfirm('restart')}>
                Restart
              </Button>
            ) : null}
            {shift && shift.phase === 'running' ? (
              <Button icon="coffee" block onClick={() => setConfirm('end')}>
                Call it a day
              </Button>
            ) : null}
            <Button icon="book" block onClick={() => openOverlay({ kind: 'manual' }, { push: true })}>
              Field Manual
            </Button>
            <Button icon="settings" block onClick={() => openOverlay({ kind: 'settings' }, { push: true })}>
              Settings
            </Button>
            <Button icon="keyboard" kbd="F1" block onClick={() => openOverlay({ kind: 'controls' }, { push: true })}>
              Controls
            </Button>
            <Button variant="ghost" icon="logout" block onClick={() => setConfirm('quit')}>
              Quit to menu
            </Button>
          </nav>
        )}
        <div className="pause__foot">
          <Kbd k="Esc" size="sm" /> resume · the lab clock is frozen
        </div>
      </div>
    </div>
  );
}
