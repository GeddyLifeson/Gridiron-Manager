// The pro report (M3.6.1), the coach's voice (M3.6.2), and medical and conduct checks on veterans (M3.6.3).
// Level-neutral report shape: a college coach reads the same report on a portal player (M3.7.1).
import { tierIndex, tierOf, type TierCuts, DEFAULT_CUTS } from './board.ts';
import { P } from './params.ts';
import type { RoleLabel } from './roles.ts';
import type { Graded, JobProfile } from './types.ts';

export interface EvaluatorReport {
  readonly evaluatorId: number;
  readonly day: number;
  readonly grade: Graded;
  readonly snapsWatched: number;
  readonly games: number;
  /** Attribute estimates the evaluator filed, by attribute id. */
  readonly traits: Readonly<Record<string, Graded>>;
  /** Plays cited, as film ids (N1.1.1 opens each). */
  readonly film: readonly string[];
}

export interface ProReport {
  readonly personId: number;
  readonly evaluatorId: number;
  readonly day: number;
  readonly grade: Graded;
  readonly role: RoleLabel;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  /** Summary key from the role label (rule 2); C10 phrase tables word it. */
  readonly summary: string;
  readonly limitedLook: boolean;
  readonly snapsWatched: number;
  readonly games: number;
  readonly film: readonly string[];
}

/**
 * Strengths and weaknesses (rule 1): the profile traits whose estimates sit furthest above and below what
 * the job asks. What it asks is the trait's minimum where one is set, else the coach's starter target.
 */
export function strengthsAndWeaknesses(traits: Readonly<Record<string, Graded>>, profile: JobProfile): { strengths: string[]; weaknesses: string[] } {
  const rows = Object.keys(profile.weights).filter((a) => traits[a]).map((a) => ({ a, d: traits[a]!.mean - (profile.minimums[a] ?? P.targetStarterFit) }));
  const up = rows.filter((r) => r.d > 0).sort((x, y) => y.d - x.d || x.a.localeCompare(y.a)).slice(0, P.reportTraitCount).map((r) => r.a);
  const down = rows.filter((r) => r.d < 0).sort((x, y) => x.d - y.d || x.a.localeCompare(y.a)).slice(0, P.reportTraitCount).map((r) => r.a);
  return { strengths: up, weaknesses: down };
}

/** Summary sentence key by role (rule 2): "starts for us at X", "third at his position, plays on teams", "practice squad level". */
export function summaryKey(role: RoleLabel): string {
  switch (role.kind) {
    case 'starter': return 'report.summary.starts_for_us';
    case 'situational_starter': return 'report.summary.starts_in_situation';
    case 'role_player': return 'report.summary.role_player';
    case 'backup': return 'report.summary.backup';
    case 'developmental': return 'report.summary.practice_squad_level';
    case 'special_teams_only': return 'report.summary.plays_on_teams';
  }
}

export function proReport(personId: number, r: EvaluatorReport, profile: JobProfile, role: RoleLabel): ProReport {
  const sw = strengthsAndWeaknesses(r.traits, profile);
  return {
    personId, evaluatorId: r.evaluatorId, day: r.day, grade: r.grade, role, ...sw, summary: summaryKey(role),
    limitedLook: r.snapsWatched < P.limitedLookSnaps, snapsWatched: r.snapsWatched, games: r.games, film: [...r.film],
  };
}

/** Reports stack by date so opinion change shows (M3.6.1); two latest that differ by more than a tier are a split opinion (edge case). */
export function reportStack(reports: readonly ProReport[], cuts: TierCuts = DEFAULT_CUTS): { stack: ProReport[]; splitOpinion: boolean } {
  const stack = [...reports].sort((a, b) => b.day - a.day || a.evaluatorId - b.evaluatorId);
  const latestByEvaluator = new Map<number, ProReport>();
  for (const r of stack) if (!latestByEvaluator.has(r.evaluatorId)) latestByEvaluator.set(r.evaluatorId, r);
  const tiers = [...latestByEvaluator.values()].map((r) => tierIndex(tierOf(r.grade.mean, cuts)));
  const splitOpinion = tiers.length > 1 && Math.max(...tiers) - Math.min(...tiers) > 1;
  return { stack, splitOpinion };
}

