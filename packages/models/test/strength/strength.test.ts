// N2.6.1 team strength: rules 1 to 5, edge cases and acceptance on synthetic seasons drawn with the
// engine's deterministic streams. Strengths and noise here are test values, not facts.
import { describe, it, expect } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { MATH } from '../helpers/fixtures.ts';
import { fitStrength, predictMargin, priorWeight, preseasonPrior, PARAMS, type StrengthGame, type StrengthPrior } from '../../src/strength/index.ts';

const rng = (seed: number, name: string) => { const s = stream(seedFromNumber(seed), name, []); return () => s.uniform(); };
const TEAMS = 16;
const ids = Array.from({ length: TEAMS }, (_, i) => i + 1);

function normal(u: () => number): number {
  // Sum of twelve uniforms: an approximate standard normal without transcendental math.
  let s = 0;
  for (let i = 0; i < 12; i++) s += u();
  return s - 6;
}

interface Truth { off: number[]; def: number[] }
function seasonTruth(u: () => number, prev: Truth | null): Truth {
  const off = ids.map((_, i) => (prev ? 0.6 * prev.off[i]! : 0) + normal(u) * 3.5);
  const def = ids.map((_, i) => (prev ? 0.6 * prev.def[i]! : 0) + normal(u) * 3.5);
  return { off, def };
}

/** A season: every week each team plays once, round-robin schedule, home advantage 2, game noise sd 10. */
function playSeason(u: () => number, t: Truth, weeks: number, startId: number): StrengthGame[] {
  const games: StrengthGame[] = [];
  let id = startId;
  for (let w = 0; w < weeks; w++) {
    const order = [...ids];
    const rot = order.slice(1);
    for (let k = 0; k < w % rot.length; k++) rot.push(rot.shift()!);
    const r = [order[0]!, ...rot];
    for (let i = 0; i < TEAMS / 2; i++) {
      const a = r[i]!, b = r[TEAMS - 1 - i]!;
      const home = w % 2 === 0 ? a : b, away = home === a ? b : a;
      const ph = 22 + t.off[home - 1]! - t.def[away - 1]! + 1 + normal(u) * 7;
      const pa = 22 + t.off[away - 1]! - t.def[home - 1]! - 1 + normal(u) * 7;
      games.push({ gameId: id++, week: w + 1, teamIds: [home, away], neutralSite: false, points: [Math.max(0, Math.round(ph)), Math.max(0, Math.round(pa))] });
    }
  }
  return games;
}

