// Bug bundle (P5.7.1, O5.6.2). The smallest set that lets `headless replay` reach the reported state:
// header, the latest snapshot at or before the reported point, the command log from that snapshot to
// the point, the content copies, settings and the local error log. One gzip file. Nothing is sent
// anywhere: the caller writes the bytes to a file the user chooses, after showing the summary.
//
// The store has no football logic, so the core's apply and hash functions are injected, exactly as
// verifySaveLog does (verify.ts).
import { CommandEnvelope, SaveHeader, WorldState } from '@gm/schema';
import type { SaveStore } from '../save-store.ts';
import type { ReplayDeps } from '../verify.ts';
import { gunzip, gzip, isGzip } from './gzip.ts';
import { countImportedPeople, replaceImportedNames } from './redact.ts';

export const BUG_BUNDLE_FORMAT = 'gm-bug-bundle';
export const BUG_BUNDLE_FORMAT_VERSION = 1;
export const BUG_BUNDLE_EXTENSION = '.gmbug';

/**
 * Which state the bundle's hashes describe.
 * - `recorded`: hashes the game wrote while it was played (the log's checkpoint hashes, the live
 *   world). A replay that misses them reproduces the defect's divergence, which is the point.
 * - `names_replaced`: hashes of the world with imported names replaced, computed by replaying the
 *   log at bundle time. Used only when the user picked "names replaced".
 */
export type HashView = 'recorded' | 'names_replaced';

export interface BundleLogRow {
  readonly seq: number;
  readonly type: string;
  readonly command: CommandEnvelope;
  readonly eventsHash: string;
  /** Checkpoint hash in the bundle's hash view, or null where the log has none. */
  readonly stateHash: string | null;
}

export interface BundleContent { readonly id: string; readonly kind: string; readonly hash: string; readonly body: unknown }

export interface BugBundle {
  readonly format: typeof BUG_BUNDLE_FORMAT;
  readonly formatVersion: number;
  /** Application build that wrote the bundle. */
  readonly createdWith: string;
  readonly header: SaveHeader;
  readonly namesReplaced: boolean;
  readonly snapshot: { readonly kind: string; readonly logSeq: number; readonly stateHash: string; readonly world: WorldState };
  readonly log: readonly BundleLogRow[];
  readonly target: { readonly logSeq: number; readonly stateHash: string; readonly hashView: HashView };
  readonly content: readonly BundleContent[];
  readonly settings: SaveHeader['settings'];
  readonly errorLog: readonly string[];
}

export type BundleDeps = Pick<ReplayDeps, 'apply' | 'stateHash' | 'eventsHash'>;

export interface BugBundleOptions {
  /** Application build string written into the bundle. */
  readonly appVersion: string;
  /** Log sequence of the reported state. Defaults to the last logged command. */
  readonly targetSeq?: number;
  /** Lines of the local error log (P5.7.1 inputs). Only the game's own log; never outside data. */
  readonly errorLog?: readonly string[];
}

export interface BugBundlePlan {
  /** Plain lines listing what the bundle holds, shown before anything is written (P5.7.1). */
  readonly summary: readonly string[];
  /** Imported people in the snapshot or the commands; the summary then offers "names replaced". */
  readonly importedPeople: number;
  readonly targetSeq: number;
  /** Builds the bundle. Replaying for the names-replaced view runs here, not at plan time. */
  build(o: { namesReplaced: boolean }): BugBundle;
}

export class BugBundleError extends Error {}

interface SnapRow { id: number; kind: string; log_seq: number; state_hash: string; json: string }

function replayTo(start: WorldState, rows: readonly BundleLogRow[], deps: BundleDeps, view: (w: WorldState) => unknown) {
  let w = start;
  const checkpoints = new Map<number, string>();
  const events = new Map<number, string>();
  for (const r of rows) {
    const res = deps.apply(w, r.command);
    if (!res.ok) throw new BugBundleError(`logged command ${r.seq} does not apply at bundle time: ${res.reason}`);
    w = res.world;
    events.set(r.seq, deps.eventsHash(res.events));
    if (r.stateHash !== null) checkpoints.set(r.seq, deps.stateHash(view(w)));
  }
  return { world: w, checkpoints, events };
}

