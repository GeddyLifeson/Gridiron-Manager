// The calendar engine (C4.1.1): one shared world date, per-level calendar files, events every system
// receives in the same order, per-club phases, deadline checks, and advancing by day, deadline or game.
import type { FactStatus } from '@gm/schema';
import { MINUTES_PER_DAY, civil, iso, yearStart, type Instant } from './date.ts';
import { CalendarResolver, calendarSet } from './resolve.ts';
import type { CalendarFile, CalendarLevel, ResolvedWindow, RuleLookup, WindowDef } from './types.ts';

export type CalendarEventType =
  | 'DayStart' | 'StageMarker' | 'PhaseStart' | 'WindowOpened' | 'Event' | 'CohortEntered' | 'Deadline' | 'WindowClosed';

/** Delivery order inside one minute. Exits and vacancies come before a cohort on a shared date (X11.1.1). */
const STAGE: readonly CalendarEventType[] = ['DayStart', 'StageMarker', 'PhaseStart', 'WindowOpened', 'Event', 'CohortEntered', 'Deadline', 'WindowClosed'];

export interface CalendarEvent {
  readonly type: CalendarEventType;
  readonly day: number;
  readonly minute: number;
  readonly level?: CalendarLevel;
  readonly season?: number;
  /** Window id (after repeat expansion), phase id, or stage name. */
  readonly id: string;
  readonly label: string;
  readonly leaf?: string;
  readonly status?: FactStatus;
  readonly check?: string;
  readonly stopsUser?: boolean;
  readonly cohort?: string;
  readonly period?: string;
  readonly kind?: WindowDef['kind'];
}

/** A club's own facts the shared calendar needs to give it its own phase (C4.1.1 rule 3). */
export interface ClubCalendarState {
  readonly newHeadCoach?: boolean;
  /** The club plays in the postseason of the season now ending. */
  readonly inPostseason?: boolean;
  /** Day number of the club's last game of the season; set once it is eliminated or finished. */
  readonly lastGameDay?: number;
}

export interface CalendarCursor {
  /** The day being lived. */
  readonly day: number;
  /** Events of that day already delivered. */
  readonly done: number;
}

export type AdvanceTarget =
  | { readonly kind: 'day' }
  | { readonly kind: 'days'; readonly n: number }
  | { readonly kind: 'until'; readonly day: number }
  | { readonly kind: 'nextDeadline'; readonly level?: CalendarLevel }
  | { readonly kind: 'nextGame'; readonly gameDays: readonly number[] };

export interface AdvanceContext {
  /** Levels whose events are delivered (default: every loaded level). */
  readonly levels?: readonly CalendarLevel[];
  /** Run at every deadline (C4.1.1 acceptance 2). Return true when the user's club still has an open decision. */
  readonly check?: (e: CalendarEvent) => boolean;
  /** All tasks delegated (C4.1.2): open decisions take the default result instead of stopping time. */
  readonly delegated?: boolean;
}

export interface AdvanceResult {
  readonly cursor: CalendarCursor;
  readonly events: readonly CalendarEvent[];
  /** The deadline time stopped at, when the user's club has an open decision (C4.2.4, C4.4.4). */
  readonly stoppedAt?: CalendarEvent;
  /** Deadlines whose default result the league applied for the user's club (C4.1.1 rule 4). */
  readonly defaultsApplied: readonly CalendarEvent[];
  /** Number of deadline checks run. */
  readonly checksRun: number;
}

export interface CalendarEngineOptions {
  readonly files: readonly CalendarFile[];
  readonly rules: RuleLookup;
  readonly levels?: readonly CalendarLevel[];
}

export class CalendarEngine {
  readonly levels: readonly CalendarLevel[];
  private readonly resolvers = new Map<CalendarLevel, CalendarResolver>();
  private readonly yearEvents = new Map<number, Map<number, CalendarEvent[]>>();

  constructor(opts: CalendarEngineOptions) {
    this.levels = opts.levels ?? [...new Set(opts.files.map((f) => f.level))].sort();
    for (const level of this.levels) this.resolvers.set(level, new CalendarResolver(calendarSet(level, opts.files), opts.rules));
  }

  resolver(level: CalendarLevel): CalendarResolver {
    const r = this.resolvers.get(level);
    if (!r) throw new Error(`no calendar loaded for ${level}`);
    return r;
  }

  /** Every resolved window that can touch a day: seasons y-1 to y+1 of its calendar year. */
  windowsNear(level: CalendarLevel, day: number): ResolvedWindow[] {
    const y = civil(day).y;
    const out: ResolvedWindow[] = [];
    for (let s = y - 1; s <= y + 1; s++) out.push(...this.resolver(level).season(s).windows);
    return out;
  }

  windowsOn(level: CalendarLevel, day: number, kind?: WindowDef['kind']): ResolvedWindow[] {
    return this.windowsNear(level, day).filter((w) => w.openDay <= day && day <= w.closeDay && (kind === undefined || w.def.kind === kind));
  }

