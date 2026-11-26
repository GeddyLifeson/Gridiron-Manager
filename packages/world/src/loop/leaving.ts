// X12.1.3: leaving the world. Retired people go inactive, and retired generated people over the
// starting age can die, shown as years of life with no cause. Never an imported real person, never
// someone in a job, never the user.
import { DMATH, stream } from '@gm/engine-core';
import type { PersonRecord } from '@gm/schema';
import mortality from './data/mortality.json' with { type: 'json' };
import { archivePerson } from './archive.ts';
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
  /**
   * Entry pools the year's roster moves empty (the pro draft takes the whole pro entry pool, C7). Anyone
   * still in one at the next season point was taken by no league that year (before any pro league
   * existed, or after the last one folded): he leaves football, as an unsigned free agent does (X12.1.2).
   * Default: the pro entry pool. An empty list turns this off.
   */
  readonly unclaimedPools?: readonly string[];
  /**
   * Archive people who leave football and whom no event names (recruits and walk-ons no program signed,
   * entrants no league took): they have no history in this world, so they move from the people table to
   * a compact row (archive.ts) instead of staying as full records. Default on.
   */
  readonly archiveUnnamed?: boolean;
}

export const DEFAULT_UNCLAIMED_POOLS: readonly string[] = ['pro_entry_pool'];

interface MortalityYear { readonly q: readonly number[]; readonly factId: string }
const M_AGES: readonly number[] = mortality.ages;
const M_YEARS: readonly number[] = Object.keys(mortality.years).map(Number).sort((a, b) => a - b);
const M_ROWS = mortality.years as Record<string, MortalityYear>;

/** q(x) of one decade's table at any age: log-linear between listed ages, held flat past the last. */
function qAt(row: readonly number[], age: number): number {
  if (age <= M_AGES[0]!) return row[0]!;
  for (let i = 1; i < M_AGES.length; i++) {
    if (age === M_AGES[i]!) return row[i]!;
    if (age < M_AGES[i]!) {
      const t = (age - M_AGES[i - 1]!) / (M_AGES[i]! - M_AGES[i - 1]!);
      return DMATH.exp(DMATH.log(row[i - 1]!) * (1 - t) + DMATH.log(row[i]!) * t);
    }
  }
  return row[row.length - 1]!;
}

/** Real male period mortality (SSA Study 120 Table 6, facts/mortality.json) at an age in a calendar year. */
export function periodMortality(age: number, year: number): number {
  const first = M_YEARS[0]!, last = M_YEARS[M_YEARS.length - 1]!;
  if (year <= first) return qAt(M_ROWS[String(first)]!.q, age);
  if (year >= last) return qAt(M_ROWS[String(last)]!.q, age);
  let i = 1;
  while (M_YEARS[i]! < year) i++;
  const y0 = M_YEARS[i - 1]!, y1 = M_YEARS[i]!;
  const t = (year - y0) / (y1 - y0);
  return qAt(M_ROWS[String(y0)]!.q, age) * (1 - t) + qAt(M_ROWS[String(y1)]!.q, age) * t;
}

/**
 * X12.1.3 rule 2: yearly chance by age in a calendar year. 0 at or below the starting age; above it the
 * real period life table of that year (sourced, facts/mortality.json), never 0 and never 1.
 */
export function yearlyDeathChance(age: number, year: number = M_YEARS[M_YEARS.length - 1]!): number {
  const first = param('death.minAge') + 1;
  if (age < first) return 0;
  return Math.min(param('death.cap'), periodMortality(age, year));
}

/** The table must be above 0, below 1 and rise with age, in every year (rule 2). Empty when it does. */
export function deathTableProblems(maxAge = 120, years: readonly number[] = [1869, ...M_YEARS, 2030]): string[] {
  const out: string[] = [];
  for (const y of years) {
    for (let a = param('death.minAge') + 1; a <= maxAge; a++) {
      const c = yearlyDeathChance(a, y);
      if (!(c > 0 && c < 1)) out.push(`${y} age ${a}: chance ${c} must be above 0 and below 1`);
      if (a > param('death.minAge') + 1 && c < yearlyDeathChance(a - 1, y)) out.push(`${y} age ${a}: the chance falls`);
    }
  }
  return out;
}

/** People who hold a seat, a roster place or a boss chair. */
export function employedIds(world: LiveWorld): Set<number> {
  const out = new Set<number>();
  for (const j of world.jobs.values()) if (j.holderPersonId !== null) out.add(j.holderPersonId);
  for (const s of world.offLadder.values()) if (s.holderPersonId !== null) out.add(s.holderPersonId);
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
    let wentInactive = 0, died = 0, unclaimed = 0, archived = 0;
    // Pools the last roster cycle should have emptied. Only once a cycle has run (the first season has none).
    if (world.seasons.length >= 2) {
      for (const name of ports.unclaimedPools ?? DEFAULT_UNCLAIMED_POOLS) {
        const ids = world.pools.get(name);
        if (!ids || ids.length === 0) continue;
        for (const id of ids) {
          if (world.status.get(id) !== 'active' || employed.has(id) || world.outOfFootballSince.has(id)) continue;
          world.outOfFootballSince.set(id, year);
          unclaimed++;
        }
        world.pools.set(name, []);
      }
    }
    const archiveUnnamed = ports.archiveUnnamed ?? true;
    for (const id of [...world.outOfFootballSince.keys()].sort((a, b) => a - b)) {
      // Status first: the dead are kept cold (people-table.ts) and need not be read.
      const status = world.status.get(id);
      if (status === 'deceased' || employed.has(id)) continue;
      const p = world.people.get(id);
      if (!p) continue;
      // Nobody's history names him: he played no part in this world's football. Keep a compact row only.
      if (archiveUnnamed && p.origin === 'generated' && id !== world.userPersonId && world.log.countForPerson(id) === 0) {
        archivePerson(world, p, world.outOfFootballSince.get(id)!);
        archived++;
        continue;
      }
      if (status === 'active' && !(ports.strongEdgeNear?.(id, world) ?? false)) {
        world.status.set(id, 'inactive');
        ctx.emit({ type: WENT_INACTIVE, date: world.date, subjects: [{ kind: 'person', id }], payload: { since_year: world.outOfFootballSince.get(id)! }, witnesses: { kind: 'none' }, tier: 3 });
        wentInactive++;
      }
      // Rules 3 to 5: generated people only. The log's own protection would refuse an imported person too.
      if (p.origin !== 'generated' || id === world.userPersonId) continue;
      const chance = yearlyDeathChance(ageOf(p, year), year);
      // Keyed by person and year, so one person's draw never depends on who else is in the list.
      if (chance > 0 && stream(world.seed, STREAM_LEAVING, [id, year]).chance(chance)) {
        world.people.set(id, { ...p, diedYear: year });
        world.status.set(id, 'deceased');
        ctx.emit({ type: DIED, date: world.date, subjects: [{ kind: 'person', id }], payload: { birth_year: p.birthDate.seasonYear, year }, witnesses: { kind: 'public' }, tier: 3 });
        died++;
      }
    }
    return { wentInactive, died, unclaimed, archived };
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
