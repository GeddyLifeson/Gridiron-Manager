// The roster template (M1.3.1), the needs board (M1.4.1), depth risk (M1.4.2), future need (M1.4.3) and
// the needs memo (M1.5.1). All of it runs on graded values, so wrong grades give a wrong board (M1.4.1).
import { fitScore, tierWeight, type PositionPriority } from './fit.ts';
import { P } from './params.ts';
import defaults from './defaults.json' with { type: 'json' };
import type { Fit, JobId, JobProfile, PersonnelPlayer } from './types.ts';

// ---------- M1.3.1 roster template ----------

/** Target count per row. Rows come from the installed system's jobs or groups (M1.3.1 edge case). */
export interface RosterTemplate { readonly rows: Readonly<Record<string, number>>; readonly limit: number }

/** The starting pro 53 (M1.3.1 rule 1). A design default, not a fact: the screen labels it an Assumption. */
export function defaultTemplate(limit: number): RosterTemplate {
  return { rows: { ...defaults.template53.rows }, limit };
}

export type TemplateWarning =
  | { kind: 'total'; total: number; limit: number }
  | { kind: 'linemen'; row: string; count: number; required: number }
  | { kind: 'personnel'; row: string; count: number; required: number }
  | { kind: 'special_teams'; unit: string; short: number };

export interface TemplateContext {
  /** The template row holding the offensive linemen, and how many must dress (C5.2.1 via roster rules). */
  readonly linemenRow: string;
  readonly minLinemen: number;
  /** Most players the heaviest personnel group in the plan puts on the field at each row. */
  readonly heaviestPersonnel: Readonly<Record<string, number>>;
  /** Bodies each special teams unit needs and how many on the template can play it (M2.4). */
  readonly specialTeams: readonly { readonly unit: string; readonly needed: number; readonly available: number }[];
}

/** Warnings when the template cannot support the plan (M1.3.1 rule 2). The total must equal the limit. */
export function templateWarnings(t: RosterTemplate, ctx: TemplateContext): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  const total = Object.values(t.rows).reduce((s, n) => s + n, 0);
  if (total !== t.limit) out.push({ kind: 'total', total, limit: t.limit });
  const ol = t.rows[ctx.linemenRow] ?? 0;
  if (ol < ctx.minLinemen) out.push({ kind: 'linemen', row: ctx.linemenRow, count: ol, required: ctx.minLinemen });
  for (const [row, heavy] of Object.entries(ctx.heaviestPersonnel).sort(([a], [b]) => a.localeCompare(b))) {
    const need = heavy + P.templatePersonnelSpare;
    const have = t.rows[row] ?? 0;
    if (have < need) out.push({ kind: 'personnel', row, count: have, required: need });
  }
  for (const st of ctx.specialTeams) if (st.available < st.needed) out.push({ kind: 'special_teams', unit: st.unit, short: st.needed - st.available });
  return out;
}

/** Template rows against the current roster: target, current, difference (the M1.3.1 table). */
export function templateTable(t: RosterTemplate, current: Readonly<Record<string, number>>): { row: string; target: number; current: number; difference: number }[] {
  return Object.keys({ ...t.rows, ...current }).sort().map((row) => {
    const target = t.rows[row] ?? 0, cur = current[row] ?? 0;
    return { row, target, current: cur, difference: cur - target };
  });
}

// ---------- M1.4.1 needs board ----------

export interface NeedTargets { readonly starterFit: number; readonly backupFit: number }
export const DEFAULT_TARGETS: NeedTargets = { starterFit: P.targetStarterFit, backupFit: P.targetBackupFit };

export interface NeedRow {
  readonly job: JobId;
  readonly starter: { readonly personId: number; readonly fit: Fit } | null;
  readonly backup: { readonly personId: number; readonly fit: Fit } | null;
  readonly starterGap: number;
  readonly depthGap: number;
  readonly count: number;
  readonly target: number;
  readonly shortfall: number;
  readonly futureFlags: readonly FutureFlag[];
  readonly score: number;
}

export interface NeedsInput {
  readonly players: readonly PersonnelPlayer[];
  readonly profiles: Readonly<Record<JobId, JobProfile>>;
  readonly priority: PositionPriority;
  /** Target count per job (template rows by job). Jobs without a row have no count penalty. */
  readonly targetCounts: Readonly<Record<JobId, number>>;
  readonly targets?: NeedTargets;
  readonly future?: FutureContext;
}

