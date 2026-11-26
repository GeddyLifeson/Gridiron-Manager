// DRAFT for @gm/schema: the zod schemas of the six league page read models, with a visibility class on every
// field. app-services may not import zod (P1.2.2), so the specs take these as parameters; the schema
// integrator moves this file into @gm/schema unchanged. Every field is public: the pages show the league's
// public record (career ladder screens.json kind public). Nothing is truth: the registry refuses one.
import { z } from 'zod';
import { pub } from '@gm/schema';

const int = () => z.number().int();
const id = () => pub(int(), 'id');
const count = () => pub(int().min(0), 'count');
const ratio = () => pub(z.number(), 'ratio');
const text = () => pub(z.string());
const flag = () => pub(z.boolean());
const idList = () => pub(z.array(int()), 'id');
const pair = () => pub(z.tuple([int(), int()]), 'id');
const Date = pub(z.object({ seasonYear: pub(int(), 'season_year'), dayIndex: pub(int(), 'day_index') }).strict());
const WLT = pub(z.object({ w: count(), l: count(), t: count() }).strict());
const Params = pub(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])));
const TeamRef = pub(z.object({ teamId: id(), name: text(), abbreviation: text() }).strict());
const Teams = pub(z.record(z.string(), TeamRef));
const People = pub(z.record(z.string(), z.string()));

const StandingsLine = pub(z.object({
  teamId: id(), record: WLT, pct: ratio(), pointsFor: pub(int(), 'points'), pointsAgainst: pub(int(), 'points'), netPoints: pub(int(), 'points'),
  home: WLT, road: WLT, division: WLT, conference: WLT, streakKind: pub(z.enum(['W', 'L', 'T'])).nullable(), streakLength: count(), lastFive: WLT,
  strengthOfVictory: ratio(), strengthOfSchedule: ratio(),
  marks: pub(z.array(z.enum(['clinched_playoffs', 'clinched_division', 'clinched_top_seed', 'eliminated', 'champion', 'conference_champion', 'title_game']))),
  odds: pub(z.object({ playoffs: ratio(), division: ratio(), topSeed: ratio() }).strict()).nullable(),
  ranking: pub(int(), 'index').nullable(),
}).strict());

export const StandingsData = z.object({
  competitionId: id(), seasonYear: pub(int(), 'season_year'), level: pub(z.enum(['pro', 'college'])), teams: Teams,
  lines: pub(z.array(StandingsLine)),
  groups: pub(z.array(pub(z.object({ groupId: id(), name: text(), kind: pub(z.enum(['division', 'conference'])), parentId: id().nullable(), teamIds: idList(), final: flag() }).strict()))),
  seeds: pub(z.array(pub(z.object({ conferenceId: id(), name: text(), seeds: idList(), divisionWinners: idList(), rest: idList() }).strict()))),
  tieNotes: pub(z.array(pub(z.object({ listKey: text(), stepKey: text(), teamIds: idList(), advanced: id().nullable() }).strict()))),
  uncertain: flag(),
  bracket: pub(z.array(pub(z.object({ key: text(), round: pub(int(), 'index'), group: id().nullable(), teams: pair(), seeds: pub(z.tuple([int(), int()]), 'index'), host: id().nullable(), winner: id().nullable() }).strict()))),
  champion: id().nullable(),
  college: pub(z.object({
    rankings: pub(z.array(pub(z.object({ rank: pub(int(), 'index'), teamId: id(), record: WLT, scheduleStrength: ratio(), bestWins: idList() }).strict()))),
    poll: pub(z.array(pub(z.object({ rank: pub(int(), 'index'), teamId: id(), points: pub(z.number(), 'points') }).strict()))),
    bowls: pub(z.array(pub(z.object({ bowlId: id(), nameKey: text(), teams: pair().nullable() }).strict()))),
    eligible: idList(), shortFill: idList(),
    titleGames: pub(z.array(pub(z.object({ conferenceId: id(), teams: pair(), champion: id().nullable() }).strict()))),
  }).strict()).nullable(),
  gamesCounted: count(),
}).strict();

