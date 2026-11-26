// From real data to attributes (U3.1, U3.2, D13.6.3 rule 1). One published method, the same for every real
// person: body and tests first (U3.1.2), then technique and mental from usage and production (U3.1.3), then
// ceiling and development (U3.1.1 rule 4). Draws use a stream keyed by the pack hash and the person's source
// key (U3.1.1 rule 2), so a value never depends on import order; `measured` values use no draw at all.
// Nothing reads a name, a draft pick beyond U3.1.3 rule 3, or anything off the field (U3.3.1 rule 3, X14.1.1).
import { ATTRIBUTE_IDS, type RandomStream, type DeterministicMath } from '@gm/schema';
import {
  GROUPS, POSITION_RELEVANCE, RELEVANCE_OFFSET_ISS, PROFILE_POSITIONS, proProfile, AGE_GAP_ISS, TIER_SHARES,
  generatePlayer, type ProfilePosition, type Profile, type ProfileVar, type BodyVector, type GeneratorRandom,
} from '../generator/index.ts';
import { physicalIss, changeOfDirectionZ } from '../generator/body.ts';
import { interp, param as genParam } from '../generator/params.ts';
import { cholesky } from '../generator/linalg.ts';
import type { PackRow } from '../pack/index.ts';
import { param } from './params.ts';

export type Confidence = 'measured' | 'inferred' | 'prior';

/** Pack position codes without their own profile, mapped to the nearest one (D13.2.1 edge case). */
const IMPORT_POSITION_PROFILE: Readonly<Record<string, ProfilePosition>> = {
  QB: 'QB', RB: 'RB', FB: 'FB', WR: 'WR', TE: 'TE', OT: 'OT', OG: 'IOL', C: 'IOL', DE: 'EDGE', DT: 'DT', NT: 'DT',
  LB: 'LB', CB: 'CB', S: 'S', K: 'K', P: 'P', LS: 'LS', KR: 'WR', PR: 'WR',
};

export function importProfileOf(position: string): ProfilePosition {
  const p = IMPORT_POSITION_PROFILE[position] ?? (PROFILE_POSITIONS as readonly string[]).find((x) => x === position);
  if (!p) throw new Error(`no profile for imported position ${position}`);
  return p as ProfilePosition;
}

const SPECIALISTS: ReadonlySet<ProfilePosition> = new Set(['K', 'P', 'LS']);
/** Positions whose long-time starters move up in recognition and processing (U3.1.3 rule 6). */
const SIGNAL_CALLERS: ReadonlySet<ProfilePosition> = new Set(['QB', 'LB']);
const MENTAL_FROM_STARTS = ['play_recognition', 'processing_speed'] as const;

/** Pack test columns to profile variables (U3.1.2 inputs). */
const TEST_COLUMNS: readonly (readonly [string, ProfileVar])[] = [
  ['height_in', 'heightIn'], ['weight_lb', 'weightLb'], ['forty', 'fortyS'], ['vertical', 'verticalIn'],
  ['broad_jump', 'broadIn'], ['cone', 'threeConeS'], ['shuttle', 'shuttleS'], ['bench', 'benchReps'],
];

const num = (v: string | undefined): number | null => (v === undefined || v === '' ? null : Number(v));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

// ---- U3.1.2 physical layer ----

/** Solves A x = b by Gaussian elimination with partial pivoting (small systems only). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    [m[c], m[p]] = [m[p]!, m[c]!];
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('singular correlation block');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

export interface BodyEstimate {
  body: BodyVector;
  /** Profile variables filled by the conditional draw (D13.6.3 rule 1), marked `prior`. */
  filled: ProfileVar[];
  measured: ProfileVar[];
}

/**
 * D13.6.3 rule 1 conditional fill: missing profile variables are drawn from the position profile's
 * multivariate normal conditioned on the measured ones (z space, the profile's correlation matrix).
 */
