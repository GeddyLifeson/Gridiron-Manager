// X10.1.2: the world code. Seed, setup hash, game and content version ids and pack hashes in one string
// that reproduces the world at career start on another machine.
// Layout (rule 1): format version (1 byte), game version id, content version id, world seed (8 bytes),
// setup hash (first 8 bytes of SHA-256 over the canonical setup record), pack count (1 byte), then per
// pack, sorted by id: id and the first 4 bytes of its content hash. Ids are a length byte and UTF-8.
// Encoding (rule 2): Crockford base32, two check characters, blocks of five joined by hyphens.
import { utf8 } from '@gm/engine-core';
import { param } from './params.ts';
import { setupHashHex, type SetupRecord } from './setup.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BITS = 5;
const BYTE = 8;
const BYTE_MASK = 0xff;
const SEED_BYTES = 8;
const PACK_HASH_BYTES = 4;
const CHECK_CHARS = 2;
/** Largest prime below 32 x 32, so the remainder fits two characters and catches any one wrong character. */
const CHECK_MODULUS = 1021;
const CHECK_RADIX = 257;

export interface WorldCodeFields {
  readonly formatVersion: number;
  readonly gameVersion: string;
  readonly contentVersion: string;
  readonly seedHex: string;
  /** First 16 hex digits of the setup hash. */
  readonly setupHash64Hex: string;
  /** Sorted by id; first 8 hex digits of each content hash. */
  readonly packs: readonly { id: string; hash32Hex: string }[];
}

export type DecodeResult =
  | { ok: true; fields: WorldCodeFields }
  | { ok: false; code: 'typo' | 'format'; message: string };

function hexBytes(hex: string, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return out;
}

function pushText(out: number[], s: string): void {
  const b = utf8(s);
  if (b.length > BYTE_MASK || b.length !== s.length) throw new Error(`world code: id ${s} must be plain ASCII and under 256 characters`);
  out.push(b.length, ...b);
}

function checksum(bytes: readonly number[]): number {
  let c = 0;
  for (const b of bytes) c = (c * CHECK_RADIX + b + 1) % CHECK_MODULUS;
  return c;
}

function toBase32(bytes: readonly number[]): string {
  let s = '', acc = 0, n = 0;
  for (const b of bytes) {
    acc = (acc << BYTE) | b; n += BYTE;
    while (n >= BITS) { n -= BITS; s += ALPHABET[(acc >> n) & (ALPHABET.length - 1)]; acc &= (1 << n) - 1; }
  }
  if (n > 0) s += ALPHABET[(acc << (BITS - n)) & (ALPHABET.length - 1)];
  return s;
}

function fromBase32(s: string): number[] | null {
  const out: number[] = [];
  let acc = 0, n = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << BITS) | v; n += BITS;
    if (n >= BYTE) { n -= BYTE; out.push((acc >> n) & BYTE_MASK); acc &= (1 << n) - 1; }
  }
  return acc === 0 ? out : null;
}

export function worldCodeFields(setup: SetupRecord, gameVersion: string, contentVersion: string): WorldCodeFields {
  return {
    formatVersion: param('code.formatVersion'), gameVersion, contentVersion, seedHex: setup.seedHex,
    setupHash64Hex: setupHashHex(setup).slice(0, SEED_BYTES * 2),
    packs: [...setup.packs].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => ({ id: p.id, hash32Hex: p.contentHashHex.slice(0, PACK_HASH_BYTES * 2) })),
  };
}

export function encodeWorldCode(f: WorldCodeFields): string {
  const bytes: number[] = [f.formatVersion];
  pushText(bytes, f.gameVersion);
  pushText(bytes, f.contentVersion);
  bytes.push(...hexBytes(f.seedHex, SEED_BYTES), ...hexBytes(f.setupHash64Hex, SEED_BYTES), f.packs.length);
  for (const p of f.packs) { pushText(bytes, p.id); bytes.push(...hexBytes(p.hash32Hex, PACK_HASH_BYTES)); }
  const c = checksum(bytes);
  const body = toBase32(bytes) + ALPHABET[Math.floor(c / ALPHABET.length)] + ALPHABET[c % ALPHABET.length];
  const block = param('code.blockLength');
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += block) parts.push(body.slice(i, i + block));
  return parts.join('-');
}

