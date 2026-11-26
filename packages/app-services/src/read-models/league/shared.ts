// Shared lookups for the league pages: team names, people names, groups and games, all read from the
// observed world (G-27). A missing row shows as `#id`, so a gap is visible rather than invented (O6.6.1).
import type { ObservedWorld, WorldTableName } from '../../observer/index.ts';
import type { DateLike, ScheduleGame, TeamRef, WLT } from './types.ts';

export type Row = Record<string, unknown>;
export type Params = Readonly<Record<string, string | number | boolean | null>>;

export const rows = (world: ObservedWorld, table: WorldTableName): readonly Row[] => world.table(table) as readonly Row[];
export const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
export const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
export const asDate = (d: unknown): DateLike | null =>
  d && typeof (d as DateLike).seasonYear === 'number' && typeof (d as DateLike).dayIndex === 'number'
    ? { seasonYear: (d as DateLike).seasonYear, dayIndex: (d as DateLike).dayIndex } : null;
/** Code-unit order, the same on every platform (no locale, P1.1.1). */
export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const cmpDate = (a: DateLike, b: DateLike): number => a.seasonYear - b.seasonYear || a.dayIndex - b.dayIndex;
export const params = (v: unknown): Params => {
  const out: Record<string, string | number | boolean | null> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Row)) if (x === null || ['string', 'number', 'boolean'].includes(typeof x)) out[k] = x as string | number | boolean | null;
  return out;
};

export const EMPTY_WLT: WLT = { w: 0, l: 0, t: 0 };
export const addResult = (r: WLT, res: 'W' | 'L' | 'T'): WLT => ({ w: r.w + (res === 'W' ? 1 : 0), l: r.l + (res === 'L' ? 1 : 0), t: r.t + (res === 'T' ? 1 : 0) });

/** Team refs by id string, for every team the viewer can see. */
export function teamRefs(world: ObservedWorld, competitionId: number | null = null): Record<string, TeamRef> {
  const out: Record<string, TeamRef> = {};
  for (const t of rows(world, 'teams')) {
    const id = num(t.id);
    if (id === null || (competitionId !== null && t.competitionId !== competitionId)) continue;
    const ident = (t.identity ?? {}) as { name?: string; abbreviation?: string };
    out[String(id)] = { teamId: id, name: ident.name ?? `#${id}`, abbreviation: ident.abbreviation ?? `#${id}` };
  }
  return out;
}

/** Add any team a page mentions that is outside the competition (a non-conference opponent, a bowl foe). */
export function withTeams(world: ObservedWorld, base: Record<string, TeamRef>, mentioned: Iterable<number>): Record<string, TeamRef> {
  const all = teamRefs(world);
  const out = { ...base };
  for (const id of mentioned) if (!out[String(id)]) out[String(id)] = all[String(id)] ?? { teamId: id, name: `#${id}`, abbreviation: `#${id}` };
  return out;
}

/** People's shown names by id string. */
export function peopleNames(world: ObservedWorld, wanted: Iterable<number>): Record<string, string> {
  const want = new Set(wanted);
  const out: Record<string, string> = {};
  for (const p of rows(world, 'people')) {
    const id = num(p.id);
    if (id === null || !want.has(id)) continue;
    const n = p.name as { first?: string; last?: string; suffix?: string | null } | undefined;
    out[String(id)] = n?.last ? [n.first, n.last, n.suffix].filter(Boolean).join(' ') : `#${id}`;
  }
  for (const id of want) if (!out[String(id)]) out[String(id)] = `#${id}`;
  return out;
}

export interface Group { id: number; name: string; kind: 'division' | 'conference'; parentId: number | null; teamIds: number[] }

/** Conferences and divisions of one competition (C1.1.1, T1). */
export function groupsOf(world: ObservedWorld, competitionId: number): Group[] {
  return rows(world, 'conferences')
    .filter((c) => c.competitionId === competitionId && typeof c.id === 'number')
    .map((c) => ({ id: c.id as number, name: str(c.name) ?? `#${c.id}`, kind: c.kind === 'division' ? 'division' as const : 'conference' as const, parentId: num(c.parentId), teamIds: ids(c.teamIds) }))
    .sort((a, b) => a.id - b.id);
}

