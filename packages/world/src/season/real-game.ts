// The real game as the season runner and the app play it (R1.2.2): the game flow (WP-06) driven by the
// reference resolver (WP-08), the officiating facade (WP-02 to WP-05), the statistics module (WP-07) and the
// chart caller (WP-13, coach-ai chart). Moved here from headless real-game so the browser app and the
// headless tools build the same game from the same parameter files; headless re-exports these names.
// Nothing here is a fake: every number comes from a rule set or a parameter file. The teams are neutral
// placeholder rosters (every attribute at one value) until the person generator (G-17) and the depth chart
// feed real ones; they hold no real people.
import {
  ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT,
  type GameDeps, type GameInput, type ParamFile, type ParamTable, type RuleSet, type Side, type SimPlayer, type SimTeam,
} from '@gm/schema';
import { DMATH, field, seedFromHex, streamSource } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import * as chart from './chart/index.ts';
import type { SeasonPorts, StatLine } from './types.ts';

/** Every parameter file of the modules a phase 1 game runs. A name defined twice is an error. */
export const ENGINE_PARAM_FILES: readonly ParamFile[] = [
  officiating.clock.PARAMS, officiating.series.PARAMS, officiating.scrimmage.PARAMS, officiating.fouls.PARAMS,
  officiating.crew.PARAMS, officiating.replay.PARAMS, officiating.kick.PARAMS, officiating.restart.PARAMS,
  officiating.overtime.PARAMS, resolver.PARAMS, flow.PARAMS, stats.PARAMS, chart.PARAMS,
];

