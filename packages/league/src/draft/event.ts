// The draft event (C7.3.1, M4.5.1): pick by pick under a clock that always runs. There is no pause (C7.3.1 rule 5,
// Marlon's ruling that clocks always run). A club whose clock expires may still pick later, but the next club goes
// on the clock at once and may pick first (rule 2). A trade involving a pick on the clock must complete before
// that clock runs out (C7.2.3 rule 4). Every pick of the user's club writes a decision log entry, silence included
// (C7.3.1 acceptance, M4.5.1 acceptance).
//
// Time is whole seconds on one running world clock (`nowSec`). Draft days open at the times the calendar gives.
import type { RuleSet } from '@gm/schema';
import { pickById, tradePicks, usePick, type PickTrade } from './ledger.ts';
import { FIRST_ROUND, KEY, SECONDS_PER_MINUTE } from './params.ts';
import { refuse, type ClubId, type DraftRefusal, type PersonId, type PickLedger, type Selection } from './types.ts';

/** Time per pick by round (C7.3.1 rule 1), in seconds. Compensatory picks take their round's time. */
export function clockLimitSec(round: number, rules: RuleSet): number {
  const last = rules.num(KEY.rounds);
  const min = round === FIRST_ROUND ? rules.num(KEY.clockR1)
    : round === FIRST_ROUND + FIRST_ROUND ? rules.num(KEY.clockR2)
      : round === last ? rules.num(KEY.clockLast) : rules.num(KEY.clockMiddle);
  return min * SECONDS_PER_MINUTE;
}

/** Draft day (1, 2 or 3) a round is held on (C7.3.1 rule 3). */
export function dayOfRound(round: number, rules: RuleSet): number {
  if (round >= rules.num(KEY.day3FirstRound)) return FIRST_ROUND + FIRST_ROUND + FIRST_ROUND;
  if (round >= rules.num(KEY.day2FirstRound)) return FIRST_ROUND + FIRST_ROUND;
  return FIRST_ROUND;
}

/**
 * The head coach user's stance when his club picks (M4.5.1, M3.6.2). `made`: he holds final say and made the pick
 * himself. Without final say he may mention, recommend or insist on a player or a trade, or stay silent.
 */
export type UserStance =
  | { readonly kind: 'made' }
  | { readonly kind: 'mention' | 'recommend' | 'insist'; readonly personId: PersonId | null; readonly trade: boolean }
  | { readonly kind: 'silent' };

/** Who filed the pick: the club's decider, the user himself, or the club's fallback after an expired user clock. */
export type DecidedBy = 'club' | 'user' | 'fallback_after_expiry';

export interface MadePick {
  readonly personId: PersonId;
  readonly clubId: ClubId;
  readonly atSec: number;
  /** Filed after the club's clock expired (C7.3.1 rule 2). */
  readonly late: boolean;
  readonly decidedBy: DecidedBy;
}

export interface DraftLogEntry {
  readonly overall: number;
  readonly clubId: ClubId;
  readonly personId: PersonId;
  readonly stance: UserStance;
  readonly decidedBy: DecidedBy;
  readonly late: boolean;
  readonly atSec: number;
}

export interface DraftWire {
  readonly seq: number;
  readonly atSec: number;
  readonly kind: 'on_clock' | 'pick' | 'late_pick' | 'clock_expired' | 'trade' | 'day_closed' | 'draft_complete';
  readonly clubId: ClubId | null;
  readonly detail: Readonly<Record<string, string | number | boolean>>;
}

export interface DraftState {
  readonly year: number;
  readonly userClubId: ClubId | null;
  readonly ledger: PickLedger;
  readonly order: readonly Selection[];
  /** One entry per selection, null until filled. */
  readonly made: readonly (MadePick | null)[];
  /** Selections whose clock ran out and are still open. */
  readonly expired: readonly number[];
  /** Index of the selection on the clock, or null between days or at the end. */
  readonly onClock: number | null;
  readonly clockStartSec: number;
  /** Day waiting to open, or null. */
  readonly waitingForDay: number | null;
  readonly day: number;
  readonly nowSec: number;
  readonly available: readonly PersonId[];
  readonly log: readonly DraftLogEntry[];
  readonly wire: readonly DraftWire[];
}

