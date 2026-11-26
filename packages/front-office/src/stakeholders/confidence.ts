// K8.3.1 one confidence procedure for the user and for AI, with the E4.2.1 update and the E4.2.2 terms.
// There is exactly ONE update function (`updateConfidence`). It takes the decider's profile and what the
// public saw; it has no parameter that says whether the subject is the user (rule 2), and it reads no
// stored ability of the coach, because none exists (E1.4.1, E4.2.1 acceptance 3).
import { P } from './params.ts';
import { clamp } from './mathx.ts';
import { goalStake } from './profile.ts';
import { react, type GameReading, type Result } from './reaction.ts';
import type { ConfidenceWord, DeciderModel, DecisionMakerProfile, GoalKey, Observer } from './types.ts';

export type SubjectRole = 'head_coach' | 'general_manager';

export interface ConfidenceState {
  readonly subjectId: number;
  readonly role: SubjectRole;
  readonly value: number;
  /** Last week's value: the word shown is mapped from it (E4.2.1 rule 5, acceptance 2). */
  readonly previousValue: number;
  readonly gamesOnJob: number;
}

export type StartKind = 'hired' | 'interim_promoted' | 'interim';

/** E4.2.1 rule 1 and K8.3.1 edge case. */
export function startConfidence(subjectId: number, role: SubjectRole, kind: StartKind): ConfidenceState {
  const v = kind === 'hired' ? P('conf.start.hired') : kind === 'interim_promoted' ? P('conf.start.interimPromoted') : P('conf.start.interim');
  return { subjectId, role, value: v, previousValue: v, gamesOnJob: 0 };
}

export interface SeasonEndReading {
  readonly winShare: number;
  readonly lastWinShare: number | null;
  readonly qualified: boolean;
  readonly postseasonWins: number;
  readonly title: boolean;
  readonly firstGameLossAsHigherSeed: boolean;
  /** Seasons since the last postseason place, counting this one when missed. */
  readonly yearsSincePostseason: number;
  /** E4.5.1 legacy coach: the decline term counts at normal weight. */
  readonly legacy: boolean;
  /** N4 measured decision rating against league average, -1 to 1 (football-literate owners only). */
  readonly decisionRatingVsLeague: number;
}

/** One week of observer-side inputs (K8.3.1 inputs, E4.2.2 table). Every field is public or the decider's own. */
export interface ConfidenceWeek {
  readonly weekId: string;
  readonly games: readonly { readonly reading: GameReading; readonly recent: readonly Result[] }[];
  /** E4.2.2 pace term, at each quarter point of the season. */
  readonly quarterPoint: { readonly winShareSoFar: number; readonly expectedWinShare: number } | null;
  readonly seasonEnd: SeasonEndReading | null;
  readonly goals: readonly { readonly goal: GoalKey; readonly passed: boolean }[];
  /** E4.2.2 player noise: each public complaint by a starter -1 to -3, captains speaking up +1. */
  readonly playerNoise: readonly number[];
  /** K8.7.1 `mediaTone` and K8.8.1 `fanMood`, 0 to 100; null when not read this week. */
  readonly mediaTone: number | null;
  readonly fanMood: number | null;
  /** E4.2.2 conduct and embarrassment (L9), each -2 to -15. Not held by the early floor. */
  readonly conduct: readonly number[];
  /** Detected violations by this subject (L8.2.5), weighed by the decider's cleanProgram goal. */
  readonly violations: readonly { readonly ref: string; readonly major: boolean }[];
  /** Monthly: the decider's relationship with the subject, 0 to 100 (L5, X7). */
  readonly relationship: number | null;
  /** Monthly, college: booster mood 0 to 100 (K8.5.1); multiplied by the decider model's per-point weight. */
  readonly boosterMood: number | null;
  /** K8.3.1 rule 3: multiplier on negative terms from the blame split; 1 when nobody shares the blame. */
  readonly blameMultiplier: number;
}

export interface ConfidenceTerm {
  readonly term: string;
  readonly value: number;
  readonly ref: string;
  /** Conduct terms are not held by the first-games floor (E4.2.1 edge case). */
  readonly conduct: boolean;
}

export interface ConfidenceLogRow {
  readonly weekId: string;
  readonly subjectId: number;
  readonly before: number;
  readonly terms: readonly ConfidenceTerm[];
  readonly drift: number;
  readonly floorApplied: boolean;
  readonly after: number;
  readonly gamesOnJobAfter: number;
}