const ScheduleGame = pub(z.object({
  gameId: id(), week: pub(int(), 'index'), phase: pub(z.enum(['preseason', 'regular', 'postseason'])), kickoff: Date, teamIds: pair(),
  venueName: text().nullable(), neutralSite: flag(), status: pub(z.enum(['scheduled', 'in_progress', 'final', 'postponed', 'cancelled'])),
  score: pub(z.tuple([int(), int()]), 'points').nullable(), conferenceGame: flag(),
}).strict());

export const ScheduleData = z.object({
  competitionId: id(), seasonYear: pub(int(), 'season_year'), teams: Teams,
  weeks: pub(z.array(pub(z.object({ week: pub(int(), 'index'), games: pub(z.array(ScheduleGame)), byes: idList() }).strict()))),
  teamId: id().nullable(),
  teamRows: pub(z.array(pub(z.object({
    week: pub(int(), 'index'), game: ScheduleGame.nullable(), opponentId: id().nullable(), site: pub(z.enum(['home', 'away', 'neutral'])).nullable(),
    tag: pub(z.enum(['illegal', 'short', 'short_mild', 'normal_minus_one', 'normal', 'long', 'mini_bye', 'bye'])), restDays: pub(int(), 'count').nullable(),
    result: pub(z.enum(['W', 'L', 'T'])).nullable(), opponentRecord: WLT.nullable(),
  }).strict()))),
}).strict();

export const TeamPageData = z.object({
  teamId: id(), team: TeamRef, nickname: text(), place: text(), competitionName: text().nullable(), groupNames: pub(z.array(z.string())),
  venue: pub(z.object({ name: text(), place: text(), capacity: count(), roof: text(), surfaceType: text() }).strict()).nullable(),
  resourceBand: text(), seasonYear: pub(int(), 'season_year'), record: WLT, results: pub(z.array(ScheduleGame)), upcoming: pub(z.array(ScheduleGame)),
  staff: pub(z.array(pub(z.object({ jobId: id(), catalogueId: text(), personId: id().nullable(), name: text().nullable(), holding: text().nullable() }).strict()))),
  openChairs: count(),
  roster: pub(z.array(pub(z.object({ personId: id(), name: text(), position: text().nullable(), jersey: pub(int(), 'index').nullable(), list: text() }).strict()))),
  rivals: idList(),
  tendencies: pub(z.array(pub(z.object({ situationBucket: text(), callKey: text(), count: count(), share: ratio() }).strict()))),
  teams: Teams,
}).strict().nullable();

export const TransactionsData = z.object({
  competitionId: id().nullable(),
  lines: pub(z.array(pub(z.object({
    eventId: id(), type: text(), date: Date, teamId: id().nullable(), personIds: idList(), lineTemplate: text(), params: Params,
    mine: flag(), opponent: flag(), division: flag(), readyList: flag(),
  }).strict()))),
  teams: Teams, people: People,
}).strict();

export const NewsData = z.object({
  lines: pub(z.array(pub(z.object({
    newsId: id(), date: Date, kind: text(), templateKey: text(), params: Params, teamIds: idList(), personIds: idList(), audience: text(), mine: flag(),
  }).strict()))),
  kinds: pub(z.array(z.string())), teams: Teams, people: People,
}).strict();

export const RecordsData = z.object({
  competitionId: id(), seasonYear: pub(int(), 'season_year').nullable(),
  honours: pub(z.array(pub(z.object({
    eventId: id(), type: text(), seasonYear: pub(int(), 'season_year'), lineTemplate: text(), params: Params, personIds: idList(), teamId: id().nullable(), reversed: flag(),
  }).strict()))),
  books: pub(z.array(pub(z.object({
    recordId: text(), statistic: text(), scope: text(), holder: pub(z.enum(['player', 'team'])), direction: pub(z.enum(['most', 'fewest'])),
    entries: pub(z.array(pub(z.object({ rank: pub(int(), 'index'), holderId: id(), value: pub(z.number(), 'count'), season: pub(int(), 'season_year'), gameId: id().nullable(), seasonGames: count().nullable(), imported: flag() }).strict()))),
  }).strict()))),
  history: pub(z.array(pub(z.object({ seasonYear: pub(int(), 'season_year'), champion: id().nullable(), honours: count() }).strict()))),
  teams: Teams, people: People,
}).strict();

export const LEAGUE_DATA = {
  standings: StandingsData, schedule: ScheduleData, team: TeamPageData,
  transactions: TransactionsData, news: NewsData, records: RecordsData,
} as const;
