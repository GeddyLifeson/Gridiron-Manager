// Season specs for the two shipped competitions, built from the repository's own files: the generated
// world (football-content/data/world), the league-rules files (rules-data/data/league), the calendar
// (league/calendar) and the schedule generators (league/schedule). Nothing here is typed in by hand:
// anything a data file does not carry yet comes from data/college-provisional.json and is listed in the
// spec's `provisional` notes, which every report prints.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedFromHex, stream } from '@gm/engine-core';
import { calendar, postseason, schedule, week as weekly } from '@gm/league';
import { season as seasons } from '@gm/world';
import provisional from './data/college-provisional.json' with { type: 'json' };

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export interface BuiltSeason {
  readonly spec: seasons.SeasonSpec;
  /** The seat's week source for this competition (H1.2 template set, calendar kickoffs). */
  readonly seatSource: seasons.SeatWeekSource;
  /** Teams of the power conferences where the competition has tiers (T2.2.1); empty otherwise. */
  readonly powerTeamIds: readonly number[];
  /** Display key of each numeric team id (world-data id). */
  readonly keyOf: ReadonlyMap<number, string>;
  /** Inputs in use that no shipped data file carries: printed in every report. Empty means none. */
  readonly provisional: readonly string[];
  /** Notes from the schedule generator. */
  readonly scheduleLog: readonly string[];
}

export interface BuildOptions {
  readonly season: number;
  readonly seedHex: string;
  readonly seatTeamKey?: string | null;
  /** Extra league-rule values by key; each is listed as provisional. */
  readonly leagueRuleOverrides?: Readonly<Record<string, number | string | boolean>>;
  readonly root?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = (root: string, ...p: string[]): any => JSON.parse(readFileSync(join(root, ...p), 'utf8'));

function leagueValues(root: string, file: string): { values: { key: string; value: number | string | boolean }[] } {
  return readJson(root, 'packages', 'rules-data', 'data', 'league', file);
}

const STREAMS = { schedule: 'season.schedule', priorRank: 'season.priorRank' } as const;

function seatSource(set: weekly.TemplateSet, countable: boolean, week1Day: number, placeholderMinute: number): seasons.SeatWeekSource {
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
export function buildProSeason(o: BuildOptions): BuiltSeason {
  const root = o.root ?? REPO_ROOT;
  const world = readJson(root, 'packages', 'football-content', 'data', 'world', 'pro-league.json');
  const file = leagueValues(root, 'proleague_2026.json');
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
  const spec: seasons.SeasonSpec = {
    season: o.season, seedHex: o.seedHex, ruleSetId: 'pro_2026',
    teams: clubs.map((c) => ({ id: idOf.get(c.id)!, key: c.id, ...place.get(c.divisionId)! })),
    fixtures: seasons.fixturesFromSchedule(made.games, (k) => idOf.get(k)!),
    leagueRules: rules, postseason: seasons.seededBracketPlan(), seatTeamId: seatId(keyOf, o.seatTeamKey),
  };
  return { spec, keyOf, powerTeamIds: [], provisional: notes, scheduleLog: made.log, seatSource: seatSource(weekly.defaultSet(weekly.weekLookup(lookup, 'pro')), false, week1, provisional.kickoffMinute.value) };
}

/** The top college subdivision: selection postseason (T3), 2026 league-rules file plus the provisional rows. */
export function buildCollegeSeason(o: BuildOptions): BuiltSeason {
  const root = o.root ?? REPO_ROOT;
  const world = readJson(root, 'packages', 'football-content', 'data', 'world', 'college.json');
  const pro = readJson(root, 'packages', 'football-content', 'data', 'world', 'pro-league.json');
  const file = leagueValues(root, 'collegeleague_2026.json');
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
  const fixtures = seasons.fixturesFromSchedule(made.games.filter((g) => topIds.has(g.home) || topIds.has(g.away)), (k) => idOf.get(k)!);
  const independentsConf = topConfs.length + 1;
  const plan = seasons.selectionPlan({
    conferences: topConfs.map((c) => ({
      conferenceId: confId.get(c.id)!, power: c.tier === 'power', teamIds: c.memberIds.map((m) => idOf.get(m)!),
      titleMethod: (c.tier === 'power' ? provisional.titleMethod.power : provisional.titleMethod.other) as 'standings' | 'title_game',
    })),
    independents: (world.independents as string[]).filter((k) => topIds.has(k)).map((k) => idOf.get(k)!),
    bowls: Array.from({ length: provisional.bowls.count }, (_, i): postseason.BowlDef => ({ bowlId: i + 1, order: i + 1, slots: [null, null] })),
    academicScore: (id) => ordered[id - 1]!.academicProfile,
  });
  const keyOf = new Map(ordered.map((s) => [idOf.get(s.id)!, s.id]));
  const spec: seasons.SeasonSpec = {
    season: o.season, seedHex: o.seedHex, ruleSetId: 'college_2026',
    teams: top.map((s) => { const c = s.conferenceId === null ? independentsConf : confId.get(s.conferenceId)!; return { id: idOf.get(s.id)!, key: s.id, conferenceId: c, divisionId: c }; }),
    fixtures, leagueRules: rules, postseason: plan, seatTeamId: seatId(keyOf, o.seatTeamKey),
  };
  const powerTeamIds = topConfs.filter((c) => c.tier === 'power').flatMap((c) => c.memberIds.map((m) => idOf.get(m)!));
  return { spec, keyOf, powerTeamIds, provisional: notes, scheduleLog: made.log, seatSource: seatSource(weekly.defaultSet(weekly.weekLookup(lookup, 'college')), true, week1, provisional.kickoffMinute.value) };
}

export const LEVEL_BUILDERS: Readonly<Record<string, (o: BuildOptions) => BuiltSeason>> = {
  pro_2026: buildProSeason,
  college_2026: buildCollegeSeason,
};

export function buildSeason(ruleSetId: string, o: BuildOptions): BuiltSeason {
  const build = LEVEL_BUILDERS[ruleSetId];
  if (!build) throw new Error(`no season builder for rule set ${ruleSetId} (have ${Object.keys(LEVEL_BUILDERS).join(', ')})`);
  return build(o);
}
