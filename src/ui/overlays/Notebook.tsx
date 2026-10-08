/**
 * Notebook (`Tab`, GP §2.6; non-pausing side drawer): personal notes, auto-captured evidence
 * ("Notes: connect timed out after 10000 ms @ 08:15 — EVE") with pinning, the current checklist,
 * the Lab Safety Card (Cur M01 step 13, illustrative wording) and a link into the Field Manual.
 */
import { useEffect, useRef, useState } from 'react';
import { mutate, useGame } from '@/core/store';
import type { EvidenceEntry } from '@/core/state';
import { personName } from '@/content';
import { Button, EmptyState, Icon, IllustrativeBadge, Kbd, Tabs } from '@/ui/kit';
import { hasMission, ma } from '@/ui/services/missions';
import { closeOverlay, openOverlay } from '@/ui/services/nav';
import { gameClock } from '@/ui/services/format';

type Tab = 'notes' | 'evidence' | 'checklist' | 'safety';

const SOURCE_LABEL: Record<string, string> = {
  orca: 'Orca',
  notes: 'Notes',
  jenkins: 'Jenkins',
  tablet: 'Tablet',
  led: 'LED',
  camera: 'Camera',
  terminal: 'Terminal',
  world: 'Lab',
  labchat: 'LabChat',
  ide: 'IDE',
  github: 'GitHub',
  gimp: 'GIMP',
  ollama: 'Ollama',
  meter: 'Meter',
  hud: 'HUD',
};

export function Notebook({ tab: initial }: { tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial ?? 'evidence');
  const evidence = useGame((s) => s.session.notebook.evidence);
  const checklist = useGame((s) => s.session.notebook.checklist);
  return (
    <aside className="notebook" data-ui-interactive>
      <header className="notebook__head">
        <Icon name="book" size={16} />
        <div className="grow">
          <div className="notebook__title">Notebook</div>
          <div className="notebook__sub">The lab keeps running while this is open</div>
        </div>
        <Button size="sm" variant="ghost" icon="x" aria-label="Close (Tab)" onClick={() => closeOverlay({ lock: true })} />
      </header>
      <Tabs<Tab>
        size="sm"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'evidence', label: 'Evidence', badge: evidence.length || undefined },
          { id: 'notes', label: 'Notes' },
          { id: 'checklist', label: 'Checklist', badge: checklist.filter((c) => !c.done).length || undefined },
          { id: 'safety', label: 'Safety card' },
        ]}
      />
      <div className="notebook__body">
        {tab === 'notes' ? <Notes /> : null}
        {tab === 'evidence' ? <Evidence entries={evidence} /> : null}
        {tab === 'checklist' ? (
          checklist.length ? (
            <ul className="notebook__checklist">
              {checklist.map((c) => (
                <li key={c.id} className={c.done ? 'is-done' : ''}>
                  <span className="hud-obj__box">{c.done ? <Icon name="check" size={12} stroke={3} /> : null}</span>
                  {c.text}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="list" title="No checklist right now">Ticket and lesson checklists appear here.</EmptyState>
          )
        ) : null}
        {tab === 'safety' ? (
          <div className="safety-card">
            <div className="safety-card__head">
              LAB SAFETY CARD <IllustrativeBadge compact />
            </div>
            <ol>
              <li>Never touch a robot while a test is running.</li>
              <li>If you move an arm by hand, Park All before you walk away.</li>
              <li>LabSim terminals and Collis probes go on the AC power strips — never the DC rails.</li>
              <li>Broken rig? Tell {personName('jared')}.</li>
            </ol>
            <div className="muted">The card’s wording is invented for the sim; each rule restates a reference fact.</div>
          </div>
        ) : null}
      </div>
      <footer className="notebook__foot">
        <Button size="sm" icon="book" onClick={() => openOverlay({ kind: 'manual' }, { push: true })}>
          Open Field Manual
        </Button>
        <span className="spacer" />
        <Kbd k="Tab" size="sm" /> close
      </footer>
    </aside>
  );
}

function Notes() {
  const notes = useGame((s) => s.progress.notebook.notes);
  const [draft, setDraft] = useState(notes);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const save = (text: string) => {
    if (hasMission('setNotes')) ma('setNotes', text);
    else
      mutate((s) => {
        s.progress.notebook.notes = text;
      });
  };
  return (
    <textarea
      className="notebook__notes"
      value={draft}
      placeholder={'Your notes — saved automatically.\n\ne.g. WALL-E Pi = 10.42.10.11 · ADB on 5444 · theme=avocado'}
      spellCheck={false}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save(v), 500);
      }}
      onBlur={() => save(draft)}
    />
  );
}

function Evidence({ entries }: { entries: EvidenceEntry[] }) {
  const pinned = useGame((s) => s.progress.notebook.pinnedEvidence);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const all = [...pinned.filter((p) => !entries.some((e) => e.id === p.id)), ...entries.slice().reverse()];
  if (!all.length) {
    return (
      <EmptyState icon="search" title="No evidence yet">
        Evidence is captured automatically as you read Orca Notes, Jenkins consoles, tablets, LEDs and meter readings.
      </EmptyState>
    );
  }
  return (
    <ul className="notebook__evidence">
      {all.map((e) => {
        const isPinned = pinnedIds.has(e.id);
        return (
          <li key={e.id} className={isPinned ? 'is-pinned' : ''}>
            <span className={`ev-src ev-src--${e.source}`}>{SOURCE_LABEL[e.source] ?? e.source}</span>
            <div className="grow">
              <div className="notebook__ev-text">{e.text}</div>
              <div className="dim mono">
                @ {gameClock(e.atGameMs)}
                {e.rig ? ` — ${e.rig.toUpperCase()}` : ''}
                {e.ticketId ? ` · ${e.ticketId}` : ''}
              </div>
            </div>
            <button type="button" className={`notebook__pin${isPinned ? ' is-on' : ''}`} title={isPinned ? 'Unpin' : 'Pin (kept across sessions)'} onClick={() => ma('pinEvidence', e.id, !isPinned)}>
              <Icon name="bookmark" size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