/**
 * Need score per job (M1.4.1): tier weight x (starter gap + 0.5 x depth gap + count shortfall penalty).
 * Starter gap = max(0, target fit - best fit) over available players whose primary job it is; depth gap =
 * max(0, target backup fit - second-best fit) over every available player listed there (edge case: a player
 * at two jobs counts at his primary for the starter gap and at both for depth). Ranked, highest first.
 */
export function needsBoard(input: NeedsInput): NeedRow[] {
  const targets = input.targets ?? DEFAULT_TARGETS;
  const avail = input.players.filter((p) => !p.unavailable);
  const rows: NeedRow[] = [];
  for (const job of Object.keys(input.priority.tiers).sort()) {
    const profile = input.profiles[job];
    if (!profile) continue;
    const fits = (list: readonly PersonnelPlayer[]) => list.map((p) => ({ personId: p.personId, fit: fitScore(p, profile) }))
      .sort((a, b) => b.fit.mean - a.fit.mean || a.personId - b.personId);
    const primaries = fits(avail.filter((p) => p.jobs[0] === job));
    const starter = primaries[0] ?? null;
    const listed = fits(avail.filter((p) => p.jobs.includes(job)));
    const backup = listed.find((x) => x.personId !== starter?.personId) ?? null;
    const starterGap = Math.max(0, targets.starterFit - (starter?.fit.mean ?? 0));
    const depthGap = Math.max(0, targets.backupFit - (backup?.fit.mean ?? 0));
    const count = input.players.filter((p) => p.jobs[0] === job).length;
    const target = input.targetCounts[job] ?? 0;
    const shortfall = Math.max(0, target - count);
    const futureFlags = input.future ? futureNeed(input.players.filter((p) => p.jobs[0] === job), input.future) : [];
    const tier = input.priority.tiers[job] ?? 'core';
    const score = tierWeight(tier) * (starterGap + P.depthGapWeight * depthGap + shortfall * P.countShortfallPenalty);
    rows.push({ job, starter, backup, starterGap, depthGap, count, target, shortfall, futureFlags, score });
  }
  return rows.sort((a, b) => b.score - a.score || a.job.localeCompare(b.job));
}

// ---------- M1.4.2 depth risk ----------

export interface FragilityInput {
  readonly job: JobId;
  /** Depth chart order at the job (M2), starter first. The cascade is the depth chart's own (M2.1.3). */
  readonly depth: readonly number[];
  readonly players: readonly PersonnelPlayer[];
  readonly profile: JobProfile;
  /** Chance of losing the starter for at least one game this season, from D11's position rates. */
  readonly lossChance: number;
  /** Packages and special teams units each player is in, for the "who moves where" list. */
  readonly rolesOf?: Readonly<Record<string, readonly string[]>>;
}

export interface Fragility {
  readonly job: JobId;
  readonly starterId: number | null;
  readonly replacementId: number | null;
  readonly dropOff: number;
  readonly score: number;
  /** Packages or units that need a new body when the starter is out. */
  readonly rolesVacated: readonly string[];
}

/** Fragility (M1.4.2): loss chance x drop-off (fit and knowledge difference to the replacement). No simulation. */
export function fragility(f: FragilityInput): Fragility {
  const byId = new Map(f.players.map((p) => [p.personId, p]));
  const chain = f.depth.filter((id) => byId.has(id) && !byId.get(id)!.unavailable);
  const s = chain[0] !== undefined ? byId.get(chain[0])! : null;
  const r = chain[1] !== undefined ? byId.get(chain[1])! : null;
  const fit = (p: PersonnelPlayer | null) => (p ? fitScore(p, f.profile).mean : 0);
  const know = (p: PersonnelPlayer | null) => (p ? p.jobKnowledge[f.job] ?? 0 : 0);
  const dropOff = s ? Math.max(0, fit(s) - fit(r)) + P.fragilityKnowledgeWeight * Math.max(0, know(s) - know(r)) : 0;
  return {
    job: f.job, starterId: s?.personId ?? null, replacementId: r?.personId ?? null, dropOff, score: f.lossChance * dropOff,
    rolesVacated: s ? [...(f.rolesOf?.[String(s.personId)] ?? [])].sort() : [],
  };
}

