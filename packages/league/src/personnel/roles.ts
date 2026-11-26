// Role labels (D6.3.1) and flags (D6.3.2), deferred to this package by G-19. Both are the organisation's
// view built from observation: a hidden trait can go unflagged for a long time or be flagged wrongly by a
// poor evaluator, because the inputs here are estimates and observed events, never truth.
import { P } from './params.ts';
import flagRules from './flags.json' with { type: 'json' };
import type { Graded, SetBy } from './types.ts';

// ---------- D6.3.1 role label ----------

export type Unit = 'offense' | 'defense' | 'special_teams';

export type RoleLabel =
  | { readonly kind: 'starter' }
  | { readonly kind: 'situational_starter'; readonly situation: string }
  | { readonly kind: 'role_player'; readonly role: string }
  | { readonly kind: 'backup' }
  | { readonly kind: 'developmental' }
  | { readonly kind: 'special_teams_only' };

/** A role in a unit: base roles have starting slots; package roles are situations (F1: nickel, third down); others are named roles. */
export interface UnitRole { readonly id: string; readonly unit: Unit; readonly kind: 'base' | 'package' | 'role'; readonly slots: number }

export interface LabelPlayer {
  readonly personId: number;
  readonly age: number;
  readonly units: readonly Unit[];
  /** D6.2.2 role grades by role id (G-19 `scouting.roleGrade`). */
  readonly roleGrades: Readonly<Record<string, Graded>>;
  /** D6.5.1 projected grade at his best role (G-19 `scouting.project`), or null. */
  readonly projection: Graded | null;
}

export interface LabelRecord { readonly personId: number; readonly unit: Unit; readonly label: RoleLabel; readonly setBy: SetBy; readonly toldToPlayer: boolean }

function topAt(players: readonly LabelPlayer[], role: UnitRole): number[] {
  return players.filter((p) => p.roleGrades[role.id])
    .sort((a, b) => b.roleGrades[role.id]!.mean - a.roleGrades[role.id]!.mean || a.personId - b.personId)
    .slice(0, role.slots).map((p) => p.personId);
}

/**
 * The position coach's proposal (D6.3.1 rule): starter if his best role grade is in the top N at a base
 * role (N = starting slots); situational starter if he tops a package role only; role player if he tops a
 * named role; developmental if his projection beats his best current role grade by 5 ISS or more and he
 * is under 24; special teams only when his one job is on teams; else backup. One label per unit he
 * belongs to (acceptance), so a player can start on special teams and back up on defense (edge case).
 */
export function proposeLabels(players: readonly LabelPlayer[], roles: readonly UnitRole[]): LabelRecord[] {
  const out: LabelRecord[] = [];
  const tops = new Map(roles.map((r) => [r.id, new Set(topAt(players, r))]));
  const stStarter = (id: number) => roles.some((r) => r.unit === 'special_teams' && tops.get(r.id)!.has(id));
  for (const p of [...players].sort((a, b) => a.personId - b.personId)) {
    const best = Math.max(Number.NEGATIVE_INFINITY, ...Object.values(p.roleGrades).map((g) => g.mean));
    for (const unit of [...new Set(p.units)].sort()) {
      const mine = roles.filter((r) => r.unit === unit).sort((a, b) => a.id.localeCompare(b.id));
      const won = (kind: UnitRole['kind']) => mine.find((r) => r.kind === kind && tops.get(r.id)!.has(p.personId));
      let label: RoleLabel;
      const base = won('base'), pkg = won('package'), role = won('role');
      if (base) label = { kind: 'starter' };
      else if (pkg) label = { kind: 'situational_starter', situation: pkg.id };
      else if (role) label = { kind: 'role_player', role: role.id };
      else if (p.projection && p.age < P.developmentalMaxAge && p.projection.mean - best >= P.developmentalProjectionGap) label = { kind: 'developmental' };
      else if (unit !== 'special_teams' && stStarter(p.personId) && !p.units.every((u) => u === unit)) label = { kind: 'special_teams_only' };
      else label = { kind: 'backup' };
      out.push({ personId: p.personId, unit, label, setBy: 'staff', toldToPlayer: false });
    }
  }
  return out;
}

/** The labels in force: a user override is kept until he clears it (acceptance); the rest are the proposal. */
export function labelsInForce(proposed: readonly LabelRecord[], overrides: readonly LabelRecord[]): LabelRecord[] {
  const key = (r: LabelRecord) => `${r.personId}:${r.unit}`;
  const over = new Map(overrides.map((o) => [key(o), { ...o, setBy: 'user' as const }]));
  return proposed.map((p) => over.get(key(p)) ?? p);
}

