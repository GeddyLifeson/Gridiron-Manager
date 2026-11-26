// Rookie contracts: length, the 25 percent rule, the fifth-year option and the proven performance escalator
// (C6.4.2; CBA Art. 7 s.3, s.4, s.7). The slot table (value by pick) is data the draft (G-34) supplies; the
// CBA's Total Rookie Compensation Pool formula is not in the rule set yet (C6.4.2 open question).
import type { RuleSet } from '@gm/schema';
import { yearOf, type CapContract } from './contract.ts';
import { prorationFor } from './proration.ts';
import { minimumSalary } from './minimums.ts';
import { pctOf, PERCENT, usdKey } from './params.ts';

/** Draft round 1 to 7, or null for an undrafted rookie. */
export type DraftRound = number | null;

const FIRST_ROUND = 1;
/** The second round by name (CBA Art. 7 s.4(d)(i)); a label, not a rule value. */
const SECOND_ROUND = FIRST_ROUND + 1;

/** Fixed rookie contract length (C6.4.2 rule 1). */
export function rookieLength(round: DraftRound, rules: RuleSet): number {
  if (round === null) return rules.num('rookie.length_undrafted');
  return round === FIRST_ROUND ? rules.num('rookie.length_round_1') : rules.num('rookie.length_later_rounds');
}

/**
 * Rookie Salary of one contract year (CBA Art. 7 s.3(b)(iii), s.3(e) example): signing bonus proration,
 * Paragraph 5 salary, workout and roster bonuses, and incentives (year-one incentives are deemed likely).
 */
export function rookieSalary(c: CapContract, leagueYear: number, rules: RuleSet): number {
  const y = yearOf(c, leagueYear);
  if (!y) return 0;
  return prorationFor(c, leagueYear, rules) + y.base.amountCents + y.workoutBonusCents
    + y.datedRosterBonuses.reduce((s, b) => s + b.amountCents, 0) + y.perGameRosterCents + y.likelyIncentivesCents + y.unlikelyIncentivesCents;
}

/** Largest allowed yearly rise: a percent of year-one Rookie Salary (CBA Art. 7 s.3(e)). */
export function maxAnnualIncrease(c: CapContract, rules: RuleSet): number {
  return pctOf(rookieSalary(c, c.years[0]!.leagueYear, rules), rules.num('rookie.max_annual_increase_pct'));
}

/**
 * The 25 percent rule (C6.4.2 rule 2). Exempt: a contract whose Paragraph 5 salary is the minimum in every year
 * (CBA Art. 7 s.3(e)). Returns the first offending year, or null.
 */
export function increaseRuleBreach(c: CapContract, rules: RuleSet): number | null {
  const allMinimum = c.years.every((y, i) => y.base.amountCents === minimumSalary(rules, y.leagueYear, i));
  if (allMinimum) return null;
  const cap = maxAnnualIncrease(c, rules);
  for (let i = 1; i < c.years.length; i++) {
    const rise = rookieSalary(c, c.years[i]!.leagueYear, rules) - rookieSalary(c, c.years[i - 1]!.leagueYear, rules);
    if (rise > cap) return c.years[i]!.leagueYear;
  }
  return null;
}

/** Rookie contract checks: fixed length and the 25 percent rule. */
export function checkRookieContract(c: CapContract, round: DraftRound, rules: RuleSet): { ok: true } | { ok: false; reason: string } {
  if (c.years.length !== rookieLength(round, rules)) return { ok: false, reason: 'league rule: rookie contract length is fixed' };
  const breach = increaseRuleBreach(c, rules);
  if (breach !== null) return { ok: false, reason: `league rule: rookie salary rises more than allowed in ${breach}` };
  return { ok: true };
}

/** Plays in one regular season: the player's offensive or defensive snaps and the club's total. */
export interface SeasonPlays { readonly played: number; readonly teamPlays: number }