/** Fragility list with the quarterback job always first (M1.4.2 edge case), then by score. */
export function fragilityBoard(rows: readonly Fragility[], quarterbackJobs: readonly JobId[]): Fragility[] {
  return [...rows].sort((a, b) => {
    const qa = quarterbackJobs.includes(a.job) ? 0 : 1, qb = quarterbackJobs.includes(b.job) ? 0 : 1;
    return qa - qb || b.score - a.score || a.job.localeCompare(b.job);
  });
}

// ---------- M1.4.3 future need ----------

export type FutureFlag =
  | { readonly kind: 'decline_band'; readonly personId: number; readonly age: number }
  | { readonly kind: 'contract_ending'; readonly personId: number; readonly yearsLeft: number }
  | { readonly kind: 'last_eligibility'; readonly personId: number }
  | { readonly kind: 'early_exit_read'; readonly personId: number; readonly basis: string };

export interface FutureContext {
  /** First age of each job's decline band (D8, by the player's primary job). */
  readonly declineStartAge: Readonly<Record<JobId, number>>;
  /** Staff reads that a player may leave early (draft or portal), in words with their basis (T6, T8). */
  readonly earlyExitReads?: Readonly<Record<string, string>>;
}

/**
 * Future-need flags (M1.4.3). The test follows what the player record carries, never the level word: a
 * player with a contract is flagged inside his decline band or with a year or less left; a player with
 * eligibility is flagged in his last season or on a staff read of early exit. So a college senior starter
 * always raises a flag at his job (acceptance).
 */
export function futureNeed(players: readonly PersonnelPlayer[], ctx: FutureContext): FutureFlag[] {
  const out: FutureFlag[] = [];
  for (const p of [...players].sort((a, b) => a.personId - b.personId)) {
    const job = p.jobs[0];
    const band = job !== undefined ? ctx.declineStartAge[job] : undefined;
    if (p.contractYearsLeft !== null) {
      if (band !== undefined && p.age >= band) out.push({ kind: 'decline_band', personId: p.personId, age: p.age });
      if (p.contractYearsLeft <= P.contractEndingYears) out.push({ kind: 'contract_ending', personId: p.personId, yearsLeft: p.contractYearsLeft });
    }
    if (p.eligibilityLeft !== null && p.eligibilityLeft <= 1) out.push({ kind: 'last_eligibility', personId: p.personId });
    const read = ctx.earlyExitReads?.[String(p.personId)];
    if (read) out.push({ kind: 'early_exit_read', personId: p.personId, basis: read });
  }
  return out;
}

// ---------- M1.5.1 needs memo ----------

export interface NeedsMemo {
  readonly needs: readonly JobId[];
  readonly targets: readonly number[];
  readonly keep: readonly number[];
  readonly readyToLose: readonly number[];
}

export interface MemoTerms {
  /** The L5.2.4 approval value for the coach, 0 to 1 (relationship, record, arrangement). */
  readonly approval: number;
  /** Final roster say in the coach's contract (E3): the memo is the plan of record. */
  readonly finalSay: boolean;
}

/** The coach's share of the GM's action weight (M1.5.1 rule 1): 30 to 70 percent band by approval, 100 with final say. */
export function coachShare(t: MemoTerms): number {
  if (t.finalSay) return 1;
  const a = Math.min(1, Math.max(0, t.approval));
  return P.memoCoachShareLow + (P.memoCoachShareHigh - P.memoCoachShareLow) * a;
}

/**
 * The GM's action weights on each need for the user's club (M1.5.1 rules 1 and 2): his own need score
 * blended with the coach's. The coach's score for a job is its memo rank turned into the top of the
 * GM's own scale; asking for more than the starting three items lowers the weight of each ask. Hidden:
 * the screen shows only what the GM says and does.
 */
export function gmNeedWeights(gmBoard: readonly NeedRow[], memo: NeedsMemo, terms: MemoTerms): { job: JobId; weight: number }[] {
  const share = coachShare(terms);
  const top = gmBoard.reduce((m, r) => Math.max(m, r.score), 0);
  const asks = memo.needs.length;
  const dilution = asks > P.memoPriorityItems ? P.memoPriorityItems / asks : 1;
  const coachScore = (job: JobId) => {
    const i = memo.needs.indexOf(job);
    return i < 0 ? 0 : top * dilution * (asks - i) / asks;
  };
  return gmBoard
    .map((r) => ({ job: r.job, weight: (1 - share) * r.score + share * coachScore(r.job) }))
    .sort((a, b) => b.weight - a.weight || a.job.localeCompare(b.job));
}
