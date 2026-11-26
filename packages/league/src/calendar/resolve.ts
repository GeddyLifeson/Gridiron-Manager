// Resolve a level's calendar for one season: pattern anchors, dated overrides, rule keys (C4.1.1
// rule 5, C4.7.1 rule 2, T3.2.1 acceptance: two years load with no code change).
import type { FactStatus } from '@gm/schema';
import {
  DAYS_PER_WEEK, WEEKDAY, civil, dayNumber, nthWeekday, onOrAfter, parseIso, parseTime, weekday,
  type WeekdayName,
} from './date.ts';
import type {
  Anchor, CalendarFile, CalendarLevel, DateRule, ResolvedAnchor, ResolvedSeason, ResolvedWindow, RuleLookup, WindowDef,
} from './types.ts';
import { MINUTES_PER_DAY } from './date.ts';

const STATUS_RANK: readonly FactStatus[] = ['Verified', 'Rulebook only', '2 of 3', '1 of 3', 'Unverified', 'Conflict', 'Assumption'];
export function weakestStatus(list: readonly FactStatus[]): FactStatus {
  let worst = 0;
  for (const s of list) worst = Math.max(worst, STATUS_RANK.indexOf(s));
  return STATUS_RANK[worst] ?? 'Unverified';
}

function wd(name: string | undefined, where: string): number {
  if (name === undefined || !(name in WEEKDAY)) throw new Error(`${where}: bad weekday ${String(name)}`);
  return WEEKDAY[name as WeekdayName];
}

export interface CalendarSet {
  readonly level: CalendarLevel;
  readonly pattern: CalendarFile;
  readonly dated: ReadonlyMap<number, CalendarFile>;
}

export function calendarSet(level: CalendarLevel, files: readonly CalendarFile[]): CalendarSet {
  const pattern = files.find((f) => f.level === level && f.kind === 'pattern');
  if (!pattern) throw new Error(`no pattern calendar for ${level}`);
  const dated = new Map<number, CalendarFile>();
  for (const f of files) {
    if (f.level !== level || f.kind !== 'dated') continue;
    if (f.season === undefined) throw new Error(`dated ${level} file without a season`);
    if (dated.has(f.season)) throw new Error(`two dated ${level} files for ${f.season}`);
    for (const a of f.anchors) if (!pattern.anchors.some((p) => p.id === a.id) && !(f.windows ?? []).length) throw new Error(`${level} ${f.season}: anchor ${a.id} is not in the pattern`);
    dated.set(f.season, f);
  }
  return { level, pattern, dated };
}

interface SeasonWork {
  readonly byId: Map<string, { a: Anchor; fromPattern: boolean }>;
  readonly out: Map<string, ResolvedAnchor>;
  readonly dated: CalendarFile | undefined;
}

export class CalendarResolver {
  private readonly cache = new Map<number, ResolvedSeason>();
  private readonly work = new Map<number, SeasonWork>();
  private readonly stack = new Set<string>();
  constructor(readonly set: CalendarSet, private readonly rules: RuleLookup) {}

  private workFor(season: number): SeasonWork {
    let w = this.work.get(season);
    if (w) return w;
    const dated = this.set.dated.get(season);
    const byId = new Map<string, { a: Anchor; fromPattern: boolean }>();
    for (const a of this.set.pattern.anchors) byId.set(a.id, { a, fromPattern: true });
    for (const a of dated?.anchors ?? []) byId.set(a.id, { a, fromPattern: false });
    w = { byId, out: new Map(), dated };
    this.work.set(season, w);
    return w;
  }

  /** One anchor of one season, resolving only what it depends on. */
  anchor(season: number, id: string): ResolvedAnchor {
    if (id.startsWith('next:')) return this.anchor(season + 1, id.slice('next:'.length));
    const w = this.workFor(season);
    const done = w.out.get(id);
    if (done) return done;
    const entry = w.byId.get(id);
    if (!entry) throw new Error(`${this.set.level} ${season}: no anchor ${id}`);
    const tag = `${season}:${id}`;
    if (this.stack.has(tag)) throw new Error(`${this.set.level} ${season}: anchor cycle at ${id}`);
    this.stack.add(tag);
    try {
      const used: string[] = [];
      const { day, minute, inheritedStatus } = this.place(entry.a.rule, season, `${season} ${id}`, used, (x) => this.anchor(season, x));
      const status = inheritedStatus ? weakestStatus([entry.a.status, inheritedStatus]) : entry.a.status;
      const r: ResolvedAnchor = {
        id, day, ...(minute === undefined ? {} : { minute }), status, leaf: entry.a.leaf, source: entry.a.source,
        ...(entry.a.factId ? { factId: entry.a.factId } : {}), ...(entry.a.note ? { note: entry.a.note } : {}),
        fromPattern: entry.fromPattern, keysUsed: used,
      };
      w.out.set(id, r);
      return r;
    } finally {
      this.stack.delete(tag);
    }
  }

