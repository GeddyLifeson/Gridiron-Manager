// E8.4.1 moving for a job and S9.3.1 relocation by career stage. The user chooses the mode; household
// members react with their own facts. No relocation effect touches football (rule 6).
import { param } from './params.ts';
import { bump, isEmpty, strongTie, type Household } from './household.ts';

export type MoveMode = 'moveAll' | 'moveAtSchoolYearEnd' | 'liveApart' | 'programHousing';

export interface MoveInput {
  readonly mode: MoveMode;
  readonly year: number;
  readonly week: number;
  readonly sameCity: boolean;
  /** Region of the new job (U4 location). */
  readonly toRegion: string;
}

export interface RelocationRecord {
  readonly mode: MoveMode;
  readonly year: number;
  readonly week: number;
  /** Member ids who moved now. */
  readonly moved: readonly number[];
  readonly livingApart: boolean;
  /** Satisfaction change applied now. */
  readonly satisfactionChange: number;
  /** E6.1.3 owns the months; this flags that the partner's income stops (rule 3). */
  readonly partnerIncomeInterrupted: boolean;
  /** Plain lines for the offer card (E8.4.1 "home" section). */
  readonly lines: readonly string[];
}

/** Members' reactions for an offer card, before any choice. */
export function reactionLines(h: Household, year: number, toRegion: string): string[] {
  const out: string[] = [];
  for (const m of h.members) {
    if (m.role === 'partner' && m.occupation === 'placeTied') out.push('Your partner would have to leave a career tied to this place.');
    else if (m.role === 'partner' && m.occupation === 'job') out.push('Your partner would have to find a new job.');
    if (m.role === 'child' && strongTie(m, year)) out.push('Your child is in the last years of school here.');
    if (m.tieRegion !== null && m.tieRegion === toRegion) out.push('The move would take the family back to a region they are tied to.');
  }
  return out;
}

/** Moves of the whole household in the window ending this year, counting this one. */
function movesInWindow(h: Household, year: number): number {
  return h.moveYears.filter((y) => y > year - param('moveCountWindowYears')).length + 1;
}

/** Rule 1 and rule 4: the change in satisfaction for moving everyone now. */
export function moveAllChange(h: Household, year: number, toRegion: string): number {
  let d = -param('moveAllPenalty');
  for (const m of h.members) if (strongTie(m, year)) d -= param('moveTiePenalty');
  if (movesInWindow(h, year) >= param('moveCountForPenalty')) d -= param('moveThirdPenalty');
  if (h.members.some((m) => m.tieRegion !== null && m.tieRegion === toRegion)) d += param('moveHomeRegionBonus');
  return d;
}

/** Apply a choice. moveAtSchoolYearEnd lives apart until `completeMove` is called at the school year end. */
export function relocate(h: Household, i: MoveInput): { household: Household; record: RelocationRecord } {
  const lines = reactionLines(h, i.year, i.toRegion);
  const base = { mode: i.mode, year: i.year, week: i.week, lines };
  if (isEmpty(h) || i.sameCity) {
    return { household: h, record: { ...base, moved: [], livingApart: false, satisfactionChange: 0, partnerIncomeInterrupted: false } };
  }
  if (i.mode === 'moveAll') return completeMove(h, i);
  // Rule 2: living apart has no move penalty; home hours are capped by travel (apartHomeCapHours).
  return { household: h, record: { ...base, moved: [], livingApart: true, satisfactionChange: 0, partnerIncomeInterrupted: false } };
}

/** The household moves now (moveAll, or the end of a moveAtSchoolYearEnd period). */
export function completeMove(h: Household, i: MoveInput): { household: Household; record: RelocationRecord } {
  const change = moveAllChange(h, i.year, i.toRegion);
  const partnerWorks = h.members.some((m) => m.role === 'partner' && m.occupation !== 'none');
  return {
    household: { ...bump(h, change), moveYears: [...h.moveYears, i.year] },
    record: {
      mode: i.mode, year: i.year, week: i.week, lines: reactionLines(h, i.year, i.toRegion),
      moved: h.members.map((m) => m.id), livingApart: false, satisfactionChange: change, partnerIncomeInterrupted: partnerWorks,
    },
  };
}

/** E8.4.1 rule 2 and acceptance 2: weekly home hours possible while living apart. A visit costs travel
 *  both ways out of the week's visiting window; in season the window is short, so a far city gives zero. */
export function apartHomeCapHours(oneWayTravelHours: number, inSeason: boolean): number {
  const visitWindow = inSeason ? param('visitWindow.inSeason') : param('visitWindow.offSeason');
  return Math.max(0, visitWindow - 2 * oneWayTravelHours);
}

/** S9.3.1: who pays the move. `employerPaysFromRung` comes from the job's market (rung 5 at major
 *  college programs, rung 3 in the pros, both bible starting values held by the caller's rule data). */
export function employerPaysMove(rung: number, employerPaysFromRung: number): boolean {
  return rung >= employerPaysFromRung;
}