export function estimateBody(prof: Profile, known: Partial<Record<ProfileVar, number>>, s: RandomStream): BodyEstimate {
  const vars = prof.vars;
  const kIdx: number[] = [], mIdx: number[] = [];
  vars.forEach((v, i) => (known[v] !== undefined ? kIdx : mIdx).push(i));
  const z = vars.map((v) => (known[v] !== undefined ? (known[v]! - prof.mean(v)) / prof.sd(v) : 0));
  const body: BodyVector = {};
  for (const i of kIdx) body[vars[i]!] = known[vars[i]!]!;
  if (mIdx.length > 0) {
    const R = prof.corr;
    let mean = mIdx.map(() => 0);
    let cov = mIdx.map((i) => mIdx.map((j) => R[i]![j]!));
    if (kIdx.length > 0) {
      const Rkk = kIdx.map((i) => kIdx.map((j) => R[i]![j]!));
      const zk = kIdx.map((i) => z[i]!);
      const w = solve(Rkk, zk);
      mean = mIdx.map((i) => kIdx.reduce((a, k, t) => a + R[i]![k]! * w[t]!, 0));
      cov = mIdx.map((i) => mIdx.map((j) => {
        const x = solve(Rkk, kIdx.map((k) => R[k]![j]!));
        return R[i]![j]! - kIdx.reduce((a, k, t) => a + R[i]![k]! * x[t]!, 0);
      }));
    }
    // A small ridge keeps the factor real when the conditional block is near singular.
    for (let i = 0; i < cov.length; i++) cov[i]![i]! += 1e-9;
    const L = cholesky(cov);
    const e = mIdx.map(() => s.normal());
    mIdx.forEach((i, a) => {
      let zi = mean[a]!;
      for (let b = 0; b <= a; b++) zi += L[a]![b]! * e[b]!;
      body[vars[i]!] = prof.mean(vars[i]!) + zi * prof.sd(vars[i]!);
    });
  }
  return { body, filled: mIdx.map((i) => vars[i]!), measured: kIdx.map((i) => vars[i]!) };
}

// ---- U3.1.3 technique and mental ----

/** One per-opportunity production statistic (U3.1.3 rule 2): which job, which groups it moves. */
interface ProductionStat {
  id: string;
  value: (r: PackRow) => number | null;
  opportunities: (r: PackRow) => number;
  k: string;
  groups: readonly string[];
  /** +1 when more is better. */
  sign: 1 | -1;
}

const ratio = (a: string, b: string) => (r: PackRow) => { const x = num(r[a]), y = num(r[b]); return x !== null && y ? x / y : null; };
const perGame = (a: string, b?: string) => (r: PackRow) => { const g = num(r['games']); if (!g) return null; const x = (num(r[a]) ?? 0) + (b ? num(r[b]) ?? 0 : 0); return x / g; };
const col = (c: string) => (r: PackRow) => num(r[c]) ?? 0;

