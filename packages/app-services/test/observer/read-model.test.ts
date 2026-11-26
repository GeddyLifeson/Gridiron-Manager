// Read-model core (P1.3.2, P2.2.1) and the read-model half of Q1.4.2.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { pub, readModelSchemas, type PersonRecord, type PersonView, type TeamRecord } from '@gm/schema';
import {
  ReadModelRegistry, ReadModelHub, ReadModelError, buildReadModel, readModelKey, observerFor, tablesOf, PUBLIC_OBSERVER,
  crawlReadModels, crawlPassed, scanSchemas, showTruthSettings, rankLeaks, kendallTau, findSentinels, markPeople,
  type PermissionResolver, type ReadModelSpec,
} from '../../src/observer/index.ts';
import { fixtureTables, fixtureWorld, HOME, AWAY, USER, ASSISTANT, AWAY_COACH, HOME_PLAYERS, HOME_ESTIMATE, TRUE_ARM } from './fixture-world.ts';
import { honestRegistry, sortLeakRegistry, valueLeakRegistry, rosterCard, RosterCardData, TruthInSchema, NoClassInSchema } from './models.ts';

const world = fixtureWorld();
const user = observerFor(world, USER);

describe('registration (P1.1.4 acceptance 1, Q1.4.2 acceptance)', () => {
  it('a read model whose shape holds a true rating cannot be registered', () => {
    const bad: ReadModelSpec = { name: 'personCard', data: TruthInSchema, build: () => ({ data: {} }) };
    expect(() => new ReadModelRegistry().register(bad)).toThrow(/class truth in a read model/);
    expect(scanSchemas({ personCard: TruthInSchema })).toEqual([{ schema: 'personCard', path: '$.trueArm', problem: 'truth' }]);
  });
  it('a field with no visibility class is refused too', () => {
    expect(() => new ReadModelRegistry().register({ name: 'noClass', data: NoClassInSchema, build: () => ({ data: {} }) })).toThrow(/no visibility class/);
  });
  it('names are unique', () => {
    expect(() => honestRegistry().register(rosterCard)).toThrow(/registered twice/);
  });
  it('the read models already in the schema registry pass the scan', () => {
    expect(scanSchemas(readModelSchemas())).toEqual([]);
  });
});

describe('building (P1.3.2)', () => {
  const reg = honestRegistry();
  it('fills key, permission, data and meta, and reports the tables it read', () => {
    const b = buildReadModel<z.infer<typeof RosterCardData>>(reg, world, user, 'rosterCard', { teamId: HOME });
    expect(b.model.key).toBe('rosterCard(teamId=3)');
    expect(b.model.permission).toBe('Read');
    expect(b.model.data.players.map((p) => p.personId)).toEqual([...HOME_PLAYERS].sort((a, b2) => HOME_ESTIMATE[b2]! - HOME_ESTIMATE[a]!));
    expect(b.model.meta['players.armEstimate']).toEqual({ sampleSize: 6, source: 'staff', unit: 'iss' });
    expect(b.inputs).toEqual(['people', 'personViews', 'rosterSlots']);
    expect(readModelKey('x', { b: 'q', a: 1 })).toBe('x(a=1,b="q")');
  });
  it('another seat gets its own view of the same model: the other staff\'s estimates never appear', () => {
    const b = buildReadModel<z.infer<typeof RosterCardData>>(reg, world, observerFor(world, AWAY_COACH), 'rosterCard', { teamId: HOME });
    expect(b.model.data.players.find((p) => p.personId === 101)!.armEstimate).toBe(100 - HOME_ESTIMATE[101]!);
    const fan = buildReadModel<z.infer<typeof RosterCardData>>(reg, world, PUBLIC_OBSERVER, 'rosterCard', { teamId: HOME });
    expect(fan.model.data.players.every((p) => p.armEstimate === null)).toBe(true);
  });
  it('changing the observer changes permission and nothing in the model code (acceptance 3)', () => {
    const resolver: PermissionResolver = (o, tasks) => (tasks.includes('depth_chart.set') && o.personId === USER ? 'Yours' : 'Suggest');
    expect(buildReadModel(reg, world, user, 'rosterCard', { teamId: HOME }, { permission: resolver }).model.permission).toBe('Yours');
    expect(buildReadModel(reg, world, observerFor(world, ASSISTANT), 'rosterCard', { teamId: HOME }, { permission: resolver }).model.permission).toBe('Suggest');
  });
  it('refuses output that is not plain data or that its schema does not name', () => {
    const Loose = z.object({ n: pub(z.number(), 'count') });
    const reg2 = new ReadModelRegistry()
      .register({ name: 'extra', data: Loose, build: () => ({ data: { n: 1, trueArm: 88 } }) })
      .register({ name: 'fn', data: z.object({ n: pub(z.unknown()) }), build: () => ({ data: { n: () => 1 } }) })
      .register({ name: 'cls', data: z.object({ n: pub(z.unknown()) }), build: () => ({ data: { n: new Map() } }) })
      .register({ name: 'wrong', data: Loose, build: () => ({ data: { n: 'one' } }) })
      .register({ name: 'badMeta', data: Loose, build: () => ({ data: { n: 1 }, meta: { n: { secret: 1 } as never } }) });
    expect(() => buildReadModel(reg2, world, user, 'extra')).toThrow(/fields its schema does not name/);
    expect(() => buildReadModel(reg2, world, user, 'fn')).toThrow(/plain data/);
    expect(() => buildReadModel(reg2, world, user, 'cls')).toThrow(/plain data/);
    expect(() => buildReadModel(reg2, world, user, 'wrong')).toThrow(ReadModelError);
    expect(() => buildReadModel(reg2, world, user, 'badMeta')).toThrow(/ValueMeta/);
    expect(() => buildReadModel(reg2, world, user, 'missing')).toThrow(/unknown read model/);
  });
});

