// WP-17 acceptance tests (plans/engine-build-plan.md: J12 acceptance cases; neutral input gives
// NEUTRAL_ENVIRONMENT). Each J12 criterion this module can answer alone is a named test; criteria that need
// the ball, kinematics, fatigue or a full league run are listed in the PR body.
import { describe, expect, it } from 'vitest';
import { Contract, DMATH } from '@gm/engine-core';
import {
  CALM, HEAT_INDEX_SOURCES, ISA_SOURCES, PARAMS, RULE_KEYS, SECOND_HALF_PERIOD, WIND_BIN_SHARE, airDensityRatio,
  deriveMultipliers, environmentForPeriod, environmentTimeline, environmentUpdated, footingLimits, footingOf, footingStream,
  forecastFor, forecastSeries, gripOf, heatIndexF, heatIndexOf, isaDensityRatio, kickDistanceOf, neutralInput, nextCondition,
  noiseForPlay, oneScoreMargin, slipChancePerCut, slipOnCut, sourceStatus, teamGrip, teamWet, wetIndex, windBin, windForPlay,
  YD_PER_S_PER_MPH, type Precip,
} from '../../src/environment/index.ts';
import { COLLEGE, P, PRO, deps, game, mean, sd, venue } from './fixtures.ts';

const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const env = (o: Partial<Contract.Environment> = {}): Contract.Environment => ({ ...Contract.NEUTRAL_ENVIRONMENT, ...o });

describe('module files', () => {
  it('parameters parse, are unique, and sit inside their ranges', () => {
    Contract.ParamFile.parse(PARAMS);
    const names = PARAMS.params.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of PARAMS.params) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
  });
  it('every rule key it reads exists in both real rule sets', () => {
    for (const k of RULE_KEYS) for (const rs of [PRO, COLLEGE]) expect(rs.keys()).toContain(k.key);
  });
  it('physical constant groups compute their status from their sources', () => {
    expect(sourceStatus(ISA_SOURCES)).toBe('Verified');
    expect(sourceStatus(HEAT_INDEX_SOURCES)).toBe('Verified');
    expect(sourceStatus({ id: 'x', what: 'x', sources: [ISA_SOURCES.sources[0]!] })).toBe('1 of 3');
  });
});