/** Statistic columns use the nflverse names the built-in pack builder writes; a pack without them gives no signal. */
export const PRODUCTION: Readonly<Partial<Record<ProfilePosition, readonly ProductionStat[]>>> = {
  QB: [
    { id: 'qb.epa_per_attempt', value: ratio('passing_epa', 'attempts'), opportunities: col('attempts'), k: 'production.k.attempts', groups: ['qb'], sign: 1 },
    { id: 'qb.yards_per_attempt', value: ratio('passing_yards', 'attempts'), opportunities: col('attempts'), k: 'production.k.attempts', groups: ['signal_caller'], sign: 1 },
  ],
  RB: [{ id: 'rb.yards_per_carry', value: ratio('rushing_yards', 'carries'), opportunities: col('carries'), k: 'production.k.carries', groups: ['rb'], sign: 1 }],
  WR: [{ id: 'wr.yards_per_target', value: ratio('receiving_yards', 'targets'), opportunities: col('targets'), k: 'production.k.targets', groups: ['receiver'], sign: 1 }],
  TE: [{ id: 'te.yards_per_target', value: ratio('receiving_yards', 'targets'), opportunities: col('targets'), k: 'production.k.targets', groups: ['receiver'], sign: 1 }],
  EDGE: [{ id: 'edge.pressure_per_game', value: perGame('def_sacks', 'def_qb_hits'), opportunities: col('games'), k: 'production.k.games', groups: ['edge'], sign: 1 }],
  DT: [{ id: 'dt.pressure_per_game', value: perGame('def_sacks', 'def_qb_hits'), opportunities: col('games'), k: 'production.k.games', groups: ['idl'], sign: 1 }],
  LB: [{ id: 'lb.solo_tackles_per_game', value: perGame('def_tackles_solo'), opportunities: col('games'), k: 'production.k.games', groups: ['lb'], sign: 1 }],
  CB: [{ id: 'cb.passes_defended_per_game', value: perGame('def_pass_defended', 'def_interceptions'), opportunities: col('games'), k: 'production.k.games', groups: ['coverage'], sign: 1 }],
  S: [{ id: 's.passes_defended_per_game', value: perGame('def_pass_defended', 'def_interceptions'), opportunities: col('games'), k: 'production.k.games', groups: ['coverage'], sign: 1 }],
  K: [{ id: 'k.field_goal_rate', value: ratio('fg_made', 'fg_att'), opportunities: col('fg_att'), k: 'production.k.fgAttempts', groups: ['place_kicking'], sign: 1 }],
  P: [{ id: 'p.net_per_punt', value: ratio('pt_net_yards', 'pt_att'), opportunities: col('pt_att'), k: 'production.k.punts', groups: ['punting'], sign: 1 }],
};

/** Pack-wide reference numbers, computed once from every imported pro player (two passes; no outside constant). */
export interface Population {
  /** Mean and sd of each production statistic among players of the profile (rule 2 z-scores). */
  production: Record<string, { mean: number; sd: number; n: number }>;
  /** Games in a full season per (level, season): the most games any player in the pack has that season. */
  seasonGames: Record<string, number>;
  /** Picks in a draft per year: the highest pick number the pack holds for that year. */
  draftPicks: Record<number, number>;
}

/** Season rows that count for an estimate: before the world start, at the level, most recent first. */
function recentSeasons(rows: readonly PackRow[], level: string, worldStartYear: number): PackRow[] {
  return rows.filter((r) => r['level'] === level && Number(r['season']) < worldStartYear).sort((a, b) => Number(b['season']) - Number(a['season']));
}

/**
 * Share of team snaps (the builder writes `snap_share` from per-game snap percentages), else share of the
 * season's games started. Null when the row has neither.
 */
export function seasonShare(r: PackRow, pop: Population): number | null {
  const ss = num(r['snap_share']);
  if (ss !== null) return clamp(ss, 0, 1);
  const st = num(r['starts']);
  const full = pop.seasonGames[`${r['level']}|${r['season']}`];
  if (st !== null && full) return clamp(st / full, 0, 1);
  return null;
}

export function buildPopulation(players: readonly { profile: ProfilePosition; seasons: readonly PackRow[] }[], playing: Iterable<PackRow>, worldStartYear: number): Population {
  const seasonGames: Record<string, number> = {};
  const acc: Record<string, number[]> = {};
  for (const p of players) {
    for (const r of p.seasons) {
      const key = `${r['level']}|${r['season']}`;
      const g = num(r['games']);
      if (g !== null) seasonGames[key] = Math.max(seasonGames[key] ?? 0, g);
    }
    const recent = recentSeasons(p.seasons, 'pro', worldStartYear).slice(0, 3);
    for (const st of PRODUCTION[p.profile] ?? []) {
      const v = pooledValue(st, recent);
      if (v !== null) (acc[st.id] ??= []).push(v.value);
    }
  }
  const production: Population['production'] = {};
  for (const [id, xs] of Object.entries(acc)) {
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
    production[id] = { mean, sd, n };
  }
  const draftPicks: Record<number, number> = {};
  for (const r of playing) {
    const y = num(r['draft_year']), pk = num(r['draft_pick']);
    if (y !== null && pk !== null) draftPicks[y] = Math.max(draftPicks[y] ?? 0, pk);
  }
  return { production, seasonGames, draftPicks };
}

