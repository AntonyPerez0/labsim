/**
 * Arcade incident catalogue (GP §3.5, INC01–INC65). One definition drives Shift tickets, Daily
 * Challenge, Weak Spot micro-shifts, certification practical shifts and the Free Play Fault Injector
 * (`FInn` = `INCnn`). Loaded by the mission runtime registry (`import.meta.glob`).
 */
import type { IncidentDef } from '../../types';
import { withPeople } from './people';
import { INC01, INC02, INC03, INC04 } from './inc01-04';
import { INC05, INC06, INC07 } from './inc05-07';
import { INC08, INC09, INC10, INC11, INC12, INC13, INC14 } from './inc08-14';
import { INC15, INC16, INC17, INC18, INC19, INC20, INC21 } from './inc15-21';
import { INC22, INC23, INC24, INC25, INC26, INC27, INC28 } from './inc22-28';
import { INC29, INC30, INC31, INC32, INC33, INC34, INC35 } from './inc29-35';
import { INC36, INC37, INC38, INC39, INC40, INC41, INC42 } from './inc36-42';
import { INC43, INC44, INC45, INC46, INC47, INC48, INC49, INC50 } from './inc43-50';
import { INC51, INC52, INC53, INC54, INC55, INC56, INC57, INC58 } from './inc51-58';
import { INC59, INC60, INC61, INC62, INC63, INC64, INC65 } from './inc59-65';

const RAW: readonly IncidentDef[] = [INC01, INC02, INC03, INC04, INC05, INC06, INC07, INC08, INC09, INC10, INC11, INC12, INC13, INC14, INC15, INC16, INC17, INC18, INC19, INC20, INC21, INC22, INC23, INC24, INC25, INC26, INC27, INC28, INC29, INC30, INC31, INC32, INC33, INC34, INC35, INC36, INC37, INC38, INC39, INC40, INC41, INC42, INC43, INC44, INC45, INC46, INC47, INC48, INC49, INC50, INC51, INC52, INC53, INC54, INC55, INC56, INC57, INC58, INC59, INC60, INC61, INC62, INC63, INC64, INC65];

/** All 65 incidents, people tokens resolved from `src/content/team.ts`. */
export const INCIDENTS: readonly IncidentDef[] = RAW.map(withPeople);

export const INCIDENTS_BY_ID: Readonly<Record<string, IncidentDef>> = Object.fromEntries(INCIDENTS.map((i) => [i.id, i]));
