// The recruiting calendar off-screen (T4.2.1, G-12) and the map from the loop's weeks to calendar days.
//
// RC-04: recruiting periods (contact, evaluation, quiet, dead) are dated data only, and only one college
// year holds a full year of them. Under the ruling that the rules have always been the rules, every other
// year takes that year's periods moved by whole weeks (so a Monday stays a Monday). A year with dated
// periods of its own keeps them; the projected periods fill only the days after its last dated one.
// Status of every projected period: Assumption.
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

const LEVEL = 'college';
const PROJECTED_PREFIX = 'projected_';

function isPeriod(w: WindowDef): boolean { return w.period !== undefined; }

function dateOf(a: Anchor | undefined): number | null {
  const r = a?.rule as { date?: string } | undefined;
  return r?.date ? calendar.parseIso(r.date) : null;
}

/** The dated college file with the most recruiting periods: the year every other year is projected from. */
export function baseRecruitingFile(files: readonly CalendarFile[]): CalendarFile {
  let best: CalendarFile | null = null;
  let n = -1;
  for (const f of files) {
    if (f.level !== LEVEL || f.kind !== 'dated' || f.season === undefined) continue;
    const k = (f.windows ?? []).filter(isPeriod).length;
    if (k > n || (k === n && best !== null && f.season < best.season!)) { best = f; n = k; }
  }
  if (!best) throw new Error('recruiting: no dated college calendar file holds recruiting periods');
  return best;
}

/** Whole weeks between January 1 of two years, in days. */
function weekShift(from: number, to: number): number {
  const d = calendar.yearStart(to) - calendar.yearStart(from);
  return Math.round(d / calendar.DAYS_PER_WEEK) * calendar.DAYS_PER_WEEK;
}

/** The base year's periods moved to year `year`, keeping only periods that open after `after` (a day), with ids prefixed. */
function projected(base: CalendarFile, year: number, after: number | null): { anchors: Anchor[]; windows: WindowDef[] } {
  const shift = weekShift(base.season!, year);
  const byId = new Map(base.anchors.map((a) => [a.id, a]));
  const anchors: Anchor[] = [];
  const windows: WindowDef[] = [];
  for (const w of (base.windows ?? []).filter(isPeriod)) {
    const open = dateOf(byId.get(w.opens));
    const close = dateOf(byId.get(w.closes!));
    if (open === null || close === null) continue;
    const o = open + shift, c = close + shift;
    if (after !== null && c <= after) continue;
    const o2 = after !== null && o <= after ? after + 1 : o;
    const source = `Projected from the ${base.season} periods by ${shift / calendar.DAYS_PER_WEEK} weeks (world recruiting RC-04)`;
    anchors.push({ id: `${PROJECTED_PREFIX}${w.opens}`, rule: { date: calendar.iso(o2) }, status: 'Assumption', leaf: 'T4.2.1', source } as Anchor);
    anchors.push({ id: `${PROJECTED_PREFIX}${w.closes}`, rule: { date: calendar.iso(c) }, status: 'Assumption', leaf: 'T4.2.1', source } as Anchor);
    windows.push({ ...w, id: `${PROJECTED_PREFIX}${w.id}`, opens: `${PROJECTED_PREFIX}${w.opens}`, closes: `${PROJECTED_PREFIX}${w.closes}` });
  }
  return { anchors, windows };
}

/** The calendar files with recruiting periods for every college year from `first` to `last`. */
export function projectedFiles(files: readonly CalendarFile[], rules: calendar.RuleLookup, first: number, last: number): CalendarFile[] {
  const base = baseRecruitingFile(files);
  const real = new calendar.CalendarEngine({ files, rules, levels: [LEVEL] });
  const out = files.filter((f) => !(f.level === LEVEL && f.kind === 'dated' && f.season !== base.season && f.season !== undefined && f.season >= first && f.season <= last));
  for (let y = first; y <= last; y++) {
    if (y === base.season) continue;
    const own = files.find((f) => f.level === LEVEL && f.kind === 'dated' && f.season === y);
    if (!own) {
      const p = projected(base, y, null);
      out.push({ level: LEVEL, kind: 'dated', season: y, anchors: p.anchors, windows: p.windows });
      continue;
    }
    // A year with dated periods of its own keeps them; projection fills the days after its last one.
    const periods = real.resolver(LEVEL).season(y).windows.filter((w) => w.def.period !== undefined);
    const lastDay = periods.length === 0 ? null : Math.max(...periods.map((w) => w.closeDay));
    const p = projected(base, y, lastDay);
    out.push({ ...own, anchors: [...own.anchors, ...p.anchors], windows: [...(own.windows ?? []), ...p.windows] });
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
