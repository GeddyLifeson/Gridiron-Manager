import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  CompileCache, ContentStore, contrastRatio, getItem, loadPacks, readPackFolder, readZipBytes, scanSource, watchPackFolder,
  DEFAULT_LIMITS, type FootballCheck, type Problem, type StageResult,
} from '../../src/content/index.ts';
import { corePack, fakeRules, item, manifest, pack } from './helpers.ts';

const enc = new TextEncoder();
const json = (v: unknown) => enc.encode(JSON.stringify(v));
const codes = (ps: readonly Problem[], sev: Problem['severity'] = 'error') => ps.filter((p) => p.severity === sev).map((p) => p.code);

// A stand-in for the test bench: runs the slant and returns the depth it used.
const benchRun = (store: ContentStore) => {
  const route = getItem(store.current(), 'football/routes', 'slant')!;
  return { depth: (route.data as { depth: number }).depth, routeHash: route.hash, setVersion: store.current().version };
};

describe('hot reload (P4.4.1)', () => {
  it('acceptance: editing a route depth changes the next bench run and no earlier record', () => {
    const { store } = ContentStore.open([corePack()], { mode: 'editor' });
    const before = store!.current();
    const record = benchRun(store!);
    const r = store!.stage('core-dir', [{ path: 'football/routes/routes.json', bytes: json([item('slant', { depth: 7 }), item('dig', { depth: 12 })]) }]);
    expect(r.accepted).toBe(true);
    expect(r.changed).toEqual(['football/routes/slant']);
    const next = benchRun(store!);
    expect(next.depth).toBe(7);
    expect(next.setVersion).toBe(2);
    // The earlier record still resolves to the item it used, in its own set and by hash.
    expect(record.depth).toBe(5);
    expect((getItem(before, 'football/routes', 'slant')!.data as { depth: number }).depth).toBe(5);
    expect((store!.itemByHash(record.routeHash)!.data as { depth: number }).depth).toBe(5);
    // Unchanged items are shared, not copied.
    expect(getItem(store!.current(), 'football/routes', 'dig')).toBe(getItem(before, 'football/routes', 'dig'));
    expect(getItem(store!.current(), 'football/formations', 'doubles')).toBe(getItem(before, 'football/formations', 'doubles'));
  });
  it('swaps between plays, never mid-play', () => {
    const { store } = ContentStore.open([corePack()], { mode: 'editor' });
    const swaps: number[] = [];
    store!.onSwap((s) => swaps.push(s.version));
    store!.beginPlay();
    const r = store!.stage('core-dir', [{ path: 'football/routes/routes.json', bytes: json([item('slant', { depth: 8 }), item('dig', { depth: 12 })]) }]);
    expect(r.pending).toBe(true);
    expect(benchRun(store!).depth).toBe(5);
    store!.endPlay();
    expect(benchRun(store!).depth).toBe(8);
    expect(swaps).toEqual([2]);
  });
  it('a reload that fails validation keeps the old set and reports', () => {
    const { store } = ContentStore.open([corePack()], { mode: 'dev' });
    const r = store!.stage('core-dir', [{ path: 'football/routes/routes.json', bytes: enc.encode('[{"id": "slant"') }]);
    expect(r.accepted).toBe(false);
    expect(codes(r.problems)).toEqual(['file.json', 'ref.missing']);
    expect(store!.current().version).toBe(1);
    expect(benchRun(store!).depth).toBe(5);
    const del = store!.stage('core-dir', [{ path: 'football/routes/routes.json', bytes: null }]);
    expect(codes(del.problems)).toEqual(['ref.missing']);
  });
  it('in a running career, rule sets change only through a logged override that drops certification', () => {
    const rules = { ruleset_id: 'pro_2027', level: 'pro', season_year: 2027, source: { document: 'x', date: 'y' }, schema_version: 1, values: [{ key: 'a.b', value: 1, factId: 'F-test-0001' }] };
    const { store } = ContentStore.open([corePack()], { mode: 'career' });
    const blocked = store!.stage('core-dir', [{ path: 'rules/pro_2027.json', bytes: json(rules) }]);
    expect(codes(blocked.problems)).toEqual(['reload.world_content_blocked']);
    expect(store!.current().certifiedEligible).toBe(true);
    const ok = store!.stage('core-dir', [{ path: 'rules/pro_2027.json', bytes: json(rules) }], { reason: 'house rule test' });
    expect(ok.accepted).toBe(true);
    expect(ok.override).toMatchObject({ reason: 'house rule test', files: ['rules/pro_2027.json'] });
    expect(store!.current().certifiedEligible).toBe(false);
    // Playbook edits are not world-wide and pass in a career (they arrive as EditPlay commands).
    expect(store!.stage('core-dir', [{ path: 'playbooks/base.json', bytes: json(item('base-slant', { refs: [{ kind: 'football/routes', id: 'dig' }] })) }]).accepted).toBe(true);
  });
  it('compiled forms are cached by item hash and football checks are not repeated for unchanged items', () => {
    let checks = 0;
    const check: FootballCheck = { kind: 'football/routes', check: () => { checks++; return []; } };
    const { store } = ContentStore.open([corePack()], { mode: 'editor', ruleSets: [fakeRules('pro_2026')], football: [check] });
    expect(checks).toBe(2);
    const cache = new CompileCache<number>();
    const compileAll = () => [...store!.current().items.values()].forEach((i) => cache.get(i, () => 1));
    compileAll();
    expect(cache.compileCount).toBe(4);
    store!.stage('core-dir', [{ path: 'football/routes/routes.json', bytes: json([item('slant', { depth: 9 }), item('dig', { depth: 12 })]) }]);
    expect(checks).toBe(3);
    compileAll();
    expect(cache.compileCount).toBe(5);
    cache.retain(store!.current());
    expect(cache.size).toBe(4);
  });
});

