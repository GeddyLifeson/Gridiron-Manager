import { describe, expect, it } from 'vitest';
import {
  canonicalText, checkEntryLimits, decodePack, encodePack, packChecksum, parseCsv, resolvePacks, sha256Hex, writeCell, readCell, isAllowedFootballEvent, PROTECTED_EVENT_TYPES,
  type PackFile,
} from '../../src/pack/index.ts';
import { basePack, file, manifest, PEOPLE, PLAYING } from './helpers.ts';

const ENC = new TextEncoder();
const codes = (r: { report: { problems: { code: string; severity: string }[] } }, sev?: string) =>
  r.report.problems.filter((p) => !sev || p.severity === sev).map((p) => p.code);

describe('sha256', () => {
  it('matches the FIPS 180-4 vectors', () => {
    expect(sha256Hex(ENC.encode(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(ENC.encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(ENC.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex(ENC.encode('a'.repeat(1000)))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('csv', () => {
  it('round trips quotes, commas, newlines and formula-looking cells as text', () => {
    for (const text of ['=HYPERLINK("x")', '+1', '-3', '@a', "'=x", 'a,b', 'line\nbreak', 'say "hi"']) {
      expect(readCell(parseCsv(`h\n${writeCell(text)}\n`).rows[1]![0]!)).toBe(text);
    }
    expect(writeCell('=SUM(A1)')).toBe("'=SUM(A1)");
  });
  it('reads CRLF and a missing final newline', () => {
    expect(parseCsv('a,b\r\n1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('U7.1.1 a pack with only the bold columns imports', () => {
  it('imports people and playing with required columns only', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', 'source_key,name_first,name_last\nk1,Ann,Alder\n'), file('playing.csv', 'source_key,position\nk1,WR\n')]);
    expect(r.report.status).toBe('pass');
    expect(r.pack?.tables['people']?.rows).toHaveLength(1);
    expect(r.report.checksumShort).toHaveLength(12);
  });
  it('maps position aliases and writes the canonical position', () => {
    const r = decodePack(basePack());
    expect(r.pack?.tables['playing']?.rows.map((x) => x['position'])).toEqual(['QB', 'OT']);
  });
});

describe('U7.3.2 fail cases', () => {
  it('fails with no pack.json', () => {
    const r = decodePack([file('people.csv', PEOPLE)]);
    expect(r.report.status).toBe('fail');
    expect(codes(r, 'fail')).toContain('missing_manifest');
    expect(r.pack).toBeUndefined();
  });
  it('fails on an unknown schema version', () => {
    const r = decodePack([file('pack.json', manifest({ schema_version: 2 })), file('people.csv', PEOPLE)]);
    expect(codes(r, 'fail')).toContain('unknown_schema_version');
  });
  it('fails on invalid manifest JSON and bad enum', () => {
    expect(codes(decodePack([file('pack.json', '{nope')]), 'fail')).toContain('manifest_json');
    expect(codes(decodePack([file('pack.json', manifest({ contains: 'invented' })), file('people.csv', PEOPLE)]), 'fail')).toContain('manifest_field');
  });
  it('fails with zero valid people and leaves nothing', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', 'source_key,name_first,name_last\n,Ann,Alder\n')]);
    expect(codes(r, 'fail')).toContain('no_valid_people');
    expect(r.pack).toBeUndefined();
  });
  it('fails on path escape, depth, size, zip bomb and invalid UTF-8', () => {
    expect(codes({ report: { problems: checkEntryLimits([{ path: '../evil.csv', size: 1 }]) } }, 'fail')).toContain('path_escape');
    expect(codes({ report: { problems: checkEntryLimits([{ path: '/abs/people.csv', size: 1 }]) } }, 'fail')).toContain('path_escape');
    expect(codes({ report: { problems: checkEntryLimits([{ path: 'a/b/c/d/e/f/g/h.csv', size: 1 }]) } }, 'fail')).toContain('limit_depth');
    expect(codes({ report: { problems: checkEntryLimits([{ path: 'people.csv', size: 60_000_000 }]) } }, 'fail')).toContain('limit_file_size');
    expect(codes({ report: { problems: checkEntryLimits([{ path: 'people.csv', size: 10_000, compressedBytes: 10 }]) } }, 'fail')).toContain('limit_expansion');
    const bomb: PackFile = { path: 'people.csv', bytes: new Uint8Array(1000), compressedBytes: 2 };
    expect(decodePack([file('pack.json', manifest()), bomb]).report.status).toBe('fail');
    const bad: PackFile = { path: 'people.csv', bytes: new Uint8Array([0xff, 0xfe, 0x41]) };
    expect(codes(decodePack([file('pack.json', manifest()), bad]), 'fail')).toContain('bad_encoding');
  });
  it('accepts one wrapping folder and ignores other file types, listing them', () => {
    const r = decodePack(basePack().map((f) => ({ ...f, path: `my pack/${f.path}` })).concat([file('my pack/logo.png', 'x'), file('my pack/readme.txt', 'x')]));
    expect(r.report.status).toBe('pass');
    expect(r.report.ignoredFiles.map((x) => x.path).sort()).toEqual(['logo.png', 'readme.txt']);
  });
});

describe('U7.3.2 reject cases', () => {
  const run = (people: string, playing = PLAYING) => decodePack([file('pack.json', manifest()), file('people.csv', people), file('playing.csv', playing)], { worldStartYear: 2026 });
  it('rejects missing required value, bad date, duplicate key, bad age', () => {
    const r = run('source_key,name_first,name_last,birth_date\nk1,Ann,Alder,2001-05-04\nk1,Dup,Alder,2001-05-04\nk3,,Cedar,2000-01-01\nk4,Dee,Dale,2001-02-30\nk5,Eve,Elm,2015-01-01\nk6,Fay,Fir,1920-01-01\n');
    expect(r.report.status).toBe('warn');
    expect(r.pack?.tables['people']?.rows.map((x) => x['source_key'])).toEqual(['k1']);
    expect(r.report.counts['people']).toEqual({ read: 6, kept: 1, rejected: 5 });
  });
  it('rejects impossible height, weight and unknown position', () => {
    const r = run(PEOPLE, 'source_key,position,height_in,weight_lb\nk1,QB,50,215\nk2,QB,74,500\nk1,XX,74,215\nk2,QB,74,215\n');
    expect(r.report.counts['playing']).toEqual({ read: 4, kept: 1, rejected: 3 });
  });
  it('rejects rows whose person is not in the pack, and web addresses', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', PEOPLE), file('player_seasons.csv', 'source_key,season,level,organisation\nk9,2020,pro,Club\nk1,2020,pro,see https://x.example\nk1,2021,pro,Club\n')]);
    expect(r.report.counts['player_seasons']).toEqual({ read: 3, kept: 1, rejected: 2 });
  });
  it('a missing required column rejects every row of that table', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', PEOPLE), file('playing.csv', 'source_key,height_in\nk1,74\n')]);
    expect(r.report.counts['playing']).toEqual({ read: 1, kept: 0, rejected: 1 });
  });
});

describe('P7.3.1 forbidden columns are dropped and listed', () => {
  it('drops every forbidden column of the test pack and keeps the rest', () => {
    const forbidden = ['photo', 'logo_url', 'uniform_design', 'jersey', 'medical_notes', 'injury_history', 'legal_history', 'spouse', 'family_members', 'contract_value', 'salary', 'home_address', 'phone', 'email', 'quote', 'notes', 'bio', 'twitter_handle'];
    const head = ['source_key', 'name_first', 'name_last', ...forbidden].join(',');
    const row = ['k1', 'Ann', 'Alder', ...forbidden.map(() => 'x')].join(',');
    const r = decodePack([file('pack.json', manifest()), file('people.csv', `${head}\n${row}\n`)]);
    expect(r.report.status).toBe('warn');
    expect(r.report.droppedColumns.map((d) => d.column).sort()).toEqual([...forbidden].sort());
    expect(r.pack?.tables['people']?.columns).toEqual(['source_key', 'name_first', 'name_last']);
    expect(JSON.stringify(r.pack)).not.toContain('"x"');
  });
  it('drops unknown columns of a fixed table but keeps unknown statistic columns', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', 'source_key,name_first,name_last,shoe_size\nk1,Ann,Alder,9\n'), file('player_seasons.csv', 'source_key,season,level,passing_yards,rushing_yards\nk1,2020,pro,4000,12.50\n')]);
    expect(r.report.droppedColumns).toEqual([{ table: 'people', column: 'shoe_size', reason: expect.any(String) }]);
    expect(r.pack?.tables['player_seasons']?.rows[0]).toMatchObject({ passing_yards: '4000', rushing_yards: '12.5' });
  });
  it('a family link keeps only its two keys and kind', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', PEOPLE), file('links.csv', 'source_key_a,source_key_b,kind,seasons,source\nk1,k2,family,2019,a story\nk1,k2,coached,2019,x\n')]);
    const rows = r.pack!.tables['links']!.rows;
    expect(rows[0]).toMatchObject({ kind: 'family', seasons: '', source: '' });
    expect(rows[1]).toMatchObject({ kind: 'coached', seasons: '2019' });
  });
});

describe('A6.3.1 a pack with a protected-event row fails validation', () => {
  it('fails on an events table', () => {
    const r = decodePack([...basePack(), file('events.csv', 'source_key,event_type\nk1,arrest\n')]);
    expect(r.report.status).toBe('fail');
    expect(codes(r, 'fail')).toContain('protected_event');
    expect(r.pack).toBeUndefined();
  });
  it('fails on an incident table of any name that names an event', () => {
    expect(decodePack([...basePack(), file('incidents.csv', 'source_key,what\nk1,x\n')]).report.status).toBe('fail');
    expect(decodePack([...basePack(), file('arrests.csv', 'source_key\nk1\n')]).report.status).toBe('fail');
  });
  it('fails on an event column holding a protected kind inside a known table', () => {
    const r = decodePack([file('pack.json', manifest()), file('people.csv', 'source_key,name_first,name_last,event_type\nk1,Ann,Alder,Suspended for conduct\n')]);
    expect(codes(r, 'fail')).toContain('protected_event');
  });
  it('every protected type has a word the detector finds, and football events pass', () => {
    for (const t of PROTECTED_EVENT_TYPES) {
      const r = decodePack([file('pack.json', manifest()), file('people.csv', `source_key,name_first,name_last,event\nk1,Ann,Alder,${t.words[0]}\n`)]);
      expect(codes(r, 'fail'), t.id).toContain('protected_event');
    }
    expect(isAllowedFootballEvent('injury_in_play')).toBe(true);
    expect(isAllowedFootballEvent('arrest')).toBe(false);
    expect(isAllowedFootballEvent('some_new_event')).toBe(false);
  });
});

describe('U7.3.1 checksum', () => {
  const sum = (files: PackFile[]) => decodePack(files).report.checksum;
  it('does not change when rows, columns or files are reordered, or line endings change', () => {
    const a = sum(basePack());
    const reordered = [
      file('playing.csv', 'level,weight_lb,height_in,position,source_key\ncollege,310,77,LT,k2\npro,215,74,QB,k1\n'),
      file('people.csv', 'birth_date,name_last,name_first,source_key\r\n1990-01-31,Birch,Bo,k2\r\n2001-05-04,Alder,Ann,k1\r\n'),
      file('pack.json', manifest({ name: 'renamed', version: '9' })),
    ];
    expect(a).toBeDefined();
    expect(sum(reordered)).toBe(a);
  });
  it('treats 74 and 74.0 and "074" as one number', () => {
    const a = sum([file('pack.json', manifest()), file('people.csv', PEOPLE), file('playing.csv', 'source_key,position,height_in\nk1,QB,74\n')]);
    const b = sum([file('pack.json', manifest()), file('people.csv', PEOPLE), file('playing.csv', 'source_key,position,height_in\nk1,QB,74.0\n')]);
    expect(a).toBe(b);
  });
  it('changes when one value changes', () => {
    const a = sum(basePack());
    const b = sum([file('pack.json', manifest()), file('people.csv', PEOPLE.replace('Alder', 'Alden')), file('playing.csv', PLAYING)]);
    expect(b).not.toBe(a);
  });
  it('is the SHA-256 of the canonical text and prints 12 characters', () => {
    const r = decodePack(basePack());
    expect(r.report.checksum).toBe(sha256Hex(ENC.encode(canonicalText(r.pack!))));
    expect(r.report.checksumShort).toBe(r.report.checksum!.slice(0, 12));
  });
});

describe('U7.1.2 encode and decode', () => {
  it('round trips a pack with hostile cells and keeps the checksum', () => {
    const people = 'source_key,name_first,name_last\nk1,"=HYPERLINK(""x"")","O,Neil"\nk2,Line,"Br\nk"\n';
    const r1 = decodePack([file('pack.json', manifest()), file('people.csv', people), file('playing.csv', PLAYING.replace('k2', 'k1'))]);
    const files = encodePack(r1.pack!);
    expect(new TextDecoder().decode(files.find((f) => f.path === 'people.csv')!.bytes)).toContain("'=HYPERLINK");
    const r2 = decodePack(files);
    expect(r2.pack!.tables['people']!.rows).toEqual(r1.pack!.tables['people']!.rows);
    expect(r2.report.checksum).toBe(r1.report.checksum);
    // Two exports of the same people are byte for byte equal.
    const again = encodePack(r2.pack!);
    expect(again.map((f) => [f.path, new TextDecoder().decode(f.bytes)])).toEqual(files.map((f) => [f.path, new TextDecoder().decode(f.bytes)]));
  });
});

describe('U7.2.2 base and delta packs', () => {
  const base = decodePack(basePack({ pack_id: 'base' })).pack!;
  const baseHash = packChecksum(base);
  const delta = (id: string, files: Record<string, string>, extra: Record<string, unknown> = {}) =>
    decodePack([file('pack.json', manifest({ pack_id: id, base: { id: 'base', hash: baseHash }, ...extra })), ...Object.entries(files).map(([p, t]) => file(p, t))]);

  it('base plus deltas equals one base built from the final data', () => {
    const d1 = delta('d1', { 'people.csv': 'source_key,name_first,name_last\nk3,Cy,Cedar\n', 'playing.csv': 'source_key,position\nk3,WR\n' });
    const d2 = delta('d2', { 'removed.csv': 'source_key\nk2\n', 'playing.csv': 'source_key,position,height_in\nk1,QB,75\n' });
    expect(d1.report.status).toBe('pass');
    const res = resolvePacks(base, [d1.pack!, d2.pack!]);
    expect(res.problems).toEqual([]);
    const direct = decodePack([
      file('pack.json', manifest({ pack_id: 'base' })),
      file('people.csv', 'source_key,name_first,name_last,birth_date\nk1,Ann,Alder,2001-05-04\nk3,Cy,Cedar,\n'),
      file('playing.csv', 'source_key,position,height_in,weight_lb,level\nk1,QB,75,,\nk3,WR,,,\n'),
    ]);
    expect(res.checksum).toBe(direct.report.checksum);
  });
  it('refuses a delta with the wrong base hash', () => {
    const bad = decodePack([file('pack.json', manifest({ pack_id: 'd', base: { id: 'base', hash: 'deadbeef' } })), file('people.csv', 'source_key,name_first,name_last\nk3,Cy,Cedar\n')]);
    const res = resolvePacks(base, [bad.pack!]);
    expect(res.pack).toBeUndefined();
    expect(res.problems.map((p) => p.code)).toContain('delta_base_mismatch');
  });
  it('lists a conflict when two deltas change one person, later wins', () => {
    const d1 = delta('d1', { 'people.csv': 'source_key,name_first,name_last\nk1,One,Alder\n' });
    const d2 = delta('d2', { 'people.csv': 'source_key,name_first,name_last\nk1,Two,Alder\n' });
    const res = resolvePacks(base, [d1.pack!, d2.pack!]);
    expect(res.problems.map((p) => p.code)).toContain('delta_conflict');
    expect(res.pack!.tables['people']!.rows.find((r) => r['source_key'] === 'k1')!['name_first']).toBe('Two');
  });
  it('reads the removed table only in a delta, and a delta needs no people table', () => {
    const notDelta = decodePack([...basePack(), file('removed.csv', 'source_key\nk1\n')]);
    expect(notDelta.report.ignoredFiles.map((f) => f.path)).toContain('removed.csv');
    expect(delta('d', { 'removed.csv': 'source_key\nk1\n' }).report.status).toBe('pass');
  });
});

describe('manifest checks', () => {
  it('warns on seasons skipped and a group claimed with zero rows, and marks edited packs', () => {
    const r = decodePack([...basePack({ seasons_skipped: '2011', counts: { coaches: 3 } }), file('overrides.csv', 'source_key,attribute,value\nk1,speed,80\n')]);
    expect(codes(r)).toEqual(expect.arrayContaining(['seasons_skipped', 'group_without_rows', 'edited']));
    expect(r.report.edited).toBe(true);
  });
});
