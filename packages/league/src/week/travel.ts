// Travel and logistics (H8): the plan and departure, travel blocks and displaced blocks, nights away,
// body clock, altitude flag, curfew, delays, forecast error, college class time, the pregame meal.
// Every effect is small by design (H8.1.1 facts: rest and travel add nothing beyond noise to margins).
import TRV from './data/travel.json' with { type: 'json' };
import { addMinutes, instantValue, parseTime, MINUTES_PER_DAY, type Instant } from '../calendar/date.ts';
import { possible, type RandomStream } from '@gm/schema';
import { blockEnd, clashAtom, overlaps } from './atoms.ts';
import { allBlocks, withBlocks } from './build.ts';
import { P } from './params.ts';
import type { Block, Week } from './types.ts';
import type { WeekEvent } from './media.ts';

export const PLAN_TYPES = ['standard', 'early', 'extended'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];
export type Mode = 'air' | 'bus' | 'commercial';
export type BudgetTier = 'top' | 'middle' | 'low';

export interface Trip {
  readonly zonesCrossed: number;
  /** Flight time in hours, door to door before handling. */
  readonly flightHours: number;
  readonly roadHours: number;
  readonly international: boolean;
  readonly thursdayGame: boolean;
  /** College budget tier (H8.5.1); null uses the pro rule (H8.1.1 rule 2). */
  readonly tier: BudgetTier | null;
}

export interface TravelPlan {
  readonly gameId: string;
  readonly planType: PlanType;
  readonly departAt: Instant;
  readonly arriveAt: Instant;
  readonly returnAt: Instant;
  readonly mode: Mode;
  readonly nightsAway: number;
}

/** Plans offered for a trip (H8.1.1): Extended only over the distance or zone threshold or abroad; Thursday away games get Standard only. */
export function travelOptions(trip: Trip): PlanType[] {
  if (trip.thursdayGame) return ['standard'];
  const long = trip.zonesCrossed >= P('extended_zones') || trip.flightHours > P('extended_flight_hours') || trip.international;
  return long ? ['standard', 'early', 'extended'] : ['standard', 'early'];
}

/** AI default (H8.1.1 AI use): Standard, Early for trips of two or more zones. */
export function defaultPlan(trip: Trip): PlanType {
  const offered = travelOptions(trip);
  return trip.zonesCrossed >= P('early_trip_zones') && offered.includes('early') ? 'early' : 'standard';
}

/** Mode of travel (H8.1.1 rule 2; college tiers H8.5.1 rule 1). */
export function travelMode(trip: Trip): Mode {
  if (trip.international) return 'air';
  switch (trip.tier) {
    case 'top': return 'air';
    case 'middle': return trip.roadHours < P('college_mid_bus_hours') ? 'bus' : 'air';
    case 'low': return trip.roadHours < P('college_low_bus_hours') ? 'bus' : 'commercial';
    default: return trip.roadHours < P('bus_max_road_hours') ? 'bus' : 'air';
  }
}

/** Travel block length: door-to-door plus fixed handling (H8.1.1 rule 1; commercial H8.5.1). */
export function travelMinutes(trip: Trip, mode: Mode): number {
  const mph = P('minutes_per_hour');
  if (mode === 'bus') return Math.round((trip.roadHours + P('bus_handling_hours')) * mph);
  const handling = mode === 'commercial' ? P('commercial_handling_hours') : P('flight_handling_hours');
  return Math.round((trip.flightHours + handling) * mph);
}

export interface TravelResult {
  readonly plan: TravelPlan;
  readonly week: Week;
  readonly moved: readonly string[];
  readonly lost: readonly string[];
  readonly events: readonly WeekEvent[];
}

function travelBlock(id: string, start: Instant, minutes: number, mode: Mode): Block {
  return { id, type: 'travel', start, minutes, attendees: ['team', 'staff', 'head_coach', 'injured'], leader: 'operations', location: 'transit', contentRef: mode, mandatory: true };
}

/**
 * Apply a travel plan to an away week (H8.1.1 outputs). Blocks after departure move to the destination;
 * blocks the trip overlaps are moved after arrival when they fit that day, a practice is lost unless the
 * plan has a host site (Extended), and each night away sends events to D10 and E7.
 */
