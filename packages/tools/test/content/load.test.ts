import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { defaultRegistry, envelopeKind, registerUiKinds, getItem, loadPacks, sha256Hex, itemHash, setTextSupport, textSupport, DEFAULT_LIMITS, PARAMS, type FootballCheck, type Problem } from '../../src/content/index.ts';
import { ParamFile } from '@gm/schema';
import { corePack, fakeRules, item, manifest, pack } from './helpers.ts';

const enc = new TextEncoder();
const codes = (ps: readonly Problem[], sev: Problem['severity'] = 'error') => ps.filter((p) => p.severity === sev).map((p) => p.code);

describe('SHA-256 (P4.3.1 hash function)', () => {
  it('matches the FIPS 180-4 example vectors', () => {
    expect(sha256Hex(enc.encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex(enc.encode('a'.repeat(1_000_000)))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('matches node:crypto on random inputs of every length around block edges', () => {
    let x = 12345;
    for (let len = 0; len < 300; len++) {
      const b = new Uint8Array(len);
      for (let i = 0; i < len; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; b[i] = x >>> 24; }
      expect(sha256Hex(b), `len ${len}`).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });
});

describe('packs and load order (P4.1.1)', () => {
  it('loads the core pack and resolves references', () => {
    const r = loadPacks([corePack()]);
    expect(codes(r.problems)).toEqual([]);
    expect(r.set!.items.size).toBe(4);
    expect(getItem(r.set!, 'football/routes', 'dig')!.data).toMatchObject({ depth: 12 });
    expect(r.set!.manifest.map((m) => m.packId)).toEqual(['core']);
  });
  it('acceptance: the same pack set in different scan orders gives the same content hash', () => {
    const a = corePack();
    const user = pack('u', { 'pack.json': manifest('zeta', { requires: [{ id: 'alpha', version: '1.0.0' }] }), 'football/routes/x.json': item('wheel') });
    const alpha = pack('a', { 'pack.json': manifest('alpha'), 'football/routes/y.json': item('seam') });
    const r1 = loadPacks([a, user, alpha]);
    const reversed = [alpha, user, { ...a, files: [...a.files].reverse() }];
    const r2 = loadPacks(reversed);
    expect(r1.set!.hash).toBe(r2.set!.hash);
    expect(r1.order).toEqual(['core', 'alpha', 'zeta']);
    expect(r2.order).toEqual(['core', 'alpha', 'zeta']);
  });
  it('dependency order beats id order; ties go by id', () => {
    const b = pack('b', { 'pack.json': manifest('bravo') });
    const a = pack('a', { 'pack.json': manifest('alpha', { requires: [{ id: 'charlie', version: '1.0.0' }] }) });
    const c = pack('c', { 'pack.json': manifest('charlie') });
    expect(loadPacks([a, b, c]).order).toEqual(['bravo', 'charlie', 'alpha']);
  });
  it('a missing or too-old requirement and a cycle are errors', () => {
    expect(codes(loadPacks([pack('a', { 'pack.json': manifest('alpha', { requires: [{ id: 'nope', version: '1.0.0' }] }) })]).problems)).toEqual(['pack.missing_requirement']);
    expect(codes(loadPacks([pack('a', { 'pack.json': manifest('alpha', { requires: [{ id: 'bravo', version: '2.0.0' }] }) }), pack('b', { 'pack.json': manifest('bravo') })]).problems)).toEqual(['pack.requirement_version']);
    const x = pack('x', { 'pack.json': manifest('xray', { requires: [{ id: 'yank', version: '1.0.0' }] }) });
    const y = pack('y', { 'pack.json': manifest('yank', { requires: [{ id: 'xray', version: '1.0.0' }] }) });
    expect(codes(loadPacks([x, y]).problems)).toEqual(['pack.dependency_cycle']);
  });
  it('two packs defining the same id without a declared override is an error naming both', () => {
    const user = pack('u', { 'pack.json': manifest('mine'), 'football/routes/s.json': item('slant', { depth: 6 }) });
    const r = loadPacks([corePack(), user]);
    const e = r.problems.find((p) => p.code === 'item.duplicate_id')!;
    expect(e.message).toContain('pack core');
    expect(e.message).toContain('pack mine');
    expect(r.set).toBeNull();
  });
  it('a declared override replaces the item, but not in a certified career when it is a core item', () => {
    const user = pack('u', { 'pack.json': manifest('mine', { overrides: ['football/routes/slant'] }), 'football/routes/s.json': item('slant', { depth: 6 }) });
    const r = loadPacks([corePack(), user]);
    expect(codes(r.problems)).toEqual([]);
    expect(getItem(r.set!, 'football/routes', 'slant')!).toMatchObject({ packId: 'mine', data: { depth: 6 } });
    expect(codes(loadPacks([corePack(), user], { certified: true }).problems)).toEqual(['item.override_certified']);
  });
  it('the same id twice inside one pack is an error', () => {
    const r = loadPacks([corePack({ 'football/routes/more.json': item('slant') })]);
    expect(codes(r.problems)).toEqual(['item.duplicate_id']);
  });
  it('changing only a display name changes the item hash (accepted, P4.3.1 edge case)', () => {
    expect(itemHash(item('slant', { name: 'Slant' }))).not.toBe(itemHash(item('slant', { name: 'Quick slant' })));
    expect(itemHash({ a: 1, b: 2 })).toBe(itemHash({ b: 2, a: 1 }));
  });
});

// P4.2.1 acceptance: a corpus of deliberately broken files, one per rule, each producing exactly its
// expected error. Each case is the good core pack with one file added or replaced.
const BROKEN: [string, Record<string, unknown>, string][] = [
  ['manifest missing', { 'pack.json': undefined }, 'manifest.missing'],
  ['manifest not JSON', { 'pack.json': '{oops' }, 'manifest.json'],
  ['manifest bad version', { 'pack.json': manifest('core', { version: 'one' }) }, 'manifest.invalid_format'],
  ['manifest unknown field in core', { 'pack.json': manifest('core', { colour: 'red' }) }, 'schema.unknown_field'],
  ['not JSON', { 'football/routes/bad.json': '{"id": ' }, 'file.json'],
  ['not UTF-8', { 'football/routes/bad.json': new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]) }, 'file.encoding'],
  ['missing required field', { 'football/routes/bad.json': { id: 'post', name: 'post', levelTags: ['both'], version: '1.0.0', contentSchemaVersion: 1 } }, 'schema.required'],
  ['wrong type', { 'football/routes/bad.json': item('post', { contentSchemaVersion: 'one' }) }, 'schema.invalid_type'],
  ['bad id format', { 'football/routes/bad.json': item('Post Route') }, 'schema.invalid_format'],
  ['bad level tag', { 'football/routes/bad.json': item('post', { levelTags: ['both', 'formation.x'] }) }, 'item.level_tags'],
  ['name too long', { 'football/routes/bad.json': item('post', { name: 'x'.repeat(201) }) }, 'file.string_length'],
  ['newer schema version', { 'football/routes/bad.json': item('post', { contentSchemaVersion: 9 }) }, 'schema.version_newer'],
  ['unknown kind in core', { 'gadgets/x.json': item('x') }, 'file.unknown_kind'],
  ['path escape', { '../outside.json': item('x') }, 'file.path_escape'],
  ['folder too deep', { 'football/routes/a/b/c/d/e/f.json': item('deep') }, 'file.depth'],
  ['missing reference', { 'playbooks/two.json': item('two', { refs: [{ kind: 'football/routes', id: 'corner' }] }) }, 'ref.missing'],
  ['reference of the wrong kind', { 'playbooks/two.json': item('two', { refs: [{ kind: 'football/formations', id: 'slant' }] }) }, 'ref.kind'],
  ['draft in core', { 'playbooks/two.json': item('two', { draft: true }) }, 'item.core_draft'],
  ['rule-set file without a register id', { 'rules/pro_2027.json': { ruleset_id: 'pro_2027', level: 'pro', season_year: 2027, source: { document: 'x', date: 'y' }, schema_version: 1, values: [{ key: 'a.b', value: 1 }] } }, 'schema.required'],
];

describe('broken files each produce exactly their expected error (P4.2.1 acceptance)', () => {
  for (const [name, over, code] of BROKEN) {
    it(name, () => {
      const base = corePack();
      const files = new Map(base.files.map((f) => [f.path, f]));
      for (const [p, v] of Object.entries(over)) {
        if (v === undefined) { files.delete(p); continue; }
        const bytes = v instanceof Uint8Array ? v : enc.encode(typeof v === 'string' ? v : JSON.stringify(v));
        files.set(p, { path: p, size: bytes.length, bytes });
      }
      const r = loadPacks([{ origin: 'core-dir', files: [...files.values()] }]);
      expect(codes(r.problems)).toEqual([code]);
      expect(r.set).toBeNull();
    });
  }
  it('unknown fields and unknown kinds are warnings in user packs', () => {
    const user = pack('u', { 'pack.json': manifest('mine', { colour: 'red' }), 'gadgets/x.json': item('x'), 'readme.txt': 'hi', 'notes.json': {} });
    const r = loadPacks([corePack(), user]);
    expect(codes(r.problems)).toEqual([]);
    expect(codes(r.problems, 'warning').sort()).toEqual(['file.unknown_kind', 'schema.unknown_field']);
    expect(r.ignored.map((i) => i.file).sort()).toEqual(['gadgets/x.json', 'notes.json', 'readme.txt']);
  });
  it('size limits refuse oversized files and packs', () => {
    const limits = { ...DEFAULT_LIMITS, maxFileBytes: 50, maxPackBytes: 400 };
    expect(codes(loadPacks([corePack({ 'football/routes/big.json': item('big', { pad: 'x'.repeat(60) }) })], { limits }).problems)).toContain('file.too_large');
    expect(codes(loadPacks([corePack()], { limits: { ...DEFAULT_LIMITS, maxPackBytes: 100 } }).problems)).toContain('pack.too_large');
  });
  it('the limits are P7.2.1 starting values in a valid parameter file', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(PARAMS.params.every((p) => p.basis === 'bible' && p.leaf === 'P7.2.1')).toBe(true);
    expect(DEFAULT_LIMITS.maxFolderDepth).toBe(6);
    expect(DEFAULT_LIMITS.maxZipRatio).toBe(100);
  });
  it('an older content schema version is upgraded in memory before validation', () => {
    const registry = registerUiKinds(defaultRegistry());
    registry.register(envelopeKind('football/routes', 'football/routes/', {
      version: 2,
      migrations: [{ from: 1, up: (d) => (Array.isArray(d) ? d : [d]).map((x) => ({ ...(x as object), contentSchemaVersion: 2, depthYd: (x as { depth?: number }).depth ?? 0 })) }],
    }));
    const r = loadPacks([corePack()], { registry });
    expect(codes(r.problems)).toEqual([]);
    expect(getItem(r.set!, 'football/routes', 'dig')!.data).toMatchObject({ contentSchemaVersion: 2, depthYd: 12 });
    const noStep = registerUiKinds(defaultRegistry()).register(envelopeKind('football/routes', 'football/routes/', { version: 3, migrations: [] }));
    expect(codes(loadPacks([corePack()], { registry: noStep }).problems)).toEqual(['schema.no_migration', 'ref.missing']);
  });
  it('a level-tag mismatch is a warning, not a refusal', () => {
    const r = loadPacks([corePack({ 'football/formations/empty.json': item('empty', { levelTags: ['formation.empty_backfield'] }), 'playbooks/e.json': item('e', { refs: [{ kind: 'football/formations', id: 'empty' }] }) })]);
    expect(codes(r.problems)).toEqual([]);
    expect(codes(r.problems, 'warning')).toEqual(['ref.level_tag']);
  });
  it('a user draft with a missing reference loads as a draft', () => {
    const user = pack('u', { 'pack.json': manifest('mine'), 'playbooks/d.json': item('d', { draft: true, refs: [{ kind: 'football/routes', id: 'corner' }] }) });
    const r = loadPacks([corePack(), user]);
    expect(codes(r.problems)).toEqual([]);
    expect(getItem(r.set!, 'playbooks', 'd')!.status).toBe('draft');
  });
});

describe('football validation: illegal plays are flagged, not refused (P4.2.2)', () => {
  const pro = fakeRules('pro_2026'), college = fakeRules('college_2026');
  // Stub of the WP-10 legality checker: a formation with fewer than `onLine` players on the line is
  // illegal; the rule key it rests on is the finding's ruleKey. Real checks come from @gm/football-lang.
  const lineCheck = (minByRules: Record<string, number>): FootballCheck => ({
    kind: 'football/formations',
    check: (it, rs) => {
      const d = it.data as { onLine?: number; broken?: boolean };
      if (d.broken) return [{ severity: 'error', code: 'formation.slot_missing', ruleKey: null, role: 'X', messageKey: 'slot X has no alignment' }];
      const out = [];
      if ((d.onLine ?? 7) < minByRules[rs.id]!) out.push({ severity: 'warning' as const, code: 'formation.line_min', ruleKey: 'formation.offense_on_line_min', role: null, messageKey: `${d.onLine} on the line` });
      if (it.id === 'doubles') out.push({ severity: 'warning' as const, code: 'protection.unhandled_case', ruleKey: null, role: 'RB', messageKey: 'no rule against a weak-side B-gap blitz' });
      return out;
    },
  });
  const check = lineCheck({ pro_2026: 7, college_2026: 7 });

  it('tags each item with the rule sets it is legal under', () => {
    const r = loadPacks([corePack({ 'football/formations/odd.json': item('odd', { onLine: 6 }) })], { ruleSets: [pro, college], football: [lineCheck({ pro_2026: 7, college_2026: 6 })] });
    expect(codes(r.problems)).toEqual([]);
    expect(getItem(r.set!, 'football/formations', 'odd')!.legalUnder).toEqual(['college_2026']);
    expect(getItem(r.set!, 'football/formations', 'doubles')!.legalUnder).toEqual(['pro_2026', 'college_2026']);
    expect(r.problems.filter((p) => p.severity === 'flag').map((p) => p.ruleSetId)).toEqual(['pro_2026']);
    expect(codes(r.problems, 'warning')).toEqual(['protection.unhandled_case', 'protection.unhandled_case']);
  });
  it('a user play illegal under every rule set loads, flagged "illegal as drawn"', () => {
    const user = pack('u', { 'pack.json': manifest('mine'), 'football/formations/six.json': item('six', { onLine: 6 }) });
    const r = loadPacks([corePack(), user], { ruleSets: [pro, college], football: [check] });
    expect(r.set).not.toBeNull();
    const six = getItem(r.set!, 'football/formations', 'six')!;
    expect(six.status).toBe('illegal');
    expect(six.legalUnder).toEqual([]);
    const flags = r.problems.filter((p) => p.severity === 'flag');
    expect(flags.map((f) => [f.code, f.ruleKey, f.ruleSetId])).toEqual([
      ['formation.line_min', 'formation.offense_on_line_min', 'pro_2026'],
      ['formation.line_min', 'formation.offense_on_line_min', 'college_2026'],
    ]);
    expect(flags[0]!.message).toContain('illegal as drawn');
  });
  it('shipped content must be legal under at least one rule set', () => {
    const r = loadPacks([corePack({ 'football/formations/six.json': item('six', { onLine: 6 }) })], { ruleSets: [pro, college], football: [check] });
    expect(codes(r.problems)).toEqual(['football.shipped_illegal']);
  });
  it('content the engine cannot run is refused, unless it is a user draft', () => {
    const bad = pack('u', { 'pack.json': manifest('mine'), 'football/formations/b.json': item('b', { broken: true }) });
    expect(codes(loadPacks([corePack(), bad], { ruleSets: [pro], football: [check] }).problems)).toEqual(['formation.slot_missing']);
    const draft = pack('u', { 'pack.json': manifest('mine'), 'football/formations/b.json': item('b', { broken: true, draft: true }) });
    const r = loadPacks([corePack(), draft], { ruleSets: [pro], football: [check] });
    expect(codes(r.problems)).toEqual([]);
    expect(getItem(r.set!, 'football/formations', 'b')!.status).toBe('draft');
  });
});

describe('text files go through the template validator', () => {
  const textFile = { contentSchemaVersion: 1, language: 'en', templates: [{ key: 'inbox.hello', params: {}, default: 'Hello.' }] };
  it('with the validator injected, templates load as items keyed by language and key', () => {
    setTextSupport({ validateTemplateFile: (d) => ({ file: d as never, problems: [] }) });
    try {
      const r = loadPacks([corePack({ 'text/en/inbox.json': textFile })]);
      expect(codes(r.problems)).toEqual([]);
      expect(getItem(r.set!, 'text', 'en:inbox.hello')).toBeDefined();
      expect(codes(loadPacks([corePack({ 'text/fr/inbox.json': textFile })]).problems)).toEqual(['text.language_folder']);
    } finally { setTextSupport(undefined); }
  });
  it('without the football-content barrel line, text files load with a warning', () => {
    setTextSupport(null);
    try {
      const r = loadPacks([corePack({ 'text/en/inbox.json': textFile })]);
      expect(codes(r.problems)).toEqual([]);
      expect(codes(r.problems, 'warning')).toEqual(['text.validator_missing']);
    } finally { setTextSupport(undefined); }
  });
  it.skipIf(!textSupport())('the real validator is wired once the barrel exports it', () => {
    const r = loadPacks([corePack({ 'text/en/inbox.json': { ...textFile, templates: [{ key: 'bad', params: {}, default: 'x' }] } })]);
    expect(codes(r.problems)).toEqual(['template.key_format']);
  });
});
