// Export and import for every editor (P7.5.1 "Every editor has export and import"). Export writes a
// stored (uncompressed) ZIP per PKWARE APPNOTE 6.3 with fixed timestamps, so the same pack gives the
// same bytes; import reads it back through the G-08 zip reader, which applies the P7.2.1 limits.
import { readZipBytes, DEFAULT_LIMITS, type Limits, type PackSource } from '../content/index.ts';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** CRC-32 (ISO 3309, the ZIP polynomial). */
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00, the earliest DOS date: fixed so exports are byte-identical. */
const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function exportPackZip(src: PackSource): Uint8Array {
  const enc = new TextEncoder();
  const entries = [...src.files].filter((f) => f.bytes).sort((a, b) => (a.path < b.path ? -1 : 1));
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of entries) {
    const name = enc.encode(f.path), data = f.bytes!, crc = crc32(data);
    const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, DOS_TIME, true); lv.setUint16(12, DOS_DATE, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true); cv.setUint16(14, DOS_DATE, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    parts.push(lh, data); central.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

export function importPackZip(bytes: Uint8Array, name: string, limits: Limits = DEFAULT_LIMITS): PackSource {
  return readZipBytes(bytes, name, limits);
}
