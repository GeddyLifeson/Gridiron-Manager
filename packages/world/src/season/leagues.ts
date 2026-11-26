// Season specs for the two shipped competitions, built from the repository's own files: the generated
// world (football-content/data/world), the league-rules files (rules-data/data/league), the calendar
// (league/calendar) and the schedule generators (league/schedule). Nothing here is typed in by hand:
// anything a data file does not carry yet comes from data/college-provisional.json and is listed in the
// spec's `provisional` notes, which every report prints. Pure: the caller hands in the parsed files
// (`LeagueContent`), so the browser app and the headless season gate build the same season. Moved here
// from headless season-gate/leagues.ts, which now reads the files and calls these builders.
import { seedFromHex, stream } from '@gm/engine-core';
import { calendar, postseason, schedule, week as weekly } from '@gm/league';
import type { SeasonSpec } from './types.ts';
import type { SeatWeekSource } from './seat.ts';
import { fixturesFromSchedule } from './fixtures.ts';
import { seededBracketPlan } from './postseason-bracket.ts';
import { selectionPlan, type SelectionInput } from './postseason-selection.ts';
import provisional from './data/college-provisional.json' with { type: 'json' };

/** The parsed data files a season is built from (the football-content world files and league-rules files). */
export interface LeagueContent {
  /** packages/football-content/data/world/pro-league.json */
  readonly proLeague: unknown;
  /** packages/football-content/data/world/college.json */
  readonly college: unknown;
  /** packages/rules-data/data/league/proleague_2026.json */
  readonly proLeagueRules: { readonly values: readonly { key: string; value: number | string | boolean }[] };
  /** packages/rules-data/data/league/collegeleague_2026.json */
  readonly collegeLeagueRules: { readonly values: readonly { key: string; value: number | string | boolean }[] };
}

export interface BuiltSeason {
  readonly spec: SeasonSpec;
  /** The seat's week source for this competition (H1.2 template set, calendar kickoffs). */
  readonly seatSource: SeatWeekSource;
  /** Teams of the power conferences where the competition has tiers (T2.2.1); empty otherwise. */
  readonly powerTeamIds: readonly number[];
  /** Display key of each numeric team id (world-data id). */
  readonly keyOf: ReadonlyMap<number, string>;
  /** Inputs in use that no shipped data file carries: printed in every report. Empty means none. */
  readonly provisional: readonly string[];
  /** Notes from the schedule generator. */
  readonly scheduleLog: readonly string[];
  /** Selection competitions only (T3.3 to T3.6): conferences, independents and bowls, for the weekly league picture. */
  readonly selection: SelectionInput | null;
  /** Program standing per team (school football history level), the voters' brand and preseason view (T3.4.1). Empty at the pro level. */
  readonly prestige: ReadonlyMap<number, number>;
}

export interface BuildOptions {
  readonly season: number;
  readonly seedHex: string;
  readonly seatTeamKey?: string | null;
  /** Extra league-rule values by key; each is listed as provisional. */
  readonly leagueRuleOverrides?: Readonly<Record<string, number | string | boolean>>;
}

const STREAMS = { schedule: 'season.schedule', priorRank: 'season.priorRank' } as const;

function seatSource(set: weekly.TemplateSet, countable: boolean, week1Day: number, placeholderMinute: number): SeatWeekSource {
  const dayOf = (week: number, dayIndex: number | null) => dayIndex ?? week1Day + (week - 1) * calendar.DAYS_PER_WEEK;
  return {
    set, countable,
    kickoff: (ctx) => ({ day: dayOf(ctx.week, ctx.fixture?.dayIndex ?? null), minute: ctx.fixture?.kickoffMinute ?? placeholderMinute }),
    previousGameDay: (ctx) => {
      const last = ctx.results.filter((r) => r.teams.includes(ctx.teamId)).reduce((m, r) => Math.max(m, r.week), 0);
      return last === 0 ? null : dayOf(last, null);
    },
  };
}

function seatId(keyOf: ReadonlyMap<number, string>, key: string | null | undefined): number | null {
  if (key === null || key === undefined) return null;
  for (const [id, k] of keyOf) if (k === key) return id;
  throw new Error(`seat team ${key} is not in the competition`);
}

function withOverrides(base: Record<string, number | string | boolean>, o: BuildOptions, notes: string[]): Record<string, number | string | boolean> {
  for (const [k, v] of Object.entries(o.leagueRuleOverrides ?? {})) {
    notes.push(`league rule ${k} = ${String(v)}: given on the command line, not from the league-rules file`);
    base[k] = v;
  }
  return base;
}

