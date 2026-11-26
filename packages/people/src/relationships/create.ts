// Edge creation from shared events (X7.1.1 rules 1 to 4) and the tie store.
// Every tie made here names the event that formed it; a later shared event of the same kind grows the
// tie instead of making a second one (X7.2.2 rule 1).
import type { WorldDate } from '@gm/schema';
import { applyEvent, createTie, dayNumber, settleTie, tieKey, type DecayLoyalty, type EdgeKind, type Tie } from './edges.ts';
import { rp } from './params.ts';

/** All ties of a world or a team, keyed by `tieKey`. Iteration order is insertion order (deterministic). */
export class TieStore {
  /** Over an existing map (a world's plain state, `world.people` binding): the store reads and writes it in place. */
  constructor(private readonly ties: Map<string, Tie> = new Map()) {}

  get size(): number { return this.ties.size; }
  get(key: string): Tie | undefined { return this.ties.get(key); }
  find(kind: EdgeKind, a: number, b: number | null, bTeamId: number | null = null, promiseId: number | null = null): Tie | undefined {
    return this.ties.get(tieKey({ kind, a, b, bTeamId, promiseId }));
  }
  put(t: Tie): void { this.ties.set(tieKey(t), t); }
  delete(t: Tie): void { this.ties.delete(tieKey(t)); }
  all(): Tie[] { return [...this.ties.values()]; }
  /** Every tie in which the person is a party. */
  of(personId: number): Tie[] { return this.all().filter((t) => t.a === personId || t.b === personId); }
  /** Ties between two people, any kind, either orientation. */
  between(x: number, y: number): Tie[] { return this.all().filter((t) => (t.a === x && t.b === y) || (t.a === y && t.b === x)); }
}

/** Fit and loyalty lookups the caller supplies (fit from `fit.ts`, loyalty from X1 facets). */
export interface PairContext {
  readonly fitOf: (a: number, b: number) => number;
  readonly sociabilityOf: (id: number) => number | null;
  readonly loyaltyOf: (id: number) => number | null;
  readonly userId: number | null;
}

/** A shared event that forms or grows a tie. */
export interface FormingEvent {
  readonly eventId: number;
  readonly date: WorldDate;
  /** Memory strength of the event for its parties (X6.1.1), used when the tie already exists. */
  readonly memoryStrength: number;
  /**
   * First day the parties were together for this event (a season's first day). Being on one staff or
   * roster is contact all season (X7.2.2 rule 3), so decay is counted only up to this date.
   */
  readonly togetherFrom?: WorldDate;
}

/** Form a tie, or grow the existing one of the same kind and orientation as a positive first-hand contact. */
export function formOrGrow(store: TieStore, ctx: PairContext, kind: EdgeKind, a: number, b: number, ev: FormingEvent): Tie {
  const existing = store.find(kind, a, b);
  const loyalty: DecayLoyalty = { a: ctx.loyaltyOf(a), b: ctx.loyaltyOf(b) };
  if (existing) {
    if (ev.togetherFrom) {
      // Decay runs only through the gap before they came together; from then to the event they were in touch.
      settleTie(existing, ev.togetherFrom, loyalty);
      if (dayNumber(ev.date) > dayNumber(existing.lastContact)) existing.lastContact = ev.date;
      for (const s of [existing.ab, existing.ba]) if (s && dayNumber(ev.date) > dayNumber(s.decayedThrough)) s.decayedThrough = ev.date;
    }
    applyEvent(existing, { eventId: ev.eventId, date: ev.date, sign: 1, memoryStrength: ev.memoryStrength, firstHand: true, contact: true }, ctx.fitOf(a, b), null, loyalty);
    return existing;
  }
  const t = createTie({
    a, b, kind, date: ev.date, basisEventId: ev.eventId,
    sociabilityA: ctx.sociabilityOf(a), sociabilityB: ctx.sociabilityOf(b), userId: ctx.userId,
  });
  store.put(t);
  return t;
}

