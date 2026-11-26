// C10.1.1 the daily transactions wire: one item per committed public roster move (every type C5.7.1
// lists, which the roster engine logs as events of family `roster`), published that evening when made by
// the daily deadline and the next evening otherwise; contract money a day later with a small chance of
// a reporting error. The filter is the user's (default: his club, this week's opponent, his division,
// positions on his needs board), and items about players on his ready list are flagged.
import type { EventTypeDef, RandomStream, WorldEvent } from '@gm/schema';
import { MINUTES_PER_DAY } from '../calendar/date.ts';
import { param, transactionDeadline, type NewsRuleLookup } from './params.ts';

export interface WireItem {
  readonly eventId: number;
  readonly moveType: string;
  readonly teamId: number | null;
  readonly personIds: readonly number[];
  /** When the move was made: day number and minute (Eastern). */
  readonly madeDay: number;
  readonly madeMinute: number;
  /** When the item appears on the wire. */
  readonly publicDay: number;
  readonly publicMinute: number;
  /** When contract terms appear, and whether the reported terms are wrong (C10.1.1 rule 3). Null for moves without money. */
  readonly money: { readonly day: number; readonly misreported: boolean } | null;
  /** Waiver claim deadline from the move's payload (C10.1.1 rule 4), as "seasonYear:dayIndex". */
  readonly claimDeadline: string | null;
}

export interface WireOptions {
  readonly types: ReadonlyMap<string, EventTypeDef>;
  /** Day number of an event's date (calendar `fromWorldDate`). */
  readonly dayOf: (e: WorldEvent) => number;
  readonly rules?: NewsRuleLookup;
  /** Stream for the money misreport draws (one chance per money item, in log order). */
  readonly stream?: RandomStream;
}

/** Payload fields the wire reads when present: `minute` (time made), `money_cents` (contract terms), `claim_deadline`. */
export const WIRE_PAYLOAD_KEYS = { minute: 'minute', money: 'money_cents', claimDeadline: 'claim_deadline' } as const;

/** Builds the wire from log rows. Every public `roster` event is one item, reversals included (edge case). */
export function wireFromEvents(rows: readonly WorldEvent[], opts: WireOptions): WireItem[] {
  const deadline = transactionDeadline(opts.rules);
  const publish = param('wirePublishMinute');
  const out: WireItem[] = [];
  for (const e of rows) {
    const def = opts.types.get(e.type);
    if (!def || def.family !== 'roster' || e.witnesses.kind !== 'public') continue;
    const day = opts.dayOf(e);
    const m = e.payload[WIRE_PAYLOAD_KEYS.minute];
    const minute = typeof m === 'number' ? m : 0;
    const publicDay = minute <= deadline ? day : day + 1;
    const hasMoney = typeof e.payload[WIRE_PAYLOAD_KEYS.money] === 'number';
    const cd = e.payload[WIRE_PAYLOAD_KEYS.claimDeadline];
    out.push({
      eventId: e.id,
      moveType: e.type,
      teamId: e.where.teamId,
      personIds: [...e.actors.map((a) => a.personId), ...e.subjects.filter((s) => s.kind === 'person').map((s) => s.id)],
      madeDay: day,
      madeMinute: minute,
      publicDay,
      publicMinute: Math.max(publish, publicDay === day ? minute : 0),
      money: hasMoney ? { day: publicDay + param('moneyDelayDays'), misreported: opts.stream?.chance(param('moneyErrorChance')) ?? false } : null,
      claimDeadline: typeof cd === 'string' ? cd : null,
    });
  }
  return out;
}

/** Items visible at a moment (C10.1.1 acceptance: none before its public time). */
export function wireVisibleAt(items: readonly WireItem[], day: number, minute: number): WireItem[] {
  const t = day * MINUTES_PER_DAY + minute;
  return items.filter((i) => i.publicDay * MINUTES_PER_DAY + i.publicMinute <= t);
}

export interface WireFilter {
  readonly clubId: number;
  readonly opponentId: number | null;
  readonly divisionTeamIds: readonly number[];
  /** Positions on the needs board; the caller resolves a person's position. */
  readonly needPositions: readonly string[];
  readonly positionOf: (personId: number) => string | undefined;
  /** People on the club's ready list (M3.2.1). */
  readonly readyList: ReadonlySet<number>;
}

export interface FilteredWireItem extends WireItem { readonly readyListFlag: boolean }

/** The user's default filter (C10.1.1 "What the user sees"). Unfiltered use is `filter = null`. */
export function filterWire(items: readonly WireItem[], filter: WireFilter | null, readyList: ReadonlySet<number> = new Set()): FilteredWireItem[] {
  const flag = (i: WireItem): FilteredWireItem => ({ ...i, readyListFlag: i.personIds.some((p) => (filter?.readyList ?? readyList).has(p)) });
  if (!filter) return items.map(flag);
  const teams = new Set<number>([filter.clubId, ...filter.divisionTeamIds, ...(filter.opponentId !== null ? [filter.opponentId] : [])]);
  const needs = new Set(filter.needPositions);
  return items
    .filter((i) => (i.teamId !== null && teams.has(i.teamId)) || i.personIds.some((p) => needs.has(filter.positionOf(p) ?? '') || filter.readyList.has(p)))
    .map(flag);
}

/** C10.1.1 acceptance: items for a day equal the committed public roster moves that day. */
export function wireCountMatches(items: readonly WireItem[], rows: readonly WorldEvent[], types: ReadonlyMap<string, EventTypeDef>, dayOf: (e: WorldEvent) => number, day: number): boolean {
  const moves = rows.filter((e) => types.get(e.type)?.family === 'roster' && e.witnesses.kind === 'public' && dayOf(e) === day).length;
  return items.filter((i) => i.madeDay === day).length === moves;
}
