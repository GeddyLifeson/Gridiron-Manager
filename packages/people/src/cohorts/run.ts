// Running one cohort on its calendar date (X11.1.1): size it against its target (X11.2.1), build it
// with derived seeds and validate it (X11.2.2), run the name guard (X11.4.2), and hand back the people
// plus the log rows to emit (`cohort_entered`, and `cohort_validation_warning` when every reseed failed).
// The undrafted pool and returning former players are people who already exist: they enter by id and are
// never generated again (X11.1.2 edge case, X11.3.1).
import type { EventTypeDef, PersonRecord, RandomStream, WitnessRule, WorldDate } from '@gm/schema';
import { KIND_MAKEUP, type CohortKind } from './kinds.ts';
import { cohortTarget, type WorldScale } from './targets.ts';
import { buildValidatedCohort, validateCohort, attemptScope, type BandShares, type CohortProblem } from './validate.ts';
import { guardName, type NameDraw, type PackNameIndex } from './identity.ts';

export const COHORT_ENTERED = 'cohort_entered';
export const COHORT_VALIDATION_WARNING = 'cohort_validation_warning';

/** Event types this module emits (X2.1.2 files). The integrator registers them with the type registry. */
export const COHORT_EVENT_TYPES: readonly EventTypeDef[] = [
  {
    id: COHORT_ENTERED, family: 'world',
    payloadSchema: { kind: 'string', season: 'number', count: 'number', count_college: 'number', count_pro: 'number' },
    witnessRule: 'public', lineTemplate: 'history.cohort_entered', harmClass: 'none', importedAllowed: true, minTier: 3,
    consumers: ['league.news', 'front-office', 'world.loop'], compactable: false,
  },
  {
    id: COHORT_VALIDATION_WARNING, family: 'world',
    payloadSchema: { kind: 'string', season: 'number', attempts: 'number', failing_checks: 'string' },
    witnessRule: 'none', lineTemplate: 'history.cohort_validation_warning', harmClass: 'none', importedAllowed: true, minTier: 3,
    consumers: ['headless.soak'], compactable: false,
  },
];

/** The shape G-22's `EventLog.emit` takes (league/src/history EmitInput), the fields used here. */
export interface CohortEmitInput {
  readonly type: string;
  readonly date: WorldDate;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
  readonly witnesses: WitnessRule;
  readonly tier: 1 | 2 | 3;
  readonly source: 'sim' | 'history_run';
}

/** Randomness handed in by the world layer (as the generator's `GeneratorRandom.open`). */
export type OpenStream = (name: string, scope: readonly (string | number)[]) => RandomStream;

export const STREAM_COHORT = 'person.cohort';

export interface CohortRun {
  readonly kind: CohortKind;
  readonly season: number;
  readonly date: WorldDate;
  readonly world: WorldScale;
  readonly open: OpenStream;
  /**
   * Make one new person for slot `slot` of attempt `attempt`. The world layer binds G-17's generator
   * (generatePlayer for players, generateNonPlayer for coaches), with `classKey` {season, kind, slot}
   * and a person id issued by the save. `stream` is this slot's derived stream.
   */
  readonly makePerson: (slot: number, attempt: number, stream: RandomStream) => PersonRecord;
  /** People who enter by id without being generated (former players for coach_staff_entry). */
  readonly existingIds?: readonly number[];
  /** Fixed size instead of the X11.2.1 target (top-up, tests); the size check still uses the target. */
  readonly sizeOverride?: number;
  readonly bandTargets?: BandShares;
  readonly packNames?: PackNameIndex;
  readonly nameDraw?: NameDraw;
  readonly source?: 'sim' | 'history_run';
  /** Level of each entrant, for kinds that serve both levels (coach_staff_entry). */
  readonly levelOfId?: (id: number) => 'college' | 'pro';
}

