// Skill gap probe: real tick-engine games between placeholder rosters of unequal skill. Prints the mean margin
// (team A minus team B, sides alternated so the home edge cancels) and, with detail=1, each offense's rates.
// Usage: npx tsx scripts/skill-gap-probe.ts <ruleSetId> <issA> <issB> <games> [detail=1] [label=text]
//   attr=<regex>   only the matching attributes take issA and issB; the rest sit at base (default 50)
//   not=<regex>    every attribute takes issA and issB except the matching ones, which sit at base
//   base=<iss>     the level of the attributes held equal
//   <param>=<n>    any name with a dot is a parameter override, for example contest.passBlock.skillGain=0.1
// One game has a margin sd near 17, so 16 games resolve about 4 points. Use 100 or more to rank small effects.
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
for (let i = 0; i < N; i++) {
  const seed = (0x3000 + i * 7919).toString(16).padStart(16, '0');
  // alternate home side so home edge cancels
  const flip = i % 2 === 1;
  const A = team(flip ? 1 : 0, Number(a)), B = team(flip ? 0 : 1, Number(b));
  const inp = { ...core.input(i, seed), teams: flip ? [B, A] : [A, B] } as any;
  const res: any = core.simulate(inp);
  const sc = res.final?.score ?? res.score ?? res.result?.score;
  if (!sc) { console.log(Object.keys(res)); process.exit(1); }
  res.records.forEach((rec: any, k: number) => {
    const r: any = sm.playByPlay(rec, res.records[k + 1] ?? null);
    const offA = (r.offense === 0) !== flip; const t = offA ? 0 : 1;
    for (const f of r.penalties) add(((f.side === 0) !== flip) ? 0 : 1, 'pen');
    for (const f of r.penalties) add(((f.side === 0) !== flip) ? 0 : 1, 'penYd', f.yards);
    if (r.noPlay) { add(t, 'noPlay'); return; }
    add(t, 'kind:' + r.playKind + ':' + r.resultType);
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
const mean = sumM / N, sd = Math.sqrt(Math.max(0, sumM2 / N - mean * mean));
console.log(`${rulesId} ${a} v ${b} ${opt.label ?? opt.attr ?? 'all'} ${opt.pos ?? ''} n=${N}: margin ${mean.toFixed(1)} (sd ${sd.toFixed(1)}, se ${(sd / Math.sqrt(N)).toFixed(1)}) pts ${(pa / N).toFixed(1)}-${(pb / N).toFixed(1)} winA ${(wins / N).toFixed(2)}`);

if (opt.detail) for (const t of [0, 1]) { const x = T[t]!; const g = (k: string) => x[k] ?? 0;
  console.log(`  ${t === 0 ? 'A' : 'B'} off/gm: plays ${(g('plays') / N).toFixed(1)} db ${(g('db') / N).toFixed(1)} cmp% ${(100 * g('cmp') / g('att')).toFixed(1)} y/a ${(g('passYd') / g('att')).toFixed(2)} air ${(g('air') / g('att')).toFixed(1)} sack% ${(100 * g('sack') / g('db')).toFixed(1)} press% ${(100 * g('press') / g('db')).toFixed(1)} int% ${(100 * g('int') / g('att')).toFixed(1)} scr% ${(100 * g('scr') / g('db')).toFixed(1)} | rush ${(g('rush') / N).toFixed(1)} ypc ${(g('rushYd') / g('rush')).toFixed(2)} r10% ${(100 * g('r10') / g('rush')).toFixed(1)} stuff% ${(100 * g('stuff') / g('rush')).toFixed(1)} | fumL ${(g('fumL') / N).toFixed(2)} td ${(g('td') / N).toFixed(2)} fd ${(g('fd') / N).toFixed(1)} pen ${(g('pen') / N).toFixed(1)} penYd ${(g('penYd') / N).toFixed(0)} noPlay ${(g('noPlay') / N).toFixed(1)}`);
  console.log('   ' + Object.keys(x).filter((k) => k.includes(':')).sort().map((k) => `${k} ${(x[k]! / N).toFixed(2)}`).join(', '));
}
