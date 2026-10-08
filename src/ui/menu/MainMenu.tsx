/**
 * Main menu (GP §2.1): the 3D lab stays visible behind a blurred, dimmed glass layer. Left rail —
 * Continue · Academy · Arcade · Certification · Free Play · Field Manual · Profile · Settings · About —
 * with badges (cards due on Field Manual, weakest tag on Arcade, exam ready on Certification); top bar
 * with the player card (name, rank, XP to next rank, streak). First launch goes title → new profile →
 * quick setup → M01 (GP §6.1).
 */
import { useState } from 'react';
import { useGame } from '@/core/store';
import type { MenuScreen } from '@/core/state';
import { LabWordmark, Icon, ProgressBar } from '@/ui/kit';
import { mq } from '@/ui/services/missions';
import { goMenu } from '@/ui/services/nav';
import { kitSound } from '@/ui/kit';
import { modeUnlock, rankViewFor } from '@/ui/data/views';
import { num } from '@/ui/services/format';
import { FieldManual } from '@/ui/manual/FieldManual';
import { SettingsPanel } from '@/ui/overlays/Settings';
import { HomeScreen, continueTarget, continueGame } from './Home';
import { NewProfile, QuickSetup, TitleScreen } from './Onboarding';
import { AcademyScreen } from './AcademyScreen';
import { ArcadeHub, DailyScreen, DrillsScreen, ShiftSetup } from './ArcadeScreens';
import { CertificationScreen, FreePlayScreen } from './OtherScreens';
import { ProfileScreen } from './ProfileScreen';
import { AboutScreen } from './About';

type RailId = 'continue' | 'academy' | 'arcade' | 'certification' | 'freeplay' | 'manual' | 'profile' | 'settings' | 'about';

const SCREEN_RAIL: Partial<Record<MenuScreen, RailId>> = {
  home: 'continue',
  academy: 'academy',
  arcade: 'arcade',
  'shift-setup': 'arcade',
  drills: 'arcade',
  daily: 'arcade',
  certification: 'certification',
  freeplay: 'freeplay',
  manual: 'manual',
  profile: 'profile',
  achievements: 'profile',
  leaderboards: 'profile',
  settings: 'settings',
};

