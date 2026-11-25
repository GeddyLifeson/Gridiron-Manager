// Golden-seed set (Q1.3.1) for the phase 0 gate (R1.2.1). Pure and browser-safe: the headless runner,
// the browser build and the desktop shell all run this same module and compare hashes byte for byte.
// Starting set per Q1.3.1: 200 single plays, 20 full games and one season per rule set, plus the
// J13.3.1 math file (100,000 inputs per function) and raw stream output.
import {
  stream, seedFromNumber, canonicalBytes, bytesHash, stateHash,
  dSin, dCos, dExp, dLog, dAtan2, dPow, dSqrt, logistic,
} from '@gm/engine-core';
import type { RuleSet } from '@gm/engine-core';
import { newGame, stepPlay, playGame, ENGINE_VERSION, DUMMY_PARAMETER_SET, type GameRecord } from './dummy-game.ts';
import { dummyTeams, roundRobin, playFixture, summariseSeason, type Fixture } from './season.ts';

/** Rule sets come from the caller (rules-data), since engine-game does not import rules-data (P1.2.1). */
export interface GoldenInputs {
  resolveRuleSet(id: string): RuleSet;
  /** Hash of the content the run used: rule-set files and parameter set. */
  ruleSetFilesHash: string;
}

export const GOLDEN_RULE_SETS = ['pro_2026', 'college_2026'] as const;
export const GOLDEN_SEASON_YEAR = 2026;
export const GOLDEN_SEASON_TEAMS = 8;

export interface GoldenReport {
  engineVersion: string;
  parameterSetVersion: string;
  contentHash: string;
  results: Record<string, string>;
  counts: Record<string, number>;
  digest: string;
}

function hashFloats(values: Float64Array): string {
  return bytesHash(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
}

export function mathResults(n = 100_000): Record<string, string> {
  const s = stream(seedFromNumber(20261125), 'golden-math', []);
  const xs = new Float64Array(n), ys = new Float64Array(n), ps = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = (s.uniform() - 0.5) * 2000; ys[i] = (s.uniform() - 0.5) * 60; ps[i] = s.uniform() * 1e6 + 1e-9; }
  const out: Record<string, string> = {};
  const run = (name: string, f: (i: number) => number) => {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = f(i);
    out[`math.${name}`] = hashFloats(v);
  };
  run('dSin', (i) => dSin(xs[i]!));
  run('dCos', (i) => dCos(xs[i]!));
  run('dExp', (i) => dExp(ys[i]! * 10));
  run('dLog', (i) => dLog(ps[i]!));
  run('dAtan2', (i) => dAtan2(xs[i]!, ys[i]!));
  run('dPow', (i) => dPow(ps[i]! / 1e5 + 0.01, ys[i]! / 6));
  run('dSqrt', (i) => dSqrt(ps[i]!));
  run('logistic', (i) => logistic(ys[i]!));
  return out;
}

export function streamResults(n = 100_000): Record<string, string> {
  const s = stream(seedFromNumber(1), 'golden-stream', [7, 'x']);
  const u32 = new Uint32Array(n);
  for (let i = 0; i < n; i++) u32[i] = s.nextU32();
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = i % 2 ? s.uniform() : s.normal();
  return { 'stream.u32': bytesHash(new Uint8Array(u32.buffer)), 'stream.uniformNormal': hashFloats(f) };
}

export function singlePlayResults(inp: GoldenInputs, ruleSetId: string, n = 200): { hash: string; count: number } {
  const rules = inp.resolveRuleSet(ruleSetId);
  const hashes: string[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seedFromNumber(1000 + i);
    const [a, b] = dummyTeams(seed, 2);
    let s = newGame(9000 + i, a!, b!, rules, seed);
    // Advance to a scrimmage down (past the opening kickoff), then take one golden snap.
    s = stepPlay(s, rules, seed).state;
    hashes.push(stepPlay(s, rules, seed).row.stateHash);
  }
  return { hash: stateHash(hashes), count: n };
}

export function gameResults(inp: GoldenInputs, ruleSetId: string, n = 20): { hash: string; plays: number } {
  const rules = inp.resolveRuleSet(ruleSetId);
  const heads: string[] = [];
  let plays = 0;
  for (let i = 1; i <= n; i++) {
    const seed = seedFromNumber(i);
    const [a, b] = dummyTeams(seed, 2);
    const g = playGame(i, a!, b!, rules, seed);
    heads.push(g.chainHead);
    plays += g.plays.length;
  }
  return { hash: stateHash(heads), plays };
}

export function seasonFixtures(): Fixture[] {
  return roundRobin(Array.from({ length: GOLDEN_SEASON_TEAMS }, (_, i) => i + 1));
}

export function seasonGame(inp: GoldenInputs, ruleSetId: string, f: Fixture): GameRecord {
  const seed = seedFromNumber(424242);
  return playFixture(seed, GOLDEN_SEASON_YEAR, f, dummyTeams(seed, GOLDEN_SEASON_TEAMS), inp.resolveRuleSet(ruleSetId));
}

export function seasonResult(inp: GoldenInputs, ruleSetId: string, order?: readonly number[]): { hash: string; plays: number } {
  const fixtures = seasonFixtures();
  const run = order ? order.map((i) => fixtures[i]!) : fixtures;
  const records = run.map((f) => seasonGame(inp, ruleSetId, f));
  const sum = summariseSeason(ruleSetId, fixtures, records);
  return { hash: sum.seasonHash, plays: sum.plays };
}

export function contentHash(inp: GoldenInputs): string {
  return stateHash({ ruleSets: inp.ruleSetFilesHash, parameterSet: DUMMY_PARAMETER_SET });
}

export function runGolden(inp: GoldenInputs, progress?: (step: string) => void): GoldenReport {
  const results: Record<string, string> = {};
  const counts: Record<string, number> = {};
  progress?.('math');
  Object.assign(results, mathResults());
  progress?.('streams');
  Object.assign(results, streamResults());
  for (const id of GOLDEN_RULE_SETS) {
    progress?.(`${id} plays`);
    const p = singlePlayResults(inp, id);
    results[`${id}.plays`] = p.hash; counts[`${id}.plays`] = p.count;
    progress?.(`${id} games`);
    const g = gameResults(inp, id);
    results[`${id}.games`] = g.hash; counts[`${id}.gamePlays`] = g.plays;
    progress?.(`${id} season`);
    const s = seasonResult(inp, id);
    results[`${id}.season`] = s.hash; counts[`${id}.seasonPlays`] = s.plays;
  }
  const report = { engineVersion: ENGINE_VERSION, parameterSetVersion: DUMMY_PARAMETER_SET, contentHash: contentHash(inp), results, counts };
  return { ...report, digest: bytesHash(canonicalBytes(report)) };
}

export interface GoldenComparison { ok: boolean; mismatches: string[] }

export function compareGolden(actual: GoldenReport, expected: GoldenReport): GoldenComparison {
  const mismatches: string[] = [];
  for (const k of ['engineVersion', 'parameterSetVersion', 'contentHash'] as const) {
    if (actual[k] !== expected[k]) mismatches.push(`${k}: got ${actual[k]}, golden ${expected[k]}`);
  }
  const keys = new Set([...Object.keys(actual.results), ...Object.keys(expected.results)]);
  for (const k of [...keys].sort()) {
    if (actual.results[k] !== expected.results[k]) mismatches.push(`${k}: got ${actual.results[k]}, golden ${expected.results[k]}`);
  }
  return { ok: mismatches.length === 0, mismatches };
}