/** The decider as an observer of results (K8.2.1). */
export function deciderObserver(dm: DecisionMakerProfile): Observer {
  return { id: `decider:${dm.personId}`, outcomeBias: dm.outcomeBias, rivalryWeight: 1 };
}

function cap(x: number, c: number): number { return clamp(x, -c, c); }

/** The E4.2.2 terms for one week, before volatility. Pure. */
export function confidenceTerms(dm: DecisionMakerProfile, model: DeciderModel, w: ConfidenceWeek): ConfidenceTerm[] {
  const out: ConfidenceTerm[] = [];
  const add = (term: string, value: number, ref: string, conduct = false) => { if (value !== 0) out.push({ term, value, ref, conduct }); };
  const obs = deciderObserver(dm);
  for (const g of w.games) {
    for (const t of react(obs, g.reading, g.recent).terms) add(t.term, t.value, t.ref);
  }
  if (w.quarterPoint) {
    const q = w.quarterPoint;
    add('pace', cap(P('conf.pace.size') * (q.winShareSoFar - q.expectedWinShare) / P('conf.pace.unit'), P('conf.pace.cap')), w.weekId);
  }
  const s = w.seasonEnd;
  if (s) {
    if (s.lastWinShare !== null) {
      const raw = cap(P('conf.change.size') * (s.winShare - s.lastWinShare) / P('conf.pace.unit'), P('conf.change.cap'));
      add('change', raw < 0 && !s.legacy ? raw * P('conf.change.declineFactor') : raw, w.weekId);
    }
    if (s.qualified) add('postseason', P('conf.post.qualify'), w.weekId);
    add('postseason_wins', s.postseasonWins * P('conf.post.win'), w.weekId);
    if (s.title) add('title', P('conf.post.title'), w.weekId);
    if (s.firstGameLossAsHigherSeed) add('upset_loss', P('conf.post.upsetLoss'), w.weekId);
    const dry = s.yearsSincePostseason - P('conf.drought.free');
    if (dry > 0) add('drought', dry * P('conf.drought.perYear'), w.weekId);
    add('decision_quality', clamp(s.decisionRatingVsLeague, -1, 1) * P('conf.decisionQuality.cap') * dm.footballLiteracy, w.weekId);
  }
  for (const g of w.goals) add('goal', (g.passed ? 1 : -1) * goalStake(dm, g.goal), `goal:${g.goal}`);
  w.playerNoise.forEach((n, i) => add('player_noise', n, `${w.weekId}:noise:${i}`));
  // Media and fan mood, scaled by sensitivity to outside opinion (2x so an average owner gets the table size).
  const sens = 2 * dm.mediaSensitivity;
  if (w.mediaTone !== null) add('media', P('conf.mood.perPoint') * (w.mediaTone - P('conf.mood.neutral')) * sens, w.weekId);
  if (w.fanMood !== null) add('fans', P('conf.mood.perPoint') * (w.fanMood - P('conf.mood.neutral')) * sens, w.weekId);
  w.conduct.forEach((c, i) => add('conduct', Math.max(P('conf.conduct.min'), c), `${w.weekId}:conduct:${i}`, true));
  for (const v of w.violations) {
    add('violation', Math.max(P('conf.conduct.min'), P('conf.violation.base') * 2 * dm.goals.cleanProgram * (v.major ? P('conf.violation.majorFactor') : 1)), v.ref, true);
  }
  if (w.relationship !== null) add('relationship', P('conf.relationship.size') * (w.relationship - P('conf.mood.neutral')) / P('conf.relationship.unit'), w.weekId);
  if (w.boosterMood !== null) add('boosters', model.boosterPerPoint * (w.boosterMood - P('conf.mood.neutral')), w.weekId);
  if (w.blameMultiplier !== 1) return out.map((t) => (t.value < 0 ? { ...t, value: t.value * w.blameMultiplier } : t));
  return out;
}

function step(before: number, gamesBefore: number, terms: readonly ConfidenceTerm[], hadGame: boolean, gamesAfter: number) {
  const max = P('conf.max');
  let v = before;
  let drift = 0;
  if (!hadGame) {
    const target = P('conf.drift.target');
    drift = clamp(target - before, -P('conf.drift.step'), P('conf.drift.step'));
  }
  v += drift + terms.filter((t) => !t.conduct).reduce((s, t) => s + t.value, 0);
  let floorApplied = false;
  if (gamesBefore < P('conf.floor.games') && v < P('conf.floor.value')) { v = P('conf.floor.value'); floorApplied = true; }
  v += terms.filter((t) => t.conduct).reduce((s, t) => s + t.value, 0);
  return { after: clamp(v, 0, max), drift, floorApplied, gamesAfter };
}

