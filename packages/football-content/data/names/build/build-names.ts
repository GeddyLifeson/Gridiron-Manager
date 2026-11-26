// G-18 builder: turns the people pack and two public tables into the shipped name and hometown tables.
// Run: npx tsx packages/football-content/data/names/build/build-names.ts PEOPLE_DIR CACHE_DIR
//   PEOPLE_DIR  folder with the people pack CSVs (data/people/ in the project files)
//   CACHE_DIR   folder holding baby-names.csv, surnames.csv, state-population.csv, 2014_us_cities.csv
//               (curl commands are in ../README.md; their SHA-256 sums are logged in ../sources.json)
// Real names are read here and never leave: the outputs hold counts per single name, hometown counts and one-way hashes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldToken, guardHash } from '../lib.ts';
import { computeStatus } from '@gm/schema';

const [peopleDir, cacheDir] = process.argv.slice(2);
if (!peopleDir || !cacheDir) throw new Error('usage: build-names.ts PEOPLE_DIR CACHE_DIR');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const worldDir = join(outDir, '..', 'world');
const DATE_READ = '2026-11-26';

// ---- named constants (assumptions, not real-world numbers) ----
const K_MIN = 3; // a name row ships only if at least this many distinct people carry it, so no row points at one person
const TOWN_MIN = 2; // a hometown row ships only with this many players (single rows are mostly typos)
const ENTRY_AGE = 18; // college first season minus this gives the birth year
const COHORT_WIDTH = 5;
const THIN_TABLE_N = 200; // tables built from fewer people are flagged thin; the generator falls back to the national table
const GUARD_COLLEGE_SEASON_MIN = 2025;
const GUARD_PRO_LAST_SEASON_MIN = 2024;
const SSA_COHORT_FIRST = 1945;
const COHORT_FLOOR = 1945; // players born earlier are too few to tabulate (under 30 people) and are left out of cohort tables

// ---- csv ----
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (q) {
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) { field += '"'; i++; } else q = false;
      } else field += text[i];
    } else if (c === 34) q = true;
    else if (c === 44) { row.push(field); field = ''; }
    else if (c === 10) { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== 13) field += text[i];
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
type Rec = Record<string, string>;
function readTable(path: string): Rec[] {
  const raw = readFileSync(path);
  const rows = parseCsv(raw.toString('utf8'));
  const head = rows[0] as string[];
  const out: Rec[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    if (r.length < head.length) continue;
    const o: Rec = {};
    head.forEach((h, j) => { o[h] = r[j] as string; });
    out.push(o);
  }
  return out;
}
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