export function applyTravel(week: Week, gameId: string, trip: Trip, planType: PlanType): TravelResult {
  if (week.home || !week.kickoff) throw new Error('travel plans are for away games');
  if (!travelOptions(trip).includes(planType)) throw new Error(`plan ${planType} is not offered for this trip`);
  const rule = TRV.plans[planType];
  const mode = travelMode(trip);
  const minutes = travelMinutes(trip, mode);
  const gameDay = week.kickoff.day;
  const departDay = Math.max(week.days[0]!.day, gameDay - rule.dayBefore);
  const departAt: Instant = { day: departDay, minute: parseTime(rule.at) };
  const out = travelBlock(`${week.weekId}:travel:out`, departAt, minutes, mode);
  const arriveAt = addMinutes(departAt, minutes);
  const game = allBlocks(week).find((b) => b.type === 'game');
  const returnStart = game ? addMinutes(game.start, game.minutes + TRV.returnAfterGameMinutes) : addMinutes(week.kickoff, MINUTES_PER_DAY);
  const back = travelBlock(`${week.weekId}:travel:back`, returnStart, minutes, mode);
  const hostSite = planType === 'extended';
  const dayEnd = parseTime(TRV.dayEnd);
  const moved: string[] = [];
  const lost: string[] = [];
  const placed: Block[] = [out];
  let cursor = instantValue(arriveAt);
  for (const b0 of allBlocks(week)) {
    const after = instantValue(b0.start) >= instantValue(departAt);
    let b: Block = b0;
    if (after && b.type !== 'game' && b.type !== 'media') {
      const location: Block['location'] = b.type === 'practice' || b.type === 'walkthrough' ? 'host_site' : 'hotel';
      b = { ...b, location };
    }
    if (!overlaps(b, out) || b.type === 'game') { placed.push(b); continue; }
    if (b.type === 'practice' && !hostSite) { lost.push(b.id); continue; }
    const startAt = Math.max(cursor, instantValue(b.start));
    const day = Math.floor(startAt / MINUTES_PER_DAY);
    const minute = startAt - day * MINUTES_PER_DAY;
    const shifted: Block = { ...b, start: { day, minute }, location: b.type === 'practice' || b.type === 'walkthrough' ? 'host_site' : 'hotel' };
    if (day !== b.start.day || minute + b.minutes > dayEnd || placed.some((p) => clashAtom(p, shifted))) { lost.push(b.id); continue; }
    placed.push(shifted);
    moved.push(b.id);
    cursor = blockEnd(shifted);
  }
  // The return trip belongs to the next week's first day when it crosses midnight; it is listed in the plan either way.
  const sameDayReturn = returnStart.day === gameDay;
  if (sameDayReturn) placed.push(back);
  const nightsAway = Math.max(0, gameDay - departDay);
  const events: WeekEvent[] = [];
  for (let n = 0; n < nightsAway; n++) {
    events.push({ to: 'D10', kind: 'night_away', effect: n === 0 ? `recovery_cut:${P('night_away_recovery_cut')}` : 'none', subject: departDay + n });
    events.push({ to: 'E7', kind: 'night_away', effect: 'coach', subject: departDay + n });
  }
  const arriveHome = addMinutes(returnStart, minutes);
  if (arriveHome.day > gameDay) events.push({ to: 'D10', kind: 'short_sleep', effect: 'late_return', subject: gameDay + 1 });
  const plan: TravelPlan = { gameId, planType, departAt, arriveAt, returnAt: returnStart, mode, nightsAway };
  return { plan, week: withBlocks(week, placed), moved, lost, events };
}

/** Body-clock offset at kickoff (H8.2.1 rule 1): zone difference minus adaptation, never below zero. */
export function bodyClockOffset(zoneDifference: number, daysOnSite: number, shiftedDays: number): number {
  const full = Math.abs(zoneDifference);
  const adapt = P('adapt_per_day_on_site') * Math.max(0, daysOnSite) + P('adapt_per_shifted_day') * Math.max(0, shiftedDays);
  return Math.max(0, full - Math.min(full, adapt));
}

/** D10 applies the alertness modifier only for early body-time kickoffs (rule 2). `offsetHours` is positive when body time is earlier. */
export function earlyBodyTimeKickoff(localKickoffMinute: number, offsetHours: number): boolean {
  return localKickoffMinute - offsetHours * P('minutes_per_hour') < P('early_body_time_minutes');
}

/** Altitude preparation flag (H8.2.2 rule 1). The effects themselves are J12's and D10's. */
export function altitudeFlag(homeAltitudeM: number, siteAltitudeM: number): boolean {
  return siteAltitudeM - homeAltitudeM >= P('altitude_threshold_m');
}

/** Curfew breach chance per player per road night (H8.1.3 rule 1). Inputs 0..1 except the city factor. */
export function curfewChance(discipline: number, cultureFactor: number, cityFactor: number, bedCheck: boolean): number {
  const city = Math.min(P('curfew_city_max'), Math.max(P('curfew_city_min'), cityFactor));
  const p = P('curfew_base') * (1 - Math.min(1, Math.max(0, discipline))) * Math.max(0, cultureFactor) * city * (bedCheck ? P('curfew_check_factor') : 1);
  return possible(Math.min(1, p));
}

