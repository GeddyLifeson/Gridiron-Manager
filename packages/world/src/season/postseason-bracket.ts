// Postseason by seeded bracket (C3.3.1, C3.4.1): division ranks and conference seeds from the season
// table, one bracket group per conference, a final between the group champions. The format (field
// size, byes, reseeding, campus rounds, grouping) is read from the league-rules file.
import { postseason, standings } from '@gm/league';
import type { PostContext, PostFixture, PostseasonPlan, TeamId } from './types.ts';

export interface BracketPostState {
  readonly bracket: postseason.Bracket;
  /** Seeds per group, for the season report. */
  readonly seeds: readonly { readonly groupId: number; readonly seeds: readonly TeamId[] }[];
}

const STAGE = 'playoff';

export function bracketFixtures(b: postseason.Bracket): PostFixture[] {
  return postseason.pendingGames(b).map((g) => ({ key: g.key, teams: g.teams, host: g.host, stage: STAGE }));
}

/** The plan for a competition whose league-rules file groups the playoff by conference. */
export function seededBracketPlan(): PostseasonPlan<BracketPostState> {
  return {
    id: 'seeded_bracket',
    ruleKeys: [...new Set([...standings.RULE_KEYS.map((k) => k.key), postseason.KEY.grouping, postseason.KEY.fieldSize, postseason.KEY.byes, postseason.KEY.reseed, postseason.KEY.campusRounds])],
    open(ctx: PostContext): BracketPostState {
      const places = ctx.teams.map((t) => ({ id: t.id, conferenceId: t.conferenceId, divisionId: t.divisionId }));
      const table = standings.seasonTable(places, ctx.results.filter((r) => r.phase === 'regular'), ctx.rules, ctx.draw);
      const seeds = table.conferences.map((c) => ({ groupId: c.conferenceId, seeds: c.seeds }));
      return { bracket: postseason.createBracket(postseason.formatFromRules(ctx.rules), seeds), seeds };
    },
    pending: (s) => bracketFixtures(s.bracket),
    record: (s, key, winner) => ({ ...s, bracket: postseason.recordWinner(s.bracket, key, winner) }),
    champion: (s) => s.bracket.champion,
  };
}