describe('hub: subscriptions and versions (P1.3.2, P2.2.1)', () => {
  it('rebuilds only what a change touched and sends only what changed', () => {
    const tables = fixtureTables();
    const hub = new ReadModelHub(honestRegistry(), tablesOf(tables), user);
    const roster = hub.subscribe('rosterCard', { teamId: HOME });
    const inbox = hub.subscribe('inboxList');
    expect(hub.subscribe('rosterCard', { teamId: HOME })).toBe(roster);
    const first = hub.flush();
    expect(first.map((m) => [m.kind, m.body.key, m.body.version])).toEqual([['readModel', inbox, 1], ['readModel', roster, 1]]);
    expect(hub.flush()).toEqual([]);

    // A table neither model reads: nothing is rebuilt.
    hub.touch(['games']);
    expect(hub.flush()).toEqual([]);

    // A touched input whose visible content did not change: rebuilt, not sent. Here a hidden value changed.
    (tables.people as PersonRecord[]).find((p) => p.id === 101)!.playing!.attributes.arm_strength = 1.5;
    hub.touch(['people']);
    expect(hub.flush()).toEqual([]);

    // A visible change: the staff's estimate moves.
    (tables.personViews as PersonView[]).find((v) => v.observerTeamId === HOME && v.personId === 103)!.perAttribute.arm_strength!.estimate = 99;
    hub.touch(['personViews']);
    const next = hub.flush();
    expect(next.map((m) => [m.body.key, m.body.version])).toEqual([[roster, 2]]);
    expect((next[0]!.body.data as z.infer<typeof RosterCardData>).players[0]!.personId).toBe(103);

    hub.unsubscribe(roster);
    hub.touchAll();
    expect(hub.flush()).toEqual([]);
    expect(hub.subscribed()).toEqual([inbox]);
  });
  it('a change of seat rebuilds for the new observer', () => {
    const hub = new ReadModelHub(honestRegistry(), world, user);
    hub.subscribe('inboxList');
    expect((hub.flush()[0]!.body.data as { subjects: string[] }).subjects).toEqual([`inbox.subject.${USER}`]);
    hub.setObserver(observerFor(world, AWAY_COACH));
    expect((hub.flush()[0]!.body.data as { subjects: string[] }).subjects).toEqual([`inbox.subject.${AWAY_COACH}`]);
  });
  it('messages are plain data that survive a structured clone', () => {
    const hub = new ReadModelHub(honestRegistry(), world, user);
    hub.subscribe('rosterCard', { teamId: AWAY });
    const out = hub.flush();
    expect(structuredClone(out)).toEqual(out);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('the crawler (Q1.4.2)', () => {
  const observers = [USER, ASSISTANT, AWAY_COACH, 101].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
  const params = (m: string) => (m === 'rosterCard' ? [{ teamId: HOME }, { teamId: AWAY }] : [{}]);
  it('honest read models pass every check for every seat', () => {
    const r = crawlReadModels({ registry: honestRegistry(), source: world, observers, params });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(r.showTruthSettings).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
    expect(r.built).toBe(observers.length * 3);
    expect(r.markedPeople.length).toBe(10);
    expect(r.sentinels).toBeGreaterThan(50);
  });
  it('a true value copied into a visible number is found by the search and by the paired worlds', () => {
    const r = crawlReadModels({ registry: valueLeakRegistry, source: world, observers: observers.slice(0, 1), params });
    expect(r.sentinelHits.length).toBe(5); // five of the six home players are among the ten marked people
    expect(r.sentinelHits[0]!.sentinel.path).toBe('$.playing.tests.fortyS');
    expect(r.divergences.map((d) => d.fact)).toContain('people:$.playing.tests:truth');
    expect(crawlPassed(r)).toBe(false);
    const marked = markPeople(world, HOME_PLAYERS);
    expect(findSentinels(buildReadModel(valueLeakRegistry(marked.source), marked.source, user, 'rosterCard', { teamId: HOME }).model, marked.sentinels).length).toBe(6);
  });
  it('a list ordered by the true rating fails the paired worlds too', () => {
    const r = crawlReadModels({ registry: sortLeakRegistry, source: world, observers: observers.slice(0, 1), params });
    expect(r.sentinelHits).toEqual([]); // it shows no true value
    expect(r.divergences.map((d) => d.fact)).toContain('people:$.playing.attributes:truth');
  });
  it('a list ordered by the true rating is caught although it shows estimates only (rank edge case)', () => {
    const tables = fixtureTables();
    const src = tablesOf(tables);
    const reg = sortLeakRegistry(src);
    const model = buildReadModel<z.infer<typeof RosterCardData>>(reg, src, user, 'rosterCard', { teamId: HOME }).model;
    const rows = model.data.players.map((p) => ({ truth: TRUE_ARM[p.personId]!, estimate: HOME_ESTIMATE[p.personId]!, columns: { armEstimate: p.armEstimate ?? 0 } }));
    expect(rankLeaks(rows).map((l) => l.column)).toEqual(['$order']);
    const honest = buildReadModel<z.infer<typeof RosterCardData>>(honestRegistry(), src, user, 'rosterCard', { teamId: HOME }).model;
    expect(rankLeaks(honest.data.players.map((p) => ({ truth: TRUE_ARM[p.personId]!, estimate: HOME_ESTIMATE[p.personId]!, columns: { armEstimate: p.armEstimate ?? 0 } })))).toEqual([]);
    expect(kendallTau([1, 2, 3], [3, 2, 1])).toBe(-1);
  });
  it('a show-truth setting fails the crawl; career builds have none', () => {
    const tables = fixtureTables();
    (tables.settings as { key: string }[]).push({ ...(tables.settings![0] as { key: string }), key: 'debug.show_true_ratings' });
    expect(crawlReadModels({ registry: honestRegistry(), source: tablesOf(tables), observers: [], params }).showTruthSettings).toEqual(['debug.show_true_ratings']);
    expect(showTruthSettings([{ key: 'ui.text_size' }, { key: 'game.speed' }, { key: 'dev.revealAttributes' }])).toEqual(['dev.revealAttributes']);
  });
  it('team prestige, a hidden number, cannot be reached from a builder', () => {
    const reg = new ReadModelRegistry().register({
      name: 'teamList', data: z.object({ teams: pub(z.array(z.object({ id: pub(z.number(), 'id'), keys: pub(z.array(z.string())) }))) }),
      build: (w) => ({ data: { teams: w.table('teams').map((t) => ({ id: t.id!, keys: Object.keys(t as TeamRecord).sort() })) } }),
    });
    const data = buildReadModel<{ teams: { keys: string[] }[] }>(reg, world, user, 'teamList').model.data;
    expect(data.teams.every((t) => !t.keys.includes('prestige'))).toBe(true);
  });
});
