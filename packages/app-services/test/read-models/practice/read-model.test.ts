// The practice desk read model through the observer filter (G-27): it registers (no truth or unclassed field),
// builds for the club's seat with flat parameters, answers null for another club, and passes the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { practiceDeskSpec, PRACTICE_DESK_MODEL, type PracticeDeskView } from '../../../src/read-models/practice/index.ts';
import { fixtureTables, HOME, AWAY, USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { PracticeDeskData } from '@gm/schema';
import { contextOf, desk, userPlan } from './fixture.ts';

const d = desk([userPlan('mine')]);
const source: Parameters<typeof practiceDeskSpec>[1] = (teamId) => (teamId === HOME ? contextOf(d) : null);
const registryFor = () => new ReadModelRegistry().register(practiceDeskSpec(PracticeDeskData, source));

describe('practice desk read model (P1.3.2, Q1.4.2)', () => {
  it('registers: every field is classed and none is truth', () => {
    expect(registryFor().names()).toEqual([PRACTICE_DESK_MODEL]);
  });
  it('builds for the club with flat parameters, and the data parses', () => {
    const world = tablesOf(fixtureTables());
    const v = buildReadModel<PracticeDeskView | null>(registryFor(), world, observerFor(world, USER), PRACTICE_DESK_MODEL, { teamId: HOME, season: 2026 }).model.data!;
    expect(v.plans[0]!.practiceId).toBe('mine');
    expect(v.reportSeason).toBe(2026);
    expect(() => PracticeDeskData.parse(v)).not.toThrow();
  });
  it('another club builds an empty model', () => {
    const world = tablesOf(fixtureTables());
    expect(buildReadModel(registryFor(), world, observerFor(world, AWAY_COACH), PRACTICE_DESK_MODEL, { teamId: AWAY }).model.data).toBeNull();
  });
  it('passes the crawler for every seat', () => {
    const world = tablesOf(fixtureTables());
    const observers = [USER, ASSISTANT, AWAY_COACH].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry: registryFor, source: world, observers, params: () => [{ teamId: HOME, season: null }, { teamId: HOME, season: 2026 }, { teamId: AWAY, season: null }] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
