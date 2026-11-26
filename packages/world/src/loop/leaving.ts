// X12.1.3: leaving the world. Retired people go inactive, and retired generated people over the
// starting age can die, shown as years of life with no cause. Never an imported real person, never
// someone in a job, never the user.
import { DMATH, stream } from '@gm/engine-core';
import type { PersonRecord } from '@gm/schema';
import { DIED, RETURNED_ACTIVE, WENT_INACTIVE } from './events.ts';
import { param } from './params.ts';
import type { LiveWorld, StepContext, StepHandler } from './types.ts';

export const STREAM_LEAVING = 'world.leaving';

export interface LeavingPorts {
  /**
   * X12.1.3 rule 1: true when the person has an X7 edge above the starting strength to anyone at tier 1
   * or 2 (G-24 edges, bound by the caller). Without a binding nobody has such an edge.
   */
  readonly strongEdgeNear?: (personId: number, world: LiveWorld) => boolean;
}

/** X12.1.3 rule 2: yearly chance by age. 0 at or below the starting age; above it, never 0 and never 1. */
export function yearlyDeathChance(age: number): number {
  const first = param('death.minAge') + 1;
  if (age < first) return 0;
  return Math.min(param('death.cap'), param('death.base') * DMATH.pow(param('death.growth'), age - first));
}

/** The table must rise with age and stay low before 75 (rule 2). Empty when it does. */
export function deathTableProblems(maxAge = 120): string[] {
  const out: string[] = [];
  for (let a = param('death.minAge') + 1; a <= maxAge; a++) {
    const c = yearlyDeathChance(a);
    if (!(c > 0 && c < 1)) out.push(`age ${a}: chance ${c} must be above 0 and below 1`);
    if (a > param('death.minAge') + 1 && c < yearlyDeathChance(a - 1)) out.push(`age ${a}: the chance falls`);
    if (a < param('death.lowBefore') && c > param('death.lowCeiling')) out.push(`age ${a}: ${c} is not low before ${param('death.lowBefore')}`);
  }
  return out;
}

/** People who hold a seat, a roster place or a boss chair. */
export function employedIds(world: LiveWorld): Set<number> {
  const out = new Set<number>();
  for (const j of world.jobs.values()) if (j.holderPersonId !== null) out.add(j.holderPersonId);
  for (const ids of world.rosters.values()) for (const id of ids) out.add(id);
  for (const t of world.teams) for (const id of [t.ownerPersonId, t.athleticDirectorPersonId, t.presidentPersonId]) if (id !== null) out.add(id);
  return out;
}

export function ageOf(p: PersonRecord, seasonYear: number): number {
  return seasonYear - p.birthDate.seasonYear;
}

/** The season-point pass of X12.1.3: rule 1 (inactive), then rule 2 (death of retired generated people). */
export function leavingStep(ports: LeavingPorts = {}): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const year = world.date.seasonYear;
    const employed = employedIds(world);
    let wentInactive = 0, died = 0;
    for (const id of [...world.outOfFootballSince.keys()].sort((a, b) => a - b)) {
      const p = world.people.get(id);
      const status = world.status.get(id);
      if (!p || status === 'deceased' || employed.has(id)) continue;
      if (status === 'active' && !(ports.strongEdgeNear?.(id, world) ?? false)) {
        world.status.set(id, 'inactive');
        ctx.emit({ type: WENT_INACTIVE, date: world.date, subjects: [{ kind: 'person', id }], payload: { since_year: world.outOfFootballSince.get(id)! }, witnesses: { kind: 'none' }, tier: 3 });
        wentInactive++;
      }
      // Rules 3 to 5: generated people only. The log's own protection would refuse an imported person too.
      if (p.origin !== 'generated' || id === world.userPersonId) continue;
      const chance = yearlyDeathChance(ageOf(p, year));
      // Keyed by person and year, so one person's draw never depends on who else is in the list.
      if (chance > 0 && stream(world.seed, STREAM_LEAVING, [id, year]).chance(chance)) {
        world.people.set(id, { ...p, diedYear: year });
        world.status.set(id, 'deceased');
        ctx.emit({ type: DIED, date: world.date, subjects: [{ kind: 'person', id }], payload: { birth_year: p.birthDate.seasonYear, year }, witnesses: { kind: 'public' }, tier: 3 });
        died++;
      }
    }
    return { wentInactive, died };
  };
}

/** Rule 1, last sentence: an inactive person returns to active when hired or contacted. */
export function reactivate(ctx: StepContext, personId: number, reason: 'hired' | 'contacted'): boolean {
  if (ctx.world.status.get(personId) !== 'inactive') return false;
  ctx.world.status.set(personId, 'active');
  if (reason === 'hired') ctx.world.outOfFootballSince.delete(personId);
  ctx.emit({ type: RETURNED_ACTIVE, date: ctx.world.date, subjects: [{ kind: 'person', id: personId }], payload: { reason }, witnesses: { kind: 'none' }, tier: 3 });
  return true;
}

/** K7 skips inactive and deceased people unless an edge brings an inactive one up (X12.1.3 AI use). */
export function searchable(world: LiveWorld, personId: number, askedForByEdge = false): boolean {
  const s = world.status.get(personId);
  return s === 'active' || (s === 'inactive' && askedForByEdge);
}
