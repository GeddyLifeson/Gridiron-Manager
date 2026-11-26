// Automated calibration: the ranked report the tuning threads read (Markdown, fixed order, no clock).
import type { BlockRow, RowMeta } from './job.ts';
import { unitOf, valueAt, type Tunable } from './registry.ts';
import type { Confirmed, Liveness, ScreenFit } from './scan.ts';
import { rowNeed } from './scan.ts';
import type { SearchStepLog } from './search.ts';
import { summarize, type RunSummary } from './stats.ts';

export interface ReportInput {
  readonly ruleSetId: string;
  readonly build: string;
  readonly metas: readonly RowMeta[];
  readonly baseline: { readonly games: number; readonly blockGames: number; readonly blocks: readonly (readonly BlockRow[])[]; readonly overrides: Readonly<Record<string, number>> };
  /** Every parameter the scan looked at, with its verdict from the dead check. */
  readonly dead?: { readonly games: number; readonly params: readonly Tunable[]; readonly verdict: readonly Liveness[]; readonly errors: Readonly<Record<string, string>> };
  readonly screen?: { readonly params: readonly Tunable[]; readonly fit: ScreenFit; readonly games: number; readonly step: number; readonly failedRuns: number; readonly refused: Readonly<Record<string, string>> };
  readonly confirm?: { readonly params: readonly Tunable[]; readonly confirmed: readonly Confirmed[]; readonly step: number; readonly games: number };
  readonly search?: {
    readonly params: readonly Tunable[];
    readonly steps: readonly SearchStepLog[];
    readonly bestU: readonly number[];
    readonly best: RunSummary;
    readonly holdout: null | { readonly games: number; readonly before: RunSummary; readonly after: RunSummary; readonly lossDrop: number; readonly lossDropSe: number | null };
  };
}

const f = (v: number | null | undefined, digits = 4): string => (v === null || v === undefined || !Number.isFinite(v) ? '-' : String(Number(v.toPrecision(digits))));
const realOf = (m: RowMeta): string => (typeof m.target.value === 'number' ? f(m.target.value) : m.target.kind);
const signed = (v: number, digits = 2): string => (v > 0 ? '+' : '') + f(v, digits);

/** Which side of a lever helps a row that sits at z tolerances: the room in the range on that side, in tolerances. */
function reach(z: number, slopeTol: number, u: number): number {
  const wantUp = (z > 0) !== (slopeTol > 0);
  return Math.abs(slopeTol) * (wantUp ? 1 - u : u);
}

