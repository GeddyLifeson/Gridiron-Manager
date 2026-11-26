// Q5.3.1 Skill separation: does the game order coaches above fans above newcomers on decision grades
// and on results? Participants are described by their logged decisions only. The group is the study arm
// a participant was recruited into, never a label the game assigns before or after (Q5.3.1 rules).

export type Group = 'coaches' | 'fans' | 'newcomers';
export const GROUP_ORDER: readonly Group[] = ['coaches', 'fans', 'newcomers'];

export interface Participant {
  readonly id: string;
  readonly group: Group;
  /** Mean decision grade over the scenario set (N3), higher is better. */
  readonly decisionGrade: number;
  /** Point margin summed over the games against the standard AI. */
  readonly result: number;
  /** Decision record score (N4). Null until the N4 module exists. */
  readonly recordScore: number | null;
  /** Interface control: median ms to place a call in the drill (Q5.3.1 rules). */
  readonly interfaceMs: number;
  /** Interface training time given, minutes. Must be the same for everyone. */
  readonly trainingMinutes: number;
  /** Certified conditions held: play clock running, no truth view (Q5.3.1 Inputs). */
  readonly certified: boolean;
}

export type Measure = 'decisionGrade' | 'result';

export interface GroupStat { readonly group: Group; readonly n: number; readonly mean: number | null; readonly adjusted: number | null }

export interface OrderingResult {
  readonly measure: Measure;
  readonly groups: readonly GroupStat[];
  /** Pairs in the expected order that were tested, and which held (raw means and interface-adjusted means). */
  readonly pairs: readonly { readonly higher: Group; readonly lower: Group; readonly heldRaw: boolean; readonly heldAdjusted: boolean | null }[];
}

export interface SeparationReport {
  readonly participants: number;
  readonly problems: readonly string[];
  readonly orderings: readonly OrderingResult[];
  /** Groups with fewer than the starting sample. The write-up is produced either way (acceptance). */
  readonly undersized: readonly Group[];
  /** True when the coach group has data. Without it, nothing here supports a claim above level 0. */
  readonly coachGroupRun: boolean;
  readonly orderingShown: boolean;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Least-squares slope of y on x, or 0 when x does not vary. */
function slope(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs) ?? 0; const my = mean(ys) ?? 0;
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  return sxx === 0 ? 0 : sxy / sxx;
}

export function checkParticipants(ps: readonly Participant[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const p of ps) {
    if (ids.has(p.id)) out.push(`${p.id}: listed twice`);
    ids.add(p.id);
    if (!p.certified) out.push(`${p.id}: not played in certified conditions`);
  }
  const minutes = new Set(ps.map((p) => p.trainingMinutes));
  if (minutes.size > 1) out.push(`interface training time differs between participants (${[...minutes].sort((a, b) => a - b).join(', ')} min)`);
  return out;
}

/**
 * Group means, and means adjusted for interface speed (pooled slope of the measure on interface ms,
 * each participant's value moved to the overall mean interface time). The adjustment is the "control"
 * of Q5.3.1; with one group or no spread in interface time it is left null.
 */
export function separation(ps: readonly Participant[], minPerGroup: number): SeparationReport {
  const ok = ps.filter((p) => p.certified);
  const present = GROUP_ORDER.filter((g) => ok.some((p) => p.group === g));
  const orderings: OrderingResult[] = (['decisionGrade', 'result'] as const).map((m) => {
    const xs = ok.map((p) => p.interfaceMs);
    const b = present.length > 1 ? slope(xs, ok.map((p) => p[m])) : 0;
    const mx = mean(xs) ?? 0;
    const canAdjust = present.length > 1 && new Set(xs).size > 1;
    const groups = GROUP_ORDER.map((g) => {
      const mine = ok.filter((p) => p.group === g);
      return { group: g, n: mine.length, mean: mean(mine.map((p) => p[m])), adjusted: canAdjust ? mean(mine.map((p) => p[m] - b * (p.interfaceMs - mx))) : null };
    });
    const pairs: OrderingResult['pairs'][number][] = [];
    for (let i = 0; i < GROUP_ORDER.length; i++) for (let j = i + 1; j < GROUP_ORDER.length; j++) {
      const hi = groups[i]!; const lo = groups[j]!;
      if (hi.mean === null || lo.mean === null) continue;
      pairs.push({ higher: hi.group, lower: lo.group, heldRaw: hi.mean > lo.mean, heldAdjusted: hi.adjusted === null || lo.adjusted === null ? null : hi.adjusted > lo.adjusted });
    }
    return { measure: m, groups, pairs };
  });
  const undersized = GROUP_ORDER.filter((g) => ok.filter((p) => p.group === g).length < minPerGroup);
  const coachGroupRun = ok.some((p) => p.group === 'coaches');
  const full = present.length === 3 && orderings.every((o) => o.pairs.length === 3 && o.pairs.every((p) => p.heldRaw));
  return { participants: ok.length, problems: checkParticipants(ps), orderings, undersized, coachGroupRun, orderingShown: coachGroupRun && full && undersized.length === 0 };
}
