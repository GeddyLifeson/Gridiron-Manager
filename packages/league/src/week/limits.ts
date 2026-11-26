// Work rules and limits on the players' week (H1.1.2 pro, H1.5.2 college countable hours).
// A broken limit is never refused: hard findings go through the L8.2.5 warning (C11.2.4), soft ones
// charge fatigue and morale. Practice limits reuse the G-12 work-rule checker (C11.2.3); the week adds
// the rules that need the whole week: the day off, days off after a Thursday game, the facility day,
// and the countable-hours ledger.
import WR from '../calendar/data/work-rules.json' with { type: 'json' };
import { MINUTES_PER_DAY, instantValue, weekday, WEEKDAY, DAYS_PER_WEEK } from '../calendar/date.ts';
import type { RuleLookup } from '../calendar/types.ts';
import type { Activity, ActivityType, HeldActivity, WorkContext, WorkRuleChecker } from '../calendar/work-rules.ts';
import type { FactStatus } from '@gm/schema';
import { blockEnd, isPlayerObligation } from './atoms.ts';
import { allBlocks } from './build.ts';
import { countsHours, flag, need } from './keys.ts';
import { LEAGUE_KEYS, P } from './params.ts';
import type { Block, Finding, Week } from './types.ts';

const PENALTY: Record<string, { plain: string }> = WR.referencePenalties;

export interface LimitEnv {
  readonly rules: RuleLookup;
  /** The G-12 checker for C11.2 practice limits; omitted in a countable-hours rule set or a test. */
  readonly checker?: WorkRuleChecker;
  /** Calendar context for a day (G-12 `workContext`). Needed with `checker`. */
  readonly ctxFor?: (day: number) => WorkContext;
  /** Activities already held this league year (season counters, H1.1.2 inputs). */
  readonly held?: readonly HeldActivity[];
  /** Days of this calendar week that were player-free in the previous Week (day-off rule across weeks). */
  readonly previousFreeDays?: readonly number[];
  /** Countable minutes per day in the days before this week (rolling 7-day college windows). */
  readonly previousCountable?: ReadonlyMap<number, number>;
}

function finding(ruleId: string, hardness: 'hard' | 'soft', classId: string, plain: string, penalty: string, leaf: string, status: FactStatus, blockId: string | null): Finding {
  return { ruleId, hardness, classId, plain, penalty, leaf, blockId, developerWarning: status !== 'Verified' };
}

/** Map a week block to the G-12 activity model. Walkthroughs and lifts take no field time (CBA Art. 24 1(d)). */
export function toActivity(b: Block): Activity | null {
  const map: Partial<Record<Block['type'], ActivityType>> = { practice: 'practice', walkthrough: 'walkthrough', lift_conditioning: 'conditioning' };
  const type = map[b.type];
  if (!type || !b.mandatory) return null;
  return {
    day: b.start.day, type,
    fieldMinutes: b.type === 'practice' ? b.minutes : 0,
    positionCoachMinutes: b.positionCoachMinutes ?? 0,
    equipment: b.equipment ?? 'none', contact: b.contact ?? 'none',
    fullSpeed: b.type === 'practice', mandatory: true,
  };
}

/** Days of the week that are free of every player obligation (H1.1.2 day off). Game days never count. */
export function freeDays(week: Week): number[] {
  const out: number[] = [];
  for (const d of week.days) {
    if (d.gMinus === 0) continue;
    if (!d.blocks.some(isPlayerObligation)) out.push(d.day);
  }
  return out;
}

/** Countable minutes per day (H1.5.2 rule 1). The game day charges the configured hours whatever its length. */
export function countableMinutes(week: Week, rules: RuleLookup): Map<number, number> {
  const mph = P('minutes_per_hour');
  const out = new Map<number, number>();
  for (const d of week.days) out.set(d.day, 0);
  const travelCounts = flag(rules, 'college.travel_counts_as_cara');
  for (const b of allBlocks(week)) {
    const counts = (b.countable === true && b.voluntary !== true) || (travelCounts && b.type === 'travel');
    if (!counts) continue;
    const add = b.type === 'game' ? need(rules, 'college.cara_game_day_hours') * mph : b.minutes;
    out.set(b.start.day, (out.get(b.start.day) ?? 0) + add);
  }
  return out;
}

function proFindings(week: Week, env: LimitEnv): Finding[] {
  const out: Finding[] = [];
  const pen = PENALTY['practice']?.plain ?? '';
  // C11.2.3 practice limits through the G-12 checker, in start order, earlier blocks counted as held.
  if (env.checker && env.ctxFor) {
    const held: HeldActivity[] = [...(env.held ?? [])];
    for (const b of allBlocks(week)) {
      const a = toActivity(b);
      if (!a) continue;
      const ctx = env.ctxFor(b.start.day);
      const res = env.checker.check(a, ctx, held);
      for (const br of res.broken) out.push(finding(br.ruleId, 'hard', 'work_rules_practice', br.plain, br.penalty, br.leaf, br.status, b.id));
      held.push({ activity: a, ctx });
    }
  }
  // H1.1.2: one full day off per calendar week (Sunday to Saturday), checked on the week that holds its Saturday.
  const need1 = env.rules(LEAGUE_KEYS.dayOffPerWeek);
  if (need1 !== undefined) {
    const free = new Set([...freeDays(week), ...(env.previousFreeDays ?? [])]);
    for (const d of week.days) {
      if (weekday(d.day) !== WEEKDAY.sat) continue;
      const sunday = d.day - (DAYS_PER_WEEK - 1);
      let n = 0;
      for (let x = sunday; x <= d.day; x++) if (free.has(x)) n++;
      if (n < need1) out.push(finding('week.day_off', 'hard', 'work_rules_practice', `Players get ${need1} full day off each calendar week (Sunday to Saturday)`, pen, 'H1.1.2', '1 of 3', null));
    }
  }
  // H1.1.2: days off after a Thursday game.
  const afterThu = env.rules('work.days_off_after_thursday_game');
  if (afterThu !== undefined && week.previousGameDay !== null && week.previousGameWeekday === WEEKDAY.thu) {
    const free = new Set(freeDays(week));
    for (let i = 1; i <= afterThu; i++) {
      if (!free.has(week.previousGameDay + i)) {
        out.push(finding('week.days_off_after_thursday', 'hard', 'work_rules_practice', `Players get ${afterThu} days off after a Thursday game`, pen, 'H1.1.2', '2 of 3', null));
        break;
      }
    }
  }
  return out;
}

