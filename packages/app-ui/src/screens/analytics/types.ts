// The analytics read-model data as the screen draws it. Same shapes as the read models in
// app-services/src/read-models/analytics/ (schemas in its test folder until CR-G71-1 moves them to
// @gm/schema); app-ui imports only the app-services entry point, so the shapes are written here too.

export type Mark = 'solid' | 'fair' | 'thin';
export type FourthOption = 'go' | 'field_goal' | 'punt';
export type Delivery = 'on_schedule' | 'late' | 'user_builds' | 'not_available';
export type TrackingLevel = 'full' | 'practice_only' | 'none';

export interface StrengthRow {
  teamId: number; name: string; abbreviation: string;
  offense: number; defense: number; specialTeams: number; total: number;
  seOffense: number; seDefense: number; seSpecialTeams: number; seTotal: number;
  games: number; priorWeight: number; gameIds: number[]; mark: Mark;
}
export interface StrengthData { competitionId: number; seasonYear: number; homeAdvantage: number; homeAdvantageSe: number; teams: StrengthRow[] }

export interface Hidden { teamId: number; visible: false }

export interface ReportPlanRow { report: 'decision_chart' | 'team_strength' | 'load_report' | 'game_tracking' | 'variance_brief' | 'live_wp'; delivery: Delivery; hours: number }
export type AccessData = Hidden | { teamId: number; visible: true; plan: { teamId: number; tracking: TrackingLevel; analysts: number; reports: ReportPlanRow[] } };

export interface ChartCell { yardsToGoalYd: number; distanceYd: number; approved: FourthOption; model: FourthOption; marginWp: number; coachsCall: boolean; mark: Mark }
export interface TwoPointRow { scoreDiffBeforeTry: number; gameSecondsLeft: number; choice: 'kick' | 'two'; marginWp: number; coachsCall: boolean }
export type ChartData = Hidden | {
  teamId: number; visible: true;
  chart: { delivery: Delivery; cells: ChartCell[] | null; twoPoint: TwoPointRow[] | null; edits: { id: string; option: FourthOption; offsetWp: number; reason: string }[] };
};

export interface Movement { distanceYd: number; highSpeedYd: number; sprints: number; topSpeedYdS: number; accelerations: number; decelerations: number }
export interface TrackingRow { personId: number; name: string; yesterdayYd: number; ratio: number | null; flag: 'underloaded' | 'normal' | 'spike' | null; fromReturnPlan: boolean; checkOnHim: boolean; game: Movement | null }
export type TrackingData = Hidden | { teamId: number; visible: true; report: { level: TrackingLevel; practice: boolean; games: boolean; rows: TrackingRow[] } };

/** Everything the screen may show; a missing model shows a waiting line. */
export interface AnalyticsData {
  strength?: StrengthData;
  access?: AccessData;
  chart?: ChartData;
  tracking?: TrackingData;
}

export const ANALYTICS_TABS = ['strength', 'chart', 'two_point', 'tracking', 'staff', 'limits'] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];
