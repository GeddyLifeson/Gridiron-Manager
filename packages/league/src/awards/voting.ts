// C9.1.2 season awards and all-league teams, E5.6.1 coach awards. A panel of AI media voters (K8) each
// rank a ballot from public statistics, team success and narrative with their own weights. Votes are
// stored and sum correctly; ties share the award; voting is seeded and replayable (J13). The award never
// changes any true rating (it reads public features only and writes events only).
import content from './awards.json' with { type: 'json' };
import { HONOUR, honourDraft, type DraftMeta, type HonourDraft } from './events.ts';
import { KEY, ballotPoints, num, param, type RuleValues } from './params.ts';
import type { PersonId, TeamId, Uniform } from './types.ts';

export interface AwardDef {
  readonly id: string;
  readonly kind: 'player' | 'coach' | 'assistant';
  readonly side?: 'offense' | 'defense';
  readonly rookie?: boolean;
  readonly comeback?: boolean;
  readonly terms: Readonly<Record<string, number>>;
  readonly positionWeights?: Readonly<Record<string, number>>;
}
export interface Slot { readonly slot: string; readonly count: number }
export interface AwardsContent {
  readonly sets: Readonly<Record<string, readonly AwardDef[]>>;
  readonly allLeagueSlots: readonly Slot[];
  readonly allStarPerSlot: number;
}
export const AWARDS_CONTENT = content as unknown as AwardsContent;

/** A candidate as the public sees him: features are public measures scaled by the caller (D14, N2, L6). */
export interface Candidate {
  readonly personId: PersonId;
  readonly teamId: TeamId;
  readonly position: string;
  readonly side?: 'offense' | 'defense' | 'special';
  readonly rookie?: boolean;
  readonly comeback?: boolean;
  /** stats, teamSuccess, narrative, reputation, unitRankGain, and the coach features below. */
  readonly features: Readonly<Record<string, number>>;
  /** The head coach spoke up for him publicly (C9.1.2: helps a little). */
  readonly advocated?: boolean;
}

/** E5.6.1 rule 1 inputs. Projection is the frozen preseason expectation (X4.1.2, E4.1.1 `W0`). */
export interface CoachSeason { readonly wins: number; readonly projectedWins: number; readonly priorWins: number; readonly postseasonPlace: number }

/** E5.6.1: coach features. `postseasonPlace` is rounds won plus one for reaching the postseason, 0 if out. */
export function coachFeatures(s: CoachSeason): Record<string, number> {
  return { winsAboveProjection: s.wins - s.projectedWins, improvement: s.wins - s.priorWins, postseasonPlace: s.postseasonPlace };
}

const COACH_TERMS = (): Record<string, number> => ({
  winsAboveProjection: param('voting.coach.winsAboveProjection'),
  improvement: param('voting.coach.improvement'),
  postseasonPlace: param('voting.coach.postseasonPlace'),
});

export function eligibleFor(def: AwardDef, c: Candidate): boolean {
  if (def.kind === 'coach' || def.kind === 'assistant') return true;
  if (def.side && c.side !== def.side) return false;
  if (def.rookie && !c.rookie) return false;
  if (def.comeback && !c.comeback) return false;
  return true;
}

/** One voter: the panel's weights, each scaled by his own factor (K8 voter bias). */
export interface Voter { readonly id: number; readonly scale: Readonly<Record<string, number>>; }

/** Draws a panel. Same rng position gives the same panel (J13). */
export function drawPanel(rules: RuleValues, featureNames: readonly string[], rng: Uniform): Voter[] {
  const size = num(rules, KEY.panelSize);
  const spread = param('voting.weightSpread');
  const out: Voter[] = [];
  for (let i = 0; i < size; i++) {
    const scale: Record<string, number> = {};
    for (const f of featureNames) scale[f] = 1 + spread * (rng.next() + rng.next() - 1);
    out.push({ id: i + 1, scale });
  }
  return out;
}

function termsOf(def: AwardDef): Record<string, number> {
  return def.kind === 'coach' ? COACH_TERMS() : { ...def.terms };
}

