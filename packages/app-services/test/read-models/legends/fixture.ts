// A small generated world for the legends tests: 8 teams in one competition, a full round robin each
// season, a title game, head coach and assistant hires, a few records and awards, and some non-public
// rows. Every row is a valid WorldEvent. Nothing here is a real person or team.
import type { WorldEvent, EventTypeDef } from '@gm/schema';
import type { awards } from '@gm/league';
import type { DayPlace } from '../../../src/read-models/legends/index.ts';

export const COMP = 1;
export const FIRST = 2030;
export const TEAMS = [1, 2, 3, 4, 5, 6, 7, 8];
export const WEEK_DAY0 = 100;
export const POST_DAY = 200;

let nextId = 1;
export function resetIds(): void { nextId = 1; }

export function ev(type: string, seasonYear: number, dayIndex: number, opts: Partial<Pick<WorldEvent, 'actors' | 'subjects' | 'payload' | 'witnesses' | 'causeId' | 'notability' | 'competitionId'>> & { teamId?: number | null; venueId?: number | null; id?: number } = {}): WorldEvent {
  return {
    id: opts.id ?? nextId++, type, when: { date: { seasonYear, dayIndex }, period: null, clockTenths: null },
    competitionId: opts.competitionId === undefined ? COMP : opts.competitionId,
    where: { teamId: opts.teamId ?? null, venueId: opts.venueId ?? null },
    actors: opts.actors ?? [], subjects: opts.subjects ?? [], payload: opts.payload ?? {},
    witnesses: opts.witnesses ?? { kind: 'public' }, causeId: opts.causeId ?? null, notability: opts.notability ?? null, tier: 1, source: 'sim',
  };
}

let nextGame = 1000;
export function game(seasonYear: number, dayIndex: number, home: number, away: number, hs: number, as: number, extra: { notability?: number | null; postseason?: boolean; venueId?: number } = {}): WorldEvent {
  return ev('game_result', seasonYear, dayIndex, {
    teamId: home, venueId: extra.venueId ?? home, subjects: [{ kind: 'game', id: nextGame++ }, { kind: 'team', id: home }, { kind: 'team', id: away }],
    payload: { homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, postseason: extra.postseason ?? false }, notability: extra.notability ?? null,
  });
}

export const calendar = (_c: number | null, _y: number, day: number): DayPlace =>
  day < WEEK_DAY0 ? { section: 'preseason', week: 0 } : day < POST_DAY ? { section: 'week', week: Math.floor((day - WEEK_DAY0) / 7) + 1 } : day < 250 ? { section: 'postseason', week: 0 } : { section: 'offseason', week: 0 };

/** Head coach of team t is person 100 + t in the first world season. */
export const headOf = (t: number) => 100 + t;

export interface FixtureWorld {
  rows: WorldEvent[];
  champions: Map<number, number>;
  headCoachChanges: number[];
  records: number[];
  lines: awards.GameLine[];
}

