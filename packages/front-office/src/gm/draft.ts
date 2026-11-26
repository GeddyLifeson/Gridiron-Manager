// K7.4.3 the draft: each general manager's board and his choice on the clock. The event, the clock and pick
// trades are the league draft module's (C7); this file supplies the decisions. Teams do not know each other's
// boards (rule 4): what others may do is guessed from the public consensus order only.
import type { draft } from '@gm/league';
import type { GmProfile } from './profile.ts';
import { needAt, type Need } from './needs.ts';
import { P } from './params.ts';
import { playerWorth } from './value.ts';
import type { PersonId, PlayerView, ValueContext } from './types.ts';

export interface Prospect extends PlayerView {
  /** Rank on the head coach's own list, for players his staff scouted (M4), else null. */
  readonly coachRank: number | null;
  /** Rank in the public consensus (media boards), all any club knows of the others' opinions. */
  readonly consensusRank: number;
}

export interface BoardRow { readonly personId: PersonId; readonly score: number; readonly value: number; readonly rank: number }

/** Rule 1: the need bonus is small early and larger late (5 percent rising to 20 percent by the last round). */
export function needBonusShare(round: number, rounds: number): number {
  const t = rounds <= 1 ? 0 : (Math.min(round, rounds) - 1) / (rounds - 1);
  return P('draft.needBonusFirst') + (P('draft.needBonusLast') - P('draft.needBonusFirst')) * t;
}

/**
 * Rules 1 and 2: score = projectedValue x fit + needBonus (fit is inside the K7.2.2 value), over the rookie
 * contract's years; then the coach's ranking is blended at `coachVoiceWeight` for players his staff scouted.
 */
export function buildBoard(gm: GmProfile, pool: readonly Prospect[], needs: readonly Need[], ctx: ValueContext, round: number, rounds: number, contractYears: number, w: number = gm.coachVoiceWeight): BoardRow[] {
  const share = needBonusShare(round, rounds);
  const scored = pool.map((v) => {
    const value = playerWorth(gm, v, ctx, contractYears).value;
    return { v, value, score: value * (1 + share * needAt(needs, v.position)) };
  }).sort((a, b) => b.score - a.score || a.v.personId - b.v.personId);
  return scored
    .map((s, i) => ({ ...s, own: i + 1, blended: s.v.coachRank === null ? i + 1 : (1 - w) * (i + 1) + w * s.v.coachRank, pushed: s.v.coachRank === null ? 0 : w }))
    // Equal places go to the coach's man in proportion to his voice, then to the general manager's own order.
    .sort((a, b) => a.blended - b.blended || b.pushed - a.pushed || a.own - b.own)
    .map((s, i) => ({ personId: s.v.personId, score: s.score, value: s.value, rank: i + 1 }));
}

/** An offer to move down that is on the table: its net in his own chart points (trade.ts `answer`). */
export interface DownOffer { readonly id: string; readonly net: number }

export type ClockChoice =
  | { readonly kind: 'pick'; readonly personId: PersonId; readonly passedOn: readonly PersonId[] }
  | { readonly kind: 'trade_down'; readonly offerId: string; readonly fallback: PersonId }
  | { readonly kind: 'seek_trade_up'; readonly personId: PersonId; readonly worthUpTo: number; readonly fallback: PersonId };

export interface ClockInput {
  /** His board over the players still available, best first. */
  readonly board: readonly BoardRow[];
  readonly offers: readonly DownOffer[];
  /** Public consensus rank of each available player (rule 4). */
  readonly consensusRank: ReadonlyMap<PersonId, number>;
  /** True when it is his pick now; false when he is waiting and may move up. */
  readonly onClock: boolean;
  /** Picks until his next selection (0 when on the clock). */
  readonly picksUntilMine: number;
}

/**
 * Rule 3. On the clock: take the top available, or move down when the top several are within 3 percent of each
 * other and an offer with a gain exists. Waiting: look to move up when one player stands well above the rest
 * and the consensus says he will not last.
 */
export function onTheClock(input: ClockInput): ClockChoice {
  const top = input.board[0];
  if (!top) throw new Error('frontOffice.gm: the board is empty');
  const group = input.board.slice(0, P('draft.tradeDownGroup'));
  if (input.onClock) {
    const tight = group.length >= P('draft.tradeDownGroup') && group.every((r) => r.score >= top.score * (1 - P('draft.tradeDownWithin')));
    const best = [...input.offers].filter((o) => o.net > 0).sort((a, b) => b.net - a.net || (a.id < b.id ? -1 : 1))[0];
    if (tight && best) return { kind: 'trade_down', offerId: best.id, fallback: top.personId };
    return { kind: 'pick', personId: top.personId, passedOn: group.slice(1).map((r) => r.personId) };
  }
  const next = input.board[1];
  const standsAlone = !next || top.score >= next.score * (1 + P('draft.tradeUpGap'));
  const gone = (input.consensusRank.get(top.personId) ?? Infinity) <= input.picksUntilMine;
  if (standsAlone && gone && next) return { kind: 'seek_trade_up', personId: top.personId, worthUpTo: top.value - next.value, fallback: top.personId };
  return { kind: 'pick', personId: top.personId, passedOn: [] };
}

/**
 * The league draft event's decider for an AI club (C7.3.1). `boardFor` returns the club's board for the
 * selection's round; the pick clock always runs, so `thinkSec` is the time the club takes.
 */
export function draftDecider(boardFor: (clubId: number, round: number, available: readonly PersonId[]) => readonly BoardRow[], thinkSec: number): draft.DraftDecider {
  return {
    choose: ({ state, selection, clubId }) => {
      const board = boardFor(clubId, selection.round, state.available);
      const pick = board.find((r) => state.available.includes(r.personId))?.personId ?? state.available[0];
      if (pick === undefined) throw new Error('frontOffice.gm: the pool is empty');
      return { personId: pick, thinkSec };
    },
  };
}
