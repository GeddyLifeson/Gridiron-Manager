// Teams that start and end inside the world's past (Marlon 2026-11-26: "teams can start, end ... all
// that, like Dwarf Fortress"). Every team has a span: the season it was founded and, for a team that
// is gone, the first season it did not play. A team outside its span plays no games, holds no people
// and is skipped by the validator. Founding a team later in the past runs the same founding code as
// day one (X10.2.2), in the team's own founding year, so its people are the right age for that year.
//
// When a team is founded is drawn from a founding curve per competition: the share of that level's
// teams that existed by each year. The curves are calibration data measured from real football
// (research/history-run, with their statuses); the teams themselves stay fictional.
import { stream, type WorldSeed } from '@gm/engine-core';
import type { CompetitionRecord, TeamRecord } from '@gm/schema';
import type { PersonNameSource, WorldContent } from '../generation/content.ts';
import { foundPeople, foundingProblems } from '../generation/founding.ts';
import type { BuiltStructures } from '../generation/structures.ts';
import { TEAM_FOLDED, TEAM_FOUNDED } from './events.ts';
import type { LiveWorld, StepHandler } from './types.ts';

export const STREAM_LIFECYCLE = 'world.lifecycle';
export { TEAM_FOUNDED, TEAM_FOLDED };

/** A team's place in time. `folded` is the first season it did not play; null while it exists. */
export interface TeamSpan { readonly teamId: number; readonly founded: number; readonly folded: number | null }

/**
 * Cumulative share of a level's present-day teams that had been founded by each year, as [year, share]
 * points with years rising and shares rising to 1. Between points the share holds at the earlier point.
 */
export type FoundingCurve = readonly (readonly [number, number])[];

/** The key a competition's curve is stored under: 'pro' for the pro league, else the competition's level id. */
export function curveKey(c: Pick<CompetitionRecord, 'level' | 'name'>): string {
  return c.level === 'pro' ? 'pro' : c.name;
}

export function curveProblems(curve: FoundingCurve): string[] {
  const out: string[] = [];
  if (curve.length === 0) return ['founding curve: no points'];
  curve.forEach(([y, s], i) => {
    if (!Number.isInteger(y)) out.push(`founding curve point ${i}: year ${y} is not a whole year`);
    if (!(s >= 0 && s <= 1)) out.push(`founding curve point ${i}: share ${s} is outside 0 to 1`);
    const prev = curve[i - 1];
    if (prev && (y <= prev[0] || s < prev[1])) out.push(`founding curve point ${i}: years must rise and shares must not fall`);
  });
  if (curve[curve.length - 1]![1] !== 1) out.push('founding curve: the last share must be 1 (every present-day team exists)');
  return out;
}

/** The founding year for a uniform draw `u` in [0, 1): the first point whose share passes `u`. */
export function foundingYear(curve: FoundingCurve, u: number): number {
  for (const [year, share] of curve) if (u < share) return year;
  return curve[curve.length - 1]![0];
}

/**
 * Spans for every team of a world whose career starts in `careerStartYear`. A team whose competition has
 * no curve exists from the world's first season. Every present-day team exists by the career start.
 */
export function planTeamSpans(
  seed: WorldSeed, teams: readonly TeamRecord[], competitions: readonly CompetitionRecord[],
  curves: Readonly<Record<string, FoundingCurve>>, firstSeasonYear: number, careerStartYear: number,
): Map<number, TeamSpan> {
  for (const [key, c] of Object.entries(curves)) {
    const p = curveProblems(c);
    if (p.length > 0) throw new Error(`founding curve ${key}: ${p.join('; ')}`);
  }
  const compById = new Map(competitions.map((c) => [c.id, c]));
  const out = new Map<number, TeamSpan>();
  for (const t of teams) {
    const curve = curves[curveKey(compById.get(t.competitionId)!)];
    let founded = firstSeasonYear;
    if (curve) founded = Math.min(careerStartYear, foundingYear(curve, stream(seed, STREAM_LIFECYCLE, [t.id, 'founded']).uniform()));
    out.set(t.id, { teamId: t.id, founded, folded: null });
  }
  return out;
}