describe('platform adapters: folders and zips (P4.1.1, P7.2.1 limits)', () => {
  const writePack = (files: Record<string, unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-pack-'));
    for (const [p, v] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), JSON.stringify(v)); }
    return dir;
  };
  it('reads a folder and does not follow symbolic links', () => {
    const dir = writePack({ 'pack.json': manifest('core'), 'football/routes/r.json': item('slant') });
    symlinkSync('/etc', join(dir, 'football', 'escape'));
    const src = readPackFolder(dir);
    const r = loadPacks([src]);
    expect(codes(r.problems)).toEqual(['file.path_escape']);
    expect(src.files.map((f) => f.path).sort()).toEqual(['football/routes/r.json', 'pack.json']);
  });

  function zip(entries: { name: string; data: Uint8Array; deflate?: boolean; claimSize?: number }[]): Uint8Array {
    const parts: Uint8Array[] = [], central: Uint8Array[] = [];
    let off = 0;
    for (const e of entries) {
      const body = e.deflate ? new Uint8Array(deflateRawSync(e.data)) : e.data;
      const name = enc.encode(e.name);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, e.deflate ? 8 : 0, true);
      lh.setUint32(18, body.length, true); lh.setUint32(22, e.claimSize ?? e.data.length, true); lh.setUint16(26, name.length, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, e.deflate ? 8 : 0, true);
      ch.setUint32(20, body.length, true); ch.setUint32(24, e.claimSize ?? e.data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), name, body);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + body.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(eocd.buffer)];
    const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  it('reads a zipped pack (stored and deflate, one top folder) to the same hash as the folder', () => {
    const dir = writePack({ 'pack.json': manifest('core'), 'football/routes/r.json': item('slant') });
    const z = zip([
      { name: 'mypack/pack.json', data: json(manifest('core')) },
      { name: 'mypack/football/routes/r.json', data: json(item('slant')), deflate: true },
    ]);
    const a = loadPacks([readPackFolder(dir)]), b = loadPacks([readZipBytes(z, 'mypack.zip')]);
    expect(codes(b.problems)).toEqual([]);
    expect(b.set!.hash).toBe(a.set!.hash);
  });
  it('refuses a zip bomb by its declared expansion ratio before inflating', () => {
    const big = new Uint8Array(200_000);
    const z = zip([{ name: 'pack.json', data: json(manifest('core')) }, { name: 'football/routes/bomb.json', data: big, deflate: true }]);
    const src = readZipBytes(z, 'bomb.zip');
    expect(src.readProblems!.map((p) => p.code)).toEqual(['zip.ratio']);
    expect(codes(loadPacks([src]).problems)).toEqual(['zip.ratio']);
  });
  it('reports a file that is not a zip', () => {
    expect(readZipBytes(enc.encode('hello'), 'x.zip').readProblems!.map((p) => p.code)).toEqual(['zip.malformed']);
  });
  it('lists an oversized file without reading it', () => {
    const dir = writePack({ 'pack.json': manifest('core'), 'football/routes/r.json': item('slant', { pad: 'x'.repeat(500) }) });
    const src = readPackFolder(dir, { ...DEFAULT_LIMITS, maxFileBytes: 100 });
    expect(src.files.find((f) => f.path === 'football/routes/r.json')!.bytes).toBeUndefined();
  });

  it('development builds reload a saved file from disk', async () => {
    const dir = writePack({ 'pack.json': manifest('core'), 'football/routes/r.json': item('slant', { depth: 5 }) });
    const { store } = ContentStore.open([readPackFolder(dir)], { mode: 'dev' });
    const got = new Promise<StageResult>((resolve) => {
      const w = watchPackFolder(dir, store!, (r) => { w.close(); resolve(r); }, 50);
      setTimeout(() => writeFileSync(join(dir, 'football/routes/r.json'), JSON.stringify(item('slant', { depth: 11 }))), 50);
    });
    const r = await got;
    expect(r.accepted).toBe(true);
    expect((getItem(store!.current(), 'football/routes', 'slant')!.data as { depth: number }).depth).toBe(11);
  });
});

