// The team-strength estimate (N2.6.1). One number per team per side of the ball, in points per game
// against an average team, with an error band. A public-information estimate: it reads final scores,
// drive EPA from public play rows, the preseason prior and public quarterback estimates (D6), never a
// true rating (rule 4).
//
// Model (rule 1): for each game and each side s against opponent o,
//     points(s) = mu + O[s] - D[o] + home(s) * h / 2
// and, when the caller supplies special-teams net points for the game,
//     stNet(home) = S[home] - S[away].
// Solved by weighted ridge regression with the preseason prior as the penalty centre. Each team's
// penalty fades with its games played (rule 2): prior weight w(n) = 1 / (1 + (n / half)^shape), and the
// penalty is n w / (1 - w), so a team with n games has its estimate pulled toward the prior by about w.
import type { DeterministicMath } from '@gm/schema';
import { cholesky, cholInverse, cholSolve } from './linalg.ts';
import { param } from './params.ts';

export class StrengthError extends Error {}

/** One finished game, as the public record shows it. Index 0 is the home team (or first listed at a neutral site). */
export interface StrengthGame {
  readonly gameId: number;
  readonly week: number;
  readonly teamIds: readonly [number, number];
  readonly neutralSite: boolean;
  readonly points: readonly [number, number];
  /**
   * Drive EPA summed over the game for each offense, garbage time filtered (N2.2.3), in points. Optional:
   * when present it is blended with the points scored (`epaShare`).
   */
  readonly epaPoints?: readonly [number, number] | null;
  /** Special-teams net points for team 0 against team 1 (team 1's is the negative). Optional. */
  readonly specialTeamsNet?: number | null;
  /** A team rested its starters (C3.4.2): the game is down-weighted (N2.6.1 edge cases). */
  readonly restedStarters?: readonly [boolean, boolean];
}

/** Offense, defense and special-teams terms in points per game against an average team. Defense: points prevented. */
export interface StrengthTerms {
  readonly offense: number;
  readonly defense: number;
  readonly specialTeams: number;
}

export interface StrengthPrior extends StrengthTerms {
  readonly teamId: number;
}

export interface QbChange {
  readonly teamId: number;
  /** New starter's public estimate minus the old starter's, on the D6 display scale. */
  readonly estimateDelta: number;
}

export interface StrengthInputs {
  readonly games: readonly StrengthGame[];
  /** Preseason prior per team (see `preseasonPrior`). A team with no row has a zero prior. */
  readonly priors: readonly StrengthPrior[];
  /** Every team in the table, including any without games yet. */
  readonly teamIds: readonly number[];
  /** Prior centre of home advantage in points (rule key `analytics.home_advantage_pts`). */
  readonly homeAdvantagePrior: number;
  /** Quarterback changes this week (rule 3). */
  readonly qbChanges?: readonly QbChange[];
}

export interface TeamStrength {
  readonly teamId: number;
  readonly offense: number;
  readonly defense: number;
  readonly specialTeams: number;
  /** offense + defense + specialTeams: predicted margin against an average team at a neutral site. */
  readonly total: number;
  /** Standard errors of each term and of the total. */
  readonly se: { readonly offense: number; readonly defense: number; readonly specialTeams: number; readonly total: number };
  /** Weighted games behind the estimate and the prior weight still applied (rule 2). */
  readonly games: number;
  readonly priorWeight: number;
  /** Games that moved the estimate, so the user can open them (what the user sees). */
  readonly gameIds: readonly number[];
}

export interface StrengthTable {
  readonly teams: readonly TeamStrength[];
  readonly homeAdvantage: number;
  readonly homeAdvantageSe: number;
  readonly leaguePoints: number;
  readonly residualSd: number;
  /** Covariance of the parameters, for matchup error bands. Opaque to callers. */
  readonly cov: Float64Array;
  readonly index: ReadonlyMap<number, number>;
}

/** Prior weight after n weighted games (rule 2). */
export function priorWeight(games: number, math: DeterministicMath): number {
  if (games <= 0) return 1;
  return 1 / (1 + math.pow(games / param('prior.halfGames'), param('prior.fadeShape')));
}

/**
 * Preseason prior (inputs): last season's estimate regressed toward the mean, plus known changes. The
 * quarterback change follows rule 3; `rosterPoints` carries other known roster change, and at college
 * level the recruiting and returning-production prior (T area), both supplied by their owners.
 */
export function preseasonPrior(teamId: number, last: StrengthTerms | null, change: { qbEstimateDelta?: number; rosterPoints?: StrengthTerms } = {}): StrengthPrior {
  const keep = param('prior.carryOver');
  const qb = (change.qbEstimateDelta ?? 0) * param('qb.pointsPerEstimate');
  const r = change.rosterPoints ?? { offense: 0, defense: 0, specialTeams: 0 };
  return {
    teamId,
    offense: (last ? last.offense * keep : 0) + qb + r.offense,
    defense: (last ? last.defense * keep : 0) + r.defense,
    specialTeams: (last ? last.specialTeams * keep : 0) + r.specialTeams,
  };
}

