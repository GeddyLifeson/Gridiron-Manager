// This year's selection order (C7.2.1 rules 1 to 5, C7.2.2). Round one follows the hand-off from the standings
// (C3.5.1, `postseason.draftOrder`). Later rounds rotate clubs tied on record inside their group: in a two-club tie
// they swap each round, in a tie of three or more the top club drops to the bottom each round (C7.2.1 rule 4).
// Compensatory picks follow the last regular pick of their round; the equal-count pick (CBA App. V para 5) and
// supplemental selections (CBA Art. 6 s.2(a)) follow the last round's compensatory picks.
import type { RuleSet } from '@gm/schema';
import type { DraftSlot } from '../postseason/draft-order.ts';
import { pickById, regularPickId } from './ledger.ts';
import { FIRST_ROUND, KEY } from './params.ts';
import type { ClubId, Pick, PickKind, PickLedger, Selection } from './types.ts';

/**
 * Groups of clubs tied for rotation: consecutive round-one slots in the same tier with the same record.
 * @param winPct each club's final winning percentage (ties counted as the standings count them).
 */
export function tieGroups(slots: readonly DraftSlot[], winPct: ReadonlyMap<ClubId, number>): ClubId[][] {
  const out: ClubId[][] = [];
  let prev: DraftSlot | null = null;
  for (const s of slots) {
    const same = prev !== null && prev.tier === s.tier && winPct.get(prev.teamId) === winPct.get(s.teamId);
    if (same) out[out.length - 1]!.push(s.teamId); else out.push([s.teamId]);
    prev = s;
  }
  return out;
}

/** Club order for one round: each tied group rotated left by (round - 1). */
export function roundClubOrder(groups: readonly (readonly ClubId[])[], round: number): ClubId[] {
  const shift = round - FIRST_ROUND;
  return groups.flatMap((g) => g.map((_, i) => g[(i + shift) % g.length]!));
}

const AWARD_ORDER: readonly PickKind[] = ['compensatory', 'equal_count', 'supplemental'];

/** Awarded picks at the end of a round: compensatory by the lost player's value (higher first), then the rest. */
function awardedFor(round: number, picks: readonly Pick[], lastRound: number): Pick[] {
  return picks
    .filter((p) => p.kind !== 'regular' && p.status !== 'forfeited' && (p.round === round || (p.kind !== 'compensatory' && round === lastRound)))
    .sort((x, y) => AWARD_ORDER.indexOf(x.kind) - AWARD_ORDER.indexOf(y.kind) || y.compValue - x.compValue || x.id.localeCompare(y.id));
}

/**
 * The full selection list for the ledger's current draft. A forfeited pick is skipped, so its round is one pick
 * shorter (C7.2.1 rule 5). A club holding several picks in a round keeps each at its original club's slot.
 */
export function selectionOrder(slots: readonly DraftSlot[], winPct: ReadonlyMap<ClubId, number>, ledger: PickLedger, rules: RuleSet): Selection[] {
  const year = ledger.currentYear;
  const groups = tieGroups(slots, winPct);
  const lastRound = rules.num(KEY.rounds);
  const thisYear = ledger.picks.filter((p) => p.year === year);
  const out: Selection[] = [];
  for (let round = FIRST_ROUND; round <= lastRound; round++) {
    let inRound = 0;
    const push = (p: Pick) => {
      inRound += FIRST_ROUND;
      out.push({ overall: out.length + FIRST_ROUND, round, inRound, pickId: p.id, kind: p.kind, originalClubId: p.originalClubId, ownerClubId: p.ownerClubId });
    };
    for (const club of roundClubOrder(groups, round)) {
      const p = pickById(ledger, regularPickId(year, round, club));
      if (p && p.status !== 'forfeited') push(p);
    }
    for (const p of awardedFor(round, thisYear, lastRound)) push(p);
  }
  return out;
}

/** Check the order against the ledger: every open pick of the year appears once, nothing else does. */
export function orderProblems(order: readonly Selection[], ledger: PickLedger): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of order) {
    if (seen.has(s.pickId)) out.push(`pick ${s.pickId} appears twice`);
    seen.add(s.pickId);
  }
  for (const p of ledger.picks) {
    if (p.year !== ledger.currentYear || p.status === 'forfeited') continue;
    if (!seen.has(p.id)) out.push(`pick ${p.id} has no selection`);
  }
  return out;
}