describe('J12.1.1 environment snapshot', () => {
  it('neutral input gives NEUTRAL_ENVIRONMENT in every period', () => {
    for (const pe of environmentTimeline(neutralInput(), deps(), 6)) expect(pe.environment).toEqual(Contract.NEUTRAL_ENVIRONMENT);
  });

  it('acceptance 1: every snapshot is valid; indoor games show zero wind and dry conditions in 100% of cases', () => {
    for (const seed of SEEDS(150)) {
      const d = deps(seed);
      const dome = environmentTimeline(game({ venue: venue({ roofKind: 'fixed_dome' }), month: 1 }), d, 5);
      const closed = environmentTimeline(game({ venue: venue({ roofKind: 'retractable' }), roofCall: 'closed', month: 1 }), d, 5);
      for (const pe of [...dome, ...closed]) {
        Contract.Environment.parse(pe.environment);
        expect(pe.environment).toMatchObject({ windMph: 0, gustMph: 0, precip: 'none', surfaceCondition: 'dry', tempF: 70 });
        expect(pe.environment.derived.footing).toBe(1);
        expect(pe.environment.derived.grip).toBe(1);
      }
      for (const pe of environmentTimeline(game(), d, 5)) Contract.Environment.parse(pe.environment);
    }
  });

  it('acceptance 2: a retractable roof never changes before halftime and changes only from closed to open', () => {
    for (const seed of SEEDS(40)) {
      const d = deps(seed);
      const base = { venue: venue({ roofKind: 'retractable' as const }) };
      const opens = environmentTimeline(game({ ...base, roofCall: 'closed', halftimeOpen: true }), d, 5).map((x) => x.roofClosed);
      expect(opens).toEqual([true, true, true, false, false, false]);
      expect(SECOND_HALF_PERIOD).toBe(3);
      const barred = environmentTimeline(game({ ...base, roofCall: 'closed', halftimeOpen: true, halftimeOpenAllowed: false }), d, 5);
      expect(barred.every((x) => x.roofClosed)).toBe(true);
      const open = environmentTimeline(game({ ...base, roofCall: 'open' }), d, 5);
      expect(open.every((x) => !x.roofClosed && x.environment.roof === 'open')).toBe(true);
      const dflt = environmentTimeline(game(base), d, 5).map((x) => x.roofClosed);
      expect(new Set(dflt.slice(0, SECOND_HALF_PERIOD)).size).toBe(1);
    }
  });

  it('a roof opened at halftime starts the second half on a dry field', () => {
    for (const seed of SEEDS(60)) {
      const t = environmentTimeline(game({ venue: venue({ roofKind: 'retractable' }), roofCall: 'closed', halftimeOpen: true }), deps(seed), 3);
      const third = t[3]!.environment;
      expect(t[2]!.environment.surfaceCondition).toBe('dry');
      if (third.precip === 'none') expect(third.surfaceCondition).toBe('dry');
      expect(['soft', 'frozen']).not.toContain(third.surfaceCondition);
    }
  });

  it('acceptance 3: derived multipliers are a pure function of the snapshot fields', () => {
    for (const seed of SEEDS(60)) {
      for (const pe of environmentTimeline(game({ month: 1 + (seed % 12) }), deps(seed), 5)) {
        const { derived, ...fields } = pe.environment;
        expect(deriveMultipliers(fields, 'natural', P, DMATH)).toEqual(derived);
        expect(deriveMultipliers({ ...fields }, 'natural', P, DMATH)).toEqual(derived);
      }
    }
  });

  it('the period snapshot is installed by a valid environment_updated event', () => {
    const pe = environmentForPeriod(game(), deps(), 2);
    const e = Contract.GameEvent.parse(environmentUpdated(pe));
    expect(e).toEqual({ type: 'environment_updated', environment: pe.environment });
  });
});