  /** The club's phase on a day: the highest-order phase window that applies to it (C4.1.1 rules 2 and 3). */
  phaseOf(level: CalendarLevel, day: number, club: ClubCalendarState = {}): ResolvedWindow | undefined {
    let best: ResolvedWindow | undefined;
    for (const w of this.windowsNear(level, day)) {
      if (w.def.kind !== 'phase' || !this.applies(w, club, day)) continue;
      const span = this.clubSpan(w, club, level);
      if (!span || day < span.open || day > span.close) continue;
      if (!best || (w.def.order ?? 0) > (best.def.order ?? 0)) best = w;
    }
    return best;
  }

  private applies(w: ResolvedWindow, club: ClubCalendarState, day: number): boolean {
    switch (w.def.audience ?? 'all') {
      case 'all': return true;
      case 'new_head_coach': return club.newHeadCoach === true;
      case 'returning_head_coach': return club.newHeadCoach !== true;
      case 'postseason': return club.inPostseason === true && (club.lastGameDay === undefined || day <= club.lastGameDay);
    }
  }

  /** Season review starts the day after the club's own last game (C4.6.1); staff changes follow it. */
  private clubSpan(w: ResolvedWindow, club: ClubCalendarState, level: CalendarLevel): { open: number; close: number } | undefined {
    if (!w.def.clubExit || club.lastGameDay === undefined) return { open: w.openDay, close: w.closeDay };
    const review = w.def.clubExit === 'review' ? w : this.resolver(level).season(w.season).windows.find((x) => x.def.clubExit === 'review');
    if (!review) return { open: w.openDay, close: w.closeDay };
    const shift = Math.max(0, club.lastGameDay + 1 - review.openDay);
    const reviewClose = review.closeDay + shift;
    if (w.def.clubExit === 'review') return { open: review.openDay + shift, close: reviewClose };
    const open = Math.max(w.openDay, reviewClose + 1);
    return open > w.closeDay ? undefined : { open, close: w.closeDay };
  }

  /** The season a day belongs to: pro by league-year start (C4.7.1), college by January 1. */
  seasonOf(level: CalendarLevel, day: number): number {
    const r = this.resolver(level);
    const y = civil(day).y;
    const startId = r.set.pattern.anchors.some((a) => a.id === 'league_year_start') ? 'league_year_start' : 'year_start';
    return day >= r.anchor(y, startId).day ? y : y - 1;
  }

