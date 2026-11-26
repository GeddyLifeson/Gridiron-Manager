// Many seasons of one competition (Q1.7.2 season level: 1,000 seasons per level). Each season is
// independent: its seed comes from the master seed and its index, so seasons can run in any order, on
// any number of workers, and a stopped run can be continued from the outcomes already on disk.
// A season that throws is kept as a failed outcome with the game it reached; it is never dropped and
// never retried with another seed.
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { deriveSeed, seedFromHex, seedToHex } from '@gm/engine-core';
import { season as seasons } from '@gm/world';
import { buildSeason, type BuiltSeason } from './leagues.ts';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** A module that exports `createPlayGame(ruleSetId, options)`; worker threads rebuild the port from it. */
export interface PortRef { readonly module: string; readonly options: Json }
export type CreatePlayGame = (ruleSetId: string, options: Json) => seasons.SeasonPorts['playGame'];

export const REAL_PORT_MODULE = new URL('./real-port.ts', import.meta.url).href;

export interface SeasonRunSpec {
  readonly ruleSetId: string;
  readonly seasonYear: number;
  readonly seasons: number;
  /** 16 hex digits. */
  readonly masterSeedHex: string;
  readonly port: PortRef;
  /** World-data key of the team at the head coach seat, or null for all-AI seasons. The seat delegates. */
  readonly seatTeamKey?: string | null;
  readonly leagueRuleOverrides?: Readonly<Record<string, number | string | boolean>>;
}

export interface StatSpread { readonly statId: string; readonly players: number; readonly sum: number; readonly sumSquares: number; readonly max: number }

/** What the season report keeps of one season. */
export interface SeasonLine {
  readonly teams: readonly seasons.TeamSeasonLine[];
  readonly champion: string | null;
  readonly regularGames: number;
  readonly postseasonGames: number;
  /** Regular-season games between two teams of the competition, and how many were conference or neutral-site games. */
  readonly insideGames: number;
  readonly insideConferenceGames: number;
  readonly insideNeutralGames: number;
  readonly overtimeGames: number;
  readonly tiedGames: number;
  readonly plays: number;
  /** Games between a power-conference team and another team of the competition, and the power team's wins. */
  readonly crossTierGames: number;
  readonly crossTierPowerWins: number;
  /** Games against guests from outside the competition, and the competition team's wins. */
  readonly guestGames: number;
  readonly guestGamesWon: number;
  readonly statSpread: readonly StatSpread[];
  readonly seatWeeks: number;
  readonly seasonHash: string;
}

export interface SeasonOutcome {
  readonly index: number;
  readonly seedHex: string;
  readonly ok: boolean;
  readonly gamesPlayed: number;
  /** Set when the season stopped: the error text and the game it stopped in. */
  readonly error: string | null;
  readonly line: SeasonLine | null;
}

const SEASON_SEED_SCOPE = 'seasonGate.season';

export function seasonSeedHex(masterSeedHex: string, index: number): string {
  if (!/^[0-9a-f]{16}$/.test(masterSeedHex)) throw new Error(`master seed ${masterSeedHex}: need 16 lower-case hex digits`);
  return seedToHex(deriveSeed(seedFromHex(masterSeedHex), SEASON_SEED_SCOPE, [index]));
}

function spreads(totals: readonly seasons.PlayerSeasonTotal[]): StatSpread[] {
  const by = new Map<string, { players: number; sum: number; sumSquares: number; max: number }>();
  for (const t of totals) {
    const s = by.get(t.statId) ?? { players: 0, sum: 0, sumSquares: 0, max: Number.NEGATIVE_INFINITY };
    s.players++; s.sum += t.value; s.sumSquares += t.value * t.value; s.max = Math.max(s.max, t.value);
    by.set(t.statId, s);
  }
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([statId, s]) => ({ statId, ...s }));
}

export function seasonLine(built: BuiltSeason, state: seasons.SeasonState): SeasonLine {
  const sum = seasons.summariseSeason(built.spec, state);
  const inside = new Set(built.spec.teams.map((t) => t.id));
  const power = powerTeams(built);
  let insideGames = 0, insideConferenceGames = 0, insideNeutralGames = 0, crossTierGames = 0, crossTierPowerWins = 0, guestGames = 0, guestGamesWon = 0;
  for (const g of state.games) {
    if (g.fixture.phase !== 'regular') continue;
    const { home, away } = g.fixture;
    const [hp, ap] = g.outcome.points;
    if (inside.has(home) && inside.has(away)) {
      insideGames++;
      if (g.fixture.conferenceGame) insideConferenceGames++;
      if (g.fixture.neutralSite) insideNeutralGames++;
      if (power.has(home) !== power.has(away)) {
        crossTierGames++;
        if ((power.has(home) && hp > ap) || (power.has(away) && ap > hp)) crossTierPowerWins++;
      }
    } else {
      guestGames++;
      if ((inside.has(home) && hp > ap) || (inside.has(away) && ap > hp)) guestGamesWon++;
    }
  }
  return {
    teams: sum.teams, champion: state.champion === null ? null : built.keyOf.get(state.champion) ?? null,
    regularGames: sum.regularGames, postseasonGames: sum.postseasonGames, insideGames, insideConferenceGames, insideNeutralGames,
    overtimeGames: sum.overtimeGames, tiedGames: sum.tiedGames, plays: sum.plays, crossTierGames, crossTierPowerWins, guestGames, guestGamesWon,
    statSpread: spreads(sum.playerTotals), seatWeeks: sum.seatWeeks, seasonHash: sum.seasonHash,
  };
}