function voterScore(def: AwardDef, terms: Readonly<Record<string, number>>, v: Voter, c: Candidate, rng: Uniform): number {
  let s = 0;
  for (const [f, w] of Object.entries(terms)) s += w * (v.scale[f] ?? 1) * (c.features[f] ?? 0);
  s *= def.positionWeights?.[c.position] ?? 1;
  if (c.advocated) s += param('voting.advocacy');
  return s + param('voting.noise') * (rng.next() + rng.next() - 1);
}

export interface Tally {
  readonly personId: PersonId; readonly teamId: TeamId; readonly points: number;
  readonly firstPlaceVotes: number; readonly ballots: number; readonly place: number; readonly shared: boolean;
}
export interface AwardResult {
  readonly award: string;
  readonly voters: number;
  /** Every voter's ranked ballot (person ids), stored because real ballots are published (C9.1.2). */
  readonly ballots: readonly (readonly PersonId[])[];
  readonly tallies: readonly Tally[];
  readonly winners: readonly PersonId[];
}

/** Runs one award. Points per place come from `awards.ballot_points`; its length is the ballot depth. */
export function voteAward(def: AwardDef, pool: readonly Candidate[], panel: readonly Voter[], rules: RuleValues, rng: Uniform): AwardResult {
  const points = ballotPoints(rules);
  const terms = termsOf(def);
  const cands = pool.filter((c) => eligibleFor(def, c)).sort((a, b) => a.personId - b.personId);
  const ballots: PersonId[][] = [];
  const pts = new Map<PersonId, { p: number; f: number; b: number }>(cands.map((c) => [c.personId, { p: 0, f: 0, b: 0 }]));
  for (const v of panel) {
    const scored = cands.map((c) => ({ id: c.personId, s: voterScore(def, terms, v, c, rng) }))
      .sort((a, b) => b.s - a.s || a.id - b.id).slice(0, points.length);
    ballots.push(scored.map((x) => x.id));
    scored.forEach((x, i) => {
      const t = pts.get(x.id)!;
      t.p += points[i]!; t.b += 1;
      if (i === 0) t.f += 1;
    });
  }
  const ranked = cands.map((c) => ({ c, t: pts.get(c.personId)! })).filter((x) => x.t.b > 0)
    .sort((a, b) => b.t.p - a.t.p || b.t.f - a.t.f || a.c.personId - b.c.personId);
  const tallies: Tally[] = [];
  ranked.forEach((x, i) => {
    const prev = i > 0 ? ranked[i - 1]! : null;
    const tied = prev !== null && prev.t.p === x.t.p && prev.t.f === x.t.f;
    const place = tied ? tallies[i - 1]!.place : i + 1;
    tallies.push({ personId: x.c.personId, teamId: x.c.teamId, points: x.t.p, firstPlaceVotes: x.t.f, ballots: x.t.b, place, shared: false });
  });
  const counts = new Map<number, number>();
  for (const t of tallies) counts.set(t.place, (counts.get(t.place) ?? 0) + 1);
  const final = tallies.map((t) => ({ ...t, shared: (counts.get(t.place) ?? 0) > 1 }));
  return { award: def.id, voters: panel.length, ballots, tallies: final, winners: final.filter((t) => t.place === 1).map((t) => t.personId) };
}

/** Award events for every placed candidate (vote shares are public). */
export function awardDrafts(r: AwardResult, meta: Omit<DraftMeta, 'teamId'>): HonourDraft[] {
  return r.tallies.map((t) => honourDraft(HONOUR.award, { ...meta, teamId: t.teamId }, t.personId, 'candidate', {
    award: r.award, place: t.place, points: t.points, firstPlaceVotes: t.firstPlaceVotes, voters: r.voters, shared: t.shared,
  }));
}

export const FIRST_TEAM = 1;
export const SECOND_TEAM = FIRST_TEAM + 1;

export interface Selection { readonly slot: string; readonly team: number; readonly personId: PersonId; readonly teamId: TeamId; readonly points: number }

/**
 * C9.1.2 rule 5: first and second all-league teams by slot, same panel. Each voter names `count` for the
 * first team and `count` for the second; a first-team vote counts the first ballot point value, a second
 * team vote the second. Candidates' `position` must equal a slot name.
 */
