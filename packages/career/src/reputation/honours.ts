// Awards (E5.6.1) and the Hall of Fame case (E5.6.3). Voters see what the public sees: results against the
// preseason projection, improvement, place, and `regard.media`. Randomness comes from a world stream the
// caller passes (an @gm/engine-core Stream fits `RandomStream`); math from the engine's `DeterministicMath`.
// The hall's real-world numbers (election share, waiting period, committee size, coach finalists per class)
// are fact rows; a league without a hall, or a college hall, passes its own `HallRules` (E5.6.3 "via config").
import type { DeterministicMath, RandomStream } from '@gm/schema';
import { FACT, factNumber } from './facts.ts';
import { paramWith, type Overrides } from './params.ts';

export interface AwardCandidate {
  readonly personId: number;
  readonly teamId: number;
  /** Wins above the neutral preseason projection `W0` (E4.1.1). */
  readonly winsAboveProjection: number;
  /** Wins over last season. */
  readonly improvement: number;
  /** Postseason or title place, 0 for none, higher for further. */
  readonly place: number;
}

export interface AwardResult {
  readonly winnerId: number;
  /** First-place vote share per candidate. */
  readonly shares: ReadonlyMap<number, number>;
}

/** E5.6.1 rule 1: each voter scores every candidate with noise; the candidate with most first places wins. */
export function voteAward(candidates: readonly AwardCandidate[], voters: number, rng: RandomStream, o?: Overrides): AwardResult {
  if (candidates.length === 0) throw new Error('award: no candidates');
  const p = paramWith(o);
  const firsts = new Map<number, number>(candidates.map((c) => [c.personId, 0]));
  for (let v = 0; v < voters; v++) {
    let best = -Infinity;
    let pick = candidates[0]!.personId;
    for (const c of candidates) {
      const s = p('award.weightWinsAbove') * c.winsAboveProjection + p('award.weightImprovement') * c.improvement
        + p('award.weightPlace') * c.place + p('award.noiseSd') * rng.normal();
      if (s > best) { best = s; pick = c.personId; }
    }
    firsts.set(pick, firsts.get(pick)! + 1);
  }
  const shares = new Map<number, number>();
  for (const [id, n] of firsts) shares.set(id, voters === 0 ? 0 : n / voters);
  const winnerId = [...firsts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  return { winnerId, shares };
}

export interface HallRules {
  readonly electShare: number;
  readonly waitSeasons: number;
  readonly committeeSize: number;
  readonly coachFinalistsPerClass: number;
}

/** The pro hall from fact rows (statuses printed by the fact register; committee size is 1 of 3). */
export function proHallFromFacts(): HallRules {
  return {
    electShare: factNumber(FACT.hallElectShare),
    waitSeasons: factNumber(FACT.hallCoachWaitSeasons),
    committeeSize: factNumber(FACT.hallCommitteeSize),
    coachFinalistsPerClass: factNumber(FACT.hallCoachFinalistsPerClass),
  };
}

export interface HallCase {
  readonly personId: number;
  readonly titles: number;
  readonly wins: number;
  readonly postseasonWins: number;
  readonly winShare: number;
  readonly treeHeadCoaches: number;
  /** Serious compliance or conduct findings in the save (C11). Imported people never carry one (rule 7). */
  readonly conductFindings: number;
  readonly imported: boolean;
  /** Effective `regard.media` (E5.1.1 rule 2). */
  readonly mediaValue: number;
  readonly lastSeasonYear: number;
}

/** E5.6.3 rule 2. */
export function caseScore(c: HallCase, o?: Overrides): number {
  const p = paramWith(o);
  const conduct = c.imported ? 0 : c.conductFindings * p('hall.conductPenalty');
  return c.titles * p('hall.weightTitle') + c.wins / p('hall.winsPerPoint') + c.postseasonWins * p('hall.weightPlayoffWin')
    + (c.winShare - 0.5) * p('hall.weightWinShare') + c.treeHeadCoaches * p('hall.weightTreeHeadCoach') - conduct;
}

/** E5.6.3 rule 3: one voter's yes chance, from the case score through a logistic, shifted by media regard. */
export function voterYes(c: HallCase, math: DeterministicMath, o?: Overrides): number {
  const p = paramWith(o);
  const x = (caseScore(c, o) - p('hall.logisticCentre')) / p('hall.logisticScale') + p('hall.mediaShift') * (c.mediaValue - p('record.neutral'));
  return math.logistic(x);
}

/** Votes needed for election: at least the elect share of the full committee (E5.6.3 rule 4). */
export function votesNeeded(rules: HallRules): number {
  return Math.ceil(rules.electShare * rules.committeeSize - 1e-9);
}

/** Chance of at least `k` yes votes of `n` with yes chance `q` each (binomial tail, exact sum). */
export function tailAtLeast(n: number, k: number, q: number): number {
  if (k <= 0) return 1;
  if (k > n || q <= 0) return 0;
  if (q >= 1) return 1;
  // pmf(0) = (1-q)^n by repeated multiplication (no exponent operator in core code), then the recurrence.
  let pmf = 1;
  for (let i = 0; i < n; i++) pmf *= 1 - q;
  let total = 0;
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += pmf;
    pmf = (pmf * (n - i) / (i + 1)) * (q / (1 - q));
  }
  return Math.min(1, Math.max(0, total));
}

