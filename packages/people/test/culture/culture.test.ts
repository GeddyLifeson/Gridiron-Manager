import { describe, expect, it } from 'vitest';
import { CultureRecord, ParamFile } from '@gm/schema';
import {
  PARAMS, CULTURE_READERS, blendWeights, conductReading, crisisShock, driftStep, generateCulture, impliedPatience, interimStrength, labelWeight,
  newCoachStrength, nextExpectation, seasonEndDrift, stepStrength, strengthTarget, toCultureRecord, unreadFields,
  type Culture, type Expectation, type ExpectationInput, type SeasonBehaviour, type SeasonResult,
} from '../../src/culture/index.ts';
import { lcg } from '../needs/helpers.ts';

const gen = (seed: number, over: Partial<Parameters<typeof generateCulture>[0]> = {}): Culture => generateCulture({
  teamId: 1, level: 'pro', resources: 'mid', violationClasses: ['late', 'missed_meeting', 'fight'], labels: ['hard_on_veterans', 'players_coach'],
  firstYear: 2030, games: 17, draw: lcg(seed), ...over,
});
const quiet: SeasonBehaviour = { discipline: [], personnel: [], coachDecisions: [], ownerOrAdChanged: false, headCoachChanged: false, interimSeason: false };

describe('record and generation (X9.1.1, X9.5.1)', () => {
  it('parameter file validates; the record stores in the G-00 CultureRecord shape', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(() => CultureRecord.parse(toCultureRecord(gen(1)))).not.toThrow();
  });

  it('same seed, same record; fields inside their ranges; tradition 0 for a new team', () => {
    expect(JSON.stringify(gen(9))).toBe(JSON.stringify(gen(9)));
    expect(JSON.stringify(gen(9))).not.toBe(JSON.stringify(gen(10)));
    for (let s = 0; s < 200; s++) {
      const c = gen(s, { resources: (['low', 'mid', 'high'] as const)[s % 3], level: s % 2 ? 'college' : 'pro' });
      expect(c.patience).toBeGreaterThanOrEqual(1);
      expect(c.patience).toBeLessThanOrEqual(6);
      for (const v of Object.values(c.conductTolerance)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
      for (const v of Object.values(c.labelPreferences)) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
      expect(c.traditionStrength).toBe(0);
    }
  });

  it('two owners with opposite preference for one label rank a coach holding it differently, traceably', () => {
    const c = gen(3);
    c.labelPreferences['hard_on_veterans'] = 0;
    const a = labelWeight(c, 'hard_on_veterans', 'owner', 1);
    const b = labelWeight(c, 'hard_on_veterans', 'owner', -1);
    expect(a).toBeCloseTo(0.6);
    expect(b).toBeCloseTo(-0.6);
  });

  it('the blend reverses for an athletic director at a program with tradition above 70', () => {
    expect(blendWeights('owner', 90)).toEqual({ person: 0.6, team: 0.4 });
    expect(blendWeights('athletic_director', 70)).toEqual({ person: 0.6, team: 0.4 });
    const ad = blendWeights('athletic_director', 71);
    expect(ad.person).toBeCloseTo(0.4);
    expect(ad.team).toBeCloseTo(0.6);
  });
});

describe('readers (X9.4.1)', () => {
  it('every field has a reader; removing the last reader of a field fails', () => {
    expect(unreadFields()).toEqual([]);
    expect(unreadFields({ ...CULTURE_READERS, patience: [] })).toEqual(['patience']);
  });
  it('an action more than 30 points from the expected tolerance reads as harsher or softer', () => {
    const c = gen(2);
    c.conductTolerance['late'] = 50;
    expect(conductReading(c, 'late', 10)).toBe('harsher');
    expect(conductReading(c, 'late', 81)).toBe('softer');
    expect(conductReading(c, 'late', 70)).toBe('in_line');
  });
});

