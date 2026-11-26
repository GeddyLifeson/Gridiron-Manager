// League hub route sources (unstarted-work item 2a): a quick-start career carries the league pages' sources
// through its port; the routes they bind are the six league pages (legends only with a generated world);
// each loader reads the running season.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildRoutes } from '../../src/routes.ts';
import { startCareerSeason, firstTeamKey } from '../../src/app-root/index.ts';
import { legendsQuery, sourceTextIds } from '../../src/app-root/sources/index.ts';
import type { ScreenProps } from '../../src/shell/index.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};
const HOST = { consoleConfig: () => { throw new Error('no game opened in this test'); }, resolve: () => undefined };
const P = {} as ScreenProps;

describe('league hub sources on a quick-start pro career', { timeout: 300_000 }, () => {
  const port = startCareerSeason(CONTENT, { level: 'pro', ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: '3a5c7e9b1d2f4608', seat: { key: firstTeamKey(CONTENT, 'pro') } }, HOST);
  const sources = port.sources!();

  it('binds the six league pages, and no legends browser without a generated world', () => {
    const routes = buildRoutes({ ...sources });
    expect(Object.keys(routes).filter((id) => id.startsWith('league.')).sort()).toEqual(['league.news', 'league.records', 'league.schedule', 'league.standings', 'league.team', 'league.transactions']);
    expect(sources.legends).toBeUndefined();
  });

  it('every loader reads the running season, and follows it after a delegated week', () => {
    const league = sources.league!;
    const before = league.standings!(P)!;
    expect(before.lines).toHaveLength(32);
    expect(before.gamesCounted).toBe(0);
    expect(before.groups.filter((g) => g.kind === 'division').map((g) => g.name)).toContain('Harbor Conference East');
    port.delegateGame();
    const after = league.standings!(P)!;
    expect(after.gamesCounted).toBeGreaterThan(0);
    const today = port.today();
    const seat = today.standings.find((r) => r.seat)!;
    expect(after.lines.find((l) => l.teamId === seat.teamId)!.record).toEqual({ w: seat.w, l: seat.l, t: seat.t });
    expect(league.team!(P, seat.teamId)!.team.name).toBe(today.teamName);
    expect(league.schedule!(P, seat.teamId)!.teamRows.some((r) => r.result !== null)).toBe(true);
    expect(league.transactions!(P)!.lines).toEqual([]);
    expect(league.news!(P)!.lines).toEqual([]);
    expect(league.records!(P, null)!.history.map((h) => h.seasonYear)).toEqual([2026]);
  });
});

describe('legends view options', () => {
  it('reads a page link and a search from the route view, and ignores unknown kinds', () => {
    expect(legendsQuery({ tab: 'page', kind: 'team', id: '12' })).toEqual({ link: { kind: 'team', id: 12 } });
    expect(legendsQuery({ tab: 'search', q: 'smith' })).toEqual({ search: 'smith' });
    expect(legendsQuery({ tab: 'search' })).toEqual({ search: '' });
    expect(legendsQuery({ tab: 'page', kind: 'planet', id: '3' })).toEqual({});
  });
  it('has its words in the text table', () => {
    expect(sourceTextIds()).toContain('sources.league.division');
  });
});
