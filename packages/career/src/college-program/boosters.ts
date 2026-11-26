// T9.3.1 and L5.4.3 booster groups: giving, mood, access, buyout funding, and acts outside the rules.
// A booster's payment to a recruit or player goes through the one rule-breaking pipeline (L8.2.5,
// G-28 commitAct) as class `pay_rules`, with the booster as actor. The coach is responsible if he knew
// or should have known (T9.5.1); the pipeline charges him. Nothing here blocks an act.
import type { RandomStream, RuleSet, WorldDate, WorldTier, PersonOrigin } from '@gm/schema';
import { compliance } from '@gm/league';
import { P } from './params.ts';
import type { BoosterGroup, ProgramTier } from './types.ts';

type ComplianceState = compliance.ComplianceState;
type EventSink = compliance.EventSink;

const CENTS = 100;
const MOOD_MAX = 100;

function clampMood(m: number): number { return m < 0 ? 0 : m > MOOD_MAX ? MOOD_MAX : m; }

/** 1 to 5 groups by tier, wealth by tier and market (T9.3.1 rule 1). Market factor 1 is average. */
export function generateBoosters(tier: ProgramTier, marketFactor: number, firstId: number, leaderIds: readonly number[], rng: RandomStream): BoosterGroup[] {
  const n = rng.int(P(`booster.groups_min.${tier}`), P(`booster.groups_max.${tier}`));
  const mean = P(`booster.wealth_mean_usd.${tier}`) * marketFactor;
  const spread = P('booster.wealth_spread');
  const out: BoosterGroup[] = [];
  for (let i = 0; i < n; i++) {
    const wealth = Math.round(mean * (1 - spread + 2 * spread * rng.uniform()) * CENTS);
    out.push({
      id: firstId + i, leaderPersonId: leaderIds[i % leaderIds.length]!, wealthCents: wealth, givingHistoryCents: [],
      mood: P('booster.mood_start'), closeness: rng.uniform(), toldCoachWillLookAway: false, disassociated: false, ties: {},
    });
  }
  // Every pair of groups is tied with one drawn strength, the same both ways (embarrassment travels by ties).
  const ties: Record<number, Record<number, number>> = Object.fromEntries(out.map((g) => [g.id, {}]));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const t = rng.uniform();
      ties[out[i]!.id]![out[j]!.id] = t;
      ties[out[j]!.id]![out[i]!.id] = t;
    }
  }
  return out.map((g) => ({ ...g, ties: ties[g.id]! }));
}

/** One game's result moves mood (L5.4.3): wins above expectation, rivalry weighted (config value). */
export function moodAfterGame(g: BoosterGroup, winsAboveExpectation: number, rivalry: boolean): BoosterGroup {
  const w = rivalry ? P('booster.rivalry_weight') : 1;
  return { ...g, mood: clampMood(g.mood + P('booster.mood_per_result') * w * winsAboveExpectation) };
}

/** Hours of the coach's time this week (E7) raise mood with diminishing returns (T9.3.1 rule 2). */
export function accessGain(hours: number): number {
  if (hours <= 0) return 0;
  return P('booster.access_max_gain') * hours / (hours + P('booster.access_half_hours'));
}

export function moodAfterAccess(g: BoosterGroup, hours: number): BoosterGroup {
  return { ...g, mood: clampMood(g.mood + accessGain(hours)) };
}

/** A donor's request refused politely costs little (L5.4.3). */
export function refusePolitely(g: BoosterGroup): BoosterGroup {
  return { ...g, mood: clampMood(g.mood - P('booster.refusal_cost')) };
}

/** A donor embarrassed costs a lot and travels to other groups by ties (L5.4.3). */
export function embarrass(groups: readonly BoosterGroup[], id: number): BoosterGroup[] {
  const hurt = groups.find((g) => g.id === id);
  if (!hurt) return [...groups];
  const cost = P('booster.embarrass_cost');
  return groups.map((g) => {
    if (g.id === id) return { ...g, mood: clampMood(g.mood - cost) };
    const tie = hurt.ties[g.id] ?? 0;
    return { ...g, mood: clampMood(g.mood - cost * P('booster.embarrass_spread') * tie) };
  });
}

/** A year's giving: a share of wealth scaled by mood (mood 50 gives the base share). Disassociated groups give nothing. */
export function yearlyGiving(g: BoosterGroup): number {
  if (g.disassociated) return 0;
  return Math.round(g.wealthCents * P('booster.yearly_giving_share') * (g.mood / P('booster.mood_start')));
}

export function recordGiving(g: BoosterGroup): BoosterGroup {
  return { ...g, givingHistoryCents: [...g.givingHistoryCents, yearlyGiving(g)] };
}

/** Booster mood the AD reads (L5.4.1): giving-weighted mean of active groups. */
export function programMood(groups: readonly BoosterGroup[]): number {
  const active = groups.filter((g) => !g.disassociated);
  const weight = active.reduce((s, g) => s + g.wealthCents, 0);
  if (weight === 0) return P('booster.mood_start');
  return active.reduce((s, g) => s + g.mood * g.wealthCents, 0) / weight;
}

