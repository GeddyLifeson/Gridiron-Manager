// Away-week trips for the travel screen (H8.1.1, item 2d): the C1.4.1 travel matrix entry between the seat's home
// venue and the game's site, from the content's venue latitude, longitude, time zone and altitude. Distance and
// zone offsets are the schedule's own helpers (league schedule util: equirectangular km, standard-time offsets
// from tzdata), so the travel card and the schedule never disagree about where a team is.
//
//   flight hours = distance / cruise speed + fixed hours  (C1.4.1 starting values, bible)
//   road hours   = distance x road circuity / bus speed    (assumptions A-2d-3, A-2d-4: no bible value)
//
// Not here yet: neutral-site and international venues (the fixture names no venue: a neutral game is treated as
// at the home team's venue), and the college budget tier (T9 has no tier per school yet, so the pro mode rule
// applies at both levels).
import { calendar, schedule, type week as wk } from '@gm/league';
import type { TravelInput } from '../read-models/week/index.ts';
import { P } from './params.ts';

export interface Venue { readonly latitude: number; readonly longitude: number; readonly zone: string; readonly altitudeM: number }

/** Each team's home venue by content key (pro club id, college school id). */
export function venuesOf(content: unknown, level: 'pro' | 'college'): ReadonlyMap<string, Venue> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as any;
  const out = new Map<string, Venue>();
  if (level === 'pro') {
    const stadiums = new Map<string, { latitude: number; longitude: number; timeZone: string; altitudeM: number }>((c.proLeague?.stadiums ?? []).map((s: { id: string }) => [s.id, s]));
    for (const club of c.proLeague?.league?.clubs ?? []) {
      const s = stadiums.get(club.stadiumId);
      if (s) out.set(club.id, { latitude: s.latitude, longitude: s.longitude, zone: s.timeZone, altitudeM: s.altitudeM });
    }
  } else {
    for (const s of c.college?.schools ?? []) out.set(s.id, { latitude: s.latitude, longitude: s.longitude, zone: s.timeZone, altitudeM: s.altitudeM });
  }
  return out;
}

const THURSDAY = 4; // calendar.weekday: 0 = Sunday

/** The trip from the seat's home venue to the game's site (C1.4.1 matrix entry) as the travel view reads it. */
export function tripBetween(home: Venue, site: Venue, gameId: string, kickoffDay: number): Omit<TravelInput, 'week' | 'chosen'> {
  const cfg = schedule.DEFAULT_CONFIG;
  const km = schedule.distanceKm(home.latitude, home.longitude, site.latitude, site.longitude, cfg);
  const shift = schedule.zoneOffset(site.zone, cfg) - schedule.zoneOffset(home.zone, cfg);
  const trip: wk.Trip = {
    zonesCrossed: Math.abs(shift),
    flightHours: km / P('trip.cruiseKmh') + P('trip.flightFixedHours'),
    roadHours: (km * P('trip.roadCircuity')) / P('trip.busKmh'),
    international: false,
    thursdayGame: calendar.weekday(kickoffDay) === THURSDAY,
    tier: null,
  };
  return { gameId, trip, zoneShift: shift, homeAltitudeM: home.altitudeM, siteAltitudeM: site.altitudeM };
}
