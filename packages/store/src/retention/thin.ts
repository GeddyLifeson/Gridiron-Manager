// Thinning a world at the season archive step (P5.4.1, P5.4.2 stages 4 and 5). A pure function of the
// world and a context: it never edits its input, gives the same result on every platform, and running
// it a second time on its own output changes nothing (P5.4.2: "the step is idempotent").
//
// The store holds no football (P1.2.1). What it needs to know about the career (which games were the
// user's, which plays are bookmarked, who is linked to the user) the application layer hands in. The
// world is read through the table names of the world contract (`WORLD_TABLES`): each table is a
// top-level array field of the state, as the save core lays it out.
import { inWindow, type RetentionPolicy } from './params.ts';

type Row = Record<string, unknown>;
/** Any world object whose tables are top-level fields. */
export type WorldLike = object;

/** Table names the thinning reads. Defaults are the world contract's names; `gameInputs` is not in the contract yet. */
export interface RetentionTables {
  games: string;
  /** Tables of per-play rows keyed by `gameId`: kept for as long as play rows are. */
  playRows: readonly string[];
  trajectories: string;
  /** Game input blobs (P5.4.1), one row per game with `gameId`. Contract request: not yet in WORLD_TABLES. */
  gameInputs: string;
  people: string;
  prospects: string;
  /** Tables whose rows belong to one person through `personId`; a dropped person's rows go with him. */
  personOwned: readonly string[];
}

export const DEFAULT_TABLES: RetentionTables = {
  games: 'games',
  playRows: ['plays', 'drives', 'playGrades', 'decisionGrades'],
  trajectories: 'trajectories',
  gameInputs: 'gameInputs',
  people: 'people',
  prospects: 'prospects',
  personOwned: ['personViews', 'personStates', 'knowledge', 'prospects'],
};

/** What the career knows about one person, for P5.4.1's people rule. Computed by the application layer. */
export interface PersonFacts {
  /** Still in football: on a roster, on a staff, in school, a prospect in a live class. */
  active: boolean;
  /** Played or coached professionally. */
  playedOrCoachedPro: boolean;
  /** Coached at any level. */
  coachedAnyLevel: boolean;
  /** Holds an honour (award, record, hall of fame). */
  honours: boolean;
  /** Linked to the user (played for, coached with, recruited by, related to). */
  linkedToUser: boolean;
  /** Already reduced to a stub. */
  isStub: boolean;
  /** A prospect who was never signed and whose class cycle has ended. */
  unsignedProspectCycleOver: boolean;
}

export type PersonOutcome = 'keep' | 'stub' | 'drop';

/** P5.4.1 people row: active people in full; leavers in full if pro, coach, honoured or linked; others a stub. */
export function decidePerson(f: PersonFacts, policy: RetentionPolicy): PersonOutcome {
  if (f.isStub) return 'keep';
  if (policy.dropUnsignedProspects && f.unsignedProspectCycleOver && !f.linkedToUser) return 'drop';
  if (f.active || f.playedOrCoachedPro || f.coachedAnyLevel || f.honours || f.linkedToUser) return 'keep';
  return policy.stubMinorPeople ? 'stub' : 'keep';
}

export interface ThinContext {
  policy: RetentionPolicy;
  /** The season the new league year opens. Windows count back from it: "current and previous". */
  currentSeason: number;
  /** Games of the user's teams, in any season (P5.4.1 "the user's teams' games"). */
  userGameIds: ReadonlySet<number>;
  /** Bookmarked plays as `gameId:playIndex`. */
  bookmarkedPlays?: ReadonlySet<string>;
  /** Games the user marked to keep. */
  markedGameIds?: ReadonlySet<number>;
  /** Facts for the people rule. Without it, people are left as they are. */
  personFacts?: (person: Row) => PersonFacts;
  /** The stub of a person. Without it, people who would be stubbed are kept in full and counted. */
  toStub?: (person: Row) => Row;
  tables?: Partial<RetentionTables>;
}

export interface FilmDrop { gameId: number; playIndex: number }

export interface ThinReport {
  /** Rows removed per table. */
  removed: Record<string, number>;
  /** Stored trajectory buffers whose bytes the caller deletes outside the world tables. */
  filmToDelete: FilmDrop[];
  /** Trajectory pointers whose state changed. */
  filmChanged: number;
  stubbed: number[];
  dropped: number[];
  /** People who met the stub rule but stayed whole, because no stub function was given. */
  stubSkipped: number;
  /** Rows that point at a game the world does not hold; kept, and listed here. */
  orphanRows: number;
}

const rowsOf = (w: WorldLike, t: string): Row[] | null => {
  const v = (w as Record<string, unknown>)[t];
  return Array.isArray(v) ? (v as Row[]) : null;
};
const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);

/**
 * Applies the retention policy to a world at the archive step and returns the thinned world. Tables
 * the world does not hold are skipped. Nothing outside the named tables changes; game results, box
 * scores, standings, awards and summary tables are kept forever (P5.4.1).
 */
