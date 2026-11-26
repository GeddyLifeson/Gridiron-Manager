import { describe, expect, it } from 'vitest';
import { WorldState, Person } from '@gm/schema';
import { toCsv, prepareExport, readSaveFileHeader, saveFileName, isSqliteFile } from '../../src/export/index.ts';
import { SaveFormatError } from '../../src/index.ts';
import { SQL, playedCareer } from './fixtures.ts';

describe('career file export and import (P5.6.1, P5.7)', () => {
  it('reads the header of a career file made by the store', async () => {
    const c = await playedCareer(2);
    const bytes = await c.driver.exportBytes();
    expect(isSqliteFile(bytes)).toBe(true);
    const h = await readSaveFileHeader(await SQL(), bytes);
    expect(h.summary).toBe('Test career');
  });
  it('refuses files that are not career files, with a plain reason', async () => {
    await expect(readSaveFileHeader(await SQL(), new TextEncoder().encode('hello'))).rejects.toThrow(SaveFormatError);
    const empty = new (await SQL()).Database().export();
    await expect(readSaveFileHeader(await SQL(), empty)).rejects.toThrow(/not a career file|no header/);
  });
  it('makes safe file names', () => {
    expect(saveFileName('My Career')).toBe('My Career.gmsave');
    expect(saveFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j.gmsave');
    expect(saveFileName('...')).toBe('career.gmsave');
  });
});

describe('CSV tables (P5.7.2)', () => {
  it('writes RFC 4180 with CRLF, quoting and no locale formatting', () => {
    const csv = toCsv(
      [{ label: 'Name', value: (r: { n: string; y: number; ok: boolean | null }) => r.n }, { label: 'Yards', value: (r) => r.y }, { label: 'Starter', value: (r) => r.ok }],
      [{ n: 'Smith, J.', y: 1234.5, ok: true }, { n: 'He said "go"', y: -3, ok: null }, { n: 'two\nlines', y: Number.NaN, ok: false }],
    );
    expect(csv).toBe('Name,Yards,Starter\r\n"Smith, J.",1234.5,true\r\n"He said ""go""",-3,\r\n"two\nlines",,false\r\n');
  });
  it('guards text cells that a spreadsheet would run as formulas', () => {
    const cols = [{ label: 'v', value: (r: string) => r }];
    expect(toCsv(cols, ['=1+1', '+x', '@a', '-b', 'ok'])).toBe("v\r\n'=1+1\r\n'+x\r\n'@a\r\n'-b\r\nok\r\n");
    expect(toCsv(cols, ['=1+1'], { guardFormulas: false })).toBe('v\r\n=1+1\r\n');
  });
});

describe('exports never contain truth fields (P5.7.2 edge case)', () => {
  const world: WorldState = {
    formatVersion: 1, masterSeedHex: '00000000000000aa', calendar: { seasonYear: 2026, dayIndex: 0 },
    competitions: [{ id: 1, name: 'Pro', level: 'pro', ruleSetId: 'pro_2026', leagueRulesId: 'pro_league_2026', teamIds: [1] }],
    teams: [{ id: 1, competitionId: 1, name: 'Team', place: 'Town', colours: ['#112233'], prestige: 0.73 }],
    people: [{
      id: 1, origin: 'generated', name: { first: 'A', last: 'B' }, birthDate: { year: 1970, dayIndex: 1 }, appearanceSeed: 1, roles: ['coach'],
      coaching: { systemFamilies: { west_coast: 3 }, demonstratedRecord: {}, historyFacts: [], hidden: { aggression: 0.9 } },
    }],
    nextIds: { competition: 2, team: 2, person: 2 }, userPersonId: null,
  };
  it('the player build removes every truth field, including nested ones in arrays', () => {
    const p = prepareExport(WorldState, world);
    expect([...p.truthPaths].sort()).toEqual(['$.people[0].coaching.hidden', '$.teams[0].prestige']);
    expect(JSON.stringify(p.data)).not.toMatch(/prestige|hidden|aggression/);
    expect(p.data.teams[0]!.name).toBe('Team');
    expect(p.certifiable).toBe(true);
    expect(p.developerMarked).toBe(false);
    // The input is untouched.
    expect(world.teams[0]!.prestige).toBe(0.73);
  });
  it('the developer build keeps them, marks the file and it is never certified', () => {
    const p = prepareExport(Person, world.people[0], 'developer');
    expect(p.truthPaths).toEqual(['$.coaching.hidden']);
    expect(p.data?.coaching?.hidden).toEqual({ aggression: 0.9 });
    expect(p.developerMarked).toBe(true);
    expect(p.certifiable).toBe(false);
  });
  it('a value with no truth fields is certifiable in either build', () => {
    const p = prepareExport(WorldState, { ...world, teams: [], people: [] }, 'developer');
    expect(p.truthPaths).toEqual([]);
    expect(p.certifiable).toBe(true);
  });
});
