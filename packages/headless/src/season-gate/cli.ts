#!/usr/bin/env node
// G-87 season gate commands. Until the integrator wires them into `npm run headless`, run with
//   npx tsx packages/headless/src/season-gate/cli.ts <command> [options]
// Commands:
//   season   one season, printed week by week        --rules id [--seed 16hex] [--seat team-key] [--year y]
//   seasons  many seasons and the Q1.7.2 season report --rules id [--seasons n] [--workers w] [--seed 16hex]
//            [--out dir]   outcomes go to <dir>/seasons.<rules>.jsonl as they finish; a rerun continues the file
//   battery  the Q3.3.1 battery report               [--rules a,b] [--seed 16hex] [--out file]
//   gate     the R1.2.7 phase 6 gate page            [--rules a,b] [--seasons n] [--workers w] [--out dir]
// A full Q1.7.2 run is 1,000 seasons per level: a long run, to be started where long runs go.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { season as seasons } from '@gm/world';
import { loadTargets } from '../calibration/index.ts';
import { ENGINE_PARAM_FILES } from '../real-game/index.ts';
import { ADMITTED_BINDINGS } from './battery/bindings.ts';
import { formatBatteryReport, runBattery } from './battery/report.ts';
import { formatPhaseSixGate, runPhaseSixGate } from './gate.ts';
import { buildSeason, REPO_ROOT } from './leagues.ts';
import { param } from './params.ts';
import { realPortRef } from './real-port.ts';
import { realGamePort } from './game-port.ts';
import { buildSeasonReport, formatSeasonReport } from './season-report.ts';
import { runSeasons, type SeasonOutcome, type SeasonRunSpec } from './seasons.ts';

const TEAM_MODEL = 'placeholder rosters, every attribute at one value (the league of average teams of Q1.7.2); generated rosters are not fed yet';
const DEFAULT_SEED = '00000000000000a1';

function argOf(argv: readonly string[], name: string, def?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}
const buildId = (): string => ENGINE_PARAM_FILES.map((f) => `${f.module}@${f.version}`).join(',');

function readOutcomes(file: string): SeasonOutcome[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as SeasonOutcome);
}

async function oneSeason(argv: readonly string[]): Promise<number> {
  const ruleSetId = argOf(argv, 'rules', 'pro_2026')!;
  const built = buildSeason(ruleSetId, { season: Number(argOf(argv, 'year', '2026')), seedHex: argOf(argv, 'seed', DEFAULT_SEED)!, seatTeamKey: argOf(argv, 'seat') ?? null });
  const { playGame } = realGamePort({ ruleSetId });
  const ports: seasons.SeasonPorts = { playGame, ...(built.spec.seatTeamId === null ? {} : { seatWeek: seasons.seatPort(built.seatSource, seasons.delegatingDriver('head_coach')) }) };
  for (const p of built.provisional) console.log(`PROVISIONAL input: ${p}`);
  let seen = 0;
  const end = seasons.runSeason(built.spec, ports, undefined, (s) => {
    const fresh = s.games.slice(seen); seen = s.games.length;
    if (fresh.length) console.log(`week ${fresh[0]!.fixture.week} (${fresh[0]!.fixture.phase}): ${fresh.length} games, ${fresh.filter((g) => g.outcome.overtime).length} in overtime`);
  });
  const sum = seasons.summariseSeason(built.spec, end);
  console.log(`${ruleSetId} season ${built.spec.season}: ${sum.regularGames} regular and ${sum.postseasonGames} postseason games, champion ${built.keyOf.get(end.champion!)}, seat weeks ${sum.seatWeeks}, season hash ${sum.seasonHash}`);
  return 0;
}