/** True when the team plays in `year` (default: the world's current season). */
export function isActive(world: Pick<LiveWorld, 'teamSpans' | 'date'>, teamId: number, year = world.date.seasonYear): boolean {
  const s = world.teamSpans.get(teamId);
  if (!s) return true;
  return s.founded <= year && (s.folded === null || year < s.folded);
}

/** The ids among `ids` that play this season, in the order given. Schedules build from these. */
export function activeTeamIds(world: Pick<LiveWorld, 'teamSpans' | 'date'>, ids: readonly number[], year = world.date.seasonYear): number[] {
  return ids.filter((id) => isActive(world, id, year));
}

/** Teams founded but not yet given their people (founded after the world's first season). */
export function awaitingFounding(world: LiveWorld): number[] {
  const out: number[] = [];
  for (const s of world.teamSpans.values()) if (s.founded === world.date.seasonYear && !world.rosters.has(s.teamId)) out.push(s.teamId);
  return out.sort((a, b) => a - b);
}

export interface LifecycleBinding {
  readonly content: WorldContent;
  readonly names: PersonNameSource;
  readonly built: Pick<BuiltStructures, 'competitions' | 'conferences' | 'places' | 'venues' | 'teams' | 'placeOfTeam'>;
  /** Pool names a folded team's people go to. */
  readonly playerPool?: string;
  readonly staffPool?: string;
}

/**
 * The lifecycle step, first in the weekly order and acting only in a season's first pass: teams founded
 * this season get their founding people, bosses, staff and culture; teams that fold this season release
 * their people to the pools. Both are logged.
 */
export function lifecycleStep(b: LifecycleBinding): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    if (world.week !== 0) return { founded: 0, folded: 0 };
    const year = world.date.seasonYear;
    const founded = awaitingFounding(world);
    if (founded.length > 0) {
      const ids = new Set(founded);
      const opts = { teamIds: ids, year, firstIds: { person: world.nextIds.person!, job: world.nextIds.job! } };
      const f = foundPeople(world.setup, world.seed, b.content, b.built as BuiltStructures, b.names, opts);
      const problems = foundingProblems(world.setup, b.content, b.built as BuiltStructures, f, opts);
      if (problems.length > 0) throw new Error(`founding in ${year} is not legal: ${problems.slice(0, 5).join('; ')}`);
      for (const p of f.people) { world.people.set(p.id, p); world.status.set(p.id, 'active'); }
      for (const j of f.jobs) world.jobs.set(j.id, j);
      for (const [teamId, roster] of f.rosters) world.rosters.set(teamId, roster);
      for (const c of f.cultures) world.cultures.set(c.teamId, c);
      for (const [id, y] of f.staffContractEndYear) world.staffContractEndYear.set(id, y);
      world.nextIds.person = f.nextIds.person;
      world.nextIds.job = f.nextIds.job;
      for (const teamId of founded) {
        ctx.emit({
          type: TEAM_FOUNDED, date: world.date, witnesses: { kind: 'public' }, tier: 3,
          subjects: [{ kind: 'team', id: teamId }], payload: { season: year },
        });
      }
    }
    let folded = 0;
    for (const s of [...world.teamSpans.values()].sort((a, b) => a.teamId - b.teamId)) {
      if (s.folded !== year || !world.rosters.has(s.teamId)) continue;
      const players = world.rosters.get(s.teamId) ?? [];
      const pool = (name: string): number[] => { const p = world.pools.get(name) ?? []; world.pools.set(name, p); return p; };
      pool(b.playerPool ?? 'free_agents').push(...players);
      world.rosters.delete(s.teamId);
      for (const j of [...world.jobs.values()].sort((x, y) => x.id - y.id)) {
        if (j.teamId !== s.teamId) continue;
        if (j.holderPersonId !== null) pool(b.staffPool ?? 'coach_pool').push(j.holderPersonId);
        world.jobs.delete(j.id);
      }
      ctx.emit({
        type: TEAM_FOLDED, date: world.date, witnesses: { kind: 'public' }, tier: 3,
        subjects: [{ kind: 'team', id: s.teamId }], payload: { season: year, players: players.length },
      });
      folded++;
    }
    return { founded: founded.length, folded };
  };
}
