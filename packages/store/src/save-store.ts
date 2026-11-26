// The save file (P5.1.1 header, P5.1.2 content copies, P5.2.1 command log, P5.3.1 snapshots,
// P5.3.2 hash chain). One SQLite database per career. Each accepted command and its state change
// commit in one transaction.
import { SaveHeader, SAVE_FORMAT_VERSION, WorldState, type CommandEnvelope } from '@gm/schema';
import type { SqlDriver, SqlStatement } from './driver.ts';

export const SAVE_FILE_EXTENSION = '.gmsave';

const DDL = `
CREATE TABLE IF NOT EXISTS header (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  save_format_version INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS world_state (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_log (
  seq INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  command TEXT NOT NULL,
  events_hash TEXT NOT NULL,
  state_hash TEXT
);
CREATE TABLE IF NOT EXISTS hash_chain (
  n INTEGER PRIMARY KEY,
  prev TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  log_seq INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  parameter_set_version TEXT NOT NULL,
  head TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  log_seq INTEGER NOT NULL,
  state_hash TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_ref (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL REFERENCES content(hash)
);
`;

export interface ChainRow {
  n: number; prev: string; state_hash: string; log_seq: number;
  engine_version: string; parameter_set_version: string; head: string; note: string | null;
}

export interface LogRow { seq: number; type: string; command: string; events_hash: string; state_hash: string | null }

export interface ContentItem { id: string; kind: string; hash: string; body: unknown }

export class SaveFormatError extends Error {}

export interface CheckpointInput {
  stateHash: string;
  head: string;
  prev: string;
  engineVersion: string;
  parameterSetVersion: string;
  note?: string;
}

/** Reads only the header table (the load screen fills from headers alone, P5.1.1). */
export async function readHeader(driver: SqlDriver): Promise<SaveHeader> {
  const rows = await driver.all<{ save_format_version: number; json: string }>('SELECT save_format_version, json FROM header WHERE id = 1');
  const row = rows[0];
  if (!row) throw new SaveFormatError('not a save file: no header row');
  if (row.save_format_version > SAVE_FORMAT_VERSION) {
    throw new SaveFormatError(`made with a newer version (save format ${row.save_format_version}, this build reads ${SAVE_FORMAT_VERSION})`);
  }
  return SaveHeader.parse(JSON.parse(row.json));
}

export class SaveStore {
  private constructor(readonly driver: SqlDriver) {}

  static async create(driver: SqlDriver, header: SaveHeader, world: WorldState, content: readonly ContentItem[]): Promise<SaveStore> {
    SaveHeader.parse(header);
    WorldState.parse(world);
    await driver.exec(DDL);
    const stmts: SqlStatement[] = [
      { sql: 'INSERT INTO header (id, save_format_version, json) VALUES (1, ?, ?)', params: [header.saveFormatVersion, JSON.stringify(header)] },
      { sql: 'INSERT INTO world_state (key, json) VALUES (?, ?)', params: ['world', JSON.stringify(world)] },
    ];
    for (const c of content) {
      stmts.push({ sql: 'INSERT OR IGNORE INTO content (hash, kind, body) VALUES (?, ?, ?)', params: [c.hash, c.kind, JSON.stringify(c.body)] });
      stmts.push({ sql: 'INSERT OR REPLACE INTO content_ref (id, hash) VALUES (?, ?)', params: [c.id, c.hash] });
    }
    await driver.transaction(stmts);
    return new SaveStore(driver);
  }

  static async open(driver: SqlDriver): Promise<SaveStore> {
    await readHeader(driver);
    return new SaveStore(driver);
  }

  header(): Promise<SaveHeader> { return readHeader(this.driver); }

  async world(): Promise<WorldState> {
    const rows = await this.driver.all<{ json: string }>("SELECT json FROM world_state WHERE key = 'world'");
    if (!rows[0]) throw new SaveFormatError('save has no world state');
    return WorldState.parse(JSON.parse(rows[0].json));
  }

  /** Appends one accepted command with its state change and header update in one transaction. */
  async appendCommand(cmd: CommandEnvelope, world: WorldState, header: SaveHeader, eventsHash: string, checkpoint?: CheckpointInput): Promise<void> {
    const stmts: SqlStatement[] = [
      { sql: 'INSERT INTO command_log (seq, type, command, events_hash, state_hash) VALUES (?, ?, ?, ?, ?)', params: [cmd.id, cmd.type, JSON.stringify(cmd), eventsHash, checkpoint?.stateHash ?? null] },
      { sql: "UPDATE world_state SET json = ? WHERE key = 'world'", params: [JSON.stringify(world)] },
      { sql: 'UPDATE header SET json = ? WHERE id = 1', params: [JSON.stringify(SaveHeader.parse(header))] },
    ];
    if (checkpoint) stmts.push(this.chainInsert(cmd.id, checkpoint));
    await this.driver.transaction(stmts);
  }

  private chainInsert(logSeq: number, c: CheckpointInput): SqlStatement {
    return {
      sql: 'INSERT INTO hash_chain (n, prev, state_hash, log_seq, engine_version, parameter_set_version, head, note) VALUES ((SELECT COALESCE(MAX(n), 0) + 1 FROM hash_chain), ?, ?, ?, ?, ?, ?, ?)',
      params: [c.prev, c.stateHash, logSeq, c.engineVersion, c.parameterSetVersion, c.head, c.note ?? null],
    };
  }

  async writeSnapshot(kind: string, logSeq: number, stateHash: string, world: WorldState): Promise<void> {
    await this.driver.transaction([{ sql: 'INSERT INTO snapshots (kind, log_seq, state_hash, json) VALUES (?, ?, ?, ?)', params: [kind, logSeq, stateHash, JSON.stringify(world)] }]);
  }

  async snapshots(): Promise<{ id: number; kind: string; log_seq: number; state_hash: string; json: string }[]> {
    return this.driver.all('SELECT id, kind, log_seq, state_hash, json FROM snapshots ORDER BY id');
  }

  commandLog(): Promise<LogRow[]> {
    return this.driver.all<LogRow>('SELECT seq, type, command, events_hash, state_hash FROM command_log ORDER BY seq');
  }

  chain(): Promise<ChainRow[]> {
    return this.driver.all<ChainRow>('SELECT n, prev, state_hash, log_seq, engine_version, parameter_set_version, head, note FROM hash_chain ORDER BY n');
  }

  async content(id: string): Promise<unknown> {
    const rows = await this.driver.all<{ body: string }>('SELECT c.body FROM content_ref r JOIN content c ON c.hash = r.hash WHERE r.id = ?', [id]);
    if (!rows[0]) throw new SaveFormatError(`save holds no content ${id}`);
    return JSON.parse(rows[0].body);
  }

  async contentIds(): Promise<string[]> {
    return (await this.driver.all<{ id: string }>('SELECT id FROM content_ref ORDER BY id')).map((r) => r.id);
  }
}
