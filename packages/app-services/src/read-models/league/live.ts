// The league pages over the running season (unstarted-work item 2a): the career's season session (`SeasonPlay`)
// and, when the career began from a generated world, that world's history, laid out as the world tables the
// six league page builders read, then read through the public observer (G-27; every league page is public).
//
// What comes from where:
// - Season session: the competition, its conferences and divisions (names from the league content), every
//   team and venue, every fixture with its result once played, postseason games as they are played, the
//   pro tiebroken table (C3.1.3) on the season's own tie-draw stream, and the bracket, committee ranking and
//   bowls the postseason state holds.
// - Generated world (optional): its people, staff jobs and rosters of the season's teams, its public honours,
//   transactions and other events, and the champions of past seasons. World team ids are mapped to the
//   season's ids by identity (the same name and abbreviation pair `contentKeyOfWorldTeam` uses).
// - `standingsPicture()` (PR 284) when the season session has it: polls, weekly rankings, clinch, odds and
//   college conference order. Until then the college groups fall back to percentage order and say so.
//
// Nothing is invented: a field the sources do not carry stays empty on the page (O6.6.1).
import { standings } from '@gm/league';
import { season as seasons, type loop } from '@gm/world';
import { ObservedWorld, PUBLIC_OBSERVER, tablesOf, type Observer } from '../../observer/index.ts';
import type { SeasonPlay } from '../../play/season-session.ts';
import { buildStandings, type StandingsSource } from './standings.ts';
import { buildSchedule } from './schedule.ts';
import { buildTeamPage } from './team.ts';
import { buildNews, buildTransactions, type WireContext } from './wire.ts';
import { buildRecords } from './records.ts';
import type { NewsView, RecordsView, ScheduleView, StandingsView, TeamPageView, TransactionsView } from './types.ts';

/** Competition id of the season's competition in the league tables. */
export const LIVE_COMPETITION_ID = 1;
/** Competition id of the college guests from other levels on the schedule (no standings row, T3.1). */
export const GUEST_COMPETITION_ID = 2;
/** Offset for a world team the season does not hold (a folded club, another level's school). */
export const UNMAPPED_TEAM_OFFSET = 1_000_000;

/** Words the tables need that the content does not carry (the host passes its own text). */
export interface LiveLeagueText {
  /** Name of the college top subdivision (the content has only a level id). */
  readonly collegeCompetition: string;
  readonly collegeGuests: string;
  readonly independents: string;
  /** A division's name from its conference name and its content label (east, west, north, south). */
  division(conference: string, label: string): string;
}

export const PLAIN_TEXT: LiveLeagueText = {
  collegeCompetition: 'College top division', collegeGuests: 'Other college divisions', independents: 'Independents',
  division: (conference, label) => `${conference} ${label}`,
};

export interface LiveLeagueOptions {
  readonly season: SeasonPlay;
  readonly content: seasons.LeagueContent;
  /** The generated world the career began from (new-game picker), or null. */
  readonly history?: loop.LiveWorld | null;
  readonly text?: LiveLeagueText;
  /** Who reads the pages; the public observer by default (every league page is public). */
  readonly observer?: Observer;
}

type Row = Record<string, unknown>;
type Picture = Partial<Pick<StandingsSource, 'pro' | 'college' | 'bracket'>>;

/** The PR 284 hook, read structurally so this file needs no change when that method lands. */
interface WithPicture { standingsPicture?(): Picture }

const DAYS_PER_WEEK = 7;
/** The world generator's own conversions (world generation/structures.ts). */
const FT_PER_M = 3.28084;
const ROOF: Readonly<Record<string, 'open' | 'closed' | 'fixed_dome'>> = { open: 'open', 'fixed dome': 'fixed_dome', retractable: 'closed' };

