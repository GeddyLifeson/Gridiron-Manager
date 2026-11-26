// A small stand-in league for the retention tests: games, play rows, drives, game inputs, film
// pointers, people, prospects and season summaries, laid out under the world contract's table names.
// It holds no football beyond counting yards; the close command does what P5.4.2 stages 1 to 5 ask.
import type { CommandEnvelope, SaveHeader } from '@gm/schema';
import { CHAIN_GENESIS, bytesHash, chainNext, stateHash } from '@gm/engine-core';
import type { SqlDriver } from '../../src/driver.ts';
import { SaveFile } from '../../src/save/save-file.ts';
import type { ApplyResult, CommandInput, NewSaveHeader, SaveCoreDeps } from '../../src/save/types.ts';
import { retentionPolicy, type RetentionProfile } from '../../src/retention/params.ts';
import { thinWorld, type PersonFacts } from '../../src/retention/thin.ts';
import { CLOSE_SEASON_COMMAND, type CloseSeasonPayload } from '../../src/retention/archive.ts';

export interface Game { id: number; seasonYear: number; phase: 'regular' | 'postseason'; teamIds: [number, number] }
export interface Play { gameId: number; index: number; carrierId: number; yards: number; pad: string }
export interface Person { id: number; name: string; teamId: number | null; pro: boolean; coach: boolean; honours: boolean; linked: boolean; stub?: true; leftYear?: number }
export interface LeagueWorld {
  calendar: { seasonYear: number; dayIndex: number };
  nextGameId: number;
  games: Game[];
  plays: Play[];
  drives: { gameId: number; drive: { driveNumber: number; plays: number } }[];
  gameInputs: { gameId: number; seedHex: string; slice: string }[];
  trajectories: { gameId: number; playIndex: number; formatVersion: number; state: 'stored' | 'regenerable' | 'dropped'; byteLength: number }[];
  people: Person[];
  prospects: { personId: number; kind: 'draft'; classYear: number; publicRating: null; committedTeamId: number | null; teams: never[] }[];
  /** Derived per-season yards, kept current as games are played (what stage 1 verifies). */
  derived: { personId: number; seasonYear: number; yards: number }[];
  seasonSummaries: { personId: number; teamId: number; seasonYear: number; yards: number }[];
  careerTotals: { personId: number; yards: number }[];
}

export const USER_TEAM = 1;
export const TEAMS = 8;
export const VERSIONS = { engineVersion: 'retention-test-engine', parameterSetVersion: 'retention-test-params' };

export interface LeagueShape { gamesPerSeason: number; playsPerGame: number; padBytes: number }
export const SMALL: LeagueShape = { gamesPerSeason: 8, playsPerGame: 12, padBytes: 20 };

export function leagueWorld(): LeagueWorld {
  const people: Person[] = [];
  for (let t = 1; t <= TEAMS; t++) for (let i = 0; i < 3; i++) people.push({ id: t * 100 + i, name: `T${t}P${i}`, teamId: t, pro: i === 0, coach: false, honours: false, linked: t === USER_TEAM });
  return {
    calendar: { seasonYear: 2026, dayIndex: 0 }, nextGameId: 1, games: [], plays: [], drives: [], gameInputs: [], trajectories: [], people,
    prospects: [], derived: [], seasonSummaries: [], careerTotals: [],
  };
}

const lcg = (x: number) => (Math.imul(x, 1103515245) + 12345) >>> 0;

/** The user's games: every game the user team played. */
export const userGameIds = (w: LeagueWorld) => new Set(w.games.filter((g) => g.teamIds.includes(USER_TEAM)).map((g) => g.id));

/** People facts as the career would compute them. Prospects (ids from 10,000) belong to the class of id - 10,000. */
export const factsAt = (currentSeason: number) => (p: Record<string, unknown>): PersonFacts => {
  const x = p as unknown as Person;
  const classYear = x.id >= 10_000 ? x.id - 10_000 : null;
  return {
    active: x.teamId !== null || (classYear !== null && classYear >= currentSeason), playedOrCoachedPro: x.pro, coachedAnyLevel: x.coach, honours: x.honours, linkedToUser: x.linked,
    isStub: x.stub === true, unsignedProspectCycleOver: classYear !== null && classYear < currentSeason,
  };
};
export const toStub = (p: Record<string, unknown>) => ({ id: p.id, name: p.name, teamId: null, pro: false, coach: false, honours: false, linked: false, stub: true as const });

