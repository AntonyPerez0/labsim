// @vitest-environment jsdom
/**
 * MagStripe Reader (Apps §12.1): a physical swipe (`workstation.cardSwiped`) fills the canonical tracks and emits
 * `cardreader.swiped`; Copy Track 1 + 2 writes the desktop clipboard in Orca's format and emits `cardreader.copied`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { emit } from '@/core/store';
import { shell } from '../../shell/wmStore';
import { byText, captureActions, click, makeRoutedHost, mount, type Mounted } from '../../shell/sandbox/testkit';
import { CardReaderApp } from './index';
import { clearReader, startCardReaderListener } from './model';

const VISA = '%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?';

let m: Mounted | null = null;
let stop: (() => void) | null = null;
afterEach(() => {
  m?.unmount();
  m = null;
  stop?.();
  stop = null;
  act(() => clearReader());
});

describe('MagStripe Reader', () => {
  it('a desk swipe fills the canonical Visa tracks and emits cardreader.swiped', async () => {
    const cap = captureActions();
    stop = startCardReaderListener();
    const host = makeRoutedHost(CardReaderApp, '/');
    m = await mount(<host.Host />);
    expect(m.container.textContent).toContain('USB HID MSR (keyboard wedge) — Connected');
    expect(m.container.textContent).toContain('Waiting for card swipe…');
    await act(async () => {
      emit('workstation.cardSwiped', { card: 'test-card-visa' });
    });
    expect(m.container.textContent).toContain('Swipe OK — 2 tracks read');
    const fields = [...m.container.querySelectorAll<HTMLInputElement>('.cr-field')].map((i) => i.value);
    expect(fields).toEqual(['%B4111111111111111^SIM/VISA^30121010000000000000?', ';4111111111111111=3012101000000000?', '']);
    expect(cap.of('cardreader.swiped')[0]).toEqual({
      card: 'test-card-visa',
      track1: '%B4111111111111111^SIM/VISA^30121010000000000000?',
      track2: ';4111111111111111=3012101000000000?',
    });
    await click(m.container.querySelector('[data-hint="cardreader.copyTracks"]'));
    expect(cap.of('cardreader.copied')[0]).toEqual({ field: 'tracks', text: VISA });
    expect(shell.getState().clipboard).toBe(VISA);
    cap.stop();
  });

  it('Simulate swipe ▾ reads the Interac card; Clear empties the fields', async () => {
    const cap = captureActions();
    const host = makeRoutedHost(CardReaderApp, '/');
    m = await mount(<host.Host />);
    await click(byText(m.container, 'button', /Simulate swipe/));
    await click(byText(m.container, '.cr-menu-entry', 'Interac test card'));
    expect(cap.of('cardreader.swiped')[0]?.track2).toBe(';4506440000000017=3012101000000000?');
    await click(byText(m.container, 'button', 'Clear'));
    expect(m.container.textContent).toContain('Waiting for card swipe…');
    expect((m.container.querySelector('.cr-field') as HTMLInputElement).value).toBe('');
    cap.stop();
  });
});
