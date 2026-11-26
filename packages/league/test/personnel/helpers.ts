import type { RuleSet } from '@gm/schema';
import type { Graded, JobProfile, PersonnelPlayer } from '../../src/personnel/index.ts';
import campPro from './fixtures/camp-pro.json' with { type: 'json' };
import campCollege from './fixtures/camp-college.json' with { type: 'json' };

type FixtureValues = Record<string, [number | boolean | string, string]>;

export function fixtureRuleSet(file: { id: string; values: FixtureValues }, override: Record<string, number | boolean | string> = {}): RuleSet {
  const v = new Map<string, number | boolean | string>(Object.entries(file.values).map(([k, [val]]) => [k, val]));
  for (const [k, val] of Object.entries(override)) v.set(k, val);
  const get = (k: string) => { if (!v.has(k)) throw new Error(`missing ${k}`); return v.get(k)!; };
  return { id: file.id, level: 'pro', seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => [...v.keys()].sort() };
}
export const CAMP_PRO_RS = fixtureRuleSet(campPro as never);
export const CAMP_COLLEGE_RS = fixtureRuleSet(campCollege as never);

export const g = (mean: number, variance = 25): Graded => ({ mean, variance });

/** A small deterministic generator for test draws (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CB_PROFILE: JobProfile = { job: 'CB', weights: { speed: 2, press: 1, ball: 1 }, minimums: { speed: 50 }, familyDefault: false };
export const S_PROFILE: JobProfile = { job: 'S', weights: { speed: 1, range: 2, tackling: 1 }, minimums: {}, familyDefault: false };
export const QB_PROFILE: JobProfile = { job: 'QB', weights: { accuracy: 2, decision: 2, arm: 1 }, minimums: {}, familyDefault: false };

export function player(personId: number, jobs: string[], level: number, over: Partial<PersonnelPlayer> = {}): PersonnelPlayer {
  const attrs = ['speed', 'press', 'ball', 'range', 'tackling', 'accuracy', 'decision', 'arm'];
  return {
    personId, age: 25, jobs, grades: Object.fromEntries(attrs.map((a) => [a, g(level)])), jobKnowledge: Object.fromEntries(jobs.map((j) => [j, 80])),
    contractYearsLeft: 3, eligibilityLeft: null, unavailable: false, realPerson: false, ...over,
  };
}