describe('J12.2 weather generation', () => {
  it('J12.2.2 acceptance: changes occur only at period boundaries and are reproducible from the seed', () => {
    const a = environmentTimeline(game(), deps(5), 6);
    const b = environmentTimeline(game(), deps(5), 6);
    expect(a).toEqual(b);
    for (let q = 0; q <= 6; q++) expect(environmentForPeriod(game(), deps(5), q)).toEqual(a[q]);
    expect(a[0]!.environment).toEqual(a[1]!.environment);
    const c = environmentTimeline(game(), deps(6), 6);
    expect(c[1]!.environment.tempF).not.toBe(a[1]!.environment.tempF);
    const otherGame = environmentTimeline(game({ gameId: 'g2' }), deps(5), 1);
    expect(otherGame[1]!.environment.tempF).not.toBe(a[1]!.environment.tempF);
  });

  it('J12.2.1 acceptance: game-day temperature matches the venue normal and the wind bins match the measured shares', () => {
    const temps: number[] = [];
    const bins = { under10: 0, from10to15: 0, over15: 0 };
    const n = 3000;
    for (const seed of SEEDS(n)) {
      const pe = environmentForPeriod(game({ gameId: seed }), deps(1), 1);
      temps.push(pe.outdoor.tempF);
      bins[windBin(pe.outdoor.windMph)]++;
    }
    // Green Bay December normal 24.5 F (NOAA), plus the diurnal offset at 13:00.
    const expected = 24.5 + P.num('environment.weather.diurnalHalfRangeF') * Math.cos((2 * Math.PI * (13 - 15)) / 24);
    expect(Math.abs(mean(temps) - expected)).toBeLessThan(0.6);
    expect(Math.abs(sd(temps) - P.num('environment.weather.tempSdF'))).toBeLessThan(0.5);
    for (const k of ['under10', 'from10to15', 'over15'] as const) expect(Math.abs(bins[k] / n - WIND_BIN_SHARE.value[k]!)).toBeLessThan(0.025);
  });

  it('climate follows the calendar: Green Bay is colder in January than in September', () => {
    const at = (month: number) => mean(SEEDS(800).map((s) => environmentForPeriod(game({ gameId: s, month }), deps(2), 1).outdoor.tempF));
    expect(at(1)).toBeLessThan(at(9) - 30);
  });

  it('snow falls only where the place has a snowfall normal and it is cold; places without normals are flagged provisional', () => {
    let snow = 0;
    let rain = 0;
    for (const seed of SEEDS(3000)) {
      const p1 = environmentForPeriod(game({ gameId: seed, month: 1 }), deps(3), 1);
      if (p1.outdoor.precip === 'snow' || p1.outdoor.precip === 'heavy_snow') { snow++; expect(p1.outdoor.tempF).toBeLessThanOrEqual(34); }
      const sep = environmentForPeriod(game({ gameId: seed, month: 7 }), deps(3), 1);
      if (sep.outdoor.precip !== 'none') { rain++; expect(['light_rain', 'rain', 'heavy_rain']).toContain(sep.outdoor.precip); }
    }
    expect(snow).toBeGreaterThan(0);
    expect(rain).toBeGreaterThan(0);
    const prov = environmentTimeline(game({ venue: venue({ climate: null }), month: 1 }), deps(), 5);
    expect(prov.every((x) => x.climateStatus === 'provisional')).toBe(true);
    expect(prov.every((x) => x.outdoor.precip !== 'snow' && x.outdoor.precip !== 'heavy_snow')).toBe(true);
    expect(environmentForPeriod(game(), deps(), 1).climateStatus).toBe('normals');
  });

  it('night games cool through the game and are dark; afternoon kickoffs are in daylight', () => {
    const drops: number[] = [];
    for (const seed of SEEDS(400)) {
      const t = environmentTimeline(game({ gameId: seed, month: 10, kickoffLocalHour: 20.25 }), deps(4), 4);
      drops.push(t[1]!.outdoor.tempF - t[4]!.outdoor.tempF);
      expect(t[1]!.environment.daylight).toBe(false);
    }
    expect(mean(drops)).toBeGreaterThan(1);
    expect(environmentForPeriod(game({ kickoffLocalHour: 13 }), deps(), 1).environment.daylight).toBe(true);
  });

  it('wind changes by a small walk at each period and the field-frame direction follows the stadium axis', () => {
    const steps: number[] = [];
    for (const seed of SEEDS(400)) {
      const t = environmentTimeline(game({ gameId: seed }), deps(8), 4);
      for (let q = 2; q <= 4; q++) if (t[q - 1]!.outdoor.windMph > 6) steps.push(t[q]!.outdoor.windMph - t[q - 1]!.outdoor.windMph);
    }
    expect(Math.abs(sd(steps) - P.num('environment.change.windStepSdMph'))).toBeLessThan(0.3);
    const a = environmentForPeriod(game({ venue: venue({ fieldAxisBearingDeg: 90 }) }), deps(), 1);
    const b = environmentForPeriod(game({ venue: venue({ fieldAxisBearingDeg: 0 }) }), deps(), 1);
    const diff = (((a.environment.windDirDeg - b.environment.windDirDeg) % 360) + 360) % 360;
    expect(Math.abs(diff - 90)).toBeLessThan(1.0001);
  });

  it('J12.2.1 acceptance: the forecast error shrinks toward game day and the forecast never moves the game weather', () => {
    const errT = new Array<number>(8).fill(0);
    const errP = new Array<number>(8).fill(0);
    const n = 600;
    for (const seed of SEEDS(n)) {
      const input = game({ gameId: seed, month: 11 });
      const before = environmentTimeline(input, deps(9), 4);
      const series = forecastSeries(input, deps(9), 7);
      expect(environmentTimeline(input, deps(9), 4)).toEqual(before);
      const truth = before[1]!.outdoor;
      for (const f of series) {
        errT[f.daysBeforeKickoff]! += Math.abs(f.tempF - truth.tempF) / n;
        errP[f.daysBeforeKickoff]! += Math.abs(f.precipChance - (truth.precip === 'none' ? 0 : 1)) / n;
      }
      const g = series[series.length - 1]!;
      expect(g.tempF).toBe(truth.tempF);
      expect(g.windMph).toBe(truth.windMph);
      expect(g.precipChance).toBe(truth.precip === 'none' ? 0 : 1);
    }
    for (let dd = 1; dd <= 7; dd++) {
      expect(errT[dd]!).toBeGreaterThan(errT[dd - 1]!);
      expect(errP[dd]!).toBeGreaterThan(errP[dd - 1]!);
    }
    expect(forecastFor(game({ venue: venue({ roofKind: 'fixed_dome' }) }), deps(), 3).indoor).toBe(true);
  });
});