export function worldCode(setup: SetupRecord, gameVersion: string, contentVersion: string): string {
  return encodeWorldCode(worldCodeFields(setup, gameVersion, contentVersion));
}

const TYPO = 'This code has a typo';

/** Rule 3: decode, check the checksum, and only then read fields. A mistyped code never decodes into a different world. */
export function decodeWorldCode(text: string): DecodeResult {
  // Crockford reading rules: case does not matter, O reads as 0, I and L read as 1, hyphens and spaces are ignored.
  const clean = text.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length <= CHECK_CHARS) return { ok: false, code: 'typo', message: TYPO };
  const bytes = fromBase32(clean.slice(0, -CHECK_CHARS));
  const hi = ALPHABET.indexOf(clean[clean.length - 2]!), lo = ALPHABET.indexOf(clean[clean.length - 1]!);
  if (!bytes || hi < 0 || lo < 0 || checksum(bytes) !== hi * ALPHABET.length + lo) return { ok: false, code: 'typo', message: TYPO };
  let i = 0;
  const hex = (n: number): string => { let s = ''; for (let k = 0; k < n; k++) s += (bytes[i++] ?? 0).toString(16).padStart(2, '0'); return s; };
  const text8 = (): string => { const n = bytes[i++] ?? 0; let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(bytes[i++] ?? 0); return s; };
  try {
    const formatVersion = bytes[i++] ?? 0;
    if (formatVersion !== param('code.formatVersion')) return { ok: false, code: 'format', message: `This code is format ${formatVersion}; this game reads format ${param('code.formatVersion')}` };
    const gameVersion = text8(), contentVersion = text8();
    const seedHex = hex(SEED_BYTES), setupHash64Hex = hex(SEED_BYTES);
    const count = bytes[i++] ?? 0;
    const packs: { id: string; hash32Hex: string }[] = [];
    for (let k = 0; k < count; k++) { const id = text8(); packs.push({ id, hash32Hex: hex(PACK_HASH_BYTES) }); }
    if (i !== bytes.length) return { ok: false, code: 'typo', message: TYPO };
    return { ok: true, fields: { formatVersion, gameVersion, contentVersion, seedHex, setupHash64Hex, packs } };
  } catch {
    return { ok: false, code: 'typo', message: TYPO };
  }
}

/** Rule 3: every mismatch by name, before anything is created. Empty when the world can be reproduced here. */
export function worldCodeMismatches(code: WorldCodeFields, here: { gameVersion: string; contentVersion: string; packs: readonly { id: string; contentHashHex: string }[] }): string[] {
  const out: string[] = [];
  if (code.gameVersion !== here.gameVersion) out.push(`Game version: the code is from ${code.gameVersion}, this game is ${here.gameVersion}`);
  if (code.contentVersion !== here.contentVersion) out.push(`Content version: the code is from ${code.contentVersion}, this game has ${here.contentVersion}`);
  const mine = new Map(here.packs.map((p) => [p.id, p.contentHashHex.slice(0, PACK_HASH_BYTES * 2).toLowerCase()]));
  for (const p of code.packs) {
    const h = mine.get(p.id);
    if (h === undefined) out.push(`People pack ${p.id}: the code needs it and it is not loaded`);
    else if (h !== p.hash32Hex) out.push(`People pack ${p.id}: your copy differs from the one the code was made with`);
  }
  for (const id of mine.keys()) if (!code.packs.some((p) => p.id === id)) out.push(`People pack ${id}: loaded here but not part of the code`);
  return out;
}
