// Assembling the live world from the generation steps (X10.2), with its history log.
import { seedFromHex, seedToHex, type WorldSeed } from '@gm/engine-core';
import { history } from '@gm/league';
import { cohorts } from '@gm/people';
import type { EventTypeDef } from '@gm/schema';
import type { PersonNameSource, WorldContent } from '../generation/content.ts';
import { foundPeople, foundingProblems } from '../generation/founding.ts';
import { param as gparam } from '../generation/params.ts';
import { setupHashHex, type SetupRecord } from '../generation/setup.ts';
import { buildStructures, structureProblems } from '../generation/structures.ts';
import { WORLD_FOUNDED, worldEventTypes } from './events.ts';
import { planTeamSpans, type FoundingCurve } from './lifecycle.ts';
import type { LiveWorld } from './types.ts';

export interface CreateWorldInput {
  readonly setup: SetupRecord;
  readonly content: WorldContent;
  readonly names: PersonNameSource;
  /** Event type files of every bound system (X2.1.2). This module's own types are added. */
  readonly eventTypes?: readonly EventTypeDef[];
  /** X10.3.2: 0 for the first try, 1 for the one redo with seed plus 1. */
  readonly seedStep?: number;
  readonly labelIds?: ReadonlySet<string>;
  readonly notabilityOf?: history.EventLogOptions['notabilityOf'];
  /**
   * Founding curves by competition (lifecycle.ts `curveKey`). With none, every team exists from the
   * first season, as before. With curves, a team is founded in its own year and only teams that exist
   * in the first season are founded on day one.
   */
  readonly foundingCurves?: Readonly<Record<string, FoundingCurve>>;
}

/** Seed plus `step` as a 64-bit value (X10.3.2 "derived seed (seed plus 1)"). */
export function steppedSeed(seedHex: string, step: number): WorldSeed {
  const mask = (1n << 64n) - 1n;
  return seedFromHex(((BigInt(`0x${seedHex}`) + BigInt(step)) & mask).toString(16).padStart(16, '0'));
}

/** Build the world for its first season: structures, founding people and cultures, an empty past (X10.2). */
export function createWorld(input: CreateWorldInput): LiveWorld {
  const { setup, content } = input;
  const seedStep = input.seedStep ?? 0;
  const seed = steppedSeed(setup.seedHex, seedStep * gparam('validate.redoSeedStep'));
  const built = buildStructures(setup, seed, content);
  const sProblems = structureProblems(built);
  if (sProblems.length > 0) throw new Error(`world structures are incomplete: ${sProblems.slice(0, 5).join('; ')}`);
  const careerStartYear = setup.firstSeasonYear + setup.historySeasons;
  const teamSpans = planTeamSpans(seed, built.teams, built.competitions, input.foundingCurves ?? {}, setup.firstSeasonYear, careerStartYear);
  const dayOne = new Set([...teamSpans.values()].filter((s) => s.founded <= setup.firstSeasonYear).map((s) => s.teamId));
  const fOpts = { teamIds: dayOne };
  const founding = foundPeople(setup, seed, content, built, input.names, fOpts);
  const fProblems = foundingProblems(setup, content, built, founding, fOpts);
  if (fProblems.length > 0) throw new Error(`founding people are not legal on day one: ${fProblems.slice(0, 5).join('; ')}`);

  // The cohort step emits G-44's types, so they are added here when the caller's registry lacks them.
  const base = input.eventTypes ?? [];
  const baseIds = new Set(base.map((t) => t.id));
  const given = [...base, ...cohorts.COHORT_EVENT_TYPES.filter((t) => !baseIds.has(t.id))];
  const reg = history.buildTypeRegistry([...given, ...worldEventTypes(given.map((t) => t.id))]);
  if (!reg.ok) throw new Error(`event types refused: ${reg.problems.join('; ')}`);
  const people = new Map(founding.people.map((p) => [p.id, p]));
  const logOptions: history.EventLogOptions = {
    registry: reg.registry, originOf: (id) => people.get(id)?.origin, labelIds: input.labelIds, notabilityOf: input.notabilityOf,
  };
  const world: LiveWorld = {
    setup, seed, seedStep,
    date: { seasonYear: setup.firstSeasonYear, dayIndex: 0 }, week: 0, dayInWeek: 0,
    competitions: built.competitions, conferences: built.conferences, places: built.places, venues: built.venues, teams: built.teams, teamSpans,
    placeOfTeam: new Map(built.placeOfTeam),
    people, status: new Map(founding.people.map((p) => [p.id, 'active' as const])), outOfFootballSince: new Map(),
    jobs: new Map(founding.jobs.map((j) => [j.id, j])), rosters: founding.rosters,
    cultures: new Map(founding.cultures.map((c) => [c.teamId, c])), staffContractEndYear: founding.staffContractEndYear,
    tiers: new Map(), pendingTiers: new Map(), pools: new Map(),
    log: new history.EventLog(logOptions), logOptions,
    nextIds: { ...built.nextIds, person: founding.nextIds.person, job: founding.nextIds.job, game: 1 },
    results: [], seasons: [], staffSeasons: [], rosterSeasons: new Map(),
    passHash: history.chainHash(history.EMPTY_SEASON_HASH, { seed: seedToHex(seed), setup: setupHashHex(setup), content: content.contentVersion }),
    passes: 0, userPersonId: null,
  };
  const r = world.log.emit({
    type: WORLD_FOUNDED, date: world.date, witnesses: { kind: 'public' }, tier: 3, source: setup.historySeasons > 0 ? 'history_run' : 'sim',
    payload: { teams: world.teams.length, people: world.people.size, setup_hash: setupHashHex(setup) },
  });
  if (!r.ok) throw new Error(`world_founded refused: ${r.reason}`);
  return world;
}
