/**
 * MagStripe Reader model (Apps §12.1): the tracks each physical desk test card carries, the reader's last swipe
 * (module store shared by the window and the background listener) and the `workstation.cardSwiped` listener
 * started by `initComputer()` — beep, fill the fields, open/focus the window (+ toast) and emit `cardreader.swiped`.
 * Tracks come from the PHYSICAL card (Sim §2.9 VISA_STD_SWIPE canonical tracks), never from the Orca row (GP INC55).
 */
import { createStore, useStore } from 'zustand';
import { bus } from '@/core/bus';
import { emitAppAction, getWindowManager, requestOpenApp, type DeskTestCard } from '../../apps';
import { playSound } from '../../shell/engineBridge';

const T1 = (pan: string, name: string) => `%B${pan}^SIM/${name}^30121010000000000000?`;
const T2 = (pan: string) => `;${pan}=3012101000000000?`;

export interface CardTracks {
  track1: string;
  track2: string;
  track3: string;
}

/** Canonical tracks of the two physical test cards on the desk. */
export const DESK_CARD_TRACKS: Record<DeskTestCard, CardTracks> = {
  'test-card-visa': {
    track1: T1('4111111111111111', 'VISA'),
    track2: T2('4111111111111111'),
    track3: '',
  },
  'test-card-interac': {
    track1: T1('4506440000000017', 'INTERAC'),
    track2: T2('4506440000000017'),
    track3: '',
  },
};

export const DESK_CARD_LABEL: Record<DeskTestCard, string> = {
  'test-card-visa': 'Visa test card (VISA_STD_SWIPE)',
  'test-card-interac': 'Interac test card',
};

export interface ReaderState {
  card: DeskTestCard | null;
  raw: string;
  tracks: CardTracks;
  /** Incremented on every swipe (UI flash). */
  swipes: number;
  status: 'waiting' | 'ok';
}

const EMPTY: CardTracks = { track1: '', track2: '', track3: '' };

export const reader = createStore<ReaderState>()(() => ({
  card: null,
  raw: '',
  tracks: EMPTY,
  swipes: 0,
  status: 'waiting',
}));

export function useReader<T>(sel: (s: ReaderState) => T): T {
  return useStore(reader, sel);
}

export function statusText(s: ReaderState): string {
  if (s.status === 'waiting') return 'Waiting for card swipe…';
  const n = [s.tracks.track1, s.tracks.track2, s.tracks.track3].filter(Boolean).length;
  return `Swipe OK — ${n} track${n === 1 ? '' : 's'} read`;
}

/** What a keyboard-wedge reader "types": the tracks back to back, then Enter. */
export function rawOf(t: CardTracks): string {
  return `${t.track1}${t.track2}${t.track3}\n`;
}

/** Apply a swipe: fill the fields, beep, emit `cardreader.swiped`. */
export function swipe(card: DeskTestCard): void {
  const tracks = DESK_CARD_TRACKS[card];
  reader.setState((s) => ({
    card,
    raw: s.raw + rawOf(tracks),
    tracks,
    swipes: s.swipes + 1,
    status: 'ok',
  }));
  playSound('device-beep');
  emitAppAction('cardreader', 'cardreader.swiped', {
    card,
    track1: tracks.track1,
    track2: tracks.track2,
  });
}

export function clearReader(): void {
  reader.setState({ card: null, raw: '', tracks: EMPTY, status: 'waiting' });
}

/** Background listener (started by `initComputer`): a physical swipe at the desk reader. */
export function startCardReaderListener(): () => void {
  return bus.on('workstation.cardSwiped', ({ card }) => {
    swipe(card);
    const wm = getWindowManager();
    if (!wm) {
      requestOpenApp('cardreader');
      return;
    }
    const open = wm.windows().find((w) => w.app === 'cardreader');
    if (!open || open.minimized || !open.focused) {
      wm.openApp('cardreader');
      if (!open)
        wm.notify({
          app: 'cardreader',
          title: 'MagStripe Reader',
          body: `Card swiped — ${DESK_CARD_LABEL[card]}`,
          kind: 'info',
        });
    }
  });
}