export function MainMenu({ screen = 'home' }: { screen?: MenuScreen }) {
  const [about, setAbout] = useState(false);
  const progress = useGame((s) => s.progress);

  if (screen === 'title') return <TitleScreen />;
  if (screen === 'new-profile') return <NewProfile />;
  if (screen === 'quick-setup') return <QuickSetup />;

  const badges = mq('menuBadges', [], { cardsDue: 0, weakestTag: null, examReady: null });
  const rv = rankViewFor(progress);
  const active: RailId = about ? 'about' : (SCREEN_RAIL[screen] ?? 'continue');
  const cont = continueTarget(progress);
  const fp = modeUnlock(progress, 'freeplay');

  const go = (s: MenuScreen) => {
    setAbout(false);
    goMenu(s);
  };

  const rail: { id: RailId; label: string; icon: string; badge?: string | number | null; tone?: string; onClick: () => void; locked?: string | null }[] = [
    { id: 'continue', label: 'Home', icon: 'home', onClick: () => go('home') },
    { id: 'academy', label: 'Academy', icon: 'graduation', onClick: () => go('academy') },
    { id: 'arcade', label: 'Arcade', icon: 'bolt', badge: badges.weakestTag ? 'weak spot' : null, tone: 'amber', onClick: () => go('arcade') },
    { id: 'certification', label: 'Certification', icon: 'award', badge: badges.examReady ? 'exam ready' : null, tone: 'gold', onClick: () => go('certification') },
    { id: 'freeplay', label: 'Free Play', icon: 'sandbox', locked: fp.unlocked ? null : fp.reason, onClick: () => go('freeplay') },
    { id: 'manual', label: 'Field Manual', icon: 'book', badge: badges.cardsDue || null, tone: 'cyan', onClick: () => go('manual') },
    { id: 'profile', label: 'Profile', icon: 'user', onClick: () => go('profile') },
    { id: 'settings', label: 'Settings', icon: 'settings', onClick: () => go('settings') },
    { id: 'about', label: 'About & credits', icon: 'info', onClick: () => setAbout(true) },
  ];

  const wide = screen === 'manual';

  return (
    <div className="menu" data-ui-interactive>
      <div className="menu__veil" />
      <aside className="menu__rail">
        <div className="menu__brand" onClick={() => go('home')} role="button" tabIndex={-1}>
          <LabWordmark size={34} className="menu__mark" />
          <div>
            <div className="menu__title">LabSim</div>
            <div className="menu__subtitle">LabSim Automation Lab</div>
          </div>
        </div>
        {cont ? (
          <button type="button" className="menu__continue" onClick={() => (kitSound('ui-click'), continueGame(progress))}>
            <Icon name="play" size={18} />
            <div className="grow">
              <div className="menu__continue-label">Continue</div>
              <div className="menu__continue-sub">{cont.label}</div>
            </div>
            <Icon name="chevron-right" size={16} />
          </button>
        ) : null}
        <nav className="menu__nav">
          {rail.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`menu__nav-item${active === r.id ? ' is-active' : ''}${r.locked ? ' is-locked' : ''}`}
              onClick={() => {
                kitSound('ui-click');
                r.onClick();
              }}
              title={r.locked ?? undefined}
            >
              <Icon name={r.locked ? 'lock' : r.icon} size={17} />
              <span className="grow">{r.label}</span>
              {r.badge ? <span className={`menu__badge menu__badge--${r.tone ?? 'green'}`}>{r.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="menu__rail-foot">
          <span className="mono">{progress.contentVersion}</span> · progress saved in this browser
        </div>
      </aside>
      <main className={`menu__main${wide ? ' is-wide' : ''}`}>
        <header className="menu__top">
          <span className="spacer" />
          <button type="button" className="menu__player" onClick={() => go('profile')}>
            <span className="menu__lanyard" data-lanyard={progress.cosmetics.lanyard} />
            <span className="menu__player-text">
              <span className="menu__player-name">{progress.playerName}</span>
              <span className="menu__player-rank">{rv.rank.title}</span>
            </span>
            <span className="menu__xp">
              <span className="menu__xp-row">
                <span className="tnum">{num(progress.xp)} XP</span>
                {rv.next ? <span className="muted tnum">{num(rv.xpToNext)} to {rv.next.title}</span> : <span className="muted">Top rank</span>}
              </span>
              <ProgressBar value={rv.progress} height={4} glow />
            </span>
            <span className={`menu__streak${progress.streak.current ? ' is-on' : ''}`} title={`Streak: ${progress.streak.current} day(s) · best ${progress.streak.best} · a day counts at 300 XP`}>
              <Icon name="flame" size={15} /> <span className="tnum">{progress.streak.current}</span>
            </span>
          </button>
        </header>
        <div className="menu__content" key={about ? 'about' : screen}>
          {about ? (
            <AboutScreen onBack={() => setAbout(false)} />
          ) : screen === 'academy' ? (
            <AcademyScreen />
          ) : screen === 'arcade' ? (
            <ArcadeHub />
          ) : screen === 'shift-setup' ? (
            <ShiftSetup />
          ) : screen === 'drills' ? (
            <DrillsScreen />
          ) : screen === 'daily' ? (
            <DailyScreen />
          ) : screen === 'certification' ? (
            <CertificationScreen />
          ) : screen === 'freeplay' ? (
            <FreePlayScreen />
          ) : screen === 'manual' ? (
            <div className="menu__manual">
              <FieldManual />
            </div>
          ) : screen === 'profile' || screen === 'achievements' || screen === 'leaderboards' ? (
            <ProfileScreen tab={screen === 'achievements' ? 'achievements' : screen === 'leaderboards' ? 'leaderboards' : 'overview'} />
          ) : screen === 'settings' ? (
            <div className="menu__page">
              <h1 className="menu__h1">Settings</h1>
              <SettingsPanel />
            </div>
          ) : (
            <HomeScreen />
          )}
        </div>
      </main>
    </div>
  );
}