/** A deterministic 10-season world. Scores come from a fixed integer recurrence (no platform random). */
export function tenSeasons(seasons = 10): FixtureWorld {
  resetIds();
  nextGame = 1000;
  const rows: WorldEvent[] = [];
  const champions = new Map<number, number>();
  const headCoachChanges: number[] = [];
  const records: number[] = [];
  let x = 7;
  const draw = (n: number) => { x = (x * 1103 + 12345) % 65536; return x % n; };
  for (const t of TEAMS) {
    const h = ev('coach_hired', FIRST, 10, { teamId: t, actors: [{ personId: headOf(t), role: 'coach' }], payload: { role: 'head_coach', level: 'pro', side: 'none' }, notability: 40 });
    rows.push(h); headCoachChanges.push(h.id);
    rows.push(ev('coach_hired', FIRST, 11, { teamId: t, actors: [{ personId: 200 + t, role: 'coach' }], payload: { role: 'offensive_coordinator', level: 'pro', side: 'offense' }, notability: 10 }));
  }
  for (let y = FIRST; y < FIRST + seasons; y++) {
    let day = WEEK_DAY0;
    for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) {
      const hs = 10 + draw(30), as = 10 + draw(30);
      rows.push(game(y, day, TEAMS[i]!, TEAMS[j]!, hs, as, { notability: 20 + draw(70) }));
      day = WEEK_DAY0 + ((day - WEEK_DAY0 + 1) % 98);
    }
    const champ = TEAMS[(y - FIRST) % 3]!; // teams 1, 2, 3 rotate: team 1 wins 4 of 10
    const tg = game(y, POST_DAY + 5, champ, TEAMS[7]!, 30, 10, { postseason: true, notability: 90 });
    rows.push(tg);
    const t = ev('title_won', y, POST_DAY + 5, { teamId: champ, subjects: [{ kind: 'team', id: champ }], notability: 95 });
    rows.push(t); champions.set(y, t.id);
    const r = ev('record_set', y, POST_DAY + 6, { teamId: champ, actors: [{ personId: 300 + y - FIRST, role: 'holder' }], subjects: [{ kind: 'record', id: 1 }], payload: { recordId: 'pass_yards_season', value: 5000 + y }, notability: 5 });
    rows.push(r); records.push(r.id);
    rows.push(ev('season_award', y, POST_DAY + 7, { actors: [{ personId: 300 + y - FIRST, role: 'winner' }], payload: { award: 'mvp', place: 1 }, notability: 5 }));
    // A head coach change every third season: team 8 fires and hires.
    if ((y - FIRST) % 3 === 2) {
      const old = y === FIRST + 2 ? headOf(8) : 400 + y - 3;
      const f = ev('coach_fired', y, 260, { teamId: 8, actors: [{ personId: old, role: 'coach' }], payload: { role: 'head_coach' }, notability: 1 });
      const h = ev('coach_hired', y + 1, 5, { teamId: 8, actors: [{ personId: 400 + y, role: 'coach' }], payload: { role: 'head_coach', level: 'pro', side: 'none' }, notability: 1 });
      rows.push(f, h); headCoachChanges.push(f.id);
      if (y + 1 < FIRST + seasons) headCoachChanges.push(h.id);
      else rows.pop();
    }
    // A room-only staff meeting on team 2 and a team-only meeting on team 3 each season.
    rows.push(ev('staff_meeting', y, 120, { teamId: 2, actors: [{ personId: headOf(2), role: 'chair' }], witnesses: { kind: 'room', teamId: 2, roomKey: 'staff' }, notability: 99 }));
    rows.push(ev('team_meeting', y, 121, { teamId: 3, actors: [{ personId: headOf(3), role: 'chair' }], witnesses: { kind: 'team', teamId: 3 }, notability: 99 }));
  }
  const lines: awards.GameLine[] = [];
  return { rows, champions, headCoachChanges, records, lines };
}

const typeDef = (id: string, family: EventTypeDef['family'], witnessRule: EventTypeDef['witnessRule'] = 'public'): EventTypeDef => ({
  id, family, payloadSchema: {}, witnessRule, lineTemplate: `line.${id}`, harmClass: 'none', importedAllowed: true, minTier: 1, consumers: ['app-services.legends'], compactable: false,
});
export const TYPE_DEFS: EventTypeDef[] = [
  typeDef('game_result', 'game'), typeDef('title_won', 'honors'), typeDef('conference_title_won', 'honors'), typeDef('record_set', 'honors'), typeDef('season_award', 'honors'),
  typeDef('coach_hired', 'career'), typeDef('coach_fired', 'career'), typeDef('coach_resigned', 'career'), typeDef('result_vacated', 'world'),
  typeDef('staff_meeting', 'career', 'room'), typeDef('team_meeting', 'career', 'team'), typeDef('history_summary', 'world'),
];

/** A player's public game line. */
export function line(personId: number, teamId: number, season: number, gameId: number, totals: Record<string, number>, postseason = false): awards.GameLine {
  return { gameId, season, week: 1, competitionId: COMP, groupId: 1, teamId, personId, position: 'QB', postseason, won: true, gameNotability: null, totals };
}
