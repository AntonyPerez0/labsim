/** DR17 Lab Lore — rapid-fire trivia cards with a category stamp. */
import type { DrillComponentProps } from '../../types';
import { McqView } from '../common/McqView';
import './style.css';

export function View(props: DrillComponentProps) {
  return <McqView props={props} className="dr17" eyebrow={(d) => <span className="dr17-cat">{d.category ?? 'Lore'}</span>} optionTone={() => '#34d6c0'} />;
}
