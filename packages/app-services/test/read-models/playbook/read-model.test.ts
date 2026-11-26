// The playbook read model through the observer filter (G-27): it registers (no truth or unclassed field),
// builds for the club's seat, and passes the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { playbookSpec, PLAYBOOK_MODEL, type PlaybookSource, type PlaybookView } from '../../../src/read-models/playbook/index.ts';
import { fixtureTables, HOME, AWAY, USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { PlaybookData } from '@gm/schema';
import { starter } from './fixture.ts';

const s = starter();
const source: PlaybookSource = (teamId, side) => (teamId === HOME && side === 'offense' ? s : null);
const registryFor = () => new ReadModelRegistry().register(playbookSpec(PlaybookData, source));

describe('playbook read model (P1.3.2, Q1.4.2)', () => {
  it('registers: every field is classed and none is truth', () => {
    expect(registryFor().names()).toEqual([PLAYBOOK_MODEL]);
  });
  it('builds for the club with flat filter parameters', () => {
    const world = tablesOf(fixtureTables());
    const opt = buildReadModel<PlaybookView | null>(registryFor(), world, observerFor(world, USER), PLAYBOOK_MODEL, { teamId: HOME, side: 'offense' }).model.data!.options.formation[0]!;
    const formation = opt.id;
    const v = buildReadModel<PlaybookView | null>(registryFor(), world, observerFor(world, USER), PLAYBOOK_MODEL, { teamId: HOME, side: 'offense', formation }).model.data!;
    expect(v.filter).toEqual({ formation });
    expect(v.rows.length).toBeGreaterThan(0);
    expect(v.rows.every((r) => r.formation === opt.word)).toBe(true);
  });
  it('another club or an unknown side builds an empty model', () => {
    const world = tablesOf(fixtureTables());
    expect(buildReadModel(registryFor(), world, observerFor(world, AWAY_COACH), PLAYBOOK_MODEL, { teamId: AWAY, side: 'offense' }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, observerFor(world, USER), PLAYBOOK_MODEL, { teamId: HOME, side: 'kickoff' }).model.data).toBeNull();
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
