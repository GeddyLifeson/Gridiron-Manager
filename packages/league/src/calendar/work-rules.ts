// The work-rule checker (C11.1.1) with the limits of C11.2 and the college practice counts (T3.2.1).
// One question for any planned activity: is it allowed, and if not, which rules does it break.
// Limits are read from rule records or league-rules keys, never written as literals (C11.1.1).
// Counters are derived from activities held, never from plans.
import type { FactStatus } from '@gm/schema';
import G from './gregorian.json' with { type: 'json' };
import WR from './data/work-rules.json' with { type: 'json' };
import { DAYS_PER_WEEK, WEEKDAY, weekday } from './date.ts';
import type { CalendarEngine, ClubCalendarState } from './engine.ts';
import type { CalendarLevel, RuleLookup } from './types.ts';

export type Equipment = 'none' | 'helmets' | 'shells' | 'pads';
export type Contact = 'none' | 'thud' | 'live' | 'tackling';
export type ActivityType = 'meeting' | 'conditioning' | 'workout' | 'walkthrough' | 'practice' | 'ota' | 'minicamp' | 'joint_practice';

export interface Activity {
  readonly day: number;
  readonly type: ActivityType;
  readonly fieldMinutes: number;
  readonly facilityMinutes?: number;
  readonly positionCoachMinutes?: number;
  readonly equipment: Equipment;
  readonly contact: Contact;
  readonly footballs?: boolean;
  readonly teamVsTeam?: boolean;
  readonly oneOnOne?: boolean;
  readonly strengthStaffOnly?: boolean;
  readonly mandatory?: boolean;
  /** 2 for the second on-field session of a day. */
  readonly session?: number;
  readonly fullSpeed?: boolean;
  readonly drills?: readonly string[];
  /** For a player who joined camp late: the day he joined. */
  readonly playerJoinedDay?: number;
}

/** What the calendar says about the activity's day for this club (from workContext). */
export interface WorkContext {
  readonly season: number;
  readonly phaseId: string;
  readonly programStartDay?: number;
  /** 1-based week of phase three of the offseason program. */
  readonly phase3Week?: number;
  /** Days of the club's mandatory minicamp. */
  readonly minicampDays?: readonly number[];
  /** Phase-three week that holds the mandatory minicamp. */
  readonly minicampPhase3Week?: number;
  /** 1-based camp day counted from the club's report day. */
  readonly campDay?: number;
  readonly firstPreseasonGameDay?: number;
  readonly preseasonGames?: number;
  readonly gameDays?: readonly number[];
  readonly seasonWeek?: number;
  readonly postseasonWeek?: number;
  /** All days of the club's bye league week when the activity falls in it. */
  readonly byeWeekDays?: readonly number[];
}

/** An activity that was held, with the context it was held in. */
export interface HeldActivity { readonly activity: Activity; readonly ctx: WorkContext }

export interface WorkRule {
  readonly id: string;
  readonly leaf: string;
  readonly phases: readonly string[];
  readonly plain: string;
  readonly cls: 'blocked' | 'breakable';
  readonly status: FactStatus;
  readonly source: string;
  readonly penalty: string;
  readonly limitKey?: string;
  readonly value?: number;
  readonly [extra: string]: unknown;
}

export interface Broken {
  readonly ruleId: string;
  readonly plain: string;
  readonly cls: 'blocked' | 'breakable';
  readonly status: FactStatus;
  readonly leaf: string;
  /** The reference penalty to show in the warning (C11.2.4). */
  readonly penalty: string;
  /** C11.1.1 edge case: a rule below Verified still applies and shows a developer warning. */
  readonly developerWarning: boolean;
}

export interface CheckResult {
  readonly allowed: boolean;
  /** True when a blocked rule is broken: the act cannot be scheduled. */
  readonly blocked: boolean;
  readonly broken: readonly Broken[];
}

export const WORK_RULES: readonly WorkRule[] = WR.rules as WorkRule[];
const PENALTIES: Record<string, { plain: string }> = WR.referencePenalties;
const MINUTES_PER_HOUR = G.minutesPerHour;
const EQUIP: readonly Equipment[] = ['none', 'helmets', 'shells', 'pads'];

export function basePhase(phaseId: string): string { return phaseId.replace(/_new_hc$/, ''); }
const ON_FIELD: readonly ActivityType[] = ['walkthrough', 'practice', 'ota', 'minicamp', 'joint_practice', 'workout', 'conditioning'];
const PROGRAM: readonly ActivityType[] = ['workout', 'conditioning', 'walkthrough', 'practice', 'ota', 'minicamp'];
const isPadded = (a: Activity) => a.equipment === 'pads';
const isWeekend = (d: number) => weekday(d) === WEEKDAY.sat || weekday(d) === WEEKDAY.sun;

