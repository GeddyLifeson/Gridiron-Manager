// X12.1.1: the off-screen loop. One ordered weekly pass over the whole world, and the season-point
// passes. The same code runs live play and the history run (X10.3.1 rule 3): only `source` differs.
// Determinism (J13): every stream is keyed from the world seed by step, season and week; every step's
// id, date, event ids and digest are folded into one chained hash, so order is part of state.
import { deriveSeed, seedToHex, stream } from '@gm/engine-core';
import { history } from '@gm/league';
import type { WorldTier } from '@gm/schema';
import { TITLE_WON } from './events.ts';
import { isActive } from './lifecycle.ts';
import { param } from './params.ts';
import {
  SEASON_POINT_ORDER, WEEKLY_ORDER,
  type GameBatchPort, type GamePort, type GameRequest, type GameResult, type LiveWorld, type SchedulePort, type SeasonSummary, type StepContext, type StepDigest, type StepHandler, type StepId, type WorldSystems,
} from './types.ts';

const FAR_TIER: WorldTier = 3;
const UNBOUND = Symbol('unbound');

/**
 * A step whose owning system is not bound. It does nothing and says so in the pass hash and in
 * `unboundSteps`, so a world never pretends a system ran.
 */
export function unbound(reason: string): StepHandler {
  const h: StepHandler = () => ({ unbound: reason });
  (h as unknown as Record<symbol, string>)[UNBOUND] = reason;
  return h;
}

export function unboundSteps(systems: WorldSystems): { step: StepId; reason: string }[] {
  return ([...WEEKLY_ORDER, ...SEASON_POINT_ORDER] as StepId[])
    .map((step) => ({ step, reason: (systems[step] as unknown as Record<symbol, string | undefined>)[UNBOUND] }))
    .filter((x): x is { step: StepId; reason: string } => x.reason !== undefined);
}

/** A full systems table from the handlers given; every other step is `unbound` with the named reason. */
export function systemsFrom(bound: Partial<WorldSystems>, reason = 'owning system not bound yet'): WorldSystems {
  const out = {} as Record<StepId, StepHandler>;
  for (const step of [...WEEKLY_ORDER, ...SEASON_POINT_ORDER] as StepId[]) out[step] = bound[step] ?? unbound(reason);
  return out;
}

export interface PassOptions {
  readonly source?: 'sim' | 'history_run';
  /** Test hook for the X12.1.1 acceptance: run the steps in another order to show the hash moves. */
  readonly order?: readonly StepId[];
}

function runSteps(world: LiveWorld, systems: WorldSystems, order: readonly StepId[], opts: PassOptions): void {
  const source = opts.source ?? 'sim';
  // X12.1.1 edge case: a tier change takes effect at the start of a pass, never inside one.
  for (const [teamId, tier] of [...world.pendingTiers].sort((a, b) => a[0] - b[0])) world.tiers.set(teamId, tier);
  world.pendingTiers.clear();
  const tiers = new Map(world.tiers);
  for (const step of order) {
    const firstId = world.log.nextId;
    const ctx: StepContext = {
      world, step, source,
      tierOfTeam: (teamId) => tiers.get(teamId) ?? FAR_TIER,
      open: (name, scope = []) => stream(world.seed, name, [step, world.date.seasonYear, world.week, ...scope]),
      emit: (input) => {
        const r = world.log.emit({ ...input, source });
        if (!r.ok) throw new Error(`step ${step}: event ${input.type} refused (${r.code}): ${r.reason}`);
        return r.event;
      },
      markOutOfFootball: (personId) => { if (!world.outOfFootballSince.has(personId)) world.outOfFootballSince.set(personId, world.date.seasonYear); },
    };
    const digest: StepDigest = systems[step](ctx) ?? {};
    world.passHash = history.chainHash(world.passHash, {
      step, season: world.date.seasonYear, day: world.date.dayIndex, week: world.week, firstId, nextId: world.log.nextId, digest,
    });
  }
  world.passes++;
}

/** One weekly pass, then the calendar moves a week. */
export function runWeek(world: LiveWorld, systems: WorldSystems, opts: PassOptions = {}): void {
  runSteps(world, systems, opts.order ?? WEEKLY_ORDER, opts);
  world.week++;
  world.date = { seasonYear: world.date.seasonYear, dayIndex: world.date.dayIndex + param('week.days') };
}

