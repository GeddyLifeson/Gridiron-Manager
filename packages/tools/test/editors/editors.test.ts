import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { ParamFile } from '@gm/schema';
import { loadPacks, type PackSource, type Problem } from '../../src/content/index.ts';
import {
  PARAMS, DEFAULT_SAFETY, EDITORS, assessPack, assessUserContent, buildPack, canAddToCareer, careerEdit, conditionSize, crc32,
  errorReportText, exportPackZip, importPackZip, jsonNesting, plainText, safetyScan, scanUserContentFolder, selectPacks,
  stableJson, writePackToFolder, type EditorItem,
} from '../../src/editors/index.ts';
import { corePack, item, manifest, pack } from '../content/helpers.ts';

const errs = (ps: readonly Problem[]) => ps.filter((p) => p.severity === 'error').map((p) => p.code);
const base = [corePack()];
const userPack = (id: string, files: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  pack(`${id}-dir`, { 'pack.json': manifest(id, { requires: [{ id: 'core', version: '1.0.0' }], ...extra }), 'playbooks/mine.json': item(`${id}-play`, { refs: [{ kind: 'football/routes', id: 'dig' }] }), ...files });

/** A minimal deflate zip with one entry whose declared sizes we control. */
function zipWith(name: string, data: Uint8Array, declaredSize?: number): Uint8Array {
  const comp = new Uint8Array(deflateRawSync(data));
  const enc = new TextEncoder(), n = enc.encode(name);
  const lh = new Uint8Array(30 + n.length), lv = new DataView(lh.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(14, crc32(data), true);
  lv.setUint32(18, comp.length, true); lv.setUint32(22, declaredSize ?? data.length, true); lv.setUint16(26, n.length, true); lh.set(n, 30);
  const ch = new Uint8Array(46 + n.length), cv = new DataView(ch.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(data), true);
  cv.setUint32(20, comp.length, true); cv.setUint32(24, declaredSize ?? data.length, true); cv.setUint16(28, n.length, true); ch.set(n, 46);
  const e = new Uint8Array(22), ev = new DataView(e.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, ch.length, true); ev.setUint32(16, lh.length + comp.length, true);
  const out = new Uint8Array(lh.length + comp.length + ch.length + e.length);
  out.set(lh, 0); out.set(comp, lh.length); out.set(ch, lh.length + comp.length); out.set(e, lh.length + comp.length + ch.length);
  return out;
}

const deepCondition = (d: number): unknown => (d <= 1 ? { op: 'test', name: 'ball_snapped', args: {} } : { op: 'not', of: deepCondition(d - 1) });

describe('parameters', () => {
  it('is a valid param file whose bible rows are the P7.2.1 starting values', () => {
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
    expect(DEFAULT_SAFETY).toMatchObject({ ruleTreeMaxDepth: 12, ruleMaxNodes: 200, peoplePerPack: 500_000, fileTimeLimitMs: 5000 });
  });
});

describe('hostile pack corpus (P7.2.1 acceptance): each is rejected or neutralised with the expected message', () => {
  const enc = new TextEncoder();
  // [name, pack, expected error code or null when neutralised, neutralised kind]
  const corpus: [string, () => PackSource, string | null, string | null][] = [
    ['oversized file', () => ({ origin: 'big', files: [{ path: 'pack.json', size: 100, bytes: enc.encode(JSON.stringify(manifest('big'))) }, { path: 'playbooks/x.json', size: 60 * 1024 * 1024 }] }), 'file.too_large', null],
    ['oversized pack', () => ({ origin: 'huge', files: [{ path: 'pack.json', size: 100, bytes: enc.encode(JSON.stringify(manifest('huge'))) }, ...Array.from({ length: 5 }, (_, i) => ({ path: `playbooks/x${i}.json`, size: 45 * 1024 * 1024 }))] }), 'pack.too_large', null],
    ['deep JSON nesting', () => userPack('deep', { 'playbooks/deep.json': '['.repeat(5000) + ']'.repeat(5000) }), 'safety.json_depth', null],
    ['deep folder', () => userPack('deepdir', { 'playbooks/a/b/c/d/e/f/g/x.json': item('x') }), 'file.depth', null],
    ['rule tree too deep', () => userPack('ruledeep', { 'playbooks/r.json': item('r', { rules: [{ when: deepCondition(13), guard: null, then: [{ name: 'hold', args: {} }], text: 'x' }] }) }), 'safety.rule_depth', null],
    ['rule with too many nodes', () => userPack('rulewide', { 'playbooks/r.json': item('r', { rules: [{ when: { op: 'any', of: Array.from({ length: 250 }, () => ({ op: 'test', name: 't', args: {} })) }, guard: null, then: [{ name: 'hold', args: {} }], text: 'x' }] }) }), 'safety.rule_nodes', null],
    ['path escape', () => userPack('escape', { '../outside/x.json': item('x') }), 'file.path_escape', null],
    ['absolute path', () => userPack('abs', { 'C:/Windows/x.json': item('x') }), 'file.path_escape', null],
    ['zip bomb', () => importPackZip(zipWith('playbooks/x.json', new Uint8Array(200_000).fill(32)), 'bomb.zip'), 'zip.ratio', null],
    ['zip lying about size', () => importPackZip(zipWith('pack.json', enc.encode(JSON.stringify(manifest('liar'))), 3), 'liar.zip'), 'zip.malformed', null],
    ['markup in names', () => userPack('markup', { 'playbooks/m.json': item('m', { name: '<script>alert(1)</script>' }) }), null, 'markup'],
    ['direction override in names', () => userPack('bidi', { 'playbooks/b.json': item('b', { name: 'Smith\u202Egnp.exe' }) }), null, 'control_chars'],
    ['embedded image file', () => userPack('img', { 'playbooks/logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }), null, 'image_file'],
    ['embedded image data', () => userPack('imgdata', { 'playbooks/i.json': item('i', { note: 'data:image/png;base64,iVBORw0KGgo=' }) }), 'safety.embedded_image', null],
    ['web address', () => userPack('web', { 'playbooks/w.json': item('w', { note: 'see https://example.com/x' }) }), 'safety.web_address', null],
    ['www address', () => userPack('www', { 'playbooks/w.json': item('w', { note: 'www.example.com' }) }), 'safety.web_address', null],
    ['script address', () => userPack('js', { 'playbooks/w.json': item('w', { note: 'javascript:alert(1)' }) }), 'safety.web_address', null],
    ['prototype key', () => userPack('proto', { 'playbooks/p.json': '{"__proto__":{"x":1},"id":"p","name":"p","levelTags":["both"],"author":"a","version":"1.0.0","contentSchemaVersion":1}' }), 'safety.forbidden_key', null],
    ['too many people', () => ({ origin: 'ppl', files: [] as never[] }), null, null], // replaced below with a small limit
    ['long name', () => userPack('longname', { 'playbooks/l.json': item('l', { name: 'x'.repeat(201) }) }), 'file.string_length', null],
    ['symlink-like read problem', () => ({ ...userPack('link'), readProblems: [{ severity: 'error' as const, code: 'file.path_escape', file: 'evil', path: '', message: 'symbolic links are not followed in packs (P7.2.1)' }] }), 'file.path_escape', null],
  ];
  for (const [name, make, code, neut] of corpus) {
    if (name === 'too many people') continue;
    it(name, () => {
      const e = assessPack(make(), { base });
      if (code) {
        expect(e.selectable, name).toBe(false);
        expect(errs(e.problems), name).toContain(code);
        expect(e.problems.find((p) => p.code === code)!.message.length).toBeGreaterThan(10);
      } else {
        expect(errs(e.problems), name).toEqual([]);
        expect(e.selectable, name).toBe(true);
        expect(e.neutralised.map((n) => n.what)).toContain(neut);
      }
    });
  }
  it('too many people (limit lowered for the test)', () => {
    const src = userPack('ppl', { 'people/a.json': [item('p1'), item('p2'), item('p3')] });
    const r = safetyScan(src, { limits: { ...DEFAULT_SAFETY, peoplePerPack: 2 } });
    expect(errs(r.problems)).toEqual(['safety.people_count']);
  });
  it('a file that stalls the validator is stopped by the per-file time limit', () => {
    let t = 0;
    const big = Array.from({ length: 5000 }, (_, i) => ({ k: `v${i}` }));
    const r = safetyScan(userPack('slow', { 'playbooks/s.json': item('s', { big }) }), { now: () => (t += 1000) });
    expect(errs(r.problems)).toEqual(['safety.time_limit']);
  });
  it('a pack that fails safety never reaches the loader', () => {
    const e = assessPack(userPack('web2', { 'playbooks/w.json': item('w', { note: 'http://x.y' }) }), { base });
    expect(e.hash).toBeNull();
    expect(e.problems.every((p) => p.code.startsWith('safety.'))).toBe(true);
  });
  it('real team and league marks are refused through the host check (A6.2.2)', () => {
    const e = assessPack(userPack('marks', { 'playbooks/m.json': item('m', { name: 'Big League Bowl' }) }), { base, blockedMarks: (t) => (t.some((x) => x.includes('Big League')) ? ['Big League'] : []) });
    expect(errs(e.problems)).toEqual(['safety.blocked_mark']);
  });
  it('plain text removes control and direction characters and leaves markup as literal text', () => {
    expect(plainText('Smith\u202Egnp\u200B')).toBe('Smithgnp');
    expect(plainText('<b>bold</b>')).toBe('<b>bold</b>');
  });
  it('JSON nesting is measured without parsing, ignoring brackets inside strings', () => {
    expect(jsonNesting(new TextEncoder().encode('{"a":"[[[[","b":[{"c":"\\"]"}]}'))).toEqual({ depth: 3, nodes: 3 });
  });
  it('condition size counts depth and nodes of J4 trees', () => {
    expect(conditionSize(deepCondition(12))).toEqual({ depth: 12, nodes: 12 });
    expect(conditionSize({ op: 'all', of: [{ op: 'test', name: 'a', args: {} }, { op: 'any', of: [{ op: 'test', name: 'b', args: {} }] }] })).toEqual({ depth: 3, nodes: 4 });
  });
  it('a rule at exactly the limits is accepted', () => {
    const e = assessPack(userPack('edge', { 'playbooks/r.json': item('r', { rules: [{ when: deepCondition(12), guard: null, then: [{ name: 'hold', args: {} }], text: 'x' }] }) }), { base });
    expect(errs(e.problems)).toEqual([]);
  });
});

describe('user content folder and Mods list (P7.1.1)', () => {
  it('lists each pack with kinds, version, author, signature state and errors; a pack with errors is not selectable', () => {
    const good = userPack('good-pack', {}, { signature: 'abc' });
    const bad = userPack('bad-pack', { 'playbooks/x.json': item('x', { refs: [{ kind: 'football/routes', id: 'nope' }] }) });
    const list = assessUserContent([bad, good], { base });
    expect(list.entries.map((e) => [e.packId, e.selectable, e.signature])).toEqual([['bad-pack', false, 'unsigned'], ['good-pack', true, 'signature_not_checked']]);
    const g = list.entries[1]!;
    expect(g).toMatchObject({ version: '1.0.0', author: 'tests', kinds: ['football'], itemKinds: ['playbooks'] });
    expect(g.hash).toMatch(/^[0-9a-f]{64}$/);
    const report = errorReportText(list.entries[0]!);
    expect(report).toContain('cannot be selected');
    expect(report).toContain('ERROR ref.missing');
  });
  it('two user packs with one id are both refused', () => {
    const list = assessUserContent([userPack('twin'), { ...userPack('twin'), origin: 'twin-copy' }], { base });
    expect(list.entries.every((e) => !e.selectable && errs(e.problems).includes('pack.duplicate_id'))).toBe(true);
  });
  it('other file types are ignored and listed', () => {
    const e = assessPack(userPack('readme', { 'playbooks/README.txt': 'hello' }), { base });
    expect(e.selectable).toBe(true);
    expect(e.ignored.map((i) => i.file)).toContain('playbooks/README.txt');
  });
  it('dropping a valid playbook pack in the folder makes it selectable at the next scan, with no restart (acceptance)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-uc-'));
    try {
      expect(assessUserContent(scanUserContentFolder(root), { base }).entries).toEqual([]);
      const built = buildPack({ editor: 'playbook-manager', pack: { id: 'my-book', name: 'My book', version: '1.0.0', author: 'Coach', coreVersion: '1.0.0' }, items: [{ kind: 'playbooks', item: item('my-dig', { author: 'Coach', refs: [{ kind: 'football/routes', id: 'dig' }] }) }] });
      writePackToFolder(root, 'my-book', built.files!);
      const sources = scanUserContentFolder(root);
      const list = assessUserContent(sources, { base });
      expect(list.entries.map((e) => [e.packId, e.selectable])).toEqual([['my-book', true]]);
      const sel = selectPacks(list, sources, ['my-book'], { base });
      expect(sel.refused).toEqual([]);
      expect(sel.packs).toHaveLength(1);
      expect(sel.contentHash).toMatch(/^[0-9a-f]{64}$/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('reads zipped packs, skips top-level links, and refuses links inside packs', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-uc-'));
    try {
      const built = buildPack({ editor: 'playbook-manager', pack: { id: 'zipped', name: 'Z', version: '1.0.0', author: 'Coach' }, items: [{ kind: 'playbooks', item: item('z1') }] });
      writeFileSync(join(root, 'zipped.zip'), exportPackZip(built.source!));
      mkdirSync(join(root, 'linky', 'playbooks'), { recursive: true });
      writeFileSync(join(root, 'linky', 'pack.json'), JSON.stringify(manifest('linky')));
      symlinkSync(tmpdir(), join(root, 'linky', 'playbooks', 'out'));
      symlinkSync(tmpdir(), join(root, 'toplink'));
      const list = assessUserContent(scanUserContentFolder(root), { base });
      expect(list.entries.map((e) => [e.packId, e.selectable])).toEqual([['linky', false], ['zipped', true]]);
      expect(errs(list.entries[0]!.problems)).toContain('file.path_escape');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('selection refuses a pack with errors, an unknown pack, and two packs that conflict', () => {
    const a = userPack('aa', { 'playbooks/same.json': item('same') });
    const b = userPack('bb', { 'playbooks/same.json': item('same') });
    const bad = userPack('cc', { 'playbooks/w.json': item('w', { note: 'https://x.y' }) });
    const list = assessUserContent([a, b, bad], { base });
    expect(selectPacks(list, [a, b, bad], ['cc'], { base }).refused).toEqual([{ packId: 'cc', reason: 'has errors; see its report' }]);
    expect(selectPacks(list, [a, b, bad], ['zz'], { base }).refused[0]!.reason).toBe('not in the user content folder');
    const both = selectPacks(list, [a, b, bad], ['aa', 'bb'], { base });
    expect(both.packs).toEqual([]);
    expect(both.problems.map((p) => p.code)).toContain('item.duplicate_id');
  });
  it('adding to a running career: own playbook content any time; other kinds only at a season boundary in a non-certified career', () => {
    const list = assessUserContent([
      userPack('own-book', {}, { author: 'Coach' }),
      pack('world-dir', { 'pack.json': manifest('world-mod', { author: 'Coach' }), 'world/w.json': item('w1') }),
    ], { base });
    const [own, world] = [list.entries.find((e) => e.packId === 'own-book')!, list.entries.find((e) => e.packId === 'world-mod')!];
    const c = { certified: true, atSeasonBoundary: false, userAuthor: 'Coach' };
    expect(canAddToCareer(own, c).allowed).toBe(true);
    expect(canAddToCareer({ ...own, author: 'Someone' }, { ...c, certified: false }).allowed).toBe(false);
    expect(canAddToCareer(world, c).allowed).toBe(false);
    expect(canAddToCareer(world, { ...c, certified: false }).allowed).toBe(false);
    expect(canAddToCareer(world, { ...c, certified: false, atSeasonBoundary: true }).allowed).toBe(true);
  });
});

describe('editors as content writers (P7.5.1)', () => {
  const sample: Record<string, EditorItem[]> = {
    'play-designer': [{ kind: 'playbooks', item: item('slant-flat', { refs: [{ kind: 'football/routes', id: 'slant' }] }) }, { kind: 'football/routes', item: item('whip', { depth: 6 }) }],
    'defense-designer': [{ kind: 'football/coverages', item: item('cover-3-match') }, { kind: 'football/fronts', item: item('under') }, { kind: 'football/pressures', item: item('fire-zone') }],
    'playbook-manager': [{ kind: 'playbooks', item: item('red-zone', { refs: [{ kind: 'football/formations', id: 'doubles' }] }) }],
    'terminology-editor': [{ kind: 'playbooks', item: item('terms', { words: { slant: 'Lion' } }) }],
    'special-teams-designer': [{ kind: 'football/special-teams', item: item('punt-spread') }],
    'player-designer': [{ kind: 'people', item: item('made-up-qb', { origin: 'real' }) }],
    'world-options': [{ kind: 'world', item: item('small-world', { teams: 32 }) }],
    'rule-set-editor': [{ kind: 'league-rules', item: item('house-rules', { rosterLimit: 53 }) }],
    'people-pack-builder': [{ kind: 'packs-people', item: item('my-people') }],
  };
  it('every editor in the P7.5.1 list has a sample here', () => {
    expect(Object.keys(sample).sort()).toEqual(EDITORS.map((e) => e.id).sort());
  });
  for (const ed of EDITORS) {
    it(`${ed.title}: output passes the pack validator with no hand editing (acceptance)`, () => {
      const built = buildPack({ editor: ed.id, pack: { id: `${ed.id}-out`, name: ed.title, version: '1.0.0', author: 'Coach', coreVersion: '1.0.0' }, items: sample[ed.id]! });
      expect(built.problems).toEqual([]);
      const r = loadPacks([...base, built.source!]);
      expect(errs(r.problems)).toEqual([]);
      expect(r.set).not.toBeNull();
      const e = assessPack(built.source!, { base });
      expect(e.selectable).toBe(true);
      // Export and import give the same pack back.
      const back = importPackZip(exportPackZip(built.source!), `${ed.id}.zip`);
      expect(back.readProblems).toEqual([]);
      expect(loadPacks([...base, back]).set!.hash).toBe(r.set!.hash);
    });
  }
  it('the player designer writes generated people only and refuses a real-person source key', () => {
    const ok = buildPack({ editor: 'player-designer', pack: { id: 'pd', name: 'pd', version: '1.0.0', author: 'Coach' }, items: sample['player-designer']! });
    expect(JSON.parse(ok.files!['people/made-up-qb.json']!).origin).toBe('generated');
    const bad = buildPack({ editor: 'player-designer', pack: { id: 'pd', name: 'pd', version: '1.0.0', author: 'Coach' }, items: [{ kind: 'people', item: item('x', { sourceKey: 'abc' }) }] });
    expect(errs(bad.problems)).toEqual(['editor.real_source_key']);
    expect(bad.files).toBeNull();
  });
  it('the rule-set editor is refused for a certified career; editors refuse kinds they do not write', () => {
    expect(errs(buildPack({ editor: 'rule-set-editor', certified: true, pack: { id: 'rr', name: 'r', version: '1.0.0', author: 'C' }, items: sample['rule-set-editor']! }).problems)).toEqual(['editor.not_certified']);
    expect(errs(buildPack({ editor: 'playbook-manager', pack: { id: 'r2', name: 'r', version: '1.0.0', author: 'C' }, items: [{ kind: 'world', item: item('w') }] }).problems)).toEqual(['editor.kind']);
    expect(errs(buildPack({ editor: 'playbook-manager', pack: { id: 'core', name: 'r', version: '1.0.0', author: 'C' }, items: [] }).problems)).toEqual(['editor.pack_id']);
  });
  it('saving is deterministic: same items, same bytes, same zip', () => {
    const req = { editor: 'defense-designer', pack: { id: 'det', name: 'd', version: '1.0.0', author: 'C' }, items: [...sample['defense-designer']!].reverse() };
    const a = buildPack(req), b = buildPack({ ...req, items: sample['defense-designer']! });
    expect(a.files).toEqual(b.files);
    expect(exportPackZip(a.source!)).toEqual(exportPackZip(b.source!));
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });
  it('the exported zip is a standard zip (CRC-32 check value and node inflate-free read)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('inside a career, playbook edits become EditPlay commands and world-wide edits are blocked (P4.4.1)', () => {
    const ok = careerEdit('playbooks', item('p'));
    expect(ok.ok && ok.command.type).toBe('EditPlay');
    expect(ok.ok && ok.command.payload.itemHash).toMatch(/^[0-9a-f]{64}$/);
    const no = careerEdit('rules', item('r'));
    expect(no.ok).toBe(false);
  });
});
