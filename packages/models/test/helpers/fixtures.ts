// Shared test fixtures: a fixture rule set and synthetic training data drawn from a known model with the
// engine's deterministic streams. Rule values here are fixture values, not facts.
import type { RuleSet } from '@gm/schema';
import { DMATH, stream, seedFromNumber } from '@gm/engine-core';
import { BASELINE_EP_MODEL, loadEpModel, epProbabilities, type EpModel, type EpState, type EpTrainingRow } from '../../src/ep/index.ts';
import { BASELINE_WP_MODEL, loadWpModel, wp, type WpModel, type WpState, type WpTrainingRow } from '../../src/wp/index.ts';

export const MATH = DMATH;

export function fixtureRules(overrides: Record<string, number> = {}, id = 'fixture_2026'): RuleSet {
  const values: Record<string, number> = {
    'score.touchdown': 6, 'score.field_goal': 3, 'score.safety': 2,
    'clock.periods': 4, 'clock.period_length_s': 900, 'clock.play_clock_s': 40, 'series.downs': 4,
    ...overrides,
  };
  const get = (k: string) => { const v = values[k]; if (v === undefined) throw new Error(`fixture: missing ${k}`); return v; };
  return { id, level: 'pro', seasonYear: 2026, num: get, bool: () => { throw new Error('no switches'); }, opt: () => { throw new Error('no options'); }, keys: () => Object.keys(values) };
}

export const baselineEp = (): EpModel => loadEpModel(BASELINE_EP_MODEL);
export const baselineWp = (): WpModel => loadWpModel(BASELINE_WP_MODEL, baselineEp());

export function scrimmage(p: Partial<EpState> = {}): EpState {
  return { kind: 'scrimmage', down: 1, distanceYd: 10, yardsToGoalYd: 75, halfSecondsLeft: 1500, timeoutsOffense: 3, timeoutsDefense: 3, home: false, ...p };
}

export function wpState(p: Partial<WpState> = {}, field: Partial<EpState> = {}): WpState {
  return { field: scrimmage(field), scoreDiff: 0, gameSecondsLeft: 3000, overtime: false, firstHalf: false, receivesSecondHalfKickoff: false, pregameGap: 0, ...p };
}

/** A random but plausible scrimmage or kickoff state. */
function randomEpState(u: () => number, kickoffShare: number): EpState {
  if (u() < kickoffShare) {
    return { kind: 'kickoff', down: 0, distanceYd: 0, yardsToGoalYd: 35, halfSecondsLeft: 1 + Math.floor(u() * 1800), timeoutsOffense: Math.floor(u() * 4), timeoutsDefense: Math.floor(u() * 4), home: u() < 0.5 };
  }
  const yd = 1 + Math.floor(u() * 99);
  const down = 1 + Math.floor(u() * 4);
  const dist = Math.min(yd, down === 1 ? 10 : 1 + Math.floor(u() * 15));
  return { kind: 'scrimmage', down, distanceYd: dist, yardsToGoalYd: yd, halfSecondsLeft: 1 + Math.floor(u() * 1800), timeoutsOffense: Math.floor(u() * 4), timeoutsDefense: Math.floor(u() * 4), home: u() < 0.5 };
}

/** Training rows whose next-score class is drawn from `truth` (the simulated-league stand-in). */
export function syntheticEpRows(truth: EpModel, n: number, seed: number, kickoffShare = 0.08): EpTrainingRow[] {
  const s = stream(seedFromNumber(seed), 'test.ep', []);
  const u = () => s.uniform();
  const rows: EpTrainingRow[] = [];
  for (let i = 0; i < n; i++) {
    const state = randomEpState(u, kickoffShare);
    rows.push({ state, nextScore: s.pick(Array.from(epProbabilities(truth, state, MATH))) });
  }
  return rows;
}

/** Training rows whose result is drawn from `truth` win probability (ties never happen here). */
export function syntheticWpRows(truth: WpModel, n: number, seed: number): WpTrainingRow[] {
  const s = stream(seedFromNumber(seed), 'test.wp', []);
  const u = () => s.uniform();
  const rows: WpTrainingRow[] = [];
  for (let i = 0; i < n; i++) {
    const field = randomEpState(u, 0.05);
    const gameSecondsLeft = 1 + Math.floor(u() * 3600);
    const state: WpState = {
      field: { ...field, halfSecondsLeft: gameSecondsLeft > 1800 ? gameSecondsLeft - 1800 : gameSecondsLeft },
      scoreDiff: Math.round((u() - 0.5) * 34), gameSecondsLeft, overtime: false, firstHalf: gameSecondsLeft > 1800,
      receivesSecondHalfKickoff: u() < 0.5, pregameGap: Math.round((u() - 0.5) * 20 * 2) / 2,
    };
    rows.push({ state, result: s.chance(wp(truth, state, MATH).value) ? 1 : 0 });
  }
  return rows;
}