function num(rule: WorkRule, field: string): number {
  const v = rule[field];
  if (typeof v !== 'number') throw new Error(`work rule ${rule.id} has no number ${field}`);
  return v;
}

export class WorkRuleChecker {
  constructor(private readonly rules: RuleLookup, readonly records: readonly WorkRule[] = WORK_RULES) {
    for (const r of records) if (r.limitKey && rules(r.limitKey) === undefined) throw new Error(`work rule ${r.id}: key ${r.limitKey} is not defined`);
  }

  private limit(r: WorkRule): number {
    if (r.limitKey) {
      const v = this.rules(r.limitKey);
      if (v === undefined) throw new Error(`key ${r.limitKey} is not defined`);
      return v;
    }
    return num(r, 'value');
  }

  /** Check one planned activity against everything already held by the club this league year. */
  check(a: Activity, ctx: WorkContext, held: readonly HeldActivity[]): CheckResult {
    const phase = basePhase(ctx.phaseId);
    const broken: Broken[] = [];
    for (const r of this.records) {
      if (!r.phases.includes(phase)) continue;
      if (typeof r['seasonsThrough'] === 'number' && ctx.season > r['seasonsThrough']) continue;
      if (typeof r['seasonsFrom'] === 'number' && ctx.season < r['seasonsFrom']) continue;
      if (this.breaks(r, a, ctx, held)) {
        broken.push({
          ruleId: r.id, plain: r.plain, cls: r.cls, status: r.status, leaf: r.leaf,
          penalty: PENALTIES[r.penalty]?.plain ?? '', developerWarning: r.status !== 'Verified',
        });
      }
    }
    const blocked = broken.some((b) => b.cls === 'blocked');
    return { allowed: broken.length === 0, blocked, broken };
  }

