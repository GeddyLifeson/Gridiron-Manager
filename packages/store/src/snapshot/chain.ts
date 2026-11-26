// State hash chain (P5.3.2): a cheap, permanent proof of the career's path, kept even after old
// state is thinned. chain[n] = H(chain[n-1], stateHash, logSequence, engineVersion, parameterSetVersion).
// The hash function is the engine's (P1.1.5); the store receives it and never defines its own.
import type { SqlDriver, SqlStatement } from '../driver.ts';

/** Why a chain row was written. `week` and `user_game` are the two regular moments of P5.3.2. */
export type ChainKind = 'creation' | 'week' | 'user_game' | 'season' | 'migration' | 'recovery' | 'other';

export interface ChainLinkInput {
  readonly prev: string;
  readonly stateHash: string;
  readonly logSequence: number;
  readonly engineVersion: string;
  readonly parameterSetVersion: string;
}

export interface ChainFns {
  chainNext(link: ChainLinkInput): string;
  readonly genesis: string;
}

export interface ChainRow {
  n: number; prev: string; stateHash: string; logSeq: number;
  engineVersion: string; parameterSetVersion: string; head: string; kind: string; note: string | null;
}

export const CHAIN_DDL = `
CREATE TABLE IF NOT EXISTS hash_chain (
  n INTEGER PRIMARY KEY,
  prev TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  log_seq INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  parameter_set_version TEXT NOT NULL,
  head TEXT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT
);
`;

export interface NewChainRow {
  prev: string; stateHash: string; logSeq: number; engineVersion: string; parameterSetVersion: string; kind: ChainKind; note?: string | null;
}

/** Computes the next head and the row insert. `n` is assigned by the database: last row plus one. */
export function chainAppend(fns: ChainFns, row: NewChainRow): { head: string; statement: SqlStatement } {
  const head = fns.chainNext({ prev: row.prev, stateHash: row.stateHash, logSequence: row.logSeq, engineVersion: row.engineVersion, parameterSetVersion: row.parameterSetVersion });
  return {
    head,
    statement: {
      sql: 'INSERT INTO hash_chain (n, prev, state_hash, log_seq, engine_version, parameter_set_version, head, kind, note) VALUES ((SELECT COALESCE(MAX(n), 0) + 1 FROM hash_chain), ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [row.prev, row.stateHash, row.logSeq, row.engineVersion, row.parameterSetVersion, head, row.kind, row.note ?? null],
    },
  };
}

interface RawChainRow { n: number; prev: string; state_hash: string; log_seq: number; engine_version: string; parameter_set_version: string; head: string; kind: string; note: string | null }

export async function readChain(driver: SqlDriver): Promise<ChainRow[]> {
  const rows = await driver.all<RawChainRow>('SELECT n, prev, state_hash, log_seq, engine_version, parameter_set_version, head, kind, note FROM hash_chain ORDER BY n');
  return rows.map((r) => ({ n: r.n, prev: r.prev, stateHash: r.state_hash, logSeq: r.log_seq, engineVersion: r.engine_version, parameterSetVersion: r.parameter_set_version, head: r.head, kind: r.kind, note: r.note }));
}

/**
 * Checks that every row follows from the one before it. Returns the problems found and the head the
 * rows lead to. An edit to any stored hash, sequence or version breaks every later link.
 */
export function verifyChainLinks(fns: ChainFns, rows: readonly ChainRow[]): { problems: string[]; head: string } {
  const problems: string[] = [];
  let head = fns.genesis;
  let lastSeq = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.n !== i + 1) { problems.push(`hash chain row ${i + 1} is missing`); break; }
    if (r.prev !== head) problems.push(`hash chain row ${r.n} does not follow row ${r.n - 1}`);
    const expect = fns.chainNext({ prev: r.prev, stateHash: r.stateHash, logSequence: r.logSeq, engineVersion: r.engineVersion, parameterSetVersion: r.parameterSetVersion });
    if (expect !== r.head) problems.push(`hash chain row ${r.n} does not match its contents`);
    if (r.logSeq < lastSeq) problems.push(`hash chain row ${r.n} goes back in the log`);
    lastSeq = r.logSeq;
    head = r.head;
  }
  return { problems, head };
}
