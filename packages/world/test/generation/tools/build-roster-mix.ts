// Rebuilds src/generation/data/roster-mix.json from the project's real roster files (one source each).
// Run: npx tsx packages/world/test/generation/tools/build-roster-mix.ts [DATA_DIR]
// DATA_DIR defaults to /mnt/project-files/data/people. Counts only; no name is read or written.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? '/mnt/project-files/data/people';

function rows(file: string): Record<string, string>[] {
  const text = readFileSync(join(dir, file), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const split = (l: string): string[] => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i]!;
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  };
  const head = split(lines[0]!);
  return lines.slice(1).map((l) => { const f = split(l); return Object.fromEntries(head.map((h, i) => [h, f[i] ?? ''])); });
}

const count = (xs: string[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
};

// Pro: depth-chart position of every 2025 row with status ACT (32 clubs).
const pro = rows('nfl_rosters_2025_2026.csv').filter((r) => r.season === '2025' && r.status === 'ACT');
const proCounts = count(pro.map((r) => r.depth_chart_position!));

// College: 2025 position column. Group codes (OL, DL, DB, LB) are split by the pro within-group shares
// (Assumption: the file gives no finer code for most rows). Blank and unknown codes are left out.
const GROUP_SPLIT: Record<string, string[]> = { OL: ['T', 'G', 'C'], DL: ['DT', 'DE', 'NT'], DB: ['CB', 'FS', 'SS'], LB: ['OLB', 'ILB', 'MLB'], S: ['FS', 'SS'] };
const DIRECT: Record<string, string> = { WR: 'WR', RB: 'RB', TE: 'TE', QB: 'QB', CB: 'CB', PK: 'K', DE: 'DE', DT: 'DT', LS: 'LS', P: 'P', EDGE: 'DE', OT: 'T', G: 'G', FB: 'FB', C: 'C', NT: 'NT' };
const college = rows('college_roster_seasons_2010_2026.csv').filter((r) => r.season === '2025');
const raw = count(college.map((r) => r.position!));
const collegeCounts: Record<string, number> = {};
let left = 0;
for (const [code, n] of Object.entries(raw)) {
  const d = DIRECT[code];
  if (d) { collegeCounts[d] = (collegeCounts[d] ?? 0) + n; continue; }
  const parts = GROUP_SPLIT[code];
  if (!parts) { left += n; continue; }
  const total = parts.reduce((a, p) => a + (proCounts[p] ?? 0), 0);
  for (const p of parts) collegeCounts[p] = (collegeCounts[p] ?? 0) + (n * (proCounts[p] ?? 0)) / total;
}
for (const k of Object.keys(collegeCounts)) collegeCounts[k] = Math.round(collegeCounts[k]! * 10) / 10;

const out = {
  note: 'Position mix of real rosters, as counts. World generation scales a mix to the roster limit read from the league rules.',
  status: 'Primary source read (1 of 3)',
  mixes: {
    pro: {
      source: 'project data nfl_rosters_2025_2026.csv (nflverse rosters), season 2025, status ACT, depth_chart_position',
      rows: pro.length, teams: new Set(pro.map((r) => r.team)).size, counts: proCounts,
    },
    college: {
      source: 'project data college_roster_seasons_2010_2026.csv (cfbfastR, ESPN-derived), season 2025, position',
      assumption: 'Group codes OL, DL, DB, LB and S are split by the pro within-group shares; blank, ATH, KR and ? rows are left out.',
      rows: college.length, leftOut: left, teams: new Set(college.map((r) => r.team)).size,
      counts: Object.fromEntries(Object.entries(collegeCounts).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    },
  },
};
writeFileSync(new URL('../../../src/generation/data/roster-mix.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.mixes.pro.counts), out.mixes.college.rows, left);
