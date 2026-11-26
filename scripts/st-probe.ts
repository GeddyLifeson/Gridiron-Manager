// Special teams probe: kicking-game numbers of a batch of real games on the tick engine, with parameter overrides.
// Usage: npx tsx scripts/st-probe.ts <ruleSetId> <gamesPerProcess> <processes> [--out file.txt] [--dump plays.jsonl] [name=value ...]
// The calibration report has few kicking rows (no return length, punt distance, touchback or fair catch rate), so this
// reads the statistics module's play facts directly. It steers tuning only; the gate is `headless calibrate`.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Contract, field } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import { season } from '@gm/world';

const [rulesId = 'pro_2026', gamesArg = '24', procsArg = '4', ...rest] = process.argv.slice(2);
const games = Number(gamesArg), procs = Number(procsArg);
const overrides: Record<string, number> = {};
let out: string | null = null, dump: string | null = null;
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (a === '--out') out = rest[++i]!;
  else if (a === '--dump') dump = rest[++i]!;
  else { const [k, v] = a.split('='); overrides[k!] = Number(v); }
}

/** One kicking play, flattened. */
interface Row {
  k: 'punt' | 'kickoff' | 'fg' | 'xp';
  from?: number; gross?: number; net?: number; hang?: number; tb?: boolean; blocked?: boolean; inside?: boolean;
  out?: 'fair' | 'ret' | 'none' | 'tb'; ry?: number; td?: boolean; muff?: boolean; muffLost?: boolean; dead?: string;
  dist?: number | null; good?: boolean; land?: number; startAfter?: number | null; coverS?: number | null;
}

