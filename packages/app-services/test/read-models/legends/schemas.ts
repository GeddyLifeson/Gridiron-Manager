// Data schemas of the legends read models (G-84). They live here because app-services may not import zod
// (CR-G84-1, same as CR-G27-4); the integrator moves this file into @gm/schema and passes the schemas to
// `legendsReadModels`. Every field is public: the legends views show the public record plus what reached
// this viewer, and the observer filter has already cut events to what he may see (X3.1.3).
import { z } from 'zod';
import { pub } from '@gm/schema';

const id = () => pub(z.number().int(), 'id');
const year = () => pub(z.number().int(), 'season_year');
const day = () => pub(z.number().int().min(0), 'day_index');
const count = () => pub(z.number().int().min(0), 'count');
const score = () => pub(z.number().min(0).max(100), 'scale').nullable();
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const PageKind = z.enum(['person', 'team', 'game', 'competition_season', 'trophy', 'record', 'position']);
const Link = z.object({ kind: pub(PageKind), id: id() }).strict();

const Mark = z.discriminatedUnion('via', [
  z.object({ via: pub(z.literal('public')) }).strict(),
  z.object({ via: pub(z.literal('witnessed')) }).strict(),
  z.object({ via: pub(z.literal('told')), sourcePersonId: id().nullable(), seasonYear: year(), dayIndex: day(), reported: pub(z.boolean()) }).strict(),
]);

const Line = z.object({
  eventId: id(), type: pub(z.string()), seasonYear: year(), dayIndex: day(), textKey: pub(z.string()),
  params: pub(z.record(z.string(), scalar), 'ratio'), links: pub(z.array(Link)), notability: score(), mark: pub(Mark), reversed: pub(z.boolean()),
}).strict();

export const LegendsPageData = z.object({
  link: pub(Link), seasonYear: year().nullable(), labels: pub(z.array(z.string())),
  years: pub(z.object({ first: year(), last: year() }).strict()).nullable(),
  summariesOnly: pub(z.boolean()), empty: pub(z.boolean()),
  seasons: pub(z.array(z.object({ seasonYear: year(), notable: pub(z.array(Line)), lines: pub(z.array(Line)) }).strict())),
  tabs: pub(z.array(z.object({ id: pub(z.string()), count: count() }).strict())),
}).strict();

const Entry = z.object({ eventId: id(), type: pub(z.string()), notability: score(), guaranteed: pub(z.boolean()) }).strict();
export const LegendsChronicleData = z.object({
  competitionId: id(), seasonYear: year(),
  summary: pub(z.object({ textKey: pub(z.string()), params: pub(z.record(z.string(), z.union([z.string(), z.number()])), 'ratio') }).strict()).nullable(),
  sections: pub(z.array(z.object({ section: pub(z.enum(['preseason', 'week', 'postseason', 'offseason'])), week: count(), entries: pub(z.array(Entry)), more: pub(z.array(Entry)) }).strict())),
  seasonLevelOnly: pub(z.boolean()),
}).strict();

const Rates = z.object({
  teamGames: count(), pointsPerTeamGame: pub(z.number(), 'points'), passShare: pub(z.number(), 'ratio'), yardsPerPlay: pub(z.number(), 'yd'),
  turnoversPerTeamGame: pub(z.number(), 'ratio'), penaltiesPerTeamGame: pub(z.number(), 'ratio'),
}).strict();
export const LegendsEraData = z.object({
  competitionId: id().nullable(),
  blocks: pub(z.array(z.object({
    index: count(), firstSeason: year(), lastSeason: year(), partial: pub(z.boolean()),
    teams: pub(z.array(z.object({
      teamId: id(), wins: count(), losses: count(), ties: count(), winShare: pub(z.number().min(0).max(1), 'ratio').nullable(), titles: count(), conferenceTitles: count(),
      headCoaches: pub(z.array(z.number().int()), 'id'), dynasty: pub(z.boolean()), seasonsSinceTitle: count().nullable(), seasonsSinceWinningSeason: count().nullable(),
    }).strict())),
    rates: pub(Rates).nullable(), topEventIds: pub(z.array(z.number().int()), 'id'),
    ruleMarkers: pub(z.array(z.object({ seasonYear: year(), ruleSetId: pub(z.string()) }).strict())),
  }).strict())),
}).strict();