describe('expectations (X9.2.1)', () => {
  const input = (history: SeasonResult[], previous: Expectation | null, projection = 0.5): ExpectationInput => ({
    history, projection, previous, goals: { cut: 'make_playoffs', top: 'win_division' }, postseasonCutRate: 0.6, topFifthRate: 0.7, games: 17, year: 2030 + history.length,
  });
  const season = (y: number, r: number, title = false): SeasonResult => ({ year: y, winRate: r, wonTitle: title });

  it('three over-target seasons raise the target each year; one bad season after lowers it less than one good season raised it', () => {
    const hist: SeasonResult[] = Array.from({ length: 10 }, (_, i) => season(2020 + i, 0.5));
    let prev = nextExpectation(input(hist, null));
    const centres = [(prev.rateLow + prev.rateHigh) / 2];
    for (let y = 0; y < 3; y++) {
      hist.push(season(2030 + y, 0.85));
      prev = nextExpectation(input(hist, prev));
      centres.push((prev.rateLow + prev.rateHigh) / 2);
    }
    expect(centres[1]!).toBeGreaterThan(centres[0]!);
    expect(centres[2]!).toBeGreaterThan(centres[1]!);
    expect(centres[3]!).toBeGreaterThan(centres[2]!);
    // Symmetric test: from the same start, one good season (+d) against one bad season (-d).
    const start = Array.from({ length: 10 }, (_, i) => season(2020 + i, 0.5));
    const p0 = nextExpectation(input(start, null));
    const c0 = (p0.rateLow + p0.rateHigh) / 2;
    const up = nextExpectation(input([...start, season(2030, 0.8)], p0));
    const down = nextExpectation(input([...start, season(2030, 0.2)], p0));
    expect((up.rateLow + up.rateHigh) / 2 - c0).toBeGreaterThan(c0 - (down.rateLow + down.rateHigh) / 2);
  });

  it('the band is 0.125 wide, rounded to whole wins, with a postseason goal from where the centre sits', () => {
    const e = nextExpectation(input(Array.from({ length: 10 }, (_, i) => season(2020 + i, 0.75)), null, 0.75));
    expect(e.rateHigh - e.rateLow).toBeCloseTo(0.125);
    expect(e.winsLow).toBe(Math.round(e.rateLow * 17));
    expect(e.postseasonTarget).toBe('win_division');
    expect(nextExpectation(input([season(2029, 0.62)], null, 0.62)).postseasonTarget).toBe('make_playoffs');
    expect(nextExpectation(input([season(2029, 0.3)], null, 0.3)).postseasonTarget).toBe('none');
  });

  it('after a title the target is to win it again and the band cannot pass the title season', () => {
    const hist = [...Array.from({ length: 9 }, (_, i) => season(2020 + i, 0.8)), season(2029, 0.82, true)];
    const prev: Expectation = { year: 2029, rateLow: 0.5, rateHigh: 0.625, winsLow: 9, winsHigh: 11, postseasonTarget: 'make_playoffs', ratchet: 0 };
    const e = nextExpectation(input(hist, prev, 0.85));
    expect(e.postseasonTarget).toBe('win_it_again');
    expect((e.rateLow + e.rateHigh) / 2).toBeLessThanOrEqual(0.82 + 1e-9);
  });
});