const share = (s: SeasonPlays) => (s.teamPlays === 0 ? 0 : (s.played * PERCENT) / s.teamPlays);
const cumulative = (ss: readonly SeasonPlays[]) => {
  const team = ss.reduce((t, s) => t + s.teamPlays, 0);
  return team === 0 ? 0 : (ss.reduce((t, s) => t + s.played, 0) * PERCENT) / team;
};
/** "In any two of his first three seasons" (CBA Art. 7 s.4(d), s.7(g)): at least all seasons but one. */
const allButOne = (ss: readonly SeasonPlays[], pct: number) => ss.filter((s) => share(s) >= pct).length >= ss.length - 1;

export type OptionTier = 'basic' | 'playing_time' | 'one_pro_bowl' | 'two_pro_bowls';

/** Fifth-year option tier (CBA Art. 7 s.7(g)) from the first three seasons' plays and original-ballot Pro Bowls. */
export function optionTier(firstThree: readonly SeasonPlays[], originalBallotProBowls: number, rules: RuleSet): OptionTier {
  if (originalBallotProBowls >= rules.num('rookie.option_franchise_pro_bowls')) return 'two_pro_bowls';
  if (originalBallotProBowls > 0) return 'one_pro_bowl';
  const playtime = allButOne(firstThree, rules.num('rookie.option_playtime_two_of_three_pct'))
    || cumulative(firstThree) >= rules.num('rookie.option_playtime_average_pct')
    || firstThree.every((s) => share(s) >= rules.num('rookie.option_playtime_each_pct'));
  return playtime ? 'playing_time' : 'basic';
}

/** What the option salary is computed from; each figure is a tender or average already computed by tags.ts. */
export interface OptionPrices {
  /** Cap percentage average of the 3rd to 25th largest salaries at his position (basic). */
  readonly basicCents: number;
  /** Same, 3rd to 20th (playing time). */
  readonly playingTimeCents: number;
  /** Transition tender for year four (one Pro Bowl). */
  readonly transitionCents: number;
  /** Franchise tender for year four (two or more Pro Bowls). */
  readonly franchiseCents: number;
}

/** Fifth-year option salary (C6.4.2 rule 4). Fully guaranteed once exercised (CBA Art. 7 s.7(g)(v)). */
export function optionSalary(tier: OptionTier, p: OptionPrices): number {
  switch (tier) {
    case 'basic': return p.basicCents;
    case 'playing_time': return p.playingTimeCents;
    case 'one_pro_bowl': return p.transitionCents;
    case 'two_pro_bowls': return p.franchiseCents;
  }
}

export type EscalatorLevel = 'none' | 'level_one' | 'level_two' | 'level_three';

/** Proven performance escalator level (C6.4.2 rule 5; CBA Art. 7 s.4(d)). Only the highest level applies. */
export function escalatorLevel(round: DraftRound, firstThree: readonly SeasonPlays[], originalBallotProBowls: number, rules: RuleSet): EscalatorLevel {
  if (round === null || round === FIRST_ROUND) return 'none';
  if (originalBallotProBowls > 0) return 'level_three';
  if (firstThree.every((s) => share(s) >= rules.num('rookie.escalator_l2_pct_each'))) return 'level_two';
  const pct = round === SECOND_ROUND ? rules.num('rookie.escalator_l1_pct_round_2') : rules.num('rookie.escalator_l1_pct_later_rounds');
  return allButOne(firstThree, pct) || cumulative(firstThree) >= pct ? 'level_one' : 'none';
}

/**
 * Raise to the year-four Paragraph 5 salary (CBA Art. 7 s.4(e)(ii) to (iv)): the target tender for the year
 * minus the year-four Rookie Salary without signing bonus proration. Never negative.
 */
export function escalatorRaise(level: EscalatorLevel, yearFourLeagueYear: number, yearFourSalaryWithoutBonusCents: number, rules: RuleSet): number {
  if (level === 'none') return 0;
  const original = usdKey(rules, `fa.rfa_tender_${yearFourLeagueYear}_original_round`);
  const target = level === 'level_one' ? original
    : level === 'level_two' ? original + usdKey(rules, 'rookie.escalator_l2_extra_usd')
      : usdKey(rules, `fa.rfa_tender_${yearFourLeagueYear}_second_round`);
  return Math.max(0, target - yearFourSalaryWithoutBonusCents);
}
