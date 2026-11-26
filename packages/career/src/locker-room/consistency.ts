// The consistency value (L3.3.1) and the star-player problem (L3.3.2). Consistency is the players'
// perception of whether the same act gets the same answer whoever does it. It is hidden truth: the user
// sees the case list (facts he made) and what people tell him, never the number (L3.3.1, K9).
import type { PenaltyLevel } from './violations.ts';
import { clamp, lp } from './params.ts';

export interface CaseRecord {
  readonly violationId: number;
  readonly playerId: number;
  readonly offenceId: string;
  readonly day: number;
  readonly level: PenaltyLevel;
  /** Influence of the player at decision time (L2.1.3). */
  readonly influence: number;
  /** Share of the roster that saw the decision, 0 to 1 (L3.2.1 witnesses). */
  readonly witnessShare: number;
  /** Room of the player, for per-room consistency (L3.5.2). */
  readonly room: string;
}

export interface ConsistencyState {
  readonly value: number;
  readonly cases: readonly CaseRecord[];
  /** Weeks since the last decided case (decay runs only on quiet weeks). */
  readonly quietWeeks: number;
}

export function newConsistency(): ConsistencyState {
  return { value: lp('consistency.start'), cases: [], quietWeeks: 0 };
}

/** The comparison panel before a decision: the last three decided cases of the same offence (L3.3.1 acceptance). */
export function comparisonCases(s: Pick<ConsistencyState, 'cases'>, offenceId: string, room?: string): CaseRecord[] {
  const n = lp('consistency.compareCases');
  return s.cases.filter((c) => c.offenceId === offenceId && (room === undefined || c.room === room)).slice(-n);
}

/**
 * Change caused by one decided case (L3.3.1). Compared with the mean level of the last three cases of the
 * same offence: lighter treatment for a higher-influence player costs 4 per step times the witness share;
 * equal treatment gains 1.5; heavier treatment of a higher-influence player than of others costs 1 (it reads
 * as making an example). The first case of its kind sets the precedent and moves nothing.
 */
export function caseDelta(prior: readonly CaseRecord[], c: CaseRecord): number {
  if (prior.length === 0) return 0;
  const meanLevel = prior.reduce((s, p) => s + p.level, 0) / prior.length;
  const meanInfluence = prior.reduce((s, p) => s + p.influence, 0) / prior.length;
  const deviation = c.level - meanLevel;
  const higher = c.influence > meanInfluence;
  if (Math.abs(deviation) < lp('consistency.equalBand')) return lp('consistency.equal');
  if (deviation < 0 && higher) return lp('consistency.lighterPerStep') * -deviation * clamp(c.witnessShare, 0, 1);
  if (deviation > 0 && higher) return lp('consistency.heavierStar');
  // Uneven treatment of a lower-influence player either way: the leaf gives no number (Assumption).
  return lp('consistency.unevenLowerPerStep') * Math.abs(deviation) * clamp(c.witnessShare, 0, 1);
}

/** Record a decided case and apply its change. */
export function recordCase(s: ConsistencyState, c: CaseRecord): ConsistencyState {
  const prior = comparisonCases(s, c.offenceId);
  const value = clamp(s.value + caseDelta(prior, c), 0, lp('scale.max'));
  return { value, cases: [...s.cases, c], quietWeeks: 0 };
}

/** End of a week: with no case decided, decay 1 point toward 60 (L3.3.1). `calloutUneven` is the H4.2.2 hook (-3). */
export function consistencyWeek(s: ConsistencyState, decidedThisWeek: boolean, calloutUneven: boolean): ConsistencyState {
  let value = s.value;
  const quietWeeks = decidedThisWeek ? 0 : s.quietWeeks + 1;
  if (!decidedThisWeek) {
    const rest = lp('consistency.restTarget');
    const step = lp('consistency.decayPerWeek');
    value = value > rest ? Math.max(rest, value - step) : Math.min(rest, value + step);
  }
  if (calloutUneven) value += lp('consistency.calloutHook');
  return { ...s, value: clamp(value, 0, lp('scale.max')), quietWeeks };
}

/**
 * H4.2.2 hook input: over a rolling four weeks, reserves were called out in meetings and equally graded
 * errors by stars were not (L3.3.1). Caller passes the call-outs and the stars' uncalled errors in the window.
 */
export function calloutsUneven(reserveCallouts: number, starErrorsUncalled: number): boolean {
  return reserveCallouts > 0 && starErrorsUncalled > 0;
}

/** A per-player view: each man weighs only the cases he saw (L3.3.1 outputs). */
export function playerView(s: ConsistencyState, saw: (c: CaseRecord) => boolean): number {
  let v = lp('consistency.start');
  const seen: CaseRecord[] = [];
  for (const c of s.cases) {
    if (!saw(c)) continue;
    const prior = seen.filter((p) => p.offenceId === c.offenceId).slice(-lp('consistency.compareCases'));
    v = clamp(v + caseDelta(prior, c), 0, lp('scale.max'));
    seen.push(c);
  }
  return v;
}

/** Room consistency for one position room (L3.5.2): the same rule on that room's cases only. */
export function roomConsistency(s: ConsistencyState, room: string): number {
  return playerView(s, (c) => c.room === room);
}

// ---- L3.3.2 the star-player problem ----

export interface StarCheck {
  readonly influence: number;
  /** Grade percentile at his position, 0 to 100. */
  readonly gradePercentile: number;
}

/** A star: influence above 70 or a top-quartile grade (L3.3.2). */
export function isStar(p: StarCheck): boolean {
  return p.influence > lp('star.influenceAbove') || p.gradePercentile > lp('star.gradePercentileAbove');
}

export interface StarOutcome {
  /** One-time +4 culture event when a star is treated the same as others (once per star per season). */
  readonly cultureEvent: number;
  /** Extra stress for a disciplined star with trust under 35 (may reach a breakpoint). */
  readonly stress: number;
  /** Owner confidence change sign when the owner profile protects stars: -1 disciplining, +1 not (L5 reads it). */
  readonly ownerSignal: -1 | 0 | 1;
}

/**
 * The three extra star rules (L3.3.2). `treatedSame` is true when the decision equals the comparison cases;
 * `alreadyAwarded` tracks the once-per-season limit.
 */
export function starOutcome(treatedSame: boolean, disciplined: boolean, trust: number, alreadyAwarded: boolean, ownerProtectsStars: boolean): StarOutcome {
  return {
    cultureEvent: treatedSame && disciplined && !alreadyAwarded ? lp('star.equalCulture') : 0,
    stress: disciplined && trust < lp('star.lowTrustBelow') ? lp('star.lowTrustStress') : 0,
    ownerSignal: ownerProtectsStars ? (disciplined ? -1 : 1) : 0,
  };
}

/** The decision panel for a star case (L3.3.2): both costs with their sources. Hidden values are never in it. */
export interface StarPanel {
  readonly footballCost: { readonly replacementId: number | null; readonly gradeGap: number | null; readonly source: 'n2_estimate' };
  readonly earlierCases: readonly CaseRecord[];
  /** Staff read of his likely reaction, from traits revealed under L1.1.3 only (may be wrong). */
  readonly staffRead: readonly { readonly text: string; readonly source: string }[];
  readonly councilSays: readonly { readonly text: string; readonly memberId: number }[];
  readonly captainRemovalOption: boolean;
}
