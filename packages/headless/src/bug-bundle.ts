// Bug bundles on the command line (P2.3.4 `replay`, P5.7.1). `bundle` makes a .gmbug from a save, the
// way the game's "report a problem" does; `replay-bundle` (and `replay` given a .gmbug) replays one
// from its snapshot to the reported state and compares every hash it carries. Same core deps as the
// save replay (replay-deps.ts), so a bundle made in either shell replays here.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { ENGINE_VERSION } from '@gm/engine-game';
import { SqlJsDriver, SaveStore, exporting } from '@gm/store';
import { replayDeps } from './replay-deps.ts';

export interface ReplayBundleResult {
  readonly code: number;
  readonly lines: readonly string[];
  readonly report?: exporting.BundleReplayReport;
}

/**
 * Reads and replays a bundle file. The running engine version defaults to this build's; a bundle made
 * with another engine version is reported, because only that version replays it exactly (P5.7.1).
 */
export async function replayBundleFile(file: string, runningEngine: string = ENGINE_VERSION): Promise<ReplayBundleResult> {
  let b: exporting.BugBundle;
  try {
    b = await exporting.decodeBugBundle(new Uint8Array(await readFile(resolve(file))));
  } catch (e) {
    return { code: 2, lines: [`cannot read ${file}: ${(e as Error).message}`] };
  }
  const r = exporting.replayBugBundle(b, replayDeps(), runningEngine);
  const lines = [
    `bundle: ${b.header.summary}; made with ${b.createdWith}; engine ${b.header.engineVersion}${r.engine.match === false ? ` (this build: ${r.engine.running})` : ''}`,
    `snapshot "${b.snapshot.kind}" after command ${b.snapshot.logSeq}, ${b.log.length} commands to command ${b.target.logSeq}; hashes ${b.target.hashView === 'names_replaced' ? 'with names replaced' : 'as recorded'}`,
    r.ok
      ? `replay OK: ${r.commands} commands, reached ${r.replayedHash}`
      : `replay FAILED: ${r.problems.join('; ')}`,
  ];
  return { code: r.ok ? 0 : 1, lines, report: r };
}

export interface MakeBundleOptions {
  readonly out?: string;
  /** Log sequence of the reported state; defaults to the last command. */
  readonly at?: number;
  readonly namesReplaced?: boolean;
  readonly appVersion?: string;
}

/** Makes a .gmbug from a .gmsave. Prints the P5.7.1 summary lines before writing. */
export async function makeBundleFile(saveFile: string, o: MakeBundleOptions = {}): Promise<{ code: number; lines: string[]; out?: string }> {
  const driver = SqlJsDriver.open(await initSqlJs(), new Uint8Array(await readFile(resolve(saveFile))));
  try {
    const store = await SaveStore.open(driver);
    const plan = await exporting.planBugBundle(store, replayDeps(), {
      appVersion: o.appVersion ?? `headless / ${ENGINE_VERSION}`,
      ...(o.at === undefined ? {} : { targetSeq: o.at }),
    });
    const bytes = await exporting.encodeBugBundle(plan.build({ namesReplaced: o.namesReplaced ?? false }));
    const out = resolve(o.out ?? saveFile.replace(/\.gmsave$/i, '') + exporting.BUG_BUNDLE_EXTENSION);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, bytes);
    return { code: 0, lines: [...plan.summary, `wrote ${out} (${bytes.length} bytes)`], out };
  } catch (e) {
    return { code: 1, lines: [`cannot bundle ${saveFile}: ${(e as Error).message}`] };
  } finally {
    await driver.close();
  }
}

/** True when the file starts with the gzip magic bytes, which every .gmbug does and no .gmsave does. */
export async function looksLikeBundle(file: string): Promise<boolean> {
  const head = new Uint8Array(await readFile(resolve(file))).subarray(0, 2);
  return exporting.isGzip(head);
}
