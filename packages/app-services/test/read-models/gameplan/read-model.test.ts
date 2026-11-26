// The gameplan read model through the observer filter (G-27): it registers (no truth or unclassed field),
// builds for the club's seat with flat view parameters, and passes the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { gameplanSpec, GAMEPLAN_MODEL, type GameplanView } from '../../../src/read-models/gameplan/index.ts';
import { fixtureTables, HOME, AWAY, USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { GameplanData } from './data-schema.ts';
import { sourceFor, state, TEAM } from './fixture.ts';

const inner = sourceFor(state());
const source: Parameters<typeof gameplanSpec>[1] = (teamId, unit) => (teamId === HOME ? inner(TEAM, unit) : null);
const registryFor = () => new ReadModelRegistry().register(gameplanSpec(GameplanData, source));

describe('gameplan read model (P1.3.2, Q1.4.2)', () => {
  it('registers: every field is classed and none is truth', () => {
    expect(registryFor().names()).toEqual([GAMEPLAN_MODEL]);
  });
  it('builds for the club with flat view parameters', () => {
    const world = tablesOf(fixtureTables());
    const v = buildReadModel<GameplanView | null>(registryFor(), world, observerFor(world, USER), GAMEPLAN_MODEL, { teamId: HOME, unit: 'offense', situation: 'first_10', paper: 'legal', keyHints: false }).model.data!;
    expect(v.plan.selected).toBe('first_10');
    expect(v.print.paper).toBe('legal');
    expect(v.print.keyHints).toBe(false);
  });
  it('another club or an unknown unit builds an empty model', () => {
    const world = tablesOf(fixtureTables());
    expect(buildReadModel(registryFor(), world, observerFor(world, AWAY_COACH), GAMEPLAN_MODEL, { teamId: AWAY, unit: 'offense' }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, observerFor(world, USER), GAMEPLAN_MODEL, { teamId: HOME, unit: 'kickoff' }).model.data).toBeNull();
  });
  it('passes the crawler for every seat', () => {
    const world = tablesOf(fixtureTables());
    const observers = [USER, ASSISTANT, AWAY_COACH].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry: registryFor, source: world, observers, params: () => [{ teamId: HOME, unit: 'offense' }, { teamId: AWAY, unit: 'offense' }] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