export type DraftStep = { ok: true; state: DraftState } | DraftRefusal;

const ownerOf = (s: DraftState, i: number): ClubId => pickById(s.ledger, s.order[i]!.pickId)!.ownerClubId;

function post(s: DraftState, kind: DraftWire['kind'], clubId: ClubId | null, detail: DraftWire['detail']): DraftState {
  return { ...s, wire: [...s.wire, { seq: s.wire.length + FIRST_ROUND, atSec: s.nowSec, kind, clubId, detail }] };
}

/** Put the next unfilled selection after `from` on the clock at `atSec`, or wait for its day. */
function nextOnClock(s: DraftState, from: number, atSec: number, rules: RuleSet): DraftState {
  let i = from + FIRST_ROUND;
  while (i < s.order.length && s.made[i] !== null) i++;
  if (i >= s.order.length) {
    const done = { ...s, onClock: null, waitingForDay: null };
    return isComplete(done) ? post(done, 'draft_complete', null, {}) : done;
  }
  const day = dayOfRound(s.order[i]!.round, rules);
  if (day !== s.day) return post({ ...s, onClock: null, waitingForDay: day }, 'day_closed', null, { day: s.day });
  return post({ ...s, onClock: i, clockStartSec: atSec }, 'on_clock', ownerOf({ ...s, onClock: i }, i), { overall: s.order[i]!.overall, limitSec: clockLimitSec(s.order[i]!.round, rules) });
}

/** Open the draft with the first selection on the clock at `startSec`. */
export function openDraft(input: { ledger: PickLedger; order: readonly Selection[]; pool: readonly PersonId[]; userClubId: ClubId | null; startSec: number }, rules: RuleSet): DraftState {
  const s: DraftState = {
    year: input.ledger.currentYear, userClubId: input.userClubId, ledger: input.ledger, order: input.order,
    made: input.order.map(() => null), expired: [], onClock: null, clockStartSec: input.startSec, waitingForDay: null,
    day: FIRST_ROUND, nowSec: input.startSec, available: [...input.pool], log: [], wire: [],
  };
  return nextOnClock(s, -FIRST_ROUND, input.startSec, rules);
}

/** When the clock on the current selection runs out, or null. */
export function clockExpiresAt(s: DraftState, rules: RuleSet): number | null {
  return s.onClock === null ? null : s.clockStartSec + clockLimitSec(s.order[s.onClock]!.round, rules);
}

/** Seconds left on the clock at `nowSec`. */
export function clockRemainingSec(s: DraftState, rules: RuleSet): number | null {
  const at = clockExpiresAt(s, rules);
  return at === null ? null : Math.max(0, at - s.nowSec);
}

/** Let time run to `toSec`. Clocks that run out expire, and the next club goes on the clock at once. */
export function advance(s: DraftState, toSec: number, rules: RuleSet): DraftState {
  if (toSec < s.nowSec) throw new Error('league.draft: time runs forward only');
  let cur = s;
  for (let at = clockExpiresAt(cur, rules); at !== null && at <= toSec; at = clockExpiresAt(cur, rules)) {
    const i = cur.onClock!;
    cur = post({ ...cur, nowSec: at, expired: [...cur.expired, i] }, 'clock_expired', ownerOf(cur, i), { overall: cur.order[i]!.overall });
    cur = nextOnClock(cur, i, at, rules);
  }
  return { ...cur, nowSec: toSec };
}

