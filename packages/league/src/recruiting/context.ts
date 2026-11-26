// What the recruiting module reads from the rest of the world. Everything outside league (the person
// generator G-17, scouting G-19, staff and relationships in people and career) reaches it through these
// ports, because league may import only schema and rules-data (P1.2.1). The world loop wires them.
import type { PersonOrigin, RandomStream, RuleSet } from '@gm/schema';
import { DAYS_PER_WEEK, WEEKDAY, weekday } from '../calendar/date.ts';
import type { CalendarEngine } from '../calendar/engine.ts';
import type { PositionGroup, ProgramInfo, ProspectSource } from './types.ts';

/** Keyed stream factory (J13). Scope names the draw so results do not depend on call order. */
export type StreamFor = (scope: readonly (string | number)[]) => RandomStream;

/** D13 person generator (G-17), as recruiting needs it: one prospect body and his true quality. */
export interface ProspectFactory {
  create(req: {
    readonly classYear: number;
    readonly source: ProspectSource;
    readonly slot: number;
    readonly position: PositionGroup;
    readonly region: string;
    /** Requested talent percentile in the national class, 0 to 1. */
    readonly percentile: number;
  }): {
    readonly personId: number;
    readonly origin: PersonOrigin;
    readonly heightIn: number;
    readonly weightLb: number;
    /** Overall true quality on the internal skill scale (D6.1). Truth. */
    readonly trueQuality: number;
    /** True forty time, seconds (D2), measured at a camp (T4.3.1). */
    readonly fortyS: number;
  };
}

/** Program facts that change week to week (T2 prestige, depth chart, scheme). */
export interface ProgramFacts {
  program(teamId: number): ProgramInfo;
  /** Opportunity to play early at a position, 0 (stacked room) to 1 (empty room), from the depth chart. */
  opportunity(teamId: number, position: PositionGroup): number;
  /** Scheme fit of a prospect at a program, 0 to 1 (E10, T10). */
  schemeFit(teamId: number, prospectId: number): number;
  /** Players now on the roster who return next season, by position (T5.1.1, T4.8.1). */
  returning(teamId: number, position: PositionGroup): number;
  /** The head coach on a day (S7: a change moves classes). */
  headCoachOn(teamId: number, day: number): number;
  /** Losses in a row now (T4.5.2 multiplier). */
  lossStreak(teamId: number): number;
}

/** Everything a recruiting step needs besides the state. */
export interface RecruitingContext {
  /** The college rule set in force on a day (T4.2.2: the model switch is a change of rule set). */
  rulesOn(day: number): RuleSet;
  readonly calendar: CalendarEngine;
  readonly programs: ProgramFacts;
  /** Stream `recruiting` (J13 scope stream). */
  readonly rng: StreamFor;
}

export function key2(a: number, b: number): string { return `${a}:${b}`; }

export function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }

/** First day (Monday) of the Monday-to-Sunday week holding a day (T4.2.2 "Monday to Sunday"). */
export function weekStartOf(day: number): number {
  return day - ((weekday(day) - WEEKDAY.mon + DAYS_PER_WEEK) % DAYS_PER_WEEK);
}

/** Integer power by repeated multiplication (the exponent operator is banned in core, P1.1.1). */
export function powInt(base: number, n: number): number {
  let out = 1;
  for (let i = 0; i < n; i++) out *= base;
  return out;
}
