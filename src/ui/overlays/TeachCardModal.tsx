/**
 * Academy Teach Card (`teach-card` overlay, centre modal; GP §5.5).
 */
import { useGame } from '@/core/store';
import { Icon, Modal } from '@/ui/kit';
import { dismissTeachCard, TeachCardView } from '@/ui/hud/TeachCard';
import { closeOverlay, currentOverlay } from '@/ui/services/nav';

export function TeachCardModal({ teachCardId }: { teachCardId: string }) {
  const card = useGame((s) => s.ui.teachCards.find((c) => c.id === teachCardId) ?? null);
  const close = () => {
    dismissTeachCard(teachCardId);
    if (currentOverlay().kind === 'teach-card') closeOverlay({ lock: true });
  };
  return (
    <Modal width={560} onClose={close} backdrop="dim" className="teach-modal">
      <div className="teach-modal__head">
        <Icon name="hint" size={16} /> Teach Card
      </div>
      {card ? <TeachCardView card={card} id={card.id} masteryChange={card.masteryChange} onGotIt={close} /> : <div className="muted" style={{ padding: 16 }}>This card was already dismissed.</div>}
    </Modal>
  );
}
