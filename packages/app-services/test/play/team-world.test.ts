// The generated world laid out as save tables for the team screens (handoff item 2c): the seat's roster and
// player cards come from the world through the observer filter (G-27), with limits from the league rules file.
// The world is a trimmed cut of the real content (4 clubs, 4 schools).
import { describe, expect, it } from 'vitest';
import { newgame, people, play } from '../../src/index.ts';
import { readFileSync } from 'node:fs';

function trimmed(clubs: number, schools: number): newgame.AppWorldContent {
  const app = newgame.appWorldContent();
  const c = app.content;
  const keepClubs = c.pro.league.clubs.slice(0, clubs);
  const clubIds = new Set(keepClubs.map((x) => x.id));
  const conf = c.college.conferences[0]!;
  const schoolIds = new Set(conf.memberIds.slice(0, schools));
  return {
    ...app,
    content: {
      ...c,
      pro: { league: { ...c.pro.league, clubs: keepClubs }, stadiums: c.pro.stadiums.filter((s) => clubIds.has(s.clubId)), rivalries: c.pro.rivalries.filter((r) => clubIds.has(r.a) && clubIds.has(r.b)) },
      college: {
        ...c.college, conferences: [{ ...conf, memberIds: [...schoolIds] }], independents: [],
        schools: c.college.schools.filter((s) => schoolIds.has(s.id)), rivalries: c.college.rivalries.filter((r) => schoolIds.has(r.a) && schoolIds.has(r.b)),
      },
      collegeLevelsBySize: { full: ['college_top'], standard: ['college_top'], small: ['college_top'] },
    },
  };
}

const CONTENT = trimmed(4, 4);
// The league rules files, read from disk as the free agency fixture does (a test may not import another package's files).
const leagueFile = (name: string) => JSON.parse(readFileSync(new URL(`../../../rules-data/data/league/${name}`, import.meta.url), 'utf8')) as { values: { key: string; value: unknown }[] };
const proLeagueRules = leagueFile('proleague_2026.json');
const collegeLeagueRules = leagueFile('collegeleague_2026.json');

// One world for the file, with no past played (the layout needs rosters and staff, not history), so the
// test stays fast whatever the history engine costs. The seat is the first club with a full roster.
let once: { world: ReturnType<typeof newgame.runDraft>['built']['world']; teamId: number; coachId: number | null } | null = null;
function started() {
  if (!once) {
    const d = newgame.runDraft({ seedHex: '00000000000a11ce', size: 'small', historySeasons: 0, careerStartYear: 2026 }, 0, { binding: { content: CONTENT } });
    const w = d.built.world;
    const teamId = [...w.rosters].sort((x, y) => x[0] - y[0]).find(([, r]) => r.length > 0)![0];
    once = { world: w, teamId, coachId: null };
  }
  return once;
}

describe('the seat team in the generated world (item 2c)', () => {
  it('lays out the roster, the staff and the team circle, and the observer reads them', () => {
    const s = started();
    const w = s.world;
    const teamId = s.teamId;
    const roster = w.rosters.get(teamId) ?? [];
    expect(roster.length).toBeGreaterThan(0);

    const tables = play.liveWorldTables(w, play.teamCircle(w, teamId));
    const circle = new Set((tables.people as { id: number }[]).map((p) => p.id));
    for (const id of roster) expect(circle.has(id)).toBe(true);
    expect((tables.rosterSlots as unknown[]).length).toBe([...w.rosters.values()].reduce((n, r) => n + r.length, 0));

    const obs = play.seatObserver(w, teamId, s.coachId);
    expect(Object.keys(obs.teamScopes)).toEqual([String(teamId)]);
    expect(obs.teamScopes[String(teamId)]).toContain('team');

    const view = people.buildRosterTable(play.seatObservedWorld(w, teamId, s.coachId), teamId, { limits: play.rosterLimits(proLeagueRules, 'pro') });
    expect(view.rows.map((r) => r.personId).sort((a, b) => a - b)).toEqual([...roster].sort((a, b) => a - b));
    // Generated people have names and positions; nobody shows as a bare id.
    expect(view.rows.every((r) => !r.name.startsWith('#') && r.position !== '')).toBe(true);
    expect(view.limits[0]).toEqual({ list: play.WORLD_ROSTER_LIST, limit: 53, count: roster.length, over: roster.length > 53 });
  });

  it('opens a player card with no true rating in it (MA-48)', () => {
    const s = started();
    const teamId = s.teamId;
    const id = s.world.rosters.get(teamId)![0]!;
    const card = people.buildPlayerCard(play.seatObservedWorld(s.world, teamId, s.coachId), teamId, id, {}, { coachId: s.coachId });
    expect(card?.personId).toBe(id);
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/"attributes"|"ceilings"|"hidden"/);
  });

  it('reads list limits from the league rules files (C5.1.1)', () => {
    // roster.active_inactive_limit F-league-0005, roster.practice_squad_size F-league-0027, league.roster_limit F-college-0001.
    expect(play.rosterLimits(proLeagueRules, 'pro')).toEqual({ active: 53, practice_squad: 16 });
    expect(play.rosterLimits(collegeLeagueRules, 'college')).toEqual({ active: 105 });
    expect(play.rosterLimits(undefined, 'pro')).toEqual({ active: null, practice_squad: null });
  });
});