describe('J12.3.1 wind field for a play', () => {
  const windy = env({ roof: 'open', windMph: 14, gustMph: 6, windDirDeg: 40 });
  it('acceptance 1: the gust comes from the gust stream, so it depends only on the game and play', () => {
    const d = deps(11);
    const a = windForPlay(windy, 0.9, 'g1', 7, d.streams, P, DMATH);
    expect(windForPlay(windy, 0.9, 'g1', 7, d.streams, P, DMATH)).toEqual(a);
    expect(windForPlay(windy, 0.9, 'g1', 8, d.streams, P, DMATH).gustMph).not.toBe(a.gustMph);
  });
  it('indoors and in calm air the wind is zero', () => {
    expect(windForPlay(Contract.NEUTRAL_ENVIRONMENT, 1, 'g1', 1, deps().streams, P, DMATH)).toEqual(CALM);
  });
  it('the steady part is windMph times shelter, gusts only add, direction stays within the jitter, and the vector matches the speed', () => {
    const d = deps(12);
    const gusts: number[] = [];
    for (let play = 1; play <= 2000; play++) {
      const w = windForPlay(windy, 0.75, 'g1', play, d.streams, P, DMATH);
      expect(w.steadyMph).toBeCloseTo(14 * 0.75, 12);
      expect(w.speedMph).toBeGreaterThanOrEqual(w.steadyMph);
      const off = Math.abs(w.dirDeg - 40);
      expect(off).toBeLessThanOrEqual(P.num('environment.wind.dirJitterDeg') + 1e-9);
      expect(Math.hypot(w.vxYdS, w.vyYdS)).toBeCloseTo(w.speedMph * YD_PER_S_PER_MPH, 9);
      gusts.push(w.gustMph);
    }
    // Half-normal mean is sqrt(2/pi) times the scale.
    expect(Math.abs(mean(gusts) - Math.sqrt(2 / Math.PI) * 6 * 0.75)).toBeLessThan(0.15);
  });
  it('wind bins follow J12.3.1: under 10, 10 to 15, over 15 mph', () => {
    expect([9.99, 10, 15, 15.01].map(windBin)).toEqual(['under10', 'from10to15', 'from10to15', 'over15']);
  });
});

