// Job fit and versatility (M1.2.1, M1.2.2) and the position priority ranking (M1.1.1). Fit is the coach's
// own definition over graded values. The engine never reads it (M1.2.1 rule 3): no engine package imports
// this module, and fit takes estimates only, so a badly built profile misleads the coach as intended.
import { P } from './params.ts';
import type { Fit, Graded, JobId, JobProfile, PersonnelPlayer, Tier } from './types.ts';

/** Problems with a profile: weights must be positive numbers; a profile with no weights uses the family default. */
export function checkProfile(p: JobProfile): string[] {
  const out: string[] = [];
  const w = Object.entries(p.weights);
  if (w.length === 0 && !p.familyDefault) out.push(`${p.job}: no weights and not marked as the family default`);
  for (const [a, v] of w) if (!(v > 0) || !Number.isFinite(v)) out.push(`${p.job}: weight on ${a} must be a positive number`);
  for (const [a, v] of Object.entries(p.minimums)) if (!Number.isFinite(v)) out.push(`${p.job}: minimum on ${a} must be a number`);
  return out;
}

/** The profile in use for a job: the coach's own when it has weights, else the family default with the marker. */
export function profileFor(job: JobId, coach: Readonly<Record<JobId, JobProfile>>, family: Readonly<Record<JobId, JobProfile>>): JobProfile | null {
  const own = coach[job];
  if (own && Object.keys(own.weights).length > 0) return own;
  const def = family[job];
  return def ? { ...def, job, familyDefault: true } : null;
}

/**
 * Fit score (M1.2.1 rule 1): weighted mean of the player's graded attributes on the profile, on the 0 to
 * 100 ISS range, cut by a starting 15 points for each minimum missed (a minimum is missed when the graded
 * mean is below it). Variance is the weighted sum of the attribute variances (rule 2; the G-19 S-05 reading
 * of D6.2.2), so a thinly scouted player has a wide fit band. An attribute with no grade counts at the
 * level's no-information prior and its variance.
 */
export function fitScore(player: Pick<PersonnelPlayer, 'grades'>, profile: JobProfile): Fit {
  const entries = Object.entries(profile.weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let mean = 0, variance = 0;
  for (const [attr, w] of entries) {
    const g = player.grades[attr] ?? { mean: P.noGradeMean, variance: P.noGradeVariance };
    const share = total > 0 ? w / total : 0;
    mean += share * g.mean;
    variance += share * g.variance;
  }
  const missed = Object.entries(profile.minimums).filter(([attr, min]) => (player.grades[attr]?.mean ?? P.noGradeMean) < min).map(([a]) => a).sort();
  const cut = missed.length * P.fitMinimumMissPenalty;
  return { job: profile.job, mean: clamp(mean - cut, 0, P.fitScaleMax), variance, minimumsMissed: missed };
}

/** Fit of every player at one job, best first (the profile screen's preview, M1.2.1). Ties by person id. */
export function fitPreview(players: readonly PersonnelPlayer[], profile: JobProfile): { personId: number; fit: Fit; outOfProfile: boolean }[] {
  return players
    .map((p) => ({ personId: p.personId, fit: fitScore(p, profile), outOfProfile: p.jobs[0] !== profile.job && p.jobs.includes(profile.job) }))
    .sort((a, b) => b.fit.mean - a.fit.mean || a.personId - b.personId);
}

/**
 * Versatility (M1.2.2): jobs a player can fill. A job counts when fit is above a starting 60 and the staff's
 * knowledge estimate of that job is at or above the readiness line (D9). Knowledge comes only from reps at
 * the job, so a player with no reps at a second job never carries the tag (acceptance).
 */
export function versatileJobs(player: PersonnelPlayer, profiles: readonly JobProfile[]): JobId[] {
  return profiles
    .filter((pr) => fitScore(player, pr).mean > P.versatilityFitMin && (player.jobKnowledge[pr.job] ?? 0) >= P.readinessLine)
    .map((pr) => pr.job)
    .sort();
}

export function isVersatile(player: PersonnelPlayer, profiles: readonly JobProfile[]): boolean {
  return versatileJobs(player, profiles).length > 1;
}

/** The coach's tiers (M1.1.1). Every job in the installed systems appears exactly once (acceptance). */
export interface PositionPriority { readonly tiers: Readonly<Record<JobId, Tier>> }

export function checkPriority(pp: PositionPriority, installedJobs: readonly JobId[]): string[] {
  const out: string[] = [];
  const keys = Object.keys(pp.tiers);
  for (const j of installedJobs) if (!(j in pp.tiers)) out.push(`job ${j} has no tier`);
  for (const k of keys) if (!installedJobs.includes(k)) out.push(`job ${k} is not in the installed systems`);
  return out;
}

/** Tier weight on the needs board (M1.1.1 rule 2: starting 1.5, 1.0, 0.6). */
export function tierWeight(t: Tier): number {
  return t === 'premium' ? P.tierWeightPremium : t === 'core' ? P.tierWeightCore : P.tierWeightReplaceable;
}

/** A ranking change is free but logged; a swing from the stated philosophy is noticed by the GM (M1.1.1 rule 3). */
export function priorityChange(before: PositionPriority, after: PositionPriority): { job: JobId; from: Tier | null; to: Tier | null }[] {
  const jobs = [...new Set([...Object.keys(before.tiers), ...Object.keys(after.tiers)])].sort();
  return jobs.filter((j) => before.tiers[j] !== after.tiers[j]).map((j) => ({ job: j, from: before.tiers[j] ?? null, to: after.tiers[j] ?? null }));
}

/** Side panel facts (M1.1.1 rule 1): snap share per job and the count of playbook concepts that isolate it. */
export function priorityPanel(snapsByJob: Readonly<Record<JobId, number>>, teamSnaps: number, isolatingConcepts: Readonly<Record<JobId, number>>): { job: JobId; snapShare: number; isolatingConcepts: number }[] {
  return Object.keys({ ...snapsByJob, ...isolatingConcepts }).sort().map((job) => ({
    job, snapShare: teamSnaps > 0 ? (snapsByJob[job] ?? 0) / teamSnaps : 0, isolatingConcepts: isolatingConcepts[job] ?? 0,
  }));
}

export function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }
export const sd = (g: Graded): number => Math.sqrt(Math.max(0, g.variance));
