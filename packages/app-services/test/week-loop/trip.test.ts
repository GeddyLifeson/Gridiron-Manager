// Away-week trips (week-loop/trip.ts): the C1.4.1 travel matrix entry from content venues.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calendar } from '@gm/league';
import { tripBetween, venuesOf, type Venue } from '../../src/week-loop/trip.ts';
import { P } from '../../src/week-loop/params.ts';

const read = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../football-content/data/world/${name}`, import.meta.url)), 'utf8'));
const CONTENT = { proLeague: read('pro-league.json'), college: read('college.json') };

// Two fixed points for a hand check: midtown New York and downtown Los Angeles.
const NY: Venue = { latitude: 40.75, longitude: -73.99, zone: 'America/New_York', altitudeM: 10 };
const LA: Venue = { latitude: 34.05, longitude: -118.24, zone: 'America/Los_Angeles', altitudeM: 90 };
const SUNDAY = calendar.dayNumber({ y: 2026, m: 9, d: 13 });
const THURSDAY = calendar.dayNumber({ y: 2026, m: 9, d: 10 });

describe('away-week trips (C1.4.1)', () => {
  it('every team at both levels has a home venue', () => {
    expect(venuesOf(CONTENT, 'pro').size).toBe(CONTENT.proLeague.league.clubs.length);
    expect(venuesOf(CONTENT, 'college').size).toBe(CONTENT.college.schools.length);
  });
  it('New York to Los Angeles: about 3,940 km great circle, 3 zones west, flight by the C1.4.1 formula', () => {
    const t = tripBetween(NY, LA, 'g1', SUNDAY);
    const km = (t.trip.flightHours - P('trip.flightFixedHours')) * P('trip.cruiseKmh');
    // Published great-circle distance New York to Los Angeles is about 3,936 km; equirectangular is within 1%.
    expect(km).toBeGreaterThan(3900);
    expect(km).toBeLessThan(3990);
    expect(t.zoneShift).toBe(-3);
    expect(t.trip.zonesCrossed).toBe(3);
    expect(t.trip.roadHours).toBeCloseTo((km * P('trip.roadCircuity')) / P('trip.busKmh'), 6);
    expect(t.trip.thursdayGame).toBe(false);
    expect(t.homeAltitudeM).toBe(10);
    expect(t.siteAltitudeM).toBe(90);
  });
  it('symmetric in distance, zones crossed reverse sign (C1.4.1 acceptance), Thursday read off the kickoff day', () => {
    const a = tripBetween(NY, LA, 'g', THURSDAY), b = tripBetween(LA, NY, 'g', THURSDAY);
    expect(a.trip.flightHours).toBeCloseTo(b.trip.flightHours, 9);
    expect(a.zoneShift).toBe(-b.zoneShift);
    expect(a.trip.thursdayGame).toBe(true);
  });
});
