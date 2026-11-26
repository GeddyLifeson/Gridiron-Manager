// Skill gap probe: real tick-engine games between placeholder rosters of unequal skill. Prints the mean margin
// (team A minus team B, sides alternated so the home edge cancels) and, with detail=1, each offense's rates.
// Usage: npx tsx scripts/skill-gap-probe.ts <ruleSetId> <issA> <issB> <games> [detail=1] [label=text]
//   attr=<regex>   only the matching attributes take issA and issB; the rest sit at base (default 50)
//   not=<regex>    every attribute takes issA and issB except the matching ones, which sit at base
//   base=<iss>     the level of the attributes held equal
//   <param>=<n>    any name with a dot is a parameter override, for example contest.passBlock.skillGain=0.1
//   procs=<n>     split the games over n child processes (same seeds as one process, so results are identical)
// One game has a margin sd near 17, so 16 games resolve about 4 points. Use 100 or more to rank small effects.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { season } from '@gm/world';
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
const [rulesId = 'pro_2026', a = '50', b = '50', n = '8', ...rest] = process.argv.slice(2);
const opt: Record<string, string> = {};
for (const r of rest) { const [k, v] = r.split('='); opt[k!] = v!; }
const ov: Record<string, number> = {};
for (const k of Object.keys(opt)) if (k.includes('.')) ov[k] = Number(opt[k]);
const core = season.createRealGameCore(rulesId, { paramOverrides: ov } as any);
const sm = stats.createStatsModule({ geometry: field.fieldGeometry(core.rules), params: core.params });
const T: Record<string, number>[] = [{}, {}];
const add = (t: number, k: string, v = 1) => { T[t]![k] = (T[t]![k] ?? 0) + v; };
const only = opt.attr ? new RegExp(opt.attr) : null;
const not = opt.not ? new RegExp(opt.not) : null;
const base = Number(opt.base ?? '50');
function team(side: 0 | 1, iss: number) {
  const t = season.placeholderTeam(side, only ? base : iss, season.UNIT_JERSEYS) as any;
  if (only) for (const p of t.players) for (const k of Object.keys(p.attributes)) if (only.test(k) && (!opt.pos || new RegExp(opt.pos).test(p.position))) p.attributes[k] = iss;
  if (not) for (const p of t.players) for (const k of Object.keys(p.attributes)) if (not.test(k)) p.attributes[k] = base;
  return t;
}
let sumM = 0, sumM2 = 0, pa = 0, pb = 0, wins = 0;
const N = Number(n);
const procs = Math.max(1, Number(opt.procs ?? '1'));
const child = process.env.SKILL_PROBE_CHILD;
const [i0, i1] = child ? child.split(',').map(Number) as [number, number] : [0, procs > 1 ? 0 : N];
if (!child && procs > 1) {
  const per = Math.ceil(N / procs);
  const parts = await Promise.all(Array.from({ length: procs }, (_, k) => new Promise<any>((resolve, reject) => {
    const c = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      { env: { ...process.env, SKILL_PROBE_CHILD: `${k * per},${Math.min(N, (k + 1) * per)}` }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', (code) => { if (code === 0) resolve(JSON.parse(out)); else reject(new Error(`child ${k} exit ${code}`)); });
  })));
  for (const part of parts) {
    sumM += part.sumM; sumM2 += part.sumM2; pa += part.pa; pb += part.pb; wins += part.wins;
    for (const t of [0, 1]) for (const k of Object.keys(part.T[t])) add(t, k, part.T[t][k]);
  }
}
for (let i = i0; i < i1; i++) {
  const seed = (0x3000 + i * 7919).toString(16).padStart(16, '0');
  // alternate home side so home edge cancels
  const flip = i % 2 === 1;
  const A = team(flip ? 1 : 0, Number(a)), B = team(flip ? 0 : 1, Number(b));
  const inp = { ...core.input(i, seed), teams: flip ? [B, A] : [A, B] } as any;
  const res: any = core.simulate(inp);
  const sc = res.final?.score ?? res.score ?? res.result?.score;
  if (!sc) { console.log(Object.keys(res)); process.exit(1); }
  // Contest outcomes straight from the truth events, by the team of the man with the ball (or the passer, or the
  // intended receiver): the player-level response each contest gives, to set beside real player rates.
  const teamOf = (id: number | null | undefined): number => id == null ? -1 : ((Math.floor(id / 1000) - 1 === 0) !== flip ? 0 : 1);
  for (const rec of res.records) for (const e of rec.truth?.events ?? []) {
    if (e.type === 'tackle_attempt') add(teamOf(e.carrierId), 'ev:tk:' + e.outcome);
    else if (e.type === 'catch_point' && e.intendedId != null) { add(teamOf(e.intendedId), 'ev:cp:' + e.outcome); if (e.contested) add(teamOf(e.intendedId), 'ev:cp:contested'); }
    else if (e.type === 'pressure') add(teamOf(e.passerId), 'ev:pr:' + e.kind);
    else if (e.type === 'contest' && String(e.contest).startsWith('move.')) add(teamOf(e.winnerId), 'ev:move:' + (teamOf(e.winnerId) === teamOf(e.loserId) ? 'x' : 'w'));
    else if (e.type === 'contest') add(teamOf(e.winnerId), 'ev:' + e.contest + ':won');
    else if (e.type === 'fumble') add(teamOf(e.playerId ?? e.carrierId), 'ev:fumble');
  }
  res.records.forEach((rec: any, k: number) => {
    const r: any = sm.playByPlay(rec, res.records[k + 1] ?? null);
    const offA = (r.offense === 0) !== flip; const t = offA ? 0 : 1;
    for (const f of r.penalties) add(((f.side === 0) !== flip) ? 0 : 1, 'pen');
    for (const f of r.penalties) add(((f.side === 0) !== flip) ? 0 : 1, 'penYd', f.yards);
    if (r.noPlay) { add(t, 'noPlay'); return; }
    add(t, 'kind:' + r.playKind + ':' + r.resultType);
    // Returns, by the returning side (the kicking play's defense): count and yards per punt and kickoff return.
    if (r.textKey === 'pbp.punt_returned' || r.textKey === 'pbp.kickoff_returned') {
      const k = r.textKey === 'pbp.punt_returned' ? 'pr' : 'kr';
      add(1 - t, 'ret:' + k + ':n'); add(1 - t, 'ret:' + k + ':yd', Number(r.textParams.returnYards) || 0);
    }
    if (r.playKind !== 'scrimmage') return;
    add(t, 'plays');
    if (r.dropback) { add(t, 'db'); if (r.sack) add(t, 'sack'); else if (r.scramble) add(t, 'scr'); else { add(t, 'att'); add(t, 'passYd', r.yardsGained); if (r.airYd !== null) add(t, 'air', r.airYd); if (r.resultType === 'complete' || r.yardsAfterCatch !== null) add(t, 'cmp'); } if (r.interception) add(t, 'int'); if (r.pressure) add(t, 'press'); }
    else if (r.offenseKind && !r.kickKind) { add(t, 'rush'); add(t, 'rushYd', r.yardsGained); if (r.yardsGained >= 10) add(t, 'r10'); if (r.yardsGained <= 0) add(t, 'stuff'); }
    if (r.kickKind) add(t, 'kick:' + r.kickKind);
    if (r.fumbleLost) add(t, 'fumL'); if (r.touchdown) add(t, 'td'); if (r.firstDown) add(t, 'fd');
  });
  const sa = flip ? sc[1] : sc[0], sb = flip ? sc[0] : sc[1];
  sumM += sa - sb; sumM2 += (sa - sb) ** 2; pa += sa; pb += sb; if (sa > sb) wins++;
}
if (child) { process.stdout.write(JSON.stringify({ sumM, sumM2, pa, pb, wins, T })); process.exit(0); }
const mean = sumM / N, sd = Math.sqrt(Math.max(0, sumM2 / N - mean * mean));
console.log(`${rulesId} ${a} v ${b} ${opt.label ?? opt.attr ?? 'all'} ${opt.pos ?? ''} n=${N}: margin ${mean.toFixed(1)} (sd ${sd.toFixed(1)}, se ${(sd / Math.sqrt(N)).toFixed(1)}) pts ${(pa / N).toFixed(1)}-${(pb / N).toFixed(1)} winA ${(wins / N).toFixed(2)}`);

if (opt.detail) for (const t of [0, 1]) { const x = T[t]!; const g = (k: string) => x[k] ?? 0;
  console.log(`  ${t === 0 ? 'A' : 'B'} off/gm: plays ${(g('plays') / N).toFixed(1)} db ${(g('db') / N).toFixed(1)} cmp% ${(100 * g('cmp') / g('att')).toFixed(1)} y/a ${(g('passYd') / g('att')).toFixed(2)} air ${(g('air') / g('att')).toFixed(1)} sack% ${(100 * g('sack') / g('db')).toFixed(1)} press% ${(100 * g('press') / g('db')).toFixed(1)} int% ${(100 * g('int') / g('att')).toFixed(1)} scr% ${(100 * g('scr') / g('db')).toFixed(1)} | rush ${(g('rush') / N).toFixed(1)} ypc ${(g('rushYd') / g('rush')).toFixed(2)} r10% ${(100 * g('r10') / g('rush')).toFixed(1)} stuff% ${(100 * g('stuff') / g('rush')).toFixed(1)} | fumL ${(g('fumL') / N).toFixed(2)} td ${(g('td') / N).toFixed(2)} fd ${(g('fd') / N).toFixed(1)} pen ${(g('pen') / N).toFixed(1)} penYd ${(g('penYd') / N).toFixed(0)} noPlay ${(g('noPlay') / N).toFixed(1)}`);
  const tk = g('ev:tk:made') + g('ev:tk:broken') + g('ev:tk:missed'), cc = g('ev:cp:catch') + g('ev:cp:drop');
  const cp = Object.keys(x).filter((k) => k.startsWith('ev:cp:') && k !== 'ev:cp:contested').reduce((a, k) => a + x[k]!, 0);
  console.log(`   as ball side: tackled ${(100 * g('ev:tk:made') / tk).toFixed(1)}% of ${(tk / N).toFixed(1)} attempts (broken ${(100 * g('ev:tk:broken') / tk).toFixed(1)}, missed ${(100 * g('ev:tk:missed') / tk).toFixed(1)}) | catch points ${(cp / N).toFixed(1)}: caught ${(100 * g('ev:cp:catch') / cp).toFixed(1)}% drop ${(100 * g('ev:cp:drop') / cc).toFixed(1)}% of hands-on, breakup ${(100 * g('ev:cp:breakup') / cp).toFixed(1)}% int ${(100 * g('ev:cp:interception') / cp).toFixed(1)}% uncatchable ${(100 * g('ev:cp:uncatchable') / cp).toFixed(1)}% grounded ${(100 * g('ev:cp:grounded') / cp).toFixed(1)}% contested ${(100 * g('ev:cp:contested') / cp).toFixed(1)}%`);
  console.log(`   returns: punt ${(g('ret:pr:n') / N).toFixed(2)}/gm at ${(g('ret:pr:yd') / g('ret:pr:n')).toFixed(2)} yd, kickoff ${(g('ret:kr:n') / N).toFixed(2)}/gm at ${(g('ret:kr:yd') / g('ret:kr:n')).toFixed(2)} yd`);
  console.log('   ' + Object.keys(x).filter((k) => k.includes(':')).sort().map((k) => `${k} ${(x[k]! / N).toFixed(2)}`).join(', '));
}
