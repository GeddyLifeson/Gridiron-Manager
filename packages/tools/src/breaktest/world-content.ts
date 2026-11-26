// The real world content (football-content data files) bound to the generator, for the world-loop target. The
// composition root does this in the app; until it exposes a builder, the rig loads the same files by path as the
// world package's own fixtures do (names helpers are not exported from football-content yet, CR-G81-1).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cohorts } from '@gm/people';
import { generation } from '@gm/world';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const json = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const values = (rel: string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const v of json(rel).values as { key: string; value: unknown }[]) if (typeof v.value === 'number') m.set(v.key, v.value);
  return m;
};

export interface WorldContentBundle {
  readonly content: generation.WorldContent;
  readonly names: ReturnType<typeof generation.makeNameSource>;
  readonly lookup: { pro: generation.RuleLookup; college: generation.RuleLookup };
}

let cached: Promise<WorldContentBundle> | undefined;

export function worldContent(): Promise<WorldContentBundle> {
  cached ??= (async () => {
    const lib = await import(pathToFileURL(join(ROOT, 'packages/football-content/data/names/lib.ts')).href);
    const raw: generation.RawContent = {
      proLeague: json('packages/football-content/data/world/pro-league.json'),
      college: json('packages/football-content/data/world/college.json'),
      locations: json('packages/football-content/data/world/reference-locations.json'),
      blocked: json('packages/football-content/data/world/blocked-terms.json'),
      firstNames: json('packages/football-content/data/names/first-names.json'),
      surnames: json('packages/football-content/data/names/surnames.json'),
      guard: json('packages/football-content/data/names/real-name-guard.json'),
      hometowns: json('packages/football-content/data/names/hometowns.json'),
      lib,
    };
    const schedule = json('packages/league/src/schedule/config.json');
    const mk = (league: string, rules: string, games: number | undefined): generation.RuleLookup => {
      const l = values(league), r = values(rules);
      return (k) => l.get(k) ?? r.get(k) ?? (k === 'schedule.regular_season_games' ? games : undefined);
    };
    const pro = mk('packages/rules-data/data/league/proleague_2026.json', 'packages/rules-data/data/pro_2026.json', schedule.pro.structure.gamesPerClub);
    const college = mk('packages/rules-data/data/league/collegeleague_2026.json', 'packages/rules-data/data/college_2026.json', schedule.college.gamesByLevel.college_top);
    const content = generation.defaultContent(raw, {
      pro: generation.levelNumbers(pro), college: generation.levelNumbers(college),
      recruitTrackedPerSignee: cohorts.param('recruitTrackedPerSignee'), seasonGamesByLevelId: schedule.college.gamesByLevel,
    });
    return { content, names: generation.makeNameSource(raw), lookup: { pro, college } };
  })();
  return cached;
}

/** A cut of the real content: the first clubs and part of the first conference (same shapes, fewer teams, faster runs). */
export function trimmedContent(c: generation.WorldContent, clubs: number, schools: number): generation.WorldContent {
  const keepClubs = c.pro.league.clubs.slice(0, clubs);
  const clubIds = new Set(keepClubs.map((x) => x.id));
  const conf = c.college.conferences[0]!;
  const schoolIds = new Set(conf.memberIds.slice(0, schools));
  return {
    ...c,
    pro: { league: { ...c.pro.league, clubs: keepClubs }, stadiums: c.pro.stadiums.filter((s) => clubIds.has(s.clubId)), rivalries: c.pro.rivalries.filter((r) => clubIds.has(r.a) && clubIds.has(r.b)) },
    college: {
      ...c.college, conferences: [{ ...conf, memberIds: [...schoolIds] }], independents: [],
      schools: c.college.schools.filter((s) => schoolIds.has(s.id)), rivalries: c.college.rivalries.filter((r) => schoolIds.has(r.a) && schoolIds.has(r.b)),
    },
    collegeLevelsBySize: { full: ['college_top'], standard: ['college_top'], small: ['college_top'] },
  };
}