describe('J12.4 precipitation and temperature', () => {
  it('J12.4.1: grip falls from dry to heavy rain, heavy rain is 0.8, and a wet-ball practice softens it', () => {
    const order: Precip[] = ['none', 'light_rain', 'rain', 'heavy_rain'];
    const grips = order.map((p) => gripOf(wetIndex(p, 60, P), P));
    for (let i = 1; i < grips.length; i++) expect(grips[i]!).toBeLessThan(grips[i - 1]!);
    expect(grips[3]).toBeCloseTo(0.8, 12);
    const rainy = env({ roof: 'open', precip: 'rain', tempF: 50 });
    expect(teamWet(rainy, true, P)).toBeCloseTo(teamWet(rainy, false, P) * 0.85, 12);
    expect(teamGrip(rainy, true, P)).toBeGreaterThan(teamGrip(rainy, false, P));
    expect(teamWet(Contract.NEUTRAL_ENVIRONMENT, false, P)).toBe(0);
  });
  it('J12.4.2: below 25 F a cold grip term applies; kick distance falls with cold and is 1 at the reference', () => {
    expect(wetIndex('none', 24, P)).toBeCloseTo(0.2, 12);
    expect(wetIndex('none', 26, P)).toBe(0);
    expect(kickDistanceOf(70, P)).toBe(1);
    expect(kickDistanceOf(90, P)).toBe(1);
    expect(kickDistanceOf(20, P)).toBeLessThan(kickDistanceOf(50, P));
  });
  it('J12.4.2 and J12.7.1: colder air is denser and thinner air at altitude is lighter, through one density ratio', () => {
    expect(airDensityRatio(0, 70, 70, DMATH)).toBe(1);
    expect(airDensityRatio(0, 20, 70, DMATH)).toBeGreaterThan(1);
    expect(airDensityRatio(5280, 70, 70, DMATH)).toBeLessThan(0.85);
    // A cold day at altitude partly cancels (J12.7.1).
    expect(airDensityRatio(5280, 20, 70, DMATH)).toBeGreaterThan(airDensityRatio(5280, 70, 70, DMATH));
  });
  it('heat index reproduces published reference values (MetPy examples) and is the temperature at or below 40 F', () => {
    expect(heatIndexF(90, 0.9, DMATH)).toBeCloseTo(121.901204, 4);
    expect(heatIndexF(86, 0.9, DMATH)).toBeCloseTo(40.774647 * 9 / 5 + 32, 3);
    expect(heatIndexF(60, 0.9, DMATH)).toBeCloseTo(59.93, 10);
    expect(heatIndexF(35, 0.9, DMATH)).toBe(35);
    expect(heatIndexF(95, 0.1, DMATH)).toBeLessThan(heatIndexF(95, 0.5, DMATH));
    expect(heatIndexOf(env({ tempF: 95, humidity: 0.6 }), DMATH)).toBeGreaterThan(heatIndexOf(env({ tempF: 60, humidity: 0.6 }), DMATH));
  });
});

describe('J12.5.1 surface', () => {
  it('footing table and limits: cutting suffers more than straight-line speed', () => {
    expect(footingOf('wet', 'natural', P)).toBe(0.93);
    expect(footingOf('wet', 'artificial', P)).toBe(0.96);
    expect(footingOf('soft', 'natural', P)).toBe(0.88);
    expect(footingOf('snow_covered', 'artificial', P)).toBe(0.85);
    const l = footingLimits(0.88);
    expect(l.lateral).toBe(0.88);
    expect(l.forward).toBeCloseTo(0.94, 12);
  });
  it('grass turns soft after a half of continuous rain; artificial turf never does; a wet field freezes at 32 F', () => {
    let c = nextCondition('dry', 'none', 'rain', 1, 50, 'natural', P);
    expect(c).toBe('wet');
    c = nextCondition(c, 'rain', 'rain', 2, 50, 'natural', P);
    expect(c).toBe('soft');
    expect(nextCondition(c, 'rain', 'none', 0, 50, 'natural', P)).toBe('soft');
    expect(nextCondition('wet', 'rain', 'heavy_rain', 4, 50, 'artificial', P)).toBe('wet');
    expect(nextCondition('wet', 'rain', 'none', 0, 50, 'artificial', P)).toBe('damp');
    expect(nextCondition('damp', 'none', 'none', 0, 50, 'artificial', P)).toBe('dry');
    expect(nextCondition('wet', 'rain', 'none', 0, 30, 'natural', P)).toBe('frozen');
    expect(nextCondition('dry', 'none', 'heavy_snow', 0, 25, 'natural', P)).toBe('snow_covered');
    expect(nextCondition('dry', 'none', 'snow', 0, 33, 'natural', P)).toBe('wet');
    expect(nextCondition('wet', 'snow', 'snow', 0, 33, 'natural', P)).toBe('snow_covered');
  });
  it('over many rainy games grass reaches soft and artificial turf never does', () => {
    let softGrass = 0;
    let softTurf = 0;
    for (const seed of SEEDS(1500)) {
      const g = environmentTimeline(game({ gameId: seed, month: 9 }), deps(13), 4);
      const t = environmentTimeline(game({ gameId: seed, month: 9, venue: venue({ surfaceKind: 'artificial' }) }), deps(13), 4);
      softGrass += g.filter((x) => x.environment.surfaceCondition === 'soft').length;
      softTurf += t.filter((x) => x.environment.surfaceCondition === 'soft').length;
    }
    expect(softGrass).toBeGreaterThan(0);
    expect(softTurf).toBe(0);
  });
  it('slips happen only below the footing threshold and each check draws one uniform', () => {
    expect(slipChancePerCut(0.92, P)).toBe(0);
    expect(slipChancePerCut(1, P)).toBe(0);
    expect(slipChancePerCut(0.85, P)).toBeGreaterThan(slipChancePerCut(0.88, P));
    const s = footingStream(deps().streams, 'g1', 3, 22);
    for (let i = 0; i < 50; i++) expect(slipOnCut(s, 1, P)).toBe(false);
    expect(s.draws).toBe(100);
  });
});