/** The measure of a side's offensive output in one game: points, blended with drive EPA when present. */
export function offensePoints(g: StrengthGame, side: 0 | 1): number {
  const pts = g.points[side];
  const epa = g.epaPoints?.[side];
  if (epa === undefined || epa === null) return pts;
  const share = param('epaShare');
  return (1 - share) * pts + share * epa;
}

function gameWeight(g: StrengthGame): number {
  const rested = g.restedStarters?.[0] === true || g.restedStarters?.[1] === true;
  return rested ? param('restedWeight') : 1;
}

/**
 * Fits the table. Parameter layout: O[0..T), D[T..2T), S[2T..3T), h, mu. Deterministic: games are sorted
 * by id first, so the order the caller passes does not change a bit of the result.
 */
export function fitStrength(inp: StrengthInputs, math: DeterministicMath): StrengthTable {
  const teamIds = [...new Set(inp.teamIds)].sort((a, b) => a - b);
  const T = teamIds.length;
  if (T < 2) throw new StrengthError('team strength needs at least two teams');
  const index = new Map(teamIds.map((id, i) => [id, i]));
  const P = 3 * T + 2;
  const H = 3 * T, MU = 3 * T + 1;
  const games = [...inp.games].sort((a, b) => a.gameId - b.gameId);
  for (const g of games) {
    for (const id of g.teamIds) if (!index.has(id)) throw new StrengthError(`game ${g.gameId}: team ${id} is not in the table`);
    if (g.teamIds[0] === g.teamIds[1]) throw new StrengthError(`game ${g.gameId}: a team cannot play itself`);
  }

  // Observations: rows of (coefficients, value, weight).
  type Row = { idx: number[]; coef: number[]; y: number; w: number };
  const obs: Row[] = [];
  const played = new Float64Array(T);
  const stPlayed = new Float64Array(T);
  const gamesOf: number[][] = teamIds.map(() => []);
  for (const g of games) {
    const w = gameWeight(g);
    const a = index.get(g.teamIds[0])!, b = index.get(g.teamIds[1])!;
    const home = g.neutralSite ? 0 : 0.5;
    obs.push({ idx: [a, T + b, H, MU], coef: [1, -1, home, 1], y: offensePoints(g, 0), w });
    obs.push({ idx: [b, T + a, H, MU], coef: [1, -1, -home, 1], y: offensePoints(g, 1), w });
    played[a] = played[a]! + w; played[b] = played[b]! + w;
    gamesOf[a]!.push(g.gameId); gamesOf[b]!.push(g.gameId);
    if (g.specialTeamsNet !== undefined && g.specialTeamsNet !== null) {
      obs.push({ idx: [2 * T + a, 2 * T + b], coef: [1, -1], y: g.specialTeamsNet, w });
      stPlayed[a] = stPlayed[a]! + w; stPlayed[b] = stPlayed[b]! + w;
    }
  }

  const prior = new Float64Array(P);
  for (const p of inp.priors) {
    const i = index.get(p.teamId);
    if (i === undefined) continue;
    prior[i] = p.offense; prior[T + i] = p.defense; prior[2 * T + i] = p.specialTeams;
  }
  prior[H] = inp.homeAdvantagePrior;
  // League mean points: centre for mu, weakly held (one game of evidence) so it is identified with no games.
  let ySum = 0, wSum = 0;
  for (const o of obs) if (o.coef.length === 4) { ySum += o.w * o.y; wSum += o.w; }
  prior[MU] = wSum > 0 ? ySum / wSum : 0;

  // Residual spread of a first pass decides the prior-only error bands, so fit twice: the first pass
  // with a default spread, the second with the measured one.
  const pass = (sigma: number) => {
    const lambda = new Float64Array(P);
    const priorSd = param('prior.sd');
    const priorOnly = (sigma * sigma) / (priorSd * priorSd);
    for (let i = 0; i < T; i++) {
      for (const [k, n] of [[i, played[i]!], [T + i, played[i]!], [2 * T + i, stPlayed[i]!]] as const) {
        const w = priorWeight(n, math);
        lambda[k] = n > 0 ? (n * w) / (1 - w) : priorOnly;
      }
    }
    lambda[H] = param('prior.homeGames');
    lambda[MU] = 1;
    const A = new Float64Array(P * P);
    const rhs = new Float64Array(P);
    for (const o of obs) {
      for (let x = 0; x < o.idx.length; x++) {
        const ix = o.idx[x]!;
        rhs[ix] = rhs[ix]! + o.w * o.coef[x]! * o.y;
        for (let y = 0; y < o.idx.length; y++) { const at = ix * P + o.idx[y]!; A[at] = A[at]! + o.w * o.coef[x]! * o.coef[y]!; }
      }
    }
    for (let k = 0; k < P; k++) { A[k * P + k] = A[k * P + k]! + lambda[k]!; rhs[k] = rhs[k]! + lambda[k]! * prior[k]!; }
    const L = cholesky(A, P, math);
    if (!L) throw new StrengthError('team strength system is not positive definite');
    const beta = cholSolve(L, rhs, P);
    let ssr = 0, n = 0;
    for (const o of obs) {
      let fit = 0;
      for (let x = 0; x < o.idx.length; x++) fit += o.coef[x]! * beta[o.idx[x]!]!;
      const r = o.y - fit;
      ssr += o.w * r * r; n += o.w;
    }
    return { beta, L, ssr, n };
  };

  const first = pass(param('residualSdDefault'));
  // Degrees of freedom: observations less the terms the data actually moves (approximately one per team side seen).
  const moved = played.reduce((s, v) => s + (v > 0 ? 2 : 0), 0) + stPlayed.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) + 2;
  const dof = first.n - moved;
  const measured = dof >= 1 ? math.sqrt(first.ssr / dof) : param('residualSdDefault');
  const sigma = measured > param('minResidualSd') ? measured : param('minResidualSd');
  const fit = pass(sigma);
  const inv = cholInverse(fit.L, P);
  const cov = new Float64Array(P * P);
  for (let k = 0; k < P * P; k++) cov[k] = inv[k]! * sigma * sigma;

  const beta = fit.beta;
  const qbShift = new Float64Array(T);
  for (const c of inp.qbChanges ?? []) {
    const i = index.get(c.teamId);
    if (i === undefined) throw new StrengthError(`quarterback change for unknown team ${c.teamId}`);
    qbShift[i] = qbShift[i]! + c.estimateDelta * param('qb.pointsPerEstimate');
  }
  const sd = (k: number) => math.sqrt(cov[k * P + k]!);
  const varOf = (c: Map<number, number>) => {
    let v = 0;
    for (const [i, ci] of c) for (const [j, cj] of c) v += ci * cj * cov[i * P + j]!;
    return v > 0 ? v : 0;
  };
  const teams: TeamStrength[] = teamIds.map((teamId, i) => {
    const offense = beta[i]! + qbShift[i]!;
    const defense = beta[T + i]!;
    const specialTeams = beta[2 * T + i]!;
    const total = offense + defense + specialTeams;
    return {
      teamId, offense, defense, specialTeams, total,
      se: { offense: sd(i), defense: sd(T + i), specialTeams: sd(2 * T + i), total: math.sqrt(varOf(new Map([[i, 1], [T + i, 1], [2 * T + i, 1]]))) },
      games: played[i]!,
      priorWeight: priorWeight(played[i]!, math),
      gameIds: gamesOf[i]!,
    };
  });
  return { teams, homeAdvantage: beta[H]!, homeAdvantageSe: sd(H), leaguePoints: beta[MU]!, residualSd: sigma, cov, index };
}

