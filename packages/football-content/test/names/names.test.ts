// G-18: name and hometown tables. Covers D13.5.1 (tables, frequency weights, independent draws), D13.5.2 (collision guard)
// and D13.5.3 (hometown by state share, then town). Real names are never stored: the guard holds one-way hashes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FactFile, computeStatus } from '@gm/schema';
import { cumulative, drawWeighted, foldToken, guardHash, guardSet, GUARD_HASH_WIDTH, type WeightedList } from '../../data/names/lib.ts';

const dir = new URL('../../data/names/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const first = load('first-names.json');
const last = load('surnames.json');
const towns = load('hometowns.json');
const suffixes = load('suffixes.json');
const guardFile = load('real-name-guard.json');
const factFile = load('fact-rows.json');
const crossChecks = load('cross-checks.json');
const inputs = load('build-inputs.json');
const refs = JSON.parse(readFileSync(new URL('../../data/world/reference-locations.json', import.meta.url), 'utf8')).locations as { state: string; region: string }[];
const guard = guardSet(guardFile.packed);

const REGIONS = ['northeast', 'mid_atlantic', 'southeast', 'deep_south', 'great_lakes', 'plains', 'texas', 'mountain', 'pacific'];

function checkRows(rows: WeightedList, min: number) {
  let prev = Infinity;
  const seen = new Set<string>();
  for (const [name, w] of rows) {
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(1);
    expect(Number.isInteger(w)).toBe(true);
    expect(w).toBeGreaterThanOrEqual(min);
    expect(w).toBeLessThanOrEqual(prev);
    prev = w;
    const k = foldToken(name);
    expect(seen.has(k)).toBe(false);
    seen.add(k);
  }
}

function spearman(a: number[], b: number[]): number {
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = ra[i]! - ma, y = rb[i]! - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(da * db);
}
function overlapRho(a: WeightedList, b: WeightedList, topN: number) {
  const bm = new Map(b.map(([n, c]) => [foldToken(n), c]));
  const xs: number[] = [], ys: number[] = [];
  for (const [n, c] of a.slice(0, topN)) { const o = bm.get(foldToken(n)); if (o !== undefined) { xs.push(c); ys.push(o); } }
  return { overlap: xs.length, rho: spearman(xs, ys) };
}

describe('D13.5.1 name tables hold weights', () => {
  it('first-name tables: counts, minimum people per row, no repeats, sorted', () => {
    const { K_MIN } = first.params;
    expect(K_MIN).toBeGreaterThanOrEqual(3);
    checkRows(first.football.all.names, K_MIN);
    for (const t of Object.values(first.football.cohorts) as any[]) checkRows(t.names, K_MIN);
    for (const t of Object.values(first.football.groups) as any[]) checkRows(t.names, K_MIN);
    for (const t of Object.values(first.ssa.cohorts) as any[]) checkRows(t.names, 1);
  });
  it('surname tables: counts, minimum people per row, no repeats, sorted', () => {
    checkRows(last.football.all.names, last.params.K_MIN);
    for (const t of Object.values(last.football.cohorts) as any[]) checkRows(t.names, last.params.K_MIN);
    for (const t of Object.values(last.football.groups) as any[]) checkRows(t.names, last.params.K_MIN);
    checkRows(last.census.names, 1);
    expect(last.census.names).toHaveLength(last.params.CENSUS_TOP);
  });
  it('covers every region, the main international sources, and every cohort the generator needs (ages 17 to 70)', () => {
    for (const r of REGIONS) {
      expect(first.football.groups[r].thin).toBe(false);
      expect(last.football.groups[r].thin).toBe(false);
    }
    for (const c of ['canada', 'australia', 'germany', 'american_samoa', 'other_international']) {
      expect(first.football.groups[c]).toBeDefined();
      expect(last.football.groups[c]).toBeDefined();
    }
    for (const c of ['1960-64', '1975-79', '1990-94', '2005-09']) {
      expect(first.football.cohorts[c].thin).toBe(false);
      expect(first.ssa.cohorts[c]).toBeDefined();
    }
    expect(first.cohorts[0]).toBe('1945-49');
    expect(first.cohorts[first.cohorts.length - 1]).toBe('2005-09');
  });
  it('every thin table says so (generator falls back to national)', () => {
    for (const set of [first.football, last.football]) {
      for (const t of [...Object.values(set.cohorts), ...Object.values(set.groups)] as any[]) expect(t.thin).toBe(t.n < first.params.THIN_TABLE_N);
    }
  });
  it('football-wide first-name table is plausible: a top-10 name of the pack is also a top-300 name in the SSA 1980 to 2008 tables', () => {
    const ssaTop = new Set<string>();
    for (const [c, t] of Object.entries(first.ssa.cohorts) as [string, any][]) if (Number(c.slice(0, 4)) >= 1980) for (const [n] of t.names.slice(0, 300)) ssaTop.add(foldToken(n));
    const top = first.football.all.names.slice(0, 10) as WeightedList;
    expect(top.filter(([n]) => ssaTop.has(foldToken(n))).length).toBeGreaterThanOrEqual(8);
  });
  it('name suffix rates come from counts and are small', () => {
    const total = Object.values(suffixes.playersInCohort as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20000);
    for (const [s, v] of Object.entries(suffixes.suffixes) as [string, any][]) {
      expect(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V']).toContain(s);
      expect(v.total / total).toBeLessThan(0.05);
    }
  });
});

describe('cross-checks are recomputed from the shipped tables, not trusted from the builder', () => {
  it('surnames: football vs Census 2000 and pro vs college agree with the recorded values', () => {
    const r = overlapRho(last.football.all.names, last.census.names, 200);
    expect(r.overlap).toBeGreaterThanOrEqual(190);
    expect(r.rho).toBeGreaterThan(0.6);
    // Census 5,000 shipped rows are a subset of the full list the builder used; allow 0.05 for that cut
    expect(Math.abs(r.rho - crossChecks.surnames.footballVsCensus.rho)).toBeLessThan(0.05);
  });
  it('first names: football vs SSA boys born 1980 on is positive and matches the recorded value', () => {
    const sum = new Map<string, number>();
    for (const [c, t] of Object.entries(first.ssa.cohorts) as [string, any][]) if (Number(c.slice(0, 4)) >= 1980) for (const [n, w] of t.names) sum.set(n, (sum.get(n) ?? 0) + w);
    const ssa = [...sum.entries()].sort((a, b) => b[1] - a[1]) as WeightedList;
    const r = overlapRho(first.football.all.names, ssa, 200);
    expect(r.rho).toBeGreaterThan(0.3);
    expect(Math.abs(r.rho - crossChecks.firstNames.footballVsSsa.rho)).toBeLessThan(0.1);
  });
  it('hometown counts were compared with state and city population', () => {
    expect(crossChecks.hometowns.statePlayersVsStatePopulation2013.states).toBe(51);
    expect(crossChecks.hometowns.statePlayersVsStatePopulation2013.rho).toBeGreaterThan(0.7);
    expect(crossChecks.hometowns.townPlayersVsCityPopulation2014.matchedCities).toBeGreaterThan(1000);
    expect(crossChecks.hometowns.townPlayersVsCityPopulation2014.rho).toBeGreaterThan(0.3);
  });
});

describe('D13.5.3 hometowns', () => {
  it('lists 50 states and DC, each in one of the 9 world regions, agreeing with the world data', () => {
    expect(Object.keys(towns.states)).toHaveLength(51);
    expect(Object.keys(towns.regionOfState)).toHaveLength(51);
    for (const l of refs) expect(towns.regionOfState[l.state].region).toBe(l.region);
    for (const [st, v] of Object.entries(towns.states) as [string, any][]) {
      expect(REGIONS).toContain(v.region);
      expect(towns.regionOfState[st].region).toBe(v.region);
      expect(towns.regionOfState[st].basis.length).toBeGreaterThan(10);
    }
  });
  it('state shares plus international sum to one and town rows are counts of 2 or more', () => {
    let players = 0;
    let share = 0;
    for (const v of Object.values(towns.states) as any[]) {
      players += v.players;
      share += v.shareOfKnownHome;
      let prev = Infinity;
      let sum = 0;
      for (const [name, n, lat, lon] of v.towns) {
        expect(name.length).toBeGreaterThan(1);
        expect(n).toBeGreaterThanOrEqual(towns.params.TOWN_MIN);
        expect(n).toBeLessThanOrEqual(prev);
        prev = n;
        sum += n;
        if (lat !== null) { expect(lat).toBeGreaterThan(17); expect(lat).toBeLessThan(72); expect(lon).toBeLessThan(-60); }
      }
      expect(sum).toBe(v.townPlayers);
      expect(sum).toBeLessThanOrEqual(v.players);
    }
    expect(players + towns.international.players).toBe(towns.knownHome);
    expect(share + towns.international.shareOfKnownHome).toBeGreaterThan(0.999);
    expect(share + towns.international.shareOfKnownHome).toBeLessThan(1.001);
    expect(towns.international.countries.some((c: any) => c.country === 'USA')).toBe(false);
  });
  it('the largest home states are the ones football is known to draw from (Texas, Florida, California, Georgia lead)', () => {
    const top = (Object.entries(towns.states) as [string, any][]).sort((a, b) => b[1].players - a[1].players).slice(0, 4).map(([s]) => s).sort();
    expect(top).toEqual(['CA', 'FL', 'GA', 'TX']);
  });
});

describe('fact rows and sources (Q6): status is computed, weak rows are flagged', () => {
  it('rows validate against the register shape and carry computed status', () => {
    const parsed = FactFile.parse(factFile);
    expect(parsed.rows.length).toBeGreaterThanOrEqual(9);
    for (const r of parsed.rows) {
      expect(r.status).toBe(computeStatus(r));
      expect(r.statusHistory.at(-1)!.status).toBe(r.status);
      if (!r.assumption) {
        expect(r.sources.length).toBeGreaterThan(0);
        for (const s of r.sources) expect(s.howRead).toBe('dataset computed');
      }
      expect(r.status).not.toBe('Verified'); // nothing here has three confirming sources, and the file must not say so
    }
  });
  it('every shipped table is covered by a row that names it', () => {
    const used = (factFile.rows as { usedBy: string[] }[]).flatMap((r) => r.usedBy);
    for (const u of ['first-names.json:football', 'first-names.json:ssa', 'surnames.json:football', 'surnames.json:census', 'hometowns.json:states', 'hometowns.json:states.*.towns', 'suffixes.json', 'hometowns.json:regionOfState']) expect(used).toContain(u);
  });
  it('input files are pinned by SHA-256 so a rebuild can be compared', () => {
    for (const v of Object.values(inputs.inputs) as { sha256: string; bytes: number }[]) {
      expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(v.bytes).toBeGreaterThan(1000);
    }
  });
});

describe('D13.5.2 collision guard and the real-name scan', () => {
  it('guard file holds only fixed-width hashes, sorted and unique, and no readable name', () => {
    expect(guardFile.width).toBe(GUARD_HASH_WIDTH);
    expect(guardFile.packed.length).toBe(guardFile.count * GUARD_HASH_WIDTH);
    expect(guardFile.packed).toMatch(/^[0-9a-f]+$/);
    expect(guard.size).toBe(guardFile.count);
    expect(guardFile.count).toBeGreaterThan(30000);
    expect(guardFile.scope.proRosterRows).toBeGreaterThan(5000);
    expect(guardFile.scope.collegeRosterRows).toBeGreaterThan(30000);
  });
  it('the hash is pinned against an independent (Python) implementation', () => {
    expect(guardHash('Zzyzx', 'Qwertyuiop')).toBe('1a70b071eaddd3');
    expect(guardHash('John', 'Smith')).toBe('08fe60a5d06cdf');
    expect(guardHash("D'Andre", 'Van Royen')).toBe('1be5e81d54bf23');
    expect(guardHash('JOHN', 'smith')).toBe(guardHash('John', 'Smith')); // case and punctuation folded
    expect(guardHash('Jean-Luc', "O'Neil")).toBe(guardHash('Jean Luc', 'ONeil'));
  });
  it('no table entry is, or splits into, a real current full name', () => {
    const entries: string[] = [];
    for (const t of [first.football.all, ...Object.values(first.football.cohorts), ...Object.values(first.football.groups)] as any[]) for (const [n] of t.names) entries.push(n);
    for (const t of [last.football.all, ...Object.values(last.football.cohorts), ...Object.values(last.football.groups)] as any[]) for (const [n] of t.names) entries.push(n);
    for (const [n] of last.census.names) entries.push(n);
    for (const t of Object.values(first.ssa.cohorts) as any[]) for (const [n] of t.names) entries.push(n);
    const unique = [...new Set(entries)];
    expect(unique.length).toBeGreaterThan(10000);
    const hits: string[] = [];
    for (const e of unique) {
      const parts = e.trim().split(/\s+/);
      for (let i = 1; i < parts.length; i++) if (guard.has(guardHash(parts.slice(0, i).join(' '), parts.slice(i).join(' ')))) hits.push(e);
    }
    expect(hits).toEqual([]);
  });
  it('the guard is not trivially empty: plain table draws do hit real current names, and the redraw clears every one', () => {
    // Reference draw only (the shipped generator is G-81): independent first and surname draws, redraw first name up to 10 times
    // (D13.5.2). Measured here: for the very common surnames (Smith, Johnson, Williams) ten first-name redraws sometimes all hit a
    // real current player, so the reference adds a last step, a fresh surname, and the finding goes to the integrator as a D13.5.2 amendment.
    let s = 0x9e3779b9;
    const u = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const f = cumulative(first.football.cohorts['1995-99'].names);
    const l = cumulative([...last.football.all.names, ...last.census.names.slice(0, 2000)] as WeightedList);
    const N = 200_000;
    let raw = 0;
    let redraws = 0;
    let unresolved = 0;
    let final = 0;
    for (let i = 0; i < N; i++) {
      const sn = drawWeighted(l, u());
      let fn = drawWeighted(f, u());
      if (guard.has(guardHash(fn, sn))) {
        raw++;
        let tries = 0;
        while (guard.has(guardHash(fn, sn)) && tries < 10) { fn = drawWeighted(f, u()); tries++; redraws++; }
        if (guard.has(guardHash(fn, sn))) {
          unresolved++;
          let sn2 = sn;
          for (let k = 0; k < 10 && guard.has(guardHash(fn, sn2)); k++) { sn2 = drawWeighted(l, u()); fn = drawWeighted(f, u()); }
          if (guard.has(guardHash(fn, sn2))) final++;
          continue;
        }
      }
      if (guard.has(guardHash(fn, sn))) final++;
    }
    expect(raw).toBeGreaterThan(0);
    expect(redraws).toBeGreaterThanOrEqual(raw);
    expect(unresolved / N).toBeLessThan(0.001); // first-name redraws alone leave under 0.1 percent of draws (measured about 0.005 percent)
    expect(final).toBe(0);
    console.log(`scan: ${N} draws, ${raw} raw hits (${((raw / N) * 100).toFixed(3)}%), ${redraws} first-name redraws, ${unresolved} needed a new surname, 0 real current full names left`);
  });
  it('a planted real name (a guard hash) is caught and an unrelated invented name is not', () => {
    const planted = [...guard][0]!;
    expect(guard.has(planted)).toBe(true);
    expect(guard.has(guardHash('Zzyzx', 'Qwertyuiop'))).toBe(false);
  });
});
