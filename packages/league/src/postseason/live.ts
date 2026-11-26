// The live league picture for one week (C3.1 to C3.3 pro, T3.3 to T3.6 college): everything the league
// pages show beyond the plain table, computed from the games played so far. The season session calls it
// after each week and hands the result to the league page read models as their standings source; the
// shape matches that source field by field. Seeded draws come from the caller (J13 streams), because
// the league package may not import engine-core.
//
// Pro: tiebroken division order and seeds (C3.1.3, C3.3.1), clinch and elimination (C3.3.2), and playoff
// odds (C3.3.3) when the caller gives a win model.
// College: conference standings (T3.3.1), the media and coaches' polls from voter panels (T3.4.1 rule 2),
// the committee ranking from its first release week (rule 3), the field "if the season ended today",
// and bowls once the regular season is over (T3.6.1).
import { clinchStatus, playoffOdds, type ClinchStatus, type PlayoffOdds, type RemainingGame, type WinModel } from '../standings/clinch.ts';
import { conferenceStandings, STARTING_CHAIN, type CollegeStepId, type ConferenceStandings, type TitleMethod } from '../standings/college.ts';
import { seasonTable, type SeasonTable } from '../standings/seeding.ts';
import type { ClubPlace, GameResult, RuleValues, TeamId, TieDraw } from '../standings/types.ts';
import { selectBowls, type BowlDef, type BowlSelection } from './bowls.ts';
import { selectCollegeField, type CollegeField } from './college-field.ts';
import { param } from './params.ts';
import { committeeRanking, type Resume, type Uniform } from './rankings.ts';
import { panelPoll, type PanelPoll, type PollState, type Voter } from './voters.ts';

/** Seeded draws by label, each backed by its own J13 stream. */
export type UniformFor = (label: string) => Uniform;

export interface LiveProInput {
  readonly places: readonly ClubPlace[];
  /** False for a level whose games cannot end tied (clinch enumeration skips ties). */
  readonly allowTies: boolean;
  /** The simple game model for odds (C3.3.3); without it, odds are not computed. */
  readonly winModel?: WinModel;
  readonly oddsSimulations?: number;
  /** Clinch enumeration budget (C3.3.2); past it the percentage bound is used. Defaults to the standings parameter. */
  readonly clinchNodeBudget?: number;
}

export interface LiveConference {
  readonly conferenceId: number;
  readonly power: boolean;
  readonly teamIds: readonly TeamId[];
  readonly titleMethod: TitleMethod;
  readonly chain?: readonly CollegeStepId[];
}

export interface LiveCollegeInput {
  /** Every team of the competition (top subdivision). */
  readonly teamIds: readonly TeamId[];
  readonly conferences: readonly LiveConference[];
  readonly independents: readonly TeamId[];
  readonly week: number;
  readonly preseason: ReadonlyMap<TeamId, number>;
  readonly prestige: ReadonlyMap<TeamId, number>;
  readonly panels: { readonly media: readonly Voter[]; readonly coach: readonly Voter[] };
  /** Last week's ballots, or null before the first poll. */
  readonly pollState: { readonly media: PollState | null; readonly coach: PollState | null };
  readonly seatBallot?: { readonly voterId: number; readonly ballot: readonly TeamId[] };
  /** Winners of title games already played, by conference. */
  readonly titleWinners?: ReadonlyMap<number, TeamId>;
  readonly bowls?: readonly BowlDef[];
  readonly academicScore?: (teamId: TeamId) => number;
}

export interface LiveInput {
  readonly rules: RuleValues;
  /** Games played so far (any phase but preseason counts where each step says). */
  readonly results: readonly GameResult[];
  /** Regular-season games not yet played. */
  readonly remaining: readonly RemainingGame[];
  readonly draw: TieDraw;
  readonly uniform: UniformFor;
  readonly pro?: LiveProInput;
  readonly college?: LiveCollegeInput;
}

export interface LivePicture {
  readonly rules: RuleValues;
  readonly pro?: { readonly table: SeasonTable; readonly clinch: readonly ClinchStatus[]; readonly odds: readonly PlayoffOdds[] };
  readonly college?: {
    readonly conferences: readonly ConferenceStandings[];
    readonly ranking: { readonly order: readonly TeamId[]; readonly resumes: readonly Resume[] } | null;
    /** The media poll (the page's main poll). */
    readonly poll: PanelPoll;
    readonly coachesPoll: PanelPoll;
    /** The field if the season ended today (from the committee ranking); null before its first release. */
    readonly projectedField: CollegeField | null;
    readonly bowls: BowlSelection | null;
  };
  readonly bracket: null;
  /** Carry into next week's input. */
  readonly pollState: { readonly media: PollState; readonly coach: PollState } | null;
}

