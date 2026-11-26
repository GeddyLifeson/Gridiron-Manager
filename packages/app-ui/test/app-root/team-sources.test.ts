// Team hub sources (handoff item 2c): the roster and player card routes are bound from the seat's world,
// and a quick start (no world) leaves the team screens to the shell's placeholders.
import { describe, expect, it } from 'vitest';
import type { CareerPort, SeatWorld } from '../../src/app-root/index.ts';
import { teamSources } from '../../src/app-root/sources/team.ts';
import { buildRoutes } from '../../src/routes.ts';

const date = { seasonYear: 2026, dayIndex: 10 };
const person = (id: number, first: string, last: string, position: string) => ({
  id, origin: 'generated', externalRef: null, name: { first, last, suffix: null, nickname: null }, birthDate: { seasonYear: 2000, dayIndex: 100 },
  roles: ['player'], playing: { position, lastJersey: null, heightIn: 74, weightLb: 220, attributes: { hands: 30 } },
});
const job = (id: number, teamId: number, rung: number, holder: number) => ({
  id, teamId, catalogueId: 'x', positionId: 'x', rung, side: 'none', positionGroup: 'none', dutyIds: [], callsPlays: false, recruitsOffCampus: false,
  gamedaySeat: 'none', paid: 'salary', termLimitYears: null, reportsToJobId: null, holderPersonId: holder, namedDeputyPersonId: null, holderSince: date, vacantSince: null, holding: 'permanent',
});

/** A two-team stub world: enough of LiveWorld for the observer layout (teams, jobs, people, rosters). */
function stubWorld() {
  return {
    date, competitions: [], conferences: [], venues: [], cultures: new Map(),
    teams: [{ id: 1, identity: { name: 'Harbor City Gulls', abbreviation: 'HCG' } }, { id: 2, identity: { name: 'Lake Port Owls', abbreviation: 'LPO' } }],
    jobs: new Map([[1, job(1, 1, 9, 900)], [2, job(2, 2, 9, 901)]]),
    people: new Map([[101, person(101, 'Ray', 'Stone', 'QB')], [102, person(102, 'Lou', 'Park', 'WR')], [201, person(201, 'Al', 'Fern', 'QB')], [900, person(900, 'Pat', 'Doe', 'QB')]]),
    rosters: new Map([[1, [101, 102]], [2, [201]]]),
    userPersonId: null,
  };
}

const port = (seat: SeatWorld | null): CareerPort => ({
  today: () => { throw new Error('unused'); }, advanceToGameDay: () => {}, startGame: () => { throw new Error('unused'); }, finishGame: () => {},
  delegateGame: () => {}, liveField: () => null, names: () => ({ playerName: String, teamName: String }),
  ...(seat ? { seatWorld: () => seat } : {}),
});

describe('team hub sources (item 2c)', () => {
  it('a quick start has no world, so no team route is bound', () => {
    expect(teamSources(port(null))).toEqual({});
    expect(buildRoutes(teamSources(port(null)))['team.roster']).toBeUndefined();
  });

  it('binds the roster and player card from the seat team only, with limits from the rules file', () => {
    const seat: SeatWorld = {
      world: stubWorld() as never, teamId: 1, userPersonId: 900, level: 'pro',
      leagueRules: { values: [{ key: 'roster.active_inactive_limit', value: 53, factId: 'F-league-0005' }, { key: 'roster.practice_squad_size', value: 16, factId: 'F-league-0027' }] },
    };
    const p = port(seat);
    const s = teamSources(p);
    expect(teamSources(p)).toBe(s); // made once per career
    const routes = buildRoutes(s);
    expect(routes['team.roster']).toBeDefined();
    expect(routes['team.player']).toBeDefined();
    const roster = s.people!.roster()!;
    expect(roster.rows.map((r) => [r.personId, r.name, r.position])).toEqual([[101, 'Ray Stone', 'QB'], [102, 'Lou Park', 'WR']]);
    expect(roster.limits).toEqual([{ list: 'active', limit: 53, count: 2, over: false }, { list: 'practice_squad', limit: 16, count: 0, over: false }]);
    const card = s.people!.card(101)!;
    expect(card.personId).toBe(101);
    expect(JSON.stringify(card)).not.toContain('"attributes"');
    expect(s.people!.name!(102)).toBe('Lou Park');
  });
});
