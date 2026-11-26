// Test fixtures: the G-11 generated world (packages/football-content/data/world) turned into schedule
// inputs. Read from disk because a package may not import another package's files.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seedFromNumber, stream } from '@gm/engine-core';
import type { RandomStream } from '@gm/schema';
import type { ProClubInfo, ProLeague, TeamId, CollegeConference, CollegeTeam, Rivalry, NeutralVenue } from '../../src/schedule/index.ts';


const here = dirname(fileURLToPath(import.meta.url));
const worldDir = join(here, '..', '..', '..', 'football-content', 'data', 'world');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (f: string): any => JSON.parse(readFileSync(join(worldDir, f), 'utf8'));

export const proData = read('pro-league.json');
export const collegeData = read('college.json');

export function rng(seed: number, name = 'schedule', scope: (number | string)[] = []): RandomStream {
  return stream(seedFromNumber(seed), name, scope);
}

export function proLeague(): ProLeague {
  const clubs = proData.league.clubs as { id: string; divisionId: string }[];
  return {
    conferences: proData.league.conferences.map((c: { id: string; divisions: { id: string }[] }) => ({
      id: c.id,
      divisions: c.divisions.map((d) => ({ id: d.id, clubIds: clubs.filter((k) => k.divisionId === d.id).map((k) => k.id) })),
    })),
  };
}

export function proClubs(): ProClubInfo[] {
  const st = new Map((proData.stadiums as { id: string; timeZone: string; latitude: number; longitude: number }[]).map((s) => [s.id, s]));
  return (proData.league.clubs as { id: string; stadiumId: string; marketTier: number }[]).map((c) => {
    const s = st.get(c.stadiumId)!;
    return { id: c.id, venueId: c.stadiumId, zone: s.timeZone, latitude: s.latitude, longitude: s.longitude, marketTier: c.marketTier };
  });
}

/** Prior ranks 1 to 4 in each division, shuffled by seed. */
export function priorRanks(league: ProLeague, seed: number): Record<TeamId, number> {
  const r = rng(seed, 'ranks');
  const out: Record<TeamId, number> = {};
  for (const c of league.conferences) for (const d of c.divisions) {
    const ids = d.clubIds.slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = r.int(0, i); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
    ids.forEach((id, i) => { out[id] = i + 1; });
  }
  return out;
}

export function priorWins(league: ProLeague, seed: number): Record<TeamId, number> {
  const r = rng(seed, 'wins');
  const out: Record<TeamId, number> = {};
  for (const c of league.conferences) for (const d of c.divisions) for (const id of d.clubIds) out[id] = r.int(2, 15);
  return out;
}

export function collegeTeams(): CollegeTeam[] {
  return (collegeData.schools as { id: string; level: string; conferenceId: string | null; latitude: number; longitude: number; timeZone: string; stadium: { id: string } }[])
    .map((s) => ({ id: s.id, level: s.level, conferenceId: s.conferenceId, latitude: s.latitude, longitude: s.longitude, zone: s.timeZone, venueId: s.stadium.id }));
}

export function collegeConferences(): CollegeConference[] {
  return (collegeData.conferences as { id: string; tier: string; level: string; memberIds: string[] }[])
    .map((c) => ({ id: c.id, tier: c.tier, memberIds: c.memberIds }));
}

export function collegeRivalries(): Rivalry[] {
  return collegeData.rivalries as Rivalry[];
}

export function neutralVenues(): NeutralVenue[] {
  return (proData.stadiums as { id: string; latitude: number; longitude: number; timeZone: string }[])
    .map((s) => ({ id: s.id, latitude: s.latitude, longitude: s.longitude, zone: s.timeZone }));
}
