// The recruiting calendar off-screen (T4.2.1, G-12) and the map from the loop's weeks to calendar days.
//
// RC-04: recruiting periods (contact, evaluation, quiet, dead) are dated data, and the league files hold
// them only for college 2026 and January 2027. Every other year is built from the rule the official FBS
// recruiting calendars follow, read from the NCAA 2023-24, 2024-25 and 2025-26 FBS calendars and the
// Bylaw 13.17.5.1 formula in the 2021-22 Division I Manual (the rule set's "football calendar formula"):
//
//   January 1 to the day before the first Monday on or after January 5     dead      (2 of 3: 2024-25, 2025-26)
//   that Monday to the Saturday before the regular signing week            contact   (2 of 3)
//     except the second Sunday of January quiet, and the Monday to
//     Wednesday after it dead (the coaches' convention week)               (2 of 3)
//   the Sunday before the week of the first Wednesday in February          quiet     (Verified: three calendars and the bylaw)
//   that week's Monday to the day before the first Monday in March         dead      (Verified)
//   the first Monday in March to April 14                                  quiet     (Verified)
//   April 15 to the Saturday before Memorial Day                           contact   (Verified: three calendars)
//   the Sunday before Memorial Day to the Wednesday after                  dead      (Verified)
//   the Thursday after Memorial Day to the day before the Monday before
//     the last Wednesday in June                                           quiet     (Verified)
//   that Monday to July 31, and August 1 to 31                             dead      (Verified for the June rule; July 25 to 31
//                                                                                       was quiet in 2023-24: Conflict)
//   September 1 to the Sunday after the last Saturday in November          evaluation (Verified)
//   the Monday after to December 31                                        dead      (Conflict: 2024-25 had a quiet
//                                                                                       December 9 to 22; 2025-26 is used)
//
// The August home-game quiet window (48 hours either side of a home game) is not built. A year with dated
// periods of its own keeps them; the built periods fill only the days after its last dated one.
//
// RC-05: the world date is the P3.1.2 calendar date (January 1 = day 0), and the loop moves it a week per
// pass. Recruiting weeks are Wednesdays. A pass runs every recruiting Wednesday the world date has passed;
// the first pass of a season also runs through the February signing date, so the class that enrols that
// week has signed. A short schedule (fewer passes than weeks in a year) catches up at the next season.
import { calendar } from '@gm/league';
import type { WorldDate } from '@gm/schema';
import { param } from './params.ts';

type CalendarFile = calendar.CalendarFile;
type Anchor = calendar.CalendarFile['anchors'][number];
type WindowDef = NonNullable<calendar.CalendarFile['windows']>[number];
type Period = NonNullable<WindowDef['period']>;
type Status = 'Verified' | '2 of 3' | 'Conflict';

const LEVEL = 'college';
const BUILT_PREFIX = 'built_';
const W = calendar.WEEKDAY;
const DAY = 1;

const SOURCE = 'NCAA FBS recruiting calendars 2023-24, 2024-25, 2025-26 (ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar) and Bylaw 13.17.5.1 (2021-22 Division I Manual); world recruiting RC-04';

interface Span { readonly id: string; readonly open: number; readonly close: number; readonly period: Period; readonly status: Status }

function md(y: number, m: number, d: number): number { return calendar.dayNumber({ y, m, d }); }
function lastWeekday(y: number, m: number, wd: number): number { return calendar.nthWeekday(y, m, wd, -1); }

/** The recruiting periods of one calendar year by the formula above, in date order, covering January 1 to December 31. */
export function formulaPeriods(y: number): Span[] {
  const contactOpen = calendar.onOrAfter(md(y, 1, 5), W.mon);
  const conventionSunday = calendar.nthWeekday(y, 1, W.sun, 2);
  const signing = calendar.nthWeekday(y, 2, W.wed, 1);
  const signingMonday = signing - (W.wed - W.mon);
  const marchMonday = calendar.nthWeekday(y, 3, W.mon, 1);
  const memorial = lastWeekday(y, 5, W.mon);
  const juneMonday = lastWeekday(y, 6, W.wed) - (W.wed - W.mon);
  const evalClose = lastWeekday(y, 11, W.sat) + DAY;
  const out: Span[] = [];
  const add = (id: string, open: number, close: number, period: Period, status: Status) => { if (close >= open) out.push({ id, open, close, period, status }); };
  add('jan_dead', md(y, 1, 1), contactOpen - DAY, 'dead', '2 of 3');
  // January contact, broken by the convention-week quiet Sunday and dead Monday to Wednesday where they fall inside it.
  const contactClose = signingMonday - 2 * DAY;
  const conv = conventionSunday >= contactOpen && conventionSunday + 3 * DAY <= contactClose;
  if (conv) {
    add('jan_contact_1', contactOpen, conventionSunday - DAY, 'contact', '2 of 3');
    add('convention_quiet', conventionSunday, conventionSunday, 'quiet', '2 of 3');
    add('convention_dead', conventionSunday + DAY, conventionSunday + 3 * DAY, 'dead', '2 of 3');
    add('jan_contact_2', conventionSunday + 4 * DAY, contactClose, 'contact', '2 of 3');
  } else add('jan_contact_1', contactOpen, contactClose, 'contact', '2 of 3');
  add('signing_quiet', signingMonday - DAY, signingMonday - DAY, 'quiet', 'Verified');
  add('signing_dead', signingMonday, marchMonday - DAY, 'dead', 'Verified');
  add('spring_quiet', marchMonday, md(y, 4, 14), 'quiet', 'Verified');
  add('spring_contact', md(y, 4, 15), memorial - 2 * DAY, 'contact', 'Verified');
  add('memorial_dead', memorial - DAY, memorial + 2 * DAY, 'dead', 'Verified');
  add('summer_quiet', memorial + 3 * DAY, juneMonday - DAY, 'quiet', 'Verified');
  add('summer_dead', juneMonday, md(y, 7, 31), 'dead', 'Conflict');
  add('august_dead', md(y, 8, 1), md(y, 8, 31), 'dead', 'Verified');
  add('fall_evaluation', md(y, 9, 1), evalClose, 'evaluation', 'Verified');
  add('december_dead', evalClose + DAY, md(y, 12, 31), 'dead', 'Conflict');
  return out;
}