/** Reads what a bundle at `targetSeq` would hold, without writing anything (P5.7.1 summary step). */
export async function planBugBundle(store: SaveStore, deps: BundleDeps, o: BugBundleOptions): Promise<BugBundlePlan> {
  const header = await store.header();
  const logRows = await store.commandLog();
  const lastSeq = logRows.at(-1)?.seq ?? 0;
  const targetSeq = o.targetSeq ?? lastSeq;
  if (!Number.isInteger(targetSeq) || targetSeq < 0 || targetSeq > lastSeq) throw new BugBundleError(`target ${targetSeq} is outside the log (0 to ${lastSeq})`);
  const snaps = (await store.snapshots()) as SnapRow[];
  const snap = snaps.filter((s) => s.log_seq <= targetSeq).sort((a, b) => a.log_seq - b.log_seq || a.id - b.id).at(-1);
  if (!snap) throw new BugBundleError(`the save has no snapshot at or before command ${targetSeq}`);
  const snapWorld = WorldState.parse(JSON.parse(snap.json));
  const recordedRows: BundleLogRow[] = logRows
    .filter((r) => r.seq > snap.log_seq && r.seq <= targetSeq)
    .map((r) => ({ seq: r.seq, type: r.type, command: CommandEnvelope.parse(JSON.parse(r.command)), eventsHash: r.events_hash, stateHash: r.state_hash }));
  const content = (await store.driver.all<{ id: string; kind: string; hash: string; body: string }>(
    'SELECT r.id AS id, c.kind AS kind, c.hash AS hash, c.body AS body FROM content_ref r JOIN content c ON c.hash = r.hash ORDER BY r.id',
  )).map((c) => ({ id: c.id, kind: c.kind, hash: c.hash, body: JSON.parse(c.body) as unknown }));
  const errorLog = [...(o.errorLog ?? [])];
  const importedPeople = countImportedPeople(snapWorld) + countImportedPeople(recordedRows.map((r) => r.command.payload));

  // Recorded hash of the target: the live world when the target is the latest command, the log's
  // checkpoint hash when it has one, otherwise the replay at bundle time (said in the summary).
  let recordedTarget: string;
  let targetFrom: string;
  if (targetSeq === lastSeq) { recordedTarget = deps.stateHash(await store.world()); targetFrom = 'the saved world'; }
  else if (targetSeq === snap.log_seq) { recordedTarget = snap.state_hash; targetFrom = 'the snapshot'; }
  else {
    const row = recordedRows.find((r) => r.seq === targetSeq);
    if (row?.stateHash) { recordedTarget = row.stateHash; targetFrom = 'the log checkpoint'; }
    else { recordedTarget = deps.stateHash(replayTo(snapWorld, recordedRows, deps, (w) => w).world); targetFrom = 'a replay at bundle time (no checkpoint at that command)'; }
  }

  const summary = [
    `Career: ${header.summary} (season ${header.calendar.seasonYear}, day ${header.calendar.dayIndex}).`,
    `Engine ${header.engineVersion}, parameter set ${header.parameterSetVersion}, save format ${header.saveFormatVersion}. Builders replay it with that engine version.`,
    `Snapshot "${snap.kind}" after command ${snap.log_seq}, then ${recordedRows.length} commands up to command ${targetSeq}. The reported state's hash comes from ${targetFrom}.`,
    `${content.length} content copies (${[...new Set(content.map((c) => c.kind))].join(', ') || 'none'}), the save settings, and ${errorLog.length} lines of the game's error log.`,
    'The full world state is included, hidden values too, because an exact replay needs them. Nothing from outside the game is included, and nothing is sent anywhere.',
    importedPeople > 0
      ? `It contains the names of ${importedPeople} imported people. Choose "names replaced" to swap them for placeholders; the replay is unaffected.`
      : 'It contains no imported names.',
  ];

  const build = ({ namesReplaced }: { namesReplaced: boolean }): BugBundle => {
    let world = snapWorld;
    let rows = recordedRows;
    let snapHash = snap.state_hash;
    let target = { logSeq: targetSeq, stateHash: recordedTarget, hashView: 'recorded' as HashView };
    if (namesReplaced) {
      world = replaceImportedNames(snapWorld);
      const replacedRows = recordedRows.map((r) => ({ ...r, command: replaceImportedNames(r.command) }));
      const view = (w: WorldState) => replaceImportedNames(w);
      const run = replayTo(world, replacedRows, deps, view);
      // Events may carry names too, so the replaced view takes its events hashes from this replay.
      rows = replacedRows.map((r) => ({ ...r, eventsHash: run.events.get(r.seq) ?? r.eventsHash, stateHash: run.checkpoints.get(r.seq) ?? null }));
      snapHash = deps.stateHash(world);
      target = { logSeq: targetSeq, stateHash: deps.stateHash(view(run.world)), hashView: 'names_replaced' };
    }
    return {
      format: BUG_BUNDLE_FORMAT,
      formatVersion: BUG_BUNDLE_FORMAT_VERSION,
      createdWith: o.appVersion,
      header,
      namesReplaced,
      snapshot: { kind: snap.kind, logSeq: snap.log_seq, stateHash: snapHash, world },
      log: rows,
      target,
      content,
      settings: header.settings,
      errorLog,
    };
  };

  return { summary, importedPeople, targetSeq, build };
}

/** Serialises and compresses a bundle into the bytes of one `.gmbug` file. */
export async function encodeBugBundle(b: BugBundle): Promise<Uint8Array> {
  return gzip(new TextEncoder().encode(JSON.stringify(b)));
}

function req(cond: unknown, what: string): asserts cond {
  if (!cond) throw new BugBundleError(`not a valid bug bundle: ${what}`);
}