function playSeason(w: LeagueWorld, shape: LeagueShape, postseason: boolean): ApplyResult<LeagueWorld> {
  const y = w.calendar.seasonYear;
  const games = [...w.games];
  const plays = [...w.plays];
  const drives = [...w.drives];
  const inputs = [...w.gameInputs];
  const film = [...w.trajectories];
  const derived = new Map(w.derived.map((d) => [`${d.personId}:${d.seasonYear}`, d]));
  let id = w.nextGameId;
  let r = (y * 7919) >>> 0;
  const n = shape.gamesPerSeason + (postseason ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = 1 + (i % TEAMS);
    const b = 1 + ((i + 1 + Math.floor(i / TEAMS)) % TEAMS);
    const g: Game = { id, seasonYear: y, phase: i >= shape.gamesPerSeason ? 'postseason' : 'regular', teamIds: [a, b === a ? 1 + (a % TEAMS) : b] };
    games.push(g);
    inputs.push({ gameId: id, seedHex: (r >>> 0).toString(16).padStart(16, '0'), slice: 'x'.repeat(shape.padBytes) });
    const user = g.teamIds.includes(USER_TEAM);
    for (let k = 1; k <= shape.playsPerGame; k++) {
      r = lcg(r);
      const team = g.teamIds[k % 2]!;
      const carrierId = team * 100 + (r % 3);
      const yards = (r >>> 8) % 15 - 3;
      plays.push({ gameId: id, index: k, carrierId, yards, pad: 'p'.repeat(shape.padBytes) });
      film.push({ gameId: id, playIndex: k, formatVersion: 1, state: user ? 'stored' : 'regenerable', byteLength: user ? 11_200 : 0 });
      const key = `${carrierId}:${y}`;
      const d = derived.get(key);
      derived.set(key, { personId: carrierId, seasonYear: y, yards: (d?.yards ?? 0) + yards });
    }
    drives.push({ gameId: id, drive: { driveNumber: 1, plays: shape.playsPerGame } });
    id++;
  }
  // One player of a non-user team retires each season (stub candidate) and one draft prospect arrives.
  const leaver = 100 * (2 + (y % (TEAMS - 1))) + 2;
  const people = w.people.map((p) => (p.id === leaver && p.teamId !== null ? { ...p, teamId: null, leftYear: y } : p));
  const pid = 10_000 + y;
  people.push({ id: pid, name: `Prospect${y}`, teamId: null, pro: false, coach: false, honours: false, linked: false });
  const prospects = [...w.prospects, { personId: pid, kind: 'draft' as const, classYear: y, publicRating: null, committedTeamId: null, teams: [] }];
  return {
    ok: true,
    state: { ...w, nextGameId: id, games, plays, drives, gameInputs: inputs, trajectories: film, people, prospects, derived: [...derived.values()], calendar: { ...w.calendar, dayIndex: 300 } },
    events: [{ type: 'season_played', seasonYear: y, games: n }],
  };
}