describe('ui folder build checks (P4.5.1)', () => {
  const screens = { contentSchemaVersion: 1, screens: [
    { id: 'home', titleKey: 'ui.home', hub: 'office', route: '/home', readModels: ['worldSummary'], task: null, levels: ['college', 'pro'], rungs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], shortcut: null, helpKey: 'help.home', secondWindow: false },
    { id: 'film', titleKey: 'ui.film', hub: 'week', route: '/film', readModels: ['noSuchModel'], task: null, levels: ['pro'], rungs: [3], shortcut: 'F', helpKey: 'help.film', secondWindow: true },
  ] };
  const rows = [] as unknown[];
  for (const level of ['college', 'pro']) for (let rung = 0; rung < 10; rung++) rows.push({ level, rung, screens: ['home'], home: 'home' });
  const ui = (over: Record<string, unknown> = {}) => corePack({
    'ui/screens.json': screens,
    'ui/keymap.default.json': { contentSchemaVersion: 1, bindings: [{ action: 'snap', context: 'game', defaultKey: 'Space' }, { action: 'timeout', context: 'game', defaultKey: 'T' }] },
    'ui/tokens.json': { contentSchemaVersion: 1, themes: { light: { text: '#111111', surface: '#ffffff', muted: '#767676' }, dark: { text: '#eeeeee', surface: '#121212', muted: '#777777' } }, textPairs: [{ fg: 'text', bg: 'surface' }, { fg: 'muted', bg: 'surface', large: true }] },
    'ui/rung_defaults.json': { contentSchemaVersion: 1, rows },
    ...over,
  });
  it('contrast follows WCAG: black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
  it('finds a read model no schema defines and nothing else in a good folder', () => {
    const r = loadPacks([ui()], { readModelKeys: ['worldSummary'] });
    expect(codes(r.problems)).toEqual(['ui.read_model_missing']);
  });
  it('finds contrast failures, key conflicts, duplicate actions and missing rung rows', () => {
    const fixed = { ...screens, screens: [screens.screens[0]] };
    const r = loadPacks([ui({
      'ui/screens.json': fixed,
      'ui/keymap.default.json': { contentSchemaVersion: 1, bindings: [{ action: 'snap', context: 'game', defaultKey: 'Space' }, { action: 'timeout', context: 'game', defaultKey: 'Space' }, { action: 'snap', context: 'game', defaultKey: 'S' }] },
      'ui/tokens.json': { contentSchemaVersion: 1, themes: { light: { text: '#aaaaaa', surface: '#ffffff' } }, textPairs: [{ fg: 'text', bg: 'surface' }] },
      'ui/rung_defaults.json': { contentSchemaVersion: 1, rows: rows.slice(1) },
    })], { readModelKeys: ['worldSummary'] });
    expect(codes(r.problems).sort()).toEqual(['ui.contrast', 'ui.key_conflict', 'ui.key_duplicate_action', 'ui.rung_row_missing']);
  });
});

describe('literal display strings in app-ui (P4.6.1 build check)', () => {
  it('finds JSX text and display attributes, not code', () => {
    const src = [
      'const a = x < y && y > z;',
      'return <div title="Hello coach">{t("k")}<b>Snap count</b><i>{n}</i></div>;',
      '// <p>comment text</p>',
      'type M = Map<string, Array<number>>;',
    ].join('\n');
    expect(scanSource(src).map((h) => h.text)).toEqual(['Hello coach', 'Snap count']);
  });
});

describe('unused helper guard', () => {
  it('pack() builds sources from objects', () => {
    expect(pack('x', { 'pack.json': manifest('core') }).files.length).toBe(1);
  });
});