/** Telling the player sets his expectation (D12): the told label is what D12 reads. */
export function tell(rec: LabelRecord): LabelRecord { return { ...rec, toldToPlayer: true }; }

// ---------- D6.3.2 flags ----------

export const FLAG_TYPES = ['medical', 'durability', 'effort', 'coachability', 'off_field', 'learning', 'size_speed', 'age', 'contract'] as const;
export type FlagType = (typeof FLAG_TYPES)[number];
/** Character flags: never generated for a person with real_person = true (D13.6.2). */
export const CHARACTER_FLAGS: readonly FlagType[] = ['off_field', 'coachability'];

export interface Flag {
  readonly orgId: number;
  readonly personId: number;
  readonly type: FlagType;
  readonly severity: number;
  readonly source: string;
  readonly day: number;
  readonly note: string;
  readonly archived: boolean;
}

interface RaiseRule { measure: string; atLeast: number; severityStep: number }
interface ClearRule { rule: 'below_threshold' | 'healthy_seasons' | 'quiet_days'; seasons?: number; days?: number }
const RULES = flagRules as unknown as Record<FlagType, { raise: RaiseRule; clear: ClearRule }>;

export function flagRule(t: FlagType): { raise: RaiseRule; clear: ClearRule } { return RULES[t]; }

/** One observed measure for a flag type, computed by its owner (N1 effort grades, D11 history, D5 as observed). */
export interface FlagEvidence {
  readonly type: FlagType;
  /** The rule's measure (for example loafs per 100 snaps over the window). Larger is worse. */
  readonly value: number;
  readonly source: string;
  readonly note: string;
  /** For medical flags: the injuries behind it happened inside the simulation (D6.3.2: real people). */
  readonly fromSimulation?: boolean;
}

export function severityFor(t: FlagType, value: number): number {
  const r = RULES[t].raise;
  if (value < r.atLeast) return 0;
  return Math.min(P.flagSeverityMax, 1 + Math.floor((value - r.atLeast) / r.severityStep));
}

/**
 * Raises, updates and clears flags for one (organisation, player) from this pass's evidence (D6.3.2). A flag
 * rises when its evidence crosses the threshold. A below-threshold measure clears a flag whose clear rule
 * is "below threshold". Character flags are never raised on a real person, and a real person's medical
 * flags come only from injuries inside the simulation. User flags are left alone.
 */
export function updateFlags(orgId: number, personId: number, realPerson: boolean, existing: readonly Flag[], evidence: readonly FlagEvidence[], day: number): Flag[] {
  const out = existing.filter((f) => !(f.orgId === orgId && f.personId === personId && f.source !== 'user' && !f.archived && evidence.some((e) => e.type === f.type)));
  for (const e of [...evidence].sort((a, b) => a.type.localeCompare(b.type))) {
    if (realPerson && CHARACTER_FLAGS.includes(e.type)) continue;
    if (realPerson && (e.type === 'medical' || e.type === 'durability') && e.fromSimulation !== true) continue;
    const prior = existing.find((f) => f.orgId === orgId && f.personId === personId && f.type === e.type && f.source !== 'user' && !f.archived);
    const sev = severityFor(e.type, e.value);
    if (sev > 0) out.push({ orgId, personId, type: e.type, severity: sev, source: e.source, day, note: e.note, archived: false });
    else if (prior) out.push(RULES[e.type].clear.rule === 'below_threshold' ? { ...prior, archived: true } : prior);
  }
  return out.sort((a, b) => a.personId - b.personId || a.type.localeCompare(b.type) || a.day - b.day);
}

/** The user's own flag (D6.3.2: the user can add his own). */
export function userFlag(orgId: number, personId: number, type: FlagType, severity: number, day: number, note: string): Flag {
  return { orgId, personId, type, severity: Math.min(P.flagSeverityMax, Math.max(1, severity)), source: 'user', day, note, archived: false };
}

/**
 * Season-end pass (D6.3.2 edge case): a medical or durability flag whose cause has passed (the clear rule's
 * healthy seasons) drops one severity step per further healthy season, then is archived. A quiet-days flag
 * with no new evidence inside its window is archived.
 */
export function seasonEnd(flags: readonly Flag[], healthySeasons: (personId: number) => number, day: number): Flag[] {
  return flags.map((f) => {
    if (f.archived || f.source === 'user') return f;
    const c = RULES[f.type].clear;
    if (c.rule === 'healthy_seasons' && healthySeasons(f.personId) >= (c.seasons ?? 1)) {
      return f.severity <= 1 ? { ...f, archived: true } : { ...f, severity: f.severity - 1 };
    }
    if (c.rule === 'quiet_days' && day - f.day >= (c.days ?? 0)) return { ...f, archived: true };
    return f;
  });
}