/** The conference id of each team (the division's parent when the team sits in a division). */
export function conferenceOf(groups: readonly Group[]): Map<number, number> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = new Map<number, number>();
  for (const g of groups) for (const t of g.teamIds) out.set(t, g.kind === 'division' && g.parentId !== null && byId.has(g.parentId) ? g.parentId : g.id);
  return out;
}

const STATUSES = ['scheduled', 'in_progress', 'final', 'postponed', 'cancelled'] as const;
const PHASES = ['preseason', 'regular', 'postseason'] as const;

/** Games of one competition season, as the schedule draws them. */
export function seasonGames(world: ObservedWorld, competitionId: number, seasonYear: number): ScheduleGame[] {
  const venues = new Map(rows(world, 'venues').map((v) => [v.id, str(v.name)]));
  const conf = conferenceOf(groupsOf(world, competitionId));
  const out: ScheduleGame[] = [];
  for (const g of rows(world, 'games')) {
    if (g.competitionId !== competitionId || g.seasonYear !== seasonYear) continue;
    const id = num(g.id), week = num(g.week), kickoff = asDate(g.kickoff);
    const t = ids(g.teamIds);
    if (id === null || week === null || !kickoff || t.length !== 2) continue;
    const status = (STATUSES as readonly string[]).includes(String(g.status)) ? g.status as ScheduleGame['status'] : 'scheduled';
    const phase = (PHASES as readonly string[]).includes(String(g.phase)) ? g.phase as ScheduleGame['phase'] : 'regular';
    const fs = ids(g.finalScore);
    const c0 = conf.get(t[0]!), c1 = conf.get(t[1]!);
    out.push({
      gameId: id, week, phase, kickoff, teamIds: [t[0]!, t[1]!], venueName: venues.get(g.venueId) ?? null, neutralSite: g.neutralSite === true,
      status, score: status === 'final' && fs.length === 2 ? [fs[0]!, fs[1]!] : null, conferenceGame: c0 !== undefined && c0 === c1,
    });
  }
  return out.sort((a, b) => a.week - b.week || cmpDate(a.kickoff, b.kickoff) || a.gameId - b.gameId);
}

/** W, L or T for one side of a final game. */
export function resultFor(g: ScheduleGame, teamId: number): 'W' | 'L' | 'T' | null {
  if (!g.score) return null;
  if (g.teamIds[0] !== teamId && g.teamIds[1] !== teamId) return null;
  const home = g.teamIds[0] === teamId;
  const mine = home ? g.score[0] : g.score[1], theirs = home ? g.score[1] : g.score[0];
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
}

/** Regular-season record of every team from final games seen. */
export function recordsFrom(games: readonly ScheduleGame[]): Map<number, WLT> {
  const out = new Map<number, WLT>();
  for (const g of games) {
    if (g.phase !== 'regular' || !g.score) continue;
    for (const t of g.teamIds) {
      const r = resultFor(g, t);
      if (r) out.set(t, addResult(out.get(t) ?? EMPTY_WLT, r));
    }
  }
  return out;
}

/** Ids of the types in an event family (X2.1.2), from the eventTypes table. */
export function typesOfFamily(world: ObservedWorld, family: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of rows(world, 'eventTypes')) if (t.family === family && typeof t.id === 'string') out.set(t.id, str(t.lineTemplate) ?? `line.${t.id}`);
  return out;
}

/** Person and team ids an event names (actors and subjects). */
export function eventPeople(e: Row): number[] {
  const out = new Set<number>();
  for (const a of (Array.isArray(e.actors) ? e.actors : []) as Row[]) if (typeof a.personId === 'number') out.add(a.personId);
  for (const s of (Array.isArray(e.subjects) ? e.subjects : []) as Row[]) if (s.kind === 'person' && typeof s.id === 'number') out.add(s.id);
  return [...out];
}

export function eventTeams(e: Row): number[] {
  const out = new Set<number>();
  const where = e.where as { teamId?: unknown } | undefined;
  if (typeof where?.teamId === 'number') out.add(where.teamId);
  for (const s of (Array.isArray(e.subjects) ? e.subjects : []) as Row[]) if (s.kind === 'team' && typeof s.id === 'number') out.add(s.id);
  return [...out];
}