// ---------- M3.6.2 the coach's voice ----------

export type Strength = 'mention' | 'recommend' | 'insist';

export interface VoiceContext {
  /** L5 relationship value with the general manager, 0 to 1. */
  readonly relationship: number;
  /** Final say over this move in the coach's contract (E3.4.1, L5.2.1). */
  readonly finalSay: boolean;
  /** The department agrees with the coach. */
  readonly departmentAgrees: boolean;
  /** The move is legal (cap, roster). */
  readonly legal: boolean;
}

/**
 * Chance the move the coach asked for happens (rule 2). With final say an insisted legal move always
 * happens (acceptance); without it the chance rises with the L5 relationship and the strength used.
 */
export function voiceChance(strength: Strength, ctx: VoiceContext): number {
  if (!ctx.legal) return 0;
  if (ctx.finalSay) return 1;
  if (ctx.departmentAgrees) return 1;
  const base = strength === 'insist' ? P.voiceInsistBase : strength === 'recommend' ? P.voiceRecommendBase : P.voiceMentionBase;
  return Math.min(1, base * (P.voiceRelationshipFloor + (1 - P.voiceRelationshipFloor) * Math.min(1, Math.max(0, ctx.relationship))));
}

/**
 * Standing with the GM (rule 1): insisting against him spends it; when the player works out it comes back
 * with interest; when he fails it is lost. Mentioning costs nothing.
 */
export function standingChange(strength: Strength, departmentAgrees: boolean, outcome: 'pending' | 'worked' | 'failed'): number {
  if (strength !== 'insist' || departmentAgrees) return 0;
  if (outcome === 'pending') return -P.insistStandingCost;
  return outcome === 'worked' ? P.insistStandingCost * P.insistStandingInterest : -P.insistStandingCost;
}

// ---------- M3.6.3 medical and conduct ----------

export interface MedicalLine { readonly source: string; readonly day: number; readonly text: string; readonly fromExam: boolean }
export interface ConductLine { readonly source: string; readonly day: number; readonly text: string }

/**
 * The medical section a club sees (rules 1 and 2): only public injury history until its own doctors have
 * examined the player; after that its doctors' findings too (each an estimate with that doctor's noise,
 * filed by the world). No detail beyond public history before an examination (acceptance).
 */
export function medicalSection(publicHistory: readonly MedicalLine[], clubFindings: readonly MedicalLine[], examinedByClub: boolean): MedicalLine[] {
  const pub = publicHistory.map((l) => ({ ...l, fromExam: false }));
  return [...pub, ...(examinedByClub ? clubFindings.map((l) => ({ ...l, fromExam: true })) : [])].sort((a, b) => a.day - b.day || a.source.localeCompare(b.source));
}

/** Conduct lines (rule 4): every line names a source; a line without one, or with any figure in its text, is refused (words only, X1; the date is its own field). */
export function conductSection(lines: readonly ConductLine[]): { lines: ConductLine[]; refused: ConductLine[] } {
  const ok = lines.filter((l) => l.source.trim().length > 0 && !/\d/.test(l.text));
  const refused = lines.filter((l) => !ok.includes(l));
  return { lines: [...ok].sort((a, b) => a.day - b.day), refused };
}

/** A signing or trade completes only after the physical (rule 3); a failed physical lets the club void or renegotiate. */
export function physicalOutcome(passed: boolean | null): 'pending' | 'complete' | 'void_or_renegotiate' {
  return passed === null ? 'pending' : passed ? 'complete' : 'void_or_renegotiate';
}
