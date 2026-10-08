/**
 * Briefing (`briefing` overlay; pausing): Academy module brief (mentor, objectives, setup, est. time)
 * or a shift brief (length, heat cap, seed, realism, rules). "Start" closes it and returns to the lab.
 */
import { useGame } from '@/core/store';
import { MODULES_BY_ID, personName, teamMember } from '@/content';
import { Avatar, Button, Chip, Icon, Kbd } from '@/ui/kit';
import { closeOverlay } from '@/ui/services/nav';
import { mmss, estLabel } from '@/ui/services/format';
import { HEAT_LABELS } from '@/ui/data/catalog';

export function Briefing() {
  const mode = useGame((s) => s.session.mode);
  const activityId = useGame((s) => s.session.activityId);
  const shift = useGame((s) => s.session.shift);
  const realism = useGame((s) => s.session.realism);
  const meta = mode === 'academy' && activityId ? MODULES_BY_ID[activityId] : null;
  const start = () => closeOverlay({ lock: true });

  return (
    <div className="briefing" data-ui-interactive>
      <div className="briefing__panel">
        {meta ? (
          <>
            <div className="briefing__eyebrow">
              Academy · <span className="mono">{meta.id}</span>
            </div>
            <h1 className="briefing__title">{meta.title}</h1>
            <div className="briefing__mentor">
              <Avatar name={personName(meta.mentor)} color={teamMember(meta.mentor)?.color ?? '#43b02a'} size={40} ring />
              <div>
                <div className="briefing__mentor-name">{personName(meta.mentor)}</div>
                <div className="muted">{teamMember(meta.mentor)?.role}</div>
              </div>
              <span className="spacer" />
              <Chip icon="clock">{estLabel(meta)}</Chip>
            </div>
            <div className="caps">You will learn to</div>
            <ul className="briefing__list">
              {meta.objectives.map((o, i) => (
                <li key={i}>
                  <Icon name="target" size={14} /> {o}
                </li>
              ))}
            </ul>
            {meta.setup ? <p className="muted briefing__setup">{meta.setup}</p> : null}
          </>
        ) : shift ? (
          <>
            <div className="briefing__eyebrow">Arcade · {shift.kind === 'daily' ? 'Daily Challenge' : shift.kind === 'certification' ? 'Certification practical' : 'Shift'}</div>
            <h1 className="briefing__title">{shift.lengthMinutes}-minute shift</h1>
            <div className="briefing__facts">
              <Chip icon="clock">{mmss(shift.durationS)} real time</Chip>
              <Chip icon="heat">Heat cap H{shift.heatCap} · {HEAT_LABELS[shift.heatCap]}</Chip>
              <Chip icon="dice">
                Seed <span className="mono">{shift.seed}</span>
              </Chip>
              <Chip tone={realism === 'strict' ? 'red' : 'grey'}>{realism === 'strict' ? 'Strict realism' : 'Standard realism'}</Chip>
              {shift.wildcard ? <Chip tone="violet">Wildcard ×1.2</Chip> : null}
              {shift.ranked ? <Chip tone="gold">Ranked</Chip> : null}
            </div>
            <ul className="briefing__list">
              <li>
                <Icon name="refresh" size={14} /> Orca pings every Pi every 5 game minutes — one health check per real minute at 5×. Fixes show in Orca only after the next ping.
              </li>
              <li>
                <Icon name="ticket" size={14} /> Ack tickets fast (<Kbd k="T" size="sm" />, Enter). Call the root cause from the evidence before you fix.
              </li>
              <li>
                <Icon name="escalate" size={14} /> Hardware Connection Failed? Escalate to {personName('jared')} with the exact endpoint — or fix it hands-on.
              </li>
              <li>
                <Icon name="pipeline" size={14} /> Keep rigs Available: pipelines check out a rig every 30 s.
              </li>
              {shift.rules.strikesToEnd ? (
                <li>
                  <Icon name="alert" size={14} /> {shift.rules.strikesToEnd} strikes end the shift (fried hardware, tampering, masking failures, driving a coworker’s device).
                </li>
              ) : null}
            </ul>
          </>
        ) : (
          <>
            <div className="briefing__eyebrow">Briefing</div>
            <h1 className="briefing__title">Ready when you are</h1>
          </>
        )}
        <div className="briefing__actions">
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={start} autoFocus>
            {shift ? 'Start shift' : 'Start'}
          </Button>
        </div>
      </div>
    </div>
  );
}
