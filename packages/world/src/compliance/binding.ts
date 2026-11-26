// The L8.2.5 pipeline bound to the live world: its state in `LiveWorld.systemState`, its event sink over
// the history log, its rule set over the league rules reader, its keyed streams, and the weekly step.
// Who acts is read from the world (job rows, off-ladder seats, trait facets); nothing here decides an act.
import { compliance } from '@gm/league';
import { generator } from '@gm/people';
import type { PersonRecord, RuleSet } from '@gm/schema';
import { isActive } from '../loop/lifecycle.ts';
import type { LiveWorld, StepContext, StepHandler } from '../loop/types.ts';
import { param } from './params.ts';

/** `LiveWorld.systemState` key of the pipeline's state. */
export const COMPLIANCE_KEY = 'compliance';
/** J13 stream names the pipeline asks for (CR-G28-2). */
export const STREAM_ENFORCEMENT = 'enforcement';
export const STREAM_CONDUCT = 'conduct';

export const GENERAL_MANAGER = 'pos:general_manager';
export const HEAD_COACH = 'pos:head_coach';

/** The pipeline's state as the world holds it; empty until the first act or week. */
export function complianceOf(world: LiveWorld): compliance.ComplianceState {
  return (world.systemState.get(COMPLIANCE_KEY) as compliance.ComplianceState | undefined) ?? compliance.emptyCompliance();
}

export function setCompliance(world: LiveWorld, state: compliance.ComplianceState): void {
  world.systemState.set(COMPLIANCE_KEY, state);
}

/** A league rule value by key for one rule set, undefined when the set has none (rules-data). */
export type RuleValue = (key: string) => number | undefined;

/**
 * The rule set the pipeline reads: penalty amounts and `applies` switches by `compliance.<class>.<field>` key.
 * `keys()` lists only the compliance keys the league holds, so a class with no published amount takes the
 * league default ladder (L8.2.5) and a class with no `applies` key applies.
 */
export function complianceRules(id: string, seasonYear: number, level: RuleSet['level'], read: RuleValue): RuleSet {
  const held = compliance.RULE_KEYS.map((k) => k.key).filter((k) => read(k) !== undefined).sort();
  const num = (k: string): number => {
    const v = read(k);
    if (v === undefined) throw new Error(`rule set ${id} holds no rule ${k}`);
    return v;
  };
  return { id, level, seasonYear, num, bool: (k) => num(k) !== 0, opt: (k) => String(num(k)), keys: () => held };
}

/**
 * The history log as the pipeline's sink. An event about a team is kept at that team's tier as the pass
 * began. X13.1.1 and MA-66: tiers differ only in what is recorded, so an event below its type's tier is not
 * written and the act stays in the pipeline's own state; the returned id is then 0, and a later event caused
 * by it carries no cause.
 */
export function sinkFor(ctx: StepContext): compliance.EventSink {
  return {
    append(draft) {
      const d = draft.where.teamId === null ? draft : { ...draft, tier: ctx.tierOfTeam(draft.where.teamId) };
      const def = ctx.world.logOptions.registry.get(d.type);
      if (def && d.tier > def.minTier) return 0;
      return ctx.emit({
        type: d.type, date: d.when.date, period: d.when.period, clockTenths: d.when.clockTenths, competitionId: d.competitionId,
        teamId: d.where.teamId, venueId: d.where.venueId, actors: d.actors, subjects: d.subjects, payload: d.payload,
        witnesses: d.witnesses, causeId: d.causeId === 0 ? null : d.causeId, tier: d.tier,
      }).id;
    },
  };
}

/** The pipeline's keyed stream factory over the step's streams (the loop adds step, season and week). */
export function streamFor(ctx: StepContext, name: string): compliance.StreamFor {
  return (scope) => ctx.open(name, scope);
}

/** Holder of a team's seat by position id: a job row first, then an off-ladder seat (CR-G25-1). Null when vacant. */
export function holderOf(world: LiveWorld, teamId: number, positionId: string): number | null {
  for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) if (j.teamId === teamId && j.positionId === positionId && j.holderPersonId !== null) return j.holderPersonId;
  for (const s of [...world.offLadder.values()].sort((a, b) => a.seatId - b.seatId)) if (s.teamId === teamId && s.positionId === positionId && s.holderPersonId !== null) return s.holderPersonId;
  return null;
}

/** K7.1.1: the club's general manager (the pro seat `pos:general_manager`), or null where the club has none. */
export function generalManagerOf(world: LiveWorld, teamId: number): number | null {
  return holderOf(world, teamId, GENERAL_MANAGER);
}