if (process.env.ST_CHILD) {
  const seed = process.env.ST_CHILD;
  const core = season.createRealGameCore(rulesId, { paramOverrides: overrides });
  const geometry = field.fieldGeometry(core.rules);
  const deps = { geometry, params: core.params };
  const rows: Row[] = [];
  let teamGames = 0;
  for (let i = 0; i < games; i++) {
    const input = core.input(i, (BigInt('0x' + seed) + BigInt(i) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn).toString(16).padStart(16, '0'));
    const res = flow.simulateGame(input, core.deps(input));
    teamGames += 2;
    res.records.forEach((rec, idx) => {
      const f = stats.readPlay(rec, deps);
      if (!f.counts) return;
      const dead = rec.truth.events.find((e) => e.type === 'dead_ball');
      const muffs = f.fumbles.filter((x) => x.muff);
      const ret = f.kickReturn;
      const outcome: Row['out'] = ret?.fairCatch ? 'fair' : ret?.returned ? 'ret' : rec.final.touchback ? 'tb' : 'none';
      const base = { out: outcome, ry: ret?.returned ? ret.yards : undefined, td: ret?.touchdown ?? false, muff: muffs.length > 0, muffLost: muffs.some((m) => m.lost), dead: dead && dead.type === 'dead_ball' ? dead.reason : '' };
      if (f.punt) rows.push({ k: 'punt', from: Math.round(Contract.yardsToGoal(geometry, rec.situation.ballX, rec.situation.attackDir)), gross: f.punt.gross, net: f.punt.net, hang: f.punt.hangTimeS, tb: f.punt.touchback, blocked: f.punt.blocked, inside: f.punt.inside, ...base });
      else if (f.kickoff) {
        const next = res.records[idx + 1];
        rows.push({ k: 'kickoff', land: f.kickoff.distanceYd, tb: f.kickoff.touchback, hang: f.kick?.hangTimeS, startAfter: next && next.situation.playKind === 'scrimmage' ? 100 - Math.round(Contract.yardsToGoal(geometry, next.situation.ballX, next.situation.attackDir)) : null, ...base });
      } else if (f.placeKick) rows.push({ k: f.placeKick.kind === 'try_kick' ? 'xp' : 'fg', dist: f.placeKick.distanceYd, good: f.placeKick.good, blocked: f.placeKick.blocked });
    });
  }
  process.stdout.write(JSON.stringify({ rows, teamGames }));
} else {
  const runs = await Promise.all(Array.from({ length: procs }, (_, k) => new Promise<{ rows: Row[]; teamGames: number }>((ok, bad) => {
    const seed = (0x51000n + BigInt(k) * 0x1000001n).toString(16).padStart(16, '0');
    const c = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env: { ...process.env, ST_CHILD: seed }, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; });
    c.on('close', (code) => (code === 0 ? ok(JSON.parse(buf)) : bad(new Error(`child ${k} exit ${code}`))));
  })));
  const rows = runs.flatMap((r) => r.rows), tg = runs.reduce((a, r) => a + r.teamGames, 0);
  if (dump) writeFileSync(dump, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const pct = (n: number, d: number) => (d ? (100 * n / d).toFixed(1) + '%' : '-');
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : NaN; };
  const L: string[] = [`${rulesId} ${games * procs} games (${tg} team-games)${Object.keys(overrides).length ? ' ' + JSON.stringify(overrides) : ''}`];
  for (const kind of ['punt', 'kickoff'] as const) {
    const P = rows.filter((r) => r.k === kind), R = P.filter((r) => r.out === 'ret'), ry = R.map((r) => r.ry!);
    L.push(`${kind}s ${P.length} (${(P.length / tg).toFixed(2)} per team-game)`);
    if (kind === 'punt') {
      const nb = P.filter((r) => !r.blocked);
      L.push(`  gross ${mean(nb.map((r) => r.gross!)).toFixed(1)}  net ${mean(nb.map((r) => r.net!)).toFixed(1)}  hang ${mean(nb.map((r) => r.hang!)).toFixed(2)} s  blocked ${pct(P.length - nb.length, P.length)}  inside 20 ${pct(P.filter((r) => r.inside).length, P.length)}`);
      const open = nb.filter((r) => r.from! >= 60);
      L.push(`  open field (own 40 or deeper, ${open.length}): gross ${mean(open.map((r) => r.gross!)).toFixed(1)}  net ${mean(open.map((r) => r.net!)).toFixed(1)}`);
    } else {
      L.push(`  landing distance ${mean(P.map((r) => r.land!)).toFixed(1)}  hang ${mean(P.map((r) => r.hang ?? NaN).filter((x) => !Number.isNaN(x))).toFixed(2)} s  next drive starts at own ${mean(P.map((r) => r.startAfter).filter((x): x is number => x != null)).toFixed(1)}`);
    }
    L.push(`  returned ${pct(R.length, P.length)} (${(R.length / tg).toFixed(2)} per team-game)  fair catch ${pct(P.filter((r) => r.out === 'fair').length, P.length)}  touchback ${pct(P.filter((r) => r.tb).length, P.length)}  not fielded ${pct(P.filter((r) => r.out === 'none').length, P.length)}`);
    L.push(`  return yards: mean ${mean(ry).toFixed(2)}  median ${q(ry, 0.5)}  p10 ${q(ry, 0.1)}  p90 ${q(ry, 0.9)}  20+ ${pct(ry.filter((y) => y >= 20).length, ry.length)}  40+ ${pct(ry.filter((y) => y >= 40).length, ry.length)}  touchdowns ${pct(R.filter((r) => r.td).length, R.length)}`);
    L.push(`  muffs ${pct(P.filter((r) => r.muff).length, P.filter((r) => r.out !== 'tb' && r.out !== 'none' || r.muff).length)} of balls fielded, lost ${P.filter((r) => r.muffLost).length}`);
    const deadCounts = new Map<string, number>();
    for (const r of P) deadCounts.set(r.dead ?? '', (deadCounts.get(r.dead ?? '') ?? 0) + 1);
    L.push('  ended by: ' + [...deadCounts].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, P.length)}`).join(', '));
  }
  const FG = rows.filter((r) => r.k === 'fg'), XP = rows.filter((r) => r.k === 'xp');
  L.push(`field goals ${FG.length} (${(FG.length / tg).toFixed(2)} per team-game): ${pct(FG.filter((r) => r.good).length, FG.length)}  blocked ${pct(FG.filter((r) => r.blocked).length, FG.length)}`);
  for (const [lo, hi] of [[0, 29], [30, 39], [40, 49], [50, 54], [55, 59], [60, 99]] as const) {
    const B = FG.filter((r) => r.dist! >= lo && r.dist! <= hi);
    L.push(`  ${lo}-${hi}: ${pct(B.filter((r) => r.good).length, B.length)} of ${B.length}`);
  }
  L.push(`extra points ${XP.length}: ${pct(XP.filter((r) => r.good).length, XP.length)}  blocked ${pct(XP.filter((r) => r.blocked).length, XP.length)}`);
  const text = L.join('\n') + '\n';
  if (out) writeFileSync(out, text);
  console.log(text);
}
