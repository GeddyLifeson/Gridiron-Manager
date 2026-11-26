// Home edge mechanism probe (J12.6.1, J12.8.1): many games at one crowd setting, with what each channel did
// by venue, so a change in the home margin can be traced to the mechanism that produced it.
// Usage: npx tsx scripts/home-edge-mech.ts <ruleSetId> <gamesPerProcess> <processes> [noise=<base>] [seed=<hex>] [name=value ...]
// Prints the home margin and win share (with standard errors), and per venue: yards per play, sack, pressure,
// interception and fumble rates of the offense, mental errors per game by cause and side of the ball, the
// pre-snap fouls of J12.6.1 acceptance 2 per 100 snaps, and the share of snaps on a silent count.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { field } from '../packages/engine-core/src/index.ts';
import { stats } from '../packages/engine-game/src/index.ts';
import { createRealGame } from '../packages/headless/src/real-game/index.ts';

const [rulesId = 'pro_2026', gamesArg = '10', procsArg = '4', ...rest] = process.argv.slice(2);
const games = Number(gamesArg), procs = Number(procsArg);
const overrides: Record<string, number> = {};
let noise: number | undefined, seedBase = 0x4000n;
for (const a of rest) {
  const [k, v] = a.split('=');
  if (k === 'noise') noise = Number(v); else if (k === 'seed') seedBase = BigInt(`0x${v}`); else overrides[k!] = Number(v);
}

interface Out { margins: number[]; n: Record<string, number> }
const DOG = 'delay_of_game', FS = 'false_start', DEF = new Set(['defensive_offside', 'neutral_zone_infraction', 'encroachment']);

if (process.env.HE_CHILD) {
  const k = Number(process.env.HE_CHILD);
  const g = createRealGame(rulesId, { paramOverrides: overrides, ...(noise === undefined ? {} : { noiseBase: noise }) });
  const sm = stats.createStatsModule({ geometry: field.fieldGeometry(g.rules), params: g.params });
  const out: Out = { margins: [], n: {} };
  const add = (key: string, v = 1) => { out.n[key] = (out.n[key] ?? 0) + v; };
  for (let i = 0; i < games; i++) {
    const seed = (seedBase * 0x10000n + BigInt(k) * 0x1000n + BigInt(i)).toString(16).padStart(16, '0');
    const res = g.simulate(g.input(k * games + i, seed));
    out.margins.push(res.final.score[0] - res.final.score[1]);
    for (const rec of res.records) {
      const row = sm.playByPlay(rec, null);
      const off = row.offense, v = off === 0 ? 'home' : 'road', dv = off === 0 ? 'road' : 'home';
      for (const e of rec.truth.events) {
        if (e.type !== 'mental_error') continue;
        const side = Math.floor(e.playerId / 1000) - 1;
        add(`err.${e.cause}.${side === off ? `offense.${v}` : `defense.${dv}`}`);
      }
      if (row.down === null) continue;
      add(`snaps.${v}`);
      for (const f of row.penalties) {
        add(`foul.${f.foulId}`);
        if (f.side === off && f.foulId === DOG) add(`dog.${v}`);
        if (f.side === off && f.foulId === FS) add(`fs.${v}`);
        if (f.side !== off && DEF.has(f.foulId)) add(`defpre.${dv}`);
      }
      if (row.noPlay) continue;
      add(`plays.${v}`); add(`yards.${v}`, row.yardsGained ?? 0);
      if (row.dropback) { add(`dropbacks.${v}`); if (row.sack) add(`sacks.${v}`); if (row.pressure) add(`pressures.${v}`); if (row.interception) add(`ints.${v}`); }
      if (row.fumbleLost) add(`fumbles.${v}`);
      if (row.touchdown) add(`tds.${v}`);
    }
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const run = (k: number) => new Promise<Out>((ok, bad) => {
    const c = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env: { ...process.env, HE_CHILD: String(k) }, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = ''; c.stdout.on('data', (d) => { buf += d; });
    c.on('close', (code) => (code === 0 ? ok(JSON.parse(buf) as Out) : bad(new Error(`child ${k} exit ${code}`))));
  });
  const t0 = Date.now();
  const outs = await Promise.all(Array.from({ length: procs }, (_, k) => run(k)));
  const M = outs.flatMap((o) => o.margins), G = M.length;
  const n: Record<string, number> = {};
  for (const o of outs) for (const [k, v] of Object.entries(o.n)) n[k] = (n[k] ?? 0) + v;
  const mean = M.reduce((s, x) => s + x, 0) / G;
  const sd = Math.sqrt(M.reduce((s, x) => s + (x - mean) ** 2, 0) / (G - 1));
  const win = M.reduce((s, x) => s + (x > 0 ? 1 : x === 0 ? 0.5 : 0), 0) / G;
  const c = (k: string) => n[k] ?? 0;
  const pair = (label: string, f: (v: string) => number, digits = 3) => console.log(`  ${label}: home ${f('home').toFixed(digits)}, road ${f('road').toFixed(digits)}, road/home ${(f('road') / f('home')).toFixed(3)}`);
  console.log(`${rulesId}: ${G} games, ${((Date.now() - t0) / 1000).toFixed(0)} s, noise ${noise ?? 'gate'}, overrides ${JSON.stringify(overrides)}`);
  console.log(`home margin ${mean.toFixed(2)} (se ${(sd / Math.sqrt(G)).toFixed(2)}, sd ${sd.toFixed(1)}), home win share ${win.toFixed(3)} (se ${(0.5 / Math.sqrt(G)).toFixed(3)})`);
  pair('offense yards per play', (v) => c(`yards.${v}`) / c(`plays.${v}`));
  pair('offense plays per game', (v) => c(`plays.${v}`) / G, 1);
  pair('offense touchdowns per game', (v) => c(`tds.${v}`) / G);
  pair('sacks per 100 dropbacks', (v) => 100 * c(`sacks.${v}`) / c(`dropbacks.${v}`));
  pair('pressures per 100 dropbacks', (v) => 100 * c(`pressures.${v}`) / c(`dropbacks.${v}`));
  pair('interceptions per 100 dropbacks', (v) => 100 * c(`ints.${v}`) / c(`dropbacks.${v}`));
  pair('fumbles lost per 100 plays', (v) => 100 * c(`fumbles.${v}`) / c(`plays.${v}`));
  for (const cause of ['knowledge', 'discipline', 'communication']) {
    pair(`${cause} errors per game, offense`, (v) => c(`err.${cause}.offense.${v}`) / G);
    pair(`${cause} errors per game, defense`, (v) => c(`err.${cause}.defense.${v}`) / G);
  }
  console.log(`  flags per team per game: ${Object.keys(n).filter((k) => k.startsWith('foul.')).sort((a, b) => c(b) - c(a)).map((k) => `${k.slice(5)} ${(c(k) / G / 2).toFixed(2)}`).join(', ')}`);
  pair('delay of game per 100 snaps', (v) => 100 * c(`dog.${v}`) / c(`snaps.${v}`));
  pair('false starts per 100 snaps', (v) => 100 * c(`fs.${v}`) / c(`snaps.${v}`));
  pair('defensive pre-snap fouls per 100 snaps (by the defense at that venue)', (v) => 100 * c(`defpre.${v}`) / c(`snaps.${v === 'home' ? 'road' : 'home'}`));
}