async function manySeasons(argv: readonly string[]): Promise<number> {
  const ruleSetId = argOf(argv, 'rules', 'pro_2026')!;
  const masterSeedHex = argOf(argv, 'seed', DEFAULT_SEED)!;
  const asked = Number(argOf(argv, 'seasons', String(param('seasonGate.seasonsPerLevel'))));
  const outDir = resolve(argOf(argv, 'out', join(REPO_ROOT, 'test-results', 'season-gate'))!);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `seasons.${ruleSetId}.${masterSeedHex}.jsonl`);
  const spec: SeasonRunSpec = { ruleSetId, seasonYear: Number(argOf(argv, 'year', '2026')), seasons: asked, masterSeedHex, port: realPortRef() };
  const done = readOutcomes(file);
  if (done.length) console.error(`continuing ${file}: ${done.length} seasons already there`);
  const outcomes = await runSeasons(spec, {
    workers: Number(argOf(argv, 'workers', String(Math.max(1, cpus().length - 1)))), done,
    onSeason: (o) => { appendFileSync(file, JSON.stringify(o) + '\n'); console.error(`season ${o.index}: ${o.ok ? `done, ${o.gamesPlayed} games` : `STOPPED at ${o.error}`}`); },
  });
  const built = buildSeason(ruleSetId, { season: spec.seasonYear, seedHex: masterSeedHex });
  const tie = built.spec.leagueRules['standings.tie_win_value'];
  const report = buildSeasonReport(loadTargets(REPO_ROOT, ruleSetId), outcomes, {
    build: buildId(), paramsVersion: buildId(), masterSeedHex, seasonsAsked: param('seasonGate.seasonsPerLevel'), teamModel: TEAM_MODEL, provisionalInputs: built.provisional,
  }, { tieWinValue: typeof tie === 'number' ? tie : Number.NaN });
  const text = formatSeasonReport(report);
  writeFileSync(join(outDir, `season-report.${ruleSetId}.txt`), text);
  process.stdout.write(text);
  return report.gate === 'pass' ? 0 : 1;
}

async function battery(argv: readonly string[]): Promise<number> {
  const rep = runBattery({ parameterSetId: buildId(), masterSeedHex: argOf(argv, 'seed', DEFAULT_SEED)!, ruleSets: argOf(argv, 'rules', 'pro_2026,college_2026')!.split(','), bindings: ADMITTED_BINDINGS });
  const text = formatBatteryReport(rep);
  const out = argOf(argv, 'out');
  if (out) writeFileSync(resolve(out), text);
  process.stdout.write(text);
  return rep.verdict === 'pass' ? 0 : 1;
}

async function gate(argv: readonly string[]): Promise<number> {
  const ruleSets = argOf(argv, 'rules', 'pro_2026,college_2026')!.split(',');
  const masterSeedHex = argOf(argv, 'seed', DEFAULT_SEED)!;
  const outDir = resolve(argOf(argv, 'out', join(REPO_ROOT, 'test-results', 'season-gate'))!);
  mkdirSync(outDir, { recursive: true });
  // A long season run made with `seasons` is read from its file instead of being run again.
  const outcomes: Record<string, SeasonOutcome[]> = {};
  for (const rs of ruleSets) { const have = readOutcomes(join(outDir, `seasons.${rs}.${masterSeedHex}.jsonl`)); if (have.length && !argv.includes('--seasons')) outcomes[rs] = have; }
  const g = await runPhaseSixGate({
    build: buildId(), masterSeedHex, seasonYear: Number(argOf(argv, 'year', '2026')), ruleSets, port: realPortRef(), teamModel: TEAM_MODEL, outcomes,
    ...(argOf(argv, 'seasons') ? { seasons: Number(argOf(argv, 'seasons')) } : {}), workers: Number(argOf(argv, 'workers', String(Math.max(1, cpus().length - 1)))),
    onSeason: (rs, o) => console.error(`${rs} season ${o.index}: ${o.ok ? 'done' : `STOPPED at ${o.error}`}`),
  });
  const text = formatPhaseSixGate(g);
  writeFileSync(join(outDir, 'phase6-gate.txt'), text);
  writeFileSync(join(outDir, 'phase6-gate.json'), JSON.stringify({ build: g.build, masterSeedHex: g.masterSeedHex, ruleSets: g.ruleSets, verdict: g.verdict, items: g.items }, null, 2) + '\n');
  process.stdout.write(text);
  return g.verdict === 'pass' ? 0 : 1;
}

export async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'season': return oneSeason(rest);
    case 'seasons': return manySeasons(rest);
    case 'battery': return battery(rest);
    case 'gate': return gate(rest);
    default:
      console.error('commands: season, seasons, battery, gate (see the header of packages/headless/src/season-gate/cli.ts)');
      return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
