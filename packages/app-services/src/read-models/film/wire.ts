// Plain-data form of a film record for read models (P1.3.2): the trajectory bytes as base64. Written
// here because core and app-services code read no platform encoder.
import type { FilmRecord, FilmRecordWire } from './schemas.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PAD = '=';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + (b === undefined ? PAD : ALPHABET[(n >> 6) & 63]!) + (c === undefined ? PAD : ALPHABET[n & 63]!);
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, acc = 0, j = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`not base64: ${ch}`);
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (acc >> bits) & 255; }
  }
  return out;
}

export function recordToWire(r: FilmRecord): FilmRecordWire {
  const { buffer, ...t } = r.trajectory;
  return { ...r, trajectory: { ...t, base64: toBase64(buffer) } };
}

export function recordFromWire(w: FilmRecordWire): FilmRecord {
  const { base64, ...t } = w.trajectory;
  return { ...w, trajectory: { ...t, buffer: fromBase64(base64) } };
}