export function allLeague(pool: readonly Candidate[], panel: readonly Voter[], rules: RuleValues, rng: Uniform, slots: readonly Slot[] = AWARDS_CONTENT.allLeagueSlots): Selection[] {
  const points = ballotPoints(rules);
  const firstValue = points[0]!;
  const secondValue = points[1] ?? 0;
  const def: AwardDef = { id: 'all_league', kind: 'player', terms: { stats: 1 } };
  const out: Selection[] = [];
  for (const s of slots) {
    const cands = pool.filter((c) => c.position === s.slot).sort((a, b) => a.personId - b.personId);
    const tally = new Map<PersonId, number>(cands.map((c) => [c.personId, 0]));
    for (const v of panel) {
      const ranked = cands.map((c) => ({ id: c.personId, s: voterScore(def, def.terms, v, c, rng) })).sort((a, b) => b.s - a.s || a.id - b.id);
      ranked.forEach((x, i) => {
        const add = i < s.count ? firstValue : i < s.count + s.count ? secondValue : 0;
        tally.set(x.id, tally.get(x.id)! + add);
      });
    }
    const order = cands.map((c) => ({ c, p: tally.get(c.personId)! })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p || a.c.personId - b.c.personId);
    order.slice(0, s.count + s.count).forEach((x, i) => out.push({ slot: s.slot, team: i < s.count ? FIRST_TEAM : SECOND_TEAM, personId: x.c.personId, teamId: x.c.teamId, points: x.p }));
  }
  return out;
}

export function allLeagueDrafts(sel: readonly Selection[], meta: Omit<DraftMeta, 'teamId'>): HonourDraft[] {
  return sel.map((s) => honourDraft(HONOUR.allLeague, { ...meta, teamId: s.teamId }, s.personId, 'selected', { slot: s.slot, team: s.team, points: s.points }));
}

export interface StarPick { readonly slot: string; readonly personId: PersonId; readonly teamId: TeamId; readonly share: number }

/**
 * C9.1.2 rule 5: all-star roster by a mix of fan, player and coach votes (starting thirds). Fans vote on
 * reputation, so popular players make it on reputation; players and coaches vote on the season.
 */
export function allStars(pool: readonly Candidate[], rng: Uniform, slots: readonly Slot[] = AWARDS_CONTENT.allLeagueSlots, perSlot: number = AWARDS_CONTENT.allStarPerSlot): StarPick[] {
  const fan = param('voting.allStar.fanShare');
  const players = param('voting.allStar.playerShare');
  const coaches = 1 - fan - players;
  const out: StarPick[] = [];
  for (const s of slots) {
    const cands = pool.filter((c) => c.position === s.slot).sort((a, b) => a.personId - b.personId);
    if (cands.length === 0) continue;
    const norm = (vals: number[]): number[] => {
      const total = vals.reduce((a, b) => a + Math.max(0, b), 0);
      return vals.map((v) => (total > 0 ? Math.max(0, v) / total : 1 / vals.length));
    };
    const noise = param('voting.noise');
    const f = norm(cands.map((c) => param('voting.allStar.reputationWeight') * (c.features['reputation'] ?? 0) + noise * rng.next()));
    const p = norm(cands.map((c) => (c.features['stats'] ?? 0) + noise * rng.next()));
    const k = norm(cands.map((c) => (c.features['stats'] ?? 0) + (c.features['teamSuccess'] ?? 0) + noise * rng.next()));
    const mixed = cands.map((c, i) => ({ c, share: fan * f[i]! + players * p[i]! + coaches * k[i]! }))
      .sort((a, b) => b.share - a.share || a.c.personId - b.c.personId);
    for (const x of mixed.slice(0, perSlot)) out.push({ slot: s.slot, personId: x.c.personId, teamId: x.c.teamId, share: x.share });
  }
  return out;
}

export function allStarDrafts(picks: readonly StarPick[], meta: Omit<DraftMeta, 'teamId'>): HonourDraft[] {
  return picks.map((s) => honourDraft(HONOUR.allStar, { ...meta, teamId: s.teamId }, s.personId, 'selected', { slot: s.slot, share: s.share }));
}

/** The award list for a level key (`pro`, `college`) from content; competitions name their set in data. */
export function awardSet(setId: string, c: AwardsContent = AWARDS_CONTENT): readonly AwardDef[] {
  const s = c.sets[setId];
  if (!s) throw new Error(`awards: no award set ${setId}`);
  return s;
}