describe('the seat team cap sheet from the world contracts', () => {
  const NONE = { skill: false, cap: false, injury: false };
  it('is null while the world keeps no player contracts', () => {
    const s = started();
    const proIds = new Set(s.world.teams.filter((t) => t.ownerPersonId !== null).map((t) => t.id)); // pro clubs have owners
    const club = [...s.world.rosters.keys()].find((t) => proIds.has(t))!;
    if (!s.world.systemState.has('player_contracts')) expect(play.seatCapView(s.world, club, proLeagueRules, 'pro')).toBeNull();
  });
  it('lists the club contracts and the room is the cap less team salary', () => {
    const s = started();
    const w = s.world;
    const proIds = new Set(s.world.teams.filter((t) => t.ownerPersonId !== null).map((t) => t.id)); // pro clubs have owners
    const club = [...w.rosters.keys()].sort((a, b) => a - b).find((t) => proIds.has(t) && (w.rosters.get(t) ?? []).length > 0)!;
    const personId = w.rosters.get(club)![0]!;
    const y = w.date.seasonYear;
    const year = (leagueYear: number, cents: number) => ({ leagueYear, baseSalary: { amountCents: cents, guarantee: NONE }, optionBonus: null, rosterBonuses: [], workoutBonusCents: 0, incentives: [], voidable: false, option: 'none' });
    const contract = {
      id: 1, personId, teamId: club, signed: w.date, agentId: null, state: 'active', summaryKey: null,
      terms: { kind: 'player', form: 'veteran', signingBonusCents: 0, signingBonusPaidOn: w.date, years: [year(y, 5_000_000_00), year(y + 1, 6_000_000_00)], offset: false, noTrade: false },
    };
    const before = w.systemState.get('player_contracts');
    w.systemState.set('player_contracts', { nextId: 2, active: [contract], paidYears: [], periodRoster: {}, checkedPeriods: [], floorChecks: [] });
    try {
      const view = play.seatCapView(w, club, proLeagueRules, 'pro')!;
      expect(view.rows.map((r) => r.personId)).toEqual([personId]);
      expect(view.rows[0]!.byYear.slice(0, 2).map((b) => b.chargeCents)).toEqual([5_000_000_00, 6_000_000_00]);
      expect(view.roomCents).toBe(view.capCents - view.teamSalaryCents);
      expect(view.rows[0]!.name.startsWith('#')).toBe(false);
      expect(play.seatCapView(w, s.teamId === club ? club + 1 : s.teamId, proLeagueRules, 'college')).toBeNull();
    } finally {
      if (before === undefined) w.systemState.delete('player_contracts'); else w.systemState.set('player_contracts', before);
    }
  });
});

describe('the seat team delegation table', () => {
  it('gives every delegable task a row, staff from the club chart, and saves a preset into the world', () => {
    const s = started();
    const w = s.world;
    const proIds = new Set(w.teams.filter((t) => t.ownerPersonId !== null).map((t) => t.id));
    const club = [...proIds].sort((a, b) => a - b).find((t) => play.seatDelegationInputs(w, t, 'pro', null) !== null);
    expect(club).toBeDefined();
    const i = play.seatDelegationInputs(w, club!, 'pro', null)!;
    const holders = new Set([...w.jobs.values()].filter((j) => j.teamId === club && j.holderPersonId !== null && j.holderPersonId !== i.headCoachId).map((j) => j.holderPersonId));
    expect(new Set(i.staff.map((m) => m.personId))).toEqual(holders);
    expect(i.budgetHours).toBe(168 - 7 * 7.5);
    const before = play.seatDelegation(w, club!, 'pro', null)!;
    expect(before.rows.length).toBe(i.tasks.length);
    try {
      play.saveSeatDelegation(w, club!, 'pro', null, { preset: 'do_everything' });
      const after = play.seatDelegation(w, club!, 'pro', null)!;
      expect(after.rows.every((r) => r.holderId === null)).toBe(true);
    } finally {
      w.systemState.delete(play.DELEGATION_KEY);
    }
  });
});