export function summarizeSeason(world: LiveWorld): SeasonSummary {
  const champions: Record<number, number> = {};
  const records: Record<number, { wins: number; losses: number; ties: number }> = {};
  const line = (id: number) => (records[id] ??= { wins: 0, losses: 0, ties: 0 });
  let points = 0, passPlays = 0, runPlays = 0;
  for (const g of world.results) {
    points += g.homePoints + g.awayPoints; passPlays += g.passPlays; runPlays += g.runPlays;
    if (g.kind === 'regular') {
      const h = line(g.homeTeamId), a = line(g.awayTeamId);
      if (g.homePoints === g.awayPoints) { h.ties++; a.ties++; } else if (g.homePoints > g.awayPoints) { h.wins++; a.losses++; } else { a.wins++; h.losses++; }
    }
    if (g.title && g.homePoints !== g.awayPoints) champions[g.competitionId] = g.homePoints > g.awayPoints ? g.homeTeamId : g.awayTeamId;
  }
  const people = { active: 0, inactive: 0, deceased: 0 };
  for (const s of world.status.values()) people[s]++;
  const pools: Record<string, number> = {};
  for (const [name, ids] of [...world.pools].sort((a, b) => (a[0] < b[0] ? -1 : 1))) pools[name] = ids.length;
  return { seasonYear: world.date.seasonYear, champions, games: world.results.length, points, passPlays, runPlays, pools, people, records };
}

/** Who sat where this season: the head coach and the staff under him, per team. */
export function recordStaffSeason(world: LiveWorld): void {
  const byTeam = new Map<number, { head: number | null; staff: number[] }>();
  for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) {
    const e = byTeam.get(j.teamId) ?? { head: null, staff: [] };
    if (j.holderPersonId !== null) {
      if (j.positionId === 'pos:head_coach') e.head = j.holderPersonId; else e.staff.push(j.holderPersonId);
    }
    byTeam.set(j.teamId, e);
  }
  for (const t of world.teams) {
    if (!isActive(world, t.id)) continue;
    const e = byTeam.get(t.id);
    if (e) world.staffSeasons.push({ seasonYear: world.date.seasonYear, teamId: t.id, headCoachId: e.head, staffIds: e.staff });
    world.rosterSeasons.set(`${world.date.seasonYear}:${t.id}`, [...(world.rosters.get(t.id) ?? [])]);
  }
}

/** The season-point passes, the season's summary, then the calendar turns to the next season. */
export function runSeasonPoint(world: LiveWorld, systems: WorldSystems, opts: PassOptions = {}): SeasonSummary {
  recordStaffSeason(world);
  runSteps(world, systems, opts.order ?? SEASON_POINT_ORDER, opts);
  const summary = summarizeSeason(world);
  world.seasons.push(summary);
  world.passHash = history.chainHash(world.passHash, { seasonClosed: summary.seasonYear, champions: summary.champions, logHashes: world.log.seasonHashes().filter((h) => h.year === summary.seasonYear) });
  world.results = [];
  world.week = 0;
  world.date = { seasonYear: world.date.seasonYear + 1, dayIndex: 0 };
  return summary;
}

/** One whole season: every weekly pass the schedule has, then the season point. Valid at the boundary (X10.3.1 edge case). */
export function runSeason(world: LiveWorld, systems: WorldSystems, schedule: SchedulePort, opts: PassOptions = {}): SeasonSummary {
  const weeks = schedule.weeksInSeason(world);
  while (world.week < weeks) runWeek(world, systems, opts);
  return runSeasonPoint(world, systems, opts);
}

/**
 * Step 1, games by tier (X13.1.2). Every scheduled game of the week goes to the game port, in game id
 * order, with its own derived seed. The port is the real engine; this file has no other way to make a score.
 */
export function gamesStep(schedule: SchedulePort, play: GamePort): StepHandler {
  return gamesStepBatch(schedule, batchOf(play));
}

/** A batch port that plays the games one after another through a one-game port. */
export function batchOf(play: GamePort): GameBatchPort {
  return (reqs) => reqs.map((r) => play(r));
}

/**
 * Step 1 with a batch port (G-97): the week's requests are built first, in game id order, then handed
 * over together, so the port may play them on several threads. Nothing about the result depends on how
 * the port spreads the work: each game has its own seed, a game reads nothing another game of the same
 * week writes, and the rows are stored in request order. The world is not changed until every game is back.
 */
