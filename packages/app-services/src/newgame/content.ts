// The repo's own world content, bound once for the app (the same binding the world tests and the master
// data run use, from the exported files instead of paths). Nothing here is typed by hand: league numbers
// come from the league-rules files and the rule sets, names and places from football-content.
import { world as worldContent } from '@gm/football-content';
import { cohorts } from '@gm/people';
import { league as leagueRules, ruleSetValues } from '@gm/rules-data';
import { schedule } from '@gm/league';
import { generation } from '@gm/world';

export type Level = 'pro' | 'college';

export interface AppWorldContent {
  readonly content: generation.WorldContent;
  readonly names: generation.PersonNameSource;
  /** League rules, then the rule set, then the schedule module's games-per-club row (as the fixtures do). */
  readonly lookup: Readonly<Record<Level, generation.RuleLookup>>;
}

const RULE_SET_OF: Readonly<Record<Level, string>> = { pro: 'pro_2026', college: 'college_2026' };

function lookupFor(level: Level, seasonGames: number | undefined): generation.RuleLookup {
  const league = leagueRules.leagueNumbers(level);
  const rules = new Map<string, number>();
  for (const v of ruleSetValues(RULE_SET_OF[level])) if (typeof v.value === 'number') rules.set(v.key, v.value);
  return (k) => league.get(k) ?? rules.get(k) ?? (k === 'schedule.regular_season_games' ? seasonGames : undefined);
}

let cached: AppWorldContent | null = null;

/** Built on first use and kept: the content is immutable for the life of the app. */
export function appWorldContent(): AppWorldContent {
  if (cached) return cached;
  const cfg = schedule.DEFAULT_CONFIG;
  const pro = lookupFor('pro', cfg.pro.structure.gamesPerClub);
  const college = lookupFor('college', cfg.college.gamesByLevel.college_top);
  const raw = worldContent.RAW_WORLD_CONTENT as unknown as generation.RawContent;
  const content = generation.defaultContent(raw, {
    pro: generation.levelNumbers(pro), college: generation.levelNumbers(college),
    recruitTrackedPerSignee: cohorts.param('recruitTrackedPerSignee'), seasonGamesByLevelId: cfg.college.gamesByLevel,
  });
  cached = { content, names: generation.makeNameSource(raw), lookup: { pro, college } };
  return cached;
}