export function partyOf(world: LiveWorld, personId: number, role: compliance.PartyRef['role'], teamId: number): compliance.PartyRef {
  const p = world.people.get(personId);
  if (!p) throw new Error(`compliance: no person ${personId}`);
  return { personId, role, teamId, origin: p.origin };
}

/** A facet on its 0 to 100 scale (X1.1.2; 50 is the population middle). */
function facet(p: PersonRecord, name: string): number {
  return p.traitBlock.facets[name] ?? 50;
}

/**
 * K2.8.1 `ruleRespect` as a z value. Facets are drawn two-sided around the median 50 with side sd
 * (50 - 0) / divisor (X1.2.1, people `traitSideSdDivisor`); `rule_respect` has no group override.
 */
export function ruleRespectZ(p: PersonRecord): number {
  return (facet(p, 'rule_respect') - 50) / (50 / generator.param('traitSideSdDivisor'));
}

/** What K2.8.2 reads about a person. Pressure is E4 job security and X5 need state, 0 to 1, from the caller. */
export function dispositionOf(world: LiveWorld, personId: number, pressure: number): compliance.Disposition {
  const p = world.people.get(personId);
  if (!p) throw new Error(`compliance: no person ${personId}`);
  return {
    personId, origin: p.origin, ruleRespectZ: ruleRespectZ(p), riskTolerance: facet(p, 'risk_tolerance'), candor: facet(p, 'candor'),
    pressure: Math.max(0, Math.min(1, pressure)),
  };
}

/** K7.7.1 CaughtBelief: the shared public read until C10 sanctions news is held in the world (CO-04). */
export function publicBelief(classId: string): { readonly publicDetectRate: number; readonly penalty: number } {
  const major = compliance.violationClass(classId).defaultSeverity === 'major';
  return { publicDetectRate: param('belief.publicDetectRate'), penalty: param(major ? 'belief.penaltyMajor' : 'belief.penaltyMinor') };
}

export interface ComplianceBinding {
  /** The rule set the week's detection and penalties read (CO-03: one set for the whole world). */
  rules(world: LiveWorld): RuleSet;
  /** True when a team's rule set has a school compliance office (L5.4.5), read from a rule key, never a level word. */
  hasComplianceOffice(world: LiveWorld, teamId: number): boolean;
}

/** The L8.2.5 context as the world can give it today. Each stand-in is a README decision (CO-02). */
export function complianceContext(ctx: StepContext, b: ComplianceBinding): compliance.ComplianceContext {
  const { world } = ctx;
  const state = complianceOf(world);
  return {
    rules: b.rules(world),
    enforcement: streamFor(ctx, STREAM_ENFORCEMENT),
    // X7 edges are not bound off-screen: nobody holds a grievance yet.
    grievance: () => false,
    complianceStrictness: (teamId) => (b.hasComplianceOffice(world, teamId) ? param('context.officeStrictness') : 0),
    // K8.7.1: no reporter covers a team off-screen yet.
    mediaLeakWeekly: () => 0,
    bodyStrictness: () => 1,
    headCoachOf: (teamId) => {
      const id = holderOf(world, teamId, HEAD_COACH);
      return id === null ? null : partyOf(world, id, 'head_coach', teamId);
    },
    monitoring: () => param('context.monitoring'),
    // An AI program answers by the candor of the person who acted first in the case (K2.8.2 rule 6 AI parties).
    respond: (c) => {
      const row = state.log.find((r) => c.rowIds.includes(r.id));
      const actor = row ? world.people.get(row.actor.personId) : undefined;
      return compliance.aiResponse(actor ? facet(actor, 'candor') : 50);
    },
  };
}

/**
 * The weekly compliance step (L8.2.5): detection draws over every logged act, false accusations over the
 * teams in the world this season, then cases that fall due are resolved. Penalty orders stay in the state
 * for their owning systems (E6 fines, C7 picks, E2/E3/E4 suspensions), none of which is bound off-screen yet.
 */
export function complianceStep(b: ComplianceBinding): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const before = complianceOf(world);
    const teamIds = world.teams.filter((t) => isActive(world, t.id)).map((t) => t.id).sort((x, y) => x - y);
    const after = compliance.complianceWeek(before, world.date, teamIds, complianceContext(ctx, b), sinkFor(ctx), { tier: 3, source: ctx.source });
    setCompliance(world, after);
    return {
      acts: after.log.length, cases: after.cases.length, open: after.cases.filter((c) => c.status === 'open').length,
      orders: after.orders.length, record: after.record.length,
    };
  };
}
