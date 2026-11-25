// Replay check of a save (P1.1.3 acceptance 2, P5.3.2): replays the command log from the creation
// snapshot and compares every logged hash, the chain and the live tables. The store has no football
// logic, so the caller injects the core's apply function and hash functions.
import { CommandEnvelope, type WorldState } from '@gm/schema';
import type { SaveStore } from './save-store.ts';

export interface ReplayDeps {
  apply(world: WorldState, cmd: CommandEnvelope): { ok: true; world: WorldState; events: unknown[] } | { ok: false; reason: string };
  stateHash(v: unknown): string;
  eventsHash(events: unknown[]): string;
  chainNext(link: { prev: string; stateHash: string; logSequence: number; engineVersion: string; parameterSetVersion: string }): string;
  genesis: string;
}

export interface ReplayReport { ok: boolean; problems: string[]; replayedHash: string; commands: number; chainHead: string }

export async function verifySaveLog(store: SaveStore, deps: ReplayDeps): Promise<ReplayReport> {
  const problems: string[] = [];
  const snaps = await store.snapshots();
  const creation = snaps.find((s) => s.kind === 'creation');
  if (!creation) return { ok: false, problems: ['no creation snapshot'], replayedHash: '', commands: 0, chainHead: deps.genesis };
  let w: WorldState = JSON.parse(creation.json);
  if (deps.stateHash(w) !== creation.state_hash) problems.push('creation snapshot hash mismatch');
  let head = deps.genesis;
  const chain = await store.chain();
  let ci = 0;
  const log = await store.commandLog();
  for (const row of log) {
    const cmd = CommandEnvelope.parse(JSON.parse(row.command));
    const r = deps.apply(w, cmd);
    if (!r.ok) { problems.push(`logged command ${row.seq} no longer applies: ${r.reason}`); break; }
    w = r.world;
    if (deps.eventsHash(r.events) !== row.events_hash) problems.push(`events of command ${row.seq} differ on replay`);
    if (row.state_hash) {
      const h = deps.stateHash(w);
      if (h !== row.state_hash) problems.push(`state after command ${row.seq} differs on replay`);
      const link = chain[ci++];
      const expect = link ? deps.chainNext({ prev: head, stateHash: h, logSequence: row.seq, engineVersion: link.engine_version, parameterSetVersion: link.parameter_set_version }) : '';
      if (!link || link.head !== expect || link.state_hash !== h || link.prev !== head) problems.push(`hash chain row ${ci} does not match the replay`);
      head = link?.head ?? head;
    }
  }
  if (ci !== chain.length) problems.push(`hash chain has ${chain.length} rows but the log has ${ci} checkpoints`);
  const live = await store.world();
  if (deps.stateHash(live) !== deps.stateHash(w)) problems.push('live world tables differ from the replayed log (edited outside the game?)');
  if ((await store.header()).hashChainHead !== head) problems.push('header chain head differs from the chain');
  return { ok: problems.length === 0, problems, replayedHash: deps.stateHash(w), commands: log.length, chainHead: head };
}
