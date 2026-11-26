// The scouting read models through the observer filter (G-27): they register (no truth or unclassed
// field), build for the club's own seats only, and pass the Q1.4.2 crawler for every seat.
import { describe, expect, it } from 'vitest';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { SCOUTING_MODELS, scoutingPersonnelSpec, scoutingTableSpec, type PersonnelReportView, type ScoutingSources, type ScoutingView } from '../../../src/read-models/scouting/index.ts';
import { ScoutingPersonnelData, ScoutingTableData } from '@gm/schema';
import { USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { AWAY, HOME, SEASON, awayCharted, homeLog, store, tables } from './fixture.ts';

const sources: ScoutingSources = {
  tendencies: (clubId, teamId) => (clubId !== HOME ? null
    : teamId === HOME ? { plays: homeLog(), season: SEASON }
      : teamId === AWAY ? { plays: awayCharted(), season: SEASON, taggerLine: 'your quality control coach' } : null),
  estimates: store(),
  usage: (clubId, teamId, personId) => (clubId === HOME && teamId === AWAY && personId === 107 ? { snaps: 120, alignments: { left_tackle: 120 } } : null),
};
const registryFor = () => new ReadModelRegistry().register(scoutingTableSpec(ScoutingTableData, sources)).register(scoutingPersonnelSpec(ScoutingPersonnelData, sources));

describe('scouting read models (P1.3.2, Q1.4.2)', () => {
  it('registers: every field is classed and none is truth', () => {
    expect(registryFor().names().sort()).toEqual([SCOUTING_MODELS.personnel, SCOUTING_MODELS.table].sort());
  });
  it('builds self-scout and the opponent table for the club', () => {
    const world = tablesOf(tables());
    const obs = observerFor(world, USER);
    const s = buildReadModel<ScoutingView | null>(registryFor(), world, obs, SCOUTING_MODELS.table, { clubId: HOME, subject: 'self' }).model.data!;
    expect(s.windowLabel).toBe('last 3 games');
    expect(s.windowGames).toBe(3);
    const o = buildReadModel<ScoutingView | null>(registryFor(), world, obs, SCOUTING_MODELS.table, { clubId: HOME, subject: 'opponent', teamId: AWAY, window: 'career', cuts: 'formation,down' }).model.data!;
    expect(o.cuts).toEqual(['formation', 'down']);
    expect(o.taggerLine).toBe('your quality control coach');
    const d = buildReadModel<ScoutingView | null>(registryFor(), world, obs, SCOUTING_MODELS.table, { clubId: HOME, subject: 'self', side: 'defense' }).model.data!;
    expect(d.measure).toBe('pressure');
  });
  it('builds the personnel report with usage', () => {
    const world = tablesOf(tables());
    const r = buildReadModel<PersonnelReportView | null>(registryFor(), world, observerFor(world, USER), SCOUTING_MODELS.personnel, { clubId: HOME, teamId: AWAY, scaleId: 'twenty_eighty' }).model.data!;
    expect(r.scaleId).toBe('twenty_eighty');
    expect(r.cards.find((c) => c.personId === 107)!.usage).toEqual({ snaps: 120, alignments: { left_tackle: 120 } });
    expect(r.summary.weakestPassProtector).toBe(108);
  });
  it('a club the observer does not work for, or a bad subject, builds an empty model', () => {
    const world = tablesOf(tables());
    const away = observerFor(world, AWAY_COACH);
    expect(buildReadModel(registryFor(), world, away, SCOUTING_MODELS.table, { clubId: HOME, subject: 'self' }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, away, SCOUTING_MODELS.personnel, { clubId: HOME, teamId: AWAY }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, PUBLIC_OBSERVER, SCOUTING_MODELS.table, { clubId: HOME, subject: 'opponent', teamId: AWAY }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, observerFor(world, USER), SCOUTING_MODELS.table, { clubId: HOME, subject: 'opponent', teamId: HOME }).model.data).toBeNull();
    expect(buildReadModel(registryFor(), world, observerFor(world, USER), SCOUTING_MODELS.table, { clubId: HOME, subject: 'nobody' }).model.data).toBeNull();
  });
  it('passes the crawler for every seat', () => {
    const world = tablesOf(tables());
    const observers = [USER, ASSISTANT, AWAY_COACH].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({
      registry: registryFor, source: world, observers,
      params: (name) => (name === SCOUTING_MODELS.table
        ? [{ clubId: HOME, subject: 'self' }, { clubId: HOME, subject: 'opponent', teamId: AWAY }, { clubId: AWAY, subject: 'self' }]
        : [{ clubId: HOME, teamId: AWAY }, { clubId: HOME, teamId: HOME }, { clubId: AWAY, teamId: HOME }]),
    });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
