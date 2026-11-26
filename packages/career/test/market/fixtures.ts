// Fixtures for the market tests. Synthetic people and seasons only; rule values copy bible defaults as
// test fixtures, not as triple-verified facts.
import { stream, seedFromNumber } from '@gm/engine-core';
import type { RandomStream, WorldDate } from '@gm/schema';
import { hiringRulesFrom } from '../../src/staff/index.ts';
import type { Opening, Preferences, CandidateTerms, SeatState } from '../../src/market/index.ts';

export const rng = (seed: number, name = 'test'): RandomStream => stream(seedFromNumber(seed), `market.${name}`, []);
export const D: WorldDate = { seasonYear: 2027, dayIndex: 10 };

export const PRO_RULES = hiringRulesFrom({
  'hiring.playoff_windows': true, 'hiring.virtual_interview_after_days': 3, 'hiring.playoff_candidate_interview_cap_minutes': 180,
  'hiring.permission_required': true, 'hiring.promotion_block_forbidden': true, 'hiring.head_coach_block_forbidden': true, 'hiring.lateral_block_allowed': true,
});

export function opening(over: Partial<Opening> = {}): Opening {
  return {
    id: 1, teamId: 10, seatId: 100, level: 'pro', rung: 9, prestige: 40, side: 'whole_team', region: 'east', isHeadCoach: true,
    reason: 'fired', posted: D, party: 'owner', stage: 'open', causeOpeningId: null, firmId: null, ...over,
  };
}

const fill = (v: number) => ({ sideMatch: v, playCaller: v, experience: v, priorHeadRecord: v, playerReputation: v, familiarity: v, unitResults: v, oppositeOfFired: v, interview: v });
export const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...fill(1), ...over });
export const terms = (over: Partial<CandidateTerms> = {}): CandidateTerms => ({ ...fill(0.5), ...over });

export function seat(over: Partial<SeatState> = {}): SeatState {
  return { confidence: 80, mediaMood: 60, gmView: 60, ownerInvolvement: 0.5, ownerCandour: 0.5, enteringPenultimateYear: false, mainReview: false, keptWithConditions: false, ...over };
}
