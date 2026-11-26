// Profile script of D13.2.2: builds the pro-entrant position profiles (means, spreads, full correlation
// matrix, empirical quantiles, skew) from the combine rows of `data/people/nfl_players.csv` and writes
// `packages/people/src/generator/data/pro-profiles.ts`.
//
// Run:  npx tsx packages/people/test/generator/tools/build-profiles.ts [path/to/nfl_players.csv]
// The CSV is the project's nflverse player register (data/people/README.md). It is not committed.
//
// Method (stated so the output can be checked by hand):
// - Population: register rows with a forty (combine participants who reached the NFL register).
// - Height and weight are the combine columns (`combine_ht` as feet-inches, `combine_wt`), which
//   reproduce the D13.2.2 table to two decimals.
// - Position: nflverse `position`, mapped as D13.2.2 (CB; S = S, FS (SAF rows left out: the D13.2.2 table and the D2.1.1 participation rates reproduce only without them); DT = DT, NT; EDGE = DE;
//   LB = LB, ILB, MLB, OLB; OT; IOL = C, G; RB; WR; TE; QB). Generic DB, DL and OL rows are left out.
// - Spreads are sample standard deviations (n - 1). Correlations are pairwise complete, then repaired to
//   the nearest positive definite correlation matrix (eigenvalue floor 0.001).
// - Quantiles are linear interpolation between order statistics (type 7).
// - FB, K, P and LS have under 60 rows (D13.2.2 "not listed", Unverified): their means and spreads are
//   their own, their correlation matrix is the mean of the eleven main positions' matrices.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repairCorrelation, minEigenvalue, type Matrix } from '../../../src/generator/linalg.ts';

const CSV = process.argv[2] ?? '/mnt/project-files/data/people/nfl_players.csv';
const OUT = join(import.meta.dirname, '../../../src/generator/data/pro-profiles.ts');

const VARS = ['heightIn', 'weightLb', 'fortyS', 'verticalIn', 'broadIn', 'threeConeS', 'shuttleS', 'benchReps'] as const;
const MAP: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OT: 'OT', C: 'IOL', G: 'IOL', DT: 'DT', NT: 'DT', DE: 'EDGE',
  LB: 'LB', ILB: 'LB', MLB: 'LB', OLB: 'LB', CB: 'CB', S: 'S', FS: 'S', FB: 'FB', K: 'K', P: 'P', LS: 'LS',
};
const MAIN = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'DT', 'EDGE', 'LB', 'CB', 'S'];
const LOW = ['FB', 'K', 'P', 'LS'];

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};
const feetInches = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = /^(\d+)-(\d+(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1]) * 12 + Number(m[2]) : num(s);
};

const lines = readFileSync(CSV, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const head = parseCsvLine(lines[0]!);
const col = (name: string) => { const i = head.indexOf(name); if (i < 0) throw new Error(`column ${name} missing`); return i; };
const C = {
  position: col('position'), forty: col('forty'), bench: col('bench'), vertical: col('vertical'), broad: col('broad_jump'),
  cone: col('cone'), shuttle: col('shuttle'), ht: col('combine_ht'), wt: col('combine_wt'),
};

const rowsBy = new Map<string, (number | null)[][]>();
for (const line of lines.slice(1)) {
  const r = parseCsvLine(line);
  if (num(r[C.forty]) === null) continue;
  const p = MAP[r[C.position] ?? ''];
  if (!p) continue;
  const v = [feetInches(r[C.ht]), num(r[C.wt]), num(r[C.forty]), num(r[C.vertical]), num(r[C.broad]), num(r[C.cone]), num(r[C.shuttle]), num(r[C.bench])];
  if (!rowsBy.has(p)) rowsBy.set(p, []);
  rowsBy.get(p)!.push(v);
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;
function stats(xs: number[]) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1));
  const m3 = xs.reduce((a, b) => a + ((b - mean) / sd) * ((b - mean) / sd) * ((b - mean) / sd), 0) / n;
  const s = xs.slice().sort((a, b) => a - b);
  const q = (p: number) => { const h = (n - 1) * p; const lo = Math.floor(h); const hi = Math.min(n - 1, lo + 1); return s[lo]! + (h - lo) * (s[hi]! - s[lo]!); };
  return { n, mean, sd, skew: m3, quantiles: [0.1, 0.25, 0.5, 0.75, 0.9].map(q) };
}
function corr(rows: (number | null)[][], i: number, j: number): number {
  const pairs = rows.filter((r) => r[i] !== null && r[j] !== null).map((r) => [r[i]!, r[j]!] as const);
  const n = pairs.length;
  if (n < 10) return 0;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); syy += (y - my) * (y - my); }
  return sxy / Math.sqrt(sxx * syy);
}