/** `count_by_level` of X11.1.1, flattened into two payload fields (payloads hold scalars only). */
export function countByLevel(kind: CohortKind, ids: readonly number[], levelOfId?: (id: number) => 'college' | 'pro'): { college: number; pro: number } {
  const out = { college: 0, pro: 0 };
  const fixed = KIND_MAKEUP[kind].level;
  for (const id of ids) {
    const lv = fixed in out ? (fixed as 'college' | 'pro') : levelOfId?.(id);
    if (lv) out[lv]++;
  }
  return out;
}

export interface CohortResult {
  readonly people: readonly PersonRecord[];
  readonly enteredIds: readonly number[];
  readonly target: number;
  readonly attempt: number;
  readonly problems: readonly CohortProblem[];
  readonly nameRedraws: number;
  /** Slots dropped because every name redraw collided (reported, never silently kept). */
  readonly droppedSlots: readonly number[];
  readonly emits: readonly CohortEmitInput[];
}

export function runCohort(run: CohortRun): CohortResult {
  const target = cohortTarget(run.kind, run.world).size;
  const existing = run.existingIds ?? [];
  const nNew = Math.max(0, (run.sizeOverride ?? target) - existing.length);
  let nameRedraws = 0;
  let dropped: number[] = [];
  const build = (attempt: number): PersonRecord[] => {
    nameRedraws = 0;
    dropped = [];
    const out: PersonRecord[] = [];
    for (let slot = 0; slot < nNew; slot++) {
      const s = run.open(STREAM_COHORT, [...attemptScope(run.season, run.kind, attempt), slot]);
      let p = run.makePerson(slot, attempt, s);
      if (run.packNames && run.nameDraw) {
        const g = guardName(p.name.first, p.name.last, run.packNames, run.nameDraw, s);
        nameRedraws += g.redraws;
        if (!g.clear) { dropped.push(slot); continue; }
        if (g.redraws > 0) p = { ...p, name: { ...p.name, first: g.first, last: g.last } };
      }
      out.push(p);
    }
    return out;
  };
  // The size check counts new and returning people together.
  const check = (ps: readonly PersonRecord[]) =>
    validateCohort(ps, Math.max(0, target - existing.length), run.bandTargets).map((pr) =>
      pr.check === 'size' ? { ...pr, size: pr.size + existing.length, target } : pr);
  const v = buildValidatedCohort(build, check);
  const enteredIds = [...existing, ...v.people.map((p) => p.id)];
  const count = enteredIds.length;
  const byLevel = countByLevel(run.kind, enteredIds, run.levelOfId);
  const source = run.source ?? 'sim';
  const emits: CohortEmitInput[] = [{
    type: COHORT_ENTERED, date: run.date, witnesses: { kind: 'public' }, tier: 3, source,
    payload: {
      kind: run.kind, season: run.season, count,
      count_college: byLevel.college, count_pro: byLevel.pro,
    },
  }];
  if (v.warning) {
    emits.push({
      type: COHORT_VALIDATION_WARNING, date: run.date, witnesses: { kind: 'none' }, tier: 3, source,
      payload: { kind: run.kind, season: run.season, attempts: v.attempt + 1, failing_checks: [...new Set(v.problems.map((p) => p.check))].join(',') },
    });
  }
  return { people: v.people, enteredIds, target, attempt: v.attempt, problems: v.problems, nameRedraws, droppedSlots: dropped, emits };
}

/**
 * X11.1.1 `undrafted_pool`: the pool members not drafted, formed on the day the draft ends. Nobody is
 * generated. Returns the ids and the `cohort_entered` row.
 */
export function formUndraftedPool(poolIds: readonly number[], draftedIds: readonly number[], season: number, date: WorldDate, source: 'sim' | 'history_run' = 'sim'): { ids: number[]; emit: CohortEmitInput } {
  const drafted = new Set(draftedIds);
  const ids = poolIds.filter((id) => !drafted.has(id));
  return {
    ids,
    emit: {
      type: COHORT_ENTERED, date, witnesses: { kind: 'public' }, tier: 3, source,
      payload: { kind: 'undrafted_pool', season, count: ids.length, count_college: 0, count_pro: ids.length },
    },
  };
}
