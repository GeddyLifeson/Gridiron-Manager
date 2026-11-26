// College rankings (T3.4.1): a resume score per team, the committee ranking built from it, and polls
// with inertia. Every weight is a starting value to be fitted to real committee fields (rule 5).
// The game never rewards running up a score: margin credit stops at the cap (rule 1).
import { num } from '../standings/params.ts';
import { pctOf } from '../standings/records.ts';
import type { GameResult, RuleValues, TeamId, WLT } from '../standings/types.ts';
import { KEY, param } from './params.ts';

export interface RankingInput {
  /** Teams of the competition (top subdivision). Any other opponent counts as lower subdivision. */
  readonly teamIds: readonly TeamId[];
  readonly results: readonly GameResult[];
  /** Conference champions this season (T3.3.1). */
  readonly champions: readonly TeamId[];
}

export interface Resume {
  readonly teamId: TeamId;
  readonly score: number;
  readonly record: WLT;
  /** Combined win share of top-subdivision opponents. */
  readonly scheduleStrength: number;
  /** Best wins, strongest opponent first (shown on the ranking screen). */
  readonly bestWins: readonly TeamId[];
}

/** Uniform draws in [0, 1) from a J13 stream the caller owns. */
export interface Uniform { next(): number }

/** Symmetric noise in [-1, 1] from two uniforms (triangular), scaled. */
function noise(rng: Uniform | null, scale: number): number {
  return rng ? (rng.next() + rng.next() - 1) * scale : 0;
}

export function resumes(input: RankingInput, rules: RuleValues): Resume[] {
  const ids = new Set(input.teamIds);
  const tieWin = num(rules, 'standings.tie_win_value');
  const games = input.results.filter((g) => g.phase !== 'preseason');
  const rec = new Map<TeamId, WLT>(input.teamIds.map((t) => [t, { w: 0, l: 0, t: 0 }]));
  for (const g of games) for (const side of [0, 1] as const) {
    const me = g.teams[side]; const r = rec.get(me); if (!r) continue;
    const pf = g.points[side], pa = g.points[side === 0 ? 1 : 0];
    rec.set(me, pf > pa ? { ...r, w: r.w + 1 } : pf < pa ? { ...r, l: r.l + 1 } : { ...r, t: r.t + 1 });
  }
  const strength = (t: TeamId) => (ids.has(t) ? pctOf(rec.get(t)!, tieWin) : param('postseason.ranking.lowerDivisionStrength'));
  const cap = param('postseason.ranking.marginCapPoints');
  const credited = num(rules, KEY.lowerDivisionWinsCredited);
  const standard = num(rules, KEY.scheduleStandardGames);
  const champs = new Set(input.champions);

  return input.teamIds.map((teamId) => {
    let score = 0, lowerWins = 0, topGames = 0;
    let oppRec: WLT = { w: 0, l: 0, t: 0 };
    const wins: { opp: TeamId; s: number }[] = [];
    for (const g of games) {
      if (g.teams[0] !== teamId && g.teams[1] !== teamId) continue;
      const side = g.teams[0] === teamId ? 0 : 1;
      const other = side === 0 ? 1 : 0;
      const opp = g.teams[other];
      const diff = g.points[side] - g.points[other];
      const s = strength(opp);
      if (ids.has(opp)) { topGames++; const o = rec.get(opp)!; oppRec = { w: oppRec.w + o.w, l: oppRec.l + o.l, t: oppRec.t + o.t }; }
      const site = g.neutralSite ? 0 : side === 0 ? -1 : 1; // road +1, neutral 0, home -1
      let v: number;
      if (diff > 0) {
        if (!ids.has(opp)) { lowerWins++; if (credited > 0 && lowerWins > credited) continue; }
        v = param('postseason.ranking.winBase') + param('postseason.ranking.winOpponentWeight') * s;
        wins.push({ opp, s });
      } else if (diff < 0) {
        v = -(param('postseason.ranking.lossBase') + param('postseason.ranking.lossOpponentWeight') * (1 - s));
      } else v = 0;
      v += param('postseason.ranking.siteWeight') * site;
      v += param('postseason.ranking.marginWeight') * Math.max(-cap, Math.min(cap, diff)) / cap;
      score += v;
    }
    const scheduleStrength = pctOf(oppRec, tieWin);
    score += param('postseason.ranking.scheduleWeight') * scheduleStrength;
    if (champs.has(teamId)) score += param('postseason.ranking.championBonus');
    if (standard > 0 && topGames < standard) score -= param('postseason.ranking.shortSchedulePenalty') * (standard - topGames);
    return { teamId, score, record: rec.get(teamId)!, scheduleStrength, bestWins: wins.sort((a, b) => b.s - a.s || a.opp - b.opp).map((w) => w.opp) };
  });
}

export interface RankingLogEntry { readonly kind: 'head_to_head' | 'common_opponents' | 'judgment'; readonly moved: TeamId; readonly over: TeamId }

/**
 * Committee ranking (T3.4.1 rule 3): no preseason memory; resume plus a small noise term (none when
 * `rng` is null), then head-to-head and common-opponent swaps between neighbours inside the close band.
 * With noise off, equal scores fall to team id and the log says "judgment".
 */
