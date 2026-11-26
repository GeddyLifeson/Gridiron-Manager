// CollegeFootballData adapter (U1.1.1 gap: college head coaches). The API needs a free key that Marlon has not
// provided yet, so the import runs without it: the project pack then has no college coaches and the preview
// says so. When a key exists, a tool on his machine fetches GET /coaches (Bearer key) and hands the JSON here.
// Response shape read 2026-11-26 from two generated clients of the CFBD OpenAPI spec (cfbd-python models
// coach.py and coach_season.py; cfbd-typescript types.gen.ts): Coach {id, firstName, lastName, hireDate,
// seasons: CoachSeason[]}, CoachSeason {teamId, school, conference, year, games, wins, losses, ties, ...}.
// Status 2 of 3 (both clients come from the same spec; the live API was not reachable from the cloud).
import type { PackRow } from '../pack/index.ts';

export const CFBD_HOST = 'https://api.collegefootballdata.com';
export const CFBD_COACHES_PATH = '/coaches';

export interface CfbdCoachSeason { school?: string; year?: number; games?: number; wins?: number; losses?: number; ties?: number }
export interface CfbdCoach { id?: number; firstName?: string; lastName?: string; seasons?: CfbdCoachSeason[] }

export type CfbdStatus = { available: true } | { available: false; reason: string };

/** The import never needs the key; this tells the preview whether the college-coach gap can be closed. */
export function cfbdStatus(key: string | undefined): CfbdStatus {
  return key && key.trim().length > 0 ? { available: true } : { available: false, reason: 'CollegeFootballData key not provided: college head coaches stay generated (U5.1.1 rule 4)' };
}

const n = (v: number | undefined) => (v === undefined || v === null || !Number.isFinite(v) ? '' : String(Math.round(v)));

/** Converts the /coaches response into pack rows: people and college head-coach seasons. Coaches without an id or name are skipped. */
export function cfbdCoachRows(json: unknown): { people: PackRow[]; coachingSeasons: PackRow[]; skipped: number } {
  const people: PackRow[] = [], coachingSeasons: PackRow[] = [];
  let skipped = 0;
  if (!Array.isArray(json)) return { people, coachingSeasons, skipped: 1 };
  for (const c of json as CfbdCoach[]) {
    if (typeof c?.id !== 'number' || !c.firstName || !c.lastName) { skipped++; continue; }
    const key = `cfbdcoach:${c.id}`;
    people.push({ source_key: key, name_first: c.firstName, name_last: c.lastName });
    for (const s of c.seasons ?? []) {
      if (typeof s.year !== 'number') continue;
      coachingSeasons.push({ source_key: key, season: n(s.year), level: 'college', organisation: s.school ?? '', role: 'head coach', games: n(s.games), wins: n(s.wins), losses: n(s.losses), ties: n(s.ties) });
    }
  }
  return { people, coachingSeasons, skipped };
}
