/**
 * Field Manual — every article, grouped and ordered by category, plus lookups.
 * Ranked full-text search lives in ./search.ts; the markdown subset parser in ./markdown.ts.
 */
import type { ManualArticle, ManualCategory } from '../schema';
import { ABOUT_ARTICLES } from './about';
import { BASICS_ARTICLES } from './basics';
import { CARDS_ARTICLES } from './cards';
import { HARDWARE_ARTICLES } from './hardware';
import { INFRA_ARTICLES } from './infra';
import { ORCA_ARTICLES } from './orca';
import { ORCA2_ARTICLES } from './orca2';
import { PIGEON_ARTICLES } from './pigeon';
import { PIPELINES_ARTICLES } from './pipelines';
import { POWER_ARTICLES } from './power';
import { ROBOTS_ARTICLES } from './robots';
import { TOOLS_ARTICLES } from './tools';
import { TROUBLESHOOTING_ARTICLES } from './troubleshooting';
import { UIA_ARTICLES } from './uia';

/** Display order of Field Manual categories. */
export const MANUAL_CATEGORIES: ManualCategory[] = [
  'Lab Basics',
  'Hardware',
  'Power',
  'Robots',
  'Orchestrator',
  'Pipelines',
  'Test Frameworks',
  'Cards & Payments',
  'Tools',
  'Infrastructure',
  'Teams & History',
  'Troubleshooting',
  'About the Sim',
];

const ALL: ManualArticle[] = [
  ...BASICS_ARTICLES,
  ...ABOUT_ARTICLES,
  ...HARDWARE_ARTICLES,
  ...POWER_ARTICLES,
  ...ROBOTS_ARTICLES,
  ...ORCA_ARTICLES,
  ...ORCA2_ARTICLES,
  ...PIPELINES_ARTICLES,
  ...UIA_ARTICLES,
  ...PIGEON_ARTICLES,
  ...CARDS_ARTICLES,
  ...TOOLS_ARTICLES,
  ...INFRA_ARTICLES,
  ...TROUBLESHOOTING_ARTICLES,
];

/** Every article, sorted by category order (stable within a category). */
export const MANUAL_ARTICLES: ManualArticle[] = MANUAL_CATEGORIES.flatMap((c) => ALL.filter((a) => a.category === c));

export const MANUAL_BY_ID: Record<string, ManualArticle> = Object.fromEntries(MANUAL_ARTICLES.map((a) => [a.id, a]));

export function articleById(id: string): ManualArticle | undefined {
  return MANUAL_BY_ID[id];
}

export function articlesInCategory(category: ManualCategory): ManualArticle[] {
  return MANUAL_ARTICLES.filter((a) => a.category === category);
}

/** Articles tagged with any of `tags`. */
export function articlesForTags(tags: string[]): ManualArticle[] {
  const want = new Set(tags);
  return MANUAL_ARTICLES.filter((a) => a.tags.some((t) => want.has(t)));
}

/** Articles that teach a fact. */
export function articlesForFact(factId: string): ManualArticle[] {
  return MANUAL_ARTICLES.filter((a) => a.factIds.includes(factId));
}

/** Articles that list an Arcade incident / drill id (INCnn, DRnn) under `practice`. */
export function articlesForPractice(id: string): ManualArticle[] {
  return MANUAL_ARTICLES.filter((a) => a.practice?.includes(id));
}

export { parseManual, parseInline, plainText, inlineText, references } from './markdown';
export type { Block, Inline, ListItem, CalloutKind } from './markdown';
