import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatcher, scanMarks, editDistanceAtMostOne, type BlockedTerms } from '../lib/marks.ts';
import { scanNames, researchPathHits, recordTokenHits, csvRow } from '../lib/people.ts';
import { isShipped } from '../lib/shipped.ts';
import { guardHash } from '../../../packages/football-content/data/names/lib.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LIST = JSON.parse(readFileSync(join(ROOT, 'packages/football-content/data/world/blocked-terms.json'), 'utf8')) as BlockedTerms;
const m = buildMatcher(LIST);

describe('A6.2.2 mark scan', () => {
  it('acceptance: planting any real school or pro team in a content file fails the scan', () => {
    for (const c of LIST.colleges) expect(scanMarks('content/x.json', `{"name": "${c.school} ${c.nickname}"}`, m).length, `${c.school} ${c.nickname}`).toBeGreaterThan(0);
    for (const n of LIST.proNicknames) expect(scanMarks('content/x.txt', `the ${LIST.proCities[0]} ${n} today`, m).length, n).toBeGreaterThan(0);
    for (const t of [...LIST.conferencesAndLeagues, ...LIST.eventsAndTrophies]) expect(scanMarks('content/x.txt', `see ${t} here`, m).length, t).toBeGreaterThan(0);
  });
  it('a common-word nickname alone, or a generated identity, is not a hit (rule 3)', () => {
    expect(scanMarks('content/x.txt', 'The Westridge Cobras beat the Kelbury Dukes', m)).toEqual([]);
    expect(scanMarks('content/x.txt', 'three bears and some eagles', m)).toEqual([]);
  });
  it('neighbouring JSON strings never join into a pair', () => {
    const city = LIST.proCities[0]!, nick = LIST.proNicknames[0]!;
    expect(scanMarks('content/x.json', JSON.stringify([city, nick]), m)).toEqual([]);
  });
  it('one JSON object with a real city and a real nickname in identity fields is a hit; a reference field is not', () => {
    const city = LIST.proCities[0]!, nick = LIST.proNicknames[0]!;
    expect(scanMarks('content/x.json', JSON.stringify({ city, nickname: nick }), m).length).toBe(1);
    expect(scanMarks('content/x.json', JSON.stringify({ city: 'Chesterly', nickname: nick, referenceLocationId: city }), m)).toEqual([]);
  });
  it('near spellings: one edit in a long word with the same first letter', () => {
    expect(editDistanceAtMostOne('lombardi', 'lombardy')).toBe(true);
    expect(editDistanceAtMostOne('abc', 'cba')).toBe(false);
    const nick = LIST.colleges.find((c) => c.nickname.split(' ').length >= 2 && c.nickname.split(' ').every((w) => w.length >= 7));
    if (nick) {
      const w = nick.nickname.split(' ');
      const misspelt = [w[0]!.slice(0, -1) + 'x', ...w.slice(1)].join(' ');
      expect(scanMarks('content/x.txt', misspelt, m).length).toBeGreaterThan(0);
    }
  });
  it('abbreviations match case-sensitively', () => {
    const ab = LIST.conferencesAndLeagues.find((t) => /^[A-Z]{3}$/.test(t))!;
    expect(scanMarks('content/x.txt', `the ${ab} title`, m).length).toBe(1);
    expect(scanMarks('content/x.txt', `the ${ab.toLowerCase()}ond`, m)).toEqual([]);
  });
});

describe('real-name scan', () => {
  const real = new Set([guardHash('Jordan', 'Van Royen'), guardHash('Jordan', 'Royen'), guardHash('Dustin', 'Hopkins')]);
  it('finds a real full name in text, including a multi-word surname', () => {
    expect(scanNames('a.ts', '// kicker Dustin Hopkins made it', real).map((h) => h.name)).toEqual(['Dustin Hopkins']);
    expect(scanNames('a.ts', 'by Jordan Van Royen', real).map((h) => h.name)).toEqual(['Jordan Van Royen']);
  });
  it('separate list entries are not a full name', () => {
    expect(scanNames('names.json', '["Dustin","Hopkins"]', real)).toEqual([]);
    expect(scanNames('a.ts', 'Dustin, Hopkins', real)).toEqual([]);
  });
  it('lower-case words are not names', () => {
    expect(scanNames('a.ts', 'dustin hopkins', real)).toEqual([]);
  });
});

describe('A6.4.1 research data', () => {
  it('flags research paths and raw dataset files', () => {
    expect(researchPathHits(['packages/models/data/research/x.json', 'content/a.csv', 'content/ok.json']).map((h) => h.file)).toEqual(['packages/models/data/research/x.json', 'content/a.csv']);
  });
  it('flags per-person source record tokens', () => {
    expect(recordTokenHits('x.json', '{"id":"00-0028830"}').length).toBe(1);
    expect(recordTokenHits('x.json', 'https://a.espncdn.com/i/headshots/college-football/players/full/1.png').length).toBe(1);
    expect(recordTokenHits('x.json', '{"seed":"0x00a"}')).toEqual([]);
  });
  it('csv rows with quoted commas', () => {
    expect(csvRow('a,"b, c",d')).toEqual(['a', 'b, c', 'd']);
  });
});

describe('shipped tree', () => {
  const kinds = { schema: 'core', 'app-ui': 'app', headless: 'tool' };
  it('core and app source and data ship; tools, tests, docs and build scripts do not', () => {
    expect(isShipped('packages/schema/src/x.ts', kinds)).toBe(true);
    expect(isShipped('packages/app-ui/src/screens/a/view.tsx', kinds)).toBe(true);
    expect(isShipped('packages/headless/src/cli.ts', kinds)).toBe(false);
    expect(isShipped('packages/schema/test/x.test.ts', kinds)).toBe(false);
    expect(isShipped('packages/schema/src/README.md', kinds)).toBe(false);
    expect(isShipped('content/calibration/authoring/pro.py', kinds)).toBe(false);
    expect(isShipped('content/calibration/targets.pro_2026.json', kinds)).toBe(true);
    expect(isShipped('scripts/release/gate.ts', kinds)).toBe(false);
  });
});
