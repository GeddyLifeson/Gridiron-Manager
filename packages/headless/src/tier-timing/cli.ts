// Runs the X13.3.1 protocol and writes the report. The tiers module (G-82) is named by path because
// @gm/world's entry point does not export it yet:
//   npx tsx packages/headless/src/tier-timing/cli.ts --tiers-module "$PWD/packages/world/src/tiers/index.ts" \
//     [--pro-games 15] [--college-games 65] [--workers 3] [--week-budget-ms 45000] [--memory-budget-mb N] \
//     [--build HASH] [--machine NAME] [--previous last.json] [--out report.json]
// Exit 0 when a configuration ships, 2 when the result must go to Marlon (no configuration inside the budgets).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTiers, machineName } from './cli-lib.ts';
import { leagueWeekPlan } from './league-week.ts';
import { runProtocol, type ProtocolResult } from './runner.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string, fallback: number): number => { const v = flag(name); return v === undefined ? fallback : Number(v); };

async function main(): Promise<number> {
  const tiersPath = flag('tiers-module');
  if (!tiersPath) { console.error('tier timing: --tiers-module <absolute path to the world tiers module> is required'); return 1; }
  const tiers = await loadTiers(tiersPath);
  const build = flag('build') ?? (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout ?? '').trim();
  if (!build) { console.error('tier timing: no build hash (not a git checkout): pass --build'); return 1; }
  const budgets: Record<string, number> = { leagueWeekMs: num('week-budget-ms', 45_000) };
  const mem = flag('memory-budget-mb');
  if (mem !== undefined) budgets['peakMemoryMb'] = Number(mem);
  const prevPath = flag('previous');
  let previous: Record<string, unknown> | undefined;
  if (prevPath) {
    const last = JSON.parse(readFileSync(prevPath, 'utf8')) as ProtocolResult<{ config: { id: string } }, unknown>;
    previous = Object.fromEntries(last.configs.map((c) => [c.report.config.id, c.report]));
  }
  const result = runProtocol({
    tiers, budgets, buildHash: build, machine: flag('machine') ?? machineName(), previous,
    workloads: [leagueWeekPlan({ proGames: num('pro-games', 15), collegeGames: num('college-games', 65), workers: num('workers', 3) })],
  });
  const text = `${JSON.stringify(result, null, 2)}\n`;
  const out = flag('out');
  if (out) writeFileSync(out, text); else process.stdout.write(text);
  console.error(`tier timing: ${result.choice.kind}; stopped at ${result.stopped.at} (${result.stopped.detail}); not measured: ${result.notMeasured.map((n) => n.metric).join(', ') || 'none'}`);
  return result.choice.kind === 'ship' ? 0 : 2;
}

main().then((code) => { process.exitCode = code; }, (e: unknown) => { console.error(e); process.exitCode = 1; });