function softFindings(week: Week, env: LimitEnv): Finding[] {
  const out: Finding[] = [];
  if (!flag(env.rules, 'work.facility_day_cap_applies')) return out;
  const cap = P('facility_day_soft_minutes');
  for (const d of week.days) {
    if (d.gMinus === 0) continue;
    const ob = d.blocks.filter((b) => isPlayerObligation(b) && b.type !== 'travel' && b.type !== 'class_academic');
    if (ob.length === 0) continue;
    if (longestStretch(ob) > cap) out.push(finding('week.facility_day', 'soft', 'work_rules_practice', 'Players’ day at the facility is past the design cap: fatigue and morale cost', '', 'H1.1.2', 'Assumption', null));
  }
  return out;
}

function countableFindings(week: Week, env: LimitEnv): Finding[] {
  const out: Finding[] = [];
  const r = env.rules;
  const mph = P('minutes_per_hour');
  const pen = PENALTY['college']?.plain ?? '';
  const mins = countableMinutes(week, r);
  const all = new Map<number, number>([...(env.previousCountable ?? new Map()), ...mins]);
  const dayCap = need(r, 'college.cara_day_hours') * mph;
  for (const d of week.days) {
    if (d.gMinus === 0) continue;
    if ((mins.get(d.day) ?? 0) > dayCap) out.push(finding('college.day_hours', 'hard', 'countable_hours', `At most ${dayCap / mph} countable hours a day`, pen, 'H1.5.2', 'Verified', null));
  }
  const weekCap = need(r, 'college.cara_week_hours') * mph;
  const offNeed = need(r, 'college.cara_days_off_per_week');
  const reported = new Set<string>();
  for (const end of week.days.map((d) => d.day)) {
    const span7: number[] = [];
    for (let x = end - (DAYS_PER_WEEK - 1); x <= end; x++) span7.push(x);
    if (!span7.every((x) => all.has(x))) continue;
    const total = span7.reduce((s, x) => s + (all.get(x) ?? 0), 0);
    if (total > weekCap && !reported.has('w')) { reported.add('w'); out.push(finding('college.week_hours', 'hard', 'countable_hours', `At most ${weekCap / mph} countable hours in a week`, pen, 'H1.5.2', 'Verified', null)); }
    const off = span7.filter((x) => (all.get(x) ?? 0) === 0).length;
    if (off < offNeed && !reported.has('o')) { reported.add('o'); out.push(finding('college.day_off', 'hard', 'countable_hours', `${offNeed} day a week with no countable activity`, pen, 'H1.5.2', 'Verified', null)); }
  }
  // Nothing countable after a game on game day (H1.5.2, H8.5.1 rule 4).
  const noAfterGame = flag(r, 'college.no_cara_after_competition');
  if (noAfterGame) {
    const game = allBlocks(week).find((b) => b.type === 'game');
    if (game) {
      const end = blockEnd(game);
      const dayEnd = game.start.day * MINUTES_PER_DAY + MINUTES_PER_DAY;
      for (const b of allBlocks(week)) {
        if (b.id === game.id || b.countable !== true || b.voluntary === true) continue;
        const s = instantValue(b.start);
        if (s >= end && s < dayEnd) out.push(finding('college.after_competition', 'hard', 'countable_hours', 'No countable activity after a game on game day', pen, 'H1.5.2', 'Verified', b.id));
      }
    }
  }
  return out;
}

/** Longest stretch of a day's obligations, split where the players have a long break away (assumption). */
export function longestStretch(blocks: readonly Block[]): number {
  const gap = P('facility_gap_split_minutes');
  const sorted = [...blocks].sort((a, b) => instantValue(a.start) - instantValue(b.start));
  let best = 0, segStart = -1, segEnd = -1;
  for (const b of sorted) {
    const s = instantValue(b.start), e = blockEnd(b);
    if (segStart < 0 || s - segEnd >= gap) { segStart = s; segEnd = e; } else segEnd = Math.max(segEnd, e);
    best = Math.max(best, segEnd - segStart);
  }
  return best;
}

/** Every work-rule finding for a week. Clashes are separate (atoms.ts): they are the only refusal. */
export function checkWeek(week: Week, env: LimitEnv): Finding[] {
  const hard = countsHours(env.rules) ? countableFindings(week, env) : proFindings(week, env);
  return [...hard, ...softFindings(week, env)];
}

/** Stable identity of a finding, for "what did this edit add" comparisons. */
export const findingKey = (f: Finding): string => `${f.ruleId}|${f.blockId ?? ''}|${f.plain}`;
