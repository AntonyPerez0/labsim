/**
 * Academy hint ladders (Cur §2.0): walk-to 45/90 s, inspect 60/120 s, computer-task 60/120/180 s idle,
 * interact highlight after 3 wrong actions. Every revealed tier counts as a hint for stars. Guidance
 * setting: `full` = timed hints + markers; `light` = timed hints at double delay, no auto-pan;
 * `off` = no timed hints (H still reveals them).
 */
import type { TxContext } from '@/core/store';
import type { MarkerTarget, RootState } from '@/core/state';
import type { HintDef, LessonStep } from '../../types';
import { ACADEMY_HINT_DEFAULTS } from '../../types';
import { bark } from '../feedback';

declare module '@/core/events' {
  interface EventMap {
    /** Presentation effect of a hint tier for the HUD / world (marker pulse, breadcrumb, outline, auto-pan, highlight). */
    'mission.hintEffect': { stepId: string; effect: string; target: MarkerTarget | null };
  }
}

const APP_TITLES: Record<string, string> = {
  orca: 'Orca',
  jenkins: 'Jenkins',
  github: 'GitHub',
  ollama: 'Ollama',
  browser: 'the browser',
  intellij: 'IntelliJ IDEA',
  terminal: 'the Terminal',
  gimp: 'GIMP',
  camera: 'the Camera app',
  dashboard: 'the robot dashboard',
  chat: 'LabChat',
  cardreader: 'the card-reader utility',
  files: 'Files',
};

export function appTitle(app: string): string {
  return APP_TITLES[app] ?? app;
}

export function stepTarget(step: LessonStep, mentor: string): MarkerTarget | null {
  if (step.marker) return step.marker;
  switch (step.kind) {
    case 'walk-to':
      return { kind: 'location', id: step.location };
    case 'inspect':
      return { kind: 'prop', id: step.part ?? step.prop };
    case 'interact':
      return step.target.startsWith('npc.') ? { kind: 'npc', id: step.target } : { kind: 'prop', id: step.target };
    case 'computer-task':
      return { kind: 'location', id: 'loc.workstation' };
    case 'hint':
      return step.target ?? null;
    case 'dialogue':
      return { kind: 'npc', id: `npc.${step.speaker ?? mentor}` };
    default:
      return null;
  }
}

export function hintLadder(step: LessonStep): readonly HintDef[] {
  return step.hints ?? ACADEMY_HINT_DEFAULTS[step.kind] ?? [];
}

/** Default text for a tier (when the ladder entry has none). */
function defaultText(step: LessonStep, tier: number, def: HintDef | undefined): string {
  switch (step.kind) {
    case 'walk-to':
      return tier >= 2 ? 'Over here!' : step.hud;
    case 'inspect':
      return tier >= 2 ? `${step.hud} — hold RMB on the outlined object.` : `${step.hud} (look for the outline).`;
    case 'computer-task': {
      const apps = Array.isArray(step.app) ? (step.app as readonly string[]) : [step.app as string];
      if (tier === 1) return `Sit at your workstation and open ${apps.map(appTitle).join(' / ')}${step.route ? ` (${step.route})` : ''}.`;
      if (tier === 2) {
        const g = step.showMe?.[0];
        return g ? `${g.caption ?? step.hud}${g.text ? `: ${g.text}` : ''}` : step.hud;
      }
      return 'Stuck? Press "Show me" for a ghost demo (−50 % XP for this step).';
    }
    case 'interact':
      return `Use E on the highlighted control: ${step.hud}`;
    default:
      return def?.text ?? ('hud' in step && step.hud ? step.hud : 'Follow the objective.');
  }
}

/** Reveal the next tier (timed or requested). Returns the text, or null when nothing is left. */
export function revealNextHint(d: RootState, ctx: TxContext, step: LessonStep, mentor: string, requested: boolean): string | null {
  const ac = d.session.academy;
  if (!ac) return null;
  const ladder = hintLadder(step);
  const tierIndex = ac.hintTier;
  const def = ladder[tierIndex];
  const target = stepTarget(step, mentor);
  if (!def) {
    // Ladder exhausted: interact / walk-to / inspect can still highlight the target when asked.
    if (!requested || !target) return null;
    if (ac.highlight) return ac.hintText;
    ac.highlight = target;
    d.ui.highlight = target;
    ac.hintTier++;
    ac.hintsUsedTotal++;
    d.progress.stats.hintsUsed++;
    const text = defaultText(step, ac.hintTier, undefined);
    ac.hintText = text;
    ctx.emit('mission.hintEffect', { stepId: step.id, effect: 'highlight', target });
    ctx.emit('mission.hintShown', { scope: 'step', ref: step.id, tier: ac.hintTier, text });
    return text;
  }
  ac.hintTier++;
  ac.hintsUsedTotal++;
  d.progress.stats.hintsUsed++;
  const text = def.text ?? defaultText(step, ac.hintTier, def);
  ac.hintText = text;
  const effect = def.effect ?? 'text';
  switch (effect) {
    case 'breadcrumb':
      ac.breadcrumb = true;
      break;
    case 'bright-outline':
    case 'highlight':
      if (target) {
        ac.highlight = target;
        d.ui.highlight = target;
      }
      break;
    default:
      break;
  }
  if (effect !== 'text') ctx.emit('mission.hintEffect', { stepId: step.id, effect, target });
  const speaker = def.speaker ?? (step.kind === 'walk-to' && ac.hintTier >= 2 ? mentor : null);
  if (speaker) bark(d, ctx, speaker, text, 'ticket');
  ctx.emit('mission.hintShown', { scope: 'step', ref: step.id, tier: ac.hintTier, text });
  return text;
}

/** Per-tick timed ladder. */
export function tickHints(d: RootState, ctx: TxContext, step: LessonStep, mentor: string): void {
  const ac = d.session.academy;
  if (!ac || ac.phase !== 'active') return;
  const guidance = d.progress.settings.guidance;
  if (guidance === 'off') return;
  const ladder = hintLadder(step);
  const def = ladder[ac.hintTier];
  if (!def) return;
  if (guidance === 'light' && def.effect === 'auto-pan') return;
  const factor = guidance === 'light' ? 2 : 1;
  const clock = def.idle ? ac.idleS : ac.stepElapsedS;
  if (clock >= def.afterS * factor) revealNextHint(d, ctx, step, mentor, false);
}
