// Compensatory picks (C7.2.2; CBA Article 6 s.2(a) and Appendix V). Every number is a league rule key.
//
// Inputs the caller computes elsewhere: each roster player's Average Yearly Compensation (App. V para 2(a), from
// the cap module), honours (C9) and play share or kicking counts (D14). Who counts as a compensatory free agent
// (UFA, signed with a new club before the deadline, not released, not an excluded contract, App. V paras 1, 6 to
// 11) is decided by the free agency module (G-35) and passed as `qualifies`.
import type { RuleSet } from '@gm/schema';
import { FIRST_ROUND, KEY, PERCENT } from './params.ts';
import type { ClubId, PersonId, PickId } from './types.ts';

export type Participation =
  | { readonly kind: 'snaps'; readonly sharePct: number }
  | { readonly kind: 'punter'; readonly punts: number; readonly inside20: number }
  | { readonly kind: 'kicker'; readonly fieldGoalsAttempted: number; readonly fieldGoalsMade: number };

/** One player on a roster at the end of the regular season (App. V para 2). */
export interface PlayerSeason {
  readonly personId: PersonId;
  readonly averageYearlyCents: number;
  readonly firstTeamAllLeague: boolean;
  readonly allConference: boolean;
  readonly participation: Participation;
}

/** Honours and participation points (App. V para 2(b)). */
export function bonusPoints(p: PlayerSeason, rules: RuleSet): number {
  const honours = p.firstTeamAllLeague ? rules.num(KEY.compPointsAllLeague) : p.allConference ? rules.num(KEY.compPointsAllConference) : 0;
  const q = p.participation;
  let play = 0;
  if (q.kind === 'snaps') play = q.sharePct >= rules.num(KEY.compSnapMinPct) ? Math.floor(q.sharePct) : 0;
  if (q.kind === 'punter') play = q.punts * rules.num(KEY.compPointsPerPunt) + q.inside20 * rules.num(KEY.compPointsPerPuntInside20);
  if (q.kind === 'kicker') play = q.fieldGoalsAttempted * rules.num(KEY.compPointsPerFga) + q.fieldGoalsMade * rules.num(KEY.compPointsPerFgm);
  return honours + play;
}

/**
 * Final Numerical Values (App. V para 2(a) to (c)): rank by Average Yearly Compensation ascending, one point per
 * rank, plus bonus points. Equal pay is broken by person id so the ranking is deterministic (the CBA is silent).
 */
export function finalValues(players: readonly PlayerSeason[], rules: RuleSet): Map<PersonId, number> {
  const ranked = [...players].sort((a, b) => a.averageYearlyCents - b.averageYearlyCents || a.personId - b.personId);
  return new Map(ranked.map((p, i) => [p.personId, i + FIRST_ROUND + bonusPoints(p, rules)]));
}

/** A value's position from the top, as a percent of all players (1 = the very top of 100). */
export function topPercent(value: number, all: readonly number[]): number {
  const above = all.filter((v) => v > value).length;
  return ((above + FIRST_ROUND) * PERCENT) / all.length;
}

/** The round a lost player of this top percent yields, or null outside every bracket (App. V para 3(b)). */
export function bracketRound(topPct: number, rules: RuleSet): number | null {
  for (let r = rules.num(KEY.compFirstRound); r <= rules.num(KEY.rounds); r++) {
    if (topPct <= rules.num(`${KEY.compBracketPrefix}${r}`)) return r;
  }
  return null;
}

/** A free agent who changed clubs in the last signing period, or a CFA acquired by trade (App. V para 3(a)). */
export interface CfaMove {
  readonly personId: PersonId;
  readonly fromClubId: ClubId;
  readonly toClubId: ClubId;
  readonly accruedSeasons: number;
  readonly quarterback: boolean;
  /** UFA signed before the deadline and not excluded (App. V paras 1, 6 to 11), decided by G-35. */
  readonly qualifies: boolean;
}

export interface CompAward {
  readonly pickId: PickId;
  readonly clubId: ClubId;
  readonly round: number;
  readonly kind: 'compensatory' | 'equal_count';
  /** The lost player's final value, which orders picks inside a round; for an equal-count pick, the margin. */
  readonly value: number;
  readonly lostPersonId: PersonId | null;
}

export interface CompLogEntry { readonly clubId: ClubId; readonly lost: number; readonly gained: number; readonly note: string }

export interface CompResult {
  readonly awards: readonly CompAward[];
  /** Supplemental selections needed to bring the total to the number of clubs (CBA Art. 6 s.2(a)). */
  readonly supplementalCount: number;
  readonly log: readonly CompLogEntry[];
}

