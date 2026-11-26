// The decision components of N4.1.1. Each names what it is measured from and the real job it maps to.
// The score describes logged decisions, never the person (N4 "What this category covers").

export type ComponentId =
  | 'game_management' | 'offensive_play_calling' | 'defensive_play_calling' | 'special_teams'
  | 'operation_speed' | 'game_planning' | 'play_design' | 'in_game_adjustment'
  | 'film_evaluation' | 'player_evaluation' | 'teaching_development' | 'people_program';

/** How a component turns into a number (or does not). */
export type ComponentUnit = 'wp' | 'ep' | 'share' | 'description';

export interface ComponentDef {
  readonly id: ComponentId;
  /** Text key of the component name. */
  readonly labelKey: string;
  readonly unit: ComponentUnit;
  /** Measured from (N4.1.1 middle column), as a short note for the description page. */
  readonly from: string;
  /** Real job it maps to (N4.1.1 last column), as job keys. */
  readonly jobs: readonly string[];
  /**
   * Scored against hidden truth (N4.1.1: film evaluation, player evaluation, teaching). The page shows
   * season aggregates only and never the single item that was wrong (audit Part 17).
   */
  readonly aggregateOnly: boolean;
}

function c(id: ComponentId, unit: ComponentUnit, from: string, jobs: string[], aggregateOnly = false): ComponentDef {
  return { id, labelKey: `rating.component.${id}`, unit, from, jobs, aggregateOnly };
}

export const COMPONENTS: readonly ComponentDef[] = [
  c('game_management', 'wp', 'N3.3.1 classes: fourth downs, tries, clock, timeouts, challenges, penalties', ['job.head_coach', 'job.game_management_assistant']),
  c('offensive_play_calling', 'ep', 'N3.3.2 foresight value and predictability', ['job.offensive_coordinator']),
  c('defensive_play_calling', 'ep', 'N3.3.2 foresight value and predictability, defensive calls', ['job.defensive_coordinator']),
  c('special_teams', 'wp', 'I4 decisions against the model', ['job.special_teams_coordinator']),
  c('operation_speed', 'share', 'decision time, late calls, pre-snap administrative fouls', ['job.play_caller']),
  c('game_planning', 'share', 'plan plays against what the opponent did; sheet calls with positive foresight; unscouted looks met', ['job.coordinator']),
  c('play_design', 'share', 'user-drawn plays against the playbook average; validity; exploit-flag rate (Q4)', ['job.coordinator', 'job.analyst']),
  c('in_game_adjustment', 'ep', 'change in call value after the first quarter and after halftime', ['job.coordinator']),
  c('film_evaluation', 'share', 'agreement of the user grades and coverage guesses with the truth (N1.2.3, N1.4.1)', ['job.quality_control', 'job.position_coach', 'job.scout'], true),
  c('player_evaluation', 'share', 'personnel follow-ups (N3.3.3); rankings against later performance', ['job.scout', 'job.position_coach'], true),
  c('teaching_development', 'share', 'knowledge and grade gains under the user plans against expected gains', ['job.position_coach'], true),
  c('people_program', 'description', 'trust, discipline consistency, promise record (L1 to L3)', ['job.head_coach']),
];

const BY_ID = new Map(COMPONENTS.map((d) => [d.id, d]));

export function component(id: ComponentId): ComponentDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`unknown decision record component ${id} (N4.1.1)`);
  return d;
}

/** I4 decision types: game-management views that belong to special teams (N4.1.1 row "Special teams decisions"). */
const SPECIAL_TEAMS_TYPES: ReadonlySet<string> = new Set(['kickoff_onside', 'punt_return_instructions', 'field_goal_attempt']);

/**
 * The component a logged decision type feeds from its model view, or null for types with no model
 * (N3.3.3 follow-ups feed player evaluation through `ExternalSample`s built by their owners).
 */
export function componentForType(type: string): ComponentId | null {
  if (SPECIAL_TEAMS_TYPES.has(type)) return 'special_teams';
  switch (type) {
    case 'coin_toss_choice': case 'fourth_down': case 'try': case 'timeout': case 'challenge':
    case 'penalty_acceptance': case 'clock_mode':
      return 'game_management';
    case 'offensive_play_call': return 'offensive_play_calling';
    case 'defensive_call': return 'defensive_play_calling';
    default: return null;
  }
}