/** Reads and validates a `.gmbug` file. Refuses bundles of a newer bundle format. */
export async function decodeBugBundle(bytes: Uint8Array): Promise<BugBundle> {
  req(isGzip(bytes), 'not a gzip file');
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(await gunzip(bytes))); } catch (e) { throw new BugBundleError(`not a valid bug bundle: ${(e as Error).message}`); }
  const b = raw as Record<string, unknown>;
  req(typeof b === 'object' && b !== null, 'not an object');
  req(b.format === BUG_BUNDLE_FORMAT, 'wrong format id');
  req(typeof b.formatVersion === 'number', 'no format version');
  if ((b.formatVersion as number) > BUG_BUNDLE_FORMAT_VERSION) throw new BugBundleError(`bundle format ${b.formatVersion as number} is newer than this build reads (${BUG_BUNDLE_FORMAT_VERSION})`);
  req(typeof b.createdWith === 'string', 'createdWith');
  req(typeof b.namesReplaced === 'boolean', 'namesReplaced');
  const snap = b.snapshot as Record<string, unknown> | undefined;
  req(snap && typeof snap.kind === 'string' && Number.isInteger(snap.logSeq) && typeof snap.stateHash === 'string', 'snapshot');
  const target = b.target as Record<string, unknown> | undefined;
  req(target && Number.isInteger(target.logSeq) && typeof target.stateHash === 'string' && (target.hashView === 'recorded' || target.hashView === 'names_replaced'), 'target');
  req(Array.isArray(b.log) && Array.isArray(b.content) && Array.isArray(b.errorLog), 'log, content or errorLog');
  const header = SaveHeader.parse(b.header);
  const world = WorldState.parse(snap.world);
  const log: BundleLogRow[] = (b.log as Record<string, unknown>[]).map((r, i) => {
    req(Number.isInteger(r.seq) && typeof r.type === 'string' && typeof r.eventsHash === 'string' && (r.stateHash === null || typeof r.stateHash === 'string'), `log row ${i}`);
    return { seq: r.seq as number, type: r.type as string, command: CommandEnvelope.parse(r.command), eventsHash: r.eventsHash as string, stateHash: r.stateHash as string | null };
  });
  for (let i = 1; i < log.length; i++) req(log[i]!.seq > log[i - 1]!.seq, 'log out of order');
  const content = (b.content as Record<string, unknown>[]).map((c, i) => {
    req(typeof c.id === 'string' && typeof c.kind === 'string' && typeof c.hash === 'string', `content row ${i}`);
    return { id: c.id as string, kind: c.kind as string, hash: c.hash as string, body: c.body };
  });
  req((b.errorLog as unknown[]).every((l) => typeof l === 'string'), 'error log lines');
  return {
    format: BUG_BUNDLE_FORMAT,
    formatVersion: b.formatVersion as number,
    createdWith: b.createdWith as string,
    header,
    namesReplaced: b.namesReplaced as boolean,
    snapshot: { kind: snap.kind as string, logSeq: snap.logSeq as number, stateHash: snap.stateHash as string, world },
    log,
    target: { logSeq: target.logSeq as number, stateHash: target.stateHash as string, hashView: target.hashView as HashView },
    content,
    settings: header.settings,
    errorLog: b.errorLog as string[],
  };
}

export interface BundleReplayReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly commands: number;
  readonly expectedHash: string;
  readonly replayedHash: string;
  /** The engine version the bundle was made with, and whether the running engine matches (P5.7.1 edge case). */
  readonly engine: { readonly bundle: string; readonly running: string | null; readonly match: boolean | null };
}

/**
 * Replays a bundle from its snapshot to the reported state (P2.3.4 `headless replay`). Every check
 * the bundle carries is compared: the snapshot hash, each command's events hash, each checkpoint
 * hash and the target hash. In the names-replaced view the hashes are taken over the replaced world.
 */
export function replayBugBundle(b: BugBundle, deps: BundleDeps, runningEngineVersion?: string): BundleReplayReport {
  const problems: string[] = [];
  const view = b.target.hashView === 'names_replaced' ? (w: WorldState) => replaceImportedNames(w) : (w: WorldState) => w;
  let w: WorldState = b.snapshot.world;
  if (deps.stateHash(view(w)) !== b.snapshot.stateHash) problems.push('snapshot hash differs from the bundle');
  let n = 0;
  for (const r of b.log) {
    const res = deps.apply(w, r.command);
    if (!res.ok) { problems.push(`command ${r.seq} no longer applies: ${res.reason}`); break; }
    w = res.world;
    n++;
    if (deps.eventsHash(res.events) !== r.eventsHash) problems.push(`events of command ${r.seq} differ on replay`);
    if (r.stateHash !== null && deps.stateHash(view(w)) !== r.stateHash) problems.push(`state after command ${r.seq} differs on replay`);
  }
  const replayedHash = deps.stateHash(view(w));
  if (replayedHash !== b.target.stateHash) problems.push(`reported state ${b.target.stateHash} not reached: replay gives ${replayedHash}`);
  const running = runningEngineVersion ?? null;
  const match = running === null ? null : running === b.header.engineVersion;
  if (match === false) problems.push(`bundle made with engine ${b.header.engineVersion}; this is ${running}. Replay with that version.`);
  return { ok: problems.length === 0, problems, commands: n, expectedHash: b.target.stateHash, replayedHash, engine: { bundle: b.header.engineVersion, running, match } };
}
