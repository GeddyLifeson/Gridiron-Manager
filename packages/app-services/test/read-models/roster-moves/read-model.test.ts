// The roster moves read model through the observer filter (G-27): it registers (no truth or unclassed
// field), builds from the world tables for every seat, and passes the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import { roster } from '@gm/league';
import {
  ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER, type TableSource,
} from '../../../src/observer/index.ts';
import { rosterMovesSpec, ROSTER_MOVES_MODEL, type RosterMovesView, type RosterWeekSource } from '../../../src/read-models/roster-moves/index.ts';
import { fixtureTables, HOME, AWAY, USER, ASSISTANT, AWAY_COACH, HOME_PLAYERS } from '../../observer/fixture-world.ts';
import { RosterMovesData } from './data-schema.ts';
import { PRO, SIDE, COACH_POWER } from './fixture.ts';

function leagueFor(): roster.LeagueRosters {
  const ok = (r: roster.TxResult) => { if (!r.ok) throw new Error(r.message); return r.state; };
  let s = roster.emptyLeagueRosters(2030, [HOME, AWAY], { dayIndex: 10, hour: 10 });
  const facts = HOME_PLAYERS.map((personId): roster.PlayerFacts => ({
    personId, accruedSeasons: 0, pensionCreditedSeasons: 0, activeGamesInLastAccruedSeason: 0, offensiveLineman: false, quarterback: true,
    practicedThisPreseason: true, internationalPathway: false, injured: false, nonFootballInjury: false, medicallyCleared: true, countExempt: false,
  }));
  s = ok(roster.applyEvent(s, { type: 'set_player_facts', facts }, PRO));
  for (const id of HOME_PLAYERS) s = ok(roster.applyTransaction(s, { type: 'sign_free_agent', clubId: HOME, personId: id }, PRO));
  return s;
}

const state = leagueFor();
const source: RosterWeekSource = (clubId) => (clubId === HOME ? {
  state, rules: PRO, sideSize: SIDE, power: COACH_POWER, working: null,
  week: { kickoff: { dayIndex: 15, hour: 13 }, previousGameDay: 8, tradeDeadlineWeek: false },
} : null);

function tables(): Record<string, unknown[]> {
  const t = fixtureTables();
  t.depthCharts = [{ teamId: HOME, unitId: 'off:base', roles: { qb: [101, 102, 103] }, rotation: [], updated: { seasonYear: 2030, dayIndex: 10 } }];
  return t;
}
const registryFor = () => new ReadModelRegistry().register(rosterMovesSpec(RosterMovesData, source));

describe('roster moves read model (P1.3.2, Q1.4.2)', () => {
  it('registers: every field is classed and none is truth', () => {
    expect(registryFor().names()).toEqual([ROSTER_MOVES_MODEL]);
  });
  it('builds for the head coach from the world tables: names, positions, report designations, depth order', () => {
    const world: TableSource = tablesOf(tables());
    const b = buildReadModel<RosterMovesView | null>(registryFor(), world, observerFor(world, USER), ROSTER_MOVES_MODEL, { clubId: HOME });
    const v = b.model.data!;
    expect(b.inputs).toEqual(['depthCharts', 'injuries', 'people', 'rosterSlots']);
    expect(v.players.map((p) => p.personId)).toEqual(HOME_PLAYERS);
    expect(v.players.find((p) => p.personId === 101)).toMatchObject({ name: 'First101 Last101', position: 'QB', designation: 'questionable', out: false, jobs: ['off:base/qb#1'] });
    expect(v.coverage).toEqual([{ unitId: 'off:base', role: 'qb', starter: 101, backup: 102, emergency: 103, level: 'ok' }]);
    expect(v.active!.limit).toBe(47); // no offensive linemen dressed: the short-line limit (C5.2.1)
  });
  it('a club with no roster week builds an empty model', () => {
    const world = tablesOf(tables());
    expect(buildReadModel(registryFor(), world, observerFor(world, AWAY_COACH), ROSTER_MOVES_MODEL, { clubId: AWAY }).model.data).toBeNull();
  });
  it('passes the crawler for every seat (no planted truth reaches the model)', () => {
    const world = tablesOf(tables());
    const observers = [USER, ASSISTANT, AWAY_COACH, 101].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry: registryFor, source: world, observers, params: () => [{ clubId: HOME }, { clubId: AWAY }] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
