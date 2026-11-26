// C2.2.1 Weeks and byes. Each week is a matching of clubs; a club's free week is its bye. The solver
// builds a first assignment by greedy edge colouring with Kempe-chain repair, then improves it with
// Kempe swaps between two weeks (always legal: each week stays a matching) and whole-week swaps,
// accepted by late-acceptance hill climbing. Integer costs, no transcendental math, one RandomStream.
import type { RandomStream } from '@gm/schema';
import type { Pairing, ScheduleConfig, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { byYear, half } from './util.ts';

/** An international game fixed before the weeks are placed (C2.4.1). */
export interface WeekConstraintIntl {
  readonly pairing: number;
  /** Clubs that take their bye the week after this game (each club's own choice). */
  readonly byeAfter: readonly TeamId[];
  readonly fixedWeek: number | null;
}

export interface WeekProblem {
  readonly season: number;
  readonly teams: readonly TeamId[];
  readonly pairings: readonly Pairing[];
  readonly venueOf: Readonly<Record<TeamId, string>>;
  readonly intl: readonly WeekConstraintIntl[];
}

export interface WeekSolution {
  /** Week (1-based) of each pairing, same order as the input. */
  readonly weekOf: number[];
  readonly byeWeek: Record<TeamId, number>;
  readonly maxConsecutiveUsed: number;
  readonly restarts: number;
  readonly iterations: number;
}

export interface CostBreakdown {
  hard: number;
  soft: number;
  road3Clubs: number;
}

const NONE = -1;

class State {
  readonly N: number;
  readonly W: number;
  readonly G: number;
  readonly hu: Int32Array;
  readonly av: Int32Array;
  readonly div: Uint8Array;
  readonly venue: Int32Array;
  readonly wk: Int32Array;
  readonly tw: Int32Array;
  readonly intlWeekFixed: Int32Array;
  readonly isIntl: Uint8Array;
  readonly byeAfterGame: Int32Array;
  readonly byeAfterDeclined: Int32Array[];
  readonly hasIntl: boolean;
  readonly bufBye: Int32Array;
  readonly bufGames: Int32Array;
  readonly bufVenue: Int32Array;

  constructor(p: WeekProblem, cfg: ScheduleConfig) {
    const idx = new Map(p.teams.map((t, i) => [t, i] as const));
    this.N = p.teams.length;
    this.W = cfg.pro.weeks.count;
    this.G = p.pairings.length;
    this.hu = new Int32Array(this.G);
    this.av = new Int32Array(this.G);
    this.div = new Uint8Array(this.G);
    this.wk = new Int32Array(this.G).fill(NONE);
    this.tw = new Int32Array(this.N * this.W).fill(NONE);
    const venues = new Map<string, number>();
    this.venue = new Int32Array(this.N);
    p.teams.forEach((t, i) => {
      const v = p.venueOf[t] ?? t;
      if (!venues.has(v)) venues.set(v, venues.size);
      this.venue[i] = venues.get(v)!;
    });
    p.pairings.forEach((g, e) => {
      this.hu[e] = idx.get(g.home)!;
      this.av[e] = idx.get(g.away)!;
      this.div[e] = g.kind === 'division' ? 1 : 0;
    });
    this.intlWeekFixed = new Int32Array(this.G).fill(NONE);
    this.isIntl = new Uint8Array(this.G);
    this.byeAfterGame = new Int32Array(this.N).fill(NONE);
    this.byeAfterDeclined = Array.from({ length: this.N }, () => new Int32Array(0));
    const declined: number[][] = Array.from({ length: this.N }, () => []);
    for (const c of p.intl) {
      this.isIntl[c.pairing] = 1;
      if (c.fixedWeek !== null) this.intlWeekFixed[c.pairing] = c.fixedWeek - 1;
      for (const side of [this.hu[c.pairing]!, this.av[c.pairing]!]) {
        if (c.byeAfter.includes(p.teams[side]!)) this.byeAfterGame[side] = c.pairing;
        else declined[side]!.push(c.pairing);
      }
    }
    declined.forEach((d, i) => { this.byeAfterDeclined[i] = Int32Array.from(d); });
    this.hasIntl = p.intl.length > 0;
    this.bufBye = new Int32Array(this.N);
    this.bufGames = new Int32Array(this.W);
    this.bufVenue = new Int32Array(this.N * this.W);
  }

  other(e: number, t: number): number { return this.hu[e] === t ? this.av[e]! : this.hu[e]!; }
  at(t: number, w: number): number { return this.tw[t * this.W + w]!; }

  place(e: number, w: number): void {
    this.wk[e] = w;
    this.tw[this.hu[e]! * this.W + w] = e;
    this.tw[this.av[e]! * this.W + w] = e;
  }

  unplace(e: number): void {
    const w = this.wk[e]!;
    if (w === NONE) return;
    this.tw[this.hu[e]! * this.W + w] = NONE;
    this.tw[this.av[e]! * this.W + w] = NONE;
    this.wk[e] = NONE;
  }

  /** The (w1, w2) Kempe component that contains team t. */
  chain(t: number, w1: number, w2: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    // Walk both directions from t.
    for (const start of [w1, w2]) {
      let cur = t;
      let w = start;
      for (;;) {
        const e = this.at(cur, w);
        if (e === NONE || seen.has(e)) break;
        seen.add(e);
        out.push(e);
        cur = this.other(e, cur);
        w = w === w1 ? w2 : w1;
      }
    }
    return out;
  }
}

/** Swap a Kempe component between two weeks. Edges keep their partner; only weeks change. */
function kempeSwap(s: State, edges: readonly number[], w1: number, w2: number): void {
  const old = edges.map((e) => s.wk[e]!);
  for (const e of edges) s.unplace(e);
  edges.forEach((e, i) => s.place(e, old[i] === w1 ? w2 : w1));
}

function swapWeeks(s: State, w1: number, w2: number): void {
  const a: number[] = [];
  const b: number[] = [];
  for (let e = 0; e < s.G; e++) {
    if (s.wk[e] === w1) a.push(e);
    else if (s.wk[e] === w2) b.push(e);
  }
  for (const e of a) s.unplace(e);
  for (const e of b) s.unplace(e);
  for (const e of a) s.place(e, w2);
  for (const e of b) s.place(e, w1);
}

/** Greedy edge colouring with Kempe repair. Returns false if an edge could not be placed. */
function initialColouring(s: State, rng: RandomStream): boolean {
  const order = Array.from({ length: s.G }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  // Fixed-week games first.
  order.sort((x, y) => (s.intlWeekFixed[y]! > NONE ? 1 : 0) - (s.intlWeekFixed[x]! > NONE ? 1 : 0));
  for (const e of order) {
    const u = s.hu[e]!;
    const v = s.av[e]!;
    const fixed = s.intlWeekFixed[e]!;
    const freeU: number[] = [];
    const freeV: number[] = [];
    for (let w = 0; w < s.W; w++) {
      if (s.at(u, w) === NONE) freeU.push(w);
      if (s.at(v, w) === NONE) freeV.push(w);
    }
    const common = freeU.filter((w) => freeV.includes(w));
    if (fixed > NONE) {
      if (common.includes(fixed)) { s.place(e, fixed); continue; }
    } else if (common.length > 0) {
      s.place(e, common[rng.int(0, common.length - 1)]!);
      continue;
    }
    let placed = false;
    for (const a of freeU) {
      for (const b of freeV) {
        if (a === b) continue;
        // Free colour a at v by flipping v's (a, b) path.
        const path = s.chain(v, a, b);
        if (path.some((x) => s.hu[x] === u || s.av[x] === u)) continue;
        kempeSwap(s, path, a, b);
        if (s.at(u, a) === NONE && s.at(v, a) === NONE && (fixed === NONE || fixed === a)) {
          s.place(e, a);
          placed = true;
          break;
        }
        kempeSwap(s, path, a, b);
      }
      if (placed) break;
    }
    if (!placed) return false;
  }
  return true;
}

export interface CostContext {
  readonly cfg: ScheduleConfig;
  readonly maxConsecutive: number;
  readonly noBye: Set<number>;
  /** This season's count of clubs with a three-game road trip, drawn inside the real 2 to 4 band. */
  readonly road3Target: number;
}

export function evaluate(s: State, ctx: CostContext): CostBreakdown {
  const { cfg } = ctx;
  const P = cfg.pro;
  const S = cfg.pro.solver;
  const W = s.W;
  const N = s.N;
  let hard = 0;
  let soft = 0;
  const byeWeek = s.bufBye.fill(NONE);
  const tw = s.tw;
  for (let t = 0; t < N; t++) {
    const base = t * W;
    for (let w = 0; w < W; w++) if (tw[base + w] === NONE) { byeWeek[t] = w; break; }
  }
  let road3 = 0;
  const lateFrom = W - P.soft.divisionLateWindowWeeks;
  for (let t = 0; t < N; t++) {
    let runSite = NONE;
    let run = 0;
    let had3Road = false;
    let offBye = 0;
    let lateDiv = 0;
    const base = t * W;
    for (let w = 0; w < W; w++) {
      const e = tw[base + w]!;
      if (e === NONE) continue;
      const site = s.hu[e] === t ? 0 : 1;
      if (site === runSite) run++;
      else {
        if (runSite === 1 && run === ctx.maxConsecutive) had3Road = true;
        runSite = site;
        run = 1;
      }
      if (run > ctx.maxConsecutive) hard += S.hardWeight;
      const o = s.other(e, t);
      if (w > 0 && byeWeek[o] === w - 1 && byeWeek[t] !== w - 1) offBye++;
      if (w >= lateFrom && s.div[e] === 1) lateDiv++;
    }
    if (runSite === 1 && run === ctx.maxConsecutive) had3Road = true;
    if (had3Road) road3++;
    if (offBye > P.soft.offByeHardMax) hard += (offBye - P.soft.offByeHardMax) * S.hardWeight;
    if (offBye > P.soft.offByeSoftMax) soft += (offBye - P.soft.offByeSoftMax) * S.offByeWeight;
    if (lateDiv < P.soft.divisionLateMinGames) soft += (P.soft.divisionLateMinGames - lateDiv) * S.divisionLateWeight;
    if (!s.hasIntl) continue;
    const ba = s.byeAfterGame[t]!;
    if (ba > NONE && byeWeek[t] !== s.wk[ba]! + 1) hard += S.internationalByeWeight;
    for (const g of s.byeAfterDeclined[t]!) {
      const next = s.wk[g]! + 1;
      if (next < W) {
        const e = s.at(t, next);
        if (e !== NONE && s.av[e] === t) soft += S.internationalNextHomeWeight;
      }
    }
  }
  // Week-level rules.
  const winFirst = P.weeks.byeWindowFirst - 1;
  const winLast = P.weeks.byeWindowLast - 1;
  let empty = 0;
  const games = s.bufGames.fill(0);
  for (let e = 0; e < s.G; e++) games[s.wk[e]!]!++;
  for (let w = 0; w < W; w++) {
    const byes = N - games[w]! - games[w]!;
    const pairs = half(byes);
    const inWindow = w >= winFirst && w <= winLast;
    if (!inWindow || ctx.noBye.has(w)) hard += pairs * S.hardWeight;
    else {
      if (byes > P.weeks.maxByeClubsPerWeek) hard += half(byes - P.weeks.maxByeClubsPerWeek) * S.hardWeight;
      if (byes === 0) empty++;
    }
  }
  if (empty > P.weeks.maxExtraEmptyByeWeeks) hard += (empty - P.weeks.maxExtraEmptyByeWeeks) * S.hardWeight;
  const last = W - 1;
  const homeVenueWeek = s.bufVenue.fill(0);
  for (let e = 0; e < s.G; e++) {
    const w = s.wk[e]!;
    if (P.weeks.finalWeekDivisionOnly && w === last && s.div[e] === 0) hard += S.hardWeight;
    const key = w * N + s.venue[s.hu[e]!]!;
    if (s.isIntl[e] === 0) {
      const c = ++homeVenueWeek[key]!;
      if (c > 1) hard += S.hardWeight;
    }
    if (s.isIntl[e] === 1) {
      const f = s.intlWeekFixed[e]!;
      if (f > NONE) { if (w !== f) hard += S.hardWeight; }
      else if (w < cfg.international.firstWeek - 1 || w > cfg.international.lastWeek - 1) hard += S.hardWeight;
    }
  }
  // A club never plays international games in consecutive weeks.
  if (s.hasIntl) for (let t = 0; t < N; t++) {
    for (let w = 1; w < W; w++) {
      const a = s.at(t, w - 1);
      const b = s.at(t, w);
      if (a !== NONE && b !== NONE && s.isIntl[a] === 1 && s.isIntl[b] === 1) hard += S.hardWeight;
    }
  }
  soft += Math.abs(road3 - ctx.road3Target) * S.road3Weight;
  return { hard, soft, road3Clubs: road3 };
}

function total(c: CostBreakdown): number { return c.hard + c.soft; }

/** Solve weeks for one season (C2.2.1). Throws only if every restart and the relaxation fail. */
export function solveWeeks(p: WeekProblem, rng: RandomStream, cfg: ScheduleConfig = DEFAULT_CONFIG): WeekSolution {
  const S = cfg.pro.solver;
  const noBye = new Set(byYear(cfg.pro.weeks.noByeWeeksByYear, p.season).map((w) => w - 1));
  let maxConsecutive = cfg.pro.weeks.maxConsecutiveSameSite;
  let restarts = 0;
  let iterations = 0;
  for (let relax = 0; relax <= 1; relax++) {
    for (let attempt = 0; attempt < S.restarts; attempt++) {
      const s = new State(p, cfg);
      if (!initialColouring(s, rng)) { restarts++; continue; }
      const road3Target = rng.int(cfg.pro.soft.road3TargetMinClubs, cfg.pro.soft.road3TargetMaxClubs);
      const ctx: CostContext = { cfg, maxConsecutive, noBye, road3Target };
      let cur = evaluate(s, ctx);
      let curT = total(cur);
      const hist = new Array<number>(S.lateAcceptanceLength).fill(curT);
      for (let i = 0; i < S.maxIterations && curT > 0; i++) {
        iterations++;
        const w1 = rng.int(0, s.W - 1);
        let w2 = rng.int(0, s.W - 1 - 1);
        if (w2 >= w1) w2++;
        const wholeWeek = rng.int(0, S.lateAcceptanceLength) === 0;
        let chain: number[] = [];
        if (wholeWeek) swapWeeks(s, w1, w2);
        else {
          const t = rng.int(0, s.N - 1);
          chain = s.chain(t, w1, w2);
          if (chain.length === 0) continue;
          kempeSwap(s, chain, w1, w2);
        }
        const next = evaluate(s, ctx);
        const nextT = total(next);
        const slot = i % S.lateAcceptanceLength;
        if (nextT <= curT || nextT <= hist[slot]!) {
          cur = next;
          curT = nextT;
        } else if (wholeWeek) swapWeeks(s, w1, w2);
        else kempeSwap(s, chain, w1, w2);
        hist[slot] = curT;
      }
      if (cur.hard === 0) {
        const weekOf = Array.from(s.wk, (w) => w + 1);
        const byeWeek: Record<TeamId, number> = {};
        p.teams.forEach((t, i) => {
          for (let w = 0; w < s.W; w++) if (s.at(i, w) === NONE) { byeWeek[t] = w + 1; break; }
        });
        return { weekOf, byeWeek, maxConsecutiveUsed: maxConsecutive, restarts, iterations };
      }
      restarts++;
    }
    maxConsecutive++;
  }
  throw new Error('C2.2.1: no schedule met the hard constraints after every restart and the relaxation');
}

/** Cost of a finished assignment, for tests and reports. */
export function scoreWeeks(p: WeekProblem, weekOf: readonly number[], cfg: ScheduleConfig = DEFAULT_CONFIG, maxConsecutive = cfg.pro.weeks.maxConsecutiveSameSite): CostBreakdown {
  const s = new State(p, cfg);
  weekOf.forEach((w, e) => s.place(e, w - 1));
  const noBye = new Set(byYear(cfg.pro.weeks.noByeWeeksByYear, p.season).map((w) => w - 1));
  const r3 = evaluate(s, { cfg, maxConsecutive, noBye, road3Target: cfg.pro.soft.road3TargetMinClubs });
  return r3;
}
