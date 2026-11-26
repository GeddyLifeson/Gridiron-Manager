// Final division rank (C3.1.3) and playoff seeding (C3.3.1).
import { KEY, num } from './params.ts';
import { Ledger } from './records.ts';
import { Tiebreaker, type TieLogEntry } from './tiebreak.ts';
import type { ClubPlace, GameResult, RuleValues, TeamId, TieDraw } from './types.ts';

export interface DivisionRanking {
  readonly divisionId: number;
  /** Clubs first to last; ranks are 1, 2, 3, 4 with no shared rank (C3.1.3). */
  readonly order: readonly TeamId[];
}

export interface ConferenceSeeds {
  readonly conferenceId: number;
  /** Seeds 1 to playoff.field_size: division winners first, then wild cards (C3.3.1 rule 3). */
  readonly seeds: readonly TeamId[];
  readonly divisionWinners: readonly TeamId[];
  /** Clubs not seeded, best first ("in the hunt"). */
  readonly rest: readonly TeamId[];
}

export interface SeasonTable {
  readonly ledger: Ledger;
  readonly divisions: readonly DivisionRanking[];
  readonly conferences: readonly ConferenceSeeds[];
  /** Club to its place in its division, 0 first. */
  readonly divisionOrder: ReadonlyMap<TeamId, number>;
  /** Every tie decision, in the order they were made. */
  readonly log: readonly TieLogEntry[];
  /** True when the answer leaned on a points step or coin toss fed by a made-up game (C3.3.2). */
  readonly uncertain: boolean;
}

function unique(xs: readonly number[]): number[] { return [...new Set(xs)]; }

/** Division ranks (C3.1.3) and conference seeds (C3.3.1) from one season's results. */
export function seasonTable(places: readonly ClubPlace[], results: readonly GameResult[], rules: RuleValues, draw: TieDraw): SeasonTable {
  const ledger = new Ledger(places, results, rules);
  const divTb = new Tiebreaker(ledger, rules, draw);
  const divisions: DivisionRanking[] = unique(places.map((p) => p.divisionId)).map((divisionId) => ({
    divisionId,
    order: divTb.orderByPct(places.filter((p) => p.divisionId === divisionId).map((p) => p.id), 'conference'),
  }));
  const divisionOrder = new Map<TeamId, number>();
  for (const d of divisions) d.order.forEach((id, i) => divisionOrder.set(id, i));

  const tb = new Tiebreaker(ledger, rules, draw, { divisionOrder });
  const fieldSize = num(rules, KEY.clubsPerConference);
  const conferences: ConferenceSeeds[] = unique(places.map((p) => p.conferenceId)).map((conferenceId) => {
    const inConf = places.filter((p) => p.conferenceId === conferenceId);
    const confDivs = divisions.filter((d) => inConf.some((p) => p.divisionId === d.divisionId));
    const winners = tb.orderByPct(confDivs.map((d) => d.order[0]!), 'conference');
    const others = tb.orderByPct(inConf.map((p) => p.id).filter((id) => !winners.includes(id)), 'conference');
    const wildCards = Math.max(0, fieldSize - winners.length);
    return { conferenceId, seeds: [...winners, ...others.slice(0, wildCards)], divisionWinners: winners, rest: others.slice(wildCards) };
  });
  return { ledger, divisions, conferences, divisionOrder, log: [...divTb.log, ...tb.log], uncertain: divTb.uncertain || tb.uncertain };
}
