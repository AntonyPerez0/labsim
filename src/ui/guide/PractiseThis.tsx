/**
 * "Practise this" block at the end of an Academy module (debrief): the module's flashcard deck, the
 * drills that train it (drills carry the module that unlocks them) and, for the code modules, the
 * workstation exercises (M15/M16 → Parrot Practice, M12–M14/M16 → UIA Practice).
 */
import { useGame } from '@/core/store';
import { MODULES_BY_ID } from '@/content';
import { Button, MedalBadge } from '@/ui/kit';
import { openOverlay } from '@/ui/services/nav';
import { startDrillRun } from '@/ui/services/actions';
import { launchCodePractice } from '@/ui/services/practice';
import { DRILL_CATALOG } from '@/ui/data/catalog';
import { MODULE_PRACTICE } from './curriculum';
import './guide.css';

export function PractiseThis({ moduleId }: { moduleId: string }) {
  const medals = useGame((s) => s.progress.drills);
  const meta = MODULES_BY_ID[moduleId];
  const drills = DRILL_CATALOG.filter((d) => d.unlockedBy.includes(moduleId));
  const code = MODULE_PRACTICE[moduleId] ?? [];
  const deck = meta?.deck ?? null;
  if (!meta || (!drills.length && !code.length && !deck)) return null;
  return (
    <section className="debrief__section practise-this" aria-label="Practise this">
      <div className="caps">Practise this</div>
      <div className="practise-this__list">
        {code.includes('parrot') ? (
          <Button variant="game" icon="terminal" onClick={() => launchCodePractice('parrot')} title="Free Play at your desk with VS Code’s Parrot Practice open">
            Parrot Practice (VS Code)
          </Button>
        ) : null}
        {code.includes('uia') ? (
          <Button variant="game" icon="cpu" onClick={() => launchCodePractice('uia')} title="Free Play at your desk with IntelliJ’s UIA Practice open">
            UIA Practice (IntelliJ)
          </Button>
        ) : null}
        {drills.map((d) => (
          <Button key={d.id} icon="target" onClick={() => startDrillRun(d.id)} title={d.format}>
            {d.id} {d.name}
            {medals[d.id]?.medal ? <MedalBadge medal={medals[d.id]!.medal} size={14} /> : null}
          </Button>
        ))}
        {deck ? (
          <Button icon="cards" onClick={() => openOverlay({ kind: 'flashcards', deck }, { push: true })}>
            {moduleId} flashcards
          </Button>
        ) : null}
      </div>
    </section>
  );
}
