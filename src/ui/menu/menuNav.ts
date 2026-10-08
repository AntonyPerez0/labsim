/**
 * Main-menu screen navigation (`ui.overlay = { kind: 'main-menu', screen }`). Screens form a shallow
 * tree (GP §2.1 menu order); Back / Esc goes to the parent screen.
 */
import { store } from '@/core/store';
import type { MenuScreen } from '@/core/state';
import { goMenu } from '@/ui/services/nav';

const PARENT: Partial<Record<MenuScreen, MenuScreen>> = {
  'new-profile': 'title',
  'quick-setup': 'new-profile',
  academy: 'home',
  arcade: 'home',
  'shift-setup': 'arcade',
  drills: 'arcade',
  daily: 'arcade',
  certification: 'home',
  freeplay: 'home',
  manual: 'home',
  profile: 'home',
  achievements: 'profile',
  leaderboards: 'profile',
  settings: 'home',
};

export function currentMenuScreen(): MenuScreen | null {
  const ov = store.getState().ui.overlay;
  return ov.kind === 'main-menu' ? (ov.screen ?? 'home') : null;
}

export function goScreen(screen: MenuScreen): void {
  goMenu(screen);
}

/** Back one level; returns false when already at the root (home / title). */
export function menuBack(): boolean {
  const cur = currentMenuScreen();
  if (!cur) return false;
  const parent = PARENT[cur];
  if (!parent) return false;
  goMenu(parent);
  return true;
}
