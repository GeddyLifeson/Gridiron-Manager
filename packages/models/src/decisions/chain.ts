// Hash chain over log entries (N3.5.1). Each entry stores the hash of the previous one; changing any
// stored entry breaks verification from that entry on.
import { sha256Hex } from './sha256.ts';
import type { LogEntry, LogPayload } from './types.ts';

const ENC = new TextEncoder();

/** The hash an empty chain starts from. */
export const GENESIS_HASH = '0'.repeat(64);

/** Canonical text of a JSON-like value: object keys sorted, no spaces, undefined fields dropped. */
export function canonicalText(v: unknown): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('canonical text: number is not finite');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalText).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalText(o[k])}`).join(',')}}`;
  }
  throw new Error(`canonical text: ${typeof v} is not JSON`);
}

export function entryHash(seq: number, prevHash: string, payload: LogPayload): string {
  return sha256Hex(ENC.encode(canonicalText({ seq, prevHash, payload })));
}

export interface ChainCheck {
  readonly ok: boolean;
  /** Sequence number of the first entry that fails, or null. */
  readonly firstBad: number | null;
  readonly reason: string | null;
}

/** Verifies a whole chain from the genesis hash (N3.5.1 acceptance). */
export function verifyChain(entries: readonly LogEntry[]): ChainCheck {
  let prev = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.seq !== i) return { ok: false, firstBad: i, reason: `entry ${i} has seq ${e.seq}` };
    if (e.prevHash !== prev) return { ok: false, firstBad: i, reason: `entry ${i} does not link to the previous hash` };
    if (entryHash(e.seq, e.prevHash, e.payload) !== e.hash) return { ok: false, firstBad: i, reason: `entry ${i} content does not match its hash` };
    if (i === 0 && e.payload.kind !== 'segment') return { ok: false, firstBad: 0, reason: 'a chain starts with a segment entry' };
    prev = e.hash;
  }
  return { ok: true, firstBad: null, reason: null };
}
