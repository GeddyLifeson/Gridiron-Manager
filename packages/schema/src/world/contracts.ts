// World contract, part 6: contracts and scholarships (P3.2.4, C6.1.1, E3.1.1, T5, T7).
// Contracts store terms only. Cap charges, proration, cash by date and dead money are computed by
// the cap package (G-16) from these terms and the league-rules keys; none is stored (P3.1.1 derived data).
// Money is integer cents of the league year signed (P3.1.2, E3.1.1).
import { z } from 'zod';
import { pub, own } from '../field.ts';
import { zCents, zContentRef, zId, zTextKey, zWorldDate, zYear } from './primitives.ts';

/** C6.1.1 rule 4: three guarantee types. All three on an item makes it fully guaranteed. */
export const Guarantee = z.object({
  skill: pub(z.boolean()),
  cap: pub(z.boolean()),
  injury: pub(z.boolean()),
}).strict();

const guaranteed = <T extends z.ZodType>(amount: T) => z.object({ amountCents: amount, guarantee: pub(Guarantee) }).strict();

/** One contract year of a pro player contract (C6.1.1 outputs). */
export const PlayerContractYear = z.object({
  leagueYear: zYear(),
  baseSalary: pub(guaranteed(zCents())),
  optionBonus: pub(guaranteed(zCents())).nullable(),
  rosterBonuses: pub(z.array(z.object({
    /** C6.1.1 rule 3: earned by being on the roster on a set date, or per game active. */
    basis: pub(z.enum(['dated', 'per_game'])),
    date: zWorldDate().nullable(),
    amountCents: zCents(),
    guarantee: pub(Guarantee),
  }).strict())),
  workoutBonusCents: zCents(),
  incentives: pub(z.array(z.object({
    id: pub(z.string().min(1)),
    /** Trigger as a stat or honour key with a threshold, defined by the cap package's incentive list. */
    triggerKey: pub(z.string().min(1)),
    threshold: pub(z.number(), 'count'),
    amountCents: zCents(),
    /** C6.1.1 rule 5: tagged likely when the player reached the mark the season before. */
    likelyToBeEarned: pub(z.boolean()),
  }).strict())),
  /** A year the player alone can void (C6.1.1 edge case: does not count for proration). */
  voidable: pub(z.boolean()),
  /** An option year one side may add. */
  option: pub(z.enum(['none', 'club', 'player'])),
}).strict();

/** Pro player contract (C6.1.1). Visible to clubs, as league contract filings are (W-14). */
export const PlayerContractTerms = z.object({
  kind: pub(z.literal('player')),
  /** Rookie contracts follow the C6.4.2 scale; others are veteran deals. */
  form: pub(z.enum(['rookie', 'veteran', 'minimum', 'tender', 'tag'])),
  signingBonusCents: zCents(),
  signingBonusPaidOn: zWorldDate(),
  years: pub(z.array(PlayerContractYear).min(1)),
  offset: pub(z.boolean()),
  noTrade: pub(z.boolean()),
}).strict();

/** Coaching contract (E3.1.1). Terms are known to the two parties (W-14). */
export const CoachContractTerms = z.object({
  kind: own(z.literal('coach')),
  jobId: zId('own_team'),
  salary: own(z.array(z.object({ leagueYear: zYear('own_team'), amountCents: zCents('own_team') }).strict()).min(1)),
  signingBonusCents: zCents('own_team'),
  incentives: own(z.array(z.object({ triggerKey: own(z.string().min(1)), amountCents: zCents('own_team') }).strict())),
  guarantee: own(z.discriminatedUnion('type', [
    z.object({ type: own(z.literal('full')) }).strict(),
    z.object({ type: own(z.literal('none')) }).strict(),
    z.object({ type: own(z.literal('partial')), amountCents: zCents('own_team') }).strict(),
  ])),
  offset: own(z.boolean()),
  /** E3.3.3 conduct that ends pay, as clause keys. */
  withCauseClauseKeys: own(z.array(z.string())),
  /** What the coach or the next employer owes for leaving early, per league year (E3.8). */
  buyout: own(z.array(z.object({ leagueYear: zYear('own_team'), amountCents: zCents('own_team') }).strict())),
  clubOptionYear: zYear('own_team').nullable(),
  coachOptionYear: zYear('own_team').nullable(),
  /** E3.4 authority clause keys (feed L5.2.1 final say). */
  authorityClauseKeys: own(z.array(z.string())),
  staffTerms: own(z.object({ poolCents: zCents('own_team'), assistantsMayBring: own(z.number().int().min(0), 'count') }).strict()),
  /** Housing, car, family travel, relocation, as clause keys with amounts. */
  perquisites: own(z.array(z.object({ key: own(z.string().min(1)), amountCents: zCents('own_team') }).strict())),
  agentFeeShare: own(z.number().min(0).max(1), 'ratio').nullable(),
}).strict();

/** College scholarship or pay agreement (T5, T7). Amounts and limits come from league-rules keys. */
export const CollegeAgreementTerms = z.object({
  kind: pub(z.literal('college')),
  form: pub(z.enum(['scholarship', 'pay_agreement'])),
  /** Share of a full scholarship, 0 to 1, or null for a pay agreement only. */
  scholarshipShare: pub(z.number().min(0).max(1), 'ratio').nullable(),
  payByYear: own(z.array(z.object({ year: zYear('own_team'), amountCents: zCents('own_team') }).strict())),
  /** The T7 agreement row this pay counts against (content or league rule id). */
  agreementRef: zContentRef().nullable(),
}).strict();

/** A contract row (P3.2.4 "Contract or scholarship"). */
export const ContractRecord = z.object({
  id: zId(),
  personId: zId(),
  teamId: zId(),
  signed: zWorldDate(),
  agentId: zId().nullable(),
  state: pub(z.enum(['offered', 'active', 'terminated_paying', 'expired', 'bought_out', 'released', 'traded'])),
  /** Short summary shown in lists, from templates (P4.6.1). */
  summaryKey: zTextKey().nullable(),
  terms: pub(z.discriminatedUnion('kind', [PlayerContractTerms, CoachContractTerms, CollegeAgreementTerms])),
}).strict();
export type ContractRecord = z.infer<typeof ContractRecord>;
