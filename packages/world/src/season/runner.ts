// The season runner (G-87; R1.2.7 gate item 1). One step is one league week of the regular season or
// one round of the postseason. Inside a step: every team with business that week prepares in team-id
// order (K3.6.1 rule 1; the head coach seat runs its own week, H1.1.3), then the games are played in
// game-id order, then the results join the standings input. The postseason plan then says what is left.
import { chainHash, gameSeedHex, tieDraw, uniformFor } from './seeds.ts';
import {
  SeasonInvariantError,
  type Fixture, type GameContext, type GameOutcome, type GameResult, type PlayedGame, type PostContext,
  type PrepContext, type SeasonPorts, type SeasonSpec, type SeasonState, type SeatWeekRecord, type TeamId,
} from './types.ts';

const SEED_RE = /^[0-9a-f]{16}$/;

/** Everything wrong with a spec, in words. An empty list means the season can start. */
export function seasonProblems(spec: SeasonSpec): string[] {
  const out: string[] = [];
  if (!SEED_RE.test(spec.seedHex)) out.push(`seed ${spec.seedHex}: need 16 lower-case hex digits`);
  const ids = new Set(spec.teams.map((t) => t.id));
  if (ids.size !== spec.teams.length) out.push('two teams share an id');
  if (spec.seatTeamId !== null && !ids.has(spec.seatTeamId)) out.push(`seat team ${spec.seatTeamId} is not in the competition`);
  const gameIds = new Set<number>();
  const busy = new Set<string>();
  for (const f of spec.fixtures) {
    if (gameIds.has(f.gameId)) out.push(`game ${f.gameId}: id used twice`);
    gameIds.add(f.gameId);
    if (f.phase !== 'regular') out.push(`game ${f.gameId}: the fixture list holds regular-season games only`);
    if (!Number.isInteger(f.week) || f.week < 0) out.push(`game ${f.gameId}: week ${f.week}`);
    if (f.home === f.away) out.push(`game ${f.gameId}: a team plays itself`);
    for (const t of [f.home, f.away]) {
      // An opponent outside the competition (a lower-subdivision guest, T3.1.1) is allowed; it has no row.
      const k = `${f.week}:${t}`;
      if (busy.has(k)) out.push(`game ${f.gameId}: team ${t} plays twice in week ${f.week}`);
      busy.add(k);
    }
    if (!ids.has(f.home) && !ids.has(f.away)) out.push(`game ${f.gameId}: neither team is in the competition`);
  }
  for (const k of spec.postseason.ruleKeys) if (spec.leagueRules[k] === undefined) out.push(`league rule ${k} is missing (postseason plan ${spec.postseason.id})`);
  return out;
}

export function createSeason(spec: SeasonSpec): SeasonState {
  const problems = seasonProblems(spec);
  if (problems.length) throw new SeasonInvariantError(`season ${spec.season} cannot start: ${problems.join('; ')}`);
  const lastRegularWeek = spec.fixtures.reduce((m, f) => Math.max(m, f.week), 0);
  // The first week is the schedule's own: a competition may open a week early (the college week 0, T3.2).
  const firstWeek = spec.fixtures.reduce((m, f) => Math.min(m, f.week), lastRegularWeek);
  return {
    stage: 'regular', week: firstWeek, lastRegularWeek, round: 0, games: [], results: [], post: null, champion: null,
    seat: [], preparations: 0, chain: chainHash('', { season: spec.season, seed: spec.seedHex, ruleSetId: spec.ruleSetId }),
  };
}

function postContext(spec: SeasonSpec, results: readonly GameResult[]): PostContext {
  return {
    season: spec.season, teams: spec.teams, results, rules: spec.leagueRules,
    draw: tieDraw(spec.seedHex, spec.season), uniform: uniformFor(spec.seedHex, spec.season),
  };
}

function toResult(f: Fixture, o: GameOutcome): GameResult {
  return {
    gameId: f.gameId, week: f.week, phase: f.phase, teams: [f.home, f.away], points: [o.points[0], o.points[1]],
    touchdowns: [o.touchdowns[0], o.touchdowns[1]], overtime: o.overtime, forfeit: false, neutralSite: f.neutralSite,
  };
}

interface WeekOutput { games: PlayedGame[]; results: GameResult[]; seat: SeatWeekRecord[]; preparations: number; chain: string }

