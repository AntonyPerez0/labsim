/**
 * About & credits: what LabSim is, how accuracy works (illustrative † details), the team roster from
 * `src/content/team.ts` (with the "names are configurable" note) and the technology credits.
 */
import { TEAM_MEMBERS } from '@/content';
import { Avatar, Button, Chip, LabWordmark, IllustrativeBadge } from '@/ui/kit';

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const people = TEAM_MEMBERS.filter((m) => m.kind !== 'system');
  return (
    <div className="menu__page about">
      <div className="about__hero">
        <LabWordmark size={44} className="menu__mark" />
        <div>
          <h1 className="menu__h1">LabSim — LabSim Automation Lab</h1>
          <p className="muted">A first-person training simulator for new automation engineers. Walk the lab, trace power, park robots, read Orca and Jenkins, write page objects — then do it all for real.</p>
        </div>
      </div>
      <div className="about__grid">
        <section className="about__card">
          <div className="caps">How to use it</div>
          <ul className="debrief__list">
            <li>
              <strong>Academy</strong> teaches every topic hands-on, M01 to M18.
            </li>
            <li>
              <strong>Arcade</strong> makes it stick: timed shifts of real incidents, and short drills.
            </li>
            <li>
              <strong>Field Manual</strong> is the searchable reference with spaced-repetition flashcards.
            </li>
            <li>
              <strong>Free Play</strong> is the sandbox: break the lab on purpose, then fix it by the book.
            </li>
          </ul>
        </section>
        <section className="about__card">
          <div className="caps">Accuracy</div>
          <p>
            Everything you are taught agrees with the lab’s reference notes. Where the reference is silent, the sim invents plausible details — host addresses, some job names, exact wording — and marks them <IllustrativeBadge compact /> or <IllustrativeBadge />. Don’t quote those in the real lab.
          </p>
        </section>
        <section className="about__card about__team">
          <div className="caps">The team</div>
          <div className="about__people">
            {people.map((m) => (
              <div key={m.key} className="about__person">
                <Avatar name={m.name} color={m.color} size={34} />
                <div className="grow">
                  <div className="about__name">
                    {m.name} {m.fromReference ? null : <Chip size="sm">invented for the game</Chip>}
                  </div>
                  <div className="muted">{m.role}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="muted about__note">
            Names are configurable: every person in the game comes from one content file (<span className="mono">src/content/team.ts</span>), so they can be renamed or anonymised in one place. In-game text uses names or they/them.
          </p>
        </section>
        <section className="about__card">
          <div className="caps">Built with</div>
          <p>Three.js · React · zustand + immer · postprocessing · n8ao · Vite · TypeScript.</p>
          <p className="muted">Every 3D object is built procedurally in code, every texture is drawn on a canvas, and every sound is synthesised with WebAudio — no models, images or audio files are downloaded. Your progress stays in this browser’s local storage.</p>
        </section>
      </div>
      <Button variant="ghost" icon="arrow-left" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