interface Built { position: string; n: number; vars: Record<string, { n: number; mean: number; sd: number; skew: number; quantiles: number[] } | null>; corr: Matrix; lowSample: boolean; repaired: number }
const built: Record<string, Built> = {};
for (const p of [...MAIN, ...LOW]) {
  const rows = rowsBy.get(p) ?? [];
  const vars: Built['vars'] = {};
  const present: number[] = [];
  VARS.forEach((v, i) => {
    const xs = rows.map((r) => r[i]).filter((x): x is number => x !== null);
    // A column with under 10% participation is "n/a" for the position (QB bench 0.03, D2.1.1 edge case).
    if (xs.length < (LOW.includes(p) ? 10 : 30) || xs.length < 0.1 * rows.length) { vars[v] = null; return; }
    const s = stats(xs);
    vars[v] = { n: s.n, mean: r4(s.mean), sd: r4(s.sd), skew: r4(s.skew), quantiles: s.quantiles.map(r4) };
    present.push(i);
  });
  const raw: Matrix = present.map((i) => present.map((j) => (i === j ? 1 : corr(rows, i, j))));
  const fixed = repairCorrelation(raw);
  let repaired = 0;
  for (let a = 0; a < raw.length; a++) for (let b = 0; b < raw.length; b++) repaired = Math.max(repaired, Math.abs(raw[a]![b]! - fixed[a]![b]!));
  built[p] = { position: p, n: rows.length, vars, corr: fixed.map((r) => r.map(r4)), lowSample: LOW.includes(p), repaired: r4(repaired) };
}
// Pooled matrix for the low-sample positions over the variables they have.
for (const p of LOW) {
  const b = built[p]!;
  const names = VARS.filter((v) => b.vars[v] !== null);
  const pooled: Matrix = names.map((a) => names.map((c) => {
    if (a === c) return 1;
    let s = 0, k = 0;
    for (const m of MAIN) {
      const mb = built[m]!;
      const mn = VARS.filter((v) => mb.vars[v] !== null);
      const ia = mn.indexOf(a), ic = mn.indexOf(c);
      if (ia >= 0 && ic >= 0) { s += mb.corr[ia]![ic]!; k++; }
    }
    return k ? s / k : 0;
  }));
  const fixed = repairCorrelation(pooled);
  b.corr = fixed.map((r) => r.map(r4));
}
for (const b of Object.values(built)) {
  const e = minEigenvalue(b.corr);
  if (!(e > 0)) throw new Error(`${b.position}: correlation matrix not positive definite after rounding (${e})`);
}

const header = `// GENERATED by packages/people/test/generator/tools/build-profiles.ts. Do not edit by hand: rerun the script.
// Source: data/people/nfl_players.csv (nflverse player register joined with nflverse combine data; 6,340
// players with a forty; data/people/README.md). Population: combine participants who reached the NFL
// register (D2.5.1 rule 3 states this on screen). Fact status: 1 of 3 for every number (computed from one
// source family; D13.2.2). Forty means are cross-checked in D2.2.1 (Verified) and in the profile test.
// Variable order of each correlation matrix: the variables of PROFILE_VARS that are not null, in order.
`;
const body = `export const PROFILE_SOURCE = {
  file: 'data/people/nfl_players.csv',
  description: 'nflverse player register with combine columns, rows with a forty',
  leaf: 'D13.2.2',
  status: '1 of 3',
} as const;

export const PROFILE_VARS = ${JSON.stringify(VARS)} as const;

export interface VarStats { n: number; mean: number; sd: number; skew: number; quantiles: number[] }
export interface ProProfileData {
  position: string;
  n: number;
  lowSample: boolean;
  /** Largest change the positive-definite repair made to any pairwise correlation. */
  repaired: number;
  vars: Record<(typeof PROFILE_VARS)[number], VarStats | null>;
  corr: number[][];
}

export const PRO_PROFILE_DATA: Record<string, ProProfileData> = {
${Object.values(built).map((b) => `  ${b.position}: ${JSON.stringify(b)},`).join('\n')}
};
`;
writeFileSync(OUT, header + body);
console.log(`wrote ${OUT}`);
for (const b of Object.values(built)) console.log(b.position, b.n, 'forty', b.vars.fortyS?.mean, 'repaired', b.repaired);