/** The pro competition: conference bracket postseason (C3), 2026 league-rules file. */
export function buildProSeason(content: LeagueContent, o: BuildOptions): BuiltSeason {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const world = content.proLeague as any;
  const file = content.proLeagueRules;
  const notes: string[] = [];
  const rules = withOverrides(Object.fromEntries(file.values.map((v) => [v.key, v.value])), o, notes);
  const clubs = [...(world.league.clubs as { id: string; divisionId: string; stadiumId: string; marketTier: number }[])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const confs = world.league.conferences as { id: string; divisions: { id: string }[] }[];
  const stadium = new Map((world.stadiums as { id: string; timeZone: string; latitude: number; longitude: number }[]).map((s) => [s.id, s]));
  const league: schedule.ProLeague = { conferences: confs.map((c) => ({ id: c.id, divisions: c.divisions.map((d) => ({ id: d.id, clubIds: clubs.filter((k) => k.divisionId === d.id).map((k) => k.id) })) })) };
  const idOf = new Map(clubs.map((c, i) => [c.id, i + 1]));
  const place = new Map<string, { conferenceId: number; divisionId: number }>();
  confs.forEach((c, ci) => c.divisions.forEach((d, di) => place.set(d.id, { conferenceId: ci + 1, divisionId: (ci + 1) * clubs.length + di + 1 })));
  const seed = seedFromHex(o.seedHex);
  // A first season has no prior year: division ranks are drawn (C2.1.1 needs them for the place games).
  const rank = stream(seed, STREAMS.priorRank, [o.season]);
  const priorRank: Record<string, number> = {};
  for (const c of league.conferences) for (const d of c.divisions) {
    const ids = [...d.clubIds];
    for (let i = ids.length - 1; i > 0; i--) { const j = rank.int(0, i); const t = ids[i]!; ids[i] = ids[j]!; ids[j] = t; }
    ids.forEach((id, i) => { priorRank[id] = i + 1; });
  }
  const lookup = calendar.calendarLookup(calendar.lookupFromValues(file.values));
  const week1 = new calendar.CalendarResolver(calendar.calendarSet('pro', calendar.CALENDAR_FILES), lookup).anchor(o.season, 'kickoff_sunday').day;
  const made = schedule.generateProSeason({
    season: o.season, league, priorRank, week1SundayDayIndex: week1, random: stream(seed, STREAMS.schedule, [o.season]),
    clubs: clubs.map((c) => { const s = stadium.get(c.stadiumId)!; return { id: c.id, venueId: c.stadiumId, zone: s.timeZone, latitude: s.latitude, longitude: s.longitude, marketTier: c.marketTier }; }),
  });
  const keyOf = new Map(clubs.map((c) => [idOf.get(c.id)!, c.id]));
  const untimed = made.games.filter((g) => g.phase === 'regular' && g.kickoffEtMinutes === null);
  if (untimed.length) notes.push(`kickoff minute ${provisional.kickoffMinute.value} for ${untimed.length} games of week ${[...new Set(untimed.map((g) => g.week))].join(', ')} whose time the schedule leaves open until the flex step (C2.4); the season runner does not call that step yet. ${provisional.kickoffMinute.basis}`);
  const spec: SeasonSpec = {
    season: o.season, seedHex: o.seedHex, ruleSetId: 'pro_2026',
    teams: clubs.map((c) => ({ id: idOf.get(c.id)!, key: c.id, ...place.get(c.divisionId)! })),
    fixtures: fixturesFromSchedule(made.games, (k) => idOf.get(k)!),
    leagueRules: rules, postseason: seededBracketPlan(), seatTeamId: seatId(keyOf, o.seatTeamKey),
  };
  return { spec, keyOf, powerTeamIds: [], selection: null, prestige: new Map(), provisional: notes, scheduleLog: made.log, seatSource: seatSource(weekly.defaultSet(weekly.weekLookup(lookup, 'pro')), false, week1, provisional.kickoffMinute.value) };
}

/** The top college subdivision: selection postseason (T3), 2026 league-rules file plus the provisional rows. */
export function buildCollegeSeason(content: LeagueContent, o: BuildOptions): BuiltSeason {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const world = content.college as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pro = content.proLeague as any;
  const file = content.collegeLeagueRules;
  const notes: string[] = [];
  const base: Record<string, number | string | boolean> = Object.fromEntries(file.values.map((v) => [v.key, v.value]));
  for (const row of provisional.leagueRules) {
    if (base[row.key] !== undefined) continue;
    base[row.key] = row.value;
    notes.push(`league rule ${row.key} = ${String(row.value)}: not in collegeleague_2026.json. ${row.basis}`);
  }
  const rules = withOverrides(base, o, notes);
  notes.push(`conference title games: power conferences '${provisional.titleMethod.power}', others '${provisional.titleMethod.other}'. ${provisional.titleMethod.basis}`);
  notes.push(`bowls: ${provisional.bowls.count}, every slot at-large. ${provisional.bowls.basis}`);
  notes.push(`kickoff minute ${provisional.kickoffMinute.value} where the schedule sets none. ${provisional.kickoffMinute.basis}`);

  type School = { id: string; level: string; conferenceId: string | null; latitude: number; longitude: number; timeZone: string; academicProfile: number; stadium: { id: string } };
  const schools = [...(world.schools as School[])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const topLevel = (world.levels as { id: string }[])[0]!.id;
  const top = schools.filter((s) => s.level === topLevel);
  // Top-subdivision teams take the first ids; guests from other levels follow and get no standings row.
  const ordered = [...top, ...schools.filter((s) => s.level !== topLevel)];
  const idOf = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const confs = (world.conferences as { id: string; tier: string; level: string; memberIds: string[] }[]);
  const topConfs = confs.filter((c) => c.level === topLevel);
  const confId = new Map(topConfs.map((c, i) => [c.id, i + 1]));
  const seed = seedFromHex(o.seedHex);
  const lookup = calendar.lookupFromValues(file.values);
  const week1 = new calendar.CalendarResolver(calendar.calendarSet('college', calendar.CALENDAR_FILES), calendar.calendarLookup(lookup)).anchor(o.season, 'first_saturday').day;
  const made = schedule.generateCollegeSeason({
    season: o.season, rivalries: world.rivalries as schedule.Rivalry[], history: {}, week1SaturdayDayIndex: week1,
    teams: schools.map((s) => ({ id: s.id, level: s.level, conferenceId: s.conferenceId, latitude: s.latitude, longitude: s.longitude, zone: s.timeZone, venueId: s.stadium.id })),
    conferences: confs.map((c) => ({ id: c.id, tier: c.tier, memberIds: c.memberIds })),
    neutralVenues: (pro.stadiums as { id: string; latitude: number; longitude: number; timeZone: string }[]).map((s) => ({ id: s.id, latitude: s.latitude, longitude: s.longitude, zone: s.timeZone })),
    random: stream(seed, STREAMS.schedule, [o.season]),
  });
  const topIds = new Set(top.map((s) => s.id));
  const fixtures = fixturesFromSchedule(made.games.filter((g) => topIds.has(g.home) || topIds.has(g.away)), (k) => idOf.get(k)!);
  const independentsConf = topConfs.length + 1;
  const selection: SelectionInput = {
    conferences: topConfs.map((c) => ({
      conferenceId: confId.get(c.id)!, power: c.tier === 'power', teamIds: c.memberIds.map((m) => idOf.get(m)!),
      titleMethod: (c.tier === 'power' ? provisional.titleMethod.power : provisional.titleMethod.other) as 'standings' | 'title_game',
    })),
    independents: (world.independents as string[]).filter((k) => topIds.has(k)).map((k) => idOf.get(k)!),
    bowls: Array.from({ length: provisional.bowls.count }, (_, i): postseason.BowlDef => ({ bowlId: i + 1, order: i + 1, slots: [null, null] })),
    academicScore: (id) => ordered[id - 1]!.academicProfile,
  };
  const plan = selectionPlan(selection);
  const keyOf = new Map(ordered.map((s) => [idOf.get(s.id)!, s.id]));
  const spec: SeasonSpec = {
    season: o.season, seedHex: o.seedHex, ruleSetId: 'college_2026',
    teams: top.map((s) => { const c = s.conferenceId === null ? independentsConf : confId.get(s.conferenceId)!; return { id: idOf.get(s.id)!, key: s.id, conferenceId: c, divisionId: c }; }),
    fixtures, leagueRules: rules, postseason: plan, seatTeamId: seatId(keyOf, o.seatTeamKey),
  };
  const powerTeamIds = topConfs.filter((c) => c.tier === 'power').flatMap((c) => c.memberIds.map((m) => idOf.get(m)!));
  const prestige = new Map(ordered.map((sc, i) => [i + 1, (sc as { footballHistoryLevel?: number }).footballHistoryLevel ?? 0] as const));
  return { spec, keyOf, powerTeamIds, selection, prestige, provisional: notes, scheduleLog: made.log, seatSource: seatSource(weekly.defaultSet(weekly.weekLookup(lookup, 'college')), true, week1, provisional.kickoffMinute.value) };
}

export const LEVEL_BUILDERS: Readonly<Record<string, (content: LeagueContent, o: BuildOptions) => BuiltSeason>> = {
  pro_2026: buildProSeason,
  college_2026: buildCollegeSeason,
};

export function buildSeason(content: LeagueContent, ruleSetId: string, o: BuildOptions): BuiltSeason {
  const build = LEVEL_BUILDERS[ruleSetId];
  if (!build) throw new Error(`no season builder for rule set ${ruleSetId} (have ${Object.keys(LEVEL_BUILDERS).join(', ')})`);
  return build(content, o);
}
