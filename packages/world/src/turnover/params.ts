// Roster turnover constants (D6, D7, D8.4.1, K7, X12.1.2). Rule values (eligibility, draft rounds, roster
// limits) are read by key from the league rules, never stored here. Rows below are tuning, each a named
// Assumption until its owner's research lands.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.turnover';
const ROWS: readonly Row[] = [
  // D6.4.2: an off-screen AI evaluator with no staff record yet. The middle of the skill scale, the same
  // value the scouting module gives a person with no measured skill (`skill.userTerm`).
  ['grade.aiSkill', 50, 0, 100, 'skill points', 'assumption', 'D6.4.2', 'Off-screen evaluator skill until K2/L4 staff skill is read here. No source read'],
  // D6.4.2: one season of watching a rostered player stands for this many season units of evidence.
  ['grade.rosteredUnits', 1, 0.1, 10, 'season share', 'assumption', 'D6.4.2', 'One season of stats per look. No source read'],
  // D6.1.2: one workout (combine or pro day) for a prospect or free agent.
  ['grade.workoutUnits', 1, 0.1, 10, 'session', 'assumption', 'D6.1.2', 'One workout per look. No source read'],
  // K7.2.1: a position below its share of the real roster mix is worth this much more on the board.
  ['need.weight', 4, 0, 20, 'iss', 'assumption', 'K7.2.1', 'Need bonus on the board until front-office gm.needs is bound. No source read'],
  // M2: players at a position up to its mix count are starters for the development reps (D7.7.1 role).
  ['role.starterShareOfMix', 0.5, 0, 1, 'ratio', 'assumption', 'D7.7.1', 'Top half of each position by grade counts as starters. No source read'],
  // TO-06: the front office AI's contribution table until the J14.6.1 engine batch runs exist.
  ['gm.winsPerIss', 0.05, 0, 1, 'wins per iss-season', 'assumption', 'K7.2.2', 'One rate for every position until J14.6.1 runs; general managers spread it by their own position values. No source read'],
  ['gm.replacementQuantile', 0.1, 0, 0.5, 'quantile', 'assumption', 'K7.2.2', "Replacement level is this quantile of the club's own observed grades at the position. No source read"],
  ['gm.depthSlotWeight', 0.25, 0, 1, 'ratio', 'assumption', 'K7.2.2', 'Lineup weight of each depth slot past the starters. No source read'],
  // TO-08: K7.5.1 gives 8 to 9 offers per expected signee at power programs (status 2 of 3, front-office README). No source for other tiers: the same multiple for all.
  ['college.offersPerSignee', 8.5, 3, 20, 'offers per place', 'bible', 'K7.5.1', '8 to 9 at power programs (2 of 3); other tiers have no source and use the same value'],
  // TO-08: a recruit takes the offer from the program with the highest prestige plus his own noise, until the T4 recruiting week is bound.
  ['recruit.prestigeNoiseSd', 0.15, 0, 1, 'prestige units', 'assumption', 'T4.4', 'Stand-in for T4 prospect preferences (distance, playing time, relationships). No source read'],
  // TO-11 to TO-16: off-screen coach turnover (E2.3.4, E4.3, K7.6.1, K8.4.2). All Assumptions: no source read.
  ['coach.recordSeasons', 3, 1, 10, 'seasons', 'assumption', 'K8.4.2', "Seasons of a coach's public record (his teams' win share) a hiring side reads. No source read"],
  ['coach.tieSeasons', 5, 1, 20, 'seasons', 'assumption', 'K7.6.1', 'Seasons back a shared staff still counts as working together (familiarity, followers). No source read'],
  ['coach.tiePerSeason', 25, 1, 100, 'edge points', 'assumption', 'K7.6.1', 'Tie strength per season on the same staff, capped at 100, until X7 edges are bound. No source read'],
  ['coach.headMinRung', 6, 0, 9, 'rung', 'assumption', 'K8.4.2', 'Lowest rung on the head coach long list (assistant head coach and up). No source read'],
  ['coach.stepsBelow', 2, 0, 5, 'rungs', 'assumption', 'K7.6.1', 'An assistant opening considers people whose last rung is at most this far below it (market value paths, E2.4.1). No source read'],
  ['coach.followMinRung', 5, 0, 9, 'rung', 'assumption', 'E2.3.4', 'A new head coach offers chairs from this rung up to former colleagues (rule 2). No source read'],
  ['coach.unitBelowPoints', 3, 0, 14, 'points per game', 'assumption', 'K7.6.1', "A coordinator's unit is below the AI head coach's standard when it is this far worse than the competition's mean (points scored or allowed). No source read"],
  ['coach.aliveWinShare', 0.5, 0, 1, 'win share', 'assumption', 'E4.3.3', 'A team that can still finish at this win share is alive for the postseason. No source read'],
  ['coach.formerPlayerMaxAge', 35, 22, 60, 'years', 'assumption', 'E2.1.1', 'Oldest former player who starts at rungs 0 to 2 when the coach pools run dry. No source read'],
  ['coach.needsMiddle', 0.5, 0, 1, 'weight', 'assumption', 'L4.2.3', 'X5 need weights of an off-screen candidate until needs are bound (every need at the middle). No source read'],
  // Player-to-coach pipeline (D13.3.5 rules 3a and 4, pipeline.ts). Facts: F-pipeline-0001 (a quarter to a third of NFL head
  // coaches played in the NFL, Verified), F-pipeline-0002 (position shares of head coaches who played, Verified),
  // F-pipeline-0003 (9 percent of ex-NFL players coach at any level, 1 of 3). No source gives an entry rate by level.
  ['pipeline.proBase', 0.06, 0, 0.5, 'chance', 'bible', 'D13.3.5', 'D13.3.5 starting value 6 percent; under the 9 percent of ex-NFL players coaching at any level (F-pipeline-0003, 1 of 3); fitted toward F-pipeline-0001 by the calibration run'],
  ['pipeline.collegeBase', 0.03, 0, 0.5, 'chance', 'bible', 'D13.3.5', 'D13.3.5 starting value 3 percent. No source read for finishing college players'],
  ['pipeline.pos.QB', 5.6, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002: share of head coaches who played QB over the QB roster share (Sickos 2025, SI 2024 agrees)'],
  ['pipeline.pos.RB', 0.82, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002 (RB and FB)'],
  ['pipeline.pos.WR', 0.83, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002'],
  ['pipeline.pos.TE', 0.61, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002'],
  ['pipeline.pos.OL', 0.59, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002'],
  ['pipeline.pos.DL', 0.4, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002'],
  ['pipeline.pos.LB', 1.26, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002'],
  ['pipeline.pos.DB', 1.12, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002'],
  ['pipeline.pos.ST', 0.14, 0.1, 20, 'odds ratio', 'bible', 'D13.3.5', 'F-pipeline-0002 (kickers, punters, snappers)'],
  ['pipeline.iqSlope', 0.25, 0, 2, 'log odds per 10 iss', 'assumption', 'D13.3.5', 'D4 football intelligence raises the chance (rule 3a names it); size not sourced'],
  ['pipeline.leadershipSlope', 0.25, 0, 2, 'log odds per 10 facet points', 'assumption', 'D13.3.5', 'D5 leadership raises the chance (rule 3a names it); size not sourced'],
  ['pipeline.loveSlope', 0.2, 0, 2, 'log odds per 10 facet points', 'assumption', 'D8.4.1', 'Love of football (D8.4.1 keeps players playing; the same pull keeps them in football); size not sourced'],
  ['pipeline.goalOdds', 3, 1, 20, 'odds ratio', 'assumption', 'X1.1.4', 'A player holding the coach_after_playing goal. No source read'],
  ['pipeline.proSeasonSlope', 0.08, 0, 1, 'log odds per season', 'assumption', 'D13.3.5', 'Career length raises the chance (rule 3a); ex-NFL head coaches averaged 7.5 NFL seasons (33rd Team, 1 of 3) against a mean career near 6 (Harvard FPHS cohort 6.7)'],
  ['pipeline.proSeasonsMean', 4, 0, 20, 'seasons', 'assumption', 'D13.3.5', 'Centre of the career-length term. No source read for the world mean'],
  ['pipeline.waitSeasons', 3, 0, 10, 'seasons', 'assumption', 'X11.1.3', 'Seasons a would-be coach waits for a first chair before leaving football for good. No source read'],
  ['pipeline.collegeEntryRung', 2, 0, 9, 'rung', 'assumption', 'E2.1.1', 'Finishing college players start as graduate assistants (catalogue rung 2)'],
  ['pipeline.proEntryRung', 3, 0, 9, 'rung', 'assumption', 'E2.1.1', 'Former pro players can start at quality control (rung 3)'],
  ['pipeline.veteranSeasons', 8, 1, 20, 'seasons', 'assumption', 'E1.2.1', 'A pro career this long can start at assistant position coach (E1 former_pro_player origin plays 2 to 10 seasons). No source read'],
  ['pipeline.veteranEntryRung', 4, 0, 9, 'rung', 'assumption', 'E2.1.1', 'Assistant position coach (catalogue rung 4)'],
  ['pipeline.playedUnderTiePerSeason', 15, 0, 100, 'edge points', 'assumption', 'D13.3.5', 'Rule 4: a coach knows the players he coached; per season together, capped at 100. Below a staff season (coach.tiePerSeason 25). No source read'],
  ['pipeline.coldConsidered', 0.02, 0, 1, 'chance per opening', 'assumption', 'D13.3.5', 'A former player with no coach to vouch for him is read for an opening with this chance (cold application). Real entry jobs go mostly to people the coach knows or who are referred (Coaching Portfolio 2023, EYES UP 2026); no rate found'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a turnover constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world turnover parameter ${name}`);
  return v;
}

/** Rule keys this module reads (rules-data). A key a league does not hold switches that part off for it. */
export const RULE_KEY = {
  seasonsOfCompetition: 'eligibility.seasons_of_competition',
  clockYears: 'eligibility.seasons_clock_years',
  draftRounds: 'league_rules.draft.rounds',
  offseasonLimit: 'roster.offseason_limit',
} as const;