/** Prepares the teams and plays the fixtures of one step. `prepTeams` adds teams with no game (the seat's bye). */
function playFixtures(spec: SeasonSpec, state: SeasonState, ports: SeasonPorts, week: number, fixtures: readonly Fixture[]): WeekOutput {
  const members = new Set(spec.teams.map((t) => t.id));
  const fixtureOf = new Map<TeamId, Fixture>();
  for (const f of fixtures) { fixtureOf.set(f.home, f); fixtureOf.set(f.away, f); }
  const preparing = new Set<TeamId>([...fixtureOf.keys()].filter((t) => members.has(t)));
  if (spec.seatTeamId !== null && ports.seatWeek) preparing.add(spec.seatTeamId);

  const prepared = new Map<TeamId, unknown>();
  const seat: SeatWeekRecord[] = [];
  let preparations = 0;
  for (const teamId of [...preparing].sort((a, b) => a - b)) {
    const ctx: PrepContext = { season: spec.season, week, teamId, fixture: fixtureOf.get(teamId) ?? null, results: state.results, seedHex: spec.seedHex };
    if (teamId === spec.seatTeamId && ports.seatWeek) {
      const rec = ports.seatWeek(ctx);
      if (rec.teamId !== teamId || rec.week !== week) throw new SeasonInvariantError(`seat record for team ${rec.teamId} week ${rec.week}, expected team ${teamId} week ${week}`);
      if (ctx.fixture !== null && !rec.reachedGameDay) throw new SeasonInvariantError(`week ${week}: the seat's week ended before game day`);
      seat.push(rec);
      prepared.set(teamId, rec.preparation);
    } else if (ctx.fixture !== null && ports.prepare) {
      prepared.set(teamId, ports.prepare(ctx));
      preparations++;
    }
  }

  const games: PlayedGame[] = [];
  const results: GameResult[] = [];
  let chain = state.chain;
  for (const fixture of [...fixtures].sort((a, b) => a.gameId - b.gameId)) {
    const seedHex = gameSeedHex(spec.seedHex, spec.season, fixture.gameId);
    const seatSide = spec.seatTeamId === null ? null : fixture.home === spec.seatTeamId ? 0 : fixture.away === spec.seatTeamId ? 1 : null;
    const ctx: GameContext = {
      season: spec.season, ruleSetId: spec.ruleSetId, fixture, seedHex, seatSide,
      preparation: [prepared.get(fixture.home) ?? null, prepared.get(fixture.away) ?? null],
    };
    const outcome = ports.playGame(ctx);
    for (const p of [...outcome.points, ...outcome.touchdowns]) {
      if (!Number.isInteger(p) || p < 0) throw new SeasonInvariantError(`game ${fixture.gameId}: bad score ${JSON.stringify(outcome.points)} / ${JSON.stringify(outcome.touchdowns)}`);
    }
    games.push({ fixture, seedHex, outcome });
    results.push(toResult(fixture, outcome));
    chain = chainHash(chain, { gameId: fixture.gameId, points: outcome.points, stateHash: outcome.stateHash });
  }
  return { games, results, seat, preparations, chain };
}

function merge(state: SeasonState, out: WeekOutput): SeasonState {
  return {
    ...state, games: [...state.games, ...out.games], results: [...state.results, ...out.results],
    seat: [...state.seat, ...out.seat], preparations: state.preparations + out.preparations, chain: out.chain,
  };
}

/** Advances a season by one step. A finished season is returned unchanged. */
export function stepSeason(spec: SeasonSpec, state: SeasonState, ports: SeasonPorts): SeasonState {
  if (state.stage === 'final') return state;
  const plan = spec.postseason;

  if (state.stage === 'regular') {
    const week = state.week;
    const next = merge(state, playFixtures(spec, state, ports, week, spec.fixtures.filter((f) => f.week === week)));
    if (week < state.lastRegularWeek) return { ...next, week: week + 1 };
    return { ...next, week: week + 1, stage: 'postseason', post: plan.open(postContext(spec, next.results)) };
  }

  const pending = plan.pending(state.post);
  if (pending.length === 0) {
    const champion = plan.champion(state.post);
    if (champion === null) throw new SeasonInvariantError(`postseason plan ${plan.id} has nothing pending and no champion`);
    return { ...state, stage: 'final', champion, chain: chainHash(state.chain, { champion }) };
  }
  const week = state.lastRegularWeek + state.round + 1;
  let nextId = state.games.reduce((m, g) => Math.max(m, g.fixture.gameId), 0) + 1;
  // Keys are sorted so the game ids of a round never depend on the order the plan listed them.
  const fixtures: Fixture[] = [...pending].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((p) => {
    const home = p.host !== null && p.host === p.teams[1] ? p.teams[1] : p.teams[0];
    const away = home === p.teams[0] ? p.teams[1] : p.teams[0];
    return { gameId: nextId++, week, phase: 'postseason', home, away, neutralSite: p.host === null, conferenceGame: false, dayIndex: null, kickoffMinute: null, postKey: p.key };
  });
  const out = playFixtures(spec, state, ports, week, fixtures);
  let next = merge(state, out);
  let post = state.post;
  const recorded: GameResult[] = [...state.results];
  out.games.forEach((g, i) => {
    const [h, a] = g.outcome.points;
    if (h === a) throw new SeasonInvariantError(`postseason game ${g.fixture.gameId} (${g.fixture.postKey}) ended tied ${h}-${a}; a postseason game must have a winner (C3.4.1 rule 5)`);
    recorded.push(out.results[i]!);
    post = plan.record(post, g.fixture.postKey!, h > a ? g.fixture.home : g.fixture.away, postContext(spec, recorded));
  });
  next = { ...next, post, round: state.round + 1 };
  return next;
}

/** Plays a season from its current state to the final game. `onStep` sees every state on the way. */
export function runSeason(spec: SeasonSpec, ports: SeasonPorts, from: SeasonState = createSeason(spec), onStep?: (s: SeasonState) => void): SeasonState {
  let state = from;
  // Each step plays a week or a round or ends the season, so the bound is generous and never binds a real season.
  const limit = state.lastRegularWeek + spec.teams.length + spec.fixtures.length + 2;
  for (let i = 0; state.stage !== 'final'; i++) {
    if (i > limit) throw new SeasonInvariantError(`season ${spec.season} did not end after ${limit} steps`);
    state = stepSeason(spec, state, ports);
    onStep?.(state);
  }
  return state;
}
