// The play test bench (O3.1.4, G1.6.2): run one play against chosen calls many times on the real
// engine and report the spread. It runs on the contract `Resolver` and nothing more specific, so the
// tick resolver (WP-23) plugs in through `deps.resolverFor`, which wraps the game's content port with
// an overlay serving the bench sides' assignments by their content ids and hashes.
//
// Honesty rules (G1.6.2, O3.1.4): the caller builds `base.teams` from the user's staff-graded view of
// his own players and the scouted view of the opponent, never true values; the report carries only
// counts, rates with intervals and run indices (no player ids, no attributes); no point estimate is
// shown without its sample size.
import type { Assignment, DefenseCall, GameSituation, OffenseCall, PlayInput, PlayResult, Resolver, Side } from '@gm/schema';
import { streamSource, seedFromNumber } from '@gm/engine-core';
import { benchParam } from './params.ts';

/** One side of a bench run: its call and its assignments in team-slot order (the call's `players` order). */
export interface BenchSide {
  readonly label: string;
  readonly call: OffenseCall | DefenseCall;
  readonly assignments: readonly Assignment[];
}

/** What the resolver must be able to look up for a bench run (the overlay on the content port). */
export interface BenchContent {
  readonly sides: readonly { readonly contentId: string; readonly contentHash: string; readonly assignments: readonly Assignment[] }[];
  readonly knowledge: BenchRequest['knowledge'];
}

export interface BenchRequest {
  /** The side under test: an offensive play here (G-90), a defensive call from the call designer (G-91). */
  readonly subject: BenchSide;
  /** One or more opposing calls; runs are dealt round robin (O3.1.4 "one or more defensive calls"). */
  readonly opponents: readonly BenchSide[];
  /** Down, distance, hash (`ballY`) and field position. `gameId` and `playNumber` are set per run. */
  readonly situation: GameSituation;
  readonly runs?: number;
  readonly seed: number;
  /** "fully installed" unless the coach chooses current readiness (O3.1.4). */
  readonly knowledge: 'fully_installed' | 'current_readiness';
  /** Acknowledges how `base.teams` was built (O3.1.4); the bench refuses anything else. */
  readonly teamValues: { readonly own: 'staff_graded'; readonly opponent: 'scouted' };
  /** The bench is unavailable during a game (O3.1.4 edge case). */
  readonly inGame: boolean;
}

export interface BenchDeps {
  /** Returns the resolver for these contents: the tick resolver with an overlaid content port. */
  resolverFor(content: BenchContent): Resolver;
  /** Everything else a resolver reads (J1.6.1): teams at graded and scouted values, environment, field, math, rules, params. */
  readonly base: Omit<PlayInput, 'situation' | 'calls' | 'streams' | 'options'>;
  /** Polled between chunks; true stops the batch and keeps what has run, marked partial (O3.1.4). */
  shouldCancel?(runsDone: number): boolean;
  /** Progress bar feed. */
  onProgress?(runsDone: number, runsTotal: number): void;
}

export type RunOutcome = 'run' | 'complete' | 'incomplete' | 'interception' | 'sack' | 'fumble_lost' | 'pre_snap_foul' | 'other';

/** One run, as the bench keeps it: no player id, no attribute, only what a coach charts from film. */
export interface RunSummary {
  readonly index: number;
  readonly opponent: string;
  readonly yards: number;
  readonly outcome: RunOutcome;
  readonly passPlay: boolean;
  readonly pressured: boolean;
  /** Role targeted on a pass (by the subject's call), or null. */
  readonly targetRole: string | null;
  /** Contests the subject side lost on this run (J6 contest names). */
  readonly lostContests: readonly string[];
  /** Fouls the subject side committed (an illegal-as-drawn play draws its flag here). */
  readonly fouls: readonly string[];
}

export interface Rate { readonly count: number; readonly of: number; readonly rate: number | null; readonly low: number | null; readonly high: number | null }
export interface MeanCi { readonly n: number; readonly mean: number | null; readonly low: number | null; readonly high: number | null }

export interface BenchBlock {
  readonly opponent: string;
  readonly runs: number;
  readonly yards: MeanCi;
  /** Bin i counts gains in [minYd + i, minYd + i + 1); the first and last bins also hold everything beyond. */
  readonly histogram: { readonly minYd: number; readonly counts: readonly number[] };
  readonly completion: Rate;
  readonly pressure: Rate;
  readonly turnovers: Rate;
  readonly targets: Readonly<Record<string, number>>;
  /** Most common breaking contests, most frequent first. */
  readonly failures: readonly { readonly contest: string; readonly count: number }[];
  readonly fouls: Readonly<Record<string, number>>;
  readonly samples: readonly number[];
}

