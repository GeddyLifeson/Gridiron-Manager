// Legends search, export and page history (G-84, bible X3.5.1, X3.6.1, X3.1.1 rule 5).
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { SearchIndex, FILTER_KEYS, editDistance, buildExport, truthKeys, type IndexEntry } from '../../../src/read-models/legends/index.ts';
import { PageHistory, LEGENDS_COMMAND_TABLE } from '../../../src/commands/legends/index.ts';
import { tenSeasons, ev } from './fixture.ts';

const person = (id: number, first: string, last: string, over: Partial<IndexEntry> = {}): IndexEntry => ({
  kind: 'person', id, first, last, birthYear: 1990 + (id % 20), roles: ['head_coach'], levels: ['pro'], teams: [id % 8 + 1], lastTeamId: id % 8 + 1,
  jobs: [], labels: [], honors: [], treeRoots: [], firstSeason: 2030, lastSeason: 2030 + (id % 30), notability: id % 100, ...over,
});

describe('X3.5.1 search and filters', () => {
  const idx = new SearchIndex();
  idx.upsert(person(1, 'Dale', 'Whitcombe', { notability: 40 }));
  idx.upsert(person(2, 'Dale', 'Whitcombe', { notability: 80, birthYear: 1971, roles: ['defensive_coordinator'] }));
  idx.upsert(person(3, 'Rory', 'Whitley', { labels: ['label.steady'], honors: ['coach_of_year'] }));
  idx.upsert(person(4, 'Ann', 'Branton', { levels: ['college'], treeRoots: [1] }));
  idx.upsert({ ...person(5, '', 'Harbor City Gulls'), kind: 'team', birthYear: null, roles: [], lastTeamId: null });

  it('exact, then prefix, then one-edit fuzzy for tokens of five or more letters', () => {
    expect(idx.search('whitcombe').map((r) => [r.id, r.match])).toEqual([[2, 'exact'], [1, 'exact']]);
    expect(idx.search('whit').map((r) => r.match)).toEqual(['prefix', 'prefix', 'prefix']);
    const typo = idx.search('Brenton');
    expect(typo.map((r) => [r.id, r.match])).toEqual([[4, 'fuzzy']]);
    expect(idx.search('Ane')).toEqual([]); // a short token gets no fuzzy match
    expect(idx.search('harbor gulls').map((r) => r.id)).toEqual([5]);
  });

  it('same-name rows rank by notability and carry birth year, role and last team', () => {
    const rows = idx.search('dale whitcombe');
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({ birthYear: 1971, role: 'defensive_coordinator' });
    expect(rows[1]!.birthYear).not.toBe(rows[0]!.birthYear);
  });

  it('filters use public facts and held labels only; no filter key maps to a truth-data field', () => {
    expect(idx.search('', { label: 'label.steady' }).map((r) => r.id)).toEqual([3]);
    expect(idx.search('', { level: 'college', treeRoot: 1 }).map((r) => r.id)).toEqual([4]);
    expect(idx.search('', { honor: 'coach_of_year' }).map((r) => r.id)).toEqual([3]);
    expect(idx.search('', { kinds: ['team'] }).map((r) => r.id)).toEqual([5]);
    expect(idx.search('', { age: { min: 55 } }, 2030).map((r) => r.id)).toEqual([2]);
    const truth = new Set([...truthKeys('people'), ...truthKeys('events')]);
    for (const k of Object.keys(FILTER_KEYS)) expect(truth.has(k)).toBe(false);
  });

  it('upsert replaces an entry and remove drops its tokens', () => {
    const i = new SearchIndex();
    i.upsert(person(9, 'Kim', 'Ostrander'));
    i.upsert(person(9, 'Kim', 'Vale'));
    expect(i.search('ostrander')).toEqual([]);
    expect(i.search('vale').map((r) => r.id)).toEqual([9]);
    i.remove('person', 9);
    expect(i.size).toBe(0);
  });

  it('edit distance stops early past the cap', () => {
    expect(editDistance('whitley', 'whitlee', 1)).toBe(1);
    expect(editDistance('whitley', 'branton', 1)).toBe(2);
  });

  it('in a soak index of 150,000 people, a two-letter prefix search and a one-letter misspelling stay inside half a second', () => {
    const big = new SearchIndex();
    const syll = ['ka', 'lo', 'mi', 'ra', 'ten', 'vor', 'sel', 'dun', 'bri', 'gol', 'hav', 'pen', 'mar', 'tro', 'lin', 'shu'];
    let x = 11;
    const pick = () => { x = (x * 1103 + 12345) % 65536; return syll[x % syll.length]!; };
    for (let i = 1; i <= 150_000; i++) big.upsert(person(i, pick() + pick(), pick() + pick() + pick()));
    big.upsert(person(200_000, 'Quill', 'Fairbanks'));
    const two = big.entry('person', 1)!.last.slice(0, 2).toLowerCase();
    let t = performance.now();
    const first = big.search(two);
    const prefixMs = performance.now() - t;
    expect(first.length).toBe(25);
    t = performance.now();
    const typo = big.search('fairbonks');
    const fuzzyMs = performance.now() - t;
    expect(typo.map((r) => r.id)).toContain(200_000);
    expect(prefixMs).toBeLessThan(500);
    expect(fuzzyMs).toBeLessThan(500);
  }, 60_000);
});

