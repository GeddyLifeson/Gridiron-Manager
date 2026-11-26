// Moved here from app-services/test/read-models/analytics/schemas.ts (CR-G71-1); registered in READ_MODELS (commands.ts).
// Data schemas of the analytics read models (G-71). They live here because app-services may not import
// zod (CR-G71-1, same as CR-G27-4); the integrator moves this file into @gm/schema and passes the
// schemas to `analyticsReadModels`. Every field carries a visibility class: the league strength table
// is public (a public-information estimate, N2.6.1 rule 4); the staff's chart, report plan and load
// report are the team's own.
import { z } from 'zod';
import { pub, own } from '../field.ts';

const Mark = z.enum(['solid', 'fair', 'thin']);
const Option = z.enum(['go', 'field_goal', 'punt']);
const Delivery = z.enum(['on_schedule', 'late', 'user_builds', 'not_available']);
const Level = z.enum(['full', 'practice_only', 'none']);

export const AnalyticsStrengthData = z.object({
  competitionId: pub(z.number().int(), 'id'),
  seasonYear: pub(z.number().int(), 'season_year'),
  homeAdvantage: pub(z.number(), 'points'),
  homeAdvantageSe: pub(z.number().min(0), 'points'),
  teams: pub(z.array(z.object({
    teamId: pub(z.number().int(), 'id'),
    name: pub(z.string()),
    abbreviation: pub(z.string()),
    offense: pub(z.number(), 'points'),
    defense: pub(z.number(), 'points'),
    specialTeams: pub(z.number(), 'points'),
    total: pub(z.number(), 'points'),
    seOffense: pub(z.number().min(0), 'points'),
    seDefense: pub(z.number().min(0), 'points'),
    seSpecialTeams: pub(z.number().min(0), 'points'),
    seTotal: pub(z.number().min(0), 'points'),
    games: pub(z.number().min(0), 'count'),
    priorWeight: pub(z.number().min(0).max(1), 'ratio'),
    gameIds: pub(z.array(z.number().int()), 'id'),
    mark: pub(Mark),
  }).strict())),
}).strict();

const ReportPlan = z.object({
  report: own(z.enum(['decision_chart', 'team_strength', 'load_report', 'game_tracking', 'variance_brief', 'live_wp'])),
  delivery: own(Delivery),
  hours: own(z.number().min(0), 'count'),
}).strict();

const Hidden = z.object({ teamId: pub(z.number().int(), 'id'), visible: pub(z.literal(false)) }).strict();

export const AnalyticsAccessData = z.union([
  Hidden,
  z.object({
    teamId: pub(z.number().int(), 'id'),
    visible: pub(z.literal(true)),
    plan: own(z.object({
      teamId: own(z.number().int(), 'id'),
      tracking: own(Level),
      analysts: own(z.number().int().min(0), 'count'),
      reports: own(z.array(ReportPlan)),
    }).strict()),
  }).strict(),
]);

export const AnalyticsChartData = z.union([
  Hidden,
  z.object({
    teamId: pub(z.number().int(), 'id'),
    visible: pub(z.literal(true)),
    chart: own(z.object({
      delivery: own(Delivery),
      cells: own(z.array(z.object({
        yardsToGoalYd: own(z.number().int(), 'yd'),
        distanceYd: own(z.number().int(), 'yd'),
        approved: own(Option),
        model: own(Option),
        marginWp: own(z.number().min(0), 'ratio'),
        coachsCall: own(z.boolean()),
        mark: own(Mark),
      }).strict())).nullable(),
      twoPoint: own(z.array(z.object({
        scoreDiffBeforeTry: own(z.number().int(), 'points'),
        gameSecondsLeft: own(z.number().min(0), 's'),
        choice: own(z.enum(['kick', 'two'])),
        marginWp: own(z.number().min(0), 'ratio'),
        coachsCall: own(z.boolean()),
      }).strict())).nullable(),
      edits: own(z.array(z.object({
        id: own(z.string()),
        option: own(Option),
        offsetWp: own(z.number(), 'ratio'),
        reason: own(z.string()),
      }).strict())),
    }).strict()),
  }).strict(),
]);

const Movement = z.object({
  distanceYd: own(z.number().min(0), 'yd'),
  highSpeedYd: own(z.number().min(0), 'yd'),
  sprints: own(z.number().int().min(0), 'count'),
  topSpeedYdS: own(z.number().min(0), 'yd_per_s'),
  accelerations: own(z.number().int().min(0), 'count'),
  decelerations: own(z.number().int().min(0), 'count'),
}).strict();

export const AnalyticsTrackingData = z.union([
  Hidden,
  z.object({
    teamId: pub(z.number().int(), 'id'),
    visible: pub(z.literal(true)),
    report: own(z.object({
      level: own(Level),
      practice: own(z.boolean()),
      games: own(z.boolean()),
      rows: own(z.array(z.object({
        personId: own(z.number().int(), 'id'),
        name: own(z.string()),
        yesterdayYd: own(z.number().min(0), 'yd'),
        ratio: own(z.number().min(0), 'ratio').nullable(),
        flag: own(z.enum(['underloaded', 'normal', 'spike'])).nullable(),
        fromReturnPlan: own(z.boolean()),
        checkOnHim: own(z.boolean()),
        game: own(Movement).nullable(),
      }).strict())),
    }).strict()),
  }).strict(),
]);

export const ANALYTICS_SCHEMAS = { strength: AnalyticsStrengthData, access: AnalyticsAccessData, chart: AnalyticsChartData, tracking: AnalyticsTrackingData };