/**
 * T9.3.1 rule 3 and L5.4.6: the part of a firing cost unhappy, wealthy groups will pay. Share 0 to 50%
 * by mood; each group pays at most a share of its wealth. E4 subtracts this from the firing cost.
 */
export function buyoutFunding(groups: readonly BoosterGroup[], firingCostCents: number): number {
  let paid = 0;
  for (const g of groups) {
    if (g.disassociated || g.mood >= P('booster.unhappy_mood')) continue;
    const share = P('booster.buyout_share_max') * (1 - g.mood / P('booster.unhappy_mood'));
    paid += Math.min(share * firingCostCents, P('booster.buyout_wealth_multiple') * g.wealthCents);
  }
  return Math.min(Math.round(paid), firingCostCents);
}

/** Chance a group pays outside the rules this season (T9.3.1 rule 4). */
export function payChance(g: BoosterGroup, tier: ProgramTier, rivalryLosses: number): number {
  if (g.disassociated) return 0;
  const wealthFactor = g.wealthCents / (P(`booster.wealth_mean_usd.${tier}`) * CENTS);
  const rivalry = 1 + P('booster.pay_per_rivalry_loss') * rivalryLosses;
  const look = g.toldCoachWillLookAway ? P('booster.pay_look_away_multiple') : 1;
  return Math.min(P('booster.pay_base_per_season') * wealthFactor * rivalry * look, P('booster.pay_max_per_season'));
}

/** Who the booster is and where the act lands. */
export interface BoosterActContext {
  readonly teamId: number;
  readonly competitionId: number | null;
  readonly date: WorldDate;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
  readonly leaderOrigin: PersonOrigin;
  readonly headCoachPersonId: number;
  readonly headCoachOrigin: PersonOrigin;
}

function boosterAct(g: BoosterGroup, c: BoosterActContext, coachKnew: boolean, orderedByCoach: boolean): compliance.Act {
  const coach = { personId: c.headCoachPersonId, role: 'head_coach' as const, teamId: c.teamId, origin: c.headCoachOrigin };
  return {
    classId: 'pay_rules',
    actor: { personId: g.leaderPersonId, role: 'booster', teamId: c.teamId, origin: c.leaderOrigin },
    orderedBy: orderedByCoach ? coach : null,
    knew: coachKnew ? [g.leaderPersonId, c.headCoachPersonId] : [g.leaderPersonId],
    date: c.date, competitionId: c.competitionId, gain: P('booster.pay_gain'), tier: c.tier, source: c.source,
  };
}

export type SeasonActResult = {
  readonly state: ComplianceState;
  readonly acted: boolean;
  readonly commit: compliance.CommitResult | null;
};

/**
 * Once a season per group: does the booster act on his own (T9.3.1 rule 4)? This happens at programs
 * whose coaches never asked (T9.3.1 acceptance). The coach is in `knew` only if he signalled he would
 * look away. One draw per call.
 */
export function boosterSeason(state: ComplianceState, g: BoosterGroup, tier: ProgramTier, rivalryLosses: number, rules: RuleSet, sink: EventSink, c: BoosterActContext, rng: RandomStream): SeasonActResult {
  if (!rng.chance(payChance(g, tier, rivalryLosses))) return { state, acted: false, commit: null };
  const commit = compliance.commitAct(state, boosterAct(g, c, g.toldCoachWillLookAway, false), rules, sink);
  return { state: commit.state, acted: commit.ok, commit };
}

export type OfferAnswer = 'decline' | 'ignore' | 'accept';

/** The warning shown before the coach accepts a booster's offer to "help" with a recruit (L8.2.5 step 1). */
export function offerWarning(rules: RuleSet): compliance.Warning {
  return compliance.warningFor('pay_rules', 'head_coach', rules);
}

/**
 * A booster offers to "help" with a recruit (T9.3.1 "What the user sees"). Decline costs a little mood;
 * ignore signals he will look away (raising later chances); accept is the act itself, logged with the
 * coach as the one who ordered it. The same function serves AI coaches.
 */
export function answerOffer(state: ComplianceState, g: BoosterGroup, answer: OfferAnswer, rules: RuleSet, sink: EventSink, c: BoosterActContext): { readonly state: ComplianceState; readonly group: BoosterGroup; readonly commit: compliance.CommitResult | null } {
  if (answer === 'decline') return { state, group: { ...g, mood: clampMood(g.mood - P('booster.decline_cost')) }, commit: null };
  if (answer === 'ignore') return { state, group: { ...g, toldCoachWillLookAway: true }, commit: null };
  const commit = compliance.commitAct(state, boosterAct(g, c, true, true), rules, sink);
  return { state: commit.state, group: { ...g, toldCoachWillLookAway: true }, commit };
}

/** A penalty order bars the group (T9.5.3, 2024 disassociation powers). Its money leaves the budget. */
export function disassociate(g: BoosterGroup): BoosterGroup {
  return { ...g, disassociated: true };
}
