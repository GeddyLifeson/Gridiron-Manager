// The real phase 1 game (R1.2.2): the game flow (WP-06) driven by the reference resolver (WP-08), the
// officiating facade (WP-02 to WP-05), the statistics module (WP-07) and the chart caller (WP-13).
// Integrator-owned. Nothing here is a fake: every number comes from a rule set or a parameter file.
// The teams are neutral placeholder rosters (every attribute at one value) until the person generator
// (G-17) and the depth chart feed real ones; they hold no real people.
import {
  ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT,
  type GameDeps, type GameInput, type ParamFile, type ParamTable, type RuleSet, type Side, type SimPlayer, type SimTeam,
} from '@gm/schema';
import { DMATH, field, seedFromHex, streamSource } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import { PARAMS as CHART_PARAMS, createChartCaller, depthRoster, runBatch, type BatchResult } from '../calibration/index.ts';
import { chartOverrides } from '../calibration/params.ts';

/** Every parameter file of the modules a phase 1 game runs. A name defined twice is an error. */
export const ENGINE_PARAM_FILES: readonly ParamFile[] = [
  officiating.clock.PARAMS, officiating.series.PARAMS, officiating.scrimmage.PARAMS, officiating.fouls.PARAMS,
  officiating.crew.PARAMS, officiating.replay.PARAMS, officiating.kick.PARAMS, officiating.restart.PARAMS,
  officiating.overtime.PARAMS, resolver.PARAMS, flow.PARAMS, stats.PARAMS, CHART_PARAMS,
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

export interface RealGame {
  readonly rules: RuleSet;
  readonly params: ParamTable;
  input(gameIndex: number, seedHex: string): GameInput;
  deps(input: GameInput): GameDeps;
  simulate(input: GameInput): ReturnType<typeof flow.simulateGame>;
  batch(games: number, seedGroups: number, masterSeedHex: string, onGame?: (i: number) => void): BatchResult;
}

export function createRealGame(ruleSetId: string, opts: { iss?: number; paramOverrides?: Readonly<Record<string, number>> } = {}): RealGame {
  const rules = resolveRuleSet(ruleSetId);
  const params = engineParamTable(ENGINE_PARAM_FILES, opts.paramOverrides);
  const geometry = field.fieldGeometry(rules);
  const off = officiating.facade.createOfficiating();
  const statsModule = stats.createStatsModule({ geometry, params });
  const regulationPeriods = rules.num('clock.periods');
  const iss = opts.iss ?? 50;
  // The callers read the chart through the same overrides as the parameter table, on top of the level's chart (CR-G87-5).
  const overrides = chartOverrides(rules.level, opts.paramOverrides);
  const input = (gameIndex: number, seedHex: string): GameInput => ({
    gameId: gameIndex + 1, ruleSetId, gameType: 'regular',
    teams: [placeholderTeam(0, iss), placeholderTeam(1, iss)],
    crew: officiating.crew.neutralCrew(1), environment: NEUTRAL_ENVIRONMENT, seedHex, fidelityTier: 'B',
  });
  const deps = (inp: GameInput): GameDeps => ({
    rules, params, geometry, streams: streamSource(seedFromHex(inp.seedHex)), math: DMATH,
    resolver: resolver.REFERENCE_RESOLVER, officiating: off,
    deciders: [
      createChartCaller({ side: 0, geometry, roster: depthRoster(inp.teams[0].depth), regulationPeriods, overrides }),
      createChartCaller({ side: 1, geometry, roster: depthRoster(inp.teams[1].depth), regulationPeriods, overrides }),
    ],
  });
  const simulate = (inp: GameInput) => flow.simulateGame(inp, deps(inp));
  return {
    rules, params, input, deps, simulate,
    batch: (games, seedGroups, masterSeedHex, onGame) => runBatch({
      games, seedGroups, masterSeedHex, input: (i, s) => { onGame?.(i); return input(i, s); }, deps,
      flow: { simulateGame: (inp, d) => flow.simulateGame(inp, d) }, stats: statsModule,
    }),
  };
}
