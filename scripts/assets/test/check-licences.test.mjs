import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkLicences, computedStatus } from '../check-licences.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });
function repo(assets = [], files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'licences-')); dirs.push(root);
  mkdirSync(join(root, 'assets'), { recursive: true });
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), c); }
  writeFileSync(join(root, 'assets/LICENSES.json'), JSON.stringify({ version: 1, assets }));
  return root;
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const row = (path, content, over = {}) => ({ path, sha256: sha(content), source: 'own work', licence: 'Original work', licenceId: 'Original', author: 'Project', dateRetrieved: '2026-11-26', licenceSources: [], ...over });
const mit = { licenceId: 'MIT', licenceSources: ['https://a.example/x', 'https://b.example/x', 'https://c.example/x'] };

describe('asset licence register', () => {
  it('passes the empty register', () => expect(checkLicences(repo()).ok).toBe(true));
  it('passes a complete register, ignoring notices, the register and scores', () => {
    const root = repo([row('assets/a.ogg', 'a'), row('assets/b.ogg', 'b', mit)], { 'assets/a.ogg': 'a', 'assets/b.ogg': 'b', 'assets/NOTICE.md': 'n', 'assets/music/scores/s.musicxml': 'x' });
    expect(checkLicences(root)).toMatchObject({ ok: true, rows: 2, files: 2 });
  });
  it('fails a planted unlisted file', () => {
    const r = checkLicences(repo([], { 'assets/stray.png': 'x' }));
    expect(r.ok).toBe(false); expect(r.errors.join()).toMatch(/assets\/stray\.png: file has no row/);
  });
  it('fails a row with a disallowed licence', () => {
    const r = checkLicences(repo([row('assets/a.ogg', 'a', { licenceId: 'CC-BY-NC-4.0' })], { 'assets/a.ogg': 'a' }));
    expect(r.errors.join()).toMatch(/not allowed/);
  });
  it('fails a banned term in the licence text', () => {
    const r = checkLicences(repo([row('assets/a.ogg', 'a', { ...mit, licence: 'royalty-free, no redistribution' })], { 'assets/a.ogg': 'a' }));
    expect(r.errors.join()).toMatch(/banned licence term/);
  });
  it('fails a row whose file is missing and a changed file', () => {
    expect(checkLicences(repo([row('assets/gone.ogg', 'g')])).errors.join()).toMatch(/does not exist/);
    expect(checkLicences(repo([row('assets/a.ogg', 'a')], { 'assets/a.ogg': 'changed' })).errors.join()).toMatch(/sha256 does not match/);
  });
  it('fails duplicates and fewer than three sources', () => {
    const r = checkLicences(repo([row('assets/a.ogg', 'a', { licenceId: 'MIT', licenceSources: ['https://a.example'] }), row('assets/a.ogg', 'a')], { 'assets/a.ogg': 'a' }));
    expect(r.errors.join()).toMatch(/duplicate/); expect(r.errors.join()).toMatch(/1 of 3/);
  });
  it('rejects a typed status that disagrees with the computed one', () => {
    const r = checkLicences(repo([row('assets/a.ogg', 'a', { ...mit, licenceStatus: 'Conflict' })], { 'assets/a.ogg': 'a' }));
    expect(r.errors.join()).toMatch(/computed status/);
    expect(computedStatus(row('x', 'x', mit))).toBe('Verified');
  });
  it('requires model, terms link and prompt on AI assets', () => {
    const r = checkLicences(repo([row('assets/a.png', 'a', { ...mit, aiGenerated: true })], { 'assets/a.png': 'a' }));
    expect(r.errors.join()).toMatch(/model missing/); expect(r.errors.join()).toMatch(/termsUrl/); expect(r.errors.join()).toMatch(/prompt missing/);
    const ok = checkLicences(repo([row('assets/a.png', 'a', { ...mit, aiGenerated: true, model: 'm', termsUrl: 'https://t.example/terms', prompt: 'p' })], { 'assets/a.png': 'a' }));
    expect(ok.ok).toBe(true);
  });
});