export function committeeRanking(input: RankingInput, rules: RuleValues, rng: Uniform | null): { order: TeamId[]; resumes: Resume[]; log: RankingLogEntry[] } {
  const rs = resumes(input, rules);
  const scale = param('postseason.ranking.committeeNoise');
  const judged = new Map(rs.map((r) => [r.teamId, r.score + noise(rng, scale)]));
  const order = [...input.teamIds].sort((a, b) => judged.get(b)! - judged.get(a)! || a - b);
  const log: RankingLogEntry[] = [];
  for (let i = 1; i < order.length; i++) if (judged.get(order[i - 1]!) === judged.get(order[i]!)) log.push({ kind: 'judgment', moved: order[i - 1]!, over: order[i]! });

  const band = param('postseason.ranking.closeBand');
  const tieWin = num(rules, 'standings.tie_win_value');
  const vs = (a: TeamId, b: TeamId) => {
    let r: WLT = { w: 0, l: 0, t: 0 };
    for (const g of input.results) {
      if (!(g.teams.includes(a) && g.teams.includes(b))) continue;
      const side = g.teams[0] === a ? 0 : 1, d = g.points[side] - g.points[side === 0 ? 1 : 0];
      r = d > 0 ? { ...r, w: r.w + 1 } : d < 0 ? { ...r, l: r.l + 1 } : { ...r, t: r.t + 1 };
    }
    return r;
  };
  const opps = (a: TeamId) => new Set(input.results.filter((g) => g.teams.includes(a)).map((g) => (g.teams[0] === a ? g.teams[1] : g.teams[0])));
  const recordVs = (a: TeamId, set: Set<TeamId>) => {
    let r: WLT = { w: 0, l: 0, t: 0 };
    for (const o of set) { const x = vs(a, o); r = { w: r.w + x.w, l: r.l + x.l, t: r.t + x.t }; }
    return r;
  };
  // One pass from the top, so a team moves at most one place per adjustment and the pass ends.
  for (let i = 1; i < order.length; i++) {
    const hi = order[i - 1]!, lo = order[i]!;
    if (judged.get(hi)! - judged.get(lo)! > band) continue;
    const h = vs(lo, hi);
    let swap: RankingLogEntry['kind'] | null = null;
    if (h.w + h.l + h.t > 0) { if (h.w > h.l) swap = 'head_to_head'; }
    else {
      const common = new Set([...opps(hi)].filter((x) => opps(lo).has(x)));
      if (common.size && pctOf(recordVs(lo, common), tieWin) > pctOf(recordVs(hi, common), tieWin)) swap = 'common_opponents';
    }
    if (swap) { order[i - 1] = lo; order[i] = hi; log.push({ kind: swap, moved: lo, over: hi }); }
  }
  return { order, resumes: rs, log };
}

export interface PollInput extends RankingInput {
  /** Week of the season, 0 for the preseason poll. */
  readonly week: number;
  /** Last week's poll points per team (null before the first poll). */
  readonly previous: ReadonlyMap<TeamId, number> | null;
  /** Preseason standing per team, higher is better (from program prestige and returning talent; caller's model). */
  readonly preseason: ReadonlyMap<TeamId, number>;
  readonly voters: number;
}

/**
 * A poll (T3.4.1 rule 2): each AI voter blends the resume with last week's standing (inertia) and the
 * preseason standing (fading over the fade weeks), adds personal noise, and fills a ballot. Ballot
 * places score ballotLength down to 1. Returns teams by points and the points.
 */
export function poll(input: PollInput, rules: RuleValues, rng: Uniform | null): { order: TeamId[]; points: Map<TeamId, number> } {
  const rs = new Map(resumes(input, rules).map((r) => [r.teamId, r.score]));
  const fade = param('postseason.poll.preseasonFadeWeeks');
  const preWeight = Math.max(0, 1 - input.week / fade);
  const inertia = input.previous ? param('postseason.poll.inertia') : 0;
  const ballot = param('postseason.poll.ballotLength');
  const norm = (m: ReadonlyMap<TeamId, number>) => {
    const vals = input.teamIds.map((t) => m.get(t) ?? 0);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return (t: TeamId) => (hi === lo ? 0 : ((m.get(t) ?? 0) - lo) / (hi - lo));
  };
  const nRes = norm(rs), nPrev = input.previous ? norm(input.previous) : () => 0, nPre = norm(input.preseason);
  const base = new Map(input.teamIds.map((t) => {
    const current = (1 - preWeight) * nRes(t) + preWeight * nPre(t);
    return [t, (1 - inertia) * current + inertia * nPrev(t)];
  }));
  const points = new Map<TeamId, number>(input.teamIds.map((t) => [t, 0]));
  const scale = param('postseason.poll.voterNoise');
  for (let v = 0; v < input.voters; v++) {
    const mine = new Map(input.teamIds.map((t) => [t, base.get(t)! + noise(rng, scale)]));
    const ranked = [...input.teamIds].sort((a, b) => mine.get(b)! - mine.get(a)! || a - b).slice(0, ballot);
    ranked.forEach((t, i) => points.set(t, points.get(t)! + ballot - i));
  }
  const order = [...input.teamIds].filter((t) => points.get(t)! > 0).sort((a, b) => points.get(b)! - points.get(a)! || a - b);
  return { order, points };
}