/** Stage 1 to 5 of P5.4.2, as the application's apply would run them. */
export function closeSeason(w: LeagueWorld, p: CloseSeasonPayload): ApplyResult<LeagueWorld> {
  const y = p.seasonYear;
  if (y !== w.calendar.seasonYear) return { ok: false, reason: `season ${y} is not the open season`, code: 'wrong_season' };
  // (1) verify derived statistics against play rows.
  const seasonGames = new Set(w.games.filter((g) => g.seasonYear === y).map((g) => g.id));
  const fromPlays = new Map<number, number>();
  for (const pl of w.plays) if (seasonGames.has(pl.gameId)) fromPlays.set(pl.carrierId, (fromPlays.get(pl.carrierId) ?? 0) + pl.yards);
  for (const d of w.derived.filter((x) => x.seasonYear === y)) {
    if ((fromPlays.get(d.personId) ?? 0) !== d.yards) return { ok: false, reason: `derived yards of ${d.personId} differ from the play rows`, code: 'stats_mismatch' };
  }
  // (2) season summaries, (3) career totals.
  const teamOf = new Map(w.people.map((x) => [x.id, x.teamId ?? 0]));
  const summaries = [...fromPlays.entries()].sort((a, b) => a[0] - b[0]).map(([personId, yards]) => ({ personId, teamId: teamOf.get(personId) ?? 0, seasonYear: y, yards }));
  const totals = new Map(w.careerTotals.map((c) => [c.personId, c.yards]));
  for (const s of summaries) totals.set(s.personId, (totals.get(s.personId) ?? 0) + s.yards);
  const next: LeagueWorld = {
    ...w,
    seasonSummaries: [...w.seasonSummaries, ...summaries],
    careerTotals: [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([personId, yards]) => ({ personId, yards })),
    derived: w.derived.filter((d) => d.seasonYear !== y),
    calendar: { seasonYear: y + 1, dayIndex: 0 },
  };
  // (4) people retention and (5) rows past retention.
  const { world, report } = thinWorld(next, {
    policy: retentionPolicy(p.profile), currentSeason: y + 1, userGameIds: userGameIds(next),
    bookmarkedPlays: new Set(p.bookmarks as string[] | undefined), personFacts: factsAt(y + 1), toStub,
  });
  return { ok: true, state: world, events: [{ type: 'season_closed', seasonYear: y, removed: report.removed, filmToDelete: report.filmToDelete.length, stubbed: report.stubbed }] };
}

export function leagueDeps(shape: LeagueShape = SMALL): SaveCoreDeps<LeagueWorld> {
  const text = new TextEncoder();
  return {
    apply(w: LeagueWorld, cmd: CommandEnvelope): ApplyResult<LeagueWorld> {
      const p = (cmd.payload ?? {}) as Record<string, unknown>;
      if (cmd.type === 'league.PlaySeason') return playSeason(w, shape, p.postseason === true);
      if (cmd.type === 'league.CorruptStats') return { ok: true, state: { ...w, derived: w.derived.map((d, i) => (i === 0 ? { ...d, yards: d.yards + 1 } : d)) }, events: [] };
      if (cmd.type === CLOSE_SEASON_COMMAND) return closeSeason(w, p as CloseSeasonPayload);
      return { ok: false, reason: `unknown command ${cmd.type}`, code: 'unknown_command' };
    },
    describe: (w): Partial<SaveHeader> => ({ calendar: w.calendar, summary: `${w.games.length} games` }),
    stateHash, bytesHash,
    eventsHash: (e) => bytesHash(text.encode(JSON.stringify(e))),
    chainNext, genesis: CHAIN_GENESIS,
  };
}

export function leagueHeader(profile: RetentionProfile): NewSaveHeader {
  return {
    ...VERSIONS, masterSeed: '00000000000000e3', generatorOptions: {}, contentManifest: [], ruleSets: [],
    settings: { worldSize: 'small', retentionProfile: profile }, certified: false,
    calendar: { seasonYear: 2026, dayIndex: 0 }, userPersonId: null, userJob: null, summary: '', createdWith: 'retention-test', lastWrittenWith: 'retention-test',
  };
}

export async function leagueSave(driver: SqlDriver, profile: RetentionProfile = 'standard', shape: LeagueShape = SMALL): Promise<SaveFile<LeagueWorld>> {
  return SaveFile.create(driver, leagueDeps(shape), { header: leagueHeader(profile), state: leagueWorld(), versions: VERSIONS });
}

export const cmd = (save: SaveFile<LeagueWorld>, type: string, payload: unknown): CommandInput =>
  ({ type, payload, actor: { personId: null, job: 'system' }, worldTime: save.state().calendar, schemaVersion: 1 });

export const closeCmd = (save: SaveFile<LeagueWorld>, profile: RetentionProfile, extra: Record<string, unknown> = {}): CommandInput =>
  cmd(save, CLOSE_SEASON_COMMAND, { seasonYear: save.state().calendar.seasonYear, profile, ...extra });
