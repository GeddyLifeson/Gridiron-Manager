// Season specs for the two shipped competitions. The builders live in @gm/world season (leagues.ts, pure,
// so the browser app builds the same season); this file reads the repository's data files for them.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { season as seasons } from '@gm/world';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export type BuiltSeason = seasons.BuiltSeason;
export interface BuildOptions extends seasons.BuildOptions { readonly root?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = (root: string, ...p: string[]): any => JSON.parse(readFileSync(join(root, ...p), 'utf8'));

/** The parsed data files under a repository root. */
export function leagueContent(root: string = REPO_ROOT): seasons.LeagueContent {
  return {
    proLeague: readJson(root, 'packages', 'football-content', 'data', 'world', 'pro-league.json'),
    college: readJson(root, 'packages', 'football-content', 'data', 'world', 'college.json'),
    proLeagueRules: readJson(root, 'packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
    collegeLeagueRules: readJson(root, 'packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
  };
}

export const buildProSeason = (o: BuildOptions): BuiltSeason => seasons.buildProSeason(leagueContent(o.root), o);
export const buildCollegeSeason = (o: BuildOptions): BuiltSeason => seasons.buildCollegeSeason(leagueContent(o.root), o);

export const LEVEL_BUILDERS: Readonly<Record<string, (o: BuildOptions) => BuiltSeason>> = {
  pro_2026: buildProSeason,
  college_2026: buildCollegeSeason,
};

export function buildSeason(ruleSetId: string, o: BuildOptions): BuiltSeason {
  return seasons.buildSeason(leagueContent(o.root), ruleSetId, o);
}