describe('N2.6.1 team strength', () => {
  it('rule 2: the prior weight is 1 before week 1, 0.5 after 4 games and under 0.1 after 12', () => {
    expect(priorWeight(0, MATH)).toBe(1);
    expect(priorWeight(4, MATH)).toBeCloseTo(0.5, 12);
    expect(priorWeight(12, MATH)).toBeLessThan(0.1);
  });

  it('edge case: week 1 uses the prior alone, with an error band', () => {
    const priors: StrengthPrior[] = ids.map((teamId) => ({ teamId, offense: teamId - 8, defense: 8 - teamId, specialTeams: 0.5 }));
    const t = fitStrength({ games: [], priors, teamIds: ids, homeAdvantagePrior: 1.75 }, MATH);
    for (const s of t.teams) {
      expect(s.offense).toBeCloseTo(s.teamId - 8, 9);
      expect(s.defense).toBeCloseTo(8 - s.teamId, 9);
      expect(s.se.offense).toBeGreaterThan(0);
      expect(s.priorWeight).toBe(1);
    }
    expect(t.homeAdvantage).toBeCloseTo(1.75, 9);
  });

  it('rule 1: offense, defense and home advantage are recovered from a long schedule; game order does not matter', () => {
    const u = rng(71, 'strength.rule1');
    const truth = seasonTruth(u, null);
    const games = [...playSeason(u, truth, 15, 1), ...playSeason(u, truth, 15, 1000)];
    const inp = { games, priors: [], teamIds: ids, homeAdvantagePrior: 0 };
    const t = fitStrength(inp, MATH);
    const t2 = fitStrength({ ...inp, games: [...games].reverse() }, MATH);
    expect(t2.teams.map((x) => x.total)).toEqual(t.teams.map((x) => x.total));
    const err = t.teams.map((s, i) => Math.abs(s.offense - truth.off[i]!) + Math.abs(s.defense - truth.def[i]!));
    expect(err.reduce((a, b) => a + b, 0) / TEAMS).toBeLessThan(4);
    expect(t.homeAdvantage).toBeGreaterThan(0.5);
    expect(t.homeAdvantage).toBeLessThan(3.5);
    // a team's estimate lists the games behind it
    expect(t.teams[0]!.gameIds.length).toBe(30);
  });

  it('rule 3 and acceptance 2: a quarterback change shifts the offense term the same week', () => {
    const u = rng(3, 'strength.qb');
    const games = playSeason(u, seasonTruth(u, null), 6, 1);
    const base = fitStrength({ games, priors: [], teamIds: ids, homeAdvantagePrior: 2 }, MATH);
    const hurt = fitStrength({ games, priors: [], teamIds: ids, homeAdvantagePrior: 2, qbChanges: [{ teamId: 5, estimateDelta: -20 }] }, MATH);
    const per = PARAMS.params.find((p) => p.name === 'models.strength.qb.pointsPerEstimate')!.value;
    expect(hurt.teams[4]!.offense - base.teams[4]!.offense).toBeCloseTo(-20 * per, 9);
    expect(hurt.teams[3]!.offense).toBe(base.teams[3]!.offense);
    expect(preseasonPrior(9, null, { qbEstimateDelta: 8 }).offense).toBeCloseTo(8 * per, 12);
  });

  it('edge case: a rested-starters game counts a quarter as much', () => {
    const u = rng(9, 'strength.rest');
    const games = playSeason(u, seasonTruth(u, null), 4, 1);
    const rested = games.map((g, i) => (i === 0 ? { ...g, restedStarters: [true, false] as const, points: [0, 60] as const } : g));
    const blowout = games.map((g, i) => (i === 0 ? { ...g, points: [0, 60] as const } : g));
    const a = fitStrength({ games: rested, priors: [], teamIds: ids, homeAdvantagePrior: 2 }, MATH).teams.find((x) => x.teamId === games[0]!.teamIds[1])!;
    const b = fitStrength({ games: blowout, priors: [], teamIds: ids, homeAdvantagePrior: 2 }, MATH).teams.find((x) => x.teamId === games[0]!.teamIds[1])!;
    expect(a.offense).toBeLessThan(b.offense);
    expect(a.games).toBeCloseTo(3.25, 12);
  });

  it('acceptance 1: predicted margins have mean error near zero and beat a last-season record baseline', () => {
    const u = rng(2026, 'strength.acceptance');
    let truth = seasonTruth(u, null);
    let lastTable = fitStrength({ games: playSeason(u, truth, 15, 1), priors: [], teamIds: ids, homeAdvantagePrior: 2 }, MATH);
    let lastWins = new Map<number, number>();
    let errSum = 0, n = 0, maeModel = 0, maeBase = 0;
    for (let season = 0; season < 40; season++) {
      truth = seasonTruth(u, truth);
      const games = playSeason(u, truth, 15, 1);
      const priors = lastTable.teams.map((s) => preseasonPrior(s.teamId, s));
      const wins = new Map<number, number>(ids.map((i) => [i, 0]));
      for (let w = 1; w <= 15; w++) {
        const before = games.filter((g) => g.week < w);
        const table = fitStrength({ games: before, priors, teamIds: ids, homeAdvantagePrior: 2 }, MATH);
        for (const g of games.filter((x) => x.week === w)) {
          const p = predictMargin(table, g.teamIds[0], g.teamIds[1], 'a_home', MATH);
          const actual = g.points[0] - g.points[1];
          errSum += actual - p.margin; n++;
          maeModel += Math.abs(actual - p.margin);
          // baseline: last season's win difference, scaled to points (one win about 2 points over 15 games)
          const wd = (lastWins.get(g.teamIds[0]) ?? 7.5) - (lastWins.get(g.teamIds[1]) ?? 7.5);
          maeBase += Math.abs(actual - wd * 2);
          if (actual > 0) wins.set(g.teamIds[0], wins.get(g.teamIds[0])! + 1);
          else if (actual < 0) wins.set(g.teamIds[1], wins.get(g.teamIds[1])! + 1);
        }
      }
      lastTable = fitStrength({ games, priors, teamIds: ids, homeAdvantagePrior: 2 }, MATH);
      lastWins = wins;
    }
    expect(Math.abs(errSum / n)).toBeLessThan(0.5);
    expect(maeModel).toBeLessThan(maeBase);
  });

  it('a matchup prediction carries an error band and flips sign with the teams', () => {
    const u = rng(5, 'strength.matchup');
    const t = fitStrength({ games: playSeason(u, seasonTruth(u, null), 8, 1), priors: [], teamIds: ids, homeAdvantagePrior: 2 }, MATH);
    const ab = predictMargin(t, 1, 2, 'neutral', MATH), ba = predictMargin(t, 2, 1, 'neutral', MATH);
    expect(ab.margin).toBeCloseTo(-ba.margin, 9);
    expect(ab.se).toBeGreaterThan(0);
    expect(ab.gameSd).toBeGreaterThan(ab.se);
    expect(predictMargin(t, 1, 2, 'a_home', MATH).margin - ab.margin).toBeCloseTo(t.homeAdvantage, 9);
  });
});