describe('J12.6.1 crowd noise', () => {
  const loud = env({ noiseBase: 0.9 });
  const sit = (o: Partial<{ offenseFavoured: boolean; down: number; margin: number }> = {}) => ({ offenseFavoured: false, down: 3, margin: 3, ...o });
  it('the one-score margin comes from the rule set (touchdown plus two-point try)', () => {
    expect(oneScoreMargin(PRO)).toBe(PRO.num('score.touchdown') + PRO.num('try.two_point_points'));
  });
  it('situation factors: late down close game > early down > blowout > own offense', () => {
    const late = noiseForPlay(loud, sit(), PRO, P);
    const early = noiseForPlay(loud, sit({ down: 1 }), PRO, P);
    const blow = noiseForPlay(loud, sit({ margin: 28 }), PRO, P);
    const own = noiseForPlay(loud, sit({ offenseFavoured: true }), PRO, P);
    expect(late).toBeCloseTo(0.9, 12);
    expect(early).toBeCloseTo(0.63, 12);
    expect(blow).toBeCloseTo(0.36, 12);
    expect(own).toBeCloseTo(0.18, 12);
    expect(noiseForPlay(loud, sit({ margin: -20 }), PRO, P)).toBeLessThan(noiseForPlay(loud, sit({ margin: -10 }), PRO, P));
  });
  it('acceptance 3 input: with noiseBase 0 the noise is 0 in every situation', () => {
    for (const down of [1, 2, 3, 4]) for (const margin of [-30, -7, 0, 7, 30]) {
      expect(noiseForPlay(Contract.NEUTRAL_ENVIRONMENT, sit({ down, margin }), PRO, P)).toBe(0);
    }
  });
});

describe('J12.7.1 thin air', () => {
  it('the ISA density law matches the bible table: 0.9151 at 3,000 ft and 0.8617 at 5,000 ft', () => {
    expect(isaDensityRatio(3000, DMATH)).toBeCloseTo(0.9151, 3);
    expect(isaDensityRatio(5000, DMATH)).toBeCloseTo(0.8617, 3);
  });
  it('a mountain venue snapshot carries lower air density than a sea-level one at the same temperature', () => {
    const hi = environmentForPeriod(game({ venue: venue({ altitudeFt: 5280, roofKind: 'fixed_dome' }) }), deps(), 1).environment;
    const lo = environmentForPeriod(game({ venue: venue({ altitudeFt: 0, roofKind: 'fixed_dome' }) }), deps(), 1).environment;
    expect(hi.derived.airDensity).toBeLessThan(lo.derived.airDensity);
    expect(lo.derived.airDensity).toBe(1);
  });
});
