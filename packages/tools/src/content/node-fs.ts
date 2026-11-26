// Desktop and headless adapters: read a pack folder or a zipped pack into a PackSource (P4.1.1).
// Symbolic links are not followed (a link can point outside the pack, P7.2.1). Zips are read from the
// central directory; an entry whose declared expansion ratio is over the limit, or whose declared size
// would take the pack over the limit, is refused before it is inflated (zip bomb, P7.2.1).
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { DEFAULT_LIMITS, type Limits } from './params.ts';
import type { PackSource, Problem, SourceFile } from './types.ts';

type ReadProblem = Omit<Problem, 'packId'>;

export function readPackFolder(dir: string, limits: Limits = DEFAULT_LIMITS): PackSource {
  const files: SourceFile[] = [];
  const readProblems: ReadProblem[] = [];
  const walk = (d: string, depth: number) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const rel = relative(dir, full).split(sep).join('/');
      const st = lstatSync(full);
      if (st.isSymbolicLink()) { readProblems.push({ severity: 'error', code: 'file.path_escape', file: rel, path: '', message: 'symbolic links are not followed in packs (P7.2.1)' }); continue; }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        if (depth >= limits.maxFolderDepth) { readProblems.push({ severity: 'error', code: 'file.depth', file: rel, path: '', message: `folder depth over ${limits.maxFolderDepth} (P7.2.1)` }); continue; }
        walk(full, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      // Oversized files are listed with their size but not read; the loader refuses them.
      files.push(st.size > limits.maxFileBytes ? { path: rel, size: st.size } : { path: rel, size: st.size, bytes: readFileSync(full) });
    }
  };
  walk(dir, 0);
  return { origin: dir, files, readProblems };
}

export function readPackZip(file: string, limits: Limits = DEFAULT_LIMITS): PackSource {
  return readZipBytes(readFileSync(file), basename(file), limits);
}

/** Minimal ZIP reader (PKWARE APPNOTE: end of central directory, central directory, local headers; stored and deflate). */
export function readZipBytes(buf: Uint8Array, origin: string, limits: Limits = DEFAULT_LIMITS): PackSource {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const readProblems: ReadProblem[] = [];
  const fail = (message: string): PackSource => ({ origin, files: [], readProblems: [{ severity: 'error', code: 'zip.malformed', file: '', path: '', message }] });
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return fail('not a zip file (no end of central directory)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries: { name: string; method: number; csize: number; usize: number; local: number }[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) return fail('broken central directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!name.endsWith('/')) entries.push({ name, method, csize, usize, local });
  }
  // A zip made from a folder usually has one top folder; strip it when pack.json is inside it.
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  const strip = !entries.some((e) => e.name === 'pack.json') && tops.size === 1 && entries.some((e) => e.name.split('/').length === 2 && e.name.endsWith('/pack.json'));
  let total = 0;
  const files: SourceFile[] = [];
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = strip ? e.name.split('/').slice(1).join('/') : e.name;
    const ratio = e.csize > 0 ? e.usize / e.csize : (e.usize > 0 ? Infinity : 1);
    if (ratio > limits.maxZipRatio) { readProblems.push({ severity: 'error', code: 'zip.ratio', file: path, path: '', message: `expands ${Math.round(ratio)} to 1; the limit is ${limits.maxZipRatio} to 1 (P7.2.1)` }); continue; }
    total += e.usize;
    if (total > limits.maxPackBytes) { readProblems.push({ severity: 'error', code: 'pack.too_large', file: path, path: '', message: `unzipped pack passes ${limits.maxPackBytes} bytes (P7.2.1)` }); break; }
    if (e.usize > limits.maxFileBytes) { files.push({ path, size: e.usize }); continue; }
    if (!path.endsWith('.json')) { files.push({ path, size: e.usize }); continue; }
    const lh = e.local;
    if (dv.getUint32(lh, true) !== 0x04034b50) { readProblems.push({ severity: 'error', code: 'zip.malformed', file: path, path: '', message: 'bad local header' }); continue; }
    const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
    const raw = buf.subarray(start, start + e.csize);
    try {
      const bytes = e.method === 0 ? raw.slice() : e.method === 8 ? new Uint8Array(inflateRawSync(raw, { maxOutputLength: Math.max(1, e.usize) })) : null;
      if (!bytes) { readProblems.push({ severity: 'error', code: 'zip.method', file: path, path: '', message: `compression method ${e.method} is not supported (stored and deflate only)` }); continue; }
      if (bytes.length !== e.usize) { readProblems.push({ severity: 'error', code: 'zip.malformed', file: path, path: '', message: 'size does not match the directory' }); continue; }
      files.push({ path, size: bytes.length, bytes });
    } catch (err) {
      readProblems.push({ severity: 'error', code: 'zip.malformed', file: path, path: '', message: `cannot inflate: ${(err as Error).message}` });
    }
  }
  return { origin, files, readProblems };
}
