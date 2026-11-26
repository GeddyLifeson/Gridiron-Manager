// Who is in the draft (C7.1.1): the three-season test, automatic entry of players out of college eligibility,
// declarations, revocation inside the window, and senior opt-outs. The declare decision itself is the player's
// (an AI person, C7.1.1 rule 3) and comes in as data. Times are absolute world hours (roster `absHour`).
import type { RuleSet } from '@gm/schema';
import { FIRST_ROUND, KEY } from './params.ts';
import type { PersonId } from './types.ts';

/** High school graduation (or his entering class's, whichever is earlier; CBA Art. 6 s.2(b)). */
export interface Graduation {
  readonly seasonYear: number;
  /** True when he graduated before that year's pro regular season began, so that season counts. */
  readonly beforeSeasonStart: boolean;
}

/** First draft he may enter: after the eligibility seasons have begun and ended (C7.1.1 rule 1). */
export function firstEligibleDraft(g: Graduation, rules: RuleSet): number {
  const firstCounted = g.beforeSeasonStart ? g.seasonYear : g.seasonYear + FIRST_ROUND;
  return firstCounted + rules.num(KEY.eligibilitySeasons);
}

export const isDraftEligible = (g: Graduation, draftYear: number, rules: RuleSet): boolean => draftYear >= firstEligibleDraft(g, rules);

export interface Declaration {
  /** When he declared. */
  readonly atHour: number;
  /** The deadline he used (soft, hard, or title-game deadline; the calendar supplies it, C7.1.1 rule 2). */
  readonly deadlineHour: number;
  /** When he asked to revoke, in writing to his athletics director, or null. */
  readonly revokedAtHour: number | null;
}

export interface PoolCandidate {
  readonly personId: PersonId;
  readonly graduation: Graduation;
  /** College eligibility used up: enters automatically (C7.1.1 rule 1). */
  readonly collegeEligibilityExhausted: boolean;
  /** Senior who opted out by the opt-out date: cannot be drafted this year (C7.1.1 rule 4). */
  readonly seniorOptOut: boolean;
  readonly declaration: Declaration | null;
  /** Already entered a draft once without losing eligibility (C7.1.1 rule 4). */
  readonly priorEntryRevoked: boolean;
}

export type PoolReason = 'exhausted' | 'declared' | 'late_revocation' | 'second_revocation';

export interface PoolResult {
  readonly pool: readonly { readonly personId: PersonId; readonly reason: PoolReason }[];
  /** Declared underclassmen whose declaration stands: they lose college eligibility (C7.1.1 rule 4; T5). */
  readonly lostCollegeEligibility: readonly PersonId[];
  /** Candidates left out, with the reason (for the college-side screen). */
  readonly excluded: readonly { readonly personId: PersonId; readonly reason: string }[];
}

/** Build the declared pool after the last deadline (C7.1.1 outputs). High school players are never candidates. */
export function buildPool(candidates: readonly PoolCandidate[], draftYear: number, rules: RuleSet): PoolResult {
  const revokeHours = rules.num(KEY.revokeWindowHours);
  const pool: { personId: PersonId; reason: PoolReason }[] = [];
  const lost: PersonId[] = [];
  const excluded: { personId: PersonId; reason: string }[] = [];
  for (const c of candidates) {
    if (!isDraftEligible(c.graduation, draftYear, rules)) { excluded.push({ personId: c.personId, reason: 'fewer pro seasons than the eligibility rule since high school' }); continue; }
    if (c.collegeEligibilityExhausted) {
      if (c.seniorOptOut) excluded.push({ personId: c.personId, reason: 'senior opt-out' });
      else pool.push({ personId: c.personId, reason: 'exhausted' });
      continue;
    }
    const d = c.declaration;
    if (!d) { excluded.push({ personId: c.personId, reason: 'did not declare' }); continue; }
    if (d.atHour > d.deadlineHour) { excluded.push({ personId: c.personId, reason: 'declared after the deadline' }); continue; }
    if (d.revokedAtHour !== null) {
      const inWindow = d.revokedAtHour <= d.deadlineHour + revokeHours;
      if (inWindow && !c.priorEntryRevoked) { excluded.push({ personId: c.personId, reason: 'revoked inside the window; returns to college' }); continue; }
      pool.push({ personId: c.personId, reason: inWindow ? 'second_revocation' : 'late_revocation' });
      lost.push(c.personId);
      continue;
    }
    pool.push({ personId: c.personId, reason: 'declared' });
    lost.push(c.personId);
  }
  return { pool, lostCollegeEligibility: lost, excluded };
}
