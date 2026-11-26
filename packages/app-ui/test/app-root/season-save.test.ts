// The career save keeps the season: a restored season continues from its week and results, and every step
// the career takes hands the host the season's save to write.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { play } from '@gm/app-services';
import { startCareerSeason } from '../../src/app-root/index.ts';
import { resolverFor } from '../../src/app-root/ConsoleHost.tsx';
import { DEFAULT_KEYMAP } from '../../src/shell/keymap.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};
const SEED = '3a5c7e9b1d2f4608';

describe('the career save keeps the season', () => {
  it('restores the week and results, and saves after every step', () => {
    const key = CONTENT.proLeague.league.clubs[0].id as string;
    // The reference resolver keeps the weeks fast; the saved options carry it into the restored season.
    const sp = play.SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: key, resolver: 'reference' });
    sp.advanceToGame();
    sp.delegateGame();
    const saved = JSON.parse(JSON.stringify(sp.save())) as play.SeasonPlaySave;

    const writes: play.SeasonPlaySave[] = [];
    const host = { consoleConfig: () => { throw new Error('no console in this test'); }, resolve: resolverFor(DEFAULT_KEYMAP.bindings), onSeasonChange: (s: play.SeasonPlaySave) => writes.push(s) };
    const port = startCareerSeason(CONTENT, { level: 'pro', ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seat: { key }, restore: saved }, host);
    const t = port.today();
    expect(t.record.w + t.record.l + t.record.t).toBe(1);
    expect(t.stageLabel).toBe(`Week ${sp.state.week}`);

    port.delegateGame();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.state.week).toBeGreaterThan(saved.state.week);
    expect(writes[0]!.seatOutcomes.length).toBe(saved.seatOutcomes.length + 1);
    const back = port.today().record;
    expect(back.w + back.l + back.t).toBe(2);
  }, 300_000);
});
