/** Display names from `src/content/team.ts` (the only place real names live). Use these in drill text. */
import { personName } from '@/content';

export const N = {
  jared: personName('jared'),
  tate: personName('tate'),
  david: personName('david'),
  morgan: personName('morgan'),
  riley: personName('riley'),
  sam: personName('sam'),
  alex: personName('alex'),
} as const;
