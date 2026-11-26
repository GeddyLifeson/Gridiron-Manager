// Builds the draft room view (C7.3.1, M4.5.1, C7.5.1, M1.4.1) from the league draft state (G-34), the club's
// board order from its general manager or personnel man (G-76 `buildBoard`), the club's needs (G-76
// `blendNeeds`), offers on the table and the fitted pick value chart. Pure: same input, same view.
import type { RuleSet } from '@gm/schema';
import { draft, market } from '@gm/league';
import type { gm } from '@gm/front-office';
import type { scouting } from '@gm/people';
import { authorityFor } from './authority.ts';
import { observedGrade } from './grade.ts';
import { param } from './params.ts';
import type { BoardLine, ClockView, DraftRoomView, HeldPick, LogLine, NeedLine, NeedWord, OfferCard, PickLabel, PickLine, TickerLine } from './types.ts';

export interface DraftProspect {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly school: string | null;
  /** The club's role grade cell for him (G-19 `gradeCells`), or null when nobody watched. */
  readonly grade: scouting.GradeCell | null;
  /** The staff's potential read in words (G-19 `potentialRead`, MA-48), or null. */
  readonly potential: scouting.PotentialRead | null;
  readonly consensusRank: number;
}

/** A pick trade offered to the user's club. `theyGive` comes to the user's club; `theyGet` leaves it. */
export interface DraftOffer {
  readonly id: string;
  readonly withClubId: number;
  readonly theyGive: readonly string[];
  readonly theyGet: readonly string[];
}

export interface DraftRoomInput {
  readonly clubId: number;
  readonly state: draft.DraftState;
  readonly rules: RuleSet;
  readonly power: gm.Power;
  readonly clubNames: Readonly<Record<string, string>>;
  readonly prospects: readonly DraftProspect[];
  /** The club's board order, best first (M4.2.1). Only the order is shown, never the score. */
  readonly board: readonly number[];
  readonly needs: readonly gm.Need[];
  readonly offers: readonly DraftOffer[];
  readonly chart: draft.PickValueChart;
  /** Insists the user has made this draft (M4.4.1 rule 4). */
  readonly insistsMade: number;
  /** The user's stated stance for the club's next pick, or null. */
  readonly stance: draft.UserStance | null;
}

export function needWord(need: number): NeedWord {
  if (need >= param('draft_room.need_high')) return 'high';
  if (need >= param('draft_room.need_some')) return 'some';
  return 'low';
}

export function ownerOfSelection(s: draft.DraftState, index: number): number {
  const sel = s.order[index]!;
  return draft.pickById(s.ledger, sel.pickId)?.ownerClubId ?? sel.ownerClubId;
}

/** Overall slot of each current-year pick, from the selection order. */
export function slotIndex(s: draft.DraftState): Map<string, number> {
  return new Map(s.order.map((sel) => [sel.pickId, sel.overall]));
}