/**
 * E4.2.1 rules 2 to 4 and the edge case: the one weekly update. Every term is multiplied by the
 * decider's volatility; a week without a game drifts 1 point toward 55; the first 8 games hold a floor
 * of 15 except through conduct. Returns the new state and the log row (E4.2.1 rule 6).
 */
export function updateConfidence(state: ConfidenceState, dm: DecisionMakerProfile, model: DeciderModel, w: ConfidenceWeek): { readonly state: ConfidenceState; readonly log: ConfidenceLogRow } {
  const terms = confidenceTerms(dm, model, w).map((t) => ({ ...t, value: t.value * dm.volatility }));
  const gamesAfter = state.gamesOnJob + w.games.length;
  const r = step(state.value, state.gamesOnJob, terms, w.games.length > 0, gamesAfter);
  return {
    state: { ...state, previousValue: state.value, value: r.after, gamesOnJob: gamesAfter },
    log: { weekId: w.weekId, subjectId: state.subjectId, before: state.value, terms, drift: r.drift, floorApplied: r.floorApplied, after: r.after, gamesOnJobAfter: gamesAfter },
  };
}

/** E4.2.1 acceptance 1: replaying logged terms reproduces every weekly value exactly. */
export function replayConfidence(start: ConfidenceState, rows: readonly ConfidenceLogRow[]): number[] {
  let v = start.value;
  let g = start.gamesOnJob;
  const out: number[] = [];
  for (const r of rows) {
    const s = step(v, g, r.terms, r.gamesOnJobAfter > g, r.gamesOnJobAfter);
    v = s.after;
    g = r.gamesOnJobAfter;
    out.push(v);
  }
  return out;
}

/** E4.2.1 rule 5: the word, mapped from LAST week's value so it never reflects this week's game. */
export function wordFor(value: number): ConfidenceWord {
  if (value >= P('conf.word.secure')) return 'secure';
  if (value >= P('conf.word.stable')) return 'stable';
  if (value >= P('conf.word.uneasy')) return 'uneasy';
  if (value >= P('conf.word.hotSeat')) return 'hot_seat';
  return 'last_chance';
}

export function shownWord(state: ConfidenceState): ConfidenceWord {
  return wordFor(state.previousValue);
}

/** K8.3.1 rule 3: how a decider splits a bad season between head coach and general manager. */
export interface BlameInputs {
  /** He hired the head coach himself / the general manager himself. */
  readonly hiredHeadCoach: boolean;
  readonly hiredGeneralManager: boolean;
  /** Relationship edges 0 to 100 (X7): which of the two he trusts more. */
  readonly trustHeadCoach: number;
  readonly trustGeneralManager: number;
  /** Public narrative: share of media blame on the head coach, 0 to 1 (K8.7.1 story angles). */
  readonly narrativeOnHeadCoach: number;
}

/** Share of the blame on the head coach, 0 to 1. The one he hired, the one he trusts and the one the press spares get less. */
export function blameShareHeadCoach(dm: DecisionMakerProfile, b: BlameInputs): number {
  let share = 0.5;
  const hired = (b.hiredGeneralManager ? 1 : 0) - (b.hiredHeadCoach ? 1 : 0);
  share += P('conf.blame.loyaltySwing') * dm.loyaltyToOwnHires * hired / 2;
  share += P('conf.blame.trustSwing') * (b.trustGeneralManager - b.trustHeadCoach) / P('conf.max');
  share += P('conf.blame.narrativeSwing') * (b.narrativeOnHeadCoach - 0.5) * 2;
  const lo = P('conf.blame.minShare');
  return clamp(share, lo, 1 - lo);
}

/** The blame multiplier each subject's negative terms carry: an even split leaves terms as they are. */
export function blameMultiplier(role: SubjectRole, model: DeciderModel, headCoachShare: number): number {
  if (!model.hasGeneralManager) return 1;
  return 2 * (role === 'head_coach' ? headCoachShare : 1 - headCoachShare);
}
