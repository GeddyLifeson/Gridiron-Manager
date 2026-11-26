// K8.4.2 the search: whom a decision-maker hires. He scores candidates from what he can know (X2.3.1):
// public labels, public record, first-hand memory, references through X7 edges, the interview. He never
// reads a candidate's hidden parameters, so a great coach with a thin public record scores low and a lucky
// one scores high. The user is scored by the same function: no field marks him (rule 6).
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import { P } from './params.ts';
import { clamp } from './mathx.ts';
import type { DecisionMakerProfile } from './types.ts';

/** One candidate as THIS decider sees him (his observer view, X2.3.1). */
export interface CandidateView {
  readonly personId: number;
  /** Rung on the ladder (S1) and side of the ball, from the public record. */
  readonly rung: number;
  readonly side: 'offense' | 'defense' | 'special_teams' | 'head_coach' | 'front_office';
  /** Public labels he can see (X2.2), already filtered to his view. */
  readonly labels: readonly string[];
  /** Recent results of his unit or team, public, scaled -1 to 1 (N2 public measures). */
  readonly publicRecord: number;
  /** First-hand impression from the decider's own memory, -1 to 1, or null (X6). */
  readonly firstHand: number | null;
  /** Edge strengths 0 to 100 (X7) from people the decider trusts who vouch for him (X7.4.2). */
  readonly references: readonly number[];
  /** Interview result 0 to 1 once interviewed (E2.4.3), else null. */
  readonly interview: number | null;
  /** On the staff of one of last season's most successful teams (rule 4). */
  readonly fromTopStaff: boolean;
  /** Under contract with another team outside the permitted window (C11, rule 7). */
  readonly underContractElsewhere: boolean;
}

/** What the decider looks for: label preferences from his culture record (X9) and goals; his filters. */
export interface SearchPreferences {
  readonly labelWeights: Readonly<Record<string, number>>;
  readonly minRung: number;
  readonly sides: readonly CandidateView['side'][];
  readonly minPublicRecord: number;
  /** Labels the fired coach was perceived to have, and the content table of opposites (rule 3). */
  readonly firedCoachFaults: readonly string[];
  readonly opposites: Readonly<Record<string, string>>;
}

export interface CandidateScore {
  readonly personId: number;
  readonly score: number;
  readonly parts: { readonly labels: number; readonly record: number; readonly firstHand: number; readonly references: number; readonly interview: number; readonly reaction: number; readonly fashion: number };
}

/** Rule 1: the long list, from the public record only. */
export function longList(prefs: SearchPreferences, pool: readonly CandidateView[]): CandidateView[] {
  return pool.filter((c) => c.rung >= prefs.minRung && prefs.sides.includes(c.side) && c.publicRecord >= prefs.minPublicRecord);
}

/** Rules 2 to 4: weighted sum of label matches, record, first-hand, references, interview, reaction and fashion bonuses. */
export function scoreCandidate(prefs: SearchPreferences, c: CandidateView): CandidateScore {
  const labels = c.labels.reduce((s, l) => s + (prefs.labelWeights[l] ?? 0), 0) * P('search.w.labels');
  const record = c.publicRecord * P('search.w.record');
  const firstHand = (c.firstHand ?? 0) * P('search.w.firstHand');
  const refs = c.references.length === 0 ? 0 : c.references.reduce((s, r) => s + r, 0) / c.references.length / P('search.referenceUnit');
  const references = refs * P('search.w.references');
  const interview = (c.interview ?? 0) * P('search.w.interview');
  const wanted = new Set(prefs.firedCoachFaults.map((f) => prefs.opposites[f]).filter((x): x is string => x !== undefined));
  const reaction = c.labels.some((l) => wanted.has(l)) ? P('search.reactionBonus') : 0;
  const fashion = c.fromTopStaff ? P('search.fashionBonus') : 0;
  const score = labels + record + firstHand + references + interview + reaction + fashion;
  return { personId: c.personId, score, parts: { labels, record, firstHand, references, interview, reaction, fashion } };
}

/** Ranked long list, ties broken by person id so the order is stable. */
export function rankCandidates(prefs: SearchPreferences, pool: readonly CandidateView[]): CandidateScore[] {
  return longList(prefs, pool)
    .map((c) => scoreCandidate(prefs, c))
    .sort((a, b) => b.score - a.score || a.personId - b.personId)
    .slice(0, P('search.longListSize'));
}

/** Who gets an interview request. */
export function interviewList(prefs: SearchPreferences, pool: readonly CandidateView[]): number[] {
  return rankCandidates(prefs, pool).slice(0, P('search.interviewCount')).map((s) => s.personId);
}

export type SearchOutcome = { readonly hired: number; readonly offers: readonly number[] } | { readonly hired: null; readonly offers: readonly number[]; readonly keepInterim: true };

/**
 * Offers in score order (interviews already folded into the views); each candidate decides by his own
 * E2.5.2-style judgment (rule 5), passed in by the career market. Nobody accepts: the interim is kept.
 */
export function runSearch(prefs: SearchPreferences, interviewed: readonly CandidateView[], accepts: (personId: number) => boolean): SearchOutcome {
  const offers: number[] = [];
  for (const s of rankCandidates(prefs, interviewed)) {
    offers.push(s.personId);
    if (accepts(s.personId)) return { hired: s.personId, offers };
  }
  return { hired: null, offers, keepInterim: true };
}

/**
 * Rule 7: contacting a coach under contract outside the window goes through the one K2.8.2 procedure
 * with the decider's own rule respect, weighed against how badly he wants the candidate. A commit is
 * then entered with `compliance.commitAct` by the caller, the same code as for the user (L8.2.5).
 */
export function considerTampering(
  state: compliance.ComplianceState, dm: DecisionMakerProfile, disposition: compliance.Disposition, want: CandidateScore,
  topAlternative: CandidateScore | null, pDetectPerceived: number, penaltyPerceived: number, date: WorldDate, conduct: compliance.StreamFor,
): { readonly commit: boolean; readonly opportunity: compliance.Opportunity; readonly reason: compliance.DecisionReason } {
  const edge = want.score - (topAlternative?.score ?? 0);
  const gain = clamp(edge * P('search.tamperGainScale') * (0.5 + dm.goals.winNow), 0, 1);
  const opportunity: compliance.Opportunity = { classId: 'tampering_coaches', gain, pDetectPerceived, penaltyPerceived };
  const d = compliance.decideViolation(state, opportunity, disposition, date, conduct);
  return { commit: d.commit, opportunity, reason: d.reason };
}