/** One member of a staff for a season (X7.1.1 rule 1). */
export interface StaffSeasonMember {
  readonly personId: number;
  /** Direct boss on the staff chart, or null for the top of the chart. */
  readonly reportsTo: number | null;
  /** Weeks on the staff this season; under the minimum no tie forms (X7.1.1 edge case). */
  readonly weeks: number;
}

const order = (x: number, y: number): [number, number] => (x < y ? [x, y] : [y, x]);

/**
 * A season on one staff: `worked_under` from each member to his direct boss, `worked_with` between every
 * other pair on the staff (X7.1.1 rule 1). Returns the ties touched.
 */
export function staffSeason(store: TieStore, ctx: PairContext, members: readonly StaffSeasonMember[], ev: FormingEvent): Tie[] {
  const min = rp('edge.minWeeksTogether');
  const present = members.filter((m) => m.weeks >= min).slice().sort((x, y) => x.personId - y.personId);
  const ids = new Set(present.map((m) => m.personId));
  const touched: Tie[] = [];
  for (const m of present) {
    if (m.reportsTo !== null && ids.has(m.reportsTo)) touched.push(formOrGrow(store, ctx, 'worked_under', m.personId, m.reportsTo, ev));
  }
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const x = present[i]!; const y = present[j]!;
      if (x.reportsTo === y.personId || y.reportsTo === x.personId) continue;
      const [lo, hi] = order(x.personId, y.personId);
      touched.push(formOrGrow(store, ctx, 'worked_with', lo, hi, ev));
    }
  }
  return touched;
}

/** One player on a roster for a season (X7.1.1 rule 1). */
export interface RosterSeasonMember {
  readonly personId: number;
  /** Position group key (room), e.g. `OL`, `WR`, `DB`. */
  readonly group: string;
  /** Side of the ball he started on this season, or null when not a starter. */
  readonly starterSide: 'offense' | 'defense' | 'special_teams' | null;
  readonly weeks: number;
}

/**
 * A season on one roster: `teammate` only within a position group or among starters on one side of the
 * ball, to bound edge count (X7.1.1 rule 1, starting rule).
 */
export function rosterSeason(store: TieStore, ctx: PairContext, members: readonly RosterSeasonMember[], ev: FormingEvent): Tie[] {
  const min = rp('edge.minWeeksTogether');
  const present = members.filter((m) => m.weeks >= min).slice().sort((x, y) => x.personId - y.personId);
  const touched: Tie[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const x = present[i]!; const y = present[j]!;
      const sameGroup = x.group === y.group;
      const startersTogether = x.starterSide !== null && x.starterSide === y.starterSide;
      if (!sameGroup && !startersTogether) continue;
      touched.push(formOrGrow(store, ctx, 'teammate', x.personId, y.personId, ev));
    }
  }
  return touched;
}

/** A season in a coach's position group forms `coached`, player to coach (X7.1.1 rule 2). */
export function coachedSeason(store: TieStore, ctx: PairContext, coachId: number, players: readonly { personId: number; weeks: number }[], ev: FormingEvent): Tie[] {
  const min = rp('edge.minWeeksTogether');
  return players.filter((p) => p.weeks >= min && p.personId !== coachId)
    .slice().sort((x, y) => x.personId - y.personId)
    .map((p) => formOrGrow(store, ctx, 'coached', p.personId, coachId, ev));
}

/** A commitment or a logged official visit forms `recruited_by`, recruit to coach (X7.1.1 rule 2). */
export function recruited(store: TieStore, ctx: PairContext, recruitId: number, coachId: number, ev: FormingEvent & { readonly kind: 'commitment' | 'official_visit' }): Tie {
  return formOrGrow(store, ctx, 'recruited_by', recruitId, coachId, ev);
}

