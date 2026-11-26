// The practice object and its periods (H3.1.1, H3.1.2, H3.1.3), and rep counts per period (H3.2.1 rule 1).
import PERIODS from './data/periods.json' with { type: 'json' };
import { P } from './params.ts';
import type { Drill, Pads, Period, PeriodLeader, PeriodType, Practice, Tempo } from './types.ts';

export const PERIOD_TYPES: readonly PeriodType[] = PERIODS.periodTypes as PeriodType[];
export const DRILLS: readonly Drill[] = PERIODS.drills as Drill[];
const TYPE_BY_ID = new Map(PERIOD_TYPES.map((t) => [t.id, t] as const));
const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d] as const));

export function periodType(id: string): PeriodType {
  const t = TYPE_BY_ID.get(id);
  if (!t) throw new Error(`unknown period type ${id}`);
  return t;
}
export function drill(id: string): Drill {
  const d = DRILL_BY_ID.get(id);
  if (!d) throw new Error(`unknown drill ${id}`);
  return d;
}

/** The palette for a rule set's level (H3.1.2 acceptance: every configured type appears with its profile). */
export function palette(level: string): readonly PeriodType[] {
  return PERIOD_TYPES.filter((t) => t.levels.includes(level));
}

/** Tempo multipliers (H3.1.3 table). `tackling` selects the tackling and ball-security technique row. */
export function tempoMultipliers(tempo: Tempo, tackling = false): { knowledge: number; technique: number; load: number; injury: number } {
  const technique = tempo === 'live' && tackling ? P('live_technique_tackling') : P(`${tempo}_technique`);
  return { knowledge: P(`${tempo}_knowledge`), technique, load: P(`${tempo}_load`), injury: P(`${tempo}_injury`) };
}

/** Transition minutes charged for the practice (H3.1.1 rule 3): before every period after the first that moves field. */
export function transitionMinutes(p: Practice): number {
  return p.periods.reduce((s, per, i) => s + (i > 0 && per.moveField ? P('transition_minutes') : 0), 0);
}

export function plannedMinutes(p: Practice): number {
  return p.periods.reduce((s, per) => s + per.minutes, 0) + transitionMinutes(p);
}

export interface PracticeProblem {
  readonly code: 'over_block' | 'bad_minutes' | 'unknown_type' | 'numbering' | 'too_many_corrections' | 'unknown_drill' | 'level';
  readonly period: number | null;
  readonly plain: string;
}

/**
 * Structural problems the planner refuses (physically impossible plans only): period minutes plus
 * transitions over the block (H3.1.1 acceptance), lengths that are not whole positive minutes, unknown
 * types or drills, or more correction flags than a position coach may give (H3.6.2).
 * Rule breaks (pads, drills, hours) are not here: they are warnings from limits.ts.
 */
export function validatePractice(p: Practice, level: string): PracticeProblem[] {
  const out: PracticeProblem[] = [];
  p.periods.forEach((per, i) => {
    if (per.number !== i + 1) out.push({ code: 'numbering', period: per.number, plain: 'periods are numbered from 1 in order' });
    if (!Number.isInteger(per.minutes) || per.minutes < 1) out.push({ code: 'bad_minutes', period: per.number, plain: 'periods run in whole minutes, at least one' });
    const t = TYPE_BY_ID.get(per.type);
    if (!t) out.push({ code: 'unknown_type', period: per.number, plain: `no period type ${per.type}` });
    else if (!t.levels.includes(level)) out.push({ code: 'level', period: per.number, plain: `${t.id} is not in this rule set's palette` });
    for (const d of per.drills ?? []) if (!DRILL_BY_ID.has(d)) out.push({ code: 'unknown_drill', period: per.number, plain: `no drill ${d}` });
    if ((per.corrections ?? []).length > P('position_coach_corrections')) out.push({ code: 'too_many_corrections', period: per.number, plain: 'too many players flagged for correction' });
  });
  if (plannedMinutes(p) > p.blockMinutes) out.push({ code: 'over_block', period: null, plain: 'periods and transitions run past the end of the practice block' });
  return out;
}

/** Reps a period produces (H3.2.1 rule 1 and acceptance): minutes x rate, rounded down; environment work slows the rate (H3.4.1). */
export function repsInPeriod(per: Period, practice: Pick<Practice, 'environment'>): number {
  const t = periodType(per.type);
  if (t.kind === 'warmup' || t.kind === 'conditioning' || t.kind === 'individual') return 0;
  const base = per.twoMinute ? P('rate_two_minute') : P(`rate_${per.tempo}`);
  const e = practice.environment;
  const options = (e.noise || e.silentCount ? 1 : 0) + (e.wetBall ? 1 : 0);
  const rate = base * (1 - P('environment_rate_slowdown') * options);
  return Math.floor(per.minutes * rate);
}

/** True when the period counts as padded contact work that needs full pads to teach fully (H3.1.3). */
export function padsLimitTechnique(per: Period, pads: Pads): boolean {
  return pads !== 'full' && periodType(per.type).line;
}

export function newPeriod(number: number, type: string, leader: PeriodLeader, over: Partial<Period> = {}): Period {
  return { number, minutes: P('period_default_minutes'), type, tempo: 'thud', groups: ['offense', 'defense'], leader, ...over };
}

/** A saved template keyed by weekday (H3.1.1 rule 5): periods without ids, applied to a block. */
export interface PracticeTemplate {
  readonly name: string;
  readonly weekday: number;
  readonly pads: Pads;
  readonly periods: readonly Period[];
}

export function fromTemplate(t: PracticeTemplate, id: string, blockId: string, blockMinutes: number, day: number, headCoachPresent: boolean): Practice {
  return { id, blockId, blockMinutes, day, pads: t.pads, periods: t.periods, environment: { indoors: false, noise: false, wetBall: false, silentCount: false, badWeather: false }, headCoachPresent };
}

/**
 * Weather or lightning ends the practice early with no indoor facility (H3.1.1 edge case, H3.5.1): periods
 * that had not started by `stopMinute` are lost. Returns the practice cut at that point.
 */
export function cutShort(p: Practice, stopMinute: number): Practice {
  const kept: Period[] = [];
  let t = 0;
  for (let i = 0; i < p.periods.length; i++) {
    const per = p.periods[i]!;
    t += i > 0 && per.moveField ? P('transition_minutes') : 0;
    if (t >= stopMinute) break;
    kept.push(t + per.minutes > stopMinute ? { ...per, minutes: stopMinute - t } : per);
    t += per.minutes;
  }
  return { ...p, periods: kept };
}