/** The formula's periods for a year as calendar anchors and windows, keeping only periods that close after `after` (a day). */
function built(year: number, after: number | null): { anchors: Anchor[]; windows: WindowDef[] } {
  const anchors: Anchor[] = [];
  const windows: WindowDef[] = [];
  for (const sp of formulaPeriods(year)) {
    if (after !== null && sp.close <= after) continue;
    const open = after !== null && sp.open <= after ? after + DAY : sp.open;
    const id = `${BUILT_PREFIX}${sp.id}`;
    anchors.push({ id: `${id}_open`, rule: { date: calendar.iso(open) }, status: sp.status, leaf: 'T4.2.1', source: SOURCE } as Anchor);
    anchors.push({ id: `${id}_close`, rule: { date: calendar.iso(sp.close) }, status: sp.status, leaf: 'T4.2.1', source: SOURCE } as Anchor);
    windows.push({ id, kind: 'window', label: `Recruiting ${sp.period} period`, leaf: 'T4.2.1', opens: `${id}_open`, closes: `${id}_close`, period: sp.period } as WindowDef);
  }
  return { anchors, windows };
}

/** The calendar files with recruiting periods for every college year from `first` to `last`. */
export function projectedFiles(files: readonly CalendarFile[], rules: calendar.RuleLookup, first: number, last: number): CalendarFile[] {
  const real = new calendar.CalendarEngine({ files, rules, levels: [LEVEL] });
  const own = (y: number) => files.find((f) => f.level === LEVEL && f.kind === 'dated' && f.season === y);
  const out = files.filter((f) => !(f.level === LEVEL && f.kind === 'dated' && f.season !== undefined && f.season >= first && f.season <= last));
  for (let y = first; y <= last; y++) {
    const f = own(y);
    if (!f) {
      const p = built(y, null);
      out.push({ level: LEVEL, kind: 'dated', season: y, anchors: p.anchors, windows: p.windows });
      continue;
    }
    // A year with dated periods of its own keeps them; the formula fills the days after its last one.
    const periods = real.resolver(LEVEL).season(y).windows.filter((w) => w.def.period !== undefined && calendar.civil(w.closeDay).y === y);
    const lastDay = periods.length === 0 ? null : Math.max(...periods.map((w) => w.closeDay));
    const p = built(y, lastDay);
    out.push({ ...f, anchors: [...f.anchors, ...p.anchors], windows: [...(f.windows ?? []), ...p.windows] });
  }
  return out;
}

/** A recruiting calendar that grows its year range on demand (one engine per range, so period caches stay valid). */
export class RecruitingCalendar {
  #engine: calendar.CalendarEngine | null = null;
  #first = 0;
  #last = -1;
  constructor(private readonly files: readonly CalendarFile[], private readonly rules: calendar.RuleLookup, private readonly span = 8) {}

  /** The engine covering the year of `day` and the years either side of it. */
  engineFor(day: number): calendar.CalendarEngine {
    const y = calendar.civil(day).y;
    if (!this.#engine || y - 1 < this.#first || y + 1 > this.#last) {
      this.#first = Math.min(y - 1, this.#engine ? this.#first : y - 1);
      this.#last = Math.max(y + this.span, this.#last);
      this.#engine = new calendar.CalendarEngine({ files: projectedFiles(this.files, this.rules, this.#first, this.#last), rules: this.rules });
    }
    return this.#engine;
  }

  /** The February signing date of the class that enrols in `year` (G-12 anchor `february_signing`, season `year`). */
  februarySigning(year: number): number {
    const a = this.engineFor(calendar.yearStart(year)).resolver(LEVEL).season(year).anchors.get('february_signing');
    if (!a) throw new Error(`recruiting: the college calendar has no february_signing for ${year}`);
    return a.day;
  }
}

/** First recruiting Wednesday on or after a day. */
export function wednesdayOnOrAfter(day: number): number { return calendar.onOrAfter(day, calendar.WEEKDAY.wed); }

/** The calendar day of a world date (P3.1.2). */
export function dayOfWorld(date: WorldDate): number {
  return calendar.yearStart(date.seasonYear) + date.dayIndex;
}

/** The day a class's cycle opens (RC-02): the first Wednesday of the open month, the set years before it enrols. */
export function cycleOpen(classYear: number): number {
  const y = classYear - param('cycle.yearsBeforeEnrolment');
  return wednesdayOnOrAfter(calendar.dayNumber({ y, m: param('cycle.openMonth'), d: 1 }));
}

/** Recruiting Wednesdays after `through` up to and including `target`. On the first pass ever, none are owed before the world date's own week. */
export function recruitingCalendarDays(through: number | null, target: number): number[] {
  const out: number[] = [];
  let d = through === null ? wednesdayOnOrAfter(target - calendar.DAYS_PER_WEEK + 1) : through + calendar.DAYS_PER_WEEK;
  for (; d <= target; d += calendar.DAYS_PER_WEEK) out.push(d);
  return out;
}