export interface BenchReport {
  readonly refusedBecause: 'in_game' | 'not_graded_values' | 'no_opponents' | null;
  readonly runsRequested: number;
  readonly runsDone: number;
  readonly partial: boolean;
  readonly seed: number;
  readonly resolver: { readonly id: string; readonly version: string; readonly mayProduceSavedResults: boolean };
  readonly overall: BenchBlock | null;
  readonly byOpponent: readonly BenchBlock[];
  /** E7 hour charge for the session (O3.7.2 action class). */
  readonly hourCharge: { readonly actionClass: 'bench_session'; readonly hours: number };
  readonly runsList: readonly RunSummary[];
}

/** Game id the bench's streams are scoped by: outside any real game's id range is not needed, since the seed is the bench's own. */
const BENCH_GAME_ID = 1;

function callsFor(req: BenchRequest, opp: BenchSide): PlayInput['calls'] {
  const s = req.subject.call, o = opp.call;
  if (s.unit === 'offense' && o.unit === 'defense') return { snapping: s, opposing: o };
  if (s.unit === 'defense' && o.unit === 'offense') return { snapping: o, opposing: s };
  throw new Error('the bench pairs one offensive call with one defensive call');
}

/** The exact input of run `index`: re-run it at `detail: 'full'` to open it in the viewer (O2.6). */
export function benchInput(req: BenchRequest, deps: BenchDeps, index: number, detail: 'full' | 'summary' = 'summary'): PlayInput {
  const opp = req.opponents[index % req.opponents.length]!;
  return {
    ...deps.base,
    situation: { ...req.situation, gameId: BENCH_GAME_ID, playNumber: index + 1 },
    calls: callsFor(req, opp),
    streams: streamSource(seedFromNumber(req.seed)),
    options: { detail },
  };
}

function contentOf(req: BenchRequest): BenchContent {
  const sides = [req.subject, ...req.opponents].map((s) => {
    const id = s.call.unit === 'offense' ? s.call.playContentId : s.call.callContentId;
    return { contentId: id ?? `bench:${s.label}`, contentHash: s.call.contentHash ?? '', assignments: s.assignments };
  });
  return { sides, knowledge: req.knowledge };
}

/** Reads one result into a run summary, from the subject side's point of view. */
export function summarise(req: BenchRequest, index: number, input: PlayInput, r: PlayResult): RunSummary {
  const sit = input.situation;
  const offense: Side = sit.offense;
  const subjectIsOffense = req.subject.call.unit === 'offense';
  const subjectSide: Side = subjectIsOffense ? offense : ((1 - offense) as Side);
  const subjectPlayers = new Set(req.subject.call.players.map((p) => p.playerId));
  const roleOf = new Map(input.calls.snapping.players.map((p) => [p.playerId, p.role]));
  const ev = r.truth.events;
  const dead = ev.find((e) => e.type === 'dead_ball');
  const release = ev.find((e) => e.type === 'pass_release' && e.forward && !e.spike && !e.throwaway);
  const sack = ev.some((e) => e.type === 'pressure' && e.kind === 'sack');
  const catchPt = ev.find((e) => e.type === 'catch_point');
  const passPlay = ev.some((e) => e.type === 'pass_release') || sack;
  let outcome: RunOutcome = 'other';
  if (dead?.type === 'dead_ball' && dead.reason === 'pre_snap_foul') outcome = 'pre_snap_foul';
  else if (sack) outcome = 'sack';
  else if (catchPt?.type === 'catch_point' && catchPt.outcome === 'interception') outcome = 'interception';
  else if (catchPt?.type === 'catch_point' && catchPt.outcome === 'catch') outcome = 'complete';
  else if (release) outcome = 'incomplete';
  else if (dead?.type === 'dead_ball' && dead.side !== null && dead.side !== offense) outcome = 'fumble_lost';
  else if (!passPlay) outcome = 'run';
  // Gain from the line of scrimmage while the offense holds the ball; an incomplete pass or a pre-snap foul gains nothing here (enforcement is officiating's).
  const offenseHolds = dead?.type === 'dead_ball' && dead.side === offense;
  const gain = offenseHolds ? (dead.spot.x - sit.ballX) * sit.attackDir : 0;
  const yards = Math.round(gain * 10) / 10;
  const signed = subjectIsOffense ? yards : yards === 0 ? 0 : -yards;
  const targetId = release?.type === 'pass_release' ? release.targetId : null;
  return {
    index, opponent: req.opponents[index % req.opponents.length]!.label,
    yards: signed, outcome, passPlay,
    pressured: ev.some((e) => e.type === 'pressure'),
    targetRole: targetId === null ? null : roleOf.get(targetId) ?? null,
    lostContests: ev.flatMap((e) => (e.type === 'contest' && subjectPlayers.has(e.loserId) ? [e.contest] : [])),
    fouls: ev.flatMap((e) => (e.type === 'foul_committed' && e.side === subjectSide ? [e.foulId] : [])),
  };
}

