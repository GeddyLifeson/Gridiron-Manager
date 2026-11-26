import type { EngagementParams, ParamTable, RandomStream, RuleSet } from '@gm/schema';
import { DMATH } from '../../src/contract.ts';
import { seedFromNumber, stream } from '../../src/streams.ts';
import { CONTEST_MATH, PARAMS, contestParamTable, createContests } from '../../src/contest/index.ts';

export const math = DMATH;
export const contests = createContests(contestParamTable(), DMATH);

/** A contest stream keyed as J13.2.1 says: [game, play, lowerPlayerId, higherPlayerId, contestType]. */
export function contestStream(play: number, type: string, seed = 20261126): RandomStream {
  return stream(seedFromNumber(seed), 'contest', [1, play, 11, 77, type]);
}

/** Runs one engagement until a bound or `maxTicks`. Returns the final A and the tick it ended on. */
export function runEngagement(p: EngagementParams, dz: number, a0: number, maxTicks: number, s: RandomStream): { a: number; ticks: number } {
  let a = a0;
  for (let t = 1; t <= maxTicks; t++) {
    a = CONTEST_MATH.stepEngagement(a, dz, p, s.normal());
    if (a >= 1 || a <= -1) return { a, ticks: t };
  }
  return { a, ticks: maxTicks };
}

/** Share of `trials` for which `fn(trialIndex)` is true. */
export function share(trials: number, fn: (i: number) => boolean): number {
  let k = 0;
  for (let i = 0; i < trials; i++) if (fn(i)) k++;
  return k / trials;
}

/** Four standard errors of a binomial share: the "sampling error" band used for base-rate checks. */
export function band(p: number, trials: number): number {
  return 4 * Math.sqrt((p * (1 - p)) / trials);
}

/** A parameter table that records which rows were read (the orphan check of J6.8.1). */
export function countingTable(): { table: ParamTable; read: Set<string> } {
  const inner = contestParamTable();
  const read = new Set<string>();
  return { read, table: { version: inner.version, has: (n) => inner.has(n), num: (n) => { read.add(n); return inner.num(n); } } };
}

/** FIXTURE rule set: values are placeholders for the test, not rule facts (WP-01 owns the real ones). */
export function fixtureRules(values: Record<string, number | boolean>): RuleSet {
  const get = (k: string) => { if (!(k in values)) throw new Error(`fixture has no ${k}`); return values[k]; };
  return {
    id: 'fixture_0000', level: 'pro', seasonYear: 0,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => String(get(k)), keys: () => Object.keys(values),
  } as RuleSet;
}

export const paramValue = (name: string): number => {
  const row = PARAMS.params.find((p) => p.name === `contest.${name}`);
  if (!row) throw new Error(name);
  return row.value;
};

/** z ladder of Q1.7.3: the internal skill scale 0 to 100 in steps of 5. */
export const Z_LADDER: number[] = Array.from({ length: 21 }, (_, i) => (i * 5 - 50) / 10);
