#!/usr/bin/env node
// Play-level calibration runner (WP-26). Until the integrator wires a headless subcommand:
//   npx tsx packages/headless/src/calibration-play/run.ts baseline <dir with play_by_play_YYYY.csv.gz> \
//       [--totals name=file.csv ...] [--retrieved YYYY-MM-DD]
//   npx tsx packages/headless/src/calibration-play/run.ts report [--rules pro_2026] [--games 200] [--groups 10] \
//       [--seed 0123456789abcdef] [--out file.txt]
import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameSummary, PlayByPlayRow } from '@gm/schema';
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import { loadTargets } from '../calibration/files.ts';
import { gameSeedHex } from '../calibration/batch.ts';
import { createRealGame } from '../real-game/index.ts';
import { baselinePath, buildBaseline, readBaseline, readPublicSeason, readTeamTotals, readTolerances, type SeasonRows } from './files.ts';
import { buildPlayReport, formatPlayReport } from './report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1]! : def; };
const opts = (name: string): string[] => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]!] : []));
const SEASONS = [2022, 2023, 2024];

function baseline(): number {
  const dir = argv[1];
  if (!dir) { console.error('usage: baseline <dir>'); return 2; }
  const seasons: SeasonRows[] = [];
  let next = 1;
  for (const y of SEASONS) {
    const file = [`play_by_play_${y}.csv.gz`, `pbp${y}.csv.gz`].map((n) => join(dir, n)).find((p) => existsSync(p));
    if (!file) { console.error(`missing season ${y} in ${dir}`); return 1; }
    const s = readPublicSeason(file, y, next);
    next += s.games;
    seasons.push(s);
    console.log(`${y}: ${s.games} games, ${s.rows.length} rows`);
  }
  const totals = opts('totals').map((t) => { const [source, path] = t.split('='); return { source: source!, bySeason: readTeamTotals(path!) }; });
  const b = buildBaseline('pro_2026', seasons, [{
    citation: 'nflverse play-by-play', locator: `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_<year>.csv.gz, ${SEASONS.join(', ')}, season_type REG`,
    retrieved: opt('retrieved', ''),
  }], totals);
  writeFileSync(baselinePath('pro_2026'), JSON.stringify(b, null, 1) + '\n');
  for (const c of b.adapterChecks) console.log(`  ${c.season} ${c.quantity}: play-by-play ${c.fromPlayByPlay}; ${c.others.map((o) => `${o.source} ${o.value}`).join('; ')}; difference ${c.difference}`);
  console.log(`wrote ${baselinePath('pro_2026')}: ${b.cells.length} cells`);
  return 0;
}

function report(): number {
  const ruleSetId = opt('rules', 'pro_2026'), games = Number(opt('games', '200')), groups = Number(opt('groups', '10')), seed = opt('seed', '0123456789abcdef');
  const game = createRealGame(ruleSetId);
  const statsModule = stats.createStatsModule({ geometry: field.fieldGeometry(game.rules), params: game.params });
  // The same loop as the WP-13 batch runner, one game at a time, so a game the engine cannot finish is
  // counted and left out instead of ending the run. Leaving games out biases the sample; the report says so.
  const samples = Array.from({ length: groups }, () => ({ summaries: [] as GameSummary[], plays: [] as PlayByPlayRow[] }));
  const failures = new Map<string, number>();
  let failed = 0;
  for (let i = 0; i < games; i++) {
    const seedHex = gameSeedHex(seed, i);
    const input = game.input(i, seedHex);
    try {
      const res = game.simulate(input);
      const g = samples[i % groups]!;
      const rows = res.records.map((rec, k) => statsModule.playByPlay(rec, res.records[k + 1] ?? null));
      const final = [...res.events].reverse().find((e) => e.type === 'game_final');
      const score = res.final.score;
      g.summaries.push(statsModule.summary(res.records, res.drives, {
        score, tie: final && final.type === 'game_final' ? final.tie : score[0] === score[1],
        stateHash: res.records.length ? res.records[res.records.length - 1]!.stateHash : '', ruleSetId, seedHex,
      }));
      g.plays.push(...rows);
    } catch (e) {
      failed++;
      const msg = (e as Error).message;
      failures.set(msg, (failures.get(msg) ?? 0) + 1);
    }
  }
  const notes = failed === 0 ? [] : [
    `${failed} of ${games} games did not finish and are left out, so this sample is biased (it holds no game of that kind):`,
    ...[...failures].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([m, n]) => `  ${n} x ${m}`),
  ];
  const rep = buildPlayReport(loadTargets(ROOT, ruleSetId), samples, {
    build: opt('build', 'working tree'), paramsHash: game.params.version, resolverId: 'reference', seeds: `master ${seed}`, games: games - failed, seedGroups: groups,
  }, readBaseline(ruleSetId), readTolerances(), notes);
  const text = formatPlayReport(rep);
  const out = argv.includes('--out') ? opt('out', '') : null;
  if (out) writeFileSync(out, text); else process.stdout.write(text);
  const c = rep.counts;
  console.error(`${ruleSetId}: target rows pass ${rep.targets.counts.passed} fail ${rep.targets.counts.failed}; cells pass ${c.passed} fail ${c.failed} thin ${c.thin} missing ${c.missingSource}; shapes held ${c.shapesHeld} of ${c.shapes}`);
  return 0;
}

process.exit(argv[0] === 'baseline' ? baseline() : argv[0] === 'report' ? report() : (console.error('usage: baseline | report'), 2));
