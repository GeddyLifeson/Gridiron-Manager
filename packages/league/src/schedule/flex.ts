// C2.3.3 Flexible scheduling and the week-18 slots. The league office (AI) moves late-season games;
// stakes come from C3 playoff odds and attractiveness, supplied by the caller (the score is a design
// choice, C2.3.3 rule 1). Every move is returned as a ScheduleChange for H1 and C10.1.
import type { RandomStream } from '@gm/schema';
import type { ScheduleConfig, ScheduledGame, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { daysBetween, dayOffsetOf, zoneOffset } from './util.ts';

export interface FlexUsage { sundayNightLimited: number; thursday: number }

export interface ScheduleChange {
  readonly gameId: string;
  readonly fromSlot: string;
  readonly toSlot: string;
  readonly fromDay: string;
  readonly toDay: string;
  readonly week: number;
  readonly reason: 'flex' | 'flex_displaced' | 'week18';
}

type Night = 'sunday_night' | 'monday_night' | 'thursday_night';

/** Whether the league may flex the given night slot in `week` with `daysNotice` days to go (rules 1 and 2). */
export function flexWindowOpen(night: Night, week: number, daysNotice: number, usage: FlexUsage, cfg: ScheduleConfig = DEFAULT_CONFIG): boolean {
  const F = cfg.flex;
  if (night === 'sunday_night') {
    const s = F.sundayNight;
    const notice = week <= s.noticeEarlyLastWeek ? s.noticeEarlyDays : s.noticeLateDays;
    if (daysNotice < notice) return false;
    if (week >= s.limitedFirst && week <= s.limitedLast) return usage.sundayNightLimited < s.limitedMax;
    return week >= s.openFirst && week <= s.openLast;
  }
  if (night === 'monday_night') return week >= F.mondayNight.first && week <= F.mondayNight.last && daysNotice >= F.mondayNight.noticeDays;
  return week >= F.thursdayNight.first && week <= F.thursdayNight.last && daysNotice >= F.thursdayNight.noticeDays && usage.thursday < F.thursdayNight.max;
}

function teamGames(games: readonly ScheduledGame[], t: TeamId): ScheduledGame[] {
  return games.filter((g) => g.phase === 'regular' && (g.home === t || g.away === t)).sort((a, b) => a.week - b.week);
}

/** Rest checks for a game moved to `day` (rule 4 for Sunday and Monday moves; C2.3.1 rules for Thursday). */
function restOk(games: readonly ScheduledGame[], g: ScheduledGame, day: string, cfg: ScheduleConfig): boolean {
  const off = dayOffsetOf(day, cfg);
  for (const t of [g.home, g.away]) {
    const mine = teamGames(games, t);
    const k = mine.findIndex((x) => x.id === g.id);
    const prev = mine[k - 1];
    const next = mine[k + 1];
    const toPrev = prev ? daysBetween(prev.week, prev.dayOffset, g.week, off, cfg) : Number.MAX_SAFE_INTEGER;
    const toNext = next ? daysBetween(g.week, off, next.week, next.dayOffset, cfg) : Number.MAX_SAFE_INTEGER;
    if (day === 'thu') {
      if (toPrev < cfg.slots.minRestDays || toNext < cfg.slots.minRestDays) return false;
      if (prev && prev.week === g.week - 1 && prev.dayOffset > dayOffsetOf('sun', cfg)) return false;
    } else {
      const floor = cfg.flex.minDaysBetweenGames;
      const prevNat = prev ? prev.national && g.national : false;
      const nextNat = next ? next.national && g.national : false;
      if (toPrev < floor && !prevNat) return false;
      if (toNext < floor && !nextNat) return false;
    }
  }
  return true;
}

/**
 * Flex one week. For each night game whose window is open, the highest-stakes Sunday afternoon game
 * that beats it takes the slot, and the night game moves to Sunday afternoon (rule 1).
 */
export function flexWeek(
  games: ScheduledGame[],
  week: number,
  stakes: Readonly<Record<string, number>>,
  daysNotice: number,
  usage: FlexUsage,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): ScheduleChange[] {
  const changes: ScheduleChange[] = [];
  const times = cfg.slots.kickoffEtMinutes as Record<string, number>;
  const nights: Night[] = ['sunday_night', 'monday_night', 'thursday_night'];
  for (const night of nights) {
    const cur = games.find((g) => g.week === week && g.slot === night);
    if (!cur || !flexWindowOpen(night, week, daysNotice, usage, cfg)) continue;
    const day = night === 'sunday_night' ? 'sun' : night === 'monday_night' ? 'mon' : 'thu';
    const afternoon = games
      .filter((g) => g.week === week && (g.slot === 'sunday_early' || g.slot === 'sunday_late' || g.slot === 'tbd') && !g.international)
      .filter((g) => (stakes[g.id] ?? 0) > (stakes[cur.id] ?? 0))
      .sort((a, b) => (stakes[b.id] ?? 0) - (stakes[a.id] ?? 0) || (a.id < b.id ? -1 : 1));
    for (const cand of afternoon) {
      if (!restOk(games, cand, day, cfg)) continue;
      const displacedOk = restOk(games, cur, 'sun', cfg);
      if (!displacedOk) continue;
      const late = { slot: 'sunday_late', day: 'sun' as const };
      changes.push({ gameId: cand.id, fromSlot: cand.slot, toSlot: night, fromDay: cand.day, toDay: day, week, reason: 'flex' });
      changes.push({ gameId: cur.id, fromSlot: cur.slot, toSlot: late.slot, fromDay: cur.day, toDay: late.day, week, reason: 'flex_displaced' });
      Object.assign(cand, { slot: night, day, dayOffset: dayOffsetOf(day, cfg), kickoffEtMinutes: times[night], national: true, status: 'moved' });
      Object.assign(cur, { slot: late.slot, day: late.day, dayOffset: dayOffsetOf('sun', cfg), kickoffEtMinutes: times[late.slot], national: false, status: 'moved' });
      if (night === 'sunday_night' && week <= cfg.flex.sundayNight.limitedLast) usage.sundayNightLimited++;
      if (night === 'thursday_night') usage.thursday++;
      break;
    }
  }
  return changes;
}

/**
 * Rule 3: week 18 is slotted after week 17. Games in one `sameTime` group kick off together; the
 * highest-stakes game outside a group gets the Sunday night slot; the next highest go to Saturday.
 */
export function slotWeek18(
  games: ScheduledGame[],
  stakes: Readonly<Record<string, number>>,
  sameTime: readonly (readonly string[])[],
  rng: RandomStream,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): ScheduleChange[] {
  const W = cfg.pro.weeks.count;
  const times = cfg.slots.kickoffEtMinutes as Record<string, number>;
  const wk = games.filter((g) => g.week === W && g.phase === 'regular');
  const grouped = new Set(sameTime.flat());
  const byStake = wk.slice().sort((a, b) => (stakes[b.id] ?? 0) - (stakes[a.id] ?? 0) || (a.id < b.id ? -1 : 1));
  const changes: ScheduleChange[] = [];
  const set = (g: ScheduledGame, slot: string, day: 'sat' | 'sun', nat: boolean) => {
    changes.push({ gameId: g.id, fromSlot: g.slot, toSlot: slot, fromDay: g.day, toDay: day, week: W, reason: 'week18' });
    Object.assign(g, { slot, day, dayOffset: dayOffsetOf(day, cfg), kickoffEtMinutes: times[slot], national: nat });
  };
  const free = byStake.filter((g) => !grouped.has(g.id));
  const snf = free.shift();
  if (snf) set(snf, 'sunday_night', 'sun', true);
  for (let k = 0; k < cfg.flex.week18SaturdayGames && free.length > 0; k++) set(free.shift()!, k === 0 ? 'saturday' : 'saturday_night', 'sat', true);
  for (const grp of sameTime) for (const id of grp) {
    const g = wk.find((x) => x.id === id);
    if (g) set(g, 'sunday_late', 'sun', false);
  }
  const noEarly = new Set(cfg.slots.noEarlyZones);
  for (const g of free) {
    const late = noEarly.has(g.venueZone ?? '') || (rng.chance(cfg.slots.sundayLateMin / wk.length) && zoneOffset(g.venueZone, cfg) <= zoneOffset(cfg.zones.easternZone, cfg));
    set(g, late ? 'sunday_late' : 'sunday_early', 'sun', false);
  }
  return changes;
}