export function engineParamTable(files: readonly ParamFile[] = ENGINE_PARAM_FILES, overrides: Readonly<Record<string, number>> = {}): ParamTable {
  const map = new Map<string, number>();
  for (const f of files) for (const p of f.params) {
    if (map.has(p.name)) throw new Error(`parameter ${p.name} is defined twice (second time in ${f.module})`);
    map.set(p.name, p.value);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (!map.has(k)) throw new Error(`unknown parameter ${k}`);
    map.set(k, v);
  }
  return {
    version: files.map((f) => `${f.module}@${f.version}`).join(','),
    has: (name) => map.has(name),
    num(name) {
      const v = map.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
  };
}

const UNITS = ['offense', 'defense', 'kick', 'return'] as const;
const PER_UNIT = 11;

/** PLACEHOLDER roster: four units of eleven, every attribute at `iss`. Not real people, not generated people. */
export function placeholderTeam(side: Side, iss: number): SimTeam {
  const base = (side + 1) * 1000;
  const players: SimPlayer[] = [];
  const depth: Record<string, number[]> = {};
  UNITS.forEach((unit, u) => {
    depth[unit] = [];
    for (let i = 1; i <= PER_UNIT; i++) {
      const playerId = base + u * 100 + i;
      const attributes: Record<string, number> = {};
      for (const a of ATTRIBUTE_IDS) attributes[a] = iss;
      players.push({
        playerId, position: unit, jersey: (u * PER_UNIT + i) % 100, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
        tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 },
        gameDay: { freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false },
      });
      depth[unit]!.push(playerId);
    }
  });
  return { teamId: side + 1, side, players, depth, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}

export interface RealGameCore {
  readonly rules: RuleSet;
  readonly params: ParamTable;
  input(gameIndex: number, seedHex: string): GameInput;
  deps(input: GameInput): GameDeps;
  simulate(input: GameInput): ReturnType<typeof flow.simulateGame>;
}

export interface RealGameOptions { readonly iss?: number; readonly paramOverrides?: Readonly<Record<string, number>> }

/** The real game for a rule set: inputs, dependencies (both sides on the chart caller) and a whole-game run. */
export function createRealGameCore(ruleSetId: string, opts: RealGameOptions = {}): RealGameCore {
  const rules = resolveRuleSet(ruleSetId);
  const params = engineParamTable(ENGINE_PARAM_FILES, opts.paramOverrides);
  const geometry = field.fieldGeometry(rules);
  const off = officiating.facade.createOfficiating();
  const regulationPeriods = rules.num('clock.periods');
  const iss = opts.iss ?? 50;
  // The callers read the chart through the same overrides as the parameter table, on top of the level's chart (CR-G87-5).
  const overrides = chart.chartOverrides(rules.level, opts.paramOverrides);
  const input = (gameIndex: number, seedHex: string): GameInput => ({
    gameId: gameIndex + 1, ruleSetId, gameType: 'regular',
    teams: [placeholderTeam(0, iss), placeholderTeam(1, iss)],
    crew: officiating.crew.neutralCrew(1), environment: NEUTRAL_ENVIRONMENT, seedHex, fidelityTier: 'B',
  });
  const deps = (inp: GameInput): GameDeps => ({
    rules, params, geometry, streams: streamSource(seedFromHex(inp.seedHex)), math: DMATH,
    resolver: resolver.REFERENCE_RESOLVER, officiating: off,
    deciders: [
      chart.createChartCaller({ side: 0, geometry, roster: chart.depthRoster(inp.teams[0].depth), regulationPeriods, overrides }),
      chart.createChartCaller({ side: 1, geometry, roster: chart.depthRoster(inp.teams[1].depth), regulationPeriods, overrides }),
    ],
  });
  return { rules, params, input, deps, simulate: (inp) => flow.simulateGame(inp, deps(inp)) };
}

export interface RealPortOptions {
  readonly ruleSetId: string;
  readonly paramOverrides?: Readonly<Record<string, number>>;
  /** Attribute level of a team's placeholder roster on the internal skill scale; the real game's default when left out. */
  readonly issOf?: (teamId: number) => number;
}

/** Season-wide player id of a placeholder roster slot: unique per team, stable across games. */
export function seasonPlayerId(teamId: number, enginePlayerId: number, slotsPerTeam: number): number {
  return teamId * slotsPerTeam + (enginePlayerId % slotsPerTeam);
}

const SLOTS = 1000;

/** The season's game input for a fixture: the real game's input with the fixture's phase and rosters. */
export function fixtureInput(game: RealGameCore, f: { gameId: number; phase: string; home: number; away: number }, seedHex: string, issOf?: (teamId: number) => number): GameInput {
  const base = game.input(f.gameId - 1, seedHex);
  return {
    ...base, gameType: f.phase === 'postseason' ? 'postseason' as const : 'regular' as const,
    ...(issOf ? { teams: [placeholderTeam(0, issOf(f.home)), placeholderTeam(1, issOf(f.away))] as typeof base.teams } : {}),
  };
}

/** A finished game as the season runner records it: score, touchdowns of every kind, overtime, player lines. */
export function outcomeOf(
  game: RealGameCore, f: { gameId: number; home: number; away: number }, input: GameInput, res: ReturnType<typeof flow.simulateGame>,
  statsModule: ReturnType<typeof stats.createStatsModule> = stats.createStatsModule({ geometry: field.fieldGeometry(game.rules), params: game.params }),
): ReturnType<SeasonPorts['playGame']> {
  const score = res.final.score;
  const finalEvent = [...res.events].reverse().find((e) => e.type === 'game_final');
  const tie = finalEvent && finalEvent.type === 'game_final' ? finalEvent.tie : score[0] === score[1];
  const stateHash = res.records.length ? res.records[res.records.length - 1]!.stateHash : '';
  const summary = statsModule.summary(res.records, res.drives, { score, tie, stateHash, ruleSetId: input.ruleSetId, seedHex: input.seedHex });
  // Touchdowns of every kind (C3.1.1 net-touchdowns step), from how each drive ended.
  const touchdowns: [number, number] = [0, 0];
  for (const d of res.drives) {
    if (d.result === 'touchdown') touchdowns[d.side]++;
    else if (d.result === 'opponent_touchdown') touchdowns[d.side === 0 ? 1 : 0]++;
  }
  const totals = new Map<string, StatLine>();
  const teamOf = [f.home, f.away] as const;
  for (const rec of res.records) for (const c of statsModule.credits(rec)) {
    if (c.playerId === null) continue;
    const teamId = teamOf[c.side]!;
    const playerId = seasonPlayerId(teamId, c.playerId, SLOTS);
    const key = `${c.statId}|${playerId}`;
    totals.set(key, { playerId, teamId, statId: c.statId, value: (totals.get(key)?.value ?? 0) + c.value });
  }
  return { points: [score[0], score[1]], touchdowns, overtime: summary.overtime, stateHash, plays: res.records.length, lines: [...totals.values()] };
}

/** The season runner's game port backed by the real game: every fixture simulated whole. */
export function realGamePort(o: RealPortOptions): { game: RealGameCore; playGame: SeasonPorts['playGame'] } {
  const game = createRealGameCore(o.ruleSetId, o.paramOverrides ? { paramOverrides: o.paramOverrides } : {});
  const statsModule = stats.createStatsModule({ geometry: field.fieldGeometry(game.rules), params: game.params });
  const playGame: SeasonPorts['playGame'] = (ctx) => {
    const input = fixtureInput(game, ctx.fixture, ctx.seedHex, o.issOf);
    return outcomeOf(game, ctx.fixture, input, game.simulate(input), statsModule);
  };
  return { game, playGame };
}
