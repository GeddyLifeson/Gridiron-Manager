// The install board read model through the observer filter (G-27): it registers (no truth or unclassed
// field), builds for the club's seat, and passes the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { installSpec, INSTALL_MODEL, type InstallSource, type InstallView } from '../../../src/read-models/install/index.ts';
import { fixtureTables, HOME, AWAY, USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { InstallData } from '@gm/schema';
import { input } from './fixture.ts';

const source: InstallSource = (teamId, side) => (teamId === HOME && side === 'offense' ? input() : null);
const registryFor = () => new ReadModelRegistry().register(installSpec(InstallData, source));

describe('install read model (P1.3.2, Q1.4.2)', () => {
  it('registers: every field is classed and none is truth', () => {
    expect(registryFor().names()).toEqual([INSTALL_MODEL]);
  });
  it('builds for the club with flat parameters; camp mode is a parameter', () => {
    const world = tablesOf(fixtureTables());
    const v = buildReadModel<InstallView | null>(registryFor(), world, observerFor(world, USER), INSTALL_MODEL, { teamId: HOME, side: 'offense', mode: 'camp' }).model.data!;
    expect(v.mode).toBe('camp');
    expect(v.days).toHaveLength(3);
  });
  it('another club or an unknown side builds an empty model', () => {
    const world = tablesOf(fixtureTables());
    expect(buildReadModel(registryFor(), world, observerFor(world, AWAY_COACH), INSTALL_MODEL, { teamId: AWAY, side: 'offense' }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, observerFor(world, USER), INSTALL_MODEL, { teamId: HOME, side: 'kickoff' }).model.data).toBeNull();
  });
  it('passes the crawler for every seat', () => {
    const world = tablesOf(fixtureTables());
    const observers = [USER, ASSISTANT, AWAY_COACH].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry: registryFor, source: world, observers, params: () => [{ teamId: HOME, side: 'offense' }, { teamId: AWAY, side: 'offense' }] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
