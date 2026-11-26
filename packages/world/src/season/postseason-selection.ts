// Postseason by selection (T3.3 to T3.6): conference standings and title games, the committee ranking,
// the selected playoff field in one national bracket, and bowls for eligible teams outside it. Which
// conferences hold a title game, how many places are automatic and how large the field is all come from
// the input and the league-rules file.
import { postseason, standings } from '@gm/league';
import { bracketFixtures } from './postseason-bracket.ts';
import type { PostContext, PostFixture, PostseasonPlan, TeamId } from './types.ts';

export interface SelectionConference {
  readonly conferenceId: number;
  /** Power conference flag (T2 tiers). */
  readonly power: boolean;
  readonly teamIds: readonly TeamId[];
  readonly titleMethod: standings.TitleMethod;
  /** Tiebreak chain; the starting chain when left out (real chains are Unverified, T3.3.1). */
  readonly chain?: readonly standings.CollegeStepId[];
}

export interface SelectionInput {
  readonly conferences: readonly SelectionConference[];
  /** Power-level independents (T3.5.1). */
  readonly independents: readonly TeamId[];
  readonly bowls: readonly postseason.BowlDef[];
  /** Academic measure for the short-fill rule (T5.3), higher is better. */
  readonly academicScore: (teamId: TeamId) => number;
}

export interface SelectionPostState {
  readonly stage: 'titles' | 'playoff';
  readonly titleGames: readonly { readonly conferenceId: number; readonly teams: readonly [TeamId, TeamId]; readonly winner: TeamId | null }[];
  readonly champions: readonly { readonly conferenceId: number; readonly teamId: TeamId }[];
  readonly ranking: readonly TeamId[];
  readonly field: readonly { readonly teamId: TeamId; readonly reason: string }[];
  readonly bracket: postseason.Bracket | null;
  readonly bowls: readonly { readonly bowlId: number; readonly teams: readonly [TeamId, TeamId]; readonly winner: TeamId | null }[];
  readonly unfilledBowls: readonly number[];
}

const TITLE = 'title';
const BOWL = 'bowl';

function confInput(c: SelectionConference): standings.ConferenceInput {
  return { conferenceId: c.conferenceId, teamIds: c.teamIds, chain: c.chain ?? standings.STARTING_CHAIN, titleMethod: c.titleMethod };
}

/** After the last title game: champions, the committee ranking, the field, the bracket and the bowls. */
function select(input: SelectionInput, titleGames: SelectionPostState['titleGames'], ctx: PostContext): SelectionPostState {
  const winnerOf = new Map(titleGames.map((g) => [g.conferenceId, g.winner]));
  const tables = input.conferences.map((c) => ({ c, table: standings.conferenceStandings(confInput(c), ctx.results, ctx.rules, ctx.draw, winnerOf.get(c.conferenceId) ?? null) }));
  const champions = tables.flatMap(({ c, table }) => (table.champion === null ? [] : [{ conferenceId: c.conferenceId, teamId: table.champion }]));
  const teamIds = ctx.teams.map((t) => t.id);
  const ranking = postseason.committeeRanking({ teamIds, results: ctx.results, champions: champions.map((c) => c.teamId) }, ctx.rules, ctx.uniform('committee.final')).order;
  const championOf = new Map(champions.map((c) => [c.conferenceId, c.teamId]));
  const field = postseason.selectCollegeField({
    ranking, independents: input.independents,
    conferences: input.conferences.map((c) => ({ conferenceId: c.conferenceId, power: c.power, champion: championOf.get(c.conferenceId) ?? null, teamIds: c.teamIds })),
  }, ctx.rules);
  const bracket = postseason.createBracket(postseason.formatFromRules(ctx.rules), [{ groupId: 0, seeds: field.seeds }]);
  const rankIn = new Map(tables.flatMap(({ c, table }) => table.order.map((t, i) => [t, { conferenceId: c.conferenceId, rank: i + 1 }] as const)));
  const picked = postseason.selectBowls({
    teams: teamIds.map((t) => ({ teamId: t, conferenceId: rankIn.get(t)?.conferenceId ?? null, conferenceRank: rankIn.get(t)?.rank ?? 1, academicScore: input.academicScore(t) })),
    results: ctx.results.filter((r) => r.phase === 'regular'), ranking, playoffTeams: field.seeds, bowls: input.bowls,
  }, ctx.rules);
  return {
    stage: 'playoff', titleGames, champions, ranking,
    field: field.seeds.map((t) => ({ teamId: t, reason: field.reason.get(t) ?? '' })),
    bracket, bowls: picked.games.map((g) => ({ ...g, winner: null })), unfilledBowls: picked.unfilled,
  };
}

export function selectionPlan(input: SelectionInput): PostseasonPlan<SelectionPostState> {
  return {
    id: 'selection',
    ruleKeys: [...new Set([
      standings.KEY.tieWinValue, ...postseason.RULE_KEYS.map((k) => k.key).filter((k) => k !== postseason.KEY.ceremonyHomeDates && k !== postseason.KEY.commonGamesMin),
    ])],
    open(ctx) {
      const titleGames = input.conferences.flatMap((c) => {
        const t = standings.conferenceStandings(confInput(c), ctx.results, ctx.rules, ctx.draw);
        return t.titleGame === null ? [] : [{ conferenceId: c.conferenceId, teams: t.titleGame, winner: null }];
      });
      if (titleGames.length === 0) return select(input, titleGames, ctx);
      return { stage: 'titles', titleGames, champions: [], ranking: [], field: [], bracket: null, bowls: [], unfilledBowls: [] };
    },
    pending(s): PostFixture[] {
      if (s.stage === 'titles') {
        return s.titleGames.filter((g) => g.winner === null).map((g) => ({ key: `${TITLE}:${g.conferenceId}`, teams: g.teams, host: null, stage: TITLE }));
      }
      const bowls: PostFixture[] = s.bowls.filter((b) => b.winner === null).map((b) => ({ key: `${BOWL}:${b.bowlId}`, teams: b.teams, host: null, stage: BOWL }));
      return [...bowls, ...(s.bracket ? bracketFixtures(s.bracket) : [])];
    },
    record(s, key, winner, ctx) {
      const [kind, id] = key.split(':');
      if (kind === TITLE) {
        const titleGames = s.titleGames.map((g) => (String(g.conferenceId) === id ? { ...g, winner } : g));
        return titleGames.every((g) => g.winner !== null) ? select(input, titleGames, ctx) : { ...s, titleGames };
      }
      if (kind === BOWL) return { ...s, bowls: s.bowls.map((b) => (String(b.bowlId) === id ? { ...b, winner } : b)) };
      if (!s.bracket) throw new Error(`no bracket game ${key} before the field is selected`);
      return { ...s, bracket: postseason.recordWinner(s.bracket, key, winner) };
    },
    champion: (s) => (s.stage === 'playoff' && s.bowls.every((b) => b.winner !== null) ? s.bracket?.champion ?? null : null),
  };
}
