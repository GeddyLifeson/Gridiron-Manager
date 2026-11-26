// Origin cards (S2.1.1) and archetype presets (E1.7.2). Both are sets of past facts only: no values,
// no descriptors, no bonuses. They fill creation choices, which then pass the same checks as manual
// creation (E1.7.1). Ages are the bible's starting values; each card names the real hiring pattern it
// reflects without naming any real person (A6).
import type { CreationChoices, Education, FootballIdentity, HouseholdChoice, Level, PlayingHistory, StartMode } from './creation.ts';

/** S2.1.1 origin table, starting values. `history` is what he has already done, as fact kinds. */
export interface OriginCard {
  readonly id: string;
  readonly ageMin: number;
  readonly ageMax: number;
  readonly playing: PlayingHistory['level'];
  /** Professional seasons range for the former pro origin (2 to 10). */
  readonly proSeasons: readonly [number, number];
  readonly historyFacts: readonly string[];
  /** Who starts in his relationship graph (L4), by role, filled from his home program's staff. */
  readonly networkSeed: readonly string[];
  readonly money: 'none' | 'savings_by_career' | 'teacher_salary' | 'part_time_pay' | 'savings' | 'family_support';
  /** Text key of the card's main cost line. */
  readonly costKey: string;
  /** Weight with which generated entrants draw this origin each year (S2.1.1 AI use). */
  readonly entrantWeight: number;
  /** May be combined with another origin (S2.1.1 edge case: coach's son or daughter). */
  readonly combinable: boolean;
}

export const ORIGINS: readonly OriginCard[] = [
  { id: 'college_player_staying_on', ageMin: 22, ageMax: 22, playing: 'major_college', proSeasons: [0, 0], historyFacts: ['played_position_in_system'], networkSeed: ['position_coach', 'coordinator', 'head_coach', 'teammates'], money: 'none', costKey: 'origin.cost.one_system_one_position', entrantWeight: 0.4, combinable: false },
  { id: 'former_pro_player', ageMin: 28, ageMax: 34, playing: 'pro_long', proSeasons: [2, 10], historyFacts: ['played_position_professionally'], networkSeed: ['pro_coaches_played_for', 'college_coaches_played_for'], money: 'savings_by_career', costKey: 'origin.cost.no_film_work_late_start', entrantWeight: 0.05, combinable: false },
  { id: 'student_manager', ageMin: 18, ageMax: 18, playing: 'none', proSeasons: [0, 0], historyFacts: ['worked_practices_and_equipment'], networkSeed: ['equipment_staff', 'position_coach'], money: 'none', costKey: 'origin.cost.no_player_credit', entrantWeight: 0.125, combinable: false },
  { id: 'student_video_or_data_assistant', ageMin: 18, ageMax: 18, playing: 'none', proSeasons: [0, 0], historyFacts: ['used_film_and_data_tools'], networkSeed: ['video_coordinator', 'quality_control_coaches'], money: 'none', costKey: 'origin.cost.no_teaching', entrantWeight: 0.125, combinable: false },
  { id: 'high_school_coach', ageMin: 24, ageMax: 30, playing: 'small_college', proSeasons: [0, 0], historyFacts: ['taught_ran_practices_called_plays_high_school'], networkSeed: ['area_college_recruiters'], money: 'teacher_salary', costKey: 'origin.cost.older_local_network', entrantWeight: 0.15, combinable: false },
  { id: 'small_college_assistant', ageMin: 23, ageMax: 23, playing: 'small_college', proSeasons: [0, 0], historyFacts: ['coaching_seat_lower_division'], networkSeed: ['own_staff'], money: 'part_time_pay', costKey: 'origin.cost.far_from_big_programs', entrantWeight: 0.1, combinable: false },
  { id: 'outsider_analyst', ageMin: 25, ageMax: 35, playing: 'none', proSeasons: [0, 0], historyFacts: ['built_models_outside_football'], networkSeed: ['staff_member_who_hired_him'], money: 'savings', costKey: 'origin.cost.no_credit_new_terminology', entrantWeight: 0.03, combinable: false },
  { id: 'coachs_child', ageMin: 18, ageMax: 22, playing: 'none', proSeasons: [0, 0], historyFacts: ['grew_up_in_meeting_rooms'], networkSeed: ['parent_coaching_tree'], money: 'family_support', costKey: 'origin.cost.success_discounted_as_inherited', entrantWeight: 0.02, combinable: true },
];

export function origin(id: string): OriginCard {
  const o = ORIGINS.find((x) => x.id === id);
  if (!o) throw new Error(`coach: unknown origin ${id}`);
  return o;
}

const NO_EDUCATION: Education = { degree: 'none', field: null, military: false, otherWorkYears: 0 };
const BACHELOR: Education = { degree: 'bachelor', field: 'education', military: false, otherWorkYears: 0 };
const SINGLE: HouseholdChoice = { kind: 'single', childAges: [], partnerHasCareer: false, homeRegion: null };
const FAMILY: HouseholdChoice = { kind: 'partner_children', childAges: [12, 9], partnerHasCareer: false, homeRegion: null };
const id = (side: FootballIdentity['side'], positionGroup: FootballIdentity['positionGroup'], intendsToCall: boolean): FootballIdentity =>
  ({ side, positionGroup, intendsToCall, offensiveFamily: null, defensiveFamily: null });