  private breaks(r: WorkRule, a: Activity, ctx: WorkContext, held: readonly HeldActivity[]): boolean {
    const sameDay = held.filter((h) => h.activity.day === a.day).map((h) => h.activity);
    const dayAll = [...sameDay, a];
    const fieldToday = dayAll.reduce((s, x) => s + x.fieldMinutes, 0);
    const onField = ON_FIELD.includes(a.type);
    switch (r.id) {
      case 'off.program_window':
        return PROGRAM.includes(a.type) && (ctx.programStartDay === undefined || a.day < ctx.programStartDay) && basePhase(ctx.phaseId) !== 'summer_break';
      case 'off.gap_before_camp': return onField;
      case 'off.phase1_content':
        return !['meeting', 'conditioning', 'workout'].includes(a.type) || a.strengthStaffOnly !== true || a.equipment !== 'none' || a.footballs === true;
      case 'off.phase2_content': return a.teamVsTeam === true || a.oneOnOne === true || a.type === 'ota';
      case 'off.contact': return a.contact !== 'none';
      case 'off.no_pads': return a.equipment === 'shells' || a.equipment === 'pads';
      case 'off.ota_days':
        return a.type === 'ota' && held.filter((h) => h.activity.type === 'ota').length + 1 > this.limit(r);
      case 'off.ota_spacing': {
        if (a.type !== 'ota' || ctx.phase3Week === undefined) return false;
        const inWeek = held.filter((h) => h.activity.type === 'ota' && h.ctx.phase3Week === ctx.phase3Week).length + 1;
        const weekCap = ctx.phase3Week <= num(r, 'firstWeeks') ? num(r, 'value') : this.limit(r);
        const minicampWeek = ctx.minicampPhase3Week === ctx.phase3Week;
        return inWeek > weekCap || minicampWeek;
      }
      case 'off.workouts_per_week': {
        if (!PROGRAM.includes(a.type)) return false;
        const wk = weekStart(a.day);
        const days = new Set(held.filter((h) => PROGRAM.includes(h.activity.type) && weekStart(h.activity.day) === wk).map((h) => h.activity.day));
        days.add(a.day);
        return days.size > this.limit(r);
      }
      case 'off.no_weekends': return PROGRAM.includes(a.type) && isWeekend(a.day);
      case 'off.hours_non_ota':
        if (a.type === 'ota' || sameDay.some((x) => x.type === 'ota') || !PROGRAM.includes(a.type)) return false;
        return fieldToday > num(r, 'fieldMinutes') || dayAll.reduce((s, x) => s + (x.facilityMinutes ?? 0), 0) > num(r, 'facilityMinutes');
      case 'off.hours_ota':
        if (!dayAll.some((x) => x.type === 'ota')) return false;
        return fieldToday > num(r, 'fieldMinutes') || dayAll.reduce((s, x) => s + (x.facilityMinutes ?? 0), 0) > num(r, 'facilityMinutes');
      case 'off.minicamp': {
        if (a.type !== 'minicamp') return false;
        const inPhase = basePhase(ctx.phaseId) === 'mandatory_minicamp';
        const days = new Set(held.filter((h) => h.activity.type === 'minicamp').map((h) => h.activity.day));
        days.add(a.day);
        return !inPhase || days.size > this.limit(r);
      }
      case 'off.mandatory_attendance': return a.mandatory === true && a.type !== 'minicamp';
      case 'camp.acclimation_day1':
        return ctx.campDay === 1 && (!['meeting', 'conditioning'].includes(a.type) || a.equipment !== 'none' || a.footballs === true);
      case 'camp.acclimation': {
        const cd = ctx.campDay;
        if (cd === undefined || cd <= 1 || cd > num(r, 'acclimationDays')) return false;
        const maxEquip: Equipment = cd <= num(r, 'helmetDaysThrough') ? 'helmets' : 'shells';
        const fullSpeed = dayAll.filter((x) => x.fullSpeed);
        return a.contact === 'live' || a.contact === 'tackling' || fieldToday > num(r, 'fieldMinutes')
          || EQUIP.indexOf(a.equipment) > EQUIP.indexOf(maxEquip) || fullSpeed.length > 1
          || fullSpeed.some((x) => x.fieldMinutes > num(r, 'fullSpeedMinutes'));
      }
      case 'camp.day_off_after_acclimation': return ctx.campDay === num(r, 'acclimationDays') + 1 && onField;
      case 'camp.padded_total': return isPadded(a) && campPadded(held).length + 1 > this.limit(r);
      case 'camp.padded_consecutive': return isPadded(a) && runEndingAt(paddedDays(held, a), a.day) > this.limit(r);
      case 'camp.padded_blocks': {
        if (!isPadded(a)) return false;
        const blocks = blocksOf(paddedDays(held, a), num(r, 'blockLength'));
        const gaps = blocks.slice(1).map((b, i) => b.start - blocks[i]!.end - 1);
        return blocks.length > this.limit(r) || gaps.some((g) => g < num(r, 'gapDays'));
      }
      case 'camp.padded_length':
        return isPadded(a) && (a.fieldMinutes > this.limit(r) * MINUTES_PER_HOUR || sameDay.some(isPadded));
      case 'camp.field_hours': return fieldToday > this.limit(r) * MINUTES_PER_HOUR;
      case 'camp.second_session': return (a.session ?? 1) > 1 && (a.type !== 'walkthrough' || a.equipment !== 'none');
      case 'camp.days_off_weekly': {
        if (!onField || (ctx.firstPreseasonGameDay !== undefined && a.day >= ctx.firstPreseasonGameDay)) return false;
        const worked = new Set(held.filter((h) => ON_FIELD.includes(h.activity.type)).map((h) => h.activity.day));
        worked.add(a.day);
        return runEndingAt([...worked], a.day) >= this.limit(r) || runStartingAt([...worked], a.day) >= this.limit(r);
      }
      case 'camp.days_off_total': return false; // checked at the end of camp: campDaysOffShort()
      case 'camp.joint_practices': {
        if (a.type !== 'joint_practice') return false;
        const joint = held.filter((h) => h.activity.type === 'joint_practice').map((h) => h.activity.day);
        const wk = weekStart(a.day);
        const inWeek = new Set([...joint.filter((d) => weekStart(d) === wk), a.day]).size;
        const total = new Set([...joint, a.day]).size;
        const dayBeforeGame = (ctx.gameDays ?? []).includes(a.day + 1);
        return inWeek > this.limit(r) || total > num(r, 'seasonTotal') || dayBeforeGame;
      }
      case 'camp.prohibited_drills': {
        const list = r['drills'] as readonly string[];
        return (a.drills ?? []).some((d) => list.includes(d));
      }
      case 'camp.late_player':
        return isPadded(a) && a.playerJoinedDay !== undefined && a.day - a.playerJoinedDay + 1 < this.limit(r);
      case 'season.padded_total': {
        if (!isPadded(a) || ctx.seasonWeek === undefined) return false;
        const boundary = num(r, 'boundaryWeek');
        const early = ctx.seasonWeek <= boundary;
        const count = seasonPadded(held).filter((h) => (h.ctx.seasonWeek ?? 0) <= boundary === early).length + 1;
        return count > (early ? this.limit(r) : num(r, 'lateValue'));
      }
      case 'season.two_padded_week': {
        if (!isPadded(a) || ctx.seasonWeek === undefined) return false;
        const sp = seasonPadded(held);
        const inWeek = sp.filter((h) => h.ctx.seasonWeek === ctx.seasonWeek).length + 1;
        if (inWeek < this.limit(r)) return false;
        if (inWeek > this.limit(r) || ctx.seasonWeek > num(r, 'boundaryWeek')) return true;
        const weeks = new Map<number, number>();
        for (const h of sp) weeks.set(h.ctx.seasonWeek ?? 0, (weeks.get(h.ctx.seasonWeek ?? 0) ?? 0) + 1);
        return [...weeks.entries()].some(([w, n]) => w !== ctx.seasonWeek && n >= this.limit(r));
      }
      case 'season.field_time':
        return a.fieldMinutes - (a.positionCoachMinutes ?? 0) > num(r, 'fieldMinutes') || (a.positionCoachMinutes ?? 0) > num(r, 'positionCoachMinutes')
          || dayAll.reduce((s, x) => s + x.fieldMinutes - (x.positionCoachMinutes ?? 0), 0) > num(r, 'fieldMinutes');
      case 'season.bye_days_off': {
        if (!onField || !ctx.byeWeekDays) return false;
        const busy = new Set([...held.map((h) => h.activity.day), a.day]);
        return !hasFreeRun(ctx.byeWeekDays, busy, this.limit(r));
      }
      case 'season.postseason_padded':
        return isPadded(a) && ctx.postseasonWeek !== undefined
          && held.filter((h) => isPadded(h.activity) && h.ctx.postseasonWeek === ctx.postseasonWeek).length + 1 > this.limit(r);
      case 'college.spring': case 'college.spring_2027': case 'college.preseason': case 'college.preseason_2027': {
        if (a.type !== 'practice' && a.type !== 'walkthrough') return false;
        const phaseNow = basePhase(ctx.phaseId);
        const same = held.filter((h) => basePhase(h.ctx.phaseId) === phaseNow && h.ctx.season === ctx.season).map((h) => h.activity);
        const all = [...same, a];
        if (all.length > this.limit(r)) return true;
        if (typeof r['spanDays'] === 'number') {
          const first = Math.min(...all.map((x) => x.day));
          if (a.day - first + 1 > r['spanDays']) return true;
        }
        if (typeof r['contactMax'] === 'number' && all.filter((x) => x.contact !== 'none').length > r['contactMax']) return true;
        if (typeof r['tacklingMax'] === 'number' && all.filter((x) => x.contact === 'tackling').length > r['tacklingMax']) return true;
        return false;
      }
      default:
        throw new Error(`work rule ${r.id} has no check`);
    }
  }