interface Rated { readonly move: CfaMove; readonly value: number; readonly round: number }

/**
 * Compensatory awards for `year` (C7.2.2 rules 1 to 5).
 * @param values Final Numerical Values of every player on a roster at the end of the regular season.
 */
export function compensatoryAwards(year: number, moves: readonly CfaMove[], values: ReadonlyMap<PersonId, number>, rules: RuleSet): CompResult {
  const all = [...values.values()];
  const top = rules.num(KEY.compCfaTopPct);
  const rated: Rated[] = [];
  for (const m of moves) {
    const value = values.get(m.personId);
    if (!m.qualifies || value === undefined) continue;
    const pct = topPercent(value, all);
    const round = bracketRound(pct, rules);
    if (pct > top || round === null) continue;
    rated.push({ move: m, value, round });
  }
  const clubs = [...new Set(rated.flatMap((r) => [r.move.fromClubId, r.move.toClubId]))].sort((a, b) => a - b);
  const byValue = (a: Rated, b: Rated) => b.value - a.value || a.move.personId - b.move.personId;
  const lastRound = rules.num(KEY.rounds);
  const log: CompLogEntry[] = [];
  let awards: CompAward[] = [];
  for (const club of clubs) {
    const losses = rated.filter((r) => r.move.fromClubId === club).sort(byValue);
    const gains = rated.filter((r) => r.move.toClubId === club).sort(byValue);
    const net = losses.length - gains.length;
    if (net < 0 || losses.length === 0) { log.push({ clubId: club, lost: losses.length, gained: gains.length, note: 'not eligible: gained at least as many as lost' }); continue; }
    if (net === 0) {
      const margin = losses.reduce((s, r) => s + r.value, 0) - gains.reduce((s, r) => s + r.value, 0);
      const earns = margin > rules.num(KEY.compEqualCountMarginPoints);
      log.push({ clubId: club, lost: losses.length, gained: gains.length, note: earns ? `equal count, lost value ahead by ${margin}` : 'equal count, margin too small' });
      if (earns) awards.push({ pickId: `${year}-eq-c${club}`, clubId: club, round: lastRound, kind: 'equal_count', value: margin, lostPersonId: null });
      continue;
    }
    // Offset each loss, highest first, by a gain in an equal or higher bracket (lower or equal round). The
    // lowest such gain is used, which leaves higher gains for later losses (App. V para 3(a)).
    const unused = [...gains];
    const uncovered: Rated[] = [];
    for (const loss of losses) {
      const fits = unused.filter((g) => g.round <= loss.round);
      if (fits.length === 0) { uncovered.push(loss); continue; }
      unused.splice(unused.indexOf(fits[fits.length - 1]!), FIRST_ROUND);
    }
    const earned = uncovered.slice(0, net).map((r) => {
      const veteran = !r.move.quarterback && r.move.accruedSeasons >= rules.num(KEY.compVeteranAccruedSeasons);
      const round = veteran ? Math.max(r.round, rules.num(KEY.compVeteranEarliestRound)) : r.round;
      return { ...r, round };
    }).sort((a, b) => a.round - b.round || byValue(a, b)).slice(0, rules.num(KEY.compMaxPerClub));
    log.push({ clubId: club, lost: losses.length, gained: gains.length, note: `net loss ${net}, ${earned.length} awarded` });
    earned.forEach((r, i) => awards.push({ pickId: `${year}-comp-c${club}-${i + FIRST_ROUND}`, clubId: club, round: r.round, kind: 'compensatory', value: r.value, lostPersonId: r.move.personId }));
  }
  // League-wide limit: keep the highest selections (earliest round, then value), equal-count picks last.
  const kindRank = (a: CompAward) => (a.kind === 'compensatory' ? 0 : FIRST_ROUND);
  awards = awards.sort((a, b) => kindRank(a) - kindRank(b) || a.round - b.round || b.value - a.value || a.clubId - b.clubId).slice(0, rules.num(KEY.compMaxTotal));
  return { awards, supplementalCount: Math.max(0, rules.num(KEY.compMaxTotal) - awards.length), log };
}

/**
 * Supplemental selections (CBA Art. 6 s.2(a)): awarded "based upon Draft selection order". Read here as one each to
 * the clubs earliest in round-one order (Assumption; the CBA gives no further detail).
 */
export function supplementalAwards(year: number, count: number, roundOneOrder: readonly ClubId[], rules: RuleSet): { pickId: PickId; clubId: ClubId; round: number }[] {
  return roundOneOrder.slice(0, count).map((clubId) => ({ pickId: `${year}-supp-c${clubId}`, clubId, round: rules.num(KEY.rounds) }));
}
