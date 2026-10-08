import { useEffect, useState } from 'react';

/**
 * False for the first `ms` after mount, then true. Results screens (debrief, rank-up) gate their primary
 * buttons on it: a player mashing Space / Enter through the last dialogue line must not skip straight past
 * the screen (a focused button activates on Space key-up / Enter).
 */
export function useArmed(ms = 900): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return armed;
}
