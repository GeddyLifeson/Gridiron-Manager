// Shared helpers for the staff tests. Rule values below copy the bible's stated defaults (E2.3.1, L4.2.1)
// as test fixtures only; they are not triple-verified facts and the module never reads them as literals.
import type { JobHistoryRow, RandomStream, RuleSet, WorldDate } from '@gm/schema';
import { hiringRulesFrom, type NeedWeights } from '../../src/staff/index.ts';

export const D0: WorldDate = { seasonYear: 2026, dayIndex: 40 };

export const PRO_RULES = hiringRulesFrom({
  'hiring.playoff_windows': true,
  'hiring.virtual_interview_after_days': 3,
  'hiring.late_season_consent_interviews': false,
  'hiring.consent_interview_weeks_left': 2,
  'hiring.playoff_candidate_interview_cap_minutes': 180,
  'hiring.permission_required': true,
  'hiring.promotion_block_forbidden': true,
  'hiring.head_coach_block_forbidden': true,
  'hiring.lateral_block_allowed': true,
  'hiring.diverse_interview.head_coach_external_candidates': 2,
  'hiring.diverse_interview.head_coach_in_person': true,
  'hiring.diverse_interview.coordinator_external_candidates': 1,
  'hiring.diverse_interview.quarterback_coach_candidates': 1,
});

/** The college record: none of the hiring keys (E2.3.1 college paragraph). */
export const COLLEGE_RULES = hiringRulesFrom({});

export function ruleSet(values: Record<string, number | boolean>): RuleSet {
  return {
    id: 'test_2026', level: 'pro', seasonYear: 2026,
    keys: () => Object.keys(values), num: (k) => Number(values[k]), bool: (k) => Boolean(values[k]), opt: (k) => String(values[k]),
  };
}

export const NEEDS: NeedWeights = { autonomy: 0.6, credit: 0.3, advancement: 0.8, security: 0.4, heard: 0.5, family_time: 0.1, loyalty_returned: 0.25 };

export function row(personId: number, teamId: number, catalogueId: string, from: number, to: number | null, jobId = personId * 100 + from): JobHistoryRow {
  return {
    personId, jobId, teamId, catalogueId, started: { seasonYear: from, dayIndex: 30 }, ended: to === null ? null : { seasonYear: to, dayIndex: 20 },
    seasons: 0, wins: 0, losses: 0, ties: 0, exitReason: to === null ? 'current' : 'resigned', exitEventId: null,
  };
}

/** A stream whose chance() answers true when p >= the threshold (deterministic). */
export function threshold(t: number): RandomStream {
  return {
    name: 'test', draws: 0,
    nextU32: () => 0, uniform: () => t, normal: () => 0, chance: (p: number) => p >= t, pick: () => 0, int: (lo: number) => lo,
  };
}