export function gamesStepBatch(schedule: SchedulePort, playAll: GameBatchPort): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const games = [...schedule.gamesOn(world, world.week)].sort((a, b) => a.gameId - b.gameId);
    const reqs: GameRequest[] = [];
    for (const game of games) {
      const comp = world.competitions.find((c) => c.id === game.competitionId);
      if (!comp) throw new Error(`game ${game.gameId}: no competition ${game.competitionId}`);
      for (const id of [game.homeTeamId, game.awayTeamId]) if (!isActive(world, id)) throw new Error(`game ${game.gameId}: team ${id} does not exist in ${world.date.seasonYear}`);
      const tier = Math.min(ctx.tierOfTeam(game.homeTeamId), ctx.tierOfTeam(game.awayTeamId)) as WorldTier;
      const seedHex = seedToHex(deriveSeed(world.seed, 'game', [world.date.seasonYear, game.gameId]));
      reqs.push({ game, seasonYear: world.date.seasonYear, week: world.week, seedHex, ruleSetId: comp.ruleSetId, tier, world });
    }
    const played = reqs.length === 0 ? [] : playAll(reqs);
    if (played.length !== reqs.length) throw new Error(`games step: ${reqs.length} games asked, ${played.length} answered`);
    let points = 0;
    reqs.forEach((req, i) => {
      const game = req.game, r = played[i]!;
      const row: GameResult = {
        gameId: game.gameId, competitionId: game.competitionId, seasonYear: world.date.seasonYear, week: world.week,
        homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homePoints: r.homePoints, awayPoints: r.awayPoints,
        passPlays: r.passPlays, runPlays: r.runPlays, kind: game.kind, title: game.title,
      };
      world.results.push(row);
      points += r.homePoints + r.awayPoints;
      if (game.title && r.homePoints !== r.awayPoints) {
        const [winner, loser, wp, lp] = r.homePoints > r.awayPoints ? [game.homeTeamId, game.awayTeamId, r.homePoints, r.awayPoints] : [game.awayTeamId, game.homeTeamId, r.awayPoints, r.homePoints];
        ctx.emit({
          type: TITLE_WON, date: world.date, competitionId: game.competitionId, teamId: winner, witnesses: { kind: 'public' }, tier: req.tier,
          subjects: [{ kind: 'team', id: winner }, { kind: 'team', id: loser }], payload: { season: world.date.seasonYear, opponent: loser, points: wp, opponent_points: lp },
        });
      }
    });
    return { games: games.length, points };
  };
}

/**
 * X2.4.1 at the season point: fold compactable rows older than the kept seasons into summaries. The log
 * is rebuilt by G-22's `compactLog`, which re-runs every check and recomputes the season hashes.
 */
export function compactionStep(opts: Omit<history.CompactOptions, 'currentYear'>): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const r = history.compactLog(world.log, { ...world.logOptions, ...opts, currentYear: world.date.seasonYear });
    world.log = r.log;
    return { folded: r.report.foldedRows, summaries: r.report.summaryRows, before: r.report.before, after: r.report.after };
  };
}

/** A hash of the whole live world, for replay checks (J13). `deep` adds every person and job. */
export function worldHash(world: LiveWorld, deep = true): string {
  const head = {
    date: world.date, week: world.week, passHash: world.passHash, passes: world.passes, seedStep: world.seedStep,
    log: world.log.seasonHashes(), nextIds: world.nextIds, seasons: world.seasons,
    status: [...world.status].sort((a, b) => a[0] - b[0]), tiers: [...world.tiers].sort((a, b) => a[0] - b[0]),
    rosters: [...world.rosters].sort((a, b) => a[0] - b[0]), pools: [...world.pools].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    systemState: [...world.systemState].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    hall: world.hall.members,
  };
  let h = history.chainHash(history.EMPTY_SEASON_HASH, head);
  if (deep) {
    for (const id of [...world.people.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.people.get(id));
    for (const id of [...world.jobs.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.jobs.get(id));
    for (const id of [...world.offLadder.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.offLadder.get(id));
    for (const t of world.teams) h = history.chainHash(h, t);
    for (const id of [...world.cultures.keys()].sort((a, b) => a - b)) h = history.chainHash(h, world.cultures.get(id));
  }
  return h;
}