  season(season: number): ResolvedSeason {
    const hit = this.cache.get(season);
    if (hit) return hit;
    const w = this.workFor(season);
    for (const id of w.byId.keys()) this.anchor(season, id);
    const omit = new Set(w.dated?.omit ?? []);
    const defs: WindowDef[] = [...(this.set.pattern.windows ?? []).filter((d) => !omit.has(d.id)), ...(w.dated?.windows ?? [])];
    const windows: ResolvedWindow[] = [];
    for (const def of defs) windows.push(...this.expand(def, season, (x) => this.anchor(season, x)));
    windows.sort((a, b) => a.openDay - b.openDay || a.openMinute - b.openMinute || a.id.localeCompare(b.id));
    const r: ResolvedSeason = { level: this.set.level, season, dated: w.dated !== undefined, anchors: new Map(w.out), windows };
    this.cache.set(season, r);
    return r;
  }

  private key(k: string, where: string, used: string[]): number {
    const v = this.rules(k);
    if (v === undefined) throw new Error(`${this.set.level} ${where}: rule key ${k} is not defined`);
    used.push(k);
    return v;
  }

  private place(rule: DateRule, season: number, where: string, used: string[], resolve: (id: string) => ResolvedAnchor):
    { day: number; minute: number | undefined; inheritedStatus?: FactStatus } {
    const y = season + (rule.yearOffset ?? 0);
    let day: number;
    let inherited: FactStatus | undefined;
    let minute: number | undefined;
    let baseDay = Number.NaN;
    if (rule.date !== undefined) day = parseIso(rule.date);
    else if (rule.md !== undefined) {
      const [m, d] = rule.md.split('-').map(Number);
      day = dayNumber({ y, m: m ?? Number.NaN, d: d ?? Number.NaN });
    } else if (rule.dayKey !== undefined) {
      if (rule.month === undefined) throw new Error(`${where}: dayKey needs month`);
      day = dayNumber({ y, m: rule.month, d: this.key(rule.dayKey, where, used) });
    } else if (rule.nth !== undefined || rule.nthKey !== undefined) {
      if (rule.month === undefined) throw new Error(`${where}: nth needs month`);
      const n = rule.nth ?? this.key(rule.nthKey ?? '', where, used);
      day = nthWeekday(y, rule.month, wd(rule.weekday, where), n);
    } else if (rule.from !== undefined) {
      const base = resolve(rule.from);
      day = base.day;
      baseDay = base.day;
      minute = base.minute;
      inherited = base.status;
    } else throw new Error(`${where}: rule has no base`);
    const sign = rule.keySign ?? 1;
    day += rule.days ?? 0;
    if (rule.daysKey !== undefined) day += sign * this.key(rule.daysKey, where, used);
    day += (rule.weeks ?? 0) * DAYS_PER_WEEK;
    if (rule.weeksKey !== undefined) day += sign * this.key(rule.weeksKey, where, used) * DAYS_PER_WEEK;
    if (rule.onOrAfter !== undefined) day = onOrAfter(day, wd(rule.onOrAfter, where));
    if (rule.nextBusinessDay) {
      const w = weekday(day);
      if (w === WEEKDAY.sat || w === WEEKDAY.sun) day = onOrAfter(day, WEEKDAY.mon);
    }
    // A derived anchor keeps its base's time only when it is the same day (a moment that follows another).
    if (rule.time !== undefined) minute = parseTime(rule.time);
    else if (rule.from === undefined || day !== baseDay) minute = undefined;
    return { day, minute, ...(inherited ? { inheritedStatus: inherited } : {}) };
  }

  private expand(def: WindowDef, season: number, resolve: (id: string) => ResolvedAnchor): ResolvedWindow[] {
    const open = resolve(def.opens);
    const close = def.closes ? resolve(def.closes) : open;
    const status = weakestStatus([open.status, close.status]);
    const endOfDay = MINUTES_PER_DAY - 1;
    const moment = def.kind === 'deadline' || def.kind === 'event' || def.kind === 'cohort';
    const base = {
      def, level: this.set.level, season, status,
      openMinute: open.minute ?? (moment ? endOfDay : 0),
    };
    if (!def.repeat) {
      const w: ResolvedWindow = {
        ...base, id: def.id, openDay: open.day,
        closeDay: close.day, closeMinute: close.minute ?? (moment && !def.closes ? (open.minute ?? endOfDay) : endOfDay),
      };
      if (w.closeDay < w.openDay || (w.closeDay === w.openDay && w.closeMinute < w.openMinute)) {
        throw new Error(`${this.set.level} ${season}: window ${def.id} closes (${w.closeDay}) before it opens (${w.openDay})`);
      }
      return [w];
    }
    const rp = def.repeat;
    let count = rp.count ?? (rp.countKey ? this.key(rp.countKey, `${season} ${def.id}`, []) : undefined);
    if (count === undefined && rp.untilAnchor) {
      const until = resolve(rp.untilAnchor).day;
      count = Math.floor((until - open.day) / rp.stepDays) + 1;
    }
    if (count === undefined || count < 1) throw new Error(`${this.set.level} ${season}: window ${def.id} repeat has no count`);
    const out: ResolvedWindow[] = [];
    for (let i = 1; i <= count; i++) {
      const openDay = open.day + (i - 1) * rp.stepDays;
      out.push({ ...base, id: `${def.id}_${i}`, index: i, openDay, closeDay: openDay + rp.lengthDays - 1, closeMinute: endOfDay });
    }
    return out;
  }
}

/** Calendar year a pro or college season's anchors fall in, for picking which seasons touch a range. */
export function seasonsTouching(fromDay: number, toDay: number): number[] {
  const out: number[] = [];
  for (let y = civil(fromDay).y - 1; y <= civil(toDay).y + 1; y++) out.push(y);
  return out;
}
