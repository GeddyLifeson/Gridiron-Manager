// Poll voters as people (T3.4.1 rule 2, K8 media model). A poll is a panel of AI voters, media or
// coaches, each with habits shown only by how they vote, never as a menu of traits:
//   - stickiness: how much of last week's own ballot carries over (inertia);
//   - preseason hold: how long the voter's preseason view lasts before results take over;
//   - loss reaction: how hard a team that just lost drops on this voter's ballot;
//   - margin eye: how much the voter is swayed by margins (capped, like the committee: no reward for
//     running up a score beyond the cap);
//   - brand eye: how much program name carries with this voter;
//   - home lean: a lift for teams of the voter's own region (media) or own conference (coaches);
//   - carelessness: ballot noise.
// Each voter fills a ballot of `postseason.poll.ballotLength` places; place 1 scores ballotLength points
// down to 1 for the last place (AP and coaches: 25 for first down to 1, F-post-0025). The panel
// keeps each voter's last ballot, so inertia is per voter. The head coach seat can cast one coaches'
// ballot in place of an AI voter (T3.4.1 open question: yes as head coach).
import type { GameResult, RuleValues, TeamId } from '../standings/types.ts';
import { param } from './params.ts';
import { resumes, type Uniform } from './rankings.ts';

export type VoterKind = 'media' | 'coach';

export interface Voter {
  readonly voterId: number;
  readonly kind: VoterKind;
  /** Conference the voter leans toward (region for media, own conference for a coach); null for none. */
  readonly homeConferenceId: number | null;
  readonly stickiness: number;
  readonly preseasonWeeks: number;
  readonly lossReaction: number;
  readonly marginEye: number;
  readonly brandEye: number;
  readonly homeLean: number;
  readonly carelessness: number;
}

export interface PanelSpec {
  readonly kind: VoterKind;
  readonly size: number;
  /** Conferences voters come from, one entry per voter slot weight (a conference listed twice is twice as likely). Empty: nobody leans. */
  readonly homeConferences: readonly number[];
  /** First voter id. */
  readonly firstId: number;
}

function between(rng: Uniform, lo: string, hi: string): number {
  const a = param(lo), b = param(hi);
  return a + (b - a) * rng.next();
}

/** A panel of voters, each drawn once and kept for the season (and beyond, if the caller keeps them). */
export function createPanel(spec: PanelSpec, rng: Uniform): Voter[] {
  const out: Voter[] = [];
  const p = `postseason.voter.${spec.kind}`;
  for (let i = 0; i < spec.size; i++) {
    const home = spec.homeConferences.length ? spec.homeConferences[Math.min(spec.homeConferences.length - 1, Math.floor(rng.next() * spec.homeConferences.length))]! : null;
    out.push({
      voterId: spec.firstId + i,
      kind: spec.kind,
      homeConferenceId: home,
      stickiness: between(rng, `${p}.stickinessMin`, `${p}.stickinessMax`),
      preseasonWeeks: between(rng, 'postseason.voter.preseasonWeeksMin', 'postseason.voter.preseasonWeeksMax'),
      lossReaction: between(rng, 'postseason.voter.lossReactionMin', 'postseason.voter.lossReactionMax'),
      marginEye: between(rng, 'postseason.voter.marginEyeMin', 'postseason.voter.marginEyeMax'),
      brandEye: between(rng, `${p}.brandEyeMin`, `${p}.brandEyeMax`),
      homeLean: between(rng, `${p}.homeLeanMin`, `${p}.homeLeanMax`),
      carelessness: between(rng, 'postseason.voter.carelessnessMin', 'postseason.voter.carelessnessMax'),
    });
  }
  return out;
}

/** What a poll carries from one week to the next: every voter's last ballot. Plain data (P5 saves). */
export interface PollState {
  readonly week: number;
  readonly ballots: Readonly<Record<string, readonly TeamId[]>>;
}

export interface PanelPollInput {
  readonly teamIds: readonly TeamId[];
  readonly results: readonly GameResult[];
  readonly champions: readonly TeamId[];
  /** Poll week, 0 for the preseason poll (counted from the season's first week, whatever the schedule numbers it). */
  readonly week: number;
  /** Preseason view per team, higher is better (program standing and returning talent; caller's model). */
  readonly preseason: ReadonlyMap<TeamId, number>;
  /** Program name per team, higher is better (prestige); missing counts as the lowest. */
  readonly prestige: ReadonlyMap<TeamId, number>;
  readonly conferenceOf: ReadonlyMap<TeamId, number>;
  readonly voters: readonly Voter[];
  readonly previous: PollState | null;
  /** The seat's ballot, cast in place of this voter id (a coaches' poll voter). */
  readonly seatBallot?: { readonly voterId: number; readonly ballot: readonly TeamId[] };
}

export interface PanelPoll {
  /** Teams with points, most first. */
  readonly order: readonly TeamId[];
  readonly points: ReadonlyMap<TeamId, number>;
  readonly firstPlaceVotes: ReadonlyMap<TeamId, number>;
  /** Teams that received points but finished outside the ballot length ("others receiving votes"). */
  readonly othersReceivingVotes: readonly TeamId[];
  readonly state: PollState;
}

