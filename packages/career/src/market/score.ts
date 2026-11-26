// Who a hiring party wants (E2.3.2), the interview score (E2.4.3 head coach, S6.4.1 working interview),
// promotion from within (E2.6.2) and the interim's audition (E2.6.3). Every term reads the candidate's
// public record or the party's own views: there is no person id and no stored coach skill in any input,
// so the user and an AI candidate with the same record and answers score the same.
import type { RandomStream } from '@gm/schema';
import { clamp, param } from './params.ts';

export const PREFERENCE_TERMS = [
  'sideMatch', 'playCaller', 'experience', 'priorHeadRecord', 'playerReputation', 'familiarity', 'unitResults', 'oppositeOfFired', 'interview',
] as const;
export type PreferenceTerm = (typeof PREFERENCE_TERMS)[number];

/** A party's weights, drawn from its owner/GM/AD profile (L5, K8). Non-negative; normalised when scored. */
export type Preferences = Readonly<Record<PreferenceTerm, number>>;

/** What the party reads of one candidate, each term 0 to 1 (interview: score / 100; 0.5 if none held yet). */
export type CandidateTerms = Readonly<Record<PreferenceTerm, number>>;

/** Score range used for the noise rule: 0 to 100. */
export const SCORE_RANGE = 100;

/** E2.3.2: the weighted sum on 0..100, with no noise. */
export function baseScore(w: Preferences, t: CandidateTerms): number {
  let sw = 0; let s = 0;
  for (const k of PREFERENCE_TERMS) { const wk = Math.max(0, w[k]); sw += wk; s += wk * clamp(t[k], 0, 1); }
  return sw === 0 ? 0 : (SCORE_RANGE * s) / sw;
}

export interface ScoreContext {
  /** On the same staff (E2.6.2): continuity bonus. */
  readonly internal: boolean;
}

/**
 * E2.3.2 candidate score: weighted sum plus the internal bonus (E2.6.2) plus noise with standard deviation
 * a share of the score range (real searches are noisy). One normal draw per call.
 */
export function candidateScore(w: Preferences, t: CandidateTerms, ctx: ScoreContext, stream: RandomStream): number {
  const bonus = ctx.internal ? param('score.internalBonus') : 0;
  return baseScore(w, t) + bonus + stream.normal() * param('score.noiseShareOfRange') * SCORE_RANGE;
}

/** Rank a pool; ties broken by person id. Scores are drawn in pool order so a seed replays exactly. */
export function rankPool(w: Preferences, pool: readonly { personId: number; terms: CandidateTerms; internal: boolean }[], stream: RandomStream): readonly { personId: number; score: number }[] {
  return pool.slice().sort((a, b) => a.personId - b.personId)
    .map((c) => ({ personId: c.personId, score: candidateScore(w, c.terms, { internal: c.internal }, stream) }))
    .sort((a, b) => b.score - a.score || a.personId - b.personId);
}

/** E2.3.2 "opposite of the coach just fired": 1 when the candidate's demonstrated style is the other end. */
export function oppositeTerm(firedStyle: number, candidateStyle: number): number {
  return clamp(Math.abs(clamp(firedStyle, -1, 1) - clamp(candidateStyle, -1, 1)) / 2, 0, 1);
}

/** E2.6.3: an interim's record enters as a unit-results term pulled toward 0.5 for the small sample. */
export function interimTerm(interimWinShare: number): number {
  const d = param('score.interimSampleDiscount');
  return clamp(0.5 + (clamp(interimWinShare, 0, 1) - 0.5) * (1 - d), 0, 1);
}

// ---------- the head coach interview (E2.4.3) ----------

export type HeadSegment = 'roster_plan' | 'staff' | 'system' | 'board_work' | 'game_management' | 'culture';

export interface BoardAnswer { readonly correct: boolean; /** 0 slow to 1 instant. */ readonly speed: number }