function livePro(input: LiveInput, pro: LiveProInput): NonNullable<LivePicture['pro']> {
  const table = seasonTable(pro.places, input.results.filter((g) => g.phase === 'regular'), input.rules, input.draw);
  const regular = input.results.filter((g) => g.phase === 'regular');
  const clinch = clinchStatus(pro.places, regular, input.remaining, input.rules, input.draw, { allowTies: pro.allowTies, ...(pro.clinchNodeBudget !== undefined ? { nodeBudget: pro.clinchNodeBudget } : {}) });
  const odds = pro.winModel
    ? playoffOdds(pro.places, regular, input.remaining, input.rules, pro.winModel, input.uniform('standings.odds'), input.draw, pro.oddsSimulations)
    : [];
  return { table, clinch, odds };
}

function liveCollege(input: LiveInput, c: LiveCollegeInput): { college: NonNullable<LivePicture['college']>; pollState: NonNullable<LivePicture['pollState']> } {
  const conferences = c.conferences.map((conf) => conferenceStandings(
    { conferenceId: conf.conferenceId, teamIds: conf.teamIds, chain: conf.chain ?? STARTING_CHAIN, titleMethod: conf.titleMethod },
    input.results, input.rules, input.draw, c.titleWinners?.get(conf.conferenceId) ?? null,
  ));
  const champions = conferences.map((s) => s.champion).filter((t): t is TeamId => t !== null);
  // For a projection, a conference whose title game is still to come is led by its first-place team.
  const projectedChampion = (s: ConferenceStandings): TeamId | null => s.champion ?? s.order[0] ?? null;
  const conferenceOf = new Map(c.conferences.flatMap((conf) => conf.teamIds.map((t) => [t, conf.conferenceId] as const)));
  const pollInput = (voters: readonly Voter[], previous: PollState | null, seat: boolean) => ({
    teamIds: c.teamIds, results: input.results, champions, week: c.week, preseason: c.preseason, prestige: c.prestige,
    conferenceOf, voters, previous, ...(seat && c.seatBallot ? { seatBallot: c.seatBallot } : {}),
  });
  const poll = panelPoll(pollInput(c.panels.media, c.pollState.media, false), input.rules, input.uniform(`poll.media.${c.week}`));
  const coachesPoll = panelPoll(pollInput(c.panels.coach, c.pollState.coach, true), input.rules, input.uniform(`poll.coach.${c.week}`));

  let ranking: NonNullable<LivePicture['college']>['ranking'] = null;
  let projectedField: CollegeField | null = null;
  if (c.week >= param('postseason.committee.firstWeek')) {
    const r = committeeRanking({ teamIds: c.teamIds, results: input.results, champions }, input.rules, input.uniform(`committee.${c.week}`));
    ranking = { order: r.order, resumes: r.resumes };
    projectedField = selectCollegeField({
      ranking: r.order, independents: c.independents,
      conferences: c.conferences.map((conf, i) => ({ conferenceId: conf.conferenceId, power: conf.power, champion: projectedChampion(conferences[i]!), teamIds: conf.teamIds })),
    }, input.rules);
  }

  let bowls: BowlSelection | null = null;
  if (input.remaining.length === 0 && c.bowls && ranking && projectedField) {
    const rankIn = new Map(conferences.flatMap((s) => s.order.map((t, i) => [t, { conferenceId: s.conferenceId, rank: i + 1 }] as const)));
    const academic = c.academicScore ?? (() => 0);
    bowls = selectBowls({
      teams: c.teamIds.map((t) => ({ teamId: t, conferenceId: rankIn.get(t)?.conferenceId ?? null, conferenceRank: rankIn.get(t)?.rank ?? 1, academicScore: academic(t) })),
      results: input.results.filter((g) => g.phase === 'regular'), ranking: ranking.order, playoffTeams: projectedField.seeds, bowls: c.bowls,
    }, input.rules);
  }
  return { college: { conferences, ranking, poll, coachesPoll, projectedField, bowls }, pollState: { media: poll.state, coach: coachesPoll.state } };
}

/** The week's league picture. Pure: the same results, rules and streams give the same picture. */
export function livePicture(input: LiveInput): LivePicture {
  const pro = input.pro ? livePro(input, input.pro) : undefined;
  const col = input.college ? liveCollege(input, input.college) : undefined;
  return {
    rules: input.rules,
    ...(pro ? { pro } : {}),
    ...(col ? { college: col.college } : {}),
    bracket: null,
    pollState: col ? col.pollState : null,
  };
}