function wilson(count: number, of: number, z: number): Rate {
  if (of === 0) return { count, of, rate: null, low: null, high: null };
  const p = count / of, z2 = z * z;
  const centre = (p + z2 / (2 * of)) / (1 + z2 / of);
  const half = (z * Math.sqrt((p * (1 - p)) / of + z2 / (4 * of * of))) / (1 + z2 / of);
  return { count, of, rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function meanCi(xs: readonly number[], z: number): MeanCi {
  const n = xs.length;
  if (n === 0) return { n, mean: null, low: null, high: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { n, mean, low: null, high: null };
  const v = xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (n - 1);
  const half = z * Math.sqrt(v / n);
  return { n, mean, low: mean - half, high: mean + half };
}

function block(label: string, runs: readonly RunSummary[]): BenchBlock {
  const z = benchParam('bench.confidence.z');
  const minYd = benchParam('bench.histogram.minYd'), maxYd = benchParam('bench.histogram.maxYd');
  const counts = new Array<number>(maxYd - minYd + 1).fill(0);
  for (const r of runs) counts[Math.min(counts.length - 1, Math.max(0, Math.floor(r.yards) - minYd))]! += 1;
  const attempts = runs.filter((r) => r.outcome === 'complete' || r.outcome === 'incomplete' || r.outcome === 'interception');
  const dropbacks = runs.filter((r) => r.passPlay);
  const tally = (xs: readonly string[]) => { const m: Record<string, number> = {}; for (const x of xs) m[x] = (m[x] ?? 0) + 1; return m; };
  const failures = Object.entries(tally(runs.flatMap((r) => r.lostContests)))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([contest, count]) => ({ contest, count }));
  const turnovers = runs.filter((r) => r.outcome === 'interception' || r.outcome === 'fumble_lost').length;
  return {
    opponent: label, runs: runs.length,
    yards: meanCi(runs.map((r) => r.yards), z),
    histogram: { minYd, counts },
    completion: wilson(attempts.filter((r) => r.outcome === 'complete').length, attempts.length, z),
    pressure: wilson(dropbacks.filter((r) => r.pressured).length, dropbacks.length, z),
    turnovers: wilson(turnovers, runs.length, z),
    targets: tally(runs.flatMap((r) => (r.targetRole ? [r.targetRole] : []))),
    failures,
    fouls: tally(runs.flatMap((r) => r.fouls)),
    samples: runs.slice(0, benchParam('bench.samples.perOpponent')).map((r) => r.index),
  };
}

export function runBench(req: BenchRequest, deps: BenchDeps): BenchReport {
  const runsRequested = req.runs ?? benchParam('bench.runs.default');
  const hours = { actionClass: 'bench_session' as const, hours: benchParam('bench.hours.perSession') };
  const refuse = (why: NonNullable<BenchReport['refusedBecause']>): BenchReport => ({
    refusedBecause: why, runsRequested, runsDone: 0, partial: false, seed: req.seed,
    resolver: { id: '', version: '', mayProduceSavedResults: false }, overall: null, byOpponent: [], hourCharge: { ...hours, hours: 0 }, runsList: [],
  });
  if (req.inGame) return refuse('in_game');
  if (req.teamValues.own !== 'staff_graded' || req.teamValues.opponent !== 'scouted') return refuse('not_graded_values');
  if (req.opponents.length === 0) return refuse('no_opponents');

  const resolver = deps.resolverFor(contentOf(req));
  const chunk = benchParam('bench.chunk.runs');
  const runs: RunSummary[] = [];
  let partial = false;
  for (let i = 0; i < runsRequested; i++) {
    if (i > 0 && i % chunk === 0) {
      deps.onProgress?.(i, runsRequested);
      if (deps.shouldCancel?.(i)) { partial = true; break; }
    }
    const input = benchInput(req, deps, i);
    runs.push(summarise(req, i, input, resolver.simulatePlay(input)));
  }
  deps.onProgress?.(runs.length, runsRequested);
  return {
    refusedBecause: null, runsRequested, runsDone: runs.length, partial, seed: req.seed,
    resolver: { id: resolver.id, version: resolver.version, mayProduceSavedResults: resolver.mayProduceSavedResults },
    overall: block('all', runs),
    byOpponent: req.opponents.map((o) => block(o.label, runs.filter((r) => r.opponent === o.label))),
    hourCharge: hours,
    runsList: runs,
  };
}
