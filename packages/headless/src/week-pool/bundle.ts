// G-97 part 3: the pool's worker and job module as plain JavaScript bundles, so long runs (history, 10k
// gates) do not pay the TypeScript loader's costs in every game. tsx compiles with esbuild's keepNames,
// which re-names every inner function each time it is created (an Object.defineProperty call per closure,
// thousands per game), and runs each package as a separate ES module. A bundle has neither. The code is
// the same code: the bundle is built from the same sources, and no engine code reads a function's name,
// so results are byte-identical (test/week-pool/bundle.test.ts and measure.ts check the hashes).
//
// Tool-side only (headless): loads esbuild (a pinned dev dependency, the compiler tsx itself uses) at run
// time as a build tool, writes two files to a fresh temporary folder and removes it on dispose. The engine
// packages never see esbuild. It is not on headless's list of runtime imports (lint P1.2.2), so it is
// loaded through require only when a bundle is asked for.
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { JobModuleRef } from './job-module.ts';

export interface PoolBundle {
  /** The job module as a bundle: same options, module pointing at the built file. */
  readonly module: JobModuleRef;
  /** The pool's worker as a bundle: pass as `workerPath` with `execArgv: []`. */
  readonly workerPath: string;
  /** Removes the temporary folder. */
  dispose(): void;
}

const WORKER_SOURCE = fileURLToPath(new URL('./worker.ts', import.meta.url));

/** Builds the pool worker and the job module named by `ref` into plain ES module bundles. */
export function bundleForPool(ref: JobModuleRef): PoolBundle {
  const source = ref.module.startsWith('file:') ? fileURLToPath(ref.module) : ref.module;
  const dir = mkdtempSync(join(tmpdir(), 'gm-pool-'));
  try {
    const esbuild = createRequire(import.meta.url)('esbuild') as { buildSync(o: Record<string, unknown>): unknown };
    esbuild.buildSync({
      entryPoints: { worker: WORKER_SOURCE, job: source },
      outdir: dir, outExtension: { '.js': '.mjs' },
      bundle: true, platform: 'node', format: 'esm', target: 'node22',
      keepNames: false, minify: false, sourcemap: false, logLevel: 'warning',
      // Everything goes in, @gm/* sources and npm packages alike: the files live outside the repository,
      // where node_modules cannot be found.
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return {
    module: { module: pathToFileURL(join(dir, 'job.mjs')).href, options: ref.options },
    workerPath: join(dir, 'worker.mjs'),
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}
