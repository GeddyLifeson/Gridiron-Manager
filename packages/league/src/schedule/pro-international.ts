// C2.4.1 International and neutral-site games. Designated home clubs come from the conference with
// nine home games, so each still plays eight true home games; no club loses more than one home date.
// After a game abroad each club chooses its bye the next week or a normal week (its own choice, the
// real league asks each club); the shares by region are starting values in config.
import type { RandomStream } from '@gm/schema';
import type { Pairing, ProLeague, ScheduleConfig, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { rotationYear } from './pro-opponents.ts';
import { byYear, shuffle } from './util.ts';
import type { WeekConstraintIntl } from './pro-weeks.ts';

export interface IntlGame extends WeekConstraintIntl {
  readonly venueId: string;
  readonly region: string;
  readonly zone: string;
}

export function chooseInternational(
  season: number,
  league: ProLeague,
  pairings: readonly Pairing[],
  rng: RandomStream,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): IntlGame[] {
  const I = cfg.international;
  const count = byYear(I.gamesByYear, season);
  if (count === 0) return [];
  const venueCounts = byYear(I.venueGamesByYear as Record<string, Record<string, number>>, season);
  const venueIds: string[] = [];
  for (const v of I.venues) for (let i = 0; i < (venueCounts[v.id] ?? 0); i++) venueIds.push(v.id);
  if (venueIds.length !== count) throw new Error(`C2.4.1: ${venueIds.length} venue slots for ${count} games in ${season}`);
  const week1Venue = (I.week1VenueByYear as Record<string, string>)[String(season)] ?? null;
  // The week-1 venue goes first so it is matched to the first chosen game.
  const ordered = week1Venue ? [week1Venue, ...removeOne(venueIds, week1Venue)] : shuffle(venueIds, rng);
  const restShuffled = week1Venue ? [ordered[0]!, ...shuffle(ordered.slice(1), rng)] : ordered;

  const hostConf = league.conferences[rotationYear(season, cfg).extraHostConference]!;
  const hostClubs = shuffle(hostConf.divisions.flatMap((d) => d.clubIds), rng);
  if (hostClubs.length < count) throw new Error('C2.4.1: more international games than clubs in the hosting conference');

  const intlCount = new Map<TeamId, number>();
  const tookBye = new Set<TeamId>();
  const out: IntlGame[] = [];
  for (let k = 0; k < count; k++) {
    const host = hostClubs[k]!;
    const options = pairings
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => p.home === host && (intlCount.get(p.away) ?? 0) < 1 && !out.some((g) => g.pairing === i));
    if (options.length === 0) throw new Error(`C2.4.1: no home game available for ${host}`);
    const pick = options[rng.int(0, options.length - 1)]!;
    const venueId = restShuffled[k]!;
    const venue = I.venues.find((v) => v.id === venueId)!;
    const fixedWeek = week1Venue && k === 0 ? I.firstWeek : null;
    const byeAfter: TeamId[] = [];
    // A bye the next week is possible only if that week is inside the bye window.
    const byePossible = fixedWeek === null || (fixedWeek + 1 >= cfg.pro.weeks.byeWindowFirst && fixedWeek + 1 <= cfg.pro.weeks.byeWindowLast);
    const p = (I.byeProbability as Record<string, number>)[venue.region] ?? 0;
    for (const club of [pick.p.home, pick.p.away]) {
      intlCount.set(club, (intlCount.get(club) ?? 0) + 1);
      if (byePossible && !tookBye.has(club) && rng.chance(p)) {
        byeAfter.push(club);
        tookBye.add(club);
      }
    }
    out.push({ pairing: pick.i, venueId, region: venue.region, zone: venue.zone, byeAfter, fixedWeek });
  }
  return out;
}

function removeOne(xs: readonly string[], x: string): string[] {
  const i = xs.indexOf(x);
  return i < 0 ? xs.slice() : [...xs.slice(0, i), ...xs.slice(i + 1)];
}
