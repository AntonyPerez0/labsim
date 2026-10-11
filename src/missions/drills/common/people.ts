/** Display names from `src/content/team.ts` (the only place real names live). Use these in drill text. */
import { personName } from '@/content';

export const N = {
  jaden: personName('jaden'),
  nate: personName('nate'),
  devin: personName('devin'),
  morgan: personName('morgan'),
  riley: personName('riley'),
  sam: personName('sam'),
  alex: personName('alex'),
} as const;