/** Opportunity-weighted value of one statistic over the given seasons, with the opportunities. */
function pooledValue(st: ProductionStat, seasons: readonly PackRow[]): { value: number; n: number } | null {
  let num_ = 0, n = 0;
  for (const r of seasons) {
    const v = st.value(r), o = st.opportunities(r);
    if (v === null || !Number.isFinite(v) || o <= 0) continue;
    num_ += v * o; n += o;
  }
  return n > 0 ? { value: num_ / n, n } : null;
}

export interface PlayerEstimate {
  attributes: Record<string, number>;
  ceilings: Record<string, number>;
  confidence: Record<string, Confidence>;
  tests: { fortyS: number; tenSplitS: number; threeConeS: number | null; shuttleS: number | null; verticalIn: number | null; broadIn: number | null; changeOfDirectionZ: number };
  heightIn: number;
  weightLb: number;
  hidden: Record<string, number>;
  /** Fields filled by D13.6.3 rule 1. */
  filled: string[];
  /** Notes for the import report (missing ageing hook and so on). */
  notes: string[];
  /** The main-role value before relevance offsets, for the U3.1.3 acceptance check and placement. */
  mainValue: number;
}

export interface ProEstimateInput {
  profile: ProfilePosition;
  /** Level whose seasons count (the established-player estimate runs on pro seasons). */
  level: string;
  playing: PackRow | undefined;
  seasons: readonly PackRow[];
  ageYears: number;
  worldStartYear: number;
  population: Population;
  stream: RandomStream;
  math: DeterministicMath;
  /** D8 ageing of tests taken years before the world start (U3.1.2 rule 3). Owned by G-20; until then tests are not aged and the report says so. */
  ageTests?: (body: BodyVector, fromAge: number, toAge: number) => BodyVector;
}

const ROLE_TABLE = (): (readonly [number, number])[] => [
  [0, param('role.reserve')], [param('role.rotationShare'), param('role.rotation')], [param('role.starterShare'), param('role.starter')], [1, param('role.starter')],
];