export interface CurfewPlayer { readonly id: number; readonly discipline: number; readonly realPerson: boolean }

/**
 * One road night (H8.1.3). A found breach goes to L3 before kickoff; an unfound one still costs sleep.
 * Real people from an imported roster are only ever logged "late for curfew" (rule 5, U rules).
 */
export function curfewNight(players: readonly CurfewPlayer[], cultureFactor: number, cityFactor: number, bedCheck: boolean, stream: RandomStream): WeekEvent[] {
  const out: WeekEvent[] = [];
  for (const pl of players) {
    if (!stream.chance(curfewChance(pl.discipline, cultureFactor, cityFactor, bedCheck))) continue;
    out.push({ to: 'D10', kind: 'short_sleep', effect: 'curfew', subject: pl.id });
    const found = bedCheck && stream.chance(P('curfew_check_factor'));
    const label = pl.realPerson ? 'late_for_curfew' : 'curfew_breach';
    if (found) out.push({ to: 'L3', kind: label, effect: 'found_by_bed_check', subject: pl.id });
    else if (stream.chance(P('curfew_late_news_chance'))) out.push({ to: 'L6', kind: label, effect: 'surfaces_later', subject: pl.id });
  }
  return out;
}

/** A travel delay in minutes (H8.4.1 rule 1); zero on most trips. */
export function delayMinutes(mode: Mode, severeWeather: boolean, stream: RandomStream): number {
  const u = stream.uniform();
  if (mode === 'bus') return u < P('delay_bus_rate') ? stream.int(P('delay_short_min_minutes'), P('delay_short_max_minutes')) : 0;
  const w = severeWeather ? P('delay_severe_weather_factor') : 1;
  const long = P('delay_long_rate') * w;
  if (u < long) return stream.int(P('delay_short_max_minutes') + 1, P('delay_long_max_minutes'));
  if (u < long + P('delay_short_rate')) return stream.int(P('delay_short_min_minutes'), P('delay_short_max_minutes'));
  return 0;
}

/** Forecast error standard deviation, shrinking linearly from G-5 to G (H8.3.1 rule 1). */
export function forecastSd(daysBefore: number, kind: 'wind' | 'temp'): number {
  const far = P(`forecast_${kind}_sd_far`), near = P(`forecast_${kind}_sd_near`);
  const span = P('forecast_far_days');
  const t = Math.min(1, Math.max(0, daysBefore / span));
  return near + (far - near) * t;
}

/** The forecast the staff sees: truth plus error. Indoors shows no forecast (rule 2). The truth never leaves (rule 5). */
export function forecast(truth: { windMph: number; tempF: number; precipChance: number } | 'indoors', daysBefore: number, stream: RandomStream):
  { windMph: number; tempF: number; precipChance: number } | 'indoors' {
  if (truth === 'indoors') return 'indoors';
  const wind = Math.max(0, truth.windMph + stream.normal() * forecastSd(daysBefore, 'wind'));
  const temp = truth.tempF + stream.normal() * forecastSd(daysBefore, 'temp');
  const precip = Math.min(1, Math.max(0, truth.precipChance + (stream.uniform() - stream.uniform()) * Math.min(1, daysBefore / P('forecast_far_days'))));
  return { windMph: wind, tempF: temp, precipChance: precip };
}

/** Class minutes a traveller misses (H8.5.1 rule 2): overlap of the away span with his class blocks. */
export function classMinutesMissed(plan: TravelPlan, classBlocks: readonly Block[]): number {
  const from = instantValue(plan.departAt), to = instantValue(plan.returnAt);
  let m = 0;
  for (const b of classBlocks) {
    if (b.type !== 'class_academic') continue;
    const s = Math.max(from, instantValue(b.start)), e = Math.min(to, blockEnd(b));
    if (e > s) m += e - s;
  }
  return m;
}

/** Pregame meal (H8.6.1 rule 2): zero effect inside the band, a small penalty outside it. */
export function pregameMealOutsideBand(hoursBeforeKickoff: number): boolean {
  return hoursBeforeKickoff < P('pregame_meal_band_min_hours') || hoursBeforeKickoff > P('pregame_meal_band_max_hours');
}

/** Staying on the road between away games (H8.2.4): about a week of nights away, events to D12 and E8. */
export function roadStayEvents(): WeekEvent[] {
  return [
    { to: 'D12', kind: 'nights_away', effect: `players_with_families:${P('road_stay_nights')}` },
    { to: 'E8', kind: 'family_time', effect: `nights:${P('road_stay_nights')}` },
  ];
}