  /** C11.2.2 days-off total, checked when camp ends: true when the club gave too few days off. */
  campDaysOffShort(campDays: readonly number[], held: readonly HeldActivity[], preseasonGames: number): boolean {
    const r = this.records.find((x) => x.id === 'camp.days_off_total');
    if (!r) return false;
    const worked = new Set(held.filter((h) => ON_FIELD.includes(h.activity.type)).map((h) => h.activity.day));
    const off = campDays.filter((d) => !worked.has(d)).length;
    const need = preseasonGames <= num(r, 'fewGamesAtMost') ? num(r, 'valueFewGames') : num(r, 'value');
    return off < need;
  }
}

/** Running counters a planner shows (C11.1.1 outputs, C11.2.2 and C11.2.3 screens). */
export function workCounters(held: readonly HeldActivity[], boundaryWeek: number) {
  const sp = seasonPadded(held);
  return {
    otaDays: held.filter((h) => h.activity.type === 'ota').length,
    paddedCamp: campPadded(held).length,
    paddedSeasonEarly: sp.filter((h) => (h.ctx.seasonWeek ?? 0) <= boundaryWeek).length,
    paddedSeasonLate: sp.filter((h) => (h.ctx.seasonWeek ?? 0) > boundaryWeek).length,
  };
}

