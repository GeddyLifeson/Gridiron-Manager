// Save core conformance in the shell gates (Q1.3.1, P5.2.1): the store's scripted career, played on
// this platform's own save storage (the browser vault through sql.js, or native SQLite on the
// desktop), reopened from storage as a restart would, and compared with the constants recorded on
// Linux. The same four values must come out on every platform.
import { CHAIN_GENESIS, bytesHash, chainNext, stateHash } from '@gm/engine-core';
import type { Platform, SqlDriver } from '@gm/app-services';
import { save } from '@gm/store';

export interface GateConformance {
  readonly ok: boolean;
  readonly expected: typeof save.CONFORMANCE_EXPECTED;
  readonly got: { commands: number; digest: string; stateHash: string; chainHead: string } | null;
  readonly replays: number;
  readonly problems: readonly string[];
  readonly seconds: number;
}

const NAME = 'gate-conformance';

export async function runGateConformance(platform: Platform, now: () => number = () => performance.now()): Promise<GateConformance> {
  const t0 = now();
  const expected = save.CONFORMANCE_EXPECTED;
  try {
    await platform.deleteSave(NAME).catch(() => undefined);
    const r = await save.runConformance({
      open: () => platform.openSave(NAME, true),
      // Write to storage, close, and open the stored file again.
      reopen: async (d: SqlDriver) => { await platform.flushSave(NAME, d); await d.close(); return platform.openSave(NAME, false); },
      hashes: { stateHash, bytesHash, chainNext, genesis: CHAIN_GENESIS },
    });
    const got = { commands: r.commands, digest: r.digest, stateHash: r.stateHash, chainHead: r.chainHead };
    const problems = [...r.problems];
    for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
      if (got[k] !== expected[k]) problems.push(`${k} ${got[k]} differs from the recorded ${expected[k]}`);
    }
    return { ok: problems.length === 0, expected, got, replays: r.replays, problems, seconds: Math.round((now() - t0) / 100) / 10 };
  } catch (e) {
    return { ok: false, expected, got: null, replays: 0, problems: [String(e)], seconds: Math.round((now() - t0) / 100) / 10 };
  } finally {
    await platform.deleteSave(NAME).catch(() => undefined);
  }
}
