// Draft order hand-off (C3.5.1): the selection order for the next draft, handed to C7 (G-34).
// Tiers: clubs out of the playoffs first, then losers by the round they lost in, then the champion.
// Inside a tier: worse record first; equal records: lower strength of schedule first; then the
// division, conference or interconference tiebreakers, the club that would lose the tie picking first.
// For three or more clubs from different conferences this orders the clubs best first and reverses
// that, which is the same order as research 3f(B)(ii)'s repeated "lowest club" search when every
// step separates one club; see the PR notes. Later-round rotation of tied clubs (1 of 3) belongs to C7.
import { Ledger } from '../standings/records.ts';
import { Tiebreaker, type TieLogEntry } from '../standings/tiebreak.ts';
import type { ClubPlace, GameResult, RuleValues, TeamId, TieDraw } from '../standings/types.ts';

export interface DraftSlot {
  readonly pick: number;
  readonly teamId: TeamId;
  /** 0 for clubs out of the playoffs, else the round lost in; champion is the last round + 1. */
  readonly tier: number;
}

export interface DraftOrder { readonly slots: readonly DraftSlot[]; readonly log: readonly TieLogEntry[] }

/**
 * @param roundLost postseason round each playoff loser lost in (from `roundLost(bracket)`).
 * @param champion the league champion.
 * @param divisionOrder division places, from the season table, for the wild-card tiebreak's first step.
 */
export function draftOrder(
  places: readonly ClubPlace[], results: readonly GameResult[], rules: RuleValues, draw: TieDraw,
  roundLost: ReadonlyMap<TeamId, number>, champion: TeamId, divisionOrder?: ReadonlyMap<TeamId, number>,
): DraftOrder {
  const ledger = new Ledger(places, results, rules);
  const tb = new Tiebreaker(ledger, rules, draw, divisionOrder ? { divisionOrder } : {});
  const lastRound = Math.max(0, ...roundLost.values());
  const tierOf = (id: TeamId): number => (id === champion ? lastRound + 1 : roundLost.get(id) ?? 0);

  const tiers = new Map<number, TeamId[]>();
  for (const p of places) tiers.set(tierOf(p.id), [...(tiers.get(tierOf(p.id)) ?? []), p.id]);
  const out: DraftSlot[] = [];
  for (const tier of [...tiers.keys()].sort((a, b) => a - b)) {
    const clubs = tiers.get(tier)!;
    const key = (id: TeamId) => `${ledger.pct(id)}|${ledger.strengthOfSchedule(id)}`;
    const groups = new Map<string, TeamId[]>();
    for (const c of clubs) groups.set(key(c), [...(groups.get(key(c)) ?? []), c]);
    const ordered = [...groups.values()].sort((a, b) => ledger.pct(a[0]!) - ledger.pct(b[0]!) || ledger.strengthOfSchedule(a[0]!) - ledger.strengthOfSchedule(b[0]!));
    for (const g of ordered) {
      const worstFirst = g.length === 1 ? g : tb.orderTied(g, 'league').reverse();
      for (const id of worstFirst) out.push({ pick: out.length + 1, teamId: id, tier });
    }
  }
  return { slots: out, log: tb.log };
}