export type Outlook = 'no_case' | 'borderline' | 'strong' | 'near_certain';

export function electionChance(c: HallCase, rules: HallRules, math: DeterministicMath, o?: Overrides): number {
  return tailAtLeast(rules.committeeSize, votesNeeded(rules), voterYes(c, math, o));
}

/** E5.6.3 rule 6: outlook from the modelled chance over ten ballots. */
export function outlook(c: HallCase, rules: HallRules, math: DeterministicMath, o?: Overrides): { outlook: Outlook; chance: number } {
  const p = paramWith(o);
  const one = electionChance(c, rules, math, o);
  let miss = 1;
  for (let i = 0; i < p('hall.outlookBallots'); i++) miss *= 1 - one;
  const chance = 1 - miss;
  const word: Outlook = chance < p('hall.outlookBorderline') ? 'no_case' : chance < p('hall.outlookStrong') ? 'borderline' : chance <= p('hall.outlookNearCertain') ? 'strong' : 'near_certain';
  return { outlook: word, chance };
}

/** Full seasons sat out before a vote held in `voteYear` after the last season coached. */
export function eligible(c: HallCase, voteYear: number, rules: HallRules): boolean {
  return voteYear - c.lastSeasonYear - 1 >= rules.waitSeasons;
}

export interface BallotResult {
  readonly nominated: readonly number[];
  readonly finalists: readonly number[];
  readonly elected: readonly number[];
  readonly yesShare: ReadonlyMap<number, number>;
}

/**
 * One year's coach ballot (E5.6.3 rules 3 and 4): every eligible, not yet elected coach is nominated; the top
 * case scores up to the finalists-per-class number become finalists; each committee member votes; election
 * needs the elect share. Voter noise is redrawn each year by drawing fresh from the stream.
 */
export function runBallot(cases: readonly HallCase[], voteYear: number, rules: HallRules, rng: RandomStream, math: DeterministicMath, o?: Overrides): BallotResult {
  const nominated = cases.filter((c) => eligible(c, voteYear, rules)).sort((a, b) => caseScore(b, o) - caseScore(a, o) || a.personId - b.personId);
  const finalists = nominated.slice(0, rules.coachFinalistsPerClass);
  const need = votesNeeded(rules);
  const yesShare = new Map<number, number>();
  const elected: number[] = [];
  for (const c of finalists) {
    const q = voterYes(c, math, o);
    let yes = 0;
    for (let i = 0; i < rules.committeeSize; i++) if (rng.chance(q)) yes += 1;
    yesShare.set(c.personId, yes / rules.committeeSize);
    if (yes >= need) elected.push(c.personId);
  }
  return { nominated: nominated.map((c) => c.personId), finalists: finalists.map((c) => c.personId), elected, yesShare };
}