/** Origin card to creation choices (a nobody start at rung 0). Ages take the card's lower bound. */
export function choicesFromOrigin(originId: string, level: Level, seed: number): CreationChoices {
  const o = origin(originId);
  const pro = o.playing === 'pro_long' ? o.proSeasons[1] : 0;
  const playing: PlayingHistory = { level: o.playing === 'pro_long' && pro <= 4 ? 'pro_short' : o.playing, positionGroup: o.playing === 'none' ? 'none' : 'LB', proSeasons: pro };
  const age = Math.max(o.ageMin, o.playing === 'pro_long' ? 22 + pro : o.ageMin);
  return {
    level, start: 'nobody', experienced: false, origin: o.id, playing,
    education: o.playing === 'major_college' || o.id === 'high_school_coach' || o.id === 'small_college_assistant' ? BACHELOR : NO_EDUCATION,
    mentors: [], coachingSeasons: null, identity: id('defense', playing.positionGroup === 'none' ? 'LB' : playing.positionGroup, false),
    name: { first: 'New', last: 'Coach' }, age: Math.min(age, o.ageMax), appearanceKey: 0, household: SINGLE,
    firstTeamId: null, openJobsOnly: true, seed,
  };
}

/** E1.7.2 preset table (depth pass 2026-11-26). Past facts only. */
export interface Preset {
  readonly id: string;
  readonly start: StartMode;
  readonly level: Level;
  readonly experienced: boolean;
  readonly age: number;
  readonly playing: PlayingHistory;
  readonly education: Education;
  readonly coachingSeasons: number | null;
  readonly identity: FootballIdentity;
  readonly household: HouseholdChoice;
  /** Text key of the real hiring pattern shown on the card. */
  readonly patternKey: string;
}

export const PRESETS: readonly Preset[] = [
  // "Head coach (pro) or coordinator", age 34: a pro head start needs 16 written seasons (age 38 at least),
  // so the age-34 card is the coordinator start.
  { id: 'young_offensive_play_caller', start: 'coordinator', level: 'pro', experienced: false, age: 34, playing: { level: 'major_college', positionGroup: 'QB', proSeasons: 0 }, education: BACHELOR, coachingSeasons: 12, identity: id('offense', 'QB', true), household: SINGLE, patternKey: 'preset.pattern.offensive_coordinators_hired' },
  { id: 'veteran_defensive_coordinator', start: 'head_coach', level: 'pro', experienced: false, age: 52, playing: { level: 'small_college', positionGroup: 'DB', proSeasons: 0 }, education: BACHELOR, coachingSeasons: 24, identity: id('defense', 'DB', true), household: FAMILY, patternKey: 'preset.pattern.defensive_coordinators_hired' },
  { id: 'former_quarterback_turned_coach', start: 'position_coach', level: 'pro', experienced: false, age: 36, playing: { level: 'pro_long', positionGroup: 'QB', proSeasons: 8 }, education: BACHELOR, coachingSeasons: 6, identity: id('offense', 'QB', false), household: FAMILY, patternKey: 'preset.pattern.former_players' },
  { id: 'special_teams_lifer', start: 'coordinator', level: 'pro', experienced: false, age: 45, playing: { level: 'small_college', positionGroup: 'specialists', proSeasons: 0 }, education: BACHELOR, coachingSeasons: 14, identity: id('special_teams', 'specialists', true), household: FAMILY, patternKey: 'preset.pattern.special_teams_coordinators' },
  { id: 'college_head_coach_moving_up', start: 'head_coach', level: 'pro', experienced: true, age: 49, playing: { level: 'major_college', positionGroup: 'LB', proSeasons: 0 }, education: BACHELOR, coachingSeasons: 22, identity: id('defense', 'LB', true), household: FAMILY, patternKey: 'preset.pattern.college_head_coaches_hired' },
  { id: 'retread_head_coach', start: 'head_coach', level: 'pro', experienced: true, age: 55, playing: { level: 'major_college', positionGroup: 'OL', proSeasons: 0 }, education: BACHELOR, coachingSeasons: 24, identity: id('offense', 'OL', true), household: FAMILY, patternKey: 'preset.pattern.second_chance_hires' },
  { id: 'small_college_climber', start: 'head_coach', level: 'college', experienced: false, age: 41, playing: { level: 'small_college', positionGroup: 'WR', proSeasons: 0 }, education: BACHELOR, coachingSeasons: 18, identity: id('offense', 'WR', true), household: FAMILY, patternKey: 'preset.pattern.smaller_program_head_coaches' },
];

/** Preset to creation choices. Mentors are left for the validator to fill from the world (E1.6.1 table). */
export function choicesFromPreset(p: Preset, seed: number, firstTeamId: number | null, openJobsOnly = true): CreationChoices {
  return {
    level: p.level, start: p.start, experienced: p.experienced, origin: null, playing: p.playing, education: p.education,
    mentors: [], coachingSeasons: p.coachingSeasons, identity: p.identity, name: { first: 'New', last: 'Coach' }, age: p.age,
    appearanceKey: 0, household: p.household, firstTeamId, openJobsOnly, seed,
  };
}