/** U3.1.1 to U3.1.3 for a pro player. */
export function estimatePro(inp: ProEstimateInput): PlayerEstimate {
  const prof = proProfile(inp.profile);
  const notes: string[] = [];
  const known: Partial<Record<ProfileVar, number>> = {};
  for (const [c, v] of TEST_COLUMNS) {
    const x = num(inp.playing?.[c]);
    if (x !== null && prof.vars.includes(v)) known[v] = x;
  }
  const be = estimateBody(prof, known, inp.stream);
  let body = be.body;
  const testYear = num(inp.playing?.['test_year']);
  if (testYear !== null && testYear < inp.worldStartYear) {
    const fromAge = inp.ageYears - (inp.worldStartYear - testYear);
    if (inp.ageTests) body = inp.ageTests(body, fromAge, inp.ageYears);
    else notes.push('tests_not_aged: D8 ageing (G-20) not bound; tests used as measured');
  }

  // Usage over the last three seasons before the world start (rule 1 weights, renormalised over seasons present).
  const recent = recentSeasons(inp.seasons, inp.level, inp.worldStartYear).slice(0, 3);
  const weights = [param('role.weightLast'), param('role.weightPrev'), param('role.weightThird')];
  let wSum = 0, share = 0, games = 0;
  recent.forEach((r, i) => {
    const sh = SPECIALISTS.has(inp.profile) ? (num(r['games']) !== null ? clamp(num(r['games'])! / (inp.population.seasonGames[`${r['level']}|${r['season']}`] ?? num(r['games'])!), 0, 1) : null) : seasonShare(r, inp.population);
    if (sh === null) return;
    share += weights[i]! * sh; wSum += weights[i]!;
    games += num(r['games']) ?? 0;
  });
  const weightedShare = wSum > 0 ? share / wSum : null;
  const prior = param('role.priorPro');
  let main = prior;
  if (weightedShare !== null) main = prior + (interp(ROLE_TABLE(), weightedShare) - prior) * (games / (games + param('role.shrinkGames')));

  // Draft signal (rule 3): fades to zero by the fourth season.
  const pl = inp.playing;
  const draftYear = num(pl?.['draft_year']), pick = num(pl?.['draft_pick']);
  if (draftYear !== null && pick !== null) {
    const since = inp.worldStartYear - draftYear;
    const fade = param('draft.fadeSeasons');
    const maxPick = inp.population.draftPicks[draftYear] ?? pick;
    if (since >= 0 && since < fade && maxPick > 0) {
      const slot = interp([[1, param('draft.firstPickIss')], [Math.max(2, maxPick), param('draft.lastPickIss')]], pick);
      main += param('draft.weight') * (1 - since / fade) * (slot - main);
    }
  }

  // Production signal (rule 2), per group.
  const groupMove: Record<string, number> = {};
  for (const st of PRODUCTION[inp.profile] ?? []) {
    const ref = inp.population.production[st.id];
    const pv = pooledValue(st, recent);
    if (!ref || !pv || ref.n < param('production.minPositionSample') || ref.sd <= 0) continue;
    const zs = st.sign * ((pv.value - ref.mean) / ref.sd) * (pv.n / (pv.n + param(st.k)));
    for (const g of st.groups) groupMove[g] = clamp((groupMove[g] ?? 0) + param('production.issPerZ') * zs, -param('production.capIss'), param('production.capIss'));
  }

  const attributes: Record<string, number> = {};
  const confidence: Record<string, Confidence> = {};
  const rel = POSITION_RELEVANCE[inp.profile];
  const hasSignal = weightedShare !== null && games > 0;
  for (const [group, list] of Object.entries(GROUPS)) {
    if (group === 'mental') continue;
    const r = rel[group] ?? 'o';
    const v = clamp(main + RELEVANCE_OFFSET_ISS[r] + (r === 'p' ? groupMove[group] ?? 0 : 0), 0, 100);
    for (const a of list) { attributes[a] = r1(v); confidence[a] = r === 'p' && hasSignal ? 'inferred' : 'prior'; }
  }
  // Mental (rule 6): position median; recognition and processing move with seasons as a starter.
  const mentalBase = clamp(prior + RELEVANCE_OFFSET_ISS[rel['mental'] ?? 'p'], 0, 100);
  const starterSeasons = SIGNAL_CALLERS.has(inp.profile)
    ? inp.seasons.filter((r) => r['level'] === inp.level && Number(r['season']) < inp.worldStartYear && (seasonShare(r, inp.population) ?? 0) >= param('role.starterShare')).length
    : 0;
  const mentalBump = Math.min(param('mental.capIss'), param('mental.perStarterSeason') * starterSeasons);
  for (const a of GROUPS['mental']!) {
    const bump = (MENTAL_FROM_STARTS as readonly string[]).includes(a) ? mentalBump : 0;
    attributes[a] = r1(clamp(mentalBase + bump, 0, 100));
    confidence[a] = bump > 0 ? 'inferred' : 'prior';
  }

  // Physical (U3.1.2): from the body; durability at the position median (rule 5); stamina moved by usage (rule 6).
  const phys = physicalIss(prof, body, { strengthE: 0, staminaE: 0, durabilityZ: 0 });
  const usage = weightedShare === null ? 0 : clamp((weightedShare - param('role.rotationShare')) / (1 - param('role.rotationShare')), 0, 1);
  attributes['play_strength'] = r1(phys.play_strength);
  attributes['explosiveness'] = r1(phys.explosiveness);
  attributes['stamina'] = r1(genParam('physicalProfileIss') + param('stamina.capIss') * usage);
  attributes['durability'] = r1(genParam('physicalProfileIss'));
  const m = new Set(be.measured);
  confidence['play_strength'] = m.has('benchReps') && m.has('weightLb') ? 'measured' : m.has('weightLb') ? 'inferred' : 'prior';
  confidence['explosiveness'] = m.has('verticalIn') && m.has('broadIn') ? 'measured' : m.has('verticalIn') || m.has('broadIn') ? 'inferred' : 'prior';
  confidence['stamina'] = weightedShare !== null ? 'inferred' : 'prior';
  confidence['durability'] = 'prior';

  for (const id of ATTRIBUTE_IDS) if (attributes[id] === undefined) throw new Error(`attribute ${id} not estimated`);

  // Ceiling and development (U3.1.1 rule 4): a draw for position and age, never moved by name or fame.
  // Stand-in for the D7 distribution until G-20 binds it: ceiling = current + age gap / rate + noise.
  const rate = clamp(1 + param('ceiling.rateSd') * inp.stream.normal(), 0.5, 1.5);
  const gap = interp(AGE_GAP_ISS, inp.ageYears) / rate;
  const ceilings: Record<string, number> = {};
  for (const id of ATTRIBUTE_IDS) {
    const c = attributes[id]! + Math.max(0, gap + param('ceiling.noiseSd') * inp.stream.normal());
    ceilings[id] = r1(clamp(c, attributes[id]!, 100));
  }

  const forty = body.fortyS!;
  const tests = {
    fortyS: r2(forty),
    tenSplitS: r2(forty / genParam('splitRatio')),
    threeConeS: body.threeConeS !== undefined ? r2(body.threeConeS) : null,
    shuttleS: body.shuttleS !== undefined ? r2(body.shuttleS) : null,
    verticalIn: body.verticalIn !== undefined ? r1(body.verticalIn) : null,
    broadIn: body.broadIn !== undefined ? Math.round(body.broadIn) : null,
    changeOfDirectionZ: r2(changeOfDirectionZ(prof, body)),
  };
  const hidden: Record<string, number> = { development_rate: r2(rate), learning_rate: 1, durability_mult: 1 };
  if (body.benchReps !== undefined) hidden['bench_reps'] = r1(body.benchReps);
  const filledCols = be.filled.map((v) => TEST_COLUMNS.find(([, pv]) => pv === v)![0]);
  return {
    attributes, ceilings, confidence, tests, heightIn: r1(body.heightIn!), weightLb: Math.round(body.weightLb!), hidden,
    filled: filledCols, notes, mainValue: r1(main),
  };
}

