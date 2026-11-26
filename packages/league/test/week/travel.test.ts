import { describe, expect, it } from 'vitest';
import {
  allBlocks, altitudeFlag, applyTravel, bodyClockOffset, classMinutesMissed, clashes, curfewChance, curfewNight, defaultPlan, delayMinutes,
  earlyBodyTimeKickoff, forecast, forecastSd, pregameMealOutsideBand, travelMinutes, travelMode, travelOptions, type Trip,
} from '../../src/week/index.ts';
import { collegeWeek, proWeek, rng } from './fixtures.ts';

const trip = (over: Partial<Trip> = {}): Trip => ({ zonesCrossed: 0, flightHours: 1.5, roadHours: 5, international: false, thursdayGame: false, tier: null, ...over });

describe('travel plan (H8.1.1)', () => {
  it('offers Extended only over the thresholds; Thursday away games get Standard only', () => {
    expect(travelOptions(trip())).toEqual(['standard', 'early']);
    expect(travelOptions(trip({ zonesCrossed: 3 }))).toContain('extended');
    expect(travelOptions(trip({ flightHours: 5.5 }))).toContain('extended');
    expect(travelOptions(trip({ thursdayGame: true }))).toEqual(['standard']);
    expect(defaultPlan(trip({ zonesCrossed: 2 }))).toBe('early');
  });
  it('mode and block length', () => {
    expect(travelMode(trip({ roadHours: 2 }))).toBe('bus');
    expect(travelMode(trip())).toBe('air');
    expect(travelMode(trip({ tier: 'middle', roadHours: 4 }))).toBe('bus');
    expect(travelMode(trip({ tier: 'low', roadHours: 9 }))).toBe('commercial');
    expect(travelMinutes(trip(), 'air')).toBe(240);
    expect(travelMinutes(trip({ roadHours: 2 }), 'bus')).toBe(150);
  });
  it('every away week gets one plan; no block overlaps travel; walkthroughs move, practices are lost', () => {
    for (const plan of ['standard', 'early', 'extended'] as const) {
      const w = proWeek({ home: false });
      const r = applyTravel(w, 'g', trip({ zonesCrossed: 3, flightHours: 5 }), plan);
      expect(r.plan.planType).toBe(plan);
      expect(clashes(r.week)).toEqual([]);
      expect(allBlocks(r.week).filter((b) => b.type === 'travel').length).toBeGreaterThan(0);
    }
    const early = applyTravel(proWeek({ home: false }), 'g', trip(), 'early');
    expect(allBlocks(early.week).find((b) => b.type === 'walkthrough' && b.start.day === early.plan.arriveAt.day + 1)!.location).toBe('host_site');
    const ext = applyTravel(proWeek({ home: false }), 'g', trip({ zonesCrossed: 3 }), 'extended');
    expect(ext.plan.nightsAway).toBe(4);
    expect(ext.events.filter((e) => e.to === 'D10' && e.kind === 'night_away').length).toBe(4);
    expect(() => applyTravel(proWeek(), 'g', trip(), 'standard')).toThrow();
  });
  it('college travel: class time missed is counted for the trip', () => {
    const w = collegeWeek({ home: false });
    const r = applyTravel(w, 'g', trip({ tier: 'top' }), 'early');
    const classes = allBlocks(w).filter((b) => b.type === 'class_academic');
    expect(classMinutesMissed(r.plan, classes)).toBeGreaterThan(0);
  });
});

describe('distance, place and weather (H8.2, H8.3, H8.4)', () => {
  it('body clock: zero at home and after full adaptation', () => {
    expect(bodyClockOffset(0, 0, 0)).toBe(0);
    expect(bodyClockOffset(3, 1, 2)).toBe(1);
    expect(bodyClockOffset(3, 5, 0)).toBe(0);
    expect(earlyBodyTimeKickoff(13 * 60, 3)).toBe(true);
    expect(earlyBodyTimeKickoff(13 * 60, 0)).toBe(false);
  });
  it('altitude flag at the threshold', () => {
    expect(altitudeFlag(100, 1600)).toBe(true);
    expect(altitudeFlag(100, 900)).toBe(false);
  });
  it('curfew breaches fall with bed check and with discipline', () => {
    expect(curfewChance(0.5, 1, 1, true)).toBeLessThan(curfewChance(0.5, 1, 1, false));
    expect(curfewChance(0.9, 1, 1, false)).toBeLessThan(curfewChance(0.1, 1, 1, false));
    const s = rng(9);
    const players = Array.from({ length: 100 }, (_, i) => ({ id: i, discipline: 0.2, realPerson: i % 2 === 0 }));
    let on = 0, off = 0;
    for (let n = 0; n < 100; n++) {
      on += curfewNight(players, 1, 2, true, s).filter((e) => e.to === 'D10').length;
      off += curfewNight(players, 1, 2, false, s).filter((e) => e.to === 'D10').length;
    }
    expect(on).toBeLessThan(off);
    const evs = Array.from({ length: 200 }, () => curfewNight(players, 1, 2, true, s)).flat();
    for (const e of evs) if (e.to === 'L3' && typeof e.subject === 'number' && e.subject % 2 === 0) expect(e.kind).toBe('late_for_curfew');
  });
  it('forecast error shrinks toward kickoff; indoors has none', () => {
    expect(forecastSd(1, 'wind')).toBeLessThan(forecastSd(5, 'wind'));
    expect(forecastSd(0, 'temp')).toBe(2);
    expect(forecast('indoors', 3, rng(1))).toBe('indoors');
  });
  it('delays happen at about the configured rate', () => {
    const s = rng(11);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (delayMinutes('air', false, s) > 0) n++;
    expect(n / 20000).toBeGreaterThan(0.03);
    expect(n / 20000).toBeLessThan(0.042);
  });
  it('the pregame meal has no effect inside its band', () => {
    expect(pregameMealOutsideBand(3.5)).toBe(false);
    expect(pregameMealOutsideBand(6)).toBe(true);
  });
});