/** What the candidate actually said in the room. */
export interface HeadInterviewAnswers {
  /** Priorities he picked (needs, quarterback plan, fits) as keys. */
  readonly rosterPriorities: readonly string[];
  /** Coaches he named, each with whether that person would truly come (L4 willingness, read by the caller). */
  readonly staffNamed: readonly { readonly personId: number; readonly wouldCome: boolean }[];
  /** The identity he presented (E10 family key). */
  readonly systemKey: string;
  readonly board: readonly BoardAnswer[];
  readonly situations: readonly BoardAnswer[];
  /** The L3 choice key he picked for the stated locker room problem. */
  readonly cultureChoice: string;
}

/** The hiring party's own views, hidden from the candidate. Its roster view is its scouts' estimate, never truth. */
export interface HeadInterviewKey {
  readonly ownRosterPriorities: readonly string[];
  readonly wantedSystems: readonly string[];
  /** Owner values, 0 to 1 per L3 choice key. */
  readonly cultureValues: Readonly<Record<string, number>>;
  /** Segments held at this rung; fewer at lower rungs (4 to 6). */
  readonly segments: readonly HeadSegment[];
}

export interface InterviewScore { readonly total: number; readonly segments: Readonly<Partial<Record<HeadSegment, number>>> }

const boardScore = (a: readonly BoardAnswer[]): number => {
  if (a.length === 0) return 0;
  const sp = param('interview.boardSpeedShare');
  return a.reduce((s, x) => s + (x.correct ? (1 - sp) + sp * clamp(x.speed, 0, 1) : 0), 0) / a.length;
};

/**
 * E2.4.3: score 0 to 100 from the answers alone. Board work and situations: correctness and speed only.
 * Roster, system and culture: fit with the party's hidden views. Staff: share of named coaches who would
 * come; naming one who would not is found out and costs the segment. No communication or persuasion term.
 */
export function headInterview(a: HeadInterviewAnswers, key: HeadInterviewKey): InterviewScore {
  const seg: Partial<Record<HeadSegment, number>> = {};
  for (const s of key.segments) {
    switch (s) {
      case 'roster_plan': {
        const want = new Set(key.ownRosterPriorities);
        seg[s] = want.size === 0 ? 0.5 : a.rosterPriorities.filter((p) => want.has(p)).length / Math.max(want.size, a.rosterPriorities.length || 1);
        break;
      }
      case 'staff': {
        const n = a.staffNamed.length;
        const real = a.staffNamed.filter((x) => x.wouldCome).length;
        const bluffs = n - real;
        seg[s] = n === 0 ? 0 : clamp(real / n - bluffs * param('interview.staffBluffPenalty') / n, 0, 1);
        break;
      }
      case 'system': seg[s] = key.wantedSystems.includes(a.systemKey) ? 1 : key.wantedSystems.length === 0 ? 0.5 : 0; break;
      case 'board_work': seg[s] = boardScore(a.board); break;
      case 'game_management': seg[s] = boardScore(a.situations); break;
      case 'culture': seg[s] = clamp(key.cultureValues[a.cultureChoice] ?? 0, 0, 1); break;
    }
  }
  const vals = key.segments.map((s) => seg[s] ?? 0);
  const total = vals.length === 0 ? 0 : (100 * vals.reduce((x, y) => x + y, 0)) / vals.length;
  return { total, segments: Object.fromEntries(Object.entries(seg).map(([k, v]) => [k, 100 * (v ?? 0)])) };
}

/** S6.4.1 working interview: practical 0.5, relationship and references 0.3, fit 0.2 (each 0 to 1). */
export function workingInterview(practical: number, relationship: number, fit: number): number {
  const wp = param('interview.practicalWeight'); const wr = param('interview.relationshipWeight'); const wf = param('interview.fitWeight');
  return (100 * (wp * clamp(practical, 0, 1) + wr * clamp(relationship, 0, 1) + wf * clamp(fit, 0, 1))) / (wp + wr + wf);
}

/**
 * E2.4.4 rule 7: a candidate interviewed for compliance only still builds a tie, and a strong interview can
 * change the club's mind at a small chance. Returns whether the club now treats him as a real candidate.
 */
export function complianceInterviewTurns(interviewScore: number, stream: RandomStream): boolean {
  return interviewScore >= param('interview.complianceTurnScore') && stream.chance(param('interview.complianceTurnChance'));
}