// ---- U3.1.4 college players ----

/** Class year text to years in college (FR 1 ... SR 4, graduate 5). Unknown gives null. */
export function classYears(cls: string | undefined): number | null {
  if (!cls) return null;
  const c = cls.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const table: Record<string, number> = { FR: 1, RSFR: 1, FRESHMAN: 1, '1': 1, SO: 2, RSSO: 2, SOPHOMORE: 2, '2': 2, JR: 3, RSJR: 3, JUNIOR: 3, '3': 3, SR: 4, RSSR: 4, SENIOR: 4, '4': 4, GR: 5, GRAD: 5, GRADUATE: 5, '5': 5, '6': 5 };
  return table[c] ?? null;
}

export interface CollegeEstimateInput {
  personId: number;
  profile: ProfilePosition;
  position: string;
  playing: PackRow | undefined;
  ageYears: number;
  worldStartYear: number;
  rnd: GeneratorRandom;
  /** Stream scope that makes the draw depend on the pack hash and source key only (U3.1.1 rule 2). */
  scopeKey: string;
}

/**
 * U3.1.4: start from the college profile for his position and class year (the tier tables generated players
 * use, tier drawn by D13.3.2's shares), then shift the body to his real height and weight. Confidence is
 * `prior` for everything but height and weight. A later draft never lifts these values (rule 4).
 */