// ---- name cleaning ----
const SUFFIX_RE = /^(jr|sr|ii|iii|iv|v)\.?$/i;
function cleanToken(s: string): string {
  return s.replace(/[()"]/g, '').replace(/\s+/g, ' ').trim();
}
function stripSuffix(last: string): { last: string; suffix: string } {
  const parts = cleanToken(last).split(' ');
  let suffix = '';
  while (parts.length > 1 && SUFFIX_RE.test(parts[parts.length - 1] as string)) suffix = parts.pop() as string;
  return { last: parts.join(' '), suffix };
}
function okToken(s: string): boolean {
  const f = foldToken(s);
  return f.length >= 2 && !/[0-9]/.test(s);
}

// ---- tallies that keep one display spelling per folded key ----
class Tally {
  counts = new Map<string, number>();
  spell = new Map<string, Map<string, number>>();
  n = 0;
  add(display: string, by = 1) {
    const k = foldToken(display);
    if (!k) return;
    this.counts.set(k, (this.counts.get(k) ?? 0) + by);
    let m = this.spell.get(k);
    if (!m) { m = new Map(); this.spell.set(k, m); }
    m.set(display, (m.get(display) ?? 0) + by);
    this.n += by;
  }
  display(k: string): string {
    let best = '';
    let bc = -1;
    for (const [d, c] of this.spell.get(k) as Map<string, number>) if (c > bc || (c === bc && d < best)) { best = d; bc = c; }
    return best;
  }
  rows(min: number): [string, number][] {
    const out: [string, number][] = [];
    for (const [k, c] of this.counts) if (c >= min) out.push([this.display(k), c]);
    out.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return out;
  }
}

// ---- regions ----
const refLocs = JSON.parse(readFileSync(join(worldDir, 'reference-locations.json'), 'utf8')).locations as { state: string; region: string }[];
const regionOfState: Record<string, { region: string; basis: string }> = {};
for (const l of refLocs) regionOfState[l.state] = { region: l.region, basis: 'world data: reference-locations.json' };
const ASSUMED_STATES: Record<string, string> = { NJ: 'mid_atlantic', DE: 'mid_atlantic', NH: 'northeast', RI: 'northeast', ME: 'northeast', WY: 'mountain', HI: 'pacific', AK: 'pacific' };
for (const [s, r] of Object.entries(ASSUMED_STATES)) if (!regionOfState[s]) regionOfState[s] = { region: r, basis: 'assumption: not among the 71 reference locations; placed beside its nearest listed neighbours' };
const US = new Set(Object.keys(regionOfState));
if (US.size !== 51) throw new Error(`expected 50 states and DC, got ${US.size}`);

const INTL_NAMED: Record<string, string> = { Canada: 'canada', CAN: 'canada', Australia: 'australia', Germany: 'germany', 'American Samoa': 'american_samoa' };
const CANADA_PROV = new Set(['ON', 'PQ', 'BC', 'AB', 'MB', 'QC', 'SK', 'NS', 'NP', 'NB']);
const AUS_STATE = new Set(['VIC', 'NSW', 'QLD', 'SA', 'ACT', 'TAS', 'WA']);

// ---- load the pack ----
const pro = readTable(join(peopleDir, 'nfl_players.csv'));
const col = readTable(join(peopleDir, 'college_players.csv'));
const baby = readTable(join(cacheDir, 'baby-names.csv'));
const census = readTable(join(cacheDir, 'surnames.csv'));
const statePop = readTable(join(cacheDir, 'state-population.csv'));
const cities = readTable(join(cacheDir, '2014_us_cities.csv'));
const rosterSeasons = parseCsv(readFileSync(join(peopleDir, 'college_roster_seasons_2010_2026.csv'), 'utf8'));
const geo = new Map<string, [number, number]>(); // athlete_id -> home coordinates (the one-row-per-athlete file has none)
{
  const head = rosterSeasons[0] as string[];
  const iA = head.indexOf('athlete_id'), iLa = head.indexOf('home_latitude'), iLo = head.indexOf('home_longitude');
  for (let i = 1; i < rosterSeasons.length; i++) {
    const r = rosterSeasons[i] as string[];
    const la = Number(r[iLa]), lo = Number(r[iLo]);
    if (r[iLa] && r[iLo] && Number.isFinite(la) && Number.isFinite(lo) && !geo.has(r[iA] as string)) geo.set(r[iA] as string, [la, lo]);
  }
}

const cohortOf = (birthYear: number) => Math.floor(birthYear / COHORT_WIDTH) * COHORT_WIDTH;
const cohortLabel = (c: number) => `${c}-${String(c + COHORT_WIDTH - 1).slice(2)}`;

interface Person { first: string; last: string; cohort: number | null; group: string | null; src: 'pro' | 'college' }
const people: Person[] = [];
const suffixes = new Map<string, Map<number, number>>(); // suffix -> cohort -> count
const proByCohort = new Map<number, number>();
let proKept = 0;
for (const r of pro) {
  const first = cleanToken(r.first_name ?? '');
  const { last, suffix } = stripSuffix(r.last_name ?? '');
  if (!okToken(first) || !okToken(last)) continue;
  const y = Number((r.birth_date ?? '').slice(0, 4));
  const cohort = y >= COHORT_FLOOR ? cohortOf(y) : null;
  // suffix: the register's own column, else a suffix trailing the display name
  const dn = cleanToken(r.display_name ?? '').split(' ');
  const tail = dn.length > 2 ? (dn[dn.length - 1] as string) : '';
  const suf = (r.suffix && SUFFIX_RE.test(r.suffix) ? r.suffix : '') || suffix || (SUFFIX_RE.test(tail) ? tail : '');
  proKept++;
  if (cohort !== null) proByCohort.set(cohort, (proByCohort.get(cohort) ?? 0) + 1);
  if (suf && cohort !== null) {
    const s = suf.replace(/\.$/, '').replace(/^jr$/i, 'Jr.').replace(/^sr$/i, 'Sr.');
    const m = suffixes.get(s) ?? new Map<number, number>();
    m.set(cohort, (m.get(cohort) ?? 0) + 1);
    suffixes.set(s, m);
  }
  people.push({ first, last, cohort, group: null, src: 'pro' });
}
let collegeSkippedAsPro = 0;
for (const r of col) {
  if (r.nfl_gsis_id_by_name_school) { collegeSkippedAsPro++; continue; }
  const first = cleanToken(r.first_name ?? '');
  const { last } = stripSuffix(r.last_name ?? '');
  if (!okToken(first) || !okToken(last)) continue;
  const fs = Number(r.first_season);
  const cohort = fs >= 2000 ? cohortOf(fs - ENTRY_AGE) : null;
  const st = (r.home_state ?? '').trim();
  const ctry = (r.home_country ?? '').trim();
  let group: string | null = null;
  if (US.has(st) && (ctry === 'USA' || ctry === '')) group = (regionOfState[st] as { region: string }).region;
  else if (INTL_NAMED[ctry]) group = INTL_NAMED[ctry] as string;
  else if (ctry === '' && CANADA_PROV.has(st)) group = 'canada';
  else if (ctry === '' && AUS_STATE.has(st)) group = 'australia';
  else if (ctry && ctry !== 'USA') group = 'other_international';
  people.push({ first, last, cohort, group, src: 'college' });
}

const cohortIds = [...new Set(people.map((p) => p.cohort).filter((c): c is number => c !== null))].sort((a, b) => a - b);

function buildTables(pick: (p: Person) => string) {
  const national = new Map<number, Tally>();
  const groups = new Map<string, Tally>();
  const all = new Tally();
  for (const p of people) {
    const name = pick(p);
    all.add(name);
    if (p.cohort !== null) {
      let t = national.get(p.cohort);
      if (!t) { t = new Tally(); national.set(p.cohort, t); }
      t.add(name);
    }
    if (p.group) {
      let t = groups.get(p.group);
      if (!t) { t = new Tally(); groups.set(p.group, t); }
      t.add(name);
    }
  }
  return { national, groups, all };
}
const pack = (t: Tally) => ({ n: t.n, distinct: t.counts.size, shipped: t.rows(K_MIN).length, thin: t.n < THIN_TABLE_N, names: t.rows(K_MIN) });

const first = buildTables((p) => p.first);
const last = buildTables((p) => p.last);

// ---- SSA first names (boys) ----
const ssaYears = baby.filter((r) => r.sex === 'boy');
const ssaMaxYear = ssaYears.reduce((m, r) => Math.max(m, Number(r.year)), 0);
const ssaCohorts: Record<string, unknown> = {};
const ssaFirstCohort = Math.max(cohortOf(SSA_COHORT_FIRST), 0);
for (let c = ssaFirstCohort; c + COHORT_WIDTH - 1 <= ssaMaxYear + COHORT_WIDTH - 1; c += COHORT_WIDTH) {
  const lo = c;
  const hi = Math.min(c + COHORT_WIDTH - 1, ssaMaxYear);
  const years = hi - lo + 1;
  const sum = new Map<string, number>();
  for (const r of ssaYears) {
    const y = Number(r.year);
    if (y < lo || y > hi) continue;
    sum.set(r.name as string, (sum.get(r.name as string) ?? 0) + Number(r.percent));
  }
  const rows = [...sum.entries()].map(([n, s]) => [n, Math.round((s / years) * 1e6)] as [string, number]).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  ssaCohorts[cohortLabel(c)] = { years: [lo, hi], yearsCovered: years, names: rows };
}

// ---- Census 2000 surnames ----
const CENSUS_TOP = 5000; // assumption: size cap so the file stays small; the cut is by rank, so nothing is truncated by name
function censusCase(upper: string, packDisplay: Map<string, string>): string {
  const hit = packDisplay.get(foldToken(upper));
  if (hit) return hit;
  return upper.toLowerCase().replace(/(^|[ \-'])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/^Mc([a-z])/, (_m, b: string) => 'Mc' + b.toUpperCase());
}
const packDisplay = new Map<string, string>();
for (const k of last.all.counts.keys()) packDisplay.set(k, last.all.display(k));
const censusRows = census
  .filter((r) => r.name !== 'ALL OTHER NAMES' && Number(r.count) > 0)
  .map((r) => ({ name: r.name as string, count: Number(r.count), rank: Number(r.rank) }))
  .sort((a, b) => a.rank - b.rank);
const censusTotalListed = censusRows.reduce((s, r) => s + r.count, 0);
const censusShip: [string, number][] = censusRows.slice(0, CENSUS_TOP).map((r) => [censusCase(r.name, packDisplay), r.count]);

// ---- hometowns ----
interface Town { disp: Map<string, number>; n: number; lat: number; lon: number; geoN?: number }
const townsByState = new Map<string, Map<string, Town>>();
const statePlayers = new Map<string, number>();
const intlCountry = new Map<string, number>();
let homeMissing = 0;
let collegeRows = 0;
for (const r of col) {
  collegeRows++;
  const st = (r.home_state ?? '').trim();
  const ctry = (r.home_country ?? '').trim();
  const city = cleanToken(r.home_city ?? '');
  if (!st && !ctry) { homeMissing++; continue; }
  if (ctry === 'USA' && !US.has(st)) { homeMissing++; continue; } // a US country label with no usable state is treated as home unknown
  if (US.has(st) && (ctry === 'USA' || ctry === '')) {
    statePlayers.set(st, (statePlayers.get(st) ?? 0) + 1);
    if (!city) continue;
    let m = townsByState.get(st);
    if (!m) { m = new Map(); townsByState.set(st, m); }
    const k = foldToken(city);
    if (!k) continue;
    let t = m.get(k);
    if (!t) { t = { disp: new Map(), n: 0, lat: 0, lon: 0 }; m.set(k, t); }
    t.n++;
    t.disp.set(city, (t.disp.get(city) ?? 0) + 1);
    const g = geo.get(r.athlete_id as string);
    if (g) { t.lat += g[0]; t.lon += g[1]; t.geoN = (t.geoN ?? 0) + 1; }
  } else {
    const label = INTL_NAMED[ctry] ? ({ canada: 'Canada', australia: 'Australia', germany: 'Germany', american_samoa: 'American Samoa' } as Record<string, string>)[INTL_NAMED[ctry] as string] as string : ctry || (CANADA_PROV.has(st) ? 'Canada' : AUS_STATE.has(st) ? 'Australia' : st);
    intlCountry.set(label, (intlCountry.get(label) ?? 0) + 1);
  }
}
const usKnown = [...statePlayers.values()].reduce((a, b) => a + b, 0);
const intlKnown = [...intlCountry.values()].reduce((a, b) => a + b, 0);
const knownHome = usKnown + intlKnown;
const states: Record<string, unknown> = {};
const stateOrder = [...statePlayers.entries()].sort((a, b) => b[1] - a[1]);
let townRowsShipped = 0;
let townPlayersShipped = 0;
for (const [st, n] of stateOrder) {
  const towns = [...(townsByState.get(st) ?? new Map<string, Town>()).values()]
    .filter((t) => t.n >= TOWN_MIN)
    .map((t) => {
      let best = '';
      let bc = -1;
      for (const [d, c] of t.disp) if (c > bc || (c === bc && d < best)) { best = d; bc = c; }
      return { name: best, players: t.n, lat: t.geoN ? Math.round((t.lat / t.geoN) * 100) / 100 : null, lon: t.geoN ? Math.round((t.lon / t.geoN) * 100) / 100 : null };
    })
    .sort((a, b) => b.players - a.players || (a.name < b.name ? -1 : 1));
  const shippedPlayers = towns.reduce((s, t) => s + t.players, 0);
  townRowsShipped += towns.length;
  townPlayersShipped += shippedPlayers;
  states[st] = {
    region: (regionOfState[st] as { region: string }).region,
    players: n,
    shareOfKnownHome: Math.round((n / knownHome) * 1e6) / 1e6,
    townPlayers: shippedPlayers,
    towns: towns.map((t) => [t.name, t.players, t.lat, t.lon]),
  };
}
const intlRows = [...intlCountry.entries()].sort((a, b) => b[1] - a[1]).map(([country, players]) => ({ country, players, shareOfKnownHome: Math.round((players / knownHome) * 1e6) / 1e6 }));

// ---- cross-check statistics ----
function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && (idx[j + 1] as readonly [number, number])[0] === (idx[i] as readonly [number, number])[0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[(idx[k] as readonly [number, number])[1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = (ra[i] as number) - ma, y = (rb[i] as number) - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Spearman over the names in the top `topN` of list A that also appear anywhere in list B, plus the overlap size. */
function overlapRho(a: [string, number][], b: [string, number][], topN: number) {
  const bm = new Map(b.map(([n, c]) => [foldToken(n), c]));
  const xs: number[] = [], ys: number[] = [];
  for (const [n, c] of a.slice(0, topN)) {
    const o = bm.get(foldToken(n));
    if (o !== undefined) { xs.push(c); ys.push(o); }
  }
  return { topN, overlap: xs.length, rho: r3(spearman(xs, ys)) };
}
const topShare = (rows: [string, number][], a: [string, number][], topN: number) => {
  const A = new Set(rows.slice(0, topN).map(([n]) => foldToken(n)));
  const B = new Set(a.slice(0, topN).map(([n]) => foldToken(n)));
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return { topN, shared: hit };
};

const proOnly = { first: new Tally(), last: new Tally() };
const colOnly = { first: new Tally(), last: new Tally() };
for (const p of people) {
  const t = p.src === 'pro' ? proOnly : colOnly;
  t.first.add(p.first);
  t.last.add(p.last);
}
const ssaAllBoys = new Map<string, number>();
for (const r of ssaYears) if (Number(r.year) >= 1980) ssaAllBoys.set(r.name as string, (ssaAllBoys.get(r.name as string) ?? 0) + Number(r.percent));
const ssaAllRows = [...ssaAllBoys.entries()].map(([n, s]) => [n, s] as [string, number]).sort((a, b) => b[1] - a[1]);
const censusAllRows = censusRows.map((r) => [censusCase(r.name, packDisplay), r.count] as [string, number]);

const popByState = new Map<string, number>();
for (const r of statePop) if (r.ages === 'total' && r.year === '2013' && US.has(r['state/region'] as string)) popByState.set(r['state/region'] as string, Number(r.population));
const stCodes = [...popByState.keys()].filter((s) => statePlayers.has(s));
const stateRho = r3(spearman(stCodes.map((s) => statePlayers.get(s) as number), stCodes.map((s) => popByState.get(s) as number)));

const townIndex = new Map<string, { n: number; lat: number; lon: number }[]>();
for (const m of townsByState.values()) for (const t of m.values()) {
  let best = '';
  let bc = -1;
  for (const [d, c] of t.disp) if (c > bc) { best = d; bc = c; }
  const k = foldToken(best);
  const arr = townIndex.get(k) ?? [];
  if (t.geoN) arr.push({ n: t.n, lat: t.lat / t.geoN, lon: t.lon / t.geoN });
  townIndex.set(k, arr);
}
const cityPop: number[] = [], cityPlayers: number[] = [];
for (const c of cities) {
  const k = foldToken(c.name ?? '');
  const hits = (townIndex.get(k) ?? []).filter((t) => Math.abs(t.lat - Number(c.lat)) < 0.5 && Math.abs(t.lon - Number(c.lon)) < 0.5);
  if (hits.length) { cityPop.push(Number(c.pop)); cityPlayers.push(hits.reduce((s, t) => s + t.n, 0)); }
}

function sameCohort(_t: unknown) {
  const out: Record<string, unknown> = {};
  for (const c of [1990, 1995]) {
    const a = new Tally(), b = new Tally();
    for (const p of people) if (p.cohort === c) (p.src === 'pro' ? a : b).add(p.first);
    out[cohortLabel(c)] = { proPeople: a.n, collegePeople: b.n, ...overlapRho(a.rows(K_MIN), b.rows(1), 100) };
  }
  return out;
}
const crossChecks = {
  note: 'Computed by the builder and recomputed from the shipped tables by the test, so the builder is itself checked.',
  firstNames: {
    proVsCollege: overlapRho(proOnly.first.rows(K_MIN), colOnly.first.rows(1), 200),
    proVsCollegeSameCohort: sameCohort(first),
    footballVsSsa: overlapRho(first.all.rows(K_MIN), ssaAllRows.map(([n, s]) => [n, s] as [string, number]), 200),
    topOverlap100: { footballVsSsa: topShare(first.all.rows(K_MIN), ssaAllRows, 100) },
  },
  surnames: {
    proVsCollege: overlapRho(proOnly.last.rows(K_MIN), colOnly.last.rows(1), 200),
    footballVsCensus: overlapRho(last.all.rows(K_MIN), censusAllRows, 200),
    topOverlap100: { footballVsCensus: topShare(last.all.rows(K_MIN), censusAllRows, 100) },
  },
  hometowns: {
    statePlayersVsStatePopulation2013: { states: stCodes.length, rho: stateRho },
    townPlayersVsCityPopulation2014: { matchedCities: cityPop.length, rho: r3(spearman(cityPop, cityPlayers)) },
  },
};

// ---- suffix rates ----
const suffixOut: Record<string, unknown> = {};
const totalByCohort: Record<string, number> = {};
for (const [c, n] of [...proByCohort.entries()].sort((a, b) => a[0] - b[0])) totalByCohort[cohortLabel(c)] = n;
for (const [s, m] of suffixes) {
  const by: Record<string, number> = {};
  for (const [c, n] of [...m.entries()].sort((a, b) => a[0] - b[0])) by[cohortLabel(c)] = n;
  suffixOut[s] = { total: [...m.values()].reduce((a, b) => a + b, 0), byCohort: by };
}

// ---- real-name guard: one-way hashes of people active now ----
const guard = new Set<string>();
const addGuard = (f: string, l: string) => { if (okToken(f) && okToken(l)) guard.add(guardHash(f, l)); };
for (const r of pro) {
  if (r.active_2025 === 'True' || Number(r.last_season) >= GUARD_PRO_LAST_SEASON_MIN) addGuard(cleanToken(r.first_name ?? ''), stripSuffix(r.last_name ?? '').last);
}
const rosters = readTable(join(peopleDir, 'nfl_rosters_2025_2026.csv'));
for (const r of rosters) addGuard(cleanToken(r.first_name ?? ''), stripSuffix(r.last_name ?? '').last);
let collegeCurrent = 0;
{
  const rows = rosterSeasons;
  const head = rows[0] as string[];
  const ix = (n: string) => head.indexOf(n);
  const iF = ix('first_name'), iL = ix('last_name'), iS = ix('season');
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    if (Number(r[iS]) < GUARD_COLLEGE_SEASON_MIN) continue;
    collegeCurrent++;
    addGuard(cleanToken(r[iF] ?? ''), stripSuffix(r[iL] ?? '').last);
  }
}
const headCoaches = readTable(join(peopleDir, 'nfl_head_coaches_career.csv'));
let coachesCurrent = 0;
for (const r of headCoaches) {
  if (Number(r.last_season) >= GUARD_PRO_LAST_SEASON_MIN) {
    const parts = cleanToken(r.coach ?? '').split(' ');
    addGuard(parts[0] as string, stripSuffix(parts.slice(1).join(' ')).last);
    coachesCurrent++;
  }
}
const officials = readTable(join(peopleDir, 'nfl_officials.csv'));
let officialsCurrent = 0;
for (const r of officials) {
  if (Number(r.last_season) >= GUARD_PRO_LAST_SEASON_MIN) {
    const parts = cleanToken(r.official_name ?? '').split(' ');
    addGuard(parts[0] as string, stripSuffix(parts.slice(1).join(' ')).last);
    officialsCurrent++;
  }
}
const guardSorted = [...guard].sort();

// ---- write ----
const write = (name: string, obj: unknown) => writeFileSync(join(outDir, name), JSON.stringify(obj) + '\n');
const cohorts = cohortIds.map(cohortLabel);

write('first-names.json', {
  schema: 1,
  note: 'Single first names with counts. Football tables count people in the people pack; ssa is the public birth table. Names are drawn independently of surnames (D13.5.1). The generator combines cohort and region as weight = cohortCount x (regionCount / regionTotal) / (allCount / allTotal) or falls back to the national cohort table when a region or cohort table is thin.',
  params: { K_MIN, ENTRY_AGE, COHORT_WIDTH, COHORT_FLOOR, THIN_TABLE_N },
  cohorts,
  football: {
    all: pack(first.all),
    cohorts: Object.fromEntries(cohortIds.map((c) => [cohortLabel(c), pack(first.national.get(c) as Tally)])),
    groups: Object.fromEntries([...first.groups.entries()].sort().map(([g, t]) => [g, pack(t)])),
  },
  ssa: { sex: 'boy', unit: 'births per million boys, mean over the cohort years', cohorts: ssaCohorts },
});
write('surnames.json', {
  schema: 1,
  note: 'Single surnames with counts. Football tables count people in the people pack; census is the 2000 Census surname list (top rows by rank). The generator draws a surname from football (weight w) or census (weight 1-w); w is the generator\'s setting.',
  params: { K_MIN, THIN_TABLE_N, CENSUS_TOP },
  football: {
    all: pack(last.all),
    cohorts: Object.fromEntries(cohortIds.map((c) => [cohortLabel(c), pack(last.national.get(c) as Tally)])),
    groups: Object.fromEntries([...last.groups.entries()].sort().map(([g, t]) => [g, pack(t)])),
  },
  census: { year: 2000, listedRows: censusRows.length, listedPeople: censusTotalListed, shipped: censusShip.length, names: censusShip },
});
write('hometowns.json', {
  schema: 1,
  note: 'Where football players come from. State shares and town counts come from the college player register (2010 to 2026 rosters). Towns are real places (facts, A6.2.1 edge case); a generated person gets a real town name and an invented high school (D13.5.3). Weight = players counted; draw state by share, then town by count, with the tail (players in towns under the minimum) drawn from the state only.',
  params: { TOWN_MIN },
  regionOfState,
  knownHome,
  homeMissing,
  collegePlayersRead: collegeRows,
  states,
  statesTotal: Object.keys(states).length,
  townRowsShipped,
  townPlayersShipped,
  international: { players: intlKnown, shareOfKnownHome: Math.round((intlKnown / knownHome) * 1e6) / 1e6, countries: intlRows },
});
write('suffixes.json', {
  schema: 1,
  note: 'Name suffixes among pro players by birth cohort (register suffix column, else a suffix trailing the display name). Rate = count / playersInCohort.',
  playersInCohort: totalByCohort,
  suffixes: suffixOut,
});
write('real-name-guard.json', {
  schema: 1,
  note: 'One-way hashes (cyrb53 of "first|last", folded, 14 hex digits) of people who are playing, coaching or officiating now. No name is stored. A generated person whose hash is in this list is redrawn (D13.5.2).',
  hash: 'cyrb53 of nameKey(first,last); see lib.ts',
  width: 14,
  count: guardSorted.length,
  scope: { proLastSeasonMin: GUARD_PRO_LAST_SEASON_MIN, collegeSeasonMin: GUARD_COLLEGE_SEASON_MIN, proRosterRows: rosters.length, collegeRosterRows: collegeCurrent, headCoaches: coachesCurrent, officials: officialsCurrent },
  packed: guardSorted.join(''),
});
write('cross-checks.json', crossChecks);

const inputs: Record<string, { file: string; sha256: string; bytes: number }> = {};
for (const [k, p] of Object.entries({
  'nfl_players.csv': join(peopleDir, 'nfl_players.csv'),
  'college_players.csv': join(peopleDir, 'college_players.csv'),
  'college_roster_seasons_2010_2026.csv': join(peopleDir, 'college_roster_seasons_2010_2026.csv'),
  'nfl_rosters_2025_2026.csv': join(peopleDir, 'nfl_rosters_2025_2026.csv'),
  'nfl_head_coaches_career.csv': join(peopleDir, 'nfl_head_coaches_career.csv'),
  'nfl_officials.csv': join(peopleDir, 'nfl_officials.csv'),
  'baby-names.csv': join(cacheDir, 'baby-names.csv'),
  'surnames.csv': join(cacheDir, 'surnames.csv'),
  'state-population.csv': join(cacheDir, 'state-population.csv'),
  '2014_us_cities.csv': join(cacheDir, '2014_us_cities.csv'),
})) inputs[k] = { file: k, sha256: sha(p), bytes: readFileSync(p).length };
write('build-inputs.json', { dateRead: DATE_READ, inputs, counts: { proPlayersKept: proKept, collegePlayersRead: col.length, collegeSkippedAsPro, peopleCounted: people.length, ssaMaxYear } });


// ---- fact rows (Q6 shape; status is computed from the sources, never typed) ----
const src = {
  nflverse: { citation: 'nflverse-data releases, players register (project people pack nfl_players.csv, built 2026-11-25)', locator: 'first_name, last_name, birth_date, display_name columns; 24,872 rows', dateRead: DATE_READ, howRead: 'dataset computed' as const, independenceGroup: 'nflverse-players', primary: false },
  espn: { citation: 'sportsdataverse cfbfastR-data rosters (ESPN-derived), project people pack college_players.csv and college_roster_seasons_2010_2026.csv', locator: 'first_name, last_name, first_season, home_city, home_state, home_country, home_latitude, home_longitude columns', dateRead: DATE_READ, howRead: 'dataset computed' as const, independenceGroup: 'cfbfastr-rosters', primary: false },
  ssa: { citation: 'Social Security Administration baby names 1880 to 2008, as published in github.com/hadley/data-baby-names baby-names.csv (provenance per that repository, not re-read at the agency)', locator: 'rows with sex = boy; percent column = share of boys born that year', dateRead: DATE_READ, howRead: 'dataset computed' as const, independenceGroup: 'ssa-baby-names', primary: false },
  census: { citation: 'U.S. Census Bureau 2000 surnames, as published in github.com/fivethirtyeight/data most-common-name/surnames.csv (provenance per that repository README, not re-read at the Bureau)', locator: 'name, rank, count columns (names with 100 or more people)', dateRead: DATE_READ, howRead: 'dataset computed' as const, independenceGroup: 'census-2000-surnames', primary: false },
};
const hist = [{ date: DATE_READ, status: '', reason: 'First load by G-18 builder.' }];
type Row = { id: string; level: 'both'; domain: 'measured-rate'; statement: string; value?: number | string; unit?: string; validFor: string; sources: (typeof src)[keyof typeof src][]; status: string; assumption?: boolean; usedBy: string[]; notes: string; statusHistory: typeof hist };
const mk = (n: number, statement: string, value: number | string | undefined, unit: string | undefined, sources: Row['sources'], usedBy: string[], notes: string, assumption = false): Row => {
  const row: Row = { id: `F-name-${String(n).padStart(4, '0')}`, level: 'both', domain: 'measured-rate', statement, ...(value !== undefined ? { value } : {}), ...(unit ? { unit } : {}), validFor: 'rosters 2010 to 2026', sources, status: '', ...(assumption ? { assumption: true } : {}), usedBy, notes, statusHistory: [{ ...hist[0] as (typeof hist)[0] }] };
  row.status = computeStatus(row as Parameters<typeof computeStatus>[0]);
  (row.statusHistory[0] as { status: string }).status = row.status;
  return row;
};
const fmt = (a: unknown) => JSON.stringify(a);
const rows: Row[] = [
  mk(1, 'First-name frequency among football players: counted people in the pack, one row per single first name (3 or more people).', first.all.n, 'people', [src.nflverse, src.espn], ['first-names.json:football'], `Two registers cover different people (pro players, then college players not matched to a pro row) and are pooled, so they are components, not confirmations. Comparison only, not a source: top-200 first names pro vs college same cohort rank correlation ${fmt(crossChecks.firstNames.proVsCollegeSameCohort)}; football vs SSA boys 1980 on, ${fmt(crossChecks.firstNames.footballVsSsa)}. Roster first names are the names players use (Chris, Nick), not always the legal name.`),
  mk(2, 'First-name frequency of U.S. boys by 5-year birth cohort (SSA), mean share per year in the cohort.', undefined, undefined, [src.ssa], ['first-names.json:ssa'], `Single source mirrored on GitHub; the data stops at ${ssaMaxYear}, so later cohorts use the newest table with the generator's drift rule (D13.5.1).`),
  mk(3, 'Surname frequency among football players: counted people in the pack, one row per single surname (3 or more people).', last.all.n, 'people', [src.nflverse, src.espn], ['surnames.json:football'], `Same pooling note as first names. Comparison only: pro vs college ${fmt(crossChecks.surnames.proVsCollege)}; football vs Census 2000 ${fmt(crossChecks.surnames.footballVsCensus)}.`),
  mk(4, `Surname frequency in the U.S. population, 2000 Census, top ${CENSUS_TOP} by rank.`, censusTotalListed, 'people (all listed rows)', [src.census], ['surnames.json:census'], 'Single source mirrored on GitHub. Casing is rebuilt from the pack spellings where the name appears there, else by a title-case rule (Mc and O\' handled), so a few rare spellings may differ from common usage.'),
  mk(5, 'Home-state share of college players with a known home.', knownHome, 'players with known home', [src.espn], ['hometowns.json:states'], `One source. Comparison only: state players vs Census-based 2013 state population (github.com/jakevdp/data-USstates) rank correlation ${fmt(crossChecks.hometowns.statePlayersVsStatePopulation2013)}. ${homeMissing} of ${collegeRows} rows have no usable home and are left out of shares.`),
  mk(6, 'Hometown counts: players per real town, towns with 2 or more players.', townPlayersShipped, 'players in shipped towns', [src.espn], ['hometowns.json:states.*.towns'], `One source. Comparison only: town players vs 2014 city population (github.com/plotly/datasets) ${fmt(crossChecks.hometowns.townPlayersVsCityPopulation2014)}. Town coordinates are the mean of the ESPN geocodes of that town's players.`),
  mk(7, 'Name suffix rate among pro players (Jr., Sr., II, III, IV, V), by birth cohort.', [...suffixes.values()].reduce((a, m) => a + [...m.values()].reduce((x, y) => x + y, 0), 0), 'players with a suffix', [src.nflverse], ['suffixes.json'], 'One source. The register may drop suffixes for some players, so the rate is a floor.'),
  mk(8, 'Region of the eight states with no reference location (NJ, DE, NH, RI, ME, WY, HI, AK).', undefined, undefined, [], ['hometowns.json:regionOfState'], 'Design choice: each placed beside its nearest listed neighbours; the other 43 states and DC take the region of their reference locations in packages/football-content/data/world.', true),
  mk(9, 'Table construction constants: minimum people per name row (3), minimum players per town (2), entry age (18), cohort width (5 years), thin-table size (200), census rows shipped (5,000).', undefined, undefined, [], ['first-names.json:params', 'surnames.json:params', 'hometowns.json:params'], 'Design choices, named in params of each file. The minimum of 3 keeps any shipped row from pointing at one real person.', true),
];
writeFileSync(join(outDir, 'fact-rows.json'), JSON.stringify({ domain: 'measured-rate', rows }, null, 1) + '\n');
console.log(rows.map((r) => `${r.id} ${r.status}`).join('\n'));

console.log(JSON.stringify({ people: people.length, proKept, collegeSkippedAsPro, cohorts, firstAll: pack(first.all).shipped, lastAll: pack(last.all).shipped, guard: guardSorted.length, crossChecks, townRowsShipped, knownHome, homeMissing, suffixTotals: Object.fromEntries([...suffixes].map(([s, m]) => [s, [...m.values()].reduce((a, b) => a + b, 0)])) }, null, 1));