describe('drift (X9.3.1)', () => {
  const strict: SeasonBehaviour = { ...quiet, discipline: [{ violationClass: 'late', lightOrNone: false }, { violationClass: 'late', lightOrNone: false }, { violationClass: 'fight', lightOrNone: false }] };

  it('a coach who suspends for every violation for 8 seasons lowers tolerance measurably; one season does not', () => {
    // "Measurably" is stated in advance as at least 10 points on the 0 to 100 scale (Assumption for the test).
    const one = gen(4); one.conductTolerance['late'] = 50;
    seasonEndDrift(one, strict);
    expect(50 - one.conductTolerance['late']!).toBeLessThan(10);
    const eight = gen(4); eight.conductTolerance['late'] = 50;
    for (let s = 0; s < 8; s++) seasonEndDrift(eight, strict);
    expect(50 - eight.conductTolerance['late']!).toBeGreaterThanOrEqual(10);
  });

  it('a culture at tradition 100 moves no faster than a fifth of one at 0', () => {
    const a = gen(5); a.traditionStrength = 0; a.conductTolerance['late'] = 80;
    const b = gen(5); b.traditionStrength = 100; b.conductTolerance['late'] = 80;
    seasonEndDrift(a, strict); seasonEndDrift(b, strict);
    expect(80 - b.conductTolerance['late']!).toBeLessThanOrEqual((80 - a.conductTolerance['late']!) / 5 + 1e-9);
  });

  it('no field moves more than 5 percent of its range in a season', () => {
    const r = lcg(77);
    for (let i = 0; i < 2000; i++) {
      const range = [100, 5, 2][i % 3]!;
      const step = driftStep(r() * range, r() * range, Math.floor(r() * 101), range);
      expect(Math.abs(step)).toBeLessThanOrEqual(0.05 * range + 1e-12);
    }
  });

  it('firing in season n implies patience n; preferences follow the people hired, kept and fired', () => {
    expect(impliedPatience([{ call: 'fired', seasonInJob: 2, missedTarget: true }], 4)).toBe(2);
    expect(impliedPatience([{ call: 'kept', seasonInJob: 1, missedTarget: false }], 4)).toBeNull();
    const c = gen(6); c.patience = 4; c.labelPreferences['players_coach'] = 0;
    seasonEndDrift(c, { ...quiet, coachDecisions: [{ call: 'fired', seasonInJob: 1, missedTarget: true }], personnel: [{ personId: 9, labels: ['players_coach'], call: 'fired' }] });
    expect(c.patience).toBeLessThan(4);
    expect(c.labelPreferences['players_coach']).toBeLessThan(0);
  });

  it('tradition: +1 for a stable season, -10 for an owner change, -3 for a head coach change; an interim season moves no field', () => {
    const c = gen(7); c.traditionStrength = 50;
    seasonEndDrift(c, quiet); expect(c.traditionStrength).toBe(51);
    seasonEndDrift(c, { ...quiet, ownerOrAdChanged: true }); expect(c.traditionStrength).toBe(41);
    seasonEndDrift(c, { ...quiet, headCoachChanged: true }); expect(c.traditionStrength).toBe(38);
    const before = c.conductTolerance['late'];
    const r = seasonEndDrift(c, { ...strict, interimSeason: true, headCoachChanged: true });
    expect(c.conductTolerance['late']).toBe(before);
    expect(r.moved).toEqual([]);
    expect(c.traditionStrength).toBe(35);
  });

  it('drifted records still store in the G-00 shape', () => {
    const c = gen(8);
    for (let s = 0; s < 30; s++) seasonEndDrift(c, strict);
    expect(() => CultureRecord.parse(toCultureRecord(c))).not.toThrow();
  });
});

describe('culture strength (L2.4.1)', () => {
  const inputs = { weightedBuyIn: 70, consistency: 60, meanCohesion: 50, continuityShare: 0.8, coachSeasons: 2 };
  it('target follows the starting weights; tenure caps at 4 seasons', () => {
    expect(strengthTarget(inputs)).toBeCloseTo(0.35 * 70 + 0.3 * 60 + 0.15 * 50 + 0.1 * 80 + 0.1 * 50);
    expect(strengthTarget({ ...inputs, coachSeasons: 9 })).toBe(strengthTarget({ ...inputs, coachSeasons: 4 }));
  });
  it('cannot move more than 8 points in a week outside a logged crisis', () => {
    const r = lcg(12);
    for (let i = 0; i < 2000; i++) {
      const cur = r() * 100;
      const next = stepStrength(cur, { weightedBuyIn: r() * 100, consistency: r() * 100, meanCohesion: r() * 100, continuityShare: r(), coachSeasons: Math.floor(r() * 10) });
      expect(Math.abs(next - cur)).toBeLessThanOrEqual(8 + 1e-9);
    }
    expect(() => crisisShock(50, -20, 0)).toThrow(/crisis/);
    expect(crisisShock(50, -20, 812)).toBe(30);
  });
  it('a new head coach starts at 40 or 0.6 of the old value, whichever is lower; an interim keeps 0.8', () => {
    expect(newCoachStrength(90)).toBe(40);
    expect(newCoachStrength(50)).toBeCloseTo(30);
    expect(interimStrength(50)).toBeCloseTo(40);
  });
});