  private buildYear(y: number): Map<number, CalendarEvent[]> {
    const byDay = new Map<number, CalendarEvent[]>();
    const lo = yearStart(y), hi = yearStart(y + 1) - 1;
    const push = (e: CalendarEvent) => {
      if (e.day < lo || e.day > hi) return;
      const list = byDay.get(e.day);
      if (list) list.push(e); else byDay.set(e.day, [e]);
    };
    for (let d = lo; d <= hi; d++) push({ type: 'DayStart', day: d, minute: 0, id: iso(d), label: iso(d) });
    for (const level of this.levels) {
      const seen = new Set<string>();
      for (let s = y - 1; s <= y + 1; s++) {
        for (const w of this.resolver(level).season(s).windows) {
          const key = `${s}:${w.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const common = {
            level, season: s, id: w.id, label: w.def.label, leaf: w.def.leaf, status: w.status, kind: w.def.kind,
            ...(w.def.check ? { check: w.def.check } : {}), ...(w.def.stopsUser ? { stopsUser: true } : {}),
            ...(w.def.period ? { period: w.def.period } : {}), ...(w.def.cohort ? { cohort: w.def.cohort } : {}),
          };
          switch (w.def.kind) {
            case 'deadline': push({ ...common, type: 'Deadline', day: w.openDay, minute: w.openMinute }); break;
            case 'event': push({ ...common, type: 'Event', day: w.openDay, minute: w.openMinute }); break;
            case 'cohort':
              push({ type: 'StageMarker', day: w.openDay, minute: w.openMinute, level, season: s, id: 'exits', label: 'Exits processed' });
              push({ type: 'StageMarker', day: w.openDay, minute: w.openMinute, level, season: s, id: 'vacancies', label: 'Vacancies posted' });
              push({ ...common, type: 'CohortEntered', day: w.openDay, minute: w.openMinute });
              break;
            default:
              push({ ...common, type: 'WindowOpened', day: w.openDay, minute: w.openMinute });
              push({ ...common, type: 'WindowClosed', day: w.closeDay, minute: w.closeMinute });
          }
        }
      }
      // Baseline phase changes (a returning-coach club outside the postseason) for the date bar and AI.
      let prev: string | undefined = this.phaseOf(level, lo - 1)?.id;
      for (let d = lo; d <= hi; d++) {
        const p = this.phaseOf(level, d);
        if (p && p.id !== prev) push({ type: 'PhaseStart', day: d, minute: 0, level, season: p.season, id: p.id, label: p.def.label, leaf: p.def.leaf, status: p.status });
        prev = p?.id;
      }
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => a.minute - b.minute || STAGE.indexOf(a.type) - STAGE.indexOf(b.type)
        || (a.level ?? '').localeCompare(b.level ?? '') || stageMarkerOrder(a) - stageMarkerOrder(b) || a.id.localeCompare(b.id));
    }
    return byDay;
  }

  /** Every event of one day, all levels, in delivery order. */
  eventsOn(day: number): readonly CalendarEvent[] {
    const y = civil(day).y;
    let m = this.yearEvents.get(y);
    if (!m) { m = this.buildYear(y); this.yearEvents.set(y, m); }
    return m.get(day) ?? [];
  }

  /** Advance time (C4.1.1). Day steps and jumps run the same loop, so they reach the same state. */
  advance(cursor: CalendarCursor, target: AdvanceTarget, ctx: AdvanceContext = {}): AdvanceResult {
    const levels = new Set(ctx.levels ?? this.levels);
    const events: CalendarEvent[] = [];
    const defaultsApplied: CalendarEvent[] = [];
    let checksRun = 0;
    let { day, done } = cursor;
    const endDay = target.kind === 'day' ? day + 1
      : target.kind === 'days' ? day + target.n
      : target.kind === 'until' ? target.day
      : target.kind === 'nextGame' ? nextAfter(target.gameDays, day)
      : undefined;
    for (;;) {
      if (endDay !== undefined && day >= endDay) break;
      const list = this.eventsOn(day);
      let stopAfter = false;
      while (done < list.length) {
        const e = list[done]!;
        if (e.level !== undefined && !levels.has(e.level)) { done++; continue; }
        if (e.type === 'Deadline') {
          checksRun++;
          const open = ctx.check ? ctx.check(e) : false;
          if (open && e.stopsUser && !ctx.delegated) return { cursor: { day, done }, events, stoppedAt: e, defaultsApplied, checksRun };
          if (open) defaultsApplied.push(e);
        }
        events.push(e);
        done++;
        if (target.kind === 'nextDeadline' && e.type === 'Deadline' && (target.level === undefined || e.level === target.level)) { stopAfter = true; break; }
      }
      if (stopAfter) return { cursor: { day, done }, events, defaultsApplied, checksRun };
      day++;
      done = 0;
    }
    return { cursor: { day, done }, events, defaultsApplied, checksRun };
  }

  /** Next deadline at or after a day for a level. */
  nextDeadline(level: CalendarLevel, fromDay: number, horizonDays = MINUTES_PER_DAY): CalendarEvent | undefined {
    for (let d = fromDay; d < fromDay + horizonDays; d++) {
      const e = this.eventsOn(d).find((x) => x.type === 'Deadline' && x.level === level);
      if (e) return e;
    }
    return undefined;
  }

  /** The date bar (C4.1.1): date, phase, days to the next deadline and the next game. */
  dateBar(level: CalendarLevel, day: number, club: ClubCalendarState = {}, gameDays: readonly number[] = []): DateBar {
    const phase = this.phaseOf(level, day, club);
    const dl = this.nextDeadline(level, day);
    const g = gameDays.filter((x) => x >= day).sort((a, b) => a - b)[0];
    return {
      date: iso(day), season: this.seasonOf(level, day), phaseId: phase?.id, phase: phase?.def.label,
      daysToDeadline: dl ? dl.day - day : undefined, nextDeadline: dl?.label, daysToGame: g === undefined ? undefined : g - day,
    };
  }

  /** Club-specific camp report date (C4.4.2 rule 1): veterans report N days before the club's first game. */
  clubReportDay(firstGameDay: number, mondayOpener: boolean, rules: RuleLookup): Instant {
    const before = req(rules, 'calendar.veteran_report_days_before_opener') + (mondayOpener ? req(rules, 'calendar.monday_opener_extra_report_days') : 0);
    return { day: firstGameDay - before, minute: 0 };
  }
}

export interface DateBar {
  readonly date: string;
  readonly season: number;
  readonly phaseId: string | undefined;
  readonly phase: string | undefined;
  readonly daysToDeadline: number | undefined;
  readonly nextDeadline: string | undefined;
  readonly daysToGame: number | undefined;
}

function stageMarkerOrder(e: CalendarEvent): number {
  return e.type === 'StageMarker' ? (e.id === 'exits' ? 0 : 1) : 0;
}

/** The first game day after the day being lived; with none, advancing to a game does nothing. */
function nextAfter(days: readonly number[], day: number): number {
  const later = days.filter((d) => d > day).sort((a, b) => a - b);
  return later[0] ?? day;
}

export function req(rules: RuleLookup, key: string): number {
  const v = rules(key);
  if (v === undefined) throw new Error(`rule key ${key} is not defined`);
  return v;
}
