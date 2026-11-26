// The coaching contract record (E3.1.1) as the contract module holds it. It is richer than the world
// contract's CoachContractTerms (schema/src/world/contracts.ts); `toWorldTerms` maps it down and
// CR-G51-1 asks the integrator for the missing fields. Money is integer cents of the league year signed.
import type { Cents } from './money.ts';

/** Contract tier: which contract_defaults and pay_bands block a job reads (E3.8.1, E3.2.1). Data, not a level branch. */
export type ContractTier = 'pro' | 'power_four' | 'group_of_six';
export const CONTRACT_TIERS: readonly ContractTier[] = ['pro', 'power_four', 'group_of_six'];

/** Seat class for the defaults block: head coach or any assistant seat. */
export type SeatClass = 'head_coach' | 'assistant';

export type GuaranteeForm = 'share_of_remaining' | 'current_year' | 'head_coach_change_months';
export type OffsetIncome = 'coaching_only' | 'football_related';
export type MarketFloor = 'arbitration' | 'in_contract' | 'none';
export type BuyoutForm = 'none' | 'fixed_by_year' | 'per_remaining_year' | 'pct_remaining' | 'assistant_ladder';
export type ResignationWindow = 'none' | 'season' | 'august_to_last_game';
export type ContractState = 'offered' | 'active' | 'terminated_paying' | 'expired' | 'bought_out' | 'terminated_for_cause' | 'settled';

/** E3.4.1 arrangements (L5.2.1 owns the odds). Ordered from least to most coach control. */
export type RosterAuthority = 'gm_final' | 'shared_owner_ties' | 'coach_53_gm_draft_fa' | 'coach_full';
export const ROSTER_AUTHORITY_STEPS: readonly RosterAuthority[] = ['gm_final', 'shared_owner_ties', 'coach_53_gm_draft_fa', 'coach_full'];

/** E3.4.3 optional lines. Each maps to a consuming rule elsewhere (CLAUSE_CONSUMERS). */
export type OtherClause = 'reports_to_owner' | 'play_calling_freedom' | 'outside_income_rights' | 'media_obligations' | 'no_depth_chart_interference' | 'facilities_promise';

/** E3.2.2 trigger ids. A season result posts events with these ids. */
export type TriggerId = 'playoff_berth' | 'playoff_win' | 'conference_title_game' | 'conference_title' | 'title_game' | 'league_title' | 'coach_of_year' | 'win_threshold' | 'academic_target';

export interface Incentive {
  readonly trigger: TriggerId;
  readonly amountCents: Cents;
  /** win_threshold: pays once per win at or above this count. */
  readonly fromWins: number | null;
}

export interface SalaryYear {
  readonly leagueYear: number;
  readonly baseCents: Cents;
  /** Media and endorsement pay, paid quarterly, no wage withholding when paid to the coach's company (E3.2.3). */
  readonly supplementalCents: Cents;
}

export interface BuyoutTerms {
  readonly form: BuyoutForm;
  /** fixed_by_year: amount per contract year index (0 = first year). */
  readonly fixedByYearCents: readonly Cents[];
  /** per_remaining_year: amount per remaining year, prorated. */
  readonly perRemainingYearCents: Cents;
  /** pct_remaining: share of remaining pay; assistant_ladder: shares before Aug 1 of season 1, until next Feb 1, after. */
  readonly share: number;
  readonly ladder: readonly [number, number, number] | null;
  /** assistant_ladder: waived when leaving for a promotion (head coach, or play-calling coordinator). */
  readonly promotionWaiver: boolean;
}

export interface StaffTerms {
  readonly poolCents: Cents;
  readonly sizeCap: number;
  readonly mayReplaceAll: boolean;
  /** Person ids the owner requires the coach to keep. */
  readonly requiredKeepIds: readonly number[];
  readonly assistantsMayBring: number;
}

