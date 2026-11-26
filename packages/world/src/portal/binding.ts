// The transfer portal's state in the live world, its rule reader and its calendar (T6.1.1). State lives in
// `LiveWorld.systemState['portal']` (folded into `worldHash`). Window dates are G-12 calendar anchors
// (`transfer_window_open`, `transfer_window_close`, season of the cycle year); the exceptions and the
// transfer limit are league rule keys (`transfer.*`, facts F-college-keys-0024 to 0028).
import { calendar, college } from '@gm/league';
import type { LiveWorld } from '../loop/types.ts';
import { recruitingCalendar, recruitingLevels } from '../recruiting/binding.ts';
import type { TurnoverBinding, Level } from '../turnover/binding.ts';

/** `LiveWorld.systemState` key of the portal state. */
export const PORTAL_KEY = 'portal';
/** J13 stream name of the portal's own draws. */
export const STREAM_PORTAL = 'world.portal';

export type EntryVia = 'window' | 'postseason' | 'coach_change';
export type EntryStatus = 'pending' | 'in_market' | 'signed' | 'unplaced';

/** One player's entry in one cycle. Plain data. */
export interface PortalEntry {
  readonly personId: number;
  readonly position: string;
  readonly fromTeamId: number;
  /** Calendar day he enters (P3.1.2 day number); decided ahead, announced when the world reaches it. */
  readonly enteredDay: number;
  readonly via: EntryVia;
  status: EntryStatus;
  toTeamId: number | null;
  signedDay: number | null;
}

/** One cycle: the national window of a season and the market that follows it, to the first week of the season. */
export interface PortalCycle {
  /** Season (and calendar year) of the window. */
  readonly year: number;
  readonly window: { readonly open: number; readonly close: number };
  /** Status of the window anchors as the calendar file carries them (Verified for 2026; Conflict on the pattern). */
  readonly windowStatus: string;
  /** Last market day: the day before the G-12 anchor `season_week1_start` of the cycle year (PT-09). */
  readonly marketClose: number;
  /** Teams whose coaching change has had its entry draw this cycle. */
  coachDraws: number[];
  entries: PortalEntry[];
  /** Last market Wednesday run, or null. */
  throughDay: number | null;
}

/** One closed cycle, kept for history (X3): counts only, the rows are in the event log. */
export interface PortalYear {
  readonly year: number;
  readonly programs: number;
  readonly entered: number;
  readonly signed: number;
  readonly unplaced: number;
  readonly byVia: Readonly<Record<EntryVia, number>>;
}

export interface WorldPortal {
  cycle: PortalCycle | null;
  /** Team id to its head coach at the last pass, for coaching-change windows. */
  headCoaches: Record<number, number | null>;
  /** Season to the college teams that played its title game (postseason exception). */
  titleTeams: Record<number, number[]>;
  /** Person id to transfers made while eligible (T6.1.1 `transfer.max_free`). */
  transfers: Record<number, number>;
  history: PortalYear[];
}

export function portalOf(world: LiveWorld): WorldPortal {
  let s = world.systemState.get(PORTAL_KEY) as WorldPortal | undefined;
  if (!s) {
    s = { cycle: null, headCoaches: {}, titleTeams: {}, transfers: {}, history: [] };
    world.systemState.set(PORTAL_KEY, s);
  }
  return s;
}

/** What the composition root gives the portal binding: the same turnover binding and calendar files as recruiting. */
export interface PortalBinding {
  readonly turnover: TurnoverBinding;
  readonly calendarFiles: readonly calendar.CalendarFile[];
}

/** The college level the portal runs at: the first level that recruits (T5 seasons rule held), or null. */
export function portalLevel(b: PortalBinding): Level | null {
  return recruitingLevels(b.turnover)[0] ?? null;
}

const TRANSFER_KEYS = {
  postseason: 'transfer.postseason_extra_days',
  delay: 'transfer.coach_change_delay_days',
  length: 'transfer.coach_change_window_days',
  maxFree: 'transfer.max_free',
  aid: 'transfer.aid_ends_on_entry',
} as const;

/**
 * The transfer rules from the league rules by key (T6.1.1). Null when the league holds no coaching-change
 * window key, as league college reads it: then no exception applies and entries use the national window only.
 */
export function transferRules(b: PortalBinding, level: Level): college.TransferRules {
  const r = (k: string) => b.turnover.rule(level, k);
  if (r(TRANSFER_KEYS.length) === undefined) return { transfer: null };
  const need = (k: string) => {
    const v = r(k);
    if (v === undefined) throw new Error(`world.portal: league ${level} holds no rule ${k}`);
    return v;
  };
  return {
    transfer: {
      postseasonExtraDays: need(TRANSFER_KEYS.postseason), coachChangeDelayDays: need(TRANSFER_KEYS.delay),
      coachChangeWindowDays: need(TRANSFER_KEYS.length), maxFree: need(TRANSFER_KEYS.maxFree),
      // PT-10: a boolean key the numeric rule reader does not carry reads as not applied (aid does not end on entry, F-college-keys-0028).
      aidEndsOnEntry: (r(TRANSFER_KEYS.aid) ?? 0) !== 0,
    },
  };
}

function anchor(b: PortalBinding, year: number, id: string): { day: number; status: string } | null {
  const a = recruitingCalendar(b).engineFor(calendar.yearStart(year)).resolver('college').season(year).anchors.get(id);
  return a ? { day: a.day, status: a.status } : null;
}

/** The national window, its status and the market close for a season, from the calendar; null if the calendar has no window that year. */
export function cycleDates(b: PortalBinding, year: number): { window: { open: number; close: number }; windowStatus: string; marketClose: number } | null {
  const open = anchor(b, year, 'transfer_window_open');
  const close = anchor(b, year, 'transfer_window_close');
  const week1 = anchor(b, year, 'season_week1_start');
  if (!open || !close || !week1) return null;
  const windowStatus = open.status === close.status ? open.status : `${open.status} / ${close.status}`;
  return { window: { open: open.day, close: close.day }, windowStatus, marketClose: week1.day - 1 };
}

/** The last game day of the season before the cycle (G-12 anchor `playoff_final`), for the postseason exception. */
export function finalDay(b: PortalBinding, season: number): number | null {
  return anchor(b, season, 'playoff_final')?.day ?? null;
}
