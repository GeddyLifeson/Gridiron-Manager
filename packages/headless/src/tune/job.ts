// Automated calibration, part 1a: one block of games.
// A block is a few real games on one master seed with one set of parameter overrides. It returns one
// number per target row (the simulated value for a scalar row; the signed error for a quantile or an
// ordering row, which have no single value), the events behind it, and a fingerprint of everything the
// games recorded. Two blocks with the same seed and the same fingerprint played identical games.
import { createHash } from 'node:crypto';
import type { CalibrationTarget, FactStatus } from '@gm/schema';
import { createRealGame } from '../real-game/index.ts';
import { buildReport, loadTargets, type LoadedTargets } from '../calibration/index.ts';

export interface BlockJob {
  readonly ruleSetId: string;
  readonly games: number;
  /** 16 lower-case hex digits. */
  readonly seedHex: string;
  readonly overrides: Readonly<Record<string, number>>;
}

/** [value, events]; value is null when the block cannot measure the row. */
export type BlockRow = readonly [number | null, number];

export interface BlockResult {
  readonly rows: readonly BlockRow[];
  readonly fingerprint: string;
  readonly ms: number;
  /** Set when the games threw (a parameter value the engine refuses, for example). */
  readonly error?: string;
}

export interface RowMeta {
  readonly id: string;
  readonly target: CalibrationTarget;
  readonly status: FactStatus | null;
}

const targetCache = new Map<string, LoadedTargets>();
export function targetsOf(root: string, ruleSetId: string): LoadedTargets {
  const key = `${root}|${ruleSetId}`;
  let t = targetCache.get(key);
  if (!t) { t = loadTargets(root, ruleSetId); targetCache.set(key, t); }
  return t;
}

export function rowMeta(root: string, ruleSetId: string): RowMeta[] {
  const loaded = targetsOf(root, ruleSetId);
  return loaded.file.targets.map((t) => ({ id: t.id, target: t, status: loaded.statusOf.get(t.id) ?? null }));
}

export const seedHex = (n: number): string => Math.floor(n).toString(16).padStart(16, '0');

export function runBlock(root: string, job: BlockJob): BlockResult {
  const t0 = performance.now();
  try {
    const batch = createRealGame(job.ruleSetId, { paramOverrides: job.overrides }).batch(job.games, 1, job.seedHex);
    const report = buildReport(targetsOf(root, job.ruleSetId), batch.groups, { build: 'tune', paramsHash: 'tune', resolverId: 'tune', seeds: job.seedHex, games: job.games, seedGroups: 1 });
    const rows: BlockRow[] = report.rows.map((r) => {
      if (r.state !== 'measured') return [null, 0];
      const v = typeof r.real === 'number' ? (typeof r.simulated === 'number' ? r.simulated : null) : r.signedError;
      return [v !== null && Number.isFinite(v) ? v : null, r.simEvents];
    });
    const fingerprint = createHash('sha1').update(JSON.stringify(batch.groups)).digest('hex');
    return { rows, fingerprint, ms: performance.now() - t0 };
  } catch (e) {
    return { rows: [], fingerprint: '', ms: performance.now() - t0, error: String(e instanceof Error ? e.message : e).split('\n')[0]!.slice(0, 300) };
  }
}
