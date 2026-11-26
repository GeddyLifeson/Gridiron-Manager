// The generated world laid out as save tables for the team screens (handoff item 2c): the seat's roster and
// player cards come from the world through the observer filter (G-27), with limits from the league rules file.
// The world is a trimmed cut of the real content (4 clubs, 4 schools) so the real history runs in seconds.
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

// One world and career for the file: the history is the slow part.
let once: Promise<Extract<newgame.StartResult, { ok: true }>> | null = null;
function started() {
  return (once ??= (async () => {
    const client = newgame.inlineClient({ binding: { content: CONTENT } });
    await client.run({ seedHex: '00000000000a11ce', size: 'small', historySeasons: 3, careerStartYear: 2026 }, 0, () => {});
    // A coordinator start at a pro club, as the picker gives when the user takes a club (E1.6.2).
    const club = (await client.coachOptions()).teams.find((t) => t.level === 'pro')!;
    const choices = { ...newgame.coachCards.fromPreset('young_offensive_play_caller', 7, club.id, false), name: { first: 'Pat', last: 'Doe' } };
    const s = await client.start(choices, 'team-world');
    if (!s.ok) throw new Error(`career did not start: ${JSON.stringify(s.problems)}`);
    return s;
  })());
}

describe('the seat team in the generated world (item 2c)', () => {
  it('lays out the roster, the staff and the team circle, and the observer reads them', async () => {
    const s = await started();
    const w = s.world;
    const teamId = s.start.seatTeamId!;
    const roster = w.rosters.get(teamId) ?? [];
    expect(roster.length).toBeGreaterThan(0);

    const tables = play.liveWorldTables(w, play.teamCircle(w, teamId));
    const circle = new Set((tables.people as { id: number }[]).map((p) => p.id));
    for (const id of roster) expect(circle.has(id)).toBe(true);
    expect((tables.rosterSlots as unknown[]).length).toBe([...w.rosters.values()].reduce((n, r) => n + r.length, 0));

    const obs = play.seatObserver(w, teamId, s.start.coach.personId);
    expect(Object.keys(obs.teamScopes)).toEqual([String(teamId)]);
    expect(obs.teamScopes[String(teamId)]).toContain('team');

    const view = people.buildRosterTable(play.seatObservedWorld(w, teamId, s.start.coach.personId), teamId, { limits: play.rosterLimits(proLeagueRules, 'pro') });
    expect(view.rows.map((r) => r.personId).sort((a, b) => a - b)).toEqual([...roster].sort((a, b) => a - b));
    // Generated people have names and positions; nobody shows as a bare id.
    expect(view.rows.every((r) => !r.name.startsWith('#') && r.position !== '')).toBe(true);
    expect(view.limits[0]).toEqual({ list: play.WORLD_ROSTER_LIST, limit: 53, count: roster.length, over: roster.length > 53 });
    expect(s.start.level).toBe('pro');
  }, 120_000);

  it('opens a player card with no true rating in it (MA-48)', async () => {
    const s = await started();
    const teamId = s.start.seatTeamId!;
    const id = s.world.rosters.get(teamId)![0]!;
    const card = people.buildPlayerCard(play.seatObservedWorld(s.world, teamId, s.start.coach.personId), teamId, id, {}, { coachId: s.start.coach.personId });
    expect(card?.personId).toBe(id);
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/"attributes"|"ceilings"|"hidden"/);
  }, 120_000);

  it('reads list limits from the league rules files (C5.1.1)', () => {
    // roster.active_inactive_limit F-league-0005, roster.practice_squad_size F-league-0027, league.roster_limit F-college-0001.
    expect(play.rosterLimits(proLeagueRules, 'pro')).toEqual({ active: 53, practice_squad: 16 });
    expect(play.rosterLimits(collegeLeagueRules, 'college')).toEqual({ active: 105 });
    expect(play.rosterLimits(undefined, 'pro')).toEqual({ active: null, practice_squad: null });
  });
});