/** Days from 1970-01-01 to 1 January of `year` (proleptic Gregorian, integers only). */
export function epochDayOfYearStart(year: number): number {
  const leaps = (y: number) => Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  return 365 * (year - 1970) + leaps(year - 1) - leaps(1969);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Built {
  readonly tables: Record<string, Row[]>;
  readonly world: ObservedWorld;
  readonly source: StandingsSource;
  /** Season year to the champion's team id in these tables, from the world's past seasons and this one. */
  readonly champions: ReadonlyMap<number, number>;
}

/** The six league pages over a running season. Rebuilt once per season step (the state object changes). */
export class LiveLeague {
  readonly competitionId = LIVE_COMPETITION_ID;
  readonly level: 'pro' | 'college';
  readonly seasonYear: number;
  private readonly text: LiveLeagueText;
  private cache: { state: unknown; built: Built } | null = null;
  /** World team id to the season's team id (identity match), built once. */
  private readonly worldToSeason = new Map<number, number>();
  private readonly worldCompetitionId: number | null = null;

  constructor(private readonly o: LiveLeagueOptions) {
    this.level = o.season.built.spec.ruleSetId.startsWith('college') ? 'college' : 'pro';
    this.seasonYear = o.season.built.spec.season;
    this.text = o.text ?? PLAIN_TEXT;
    const w = o.history;
    if (w) {
      const keyToSeason = new Map([...o.season.built.keyOf].map(([id, key]) => [key, id]));
      const byIdentity = new Map(this.contentTeams().map((t) => [`${t.name}\u0000${t.abbreviation}`, keyToSeason.get(t.key)]));
      const count = new Map<number, number>();
      for (const t of w.teams) {
        const id = byIdentity.get(`${t.identity.name}\u0000${t.identity.abbreviation}`);
        if (id === undefined) continue;
        this.worldToSeason.set(t.id, id);
        if (o.season.built.spec.teams.some((s) => s.id === id)) count.set(t.competitionId, (count.get(t.competitionId) ?? 0) + 1);
      }
      // The world competition of this level: the one holding most of the season's teams.
      this.worldCompetitionId = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
    }
  }

  /** Every team of the content with its display name, abbreviation, place and stadium. */
  private contentTeams(): { key: string; name: string; nickname: string; place: string; abbreviation: string; colours: string[]; stadiumId: string }[] {
    const c = this.o.content as Any;
    if (this.level === 'pro') {
      return (c.proLeague?.league?.clubs ?? []).map((k: Any) => ({ key: k.id, name: `${k.city} ${k.nickname}`, nickname: k.nickname, place: k.city, abbreviation: k.abbreviation, colours: [k.primaryColour, k.secondaryColour].filter(Boolean), stadiumId: k.stadiumId }));
    }
    return (c.college?.schools ?? []).map((s: Any) => ({ key: s.id, name: s.name, nickname: s.nickname ?? '', place: s.place ?? s.city ?? '', abbreviation: s.abbreviation, colours: [s.primaryColour, s.secondaryColour].filter(Boolean), stadiumId: s.stadium?.id }));
  }

  /** Season team id of a world team; teams the season does not hold get an offset id so links stay apart. */
  private mapTeam(worldTeamId: number): number {
    return this.worldToSeason.get(worldTeamId) ?? UNMAPPED_TEAM_OFFSET + worldTeamId;
  }

  private build(): Built {
    const sp = this.o.season;
    if (this.cache?.state === sp.state) return this.cache.built;
    const spec = sp.built.spec;
    const c = this.o.content as Any;
    const year = spec.season;
    const inSeason = new Set(spec.teams.map((t) => t.id));

    // Venues: every stadium of the content, numbered in file order, laid out as the world generator lays them
    // out (world generation/structures.ts: the home team's place, the roof words, altitude in feet).
    const cityOfClub = new Map<string, string>((c.proLeague?.league?.clubs ?? []).map((k: Any) => [k.id, k.city]));
    const stadiums: Any[] = this.level === 'pro'
      ? (c.proLeague?.stadiums ?? []).map((s: Any) => ({ ...s, place: cityOfClub.get(s.clubId) ?? '' }))
      : (c.college?.schools ?? []).map((s: Any) => ({ ...s.stadium, place: s.place ?? '', altitudeM: s.altitudeM }));
    const venueId = new Map<string, number>();
    const venues: Row[] = stadiums.map((s, i) => {
      venueId.set(s.id, i + 1);
      return {
        id: i + 1, name: s.name, place: s.place, surfaceType: s.surface?.type ?? '', roof: ROOF[s.roof] ?? null, altitudeFt: (s.altitudeM ?? 0) * FT_PER_M,
        capacity: s.capacity ?? 0, noiseBase: Math.min(1, Math.max(0, s.noiseFactor ?? 0)), climateId: null,
      };
    });

    // Teams: every team the season names (college guests from other levels sit in their own competition).
    const content = new Map(this.contentTeams().map((t) => [t.key, t]));
    const placeOf = new Map(spec.teams.map((t) => [t.id, t]));
    const worldTeam = new Map<number, Any>();
    for (const t of this.o.history?.teams ?? []) { const id = this.worldToSeason.get(t.id); if (id !== undefined) worldTeam.set(id, t); }
    const rivalPairs: Any[] = (this.level === 'pro' ? c.proLeague?.rivalries : c.college?.rivalries) ?? [];
    const seasonIdOfKey = new Map([...sp.built.keyOf].map(([id, key]) => [key, id]));
    const rivalsOf = (key: string) => rivalPairs.flatMap((r) => (r.a === key ? [r.b] : r.b === key ? [r.a] : [])).map((k: string) => seasonIdOfKey.get(k)).filter((x): x is number => x !== undefined);
    const teams: Row[] = [...sp.built.keyOf].map(([id, key]) => {
      const t = content.get(key);
      const w = worldTeam.get(id);
      return {
        id, competitionId: inSeason.has(id) ? LIVE_COMPETITION_ID : GUEST_COMPETITION_ID, conferenceId: placeOf.get(id)?.divisionId ?? null,
        identity: { name: t?.name ?? key, nickname: t?.nickname ?? '', place: t?.place ?? '', abbreviation: t?.abbreviation ?? key, colours: t?.colours ?? [] },
        homeVenueId: (t && venueId.get(t.stadiumId)) ?? 0, ownerPersonId: null, athleticDirectorPersonId: null, presidentPersonId: null,
        finalSay: { roster: null, contracts: null, draft: null, staffHiring: null },
        // The band is the world's (X9.1.1); a season with no world has none to show.
        resourceBand: w?.resourceBand ?? '', facilities: w?.facilities ?? {}, rivalTeamIds: rivalsOf(key), prestige: 0,
      };
    });
    // Teams of the world the season does not hold, named so a past champion or an honour can show them.
    for (const t of this.o.history?.teams ?? []) {
      if (this.worldToSeason.has(t.id)) continue;
      teams.push({ ...t, id: this.mapTeam(t.id), competitionId: GUEST_COMPETITION_ID + 1, conferenceId: null, rivalTeamIds: [], homeVenueId: 0 });
    }

    // Conferences and divisions, named from the content.
    const conferences: Row[] = [];
    if (this.level === 'pro') {
      const confs: Any[] = c.proLeague?.league?.conferences ?? [];
      const clubs = (c.proLeague?.league?.clubs ?? []).length;
      confs.forEach((conf, ci) => {
        const cid = ci + 1;
        conferences.push({ id: cid, competitionId: LIVE_COMPETITION_ID, parentId: null, name: conf.name, kind: 'conference', teamIds: [] });
        (conf.divisions ?? []).forEach((d: Any, di: number) => {
          const did = cid * clubs + di + 1;
          conferences.push({ id: did, competitionId: LIVE_COMPETITION_ID, parentId: cid, name: this.text.division(conf.name, d.label ?? d.id), kind: 'division', teamIds: spec.teams.filter((t) => t.divisionId === did).map((t) => t.id) });
        });
      });
    } else {
      const top = (c.college?.levels ?? [])[0]?.id;
      const confs: Any[] = (c.college?.conferences ?? []).filter((x: Any) => x.level === top);
      confs.forEach((conf, i) => conferences.push({ id: i + 1, competitionId: LIVE_COMPETITION_ID, parentId: null, name: conf.name, kind: 'conference', teamIds: spec.teams.filter((t) => t.conferenceId === i + 1).map((t) => t.id) }));
      const independents = spec.teams.filter((t) => t.conferenceId === confs.length + 1).map((t) => t.id);
      if (independents.length) conferences.push({ id: confs.length + 1, competitionId: LIVE_COMPETITION_ID, parentId: null, name: this.text.independents, kind: 'conference', teamIds: independents });
    }
    const competitions: Row[] = [{
      id: LIVE_COMPETITION_ID, name: this.level === 'pro' ? c.proLeague?.league?.name ?? spec.ruleSetId : this.text.collegeCompetition, level: this.level,
      ruleSetId: spec.ruleSetId, leagueRulesId: spec.ruleSetId, conferenceIds: conferences.filter((x) => x.parentId === null).map((x) => x.id), teamIds: [...inSeason],
      seasonFormat: spec.ruleSetId, postseasonFormat: spec.ruleSetId,
    }];
    if (this.level === 'college') competitions.push({ ...competitions[0]!, id: GUEST_COMPETITION_ID, name: this.text.collegeGuests, conferenceIds: [], teamIds: [] });

    // Games: the regular fixtures, played or not, and every postseason game once it is played.
    const yearStart = epochDayOfYearStart(year);
    const known = spec.fixtures.filter((f) => f.dayIndex !== null);
    const firstDay = known.length ? Math.min(...known.map((f) => f.dayIndex! - (f.week - known[0]!.week) * DAYS_PER_WEEK)) : yearStart;
    const firstWeek = known[0]?.week ?? 0;
    // A fixture the schedule left undated (the flex step, C2.4) sits on its week's day from the schedule's first dated week.
    const dayOf = (f: seasons.Fixture) => (f.dayIndex ?? firstDay + (f.week - firstWeek) * DAYS_PER_WEEK) - yearStart;
    const played = new Map(sp.state.games.map((g) => [g.fixture.gameId, g]));
    const fixtures = [...spec.fixtures, ...sp.state.games.filter((g) => g.fixture.phase === 'postseason').map((g) => g.fixture)];
    const games: Row[] = fixtures.map((f) => {
      const p = played.get(f.gameId);
      const home = content.get(sp.keyOf(f.home));
      return {
        id: f.gameId, competitionId: LIVE_COMPETITION_ID, seasonYear: year, week: f.week, kickoff: { seasonYear: year, dayIndex: dayOf(f) },
        teamIds: [f.home, f.away], venueId: f.neutralSite || !home ? 0 : venueId.get(home.stadiumId) ?? 0, neutralSite: f.neutralSite, phase: f.phase,
        status: p ? 'final' : 'scheduled', environment: null, seedHex: p?.seedHex ?? '0000000000000000', crewId: null,
        finalScore: p ? [p.outcome.points[0], p.outcome.points[1]] : null, stateHash: p?.outcome.stateHash ?? null, tier: 1,
      };
    });

    // The world's people, staff, rosters, events and past seasons (when the career began from a world).
    const tables: Record<string, Row[]> = { competitions, conferences, venues, teams, games, seasons: [{ competitionId: LIVE_COMPETITION_ID, year, gameIds: [], awardEventIds: [], archive: 'live' }] };
    const champions = new Map<number, number>();
    const w = this.o.history;
    if (w) this.addHistory(w, tables, champions, year);
    if (sp.state.champion !== null) champions.set(year, sp.state.champion);

    // Standings source: the rule values, touchdowns from each outcome, the pro table, the postseason state.
    const touchdowns = new Map(sp.state.games.map((g) => [g.fixture.gameId, g.outcome.touchdowns]));
    const post = sp.state.post as Any;
    let source: StandingsSource = { rules: spec.leagueRules, touchdowns: (id) => touchdowns.get(id) ?? null, bracket: post?.bracket ?? null };
    if (this.level === 'pro') {
      const places = spec.teams.map((t) => ({ id: t.id, conferenceId: t.conferenceId, divisionId: t.divisionId }));
      const regular = sp.state.results.filter((r) => r.phase === 'regular');
      source = { ...source, pro: { table: standings.seasonTable(places, regular, spec.leagueRules, seasons.tieDraw(spec.seedHex, spec.season)) } };
    } else if (post && Array.isArray(post.ranking)) {
      // The selection state after the title games: the final committee ranking, the title games and the bowls.
      source = {
        ...source,
        college: {
          ranking: post.ranking.length ? { order: post.ranking, resumes: [] } : null,
          bowls: Array.isArray(post.bowls) ? { games: post.bowls, eligible: [], shortFill: [], unfilled: post.unfilledBowls ?? [] } : null,
        },
      };
    }
    const picture = (sp as unknown as WithPicture).standingsPicture?.();
    if (picture) source = { ...source, ...picture, bracket: picture.bracket ?? source.bracket ?? null };

    const world = new ObservedWorld(tablesOf(tables), this.o.observer ?? PUBLIC_OBSERVER);
    const built: Built = { tables, world, source, champions };
    this.cache = { state: sp.state, built };
    return built;
  }

  private addHistory(w: loop.LiveWorld, tables: Record<string, Row[]>, champions: Map<number, number>, year: number): void {
    const mappedComp = (id: unknown) => (id === this.worldCompetitionId ? LIVE_COMPETITION_ID : id);
    const wanted = new Set<number>();
    // Staff and rosters of the season's teams, as the world holds them today.
    const jobs: Row[] = [];
    for (const j of w.jobs.values()) {
      const team = this.worldToSeason.get(j.teamId);
      if (team === undefined) continue;
      jobs.push({ ...j, teamId: team });
      if (j.holderPersonId !== null) wanted.add(j.holderPersonId);
    }
    const rosterSlots: Row[] = [];
    for (const [teamId, ids] of w.rosters) {
      const team = this.worldToSeason.get(teamId);
      if (team === undefined) continue;
      for (const personId of ids) {
        const p = w.people.get(personId);
        rosterSlots.push({ teamId: team, personId, list: '', jersey: (p as Any)?.playing?.lastJersey ?? null, gameDayStatus: 'active', since: w.date });
        wanted.add(personId);
      }
    }
    // Events of this competition (honours, transactions, results), team ids mapped to the season's.
    const mapTeamField = (v: unknown) => (typeof v === 'number' ? this.mapTeam(v) : v);
    const events: Row[] = [];
    for (const e of w.log.rows() as unknown as Row[]) {
      if (e.competitionId !== this.worldCompetitionId && e.competitionId !== null) continue;
      const where = e.where as Row | undefined;
      const subjects = Array.isArray(e.subjects) ? (e.subjects as Row[]).map((s) => (s.kind === 'team' ? { ...s, id: mapTeamField(s.id) } : s)) : e.subjects;
      events.push({ ...e, competitionId: mappedComp(e.competitionId), where: where ? { ...where, teamId: mapTeamField(where.teamId) } : where, subjects });
      for (const a of (Array.isArray(e.actors) ? e.actors : []) as Row[]) if (typeof a.personId === 'number') wanted.add(a.personId);
      for (const s of (Array.isArray(e.subjects) ? e.subjects : []) as Row[]) if (s.kind === 'person' && typeof s.id === 'number') wanted.add(s.id);
    }
    const eventTypes: Row[] = [];
    for (const id of w.log.registry.ids()) { const d = w.log.registry.get(id); if (d) eventTypes.push({ ...d } as unknown as Row); }
    const people: Row[] = [];
    for (const id of wanted) { const p = w.people.get(id); if (p) people.push(p as unknown as Row); }
    // Past seasons and their champions (the world's season summaries).
    for (const s of w.seasons) {
      if (s.seasonYear >= year) continue;
      tables.seasons!.push({ competitionId: LIVE_COMPETITION_ID, year: s.seasonYear, gameIds: [], awardEventIds: [], archive: 'archived' });
      const champ = this.worldCompetitionId === null ? undefined : s.champions[this.worldCompetitionId];
      if (champ !== undefined) champions.set(s.seasonYear, this.mapTeam(champ));
    }
    Object.assign(tables, { jobs, rosterSlots, events, eventTypes, people });
  }

  /** The world tables as built for the current step (tests and the crawler). */
  tables(): Readonly<Record<string, readonly Row[]>> { return this.build().tables; }
  observed(): ObservedWorld { return this.build().world; }
  standingsSource(): StandingsSource { return this.build().source; }

  /** The seat's club and this week's opponent, for the wire filters (C10.1). */
  wireContext(): WireContext {
    const sp = this.o.season;
    const next = sp.nextSeatGame();
    return { teamId: sp.seatTeamId, opponentTeamId: next?.opponentId ?? null };
  }

  standings(): StandingsView { const b = this.build(); return buildStandings(b.world, this.competitionId, this.seasonYear, b.source); }
  schedule(teamId: number | null): ScheduleView { return buildSchedule(this.build().world, this.competitionId, this.seasonYear, teamId); }
  team(teamId: number): TeamPageView | null { return buildTeamPage(this.build().world, teamId, this.seasonYear); }
  transactions(): TransactionsView { return buildTransactions(this.build().world, this.competitionId, this.wireContext()); }
  news(): NewsView { return buildNews(this.build().world, this.wireContext()); }

  /**
   * Awards, records and history. The history table's champion comes from the season records (the world's
   * season summaries and this season's final) where no title event names one: the history run keeps titles
   * in world state, not yet as log rows (newgame/legends.ts).
   */
  records(seasonYear: number | null): RecordsView {
    const b = this.build();
    const v = buildRecords(b.world, this.competitionId, seasonYear);
    const names = { ...v.teams };
    const all = new Map(Object.values(b.tables.teams ?? []).map((t) => [t.id as number, t]));
    const history = v.history.map((h) => {
      const champ = h.champion ?? b.champions.get(h.seasonYear) ?? null;
      if (champ !== null && !names[String(champ)]) {
        const ident = (all.get(champ)?.identity ?? {}) as { name?: string; abbreviation?: string };
        names[String(champ)] = { teamId: champ, name: ident.name ?? `#${champ}`, abbreviation: ident.abbreviation ?? `#${champ}` };
      }
      return { ...h, champion: champ };
    });
    return { ...v, history, teams: names };
  }
}
