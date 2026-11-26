// Openings, the jobs board and applying (E2.3.1 rules 1 to 3, E2.3.3, E2.2.2 job value and value window).
// Every opening in the world is listed from the day it exists until filled; no fog on existence. An
// application only places a candidate in the pool: it never changes his score (E2.3.3 acceptance 3).
import type { RandomStream, WorldDate } from '@gm/schema';
import { clamp, param } from './params.ts';

export const OPENING_REASONS = ['fired', 'retired', 'promoted', 'left', 'new_position', 'followed_boss', 'released', 'resigned'] as const;
export type OpeningReason = (typeof OPENING_REASONS)[number];

export type HiringParty = 'owner' | 'general_manager' | 'athletic_director' | 'head_coach';
export type SearchStage = 'open' | 'interviewing' | 'offer_out' | 'agreed_in_principle' | 'filled' | 'filled_internally';

/** One opening object (E2.3.1 outputs). */
export interface Opening {
  readonly id: number;
  readonly teamId: number;
  readonly seatId: number;
  readonly level: string;
  readonly rung: number;
  /** Level prestige 0 to the prestige maximum (E2.2.2). Data on the team/level, never a level word in code. */
  readonly prestige: number;
  readonly side: 'offense' | 'defense' | 'special_teams' | 'whole_team' | 'support';
  readonly region: string;
  readonly isHeadCoach: boolean;
  readonly reason: OpeningReason;
  readonly posted: WorldDate;
  readonly party: HiringParty;
  readonly stage: SearchStage;
  /** Opening that caused this one in the cascade (E2.3.1 rule 2); null at the top. */
  readonly causeOpeningId: number | null;
  /** Search run by a firm (E2.3.5); null when the hiring party runs it. */
  readonly firmId: number | null;
}

const RUNG_VALUES = (): readonly number[] => Array.from({ length: 10 }, (_, i) => param(`value.rung${i}`));

/** E2.2.2: job value = rung value plus level prestige weight. */
export function jobValue(rung: number, prestige: number): number {
  const v = RUNG_VALUES()[clamp(Math.round(rung), 0, 9)] ?? 0;
  return v + clamp(prestige, 0, param('value.prestigeMax'));
}

export interface CareerSpot { readonly rung: number; readonly prestige: number }

/**
 * E2.2.2 value window: a hiring party considers candidates whose current job value is within the window
 * below the opening's value, or who held a job at or above it before. A fired head coach of the top level
 * is eligible anywhere (edge case) and is passed as `formerTopHeadCoach`.
 */
export function inValueWindow(opening: CareerSpot, current: CareerSpot | null, bestHeld: CareerSpot | null, formerTopHeadCoach: boolean): boolean {
  if (formerTopHeadCoach) return true;
  const target = jobValue(opening.rung, opening.prestige);
  if (bestHeld && jobValue(bestHeld.rung, bestHeld.prestige) >= target) return true;
  const now = current ? jobValue(current.rung, current.prestige) : 0;
  return now >= target - param('value.window');
}

export type FitLine = 'step_up' | 'lateral' | 'step_down' | 'step_down_title_up_level' | 'well_above';

/** The plain fit line on each board row (E2.3.3, E2.2.2). */
export function fitLine(opening: CareerSpot, current: CareerSpot | null): FitLine {
  const target = jobValue(opening.rung, opening.prestige);
  const now = current ? jobValue(current.rung, current.prestige) : 0;
  const d = target - now;
  if (d > param('fit.wellAbove')) return 'well_above';
  if (Math.abs(d) <= param('fit.lateralBand')) return 'lateral';
  if (d > 0) return current && opening.rung < current.rung ? 'step_down_title_up_level' : 'step_up';
  return 'step_down';
}

export interface BoardFilter { readonly level?: string; readonly rung?: number; readonly side?: Opening['side']; readonly region?: string }

/**
 * Rows of the board: every unfilled opening at both levels (acceptance 1). "Filled internally" rows stay
 * visible so the user sees the job existed (edge case); other filled rows drop off.
 */
export function boardRows(openings: readonly Opening[], f: BoardFilter = {}): readonly Opening[] {
  return openings.filter((o) => o.stage !== 'filled')
    .filter((o) => (f.level === undefined || o.level === f.level) && (f.rung === undefined || o.rung === f.rung)
      && (f.side === undefined || o.side === f.side) && (f.region === undefined || o.region === f.region))
    .slice().sort((a, b) => a.posted.seasonYear - b.posted.seasonYear || a.posted.dayIndex - b.posted.dayIndex || a.id - b.id);
}

export type ApplyRoute = 'letter' | 'agent' | 'contact';

export interface Application {
  readonly openingId: number;
  readonly personId: number;
  readonly route: ApplyRoute;
  readonly date: WorldDate;
  /** Did his current boss learn of it (E2.3.3 rule 4)? Only drawn when he is under contract. */
  readonly bossLearned: boolean;
  readonly response: 'pending' | 'no_reply' | 'declined' | 'interview_request';
}

/**
 * E2.3.3: apply. Every listed opening accepts an application (acceptance 2). The hours cost is returned for
 * E7. A coach under contract is asking for permission, and his boss learns of it by route.
 */
export function apply(opening: Opening, personId: number, route: ApplyRoute, date: WorldDate, underContract: boolean, stream: RandomStream): { application: Application; hours: number } {
  const bossLearned = underContract ? stream.chance(param(`apply.bossLearns.${route}`)) : false;
  return { application: { openingId: opening.id, personId, route, date, bossLearned, response: 'pending' }, hours: param('apply.hours') };
}

/**
 * E2.3.3 rule 3: the familiarity term an application route contributes, using terms that already exist:
 * a contact's word at the strength of his edge to the hiring party (only if the contact agreed), an agent's
 * call at his reach with that party, a letter adds nothing. 0 to 1.
 */
export function routeFamiliarity(route: ApplyRoute, contactEdge: number, contactAgreed: boolean, agentReach: number): number {
  if (route === 'contact') return contactAgreed ? clamp(contactEdge, 0, 100) / 100 : 0;
  if (route === 'agent') return clamp(agentReach, 0, 1);
  return 0;
}

/** Candidate pool of an opening: those the party found itself, plus applicants. A set; order by id. */
export function pool(found: readonly number[], applications: readonly Application[], openingId: number): readonly number[] {
  const s = new Set(found);
  for (const a of applications) if (a.openingId === openingId) s.add(a.personId);
  return [...s].sort((a, b) => a - b);
}

/**
 * E2.3.1 rule 2: each head coach hire opens coordinator jobs, which open position jobs. The caller passes
 * the seats emptied below the filled one (career/positions firingCascade does the who-stays part); this
 * stamps them as openings caused by the parent, posted on the hire date.
 */
export function cascadeOpenings(parent: Opening, emptied: readonly Omit<Opening, 'id' | 'posted' | 'causeOpeningId' | 'stage' | 'reason'>[], date: WorldDate, nextId: number): readonly Opening[] {
  return emptied.map((e, i) => ({ ...e, id: nextId + i, posted: date, causeOpeningId: parent.id, stage: 'open' as const, reason: 'promoted' as const }));
}

/** E2.3.1 acceptance 6: the cascade has filled every job by the day the offseason program begins. */
export function cascadeDone(openings: readonly Opening[]): boolean {
  return openings.every((o) => o.stage === 'filled' || o.stage === 'filled_internally');
}
