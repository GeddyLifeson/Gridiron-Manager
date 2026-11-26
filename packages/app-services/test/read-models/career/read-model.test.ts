// The coach screen read models through the observer filter (G-27): every field is classed and none is truth
// (registration), each model builds only for the coach himself, its data matches its schema, and the seven
// pass the Q1.4.2 crawler for every seat and the public.
import { describe, expect, it } from 'vitest';
import { CAREER_SCREEN_SCHEMAS, READ_MODELS } from '@gm/schema';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { careerSpecs, CAREER_MODELS } from '../../../src/read-models/career/index.ts';
import { fixtureTables, USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { COACH, sources } from './fixture.ts';

const registryFor = () => {
  const r = new ReadModelRegistry();
  for (const s of careerSpecs(CAREER_SCREEN_SCHEMAS, sources())) r.register(s);
  return r;
};
const NAMES = Object.values(CAREER_MODELS);

describe('coach screen read models (P1.3.2, Q1.4.2)', () => {
  it('registers all seven; every field is classed and none is truth', () => {
    expect(registryFor().names().slice().sort()).toEqual([...NAMES].sort());
  });
  it('the schema registry names each model', () => {
    for (const n of NAMES) expect(READ_MODELS[n]).toBeDefined();
  });
  it('builds for the coach himself and matches each schema', () => {
    expect(COACH).toBe(USER);
    const world = tablesOf(fixtureTables());
    for (const n of NAMES) {
      const m = buildReadModel(registryFor(), world, observerFor(world, USER), n, { personId: COACH }).model;
      expect(m.data, n).not.toBeNull();
      expect(m.key).toBe(`${n}(personId=${COACH})`);
    }
  });
  it('another person or the public gets an empty model, even asking for the coach', () => {
    const world = tablesOf(fixtureTables());
    for (const n of NAMES) {
      expect(buildReadModel(registryFor(), world, observerFor(world, ASSISTANT), n, { personId: COACH }).model.data).toBeNull();
      expect(buildReadModel(registryFor(), world, PUBLIC_OBSERVER, n, { personId: COACH }).model.data).toBeNull();
      expect(buildReadModel(registryFor(), world, observerFor(world, ASSISTANT), n, { personId: ASSISTANT }).model.data).toBeNull();
    }
  });
  it('passes the crawler for every seat', () => {
    const world = tablesOf(fixtureTables());
    const observers = [USER, ASSISTANT, AWAY_COACH].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry: registryFor, source: world, observers, params: () => [{ personId: COACH }, { personId: ASSISTANT }] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
