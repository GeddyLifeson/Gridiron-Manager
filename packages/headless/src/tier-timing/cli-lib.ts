// Helpers of the tier timing command line, apart from it so they can be used without running it.
import { cpus, platform, release, totalmem } from 'node:os';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TiersPort } from './types.ts';

/** The machine as the report names it: processor, cores, memory and system. No user or host name. */
export function machineName(): string {
  const c = cpus();
  return `${c[0]?.model.trim() ?? 'unknown processor'}, ${c.length} logical cores, ${Math.round(totalmem() / 2 ** 30)} GB, ${platform()} ${release()}`;
}

export async function loadTiers(path: string): Promise<TiersPort<unknown, { kind: string }>> {
  const url = path.startsWith('file:') ? path : isAbsolute(path) ? pathToFileURL(path).href : null;
  if (!url) throw new Error(`tiers module ${path}: give a file: URL or an absolute path`);
  const mod = (await import(url)) as Partial<TiersPort<unknown, { kind: string }>>;
  for (const k of ['METRICS', 'configLadder', 'configProblems', 'buildReport', 'reportProblems', 'chooseShipping', 'diffReports'] as const) {
    if (mod[k] === undefined) throw new Error(`tiers module ${path} has no ${k}`);
  }
  return mod as TiersPort<unknown, { kind: string }>;
}
