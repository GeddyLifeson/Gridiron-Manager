// Home edge probe (J12.8.1): the same games played with the gate crowd and with an empty stadium (noiseBase 0),
// paired by seed, so the crowd's share of the home margin is measured with a small standard error.
// Usage: npx tsx scripts/home-edge-probe.ts <ruleSetId> <gamesPerProcess> <processes> [name=value ...]
// Prints the home margin and home win share for each setting, the paired difference with its standard error,
// and the pre-snap foul rates per 100 snaps by role and venue (J12.6.1 acceptance 2 and 3).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRealGame } from '../packages/headless/src/real-game/index.ts';

const [rulesId = 'pro_2026', gamesArg = '10', procsArg = '4', ...rest] = process.argv.slice(2);
const games = Number(gamesArg), procs = Number(procsArg);
const overrides: Record<string, number> = {};
let quietBase = 0;
for (const a of rest) { const [k, v] = a.split('='); if (k === 'quiet') quietBase = Number(v); else overrides[k!] = Number(v); }

const DOG = new Set(['delay_of_game']);
const DEF = new Set(['defensive_offside', 'neutral_zone_infraction', 'encroachment']);
const FS = new Set(['false_start']);
interface Out { margins: number[]; fouls: Record<string, [number, number]> }

if (process.env.HE_CHILD) {
  const [seed, nb] = process.env.HE_CHILD.split(':');
  const noiseBase = nb === 'gate' ? undefined : Number(nb);
  const g = createRealGame(rulesId, { paramOverrides: overrides, ...(noiseBase === undefined ? {} : { noiseBase }) });
  const b = g.batch(games, 1, seed!);
  const out: Out = { margins: [], fouls: {} };
  const add = (k: string, n: number) => { const c = out.fouls[k] ?? [0, 0]; c[0] += n; c[1] += 1; out.fouls[k] = c; };
  for (const grp of b.groups) {
    for (const s of grp.summaries) out.margins.push(s.finalScore[0] - s.finalScore[1]);
    for (const r of grp.plays) {
      if (r.down === null || r.down === undefined) continue;
      const offV = r.offense === 0 ? 'home' : 'road', defV = r.offense === 0 ? 'road' : 'home';
      const count = (set: Set<string>, side: number) => r.penalties.filter((f) => f.side === side && set.has(f.foulId)).length;
      add(`dog.offense.${offV}`, count(DOG, r.offense)); add(`fs.offense.${offV}`, count(FS, r.offense)); add(`def.defense.${defV}`, count(DEF, 1 - r.offense));
    }
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const run = (k: number, nb: string) => new Promise<Out>((ok, bad) => {
    const seed = (0x2000n + BigInt(k)).toString(16).padStart(16, '0');
    const c = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env: { ...process.env, HE_CHILD: `${seed}:${nb}` }, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = ''; c.stdout.on('data', (d) => { buf += d; });
    c.on('close', (code) => (code === 0 ? ok(JSON.parse(buf) as Out) : bad(new Error(`child ${k} exit ${code}`))));
  });
  const t0 = Date.now();
  const loud: Out[] = [], quiet: Out[] = [];
  const pairs = await Promise.all(Array.from({ length: procs }, async (_, k) => [await run(k, 'gate'), await run(k, String(quietBase))] as const));
  for (const [l, q] of pairs) { loud.push(l); quiet.push(q); }
  const flat = (o: Out[]) => o.flatMap((x) => x.margins);
  const L = flat(loud), Q = flat(quiet);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const se = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length); };
  const win = (a: number[]) => a.reduce((s, x) => s + (x > 0 ? 1 : x === 0 ? 0.5 : 0), 0) / a.length;
  const d = L.map((x, i) => x - Q[i]!);
  const f = (o: Out[], k: string) => { let n = 0, s = 0; for (const x of o) { const c = x.fouls[k]; if (c) { n += c[0]; s += c[1]; } } return s ? (100 * n / s).toFixed(3) : 'n/a'; };
  console.log(`${rulesId}: ${L.length} games per setting, ${((Date.now() - t0) / 1000).toFixed(0)} s, overrides ${JSON.stringify(overrides)}`);
  console.log(`gate crowd:   home margin ${mean(L).toFixed(2)} (se ${se(L).toFixed(2)}), home win share ${win(L).toFixed(3)}`);
  console.log(`noiseBase ${quietBase}: home margin ${mean(Q).toFixed(2)} (se ${se(Q).toFixed(2)}), home win share ${win(Q).toFixed(3)}`);
  console.log(`paired crowd effect: ${mean(d).toFixed(2)} points (se ${se(d).toFixed(2)})`);
  for (const k of ['dog.offense.home', 'dog.offense.road', 'fs.offense.home', 'fs.offense.road', 'def.defense.home', 'def.defense.road']) console.log(`  ${k} per 100 snaps: gate ${f(loud, k)}, quiet ${f(quiet, k)}`);
}
