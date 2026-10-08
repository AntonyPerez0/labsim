/**
 * Board minigame panel shown by the inspect overlay for board props (whiteboard, roadmap, history
 * match, bolt bins). Reports `minigame.completed` to the lesson runtime when the board is solved.
 */
import { useRef } from 'react';
import { emit } from '@/core/store';
import { Icon, Modal, kitSound } from '@/ui/kit';
import { closeOverlay } from '@/ui/services/nav';
import type { BoardDef, Grade } from './boards';
import { DiagramBoard } from './DiagramBoard';
import { SortBoard } from './SortBoard';

export function reportMinigame(id: string, g: Grade, mistakes: number): void {
  emit('app.action', { app: 'world', action: 'minigame.completed', data: { id, correct: g.correct, total: g.total, mistakes } });
}

export function MinigamePanel({ def }: { def: BoardDef }) {
  const reported = useRef(false);
  const solved = (g: Grade, mistakes: number) => {
    if (reported.current) return;
    reported.current = true;
    kitSound('ui-success');
    reportMinigame(def.id, g, mistakes);
  };
  const wide = def.kind === 'diagram' ? 880 : def.id === 'history-match' || def.id === 'roadmap-sort' ? 900 : 640;
  return (
    <Modal width={wide} onClose={() => closeOverlay({ lock: true })} backdrop="dim" className="mg-modal">
      <div className="ov-head">
        <Icon name={def.kind === 'diagram' ? 'layers' : def.id === 'bolt-sort' ? 'wrench' : 'grid'} size={16} />
        <h2>{def.title}</h2>
      </div>
      <p className="mg-intro">{def.intro}</p>
      {def.kind === 'diagram' ? <DiagramBoard def={def} onSolved={solved} /> : <SortBoard def={def} onSolved={solved} />}
    </Modal>
  );
}
