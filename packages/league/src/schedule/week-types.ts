// C2.2.2 Week types and C2.3.2 body-clock kickoff time. Both levels use them (T3 shares C2.2.2).
import type { ScheduleConfig, ScheduledGame, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { daysBetween, zoneOffset } from './util.ts';

export type WeekTag = 'illegal' | 'short' | 'short_mild' | 'normal_minus_one' | 'normal' | 'long' | 'mini_bye' | 'bye';

export interface WeekTypeRow {
  readonly team: TeamId;
  readonly week: number;
  readonly tag: WeekTag;
  /** Days since the previous game; null for week 1 (follows the camp calendar, C4) and for a bye row. */
  readonly restDays: number | null;
  readonly gameId: string | null;
}

export function tagForDays(days: number, cfg: ScheduleConfig = DEFAULT_CONFIG): WeekTag {
  for (const b of cfg.weekTypes.bands) if (days <= b.maxDays) return b.tag as WeekTag;
  return cfg.weekTypes.beyond as WeekTag;
}

/** One row per team per week from week 1 to `weeks` (C2.2.2 outputs). */
export function weekTypes(games: readonly ScheduledGame[], teams: readonly TeamId[], weeks: number, cfg: ScheduleConfig = DEFAULT_CONFIG): WeekTypeRow[] {
  const rows: WeekTypeRow[] = [];
  for (const t of teams) {
    const mine = games.filter((g) => g.phase === 'regular' && (g.home === t || g.away === t)).sort((a, b) => a.week - b.week);
    let prev: ScheduledGame | null = null;
    for (let w = 1; w <= weeks; w++) {
      const g = mine.find((x) => x.week === w) ?? null;
      if (!g) { rows.push({ team: t, week: w, tag: 'bye', restDays: null, gameId: null }); continue; }
      if (!prev) rows.push({ team: t, week: w, tag: 'normal', restDays: null, gameId: g.id });
      else {
        const d = daysBetween(prev.week, prev.dayOffset, g.week, g.dayOffset, cfg);
        rows.push({ team: t, week: w, tag: tagForDays(d, cfg), restDays: d, gameId: g.id });
      }
      prev = g;
    }
  }
  return rows;
}

/**
 * C2.3.2: the hour on a team's body clock at kickoff. Venue local time shifted by the zones between
 * the team's home and the venue, reduced by one zone per full day on site (starting value).
 */
export function bodyClockKickoffMinutes(
  kickoffEtMinutes: number,
  venueZone: string,
  homeZone: string,
  daysOnSite: number,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): number {
  const et = zoneOffset(cfg.zones.easternZone, cfg);
  const venue = zoneOffset(venueZone, cfg);
  const home = zoneOffset(homeZone, cfg);
  const local = kickoffEtMinutes + (venue - et) * cfg.time.minutesPerHour;
  const gap = home - venue;
  const adapt = Math.min(Math.abs(gap), Math.max(0, Math.floor(daysOnSite)) * cfg.zones.zonesPerDayOnSite);
  const shifted = gap - Math.sign(gap) * adapt;
  return local + shifted * cfg.time.minutesPerHour;
}