/** One meeting between two parties with its X4.1.1 stakes score. */
export interface Meeting {
  readonly eventId: number;
  readonly date: WorldDate;
  readonly stakes: number;
}

/**
 * Whether a rivalry forms: 3 meetings with stakes 15 or more inside 6 seasons (X7.1.1 rule 3). Returns
 * the event id of the meeting that completed it, or null.
 */
export function rivalryTrigger(meetings: readonly Meeting[]): number | null {
  const need = rp('rival.meetings');
  const span = rp('rival.windowSeasons');
  const big = meetings.filter((m) => m.stakes >= rp('rival.minStakes'))
    .slice().sort((x, y) => x.date.seasonYear - y.date.seasonYear || x.date.dayIndex - y.date.dayIndex || x.eventId - y.eventId);
  for (let i = need - 1; i < big.length; i++) {
    const first = big[i - need + 1]!;
    const last = big[i]!;
    if (last.date.seasonYear - first.date.seasonYear < span) return last.eventId;
  }
  return null;
}

/** A request for the history log to emit `rivalry_formed` (family world, public; X7.1.1 rule 3). */
export interface RivalryFormedRequest {
  readonly type: 'rivalry_formed';
  readonly teamId: number;
  readonly otherTeamId: number;
  readonly causeId: number;
  readonly date: WorldDate;
}

/**
 * Form a person-to-person rival tie when the meetings qualify. Returns the tie (new or existing) or null.
 */
export function personRivalry(store: TieStore, ctx: PairContext, x: number, y: number, meetings: readonly Meeting[]): Tie | null {
  const trigger = rivalryTrigger(meetings);
  if (trigger === null) return null;
  const [lo, hi] = order(x, y);
  const existing = store.find('rival', lo, hi);
  if (existing) return existing;
  const ev = meetings.find((m) => m.eventId === trigger)!;
  const t = createTie({ a: lo, b: hi, kind: 'rival', date: ev.date, basisEventId: trigger, sociabilityA: ctx.sociabilityOf(lo), sociabilityB: ctx.sociabilityOf(hi), userId: ctx.userId });
  store.put(t);
  return t;
}

/**
 * Form a team rivalry when the meetings qualify. A team rival is stored as a tie from the lower team id to
 * the higher (`a` is a team id here, `b` null, `bTeamId` the other team). Returns the tie and the event
 * request the caller passes to the history log, or null.
 */
export function teamRivalry(store: TieStore, teamX: number, teamY: number, meetings: readonly Meeting[]): { tie: Tie; request: RivalryFormedRequest | null } | null {
  const [lo, hi] = order(teamX, teamY);
  const existing = store.find('rival', lo, null, hi);
  if (existing) return { tie: existing, request: null };
  const trigger = rivalryTrigger(meetings);
  if (trigger === null) return null;
  const ev = meetings.find((m) => m.eventId === trigger)!;
  const t = createTie({ a: lo, b: null, bTeamId: hi, kind: 'rival', date: ev.date, basisEventId: trigger });
  // A team holds no feelings of its own: the one stored side is the rivalry's heat.
  store.put(t);
  return { tie: t, request: { type: 'rivalry_formed', teamId: lo, otherTeamId: hi, causeId: trigger, date: ev.date } };
}

/**
 * A team rivalry with no meeting for 10 seasons falls toward its floor by a tenth of the gap each season
 * after that (X7.2.2 rule 4). Call once per season end. A renewed meeting restarts from the faded strength.
 */
export function fadeDormantRival(t: Tie, seasonYear: number, lastMeetingSeason: number): void {
  if (t.kind !== 'rival' || t.bTeamId === null || !t.ab) return;
  if (seasonYear - lastMeetingSeason <= rp('rival.dormantSeasons')) return;
  const floor = rp('decay.floorShare') * t.ab.peak;
  t.ab.strength -= rp('rival.fadeShare') * (t.ab.strength - floor);
}