function campPadded(held: readonly HeldActivity[]) {
  return held.filter((h) => isPadded(h.activity) && ['training_camp', 'preseason'].includes(basePhase(h.ctx.phaseId)));
}
function seasonPadded(held: readonly HeldActivity[]) {
  return held.filter((h) => isPadded(h.activity) && basePhase(h.ctx.phaseId) === 'regular_season');
}
function paddedDays(held: readonly HeldActivity[], a: Activity): number[] {
  return [...new Set([...campPadded(held).map((h) => h.activity.day), a.day])].sort((x, y) => x - y);
}
function runEndingAt(days: readonly number[], day: number): number {
  const s = new Set(days);
  let n = 0;
  while (s.has(day - n)) n++;
  return n;
}
function runStartingAt(days: readonly number[], day: number): number {
  const s = new Set(days);
  let n = 0;
  while (s.has(day + n)) n++;
  return n;
}
/** Maximal runs of consecutive days at least `len` long. */
function blocksOf(days: readonly number[], len: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j]! + 1) j++;
    if (j - i + 1 >= len) out.push({ start: days[i]!, end: days[j]! });
    i = j + 1;
  }
  return out;
}
function hasFreeRun(week: readonly number[], busy: ReadonlySet<number>, need: number): boolean {
  const days = [...week].sort((x, y) => x - y);
  let run: number[] = [];
  const ok = (r: number[]) => r.length >= need && r.some((d) => weekday(d) === WEEKDAY.sat) && r.some((d) => weekday(d) === WEEKDAY.sun);
  for (const d of days) {
    if (busy.has(d)) { if (ok(run)) return true; run = []; } else run.push(d);
  }
  return ok(run);
}
/** Program weeks start on Monday (the program starts on a Monday, C4.3.1). */
function weekStart(day: number): number { return day - ((weekday(day) - WEEKDAY.mon + DAYS_PER_WEEK) % DAYS_PER_WEEK); }
export interface ClubWorkFacts extends ClubCalendarState {
  readonly reportDay?: number;
  readonly gameDays?: readonly number[];
  readonly preseasonGames?: number;
  readonly byeWeek?: number;
}

/** Build the checker context for a club's day from the calendar (C11.1.1 inputs: phase, date). */
export function workContext(engine: CalendarEngine, level: CalendarLevel, day: number, club: ClubWorkFacts = {}): WorkContext {
  const phase = engine.phaseOf(level, day, club);
  const phaseId = phase?.id ?? 'none';
  const season = engine.seasonOf(level, day);
  const r = engine.resolver(level);
  const sfx = club.newHeadCoach ? '_new_hc' : '';
  const s = r.season(season);
  const anchor = (id: string) => s.anchors.get(id)?.day;
  const p3 = anchor(`program_phase3_start${sfx}`);
  const mcStart = anchor(`minicamp_start${sfx}`), mcEnd = anchor(`minicamp_end${sfx}`);
  const regWeek = engine.windowsOn(level, day, 'window').find((w) => w.def.id === 'regular_week');
  const postOrder = ['wild_card', 'divisional', 'conference_championship', 'championship_preparation', 'league_championship'];
  const games = club.gameDays ?? [];
  const firstPre = phase && ['training_camp', 'preseason'].includes(phase.id) ? games.filter((g) => g >= (club.reportDay ?? day)).sort((a, b) => a - b)[0] : undefined;
  const ctx: WorkContext = {
    season, phaseId,
    ...(anchor(`program_start${sfx}`) !== undefined ? { programStartDay: anchor(`program_start${sfx}`)! } : {}),
    ...(p3 !== undefined && day >= p3 ? { phase3Week: Math.floor((day - p3) / DAYS_PER_WEEK) + 1 } : {}),
    ...(mcStart !== undefined && mcEnd !== undefined ? { minicampDays: range(mcStart, mcEnd) } : {}),
    ...(mcStart !== undefined && p3 !== undefined ? { minicampPhase3Week: Math.floor((mcStart - p3) / DAYS_PER_WEEK) + 1 } : {}),
    ...(club.reportDay !== undefined && day >= club.reportDay ? { campDay: day - club.reportDay + 1 } : {}),
    ...(firstPre !== undefined ? { firstPreseasonGameDay: firstPre } : {}),
    ...(club.preseasonGames !== undefined ? { preseasonGames: club.preseasonGames } : {}),
    gameDays: games,
    ...(regWeek?.index !== undefined ? { seasonWeek: regWeek.index } : {}),
    ...(postOrder.includes(phaseId) ? { postseasonWeek: postOrder.indexOf(phaseId) + 1 } : {}),
    ...(regWeek && regWeek.index === club.byeWeek ? { byeWeekDays: range(regWeek.openDay, regWeek.closeDay) } : {}),
  };
  return ctx;
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let d = a; d <= b; d++) out.push(d);
  return out;
}
