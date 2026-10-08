/**
 * HUD ticket queue (GP §2.3.4, §5.2): cards slide in from the right; LAB-#### · reporter · title ·
 * rig · severity · SLA bar (green → amber → red → breach) · state. Click / `T` opens the drawer.
 */
import type { CSSProperties } from 'react';
import { useGame } from '@/core/store';
import type { TicketState } from '@/core/state';
import { teamMember } from '@/content';
import { Icon, Kbd } from '@/ui/kit';
import { mmss } from '@/ui/services/format';
import { ma, hasMission } from '@/ui/services/missions';
import { openOverlay } from '@/ui/services/nav';
import { mutate } from '@/core/store';

export function isTicketOpen(t: TicketState): boolean {
  return t.status !== 'resolved' && t.status !== 'handover' && t.status !== 'failed';
}

export const STATUS_LABEL: Record<TicketState['status'], string> = {
  new: 'New',
  acked: 'Acked',
  'in-progress': 'In progress',
  escalated: 'Escalated',
  verifying: 'Verifying',
  resolved: 'Resolved',
  handover: 'Handover',
  failed: 'Closed',
};

export function slaFraction(t: TicketState): number {
  return t.slaS > 0 ? Math.max(0, Math.min(1, t.slaSecondsLeft / t.slaS)) : 0;
}

export function reporterName(key: string): string {
  return teamMember(key)?.name ?? key;
}

/** Open the ticket drawer on a ticket (ack + focus through the runtime when available). */
export function openTicketPanel(ticketId: string | null): void {
  if (ticketId) {
    if (hasMission('openTicket')) ma('openTicket', ticketId);
    else
      mutate((s) => {
        s.ui.selectedTicketId = ticketId;
      });
  }
  openOverlay({ kind: 'tickets', ticketId: ticketId ?? undefined, panel: ticketId ? 'detail' : 'list' }, { push: true });
}

export function TicketCard({ t, selected, compact, onClick, style }: { t: TicketState; selected?: boolean; compact?: boolean; onClick?: () => void; style?: CSSProperties }) {
  const frac = slaFraction(t);
  const band = t.breached ? 'breached' : t.sla;
  const open = isTicketOpen(t);
  return (
    <button
      type="button"
      className={`hud-ticket hud-ticket--${t.severity.toLowerCase()} hud-ticket--${band}${selected ? ' is-selected' : ''}${t.status === 'new' ? ' is-new' : ''}${open ? '' : ' is-closed'}${compact ? ' is-compact' : ''}`}
      onClick={onClick}
      style={style}
    >
      {t.notYetTaught ? <span className="hud-ticket__ribbon">Not yet taught</span> : null}
      <div className="hud-ticket__top">
        <span className={`hud-sev hud-sev--${t.severity.toLowerCase()}`}>{t.severity}</span>
        <span className="hud-ticket__id mono">{t.id}</span>
        <span className="spacer" />
        {t.status === 'new' ? <span className="hud-ticket__new">NEW</span> : <span className={`hud-ticket__state hud-ticket__state--${t.status}`}>{STATUS_LABEL[t.status]}</span>}
      </div>
      <div className="hud-ticket__title">{t.title}</div>
      {!compact ? (
        <div className="hud-ticket__meta">
          {t.binding.hrn ?? t.robotId ? (
            <span className="hud-ticket__rig mono">
              <Icon name="robot" size={11} /> {t.binding.hrn ?? t.robotId?.toUpperCase()}
            </span>
          ) : null}
          <span className="hud-ticket__reporter">{reporterName(t.reporter)}</span>
          {t.plannedWork ? <span className="hud-ticket__planned">Planned work</span> : null}
        </div>
      ) : null}
      {open ? (
        <div className="hud-ticket__sla">
          <div className="hud-ticket__slabar">
            <span style={{ width: `${frac * 100}%` }} />
          </div>
          <span className="hud-ticket__slatime tnum">{t.breached ? `+${mmss(-t.slaSecondsLeft)}` : mmss(t.slaSecondsLeft)}</span>
        </div>
      ) : t.status === 'resolved' ? (
        <div className="hud-ticket__resolved tnum">
          <Icon name="check" size={12} stroke={2.6} /> +{t.points}
        </div>
      ) : null}
      {t.verifying ? <div className="hud-ticket__verifying">{t.verifying.label}</div> : null}
    </button>
  );
}

export function TicketQueue() {
  const tickets = useGame((s) => s.session.tickets);
  const selected = useGame((s) => s.ui.selectedTicketId);
  const clockS = useGame((s) => Math.floor(s.session.clockS));
  const visible = tickets.filter((t) => isTicketOpen(t) || (t.resolvedAtS !== null && clockS - t.resolvedAtS < 6));
  if (!visible.length) return null;
  const openCount = tickets.filter(isTicketOpen).length;
  return (
    <section className="hud-queue" aria-label="Ticket queue">
      <header className="hud-queue__head">
        <Icon name="ticket" size={14} />
        <span>Tickets</span>
        <span className="hud-queue__count tnum">{openCount}</span>
        <span className="spacer" />
        <Kbd k="T" size="sm" />
      </header>
      <div className="hud-queue__list">
        {visible.slice(0, 6).map((t) => (
          <TicketCard key={t.id} t={t} selected={t.id === selected} onClick={() => openTicketPanel(t.id)} />
        ))}
        {visible.length > 6 ? <div className="hud-queue__more">+{visible.length - 6} more</div> : null}
      </div>
    </section>
  );
}
