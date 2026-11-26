// The violation class catalogue (L8.2.5 class table, T9.5.1 rule 1, I11.8.1, K2.8.2 rule 4). Content:
// one row per class, checked at load. On-field fouls are not classes: they belong to the officials
// (B8, B11, J10; L8.2.5 "On-field fouls are not this pipeline", I11.8.1 rule 2).
// `league` may not import zod (P1.1.1), so the check is written out; the zod twin of each persisted row
// is proposed to the integrator for schema/src/world (test/compliance/proposed-schemas.ts).
import classesJson from './classes.json' with { type: 'json' };

export const ENFORCING_BODIES = ['league', 'conference', 'national_body', 'settlement_body'] as const;
export type EnforcingBody = (typeof ENFORCING_BODIES)[number];
export const SEVERITIES = ['major', 'minor'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Roles that may commit acts. The job table (G-25) maps jobs onto them. */
export const ACTOR_ROLES = [
  'head_coach', 'coordinator', 'position_coach', 'graduate_assistant', 'recruiter', 'player',
  'general_manager', 'owner', 'athletic_director', 'club_staff', 'booster',
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface ViolationClass {
  readonly id: string;
  readonly ownerLeaf: string;
  readonly body: EnforcingBody;
  readonly committedBy: readonly ActorRole[];
  /** A club or program act (L8.2.5: cap circumvention, camp-fine waiver): the club is a party. */
  readonly clubAct: boolean;
  /** Leaves a visible trace an opponent or rival can notice (L8.2.5 rival source). */
  readonly trace: boolean;
  /** C11.2.4 rule 1: certain on a union facility visit day. */
  readonly unionVisit: boolean;
  readonly inspection: {
    readonly p: number;
    /** Weekly chance used instead of `p` when the act is major (T9.5.2 rule 1: a pattern known to several people). */
    readonly pMajor?: number;
    readonly per: 'act' | 'week';
    readonly basis: 'bible' | 'assumption';
    readonly leaf: string;
  };
  /** The head coach answers for staff acts of this class where the rule set says so (T9.5.1 rule 5). */
  readonly superiorResponsible: boolean;
  /** C11.2.4 edge case: the commissioner may halve a first-offence fine. */
  readonly commissionerDiscretion: boolean;
  readonly defaultSeverity: Severity;
  /** K2.8.2 rule 2: threshold = t0 + t1 * z(ruleRespect). Assumption per class. */
  readonly threshold: { readonly t0: number; readonly t1: number };
  /** Penalty reference text and its source status, copied from the owning leaf for reviewers. Never shown as a value. */
  readonly penaltyStatus: string;
}

const isProb = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 1;
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

/** Problems with one raw catalogue row; empty when the row is valid. */
export function classProblems(raw: unknown): string[] {
  const r = raw as Record<string, unknown>;
  const id = typeof r?.id === 'string' ? r.id : '?';
  const bad: string[] = [];
  const need = (ok: boolean, what: string) => { if (!ok) bad.push(`class ${id}: ${what}`); };
  need(typeof r?.id === 'string' && /^[a-z][a-z0-9_]*$/.test(r.id), 'id must be lower snake case');
  need(isStr(r?.ownerLeaf), 'ownerLeaf');
  need((ENFORCING_BODIES as readonly unknown[]).includes(r?.body), 'body');
  need(Array.isArray(r?.committedBy) && r.committedBy.length > 0 && r.committedBy.every((x) => (ACTOR_ROLES as readonly unknown[]).includes(x)), 'committedBy');
  for (const k of ['clubAct', 'trace', 'unionVisit', 'superiorResponsible', 'commissionerDiscretion']) need(isBool(r?.[k]), k);
  const ins = r?.inspection as Record<string, unknown> | undefined;
  need(!!ins && isProb(ins.p) && (ins.pMajor === undefined || isProb(ins.pMajor)) && (ins.per === 'act' || ins.per === 'week')
    && (ins.basis === 'bible' || ins.basis === 'assumption') && isStr(ins.leaf), 'inspection');
  need((SEVERITIES as readonly unknown[]).includes(r?.defaultSeverity), 'defaultSeverity');
  const th = r?.threshold as Record<string, unknown> | undefined;
  need(!!th && typeof th.t0 === 'number' && typeof th.t1 === 'number' && th.t1 > 0, 'threshold');
  need(typeof r?.penaltyStatus === 'string', 'penaltyStatus');
  const known = new Set(['id', 'ownerLeaf', 'body', 'committedBy', 'clubAct', 'trace', 'unionVisit', 'inspection', 'superiorResponsible', 'commissionerDiscretion', 'defaultSeverity', 'threshold', 'penaltyStatus']);
  for (const k of Object.keys(r ?? {})) need(known.has(k), `unknown field ${k}`);
  return bad;
}

function load(): readonly ViolationClass[] {
  const rows = classesJson.classes as unknown[];
  const problems = rows.flatMap(classProblems);
  const ids = rows.map((r) => (r as { id: string }).id);
  if (new Set(ids).size !== ids.length) problems.push('duplicate class id');
  if (problems.length) throw new Error(`compliance catalogue: ${problems.join('; ')}`);
  return rows as ViolationClass[];
}

export const CLASSES: readonly ViolationClass[] = load();

const byId = new Map(CLASSES.map((c) => [c.id, c]));
export function violationClass(id: string): ViolationClass {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown violation class ${id}`);
  return c;
}
export function hasViolationClass(id: string): boolean { return byId.has(id); }