export function thinWorld<W extends WorldLike>(world: W, ctx: ThinContext): { world: W; report: ThinReport } {
  const t: RetentionTables = { ...DEFAULT_TABLES, ...ctx.tables };
  const p = ctx.policy;
  const cur = ctx.currentSeason;
  const report: ThinReport = { removed: {}, filmToDelete: [], filmChanged: 0, stubbed: [], dropped: [], stubSkipped: 0, orphanRows: 0 };
  const out: Record<string, unknown> = { ...(world as Record<string, unknown>) };
  const put = (table: string, before: Row[], after: Row[]) => {
    if (after.length !== before.length) report.removed[table] = (report.removed[table] ?? 0) + before.length - after.length;
    if (after.length !== before.length || after.some((r, i) => r !== before[i])) out[table] = after;
  };

  // Game index: season and phase of every game.
  const games = new Map<number, { season: number; postseason: boolean }>();
  for (const g of rowsOf(world, t.games) ?? []) games.set(num(g.id), { season: num(g.seasonYear), postseason: g.phase === 'postseason' });
  const isUser = (id: number) => ctx.userGameIds.has(id);
  const keepPlays = (id: number): boolean | null => {
    const g = games.get(id);
    if (!g) return null;
    return inWindow(isUser(id) ? p.playRowsUserGames : p.playRowsAllGames, g.season, cur);
  };
  const keepInput = (id: number): boolean => {
    const g = games.get(id);
    return g ? inWindow(p.gameInputs, g.season, cur) : true;
  };

  for (const table of t.playRows) {
    const rows = rowsOf(world, table);
    if (!rows) continue;
    put(table, rows, rows.filter((r) => {
      const k = keepPlays(num(r.gameId));
      if (k === null) { report.orphanRows++; return true; }
      return k;
    }));
  }

  const inputs = rowsOf(world, t.gameInputs);
  if (inputs) put(t.gameInputs, inputs, inputs.filter((r) => keepInput(num(r.gameId))));

  const film = rowsOf(world, t.trajectories);
  if (film) {
    const after: Row[] = [];
    for (const r of film) {
      const gameId = num(r.gameId);
      const playIndex = num(r.playIndex);
      const g = games.get(gameId);
      if (!g) { report.orphanRows++; after.push(r); continue; }
      if (keepPlays(gameId) === false) {
        if (r.state === 'stored') report.filmToDelete.push({ gameId, playIndex });
        continue;
      }
      let keepStored = true;
      if (isUser(gameId)) {
        if (!inWindow(p.userFilm, g.season, cur)) {
          const marked = g.postseason || (ctx.markedGameIds?.has(gameId) ?? false) || (ctx.bookmarkedPlays?.has(`${gameId}:${playIndex}`) ?? false);
          keepStored = p.keepMarkedFilm && marked;
        }
      } else {
        keepStored = false; // P5.4.1: other games' trajectories are not stored, they are regenerated.
      }
      const next = keepStored && r.state === 'stored' ? 'stored' : keepInput(gameId) ? 'regenerable' : 'dropped';
      if (next === r.state || (r.state === 'dropped' && next === 'regenerable')) { after.push(r); continue; }
      if (r.state === 'stored') report.filmToDelete.push({ gameId, playIndex });
      report.filmChanged++;
      after.push({ ...r, state: next, byteLength: next === 'stored' ? r.byteLength : 0 });
    }
    put(t.trajectories, film, after);
  }

  const people = rowsOf(world, t.people);
  const dropped = new Set<number>();
  const linked = new Set<number>();
  if (people && ctx.personFacts) {
    const after: Row[] = [];
    for (const person of people) {
      const facts = ctx.personFacts(person);
      const outcome = decidePerson(facts, p);
      const id = num(person.id);
      if (facts.linkedToUser) linked.add(id);
      if (outcome === 'drop') { dropped.add(id); report.dropped.push(id); continue; }
      if (outcome === 'stub') {
        if (!ctx.toStub) { report.stubSkipped++; after.push(person); continue; }
        report.stubbed.push(id);
        after.push(ctx.toStub(person));
        continue;
      }
      after.push(person);
    }
    put(t.people, people, after);
  }

  // A dropped person's own rows go with him.
  if (dropped.size) {
    for (const table of t.personOwned) {
      const rows = rowsOf(out, table);
      if (rows) put(table, rows, rows.filter((r) => !dropped.has(num(r.personId))));
    }
  }

  // Prospect rows of a closed class with no commitment (P5.4.1 "prospects never signed").
  const prospects = rowsOf(out, t.prospects);
  if (prospects && p.dropUnsignedProspects) {
    put(t.prospects, prospects, prospects.filter((r) => !(num(r.classYear) < cur && r.committedTeamId === null && !linked.has(num(r.personId)))));
  }

  return { world: out as W, report };
}