export interface CoachContract {
  readonly id: number;
  readonly coachId: number;
  readonly employerId: number;
  /** JobRecord id of the seat (world contract). */
  readonly jobId: number;
  /** Catalogue seat id (positions/catalogue.json). */
  readonly seatId: string;
  readonly tier: ContractTier;
  readonly seat: SeatClass;
  readonly rung: number;
  readonly startYear: number;
  /** Calendar month (1 to 12) on which each contract year begins. */
  readonly startMonth: number;
  readonly endYear: number;
  readonly salary: readonly SalaryYear[];
  readonly signingBonusCents: Cents;
  readonly incentives: readonly Incentive[];
  /** Annual cap on incentive pay; 0 means no cap. */
  readonly incentiveCapCents: Cents;
  readonly bonusRequiresEmploymentOnEventDate: boolean;
  readonly bonusRequiresEmploymentOnPayDate: boolean;
  readonly bonusComplianceCondition: boolean;
  readonly guarantee: { readonly form: GuaranteeForm; readonly share: number; readonly months: number; readonly guaranteedThroughYear: number };
  readonly offset: { readonly on: boolean; readonly income: OffsetIncome; readonly marketFloor: MarketFloor };
  readonly causeGrounds: readonly CauseGround[];
  readonly cureDays: number;
  readonly maxUnpaidSuspensionDays: number;
  readonly reportNewJobDays: number;
  readonly buyout: BuyoutTerms;
  /** Professional: the club holds the coach's rights and a move is a trade (L5.2.5). */
  readonly releaseHeldByClub: boolean;
  readonly resignationWindow: ResignationWindow;
  readonly clubOptionYear: number | null;
  readonly coachOptionYear: number | null;
  readonly rosterAuthority: RosterAuthority;
  readonly otherClauses: readonly OtherClause[];
  readonly staff: StaffTerms;
  readonly perquisites: readonly { readonly key: string; readonly amountCents: Cents }[];
  readonly payPeriods: number;
  readonly agentId: number | null;
  readonly agentFeeShare: number;
  readonly rollover: { readonly trigger: 'none' | 'playoff_appearance' | 'win_total'; readonly winTotal: number | null; readonly maxUnexpiredYears: number | null };
  readonly termCapYears: number | null;
  readonly state: ContractState;
}

/** E3.3.3 rule 1: the starting cause list (Texas 2016 grounds plus the broad ground). Data per contract. */
export type CauseGround =
  | 'refusal_to_perform' | 'serious_rules_violation' | 'staff_violation_known' | 'failure_to_report_violation'
  | 'withholding_information' | 'fraud_or_falsified_records' | 'misleading_employer' | 'unauthorized_absence'
  | 'gambling_on_sport' | 'prohibited_drugs' | 'harassment_policy' | 'felony_or_dishonesty_charge'
  | 'academic_ineligibility_with_neglect' | 'conduct_unbecoming' | 'league_discipline';

export const DEFAULT_CAUSE_GROUNDS: readonly CauseGround[] = [
  'refusal_to_perform', 'serious_rules_violation', 'staff_violation_known', 'failure_to_report_violation',
  'withholding_information', 'fraud_or_falsified_records', 'misleading_employer', 'unauthorized_absence',
  'gambling_on_sport', 'prohibited_drugs', 'harassment_policy', 'felony_or_dishonesty_charge',
  'academic_ineligibility_with_neglect', 'conduct_unbecoming', 'league_discipline',
];

/** Grounds a coach can cure inside the cure period (E3.3.3 rule 3). Assumption: duty and absence grounds. */
export const CURABLE_GROUNDS: readonly CauseGround[] = ['refusal_to_perform', 'unauthorized_absence', 'withholding_information'];

/** Caller-supplied uniform source in [0, 1). Career may not import engine-core, so the world runner passes a stream. */
export interface ContractRandom { next(): number }

/** Months counted from year 0 (calendar year * 12 + month - 1), so dates compare as integers. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}