export function formatTuneReport(inp: ReportInput): string {
  const { metas } = inp;
  const base = summarize(metas, inp.baseline.blocks);
  const need = rowNeed(metas, base.scores);
  const L: string[] = [];
  const failing = metas.map((_, i) => i).filter((i) => base.scores[i]!.pass === false).sort((a, b) => need[b]! - need[a]! || Math.abs(base.scores[b]!.z ?? 0) - Math.abs(base.scores[a]!.z ?? 0));

  L.push(`# Calibration search report: ${inp.ruleSetId}`, '');
  L.push(`Build ${inp.build}. Baseline ${inp.baseline.games} games in blocks of ${inp.baseline.blockGames}${Object.keys(inp.baseline.overrides).length ? `, with ${Object.keys(inp.baseline.overrides).length} parameter overrides` : ''}.`);
  L.push(`Rows measured ${base.measured}, passing ${base.passed}, failing ${base.measured - base.passed}. Loss ${f(base.loss)} (0 is every row on its target).`, '');
  L.push('This report steers tuning. It is not the gate: the gate is `headless calibrate`. Every number below came out of played games.', '');

  // 1. where it stands
  L.push('## 1. Rows off target, worst first', '');
  L.push('"Off by" is the error in tolerances (inside plus or minus 1 passes). "Sure" says whether the miss is larger than the noise of this run: the gap past the tolerance is more than 2 standard errors.', '');
  L.push('| row | tier | status | real | simulated | std error | off by | sure |', '|---|---|---|---|---|---|---|---|');
  for (const i of failing) {
    const e = base.estimates[i]!, s = base.scores[i]!, m = metas[i]!;
    const beyond = s.err !== null && s.scale !== null ? Math.abs(s.err) - s.scale : null;
    const sure = e.se === null || beyond === null ? '?' : beyond > 2 * e.se ? 'yes' : 'no';
    const sim = typeof m.target.value === 'number' ? f(e.value) : `error ${f(e.value)}`;
    L.push(`| ${m.id} | ${m.target.tier} | ${m.status ?? 'none'} | ${realOf(m)} | ${sim} | ${f(e.se, 3)} | ${s.z === null ? '-' : signed(s.z)} | ${sure} |`);
  }
  const shaky = metas.map((_, i) => i).filter((i) => {
    const e = base.estimates[i]!, s = base.scores[i]!;
    return s.pass === true && e.se !== null && s.err !== null && s.scale !== null && s.scale - Math.abs(s.err) < 2 * e.se;
  });
  L.push('', `Passing rows that could fail on another sample (inside tolerance by less than 2 standard errors): ${shaky.length ? shaky.map((i) => metas[i]!.id).join(', ') : 'none'}.`, '');

  // 2. dead parameters
  if (inp.dead) {
    const d = inp.dead;
    const count = (v: Liveness): number => d.verdict.filter((x) => x === v).length;
    L.push('## 2. Parameters that change nothing', '');
    L.push(`${d.params.length} tunable parameters checked, each pushed to the far end of its range for ${d.games} game${d.games === 1 ? '' : 's'}: ${count('live')} changed the game, ${count('dead')} left it identical play for play, ${count('error')} made the engine refuse the value.`);
    L.push('A dead parameter is either unwired, or read only in a situation the check game never reached. Either way no amount of tuning it will move the gate as things stand.', '');
    const mods = [...new Set(d.params.map((p) => p.module))].sort();
    L.push('| module | parameters | live | dead | refused |', '|---|---|---|---|---|');
    for (const mod of mods) {
      const idx = d.params.map((p, j) => (p.module === mod ? j : -1)).filter((j) => j >= 0);
      const c = (v: Liveness): number => idx.filter((j) => d.verdict[j] === v).length;
      L.push(`| ${mod} | ${idx.length} | ${c('live')} | ${c('dead')} | ${c('error')} |`);
    }
    const errs = Object.entries(d.errors);
    if (errs.length) { L.push('', 'Refused values:'); for (const [n, e] of errs.slice(0, 30)) L.push(`- ${n}: ${e}`); }
    const outside = d.params.filter((p) => p.outsideDeclared);
    if (outside.length) L.push('', `Current value outside its declared range (the range or the value is wrong): ${outside.map((p) => p.name).join(', ')}.`);
    L.push('', 'The full list by name is in `dead.json`.', '');
  }

  // 3. levers per row
  const conf = inp.confirm;
  const confIndex = new Map<string, number>((conf?.confirmed ?? []).map((c, k) => [c.name, k]));
  const tolSlope = (k: number, i: number): { s: number; se: number } | null => {
    const c = conf!.confirmed[k]!, sc = base.scores[i]!.scale;
    if (c.slope[i] === null || c.se[i] === null || c.slope[i] === undefined || !sc) return null;
    return { s: c.slope[i]! / sc, se: c.se[i]! / sc };
  };
  if (inp.screen || conf) {
    L.push('## 3. Levers for each row off target', '');
    if (inp.screen) L.push(`Screen: ${inp.screen.fit.runs} runs of ${inp.screen.games} games, every live parameter (${inp.screen.params.length}) nudged ${f(inp.screen.step * 100, 3)}% of its range at once${inp.screen.failedRuns ? `; ${inp.screen.failedRuns} runs failed and were left out` : ''}. A screen hit is a lead, not a measurement.`);
    if (inp.screen && Object.keys(inp.screen.refused).length) L.push(`Left out, because the engine throws when a table moves them: ${Object.keys(inp.screen.refused).join(', ')}.`);
    if (conf) L.push(`Confirmed: ${conf.confirmed.length} parameters moved one at a time, ${f(conf.step * 100, 3)}% of range each way, ${conf.games} games per side on the baseline's seeds. Slopes are in tolerances per full range of the parameter; "reach" is how many tolerances the row could move before the parameter hits the end of its range, if the slope held.`);
    L.push('');
    const short: { i: number; reach: number; any: boolean }[] = [];
    for (const i of failing) {
      const z = base.scores[i]!.z;
      if (z === null) continue;
      const lines: string[] = [];
      let totalReach = 0;
      if (conf) {
        const hits = conf.confirmed.map((_, k) => ({ k, v: tolSlope(k, i) })).filter((h) => h.v !== null && h.v.se > 0 && Math.abs(h.v.s / h.v.se) >= 2)
          .sort((p, q) => Math.abs(q.v!.s) - Math.abs(p.v!.s)).slice(0, 8);
        for (const h of hits) {
          const p = conf.params[h.k]!;
          const r = reach(z, h.v!.s, unitOf(p));
          totalReach += r;
          lines.push(`  - ${p.name} (${f(p.value)}, range ${f(p.lo)} to ${f(p.hi)}): ${signed(h.v!.s)} plus or minus ${f(h.v!.se, 2)}; move it ${(z > 0) !== (h.v!.s > 0) ? 'up' : 'down'}, reach ${f(r, 2)}`);
        }
      }
      if (inp.screen) {
        const t = inp.screen.fit.t[i]!;
        const leads = [...t.keys()].filter((j) => Math.abs(t[j]!) >= 3.5 && !confIndex.has(inp.screen!.params[j]!.name)).sort((p, q) => Math.abs(t[q]!) - Math.abs(t[p]!)).slice(0, 4);
        for (const j of leads) lines.push(`  - lead, not confirmed: ${inp.screen.params[j]!.name} (screen t ${signed(t[j]!)})`);
      }
      if (totalReach < Math.abs(z) - 1) short.push({ i, reach: totalReach, any: lines.length > 0 });
      if (lines.length === 0) continue;
      L.push(`- **${metas[i]!.id}** (off by ${signed(z)})`);
      L.push(...lines);
    }
    L.push('', '### Rows no confirmed parameter can bring inside tolerance', '');
    L.push('For these the confirmed levers together cannot reach the target inside their ranges, even if every slope held all the way. They need a hand fix in the engine (a behaviour bug, a missing mechanism) or a lever the scan has not confirmed yet. Do not spend tuning runs on them.', '');
    const never = (i: number): boolean => typeof metas[i]!.target.value === 'number' && metas[i]!.target.value !== 0 && base.estimates[i]!.value === 0;
    const line = (x: { i: number; reach: number }): string => `- ${metas[x.i]!.id} (off by ${signed(base.scores[x.i]!.z!)}${x.reach > 0 ? `, levers reach ${f(x.reach, 2)}` : ''})`;
    const dead0 = short.filter((x) => never(x.i)), rest = short.filter((x) => !never(x.i));
    if (short.length === 0) L.push('None.', '');
    if (dead0.length) L.push(`The event never happens in the simulation (value 0 in every game): ${dead0.map((x) => metas[x.i]!.id).join(', ')}.`, '');
    if (rest.length) L.push(rest.map(line).join('\n'), '');
  }

  // 4. parameters ranked
  if (conf) {
    L.push('## 4. Confirmed parameters and everything each one moves', '');
    L.push('Rows a parameter moves by at least 2 standard errors, strongest first. Rows that pass today are marked: moving the parameter costs them.', '');
    for (let k = 0; k < conf.confirmed.length; k++) {
      const c = conf.confirmed[k]!, p = conf.params[k]!;
      if (c.error) { L.push(`- **${p.name}**: ${c.error}`); continue; }
      const hits = metas.map((_, i) => ({ i, v: tolSlope(k, i) })).filter((h) => h.v !== null && h.v.se > 0 && Math.abs(h.v.s / h.v.se) >= 2).sort((a, b) => Math.abs(b.v!.s) - Math.abs(a.v!.s)).slice(0, 10);
      L.push(`- **${p.name}** = ${f(p.value)} ${p.unit} (range ${f(p.lo)} to ${f(p.hi)}; ${p.module}; ${p.leaf}): ${hits.length ? '' : 'no row moved beyond noise'}`);
      for (const h of hits) L.push(`  - ${metas[h.i]!.id}: ${signed(h.v!.s)} plus or minus ${f(h.v!.se, 2)}${base.scores[h.i]!.pass ? ' (passes today)' : ''}`);
    }
    L.push('');
  }

  // 5. proposal
  if (inp.search) {
    const s = inp.search;
    L.push('## 5. Proposed parameter set', '');
    const moved = s.params.map((p, j) => ({ p, to: valueAt(p, s.bestU[j]!), du: s.bestU[j]! - unitOf(p) })).filter((x) => Math.abs(x.du) > 1e-9);
    if (moved.length === 0) L.push('The search kept the current values: no step it played lowered the loss.', '');
    else {
      L.push('| parameter | now | proposed | range | move (share of range) |', '|---|---|---|---|---|');
      for (const x of moved.sort((a, b) => Math.abs(b.du) - Math.abs(a.du))) L.push(`| ${x.p.name} | ${f(x.p.value)} | ${f(x.to)} | ${f(x.p.lo)} to ${f(x.p.hi)} | ${signed(x.du * 100, 3)}% |`);
      L.push('', 'The same set is in `proposal.json` (name to value), ready for `--ov`.', '');
    }
    L.push('Search steps (each one played on the baseline\'s seeds):', '');
    L.push('| step | step size | predicted loss | played loss | rows passing | kept |', '|---|---|---|---|---|---|');
    L.push(`| start | - | - | ${f(base.loss)} | ${base.passed} | - |`);
    for (const st of s.steps) L.push(`| ${st.iteration} | ${f(st.trust, 3)} | ${f(st.predictedLoss)} | ${f(st.loss)} | ${st.passed ?? '-'} | ${st.accepted ? 'yes' : 'no'} |`);
    L.push('');
    if (s.holdout) {
      const h = s.holdout;
      L.push(`Check on ${h.games} fresh games per side (seeds the search never saw): rows passing ${h.before.passed} before, ${h.after.passed} after; loss ${f(h.before.loss)} before, ${f(h.after.loss)} after (drop ${f(h.lossDrop)} plus or minus ${f(h.lossDropSe, 3)}).`);
      const real = h.lossDropSe !== null && h.lossDrop > 2 * h.lossDropSe;
      L.push(real ? 'The improvement holds on fresh seeds.' : 'The improvement does NOT clearly hold on fresh seeds: treat the proposal as a lead and measure it again before using it.', '');
      const fixed = metas.filter((_, i) => h.before.scores[i]!.pass === false && h.after.scores[i]!.pass === true).map((m) => m.id);
      const broke = metas.filter((_, i) => h.before.scores[i]!.pass === true && h.after.scores[i]!.pass === false).map((m) => m.id);
      L.push(`Rows that now pass: ${fixed.length ? fixed.join(', ') : 'none'}.`, `Rows that now fail: ${broke.length ? broke.join(', ') : 'none'}.`, '');
      const big = metas.map((m, i) => ({ m, a: h.before.scores[i]!.z, b: h.after.scores[i]!.z })).filter((x) => x.a !== null && x.b !== null && Math.abs(x.b! - x.a!) >= 0.5)
        .sort((x, y) => Math.abs(y.b! - y.a!) - Math.abs(x.b! - x.a!)).slice(0, 25);
      if (big.length) {
        L.push('Largest moves on the fresh games (in tolerances):', '', '| row | before | after |', '|---|---|---|');
        for (const x of big) L.push(`| ${x.m.id} | ${signed(x.a!)} | ${signed(x.b!)} |`);
        L.push('');
      }
    }
  }

  L.push('## How to read and use this', '');
  L.push('- It only picks parameter values inside the ranges the parameter files declare. It cannot fix a behaviour bug, and it never writes a result: rows still come out of the play simulation.');
  L.push('- A parameter value it proposes is a starting value for calibration, not a football fact. The targets it steers by keep their own fact status; a provisional target stays provisional.');
  L.push('- Slopes are local. A proposal far from today\'s values was checked by playing it, not by trusting the slopes.');
  L.push('- Quantile and ordering rows are pooled from block errors here, so their values are close to, not equal to, the gate\'s. Run `headless calibrate` before calling anything passed.');
  return L.join('\n') + '\n';
}
