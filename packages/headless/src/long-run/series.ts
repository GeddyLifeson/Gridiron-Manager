// Q1.6.4 yearly series, read from the world at each season point of the Q1.6.1 run. A series the world
// cannot supply yet is listed in `unavailable` with its owner, never filled with a guess. Where the leaf
// asks for a measure the world does not hold (starters, snaps), the nearest honest measure is used and
// its name says so (`rostered`, `roster_share`).
import { param } from './params.ts';
import type { WorldView } from './types.ts';

/** One season's values, by series name. */
export type SeasonPoint = { readonly season: number; readonly values: Readonly<Record<string, number>> };

export interface RecordFall { readonly season: number; readonly record: string; readonly value: number; readonly previous: number }

export const UNAVAILABLE: readonly { readonly series: string; readonly reason: string }[] = [
  { series: 'talent.starters', reason: 'starters need the depth chart (M2), not in the world yet: talent is measured over rostered players' },
  { series: 'turnover.snaps', reason: 'snap counts need player statistics (X3.4.1 statistics step unbound): turnover is the share of the roster new this season' },
  { series: 'stats.player_leaders', reason: 'player statistic leaders need the statistics step (X3.4.1, unbound); team and league totals are measured' },
  { series: 'records.career', reason: 'career records need player statistics (X3.4.1, unbound); single-game and single-season team records are tracked' },
  { series: 'money.salary_vs_cap', reason: 'contracts and the cap are not in the world yet (C6, front office G-76)' },
];

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const sd = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};
const overall = (attrs: Readonly<Record<string, number>>): number => mean(Object.values(attrs));

/** Tracks everything a season series needs across seasons (first season seen, last rosters, records). */
export class SeriesTracker {
  readonly points: SeasonPoint[] = [];
  readonly recordFalls: RecordFall[] = [];
  private readonly firstSeen = new Map<number, number>();
  private readonly firstRostered = new Map<number, number>();
  private firstSeason: number | null = null;
  private lastRostered = new Set<number>();
  private readonly records = new Map<string, number>();

  /** Read the world right after a season point. `season` is the season just closed. */
  record(world: WorldView, season: number, games: readonly WorldView['results'][number][]): SeasonPoint {
    if (this.firstSeason === null) this.firstSeason = season;
    const v: Record<string, number> = {};
    const levelOf = new Map<number, string>();
    for (const c of world.competitions) for (const t of c.teamIds) levelOf.set(t, c.level);

    // Talent and age by level and position among rostered players.
    const talent = new Map<string, number[]>(), age = new Map<string, number[]>();
    const rostered = new Set<number>();
    const push = (m: Map<string, number[]>, k: string, x: number): void => { const a = m.get(k) ?? []; a.push(x); m.set(k, a); };
    for (const [teamId, ids] of world.rosters) {
      const level = levelOf.get(teamId) ?? 'unknown';
      for (const pid of ids) {
        const p = world.people.get(pid);
        if (!p?.playing) continue;
        rostered.add(pid);
        if (!this.firstRostered.has(pid)) this.firstRostered.set(pid, season);
        const pos = p.playing.position;
        push(talent, `${level}.${pos}`, overall(p.playing.attributes));
        push(talent, `${level}.all`, overall(p.playing.attributes));
        push(age, `${level}.${pos}`, season - p.birthDate.seasonYear);
        push(age, `${level}.all`, season - p.birthDate.seasonYear);
      }
    }
    const min = param('series.minSample');
    for (const [k, xs] of talent) if (xs.length >= min) { v[`talent.rostered.mean.${k}`] = mean(xs); v[`talent.rostered.sd.${k}`] = sd(xs); }
    for (const [k, xs] of age) if (xs.length >= min) v[`age.rostered.mean.${k}`] = mean(xs);

    // Career length of players who left football this season (founding players are censored: their start is unknown).
    const careers = new Map<string, number[]>();
    for (const [pid, since] of world.outOfFootballSince) {
      if (since !== season) continue;
      const p = world.people.get(pid);
      const start = this.firstRostered.get(pid);
      if (!p?.playing || start === undefined || start === this.firstSeason) continue;
      push(careers, p.playing.position, season - start + 1);
      push(careers, 'all', season - start + 1);
    }
    for (const [k, xs] of careers) if (xs.length >= min) v[`career.length.mean.${k}`] = mean(xs);

    // Turnover: share of this season's rostered players who were not rostered last season.
    if (this.lastRostered.size > 0 && rostered.size > 0) {
      let fresh = 0;
      for (const pid of rostered) if (!this.lastRostered.has(pid)) fresh++;
      v['turnover.roster_share'] = fresh / rostered.size;
    }
    this.lastRostered = rostered;

    // Class quality: people first seen this season who play.
    const cls: number[] = [];
    for (const p of world.people.values()) {
      if (this.firstSeen.has(p.id)) continue;
      this.firstSeen.set(p.id, season);
      if (season !== this.firstSeason && p.playing) cls.push(overall(p.playing.attributes));
    }
    if (cls.length > 0) { v['class.mean'] = mean(cls); v['class.sd'] = sd(cls); v['class.size'] = cls.length; }

    // League statistics from the season's games.
    if (games.length > 0) {
      const points = games.reduce((a, g) => a + g.homePoints + g.awayPoints, 0);
      const pass = games.reduce((a, g) => a + g.passPlays, 0), run = games.reduce((a, g) => a + g.runPlays, 0);
      v['stats.points_per_game'] = points / games.length;
      v['stats.plays_per_game'] = (pass + run) / games.length;
      if (pass + run > 0) v['stats.pass_share'] = pass / (pass + run);
      const teamPoints = new Map<number, number>();
      for (const g of games) {
        teamPoints.set(g.homeTeamId, (teamPoints.get(g.homeTeamId) ?? 0) + g.homePoints);
        teamPoints.set(g.awayTeamId, (teamPoints.get(g.awayTeamId) ?? 0) + g.awayPoints);
      }
      const leader = Math.max(...teamPoints.values());
      v['stats.team_points_leader'] = leader;
      // Records: single-game points, single-game margin, single-season team points.
      const gamePoints = Math.max(...games.map((g) => Math.max(g.homePoints, g.awayPoints)));
      const margin = Math.max(...games.map((g) => Math.abs(g.homePoints - g.awayPoints)));
      this.recordCheck(season, 'team_points_game', gamePoints);
      this.recordCheck(season, 'margin_game', margin);
      this.recordCheck(season, 'team_points_season', leader);
    }

    // People supply: coaches and staff in coach pools per open job.
    const open = [...world.jobs.values()].filter((j) => j.holderPersonId === null).length;
    let coachPool = 0;
    for (const [name, ids] of world.pools) if (name.includes('coach')) coachPool += ids.filter((id) => world.status.get(id) === 'active').length;
    v['supply.coaches_per_open_job'] = coachPool / Math.max(1, open);

    const point = { season, values: v };
    this.points.push(point);
    return point;
  }

  /** Records tracked, for the falls-per-record rate. */
  recordNames(): string[] { return [...this.records.keys()].sort(); }

  private recordCheck(season: number, name: string, value: number): void {
    const was = this.records.get(name);
    if (was === undefined) { this.records.set(name, value); return; }
    if (value > was) { this.recordFalls.push({ season, record: name, value, previous: was }); this.records.set(name, value); }
  }
}