export function buildDraftRoomView(input: DraftRoomInput): DraftRoomView {
  const { state: s, rules, clubId } = input;
  const name = (id: number | null | undefined): string => (id === null || id === undefined ? '' : input.clubNames[String(id)] ?? `#${id}`);
  const cards = new Map(input.prospects.map((p) => [p.personId, p]));
  const person = (id: number) => cards.get(id);
  const slots = slotIndex(s);

  let clock: ClockView | null = null;
  if (s.onClock !== null) {
    const sel = s.order[s.onClock]!;
    const owner = ownerOfSelection(s, s.onClock);
    clock = {
      overall: sel.overall, round: sel.round, inRound: sel.inRound, kind: sel.kind, clubId: owner, clubName: name(owner), userOnClock: owner === clubId,
      secondsLeft: draft.clockRemainingSec(s, rules) ?? 0, limitSec: draft.clockLimitSec(sel.round, rules), day: s.day,
    };
  }

  const takenBy = new Map<number, { overall: number; clubId: number }>();
  const picks: PickLine[] = [];
  s.order.forEach((sel, i) => {
    const m = s.made[i];
    if (!m) return;
    takenBy.set(m.personId, { overall: sel.overall, clubId: m.clubId });
    const p = person(m.personId);
    picks.push({
      overall: sel.overall, round: sel.round, inRound: sel.inRound, clubId: m.clubId, clubName: name(m.clubId), personId: m.personId,
      name: p?.name ?? `#${m.personId}`, position: p?.position ?? '', late: m.late, mine: m.clubId === clubId,
    });
  });

  const board: BoardLine[] = input.board.map((personId, i) => {
    const p = person(personId);
    const t = takenBy.get(personId);
    return {
      rank: i + 1, personId, name: p?.name ?? `#${personId}`, position: p?.position ?? '', school: p?.school ?? null,
      grade: observedGrade(p?.grade), potential: p?.potential ? { text: p.potential.text, evaluator: p.potential.evaluator } : null, consensusRank: p?.consensusRank ?? 0,
      taken: t ? { overall: t.overall, clubId: t.clubId, clubName: name(t.clubId) } : null,
    };
  });

  const available = new Set(s.available);
  const lean = input.board.filter((id) => available.has(id)).slice(0, param('draft_room.lean_top'))
    .map((id) => ({ personId: id, name: person(id)?.name ?? `#${id}`, position: person(id)?.position ?? '' }));

  const held: HeldPick[] = [];
  for (let year = s.ledger.currentYear; year <= s.ledger.lastYear; year++) {
    for (const p of draft.picksOf(s.ledger, clubId, year)) {
      held.push({
        pickId: p.id, year: p.year, round: p.round, overall: year === s.ledger.currentYear ? slots.get(p.id) ?? null : null, kind: p.kind, status: p.status,
        fromClubName: p.originalClubId === clubId ? null : name(p.originalClubId), locked: p.lockedBy !== null,
      });
    }
  }
  held.sort((a, b) => a.year - b.year || (a.overall ?? Infinity) - (b.overall ?? Infinity) || a.round - b.round || (a.pickId < b.pickId ? -1 : 1));

  const needs: NeedLine[] = input.needs.map((n) => ({ position: n.position, word: needWord(n.need), frame: n.frame, coachAsked: n.coachNeed !== null }));

  const onClockPick = s.onClock !== null ? s.order[s.onClock]!.pickId : null;
  const label = (id: string): PickLabel => {
    const p = draft.pickById(s.ledger, id);
    return { pickId: id, year: p?.year ?? s.year, round: p?.round ?? 0, overall: slots.get(id) ?? null };
  };
  const pickList = (ids: readonly string[]) => ids.map((id) => draft.pickById(s.ledger, id)).filter((p): p is draft.Pick => !!p);
  const offers: OfferCard[] = input.offers.map((o) => {
    const t = draft.offerTotals(input.chart, pickList(o.theyGet), pickList(o.theyGive), s.ledger, s.ledger.clubIds.length, rules, (id) => slots.get(id));
    return {
      id: o.id, withClubId: o.withClubId, withClubName: name(o.withClubId), give: o.theyGet.map(label), get: o.theyGive.map(label),
      giveTotal: t.give, getTotal: t.get, personnelLean: t.get > t.give ? 'take' : 'pass',
      beforeClockEnds: onClockPick !== null && [...o.theyGive, ...o.theyGet].includes(onClockPick),
    };
  });

  const ticker: TickerLine[] = [...s.wire].reverse().filter((w) => w.kind !== 'on_clock').slice(0, param('draft_room.ticker_length')).map((w) => {
    const pid = typeof w.detail.personId === 'number' ? w.detail.personId : null;
    const withClub = typeof w.detail.withClub === 'number' ? w.detail.withClub : null;
    return {
      seq: w.seq, atSec: w.atSec, kind: w.kind, clubName: w.clubId === null ? null : name(w.clubId),
      overall: typeof w.detail.overall === 'number' ? w.detail.overall : null,
      personName: pid === null ? null : person(pid)?.name ?? `#${pid}`, withClubName: withClub === null ? null : name(withClub),
    };
  });

  const log: LogLine[] = s.log.filter((e) => e.clubId === clubId).map((e) => ({
    overall: e.overall, personName: person(e.personId)?.name ?? `#${e.personId}`, stance: e.stance.kind, decidedBy: e.decidedBy, late: e.late,
  }));

  return {
    clubId, year: s.year, authority: authorityFor(input.power, 'final_say_draft'), clock, waitingForDay: s.waitingForDay, complete: draft.isComplete(s),
    userExpired: s.expired.some((i) => ownerOfSelection(s, i) === clubId), board, lean, picks, held, needs, offers, ticker, log,
    stance: input.stance, insistsMade: input.insistsMade, nextInsist: market.insistWeight(input.insistsMade + 1) >= 1 ? 'full' : 'reduced',
  };
}