describe('X3.6.1 export as data', () => {
  const w = tenSeasons(2);
  const input = {
    worldCode: 'W-TEST', firstSeason: 2030, lastSeason: 2031, exportDate: { seasonYear: 2031, dayIndex: 300 }, events: w.rows,
    people: [{ id: 101, name: { first: 'Lee', last: 'Garnet', suffix: null, nickname: null }, birthDate: { seasonYear: 1980, dayIndex: 3 }, origin: 'generated' }],
    teams: [{ id: 2, name: 'Harbor City Gulls' }, { id: 1, name: 'Plains Hawks' }], seasons: [], games: [], records: [{ id: 'pass_yards_season', holderId: 300, value: 5030 }],
  };

  it('two exports of the same save are byte-identical; rows are sorted by id', () => {
    const a = buildExport(input), b = buildExport({ ...input, events: [...input.events].reverse(), teams: [...input.teams].reverse() });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.files).toEqual(b.files);
    expect(Object.keys(a.files).sort()).toEqual(['events.jsonl', 'games.jsonl', 'manifest.json', 'people.jsonl', 'records.jsonl', 'seasons.jsonl', 'teams.jsonl']);
    expect(a.files['teams.jsonl']!.split('\n')[0]).toContain('"id":1');
    expect(JSON.parse(a.files['manifest.json']!)).toMatchObject({ schemaVersion: 1, worldCode: 'W-TEST', firstSeason: 2030, lastSeason: 2031 });
  });

  it('exports public events only and no truth-data field', () => {
    const r = buildExport({ ...input, csv: true });
    if (!r.ok) throw new Error('export refused');
    const events = r.files['events.jsonl']!.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(events.length).toBe(w.rows.filter((e) => e.witnesses.kind === 'public').length);
    for (const e of events) {
      expect((e['witnesses'] as { kind: string }).kind).toBe('public');
      expect('tier' in e || 'source' in e).toBe(false);
    }
    expect(r.files['events.csv']).toBeDefined();
  });

  it('stops on a truth-data field or a forbidden key, and adds the decision log only when ticked', () => {
    const truth = [...truthKeys('people')][0]!;
    const bad = buildExport({ ...input, people: [{ ...input.people[0]!, [truth]: { x: 1 } }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems[0]!.file).toBe('people.jsonl');
    const forbidden = buildExport({ ...input, records: [{ id: 'x', difficulty: 3 }] });
    expect(forbidden.ok).toBe(false);
    const without = buildExport({ ...input, decisionLog: [{ id: 1, choice: 'go' }] });
    const withLog = buildExport({ ...input, decisionLog: [{ id: 1, choice: 'go' }], includeDecisionLog: true });
    expect(without.ok && !('decisions.jsonl' in without.files)).toBe(true);
    expect(withLog.ok && 'decisions.jsonl' in withLog.files).toBe(true);
  });

  it('a non-public event never reaches the export', () => {
    const room = ev('staff_meeting', 2030, 5, { teamId: 2, witnesses: { kind: 'room', teamId: 2, roomKey: 'staff' } });
    const r = buildExport({ ...input, events: [room] });
    expect(r.ok && r.files['events.jsonl']).toBe('');
  });
});

describe('X3.1.1 rule 5 page history and the export command', () => {
  it('keeps 50 pages; back and forward walk them; opening a page drops the forward list', () => {
    const h = new PageHistory();
    for (let i = 1; i <= 60; i++) h.open({ link: { kind: 'person', id: i } });
    expect(h.length).toBe(50);
    let n = 0;
    while (h.back()) n++;
    expect(n).toBe(49);
    expect(h.current!.link.id).toBe(11);
    h.forward();
    h.open({ link: { kind: 'team', id: 1 } });
    expect(h.forward()).toBeNull();
    expect(h.back()!.link.id).toBe(12);
  });

  it('export is allowed in certified mode and is not undoable (it changes no state)', () => {
    expect(LEGENDS_COMMAND_TABLE).toEqual([{ type: 'LegendsExport', task: 'legends.export', undoable: false, allowedInCertified: true }]);
  });
});