export function estimateCollege(inp: CollegeEstimateInput): PlayerEstimate {
  const s = inp.rnd.open('person.import', [inp.scopeKey, 'tier']);
  const tiers = [1, 2, 3, 4, 5] as const;
  const tier = tiers[s.pick(tiers.map((t) => TIER_SHARES[t]))]!;
  const gen = generatePlayer({
    personId: inp.personId, position: inp.profile, ageYears: inp.ageYears, seasonYear: inp.worldStartYear,
    talent: { kind: 'tier', tier }, classKey: { classYear: inp.worldStartYear, classType: `import:${inp.scopeKey}`, slotIndex: 0 },
    group: 'college_player', homeRegion: '', hometown: null,
  }, inp.rnd);
  const p = gen.record.playing!;
  const prof = proProfile(inp.profile);
  const realH = num(inp.playing?.['height_in']);
  const realW = num(inp.playing?.['weight_lb']);
  const attributes = { ...p.attributes };
  const filled: string[] = [];
  if (realW !== null) {
    // Body shift (rule 2): play strength carries D2.3.1's weight loading of the weight difference.
    const dz = (realW - p.weightLb) / prof.sd('weightLb');
    attributes['play_strength'] = r1(clamp(attributes['play_strength']! + genParam('playStrengthWeight') * genParam('issPerSd') * dz, 0, 100));
  } else filled.push('weight_lb');
  if (realH === null) filled.push('height_in');
  const ceilings = { ...p.ceilings };
  for (const k of Object.keys(ceilings)) ceilings[k] = Math.max(ceilings[k]!, attributes[k]!);
  const confidence: Record<string, Confidence> = Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, 'prior' as Confidence]));
  const hidden: Record<string, number> = {};
  for (const k of ['development_rate', 'learning_rate', 'durability_mult']) hidden[k] = p.hidden[k]!;
  // Durability and learning stay at the median for real people (U3.1.2 rule 5, U3.1.1 rule 5).
  hidden['durability_mult'] = 1; hidden['learning_rate'] = 1;
  attributes['durability'] = r1(genParam('physicalProfileIss'));
  filled.push('forty', 'vertical', 'broad_jump', 'cone', 'shuttle', 'bench');
  return {
    attributes, ceilings, confidence, tests: { ...p.tests }, heightIn: realH ?? p.heightIn, weightLb: realW ?? p.weightLb, hidden,
    filled, notes: [`college_tier_${tier}`], mainValue: r1(attributes[GROUPS[mainGroupOf(inp.profile)]![0]!]!),
  };
}

/** The first primary technique group of a profile (used to report one main value). */
export function mainGroupOf(profile: ProfilePosition): string {
  const rel = POSITION_RELEVANCE[profile];
  return Object.keys(GROUPS).find((g) => g !== 'mental' && rel[g] === 'p')!;
}

// ---- U3.2 coaches and officials ----

/** Imported coach tendencies (U3.2.1 rule 2), each a difference from the same season's league rate. */
export const TENDENCY_IDS = ['pass_rate_over_expected', 'shotgun_rate', 'no_huddle_rate', 'fourth_down_go_rate', 'two_point_rate', 'late_timeout_rate'] as const;
export type TendencyId = (typeof TENDENCY_IDS)[number];

export interface CoachTendency { delta: number; confidence: Confidence; plays: number }
export type CoachTendencies = Record<TendencyId, CoachTendency>;

/** Play-by-play summary for one head coach (U3.2.1 inputs), already joined on home_coach and away_coach and compared with the same season's league rate. */
export interface CoachPlayByPlay { plays: number; rawDelta: Partial<Record<TendencyId, number>> }

/**
 * U3.2.1: tendencies shrunk to the league median by plays observed (k = 2,000), all at the median under 500
 * plays or with no play-by-play. The project build has no play-by-play joined yet, so every imported coach
 * starts at the median until a pack or local file supplies it (U3.2.1 open question).
 */
export function coachTendencies(pbp?: CoachPlayByPlay): CoachTendencies {
  const out = {} as CoachTendencies;
  const plays = pbp?.plays ?? 0;
  const usable = plays >= param('coach.minPlays');
  const w = usable ? plays / (plays + param('coach.shrinkPlays')) : 0;
  for (const id of TENDENCY_IDS) {
    const raw = pbp?.rawDelta[id];
    out[id] = usable && raw !== undefined ? { delta: raw * w, confidence: 'inferred', plays } : { delta: 0, confidence: 'prior', plays };
  }
  return out;
}

/** U3.2.2: imported officials take median crew parameters (empty map = every parameter at its median). */
export function officialCrewParameters(): Record<string, number> {
  return {};
}
