/** DR12 Entity Atlas — "Where does X live?" A data chip, four entity/field destinations. */
import type { DrillComponentProps } from '../../types';
import { McqView } from '../common/McqView';
import { Rich } from '../common/ui';
import './style.css';

const ICON: Record<string, string> = { Cards: 'CRD', Screens: 'SCR', Merchants: 'MER', Robot: 'BOT', Devices: 'DEV', Capabilities: '{ }' };

export function View(props: DrillComponentProps) {
  return (
    <McqView
      props={props}
      className="dr12"
      eyebrow={(d) => <>Where does this live? · {d.category}</>}
      renderPrompt={(d) => (
        <div className="dr12-chip">
          <span className="dr12-chip__icon">{ICON[d.category ?? ''] ?? '◆'}</span>
          <span className="dr12-chip__text">
            <Rich text={d.prompt} />
          </span>
        </div>
      )}
      optionTone={() => '#7b8cff'}
    />
  );
}
