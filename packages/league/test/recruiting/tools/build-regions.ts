// T4.1.1 hometown density: builds `packages/league/src/recruiting/data/regions.json` from the hometown
// fields of `data/people/college_players.csv` (the project's ESPN-lineage college roster register,
// data/people/README.md). The CSV is not committed.
//
// Run:  npx tsx packages/league/test/recruiting/tools/build-regions.ts [path/to/college_players.csv]
//
// Method (stated so the output can be checked by hand):
// - Population: one row per college player with home_country USA and a two-letter home_state, first
//   season 2015 or later (the open-transfer and early-signing era; older rows describe an older map).
// - Position groups are the T4.8.1 rows: QB; RB = RB, FB; WR; TE; OL = OL, OT, G, C; DL = DL, DE, DT, NT,
//   EDGE; LB = LB, OLB, ILB; DB = DB, CB, S; ST = PK, P, LS. Rows with no position, "?", ATH, PR or KR
//   count toward the all-positions share only.
// - Share of a state in a group = rows from that state in the group / rows in the group, to six places.
// Status of the result: 1 of 3 (one register). It replaces the "Unverified, not yet analysed" line of
// T4.1.1 with a measured starting value.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CSV = process.argv[2] ?? '/mnt/project-files/data/people/college_players.csv';
const OUT = join(import.meta.dirname, '../../../src/recruiting/data/regions.json');
const FROM_SEASON = 2015;

const GROUP: Record<string, string> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', OT: 'OL', G: 'OL', C: 'OL',
  DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL', EDGE: 'DL', LB: 'LB', OLB: 'LB', ILB: 'LB',
  DB: 'DB', CB: 'DB', S: 'DB', PK: 'ST', P: 'ST', LS: 'ST',
};
const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];

function parseLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

const lines = readFileSync(CSV, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const head = parseLine(lines[0]!);
const col = (n: string) => { const i = head.indexOf(n); if (i < 0) throw new Error(`no column ${n}`); return i; };
const [cPos, cState, cCountry, cFirst] = [col('position'), col('home_state'), col('home_country'), col('first_season')];

const counts = new Map<string, Map<string, number>>();
const bump = (g: string, s: string) => { const m = counts.get(g) ?? new Map<string, number>(); m.set(s, (m.get(s) ?? 0) + 1); counts.set(g, m); };
let rows = 0;
for (const line of lines.slice(1)) {
  const r = parseLine(line);
  if (r[cCountry] !== 'USA' || !/^[A-Z]{2}$/.test(r[cState] ?? '') || Number(r[cFirst]) < FROM_SEASON) continue;
  rows++;
  bump('ALL', r[cState]!);
  const g = GROUP[r[cPos] ?? ''];
  if (g) bump(g, r[cState]!);
}

const states = [...(counts.get('ALL')?.keys() ?? [])].sort();
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const share: Record<string, Record<string, number>> = {};
const n: Record<string, number> = {};
for (const g of ['ALL', ...GROUPS]) {
  const m = counts.get(g) ?? new Map<string, number>();
  const tot = [...m.values()].reduce((a, b) => a + b, 0);
  n[g] = tot;
  share[g] = Object.fromEntries(states.map((s) => [s, round6((m.get(s) ?? 0) / tot)]));
}

writeFileSync(OUT, JSON.stringify({
  $comment: 'Built by packages/league/test/recruiting/tools/build-regions.ts from data/people/college_players.csv (method in that file). Share of US college players from each home state, by T4.8.1 position group. T4.1.1 hometown density; status 1 of 3 (one register). Regenerate, do not edit.',
  leaf: 'T4.1.1', status: '1 of 3', source: 'data/people/college_players.csv (ESPN-lineage college roster register), home_state, first_season >= 2015',
  rows, groups: GROUPS, n, states, share,
}, null, 1) + '\n');
console.log(`regions.json: ${rows} rows, ${states.length} states`);