/** Open the next draft day at `atSec` (the calendar's start time for that day). */
export function openDay(s: DraftState, day: number, atSec: number, rules: RuleSet): DraftStep {
  if (s.waitingForDay !== day) return refuse('C7.3.1', `day ${day} is not the next day`, 'open the day the draft is waiting for');
  if (atSec < s.nowSec) return refuse('C7.3.1', 'a day cannot open in the past', 'open it at or after the current time');
  const moved = { ...s, nowSec: atSec, day, waitingForDay: null };
  const from = moved.made.findIndex((m, i) => m === null && !moved.expired.includes(i));
  if (from < 0) return { ok: true, state: moved };
  return { ok: true, state: nextOnClock(moved, from - FIRST_ROUND, atSec, rules) };
}

export interface PickFiling {
  readonly clubId: ClubId;
  readonly personId: PersonId;
  readonly atSec: number;
  readonly decidedBy?: DecidedBy;
  /** Required context for the user's club; missing means silence (M4.5.1). */
  readonly stance?: UserStance;
}

/** File a pick (C7.3.1). The on-clock club picks on time; a club with an expired clock may pick at any time after. */
export function submitPick(s0: DraftState, f: PickFiling, rules: RuleSet): DraftStep {
  if (f.atSec < s0.nowSec) return refuse('C7.3.1', 'a pick cannot be filed in the past', 'file it now');
  const s = advance(s0, f.atSec, rules);
  const onTime = s.onClock !== null && ownerOf(s, s.onClock) === f.clubId;
  const lateIdx = s.expired.filter((i) => ownerOf(s, i) === f.clubId).sort((a, b) => a - b)[0];
  const idx = onTime ? s.onClock! : lateIdx;
  if (idx === undefined) return refuse('C7.3.1', `club ${f.clubId} is not on the clock`, 'wait for the club\'s pick');
  if (!s.available.includes(f.personId)) return refuse('C7.3.1', `player ${f.personId} is not available`, 'pick a player still on the board');
  const late = !onTime;
  const decidedBy = f.decidedBy ?? 'club';
  const made: MadePick = { personId: f.personId, clubId: f.clubId, atSec: f.atSec, late, decidedBy };
  const sel = s.order[idx]!;
  let next: DraftState = {
    ...s,
    made: s.made.map((m, i) => (i === idx ? made : m)),
    expired: s.expired.filter((i) => i !== idx),
    available: s.available.filter((p) => p !== f.personId),
    ledger: usePick(s.ledger, sel.pickId, f.personId),
  };
  if (s.userClubId !== null && f.clubId === s.userClubId) {
    next = { ...next, log: [...next.log, { overall: sel.overall, clubId: f.clubId, personId: f.personId, stance: f.stance ?? { kind: 'silent' }, decidedBy, late, atSec: f.atSec }] };
  }
  next = post(next, late ? 'late_pick' : 'pick', f.clubId, { overall: sel.overall, round: sel.round, personId: f.personId, pickId: sel.pickId });
  if (onTime) next = nextOnClock(next, idx, f.atSec, rules);
  else if (isComplete(next)) next = post(next, 'draft_complete', null, {});
  return { ok: true, state: next };
}

/** A pick trade during the draft (C7.2.3). Picks already used or whose clock ran out cannot move. */
export function tradeDuringDraft(s0: DraftState, t: PickTrade, atSec: number, rules: RuleSet): DraftStep {
  if (atSec < s0.nowSec) return refuse('C7.2.3', 'a trade cannot be filed in the past', 'file it now');
  const s = advance(s0, atSec, rules);
  const moving = new Set([...t.firstGives, ...t.secondGives]);
  for (const i of s.expired) {
    if (moving.has(s.order[i]!.pickId)) return refuse('C7.2.3', `pick ${s.order[i]!.pickId}: its clock ran out before the trade completed`, 'a trade during a club\'s turn must complete before its clock runs out');
  }
  const r = tradePicks(s.ledger, t);
  if (!r.ok) return r;
  const next = post({ ...s, ledger: r.ledger }, 'trade', t.clubs[0], { tradeId: t.id, withClub: t.clubs[1], picks: [...moving].join(',') });
  return { ok: true, state: next };
}