export interface MatchupPrediction {
  /** Predicted margin for team A in points (positive: A wins). */
  readonly margin: number;
  readonly se: number;
  /** The game's residual spread added: the band a single game's result falls in. */
  readonly gameSd: number;
}

/** Predicted margin for any matchup (what the user sees). `venue`: A at home, B at home, or neutral. */
export function predictMargin(t: StrengthTable, teamA: number, teamB: number, venue: 'a_home' | 'b_home' | 'neutral', math: DeterministicMath): MatchupPrediction {
  const a = t.index.get(teamA), b = t.index.get(teamB);
  if (a === undefined || b === undefined) throw new StrengthError(`unknown team in matchup ${teamA} v ${teamB}`);
  const A = t.teams[a]!, B = t.teams[b]!;
  const T = t.teams.length;
  const P = 3 * T + 2;
  const h = venue === 'a_home' ? 1 : venue === 'b_home' ? -1 : 0;
  const margin = A.total - B.total + h * t.homeAdvantage;
  const c = new Map<number, number>();
  const put = (k: number, v: number) => c.set(k, (c.get(k) ?? 0) + v);
  for (const off of [0, T, 2 * T]) { put(off + a, 1); put(off + b, -1); }
  if (h !== 0) put(3 * T, h);
  let v = 0;
  for (const [i, ci] of c) for (const [j, cj] of c) v += ci * cj * t.cov[i * P + j]!;
  const se = math.sqrt(v > 0 ? v : 0);
  // A margin is the difference of two points observations, each with the residual spread.
  const gameSd = math.sqrt(se * se + 2 * t.residualSd * t.residualSd);
  return { margin, se, gameSd };
}