/** Teams of the power conferences, when the competition has tiers (T2.2.1); empty otherwise. */
export function powerTeams(built: BuiltSeason): ReadonlySet<number> {
  return new Set(built.powerTeamIds);
}

export async function loadPort(ref: PortRef, ruleSetId: string): Promise<seasons.SeasonPorts['playGame']> {
  const mod = (await import(ref.module)) as { createPlayGame?: CreatePlayGame };
  if (typeof mod.createPlayGame !== 'function') throw new Error(`port module ${ref.module} does not export createPlayGame`);
  return mod.createPlayGame(ruleSetId, ref.options);
}

/** Plays one season of the run. Never throws for a season that stops: the outcome carries the error. */
export function runOneSeason(spec: SeasonRunSpec, index: number, playGame: seasons.SeasonPorts['playGame']): SeasonOutcome {
  const seedHex = seasonSeedHex(spec.masterSeedHex, index);
  let gamesPlayed = 0;
  let current = '';
  try {
    const built = buildSeason(spec.ruleSetId, { season: spec.seasonYear, seedHex, seatTeamKey: spec.seatTeamKey ?? null, ...(spec.leagueRuleOverrides ? { leagueRuleOverrides: spec.leagueRuleOverrides } : {}) });
    const ports: seasons.SeasonPorts = {
      playGame: (ctx) => {
        current = `game ${ctx.fixture.gameId} (week ${ctx.fixture.week}, ${ctx.fixture.phase}, seed ${ctx.seedHex})`;
        const out = playGame(ctx);
        gamesPlayed++;
        return out;
      },
      ...(built.spec.seatTeamId === null ? {} : { seatWeek: seasons.seatPort(built.seatSource, seasons.delegatingDriver('head_coach')) }),
    };
    const end = seasons.runSeason(built.spec, ports);
    return { index, seedHex, ok: true, gamesPlayed, error: null, line: seasonLine(built, end) };
  } catch (e) {
    return { index, seedHex, ok: false, gamesPlayed, error: `${current || 'before the first game'}: ${e instanceof Error ? e.message : String(e)}`, line: null };
  }
}

export interface RunOptions {
  readonly workers?: number;
  /** Outcomes already on disk; their indexes are skipped. */
  readonly done?: readonly SeasonOutcome[];
  readonly onSeason?: (o: SeasonOutcome) => void;
}

/** Runs the seasons of a spec, on worker threads when `workers` is above 1. Outcomes come back in index order. */
export async function runSeasons(spec: SeasonRunSpec, opts: RunOptions = {}): Promise<SeasonOutcome[]> {
  const have = new Map((opts.done ?? []).map((o) => [o.index, o]));
  const todo = Array.from({ length: spec.seasons }, (_, i) => i).filter((i) => !have.has(i));
  const workers = Math.max(1, Math.min(opts.workers ?? 1, todo.length || 1));
  const out: SeasonOutcome[] = [...have.values()].filter((o) => o.index < spec.seasons);
  const take = (o: SeasonOutcome) => { out.push(o); opts.onSeason?.(o); };
  if (workers === 1) {
    const playGame = await loadPort(spec.port, spec.ruleSetId);
    for (const i of todo) take(runOneSeason(spec, i, playGame));
  } else {
    const shares: number[][] = Array.from({ length: workers }, () => []);
    todo.forEach((i, k) => shares[k % workers]!.push(i));
    const file = fileURLToPath(new URL('./worker.ts', import.meta.url));
    await Promise.all(shares.map((indexes) => new Promise<void>((res, rej) => {
      const w = new Worker(file, { workerData: { spec, indexes }, execArgv: ['--import', 'tsx'] });
      w.on('message', (m: { season?: SeasonOutcome; done?: boolean; error?: string }) => {
        if (m.season) take(m.season);
        if (m.error) rej(new Error(m.error));
        if (m.done) res();
      });
      w.once('error', rej);
    })));
  }
  return out.sort((a, b) => a.index - b.index);
}