const TreeNode = z.object({
  personId: id(), parentId: id(), level: count(),
  underParent: pub(z.array(z.object({ teamId: id(), role: pub(z.string()), firstSeason: year(), lastSeason: year(), hireEventIds: pub(z.array(z.number().int()), 'id') }).strict())),
  laterChairs: pub(z.array(z.object({ teamId: id(), role: pub(z.string()), level: pub(z.string()), firstSeason: year(), lastSeason: year() }).strict())),
  becameHeadCoach: pub(z.boolean()), expanded: pub(z.boolean()),
}).strict();
export const LegendsTreeData = z.object({
  rootId: id(), nodes: pub(z.array(TreeNode)), depth: count(), headCoachesProduced: count(), producedByLevel: pub(z.record(z.string(), z.number().int()), 'count'),
}).strict();

const Streak = z.object({ teamId: id().nullable(), games: count() }).strict();
const Margin = z.object({ gameId: id(), eventId: id(), margin: pub(z.number().min(0), 'points'), seasonYear: year() }).strict();
const Meeting = z.object({ eventId: id(), seasonYear: year() }).strict();
export const LegendsRivalryData = z.object({
  teamA: id(), teamB: id(), exists: pub(z.boolean()),
  page: pub(z.object({
    teamA: id(), teamB: id(), winsA: count(), winsB: count(), ties: count(), first: pub(Meeting).nullable(), last: pub(Meeting).nullable(),
    current: pub(Streak), longest: pub(Streak), largestA: pub(Margin).nullable(), largestB: pub(Margin).nullable(),
    byVenue: pub(z.array(z.object({ venueId: id().nullable(), meetings: count(), winsA: count(), winsB: count(), ties: count() }).strict())),
    topGameEventIds: pub(z.array(z.number().int()), 'id'),
    coaches: pub(z.array(z.object({ personId: id(), teamId: id(), wins: count(), losses: count(), ties: count() }).strict())),
    trophyKey: pub(z.string()).nullable(),
  }).strict()).nullable(),
}).strict();

const RecordRow = z.object({ rank: count(), holderId: id(), value: pub(z.number(), 'ratio'), teamId: id(), seasonYear: year(), gameId: id().nullable(), imported: pub(z.boolean()) }).strict();
export const LegendsRecordsData = z.object({
  competitionId: id().nullable(), teamId: id().nullable(), postseason: pub(z.boolean()),
  lists: pub(z.array(z.object({
    categoryId: pub(z.string()), scope: pub(z.enum(['game', 'season', 'career'])), postseason: pub(z.boolean()),
    minimum: pub(z.object({ per: pub(z.string()), value: pub(z.number().min(0), 'ratio'), perTeamGame: pub(z.boolean()), factId: pub(z.string()) }).strict()).nullable(),
    thisWorld: pub(z.array(RecordRow)), allTime: pub(z.array(RecordRow)), vacated: pub(z.array(RecordRow)),
  }).strict())),
}).strict();

export const LegendsSearchData = z.object({
  text: pub(z.string()),
  rows: pub(z.array(z.object({
    kind: pub(z.enum(['person', 'team', 'competition_season', 'trophy'])), id: id(), first: pub(z.string()), last: pub(z.string()), birthYear: year().nullable(),
    role: pub(z.string()).nullable(), lastTeamId: id().nullable(), match: pub(z.enum(['exact', 'prefix', 'fuzzy', 'all'])),
  }).strict())),
}).strict();

export const LEGENDS_SCHEMAS = {
  page: LegendsPageData, chronicle: LegendsChronicleData, era: LegendsEraData, tree: LegendsTreeData, rivalry: LegendsRivalryData, records: LegendsRecordsData, search: LegendsSearchData,
};