function normaliser(ids: readonly TeamId[], value: (t: TeamId) => number): (t: TeamId) => number {
  const vals = ids.map(value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (t) => (hi === lo ? 0 : (value(t) - lo) / (hi - lo));
}

/** Average capped margin per team over the games played, scaled to [-1, 1]. */
function marginShare(ids: readonly TeamId[], results: readonly GameResult[]): Map<TeamId, number> {
  const cap = param('postseason.ranking.marginCapPoints');
  const sum = new Map<TeamId, { m: number; n: number }>(ids.map((t) => [t, { m: 0, n: 0 }]));
  for (const g of results) for (const side of [0, 1] as const) {
    const s = sum.get(g.teams[side]); if (!s) continue;
    const d = g.points[side] - g.points[side === 0 ? 1 : 0];
    s.m += Math.max(-cap, Math.min(cap, d)) / cap; s.n++;
  }
  return new Map([...sum].map(([t, s]) => [t, s.n ? s.m / s.n : 0]));
}

/** Teams that lost in the latest week of results (the week the voters just watched). */
function freshLosers(results: readonly GameResult[]): Set<TeamId> {
  const out = new Set<TeamId>();
  const week = results.reduce((m, g) => Math.max(m, g.week), -Infinity);
  for (const g of results) {
    if (g.week !== week) continue;
    if (g.points[0] < g.points[1]) out.add(g.teams[0]);
    if (g.points[1] < g.points[0]) out.add(g.teams[1]);
  }
  return out;
}

/** One week's poll from the panel. With `rng` null, every voter is noiseless (pure function of results). */
export function panelPoll(input: PanelPollInput, rules: RuleValues, rng: Uniform | null): PanelPoll {
  const ids = input.teamIds;
  const ballotLength = Math.min(param('postseason.poll.ballotLength'), ids.length);
  const games = input.results.filter((g) => g.phase !== 'preseason');
  const resumeOf = new Map(resumes({ teamIds: ids, results: games, champions: input.champions }, rules).map((r) => [r.teamId, r.score]));
  const nRes = normaliser(ids, (t) => resumeOf.get(t) ?? 0);
  const nPre = normaliser(ids, (t) => input.preseason.get(t) ?? 0);
  const nBrand = normaliser(ids, (t) => input.prestige.get(t) ?? 0);
  const margin = marginShare(ids, games);
  const losers = freshLosers(games);
  const played = new Set(games.flatMap((g) => [...g.teams]));

  const points = new Map<TeamId, number>(ids.map((t) => [t, 0]));
  const firsts = new Map<TeamId, number>();
  const ballots: Record<string, TeamId[]> = {};
  for (const v of input.voters) {
    let ballot: TeamId[];
    if (input.seatBallot && input.seatBallot.voterId === v.voterId) {
      ballot = input.seatBallot.ballot.filter((t, i, a) => ids.includes(t) && a.indexOf(t) === i).slice(0, ballotLength);
    } else {
      const prev = input.previous?.ballots[String(v.voterId)] ?? null;
      const prevScore = (t: TeamId) => { if (!prev) return 0; const i = prev.indexOf(t); return i < 0 ? 0 : (prev.length - i) / prev.length; };
      const hold = Math.max(0, 1 - input.week / Math.max(1, v.preseasonWeeks));
      const stick = prev ? v.stickiness : 0;
      const score = new Map(ids.map((t) => {
        const fromResults = played.has(t) ? nRes(t) : nPre(t);
        let current = (1 - hold) * fromResults + hold * nPre(t);
        current += v.brandEye * nBrand(t) + v.marginEye * (margin.get(t) ?? 0);
        if (losers.has(t)) current -= v.lossReaction;
        if (v.homeConferenceId !== null && input.conferenceOf.get(t) === v.homeConferenceId) current += v.homeLean;
        const n = rng ? (rng.next() + rng.next() - 1) * v.carelessness : 0;
        return [t, (1 - stick) * current + stick * prevScore(t) + n];
      }));
      ballot = [...ids].sort((a, b) => score.get(b)! - score.get(a)! || a - b).slice(0, ballotLength);
    }
    ballots[String(v.voterId)] = ballot;
    ballot.forEach((t, i) => points.set(t, points.get(t)! + ballotLength - i));
    if (ballot[0] !== undefined) firsts.set(ballot[0], (firsts.get(ballot[0]) ?? 0) + 1);
  }
  const voted = [...ids].filter((t) => points.get(t)! > 0).sort((a, b) => points.get(b)! - points.get(a)! || (firsts.get(b) ?? 0) - (firsts.get(a) ?? 0) || a - b);
  return {
    order: voted, points, firstPlaceVotes: firsts,
    othersReceivingVotes: voted.slice(ballotLength),
    state: { week: input.week, ballots },
  };
}