export const isComplete = (s: DraftState): boolean => s.made.every((m) => m !== null);

/** Draft rights won (C7.4.1 rule 1): person to club, in pick order. */
export function draftRights(s: DraftState): { personId: PersonId; clubId: ClubId; overall: number; round: number }[] {
  return s.order.flatMap((sel, i) => {
    const m = s.made[i];
    return m ? [{ personId: m.personId, clubId: m.clubId, overall: sel.overall, round: sel.round }] : [];
  });
}

/** Read the board view a decider gets: the selection and whether its clock already ran out. */
export interface DeciderView { readonly state: DraftState; readonly selection: Selection; readonly late: boolean; readonly clubId: ClubId }

/** A club's decision maker for one pick: K7 for AI clubs, the user's personnel man after the user's clock expires. */
export interface DraftDecider {
  choose(view: DeciderView): { readonly personId: PersonId; readonly thinkSec: number; readonly stance?: UserStance };
}

export interface RunOptions {
  /** Decider for a club, or null when the user decides that pick himself. `late` is true for an expired slot. */
  readonly deciderFor: (clubId: ClubId, late: boolean) => DraftDecider | null;
  /** Start time of each draft day (C4.2.5 via the calendar). */
  readonly dayStartSec: (day: number) => number;
}

/**
 * Run the draft until it ends or the user is on the clock. Days on which the user has no pick are advanced
 * (C7.3.1 rule 6). The clock keeps running while the user decides: the caller advances it with real time.
 */
export function runDraft(s0: DraftState, opt: RunOptions, rules: RuleSet): { state: DraftState; awaitingUser: boolean } {
  let s = s0;
  for (;;) {
    if (isComplete(s)) return { state: s, awaitingUser: false };
    const late = [...s.expired].sort((a, b) => a - b)[0];
    if (late !== undefined) {
      const club = ownerOf(s, late);
      const d = opt.deciderFor(club, true);
      if (d) {
        const c = d.choose({ state: s, selection: s.order[late]!, late: true, clubId: club });
        const decidedBy: DecidedBy = s.userClubId === club ? 'fallback_after_expiry' : 'club';
        const r = submitPick(s, { clubId: club, personId: c.personId, atSec: s.nowSec, decidedBy, ...(c.stance ? { stance: c.stance } : {}) }, rules);
        if (!r.ok) throw new Error(`league.draft: late pick refused: ${r.message}`);
        s = r.state;
        continue;
      }
    }
    if (s.waitingForDay !== null) {
      const r = openDay(s, s.waitingForDay, Math.max(s.nowSec, opt.dayStartSec(s.waitingForDay)), rules);
      if (!r.ok) throw new Error(`league.draft: ${r.message}`);
      s = r.state;
      continue;
    }
    if (s.onClock === null) return { state: s, awaitingUser: true };
    const club = ownerOf(s, s.onClock);
    const d = opt.deciderFor(club, false);
    if (!d) return { state: s, awaitingUser: true };
    const c = d.choose({ state: s, selection: s.order[s.onClock]!, late: false, clubId: club });
    const r = submitPick(s, { clubId: club, personId: c.personId, atSec: Math.max(s.nowSec, s.clockStartSec + Math.max(0, c.thinkSec)), ...(c.stance ? { stance: c.stance } : {}) }, rules);
    if (!r.ok) throw new Error(`league.draft: pick refused: ${r.message}`);
    s = r.state;
  }
}

/** The simplest decider: the best player left on a club's board (the GM's board order, M4.2.1). */
export function boardDecider(board: (clubId: ClubId) => readonly PersonId[], thinkSec: number): DraftDecider {
  return {
    choose: ({ state, clubId }) => {
      const pick = board(clubId).find((p) => state.available.includes(p)) ?? state.available[0];
      if (pick === undefined) throw new Error('league.draft: the pool is empty');
      return { personId: pick, thinkSec };
    },
  };
}
