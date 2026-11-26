import { describe, expect, it } from 'vitest';
import { CONFORMANCE_EXPECTED, runConformance } from '../../src/save/conformance.ts';
import { RAW_CODEC } from '../../src/snapshot/codec.ts';
import { env } from './helpers.ts';

describe('scripted career (Q1.3.1, P5.2.1, P5.3.1)', () => {
  it('replays from every snapshot to the live state, reopens unchanged, and gives the recorded hashes', async () => {
    const r = await runConformance(env());
    expect(r.problems).toEqual([]);
    expect(r.replays).toBeGreaterThan(15);
    // The same four values on Linux, Windows and in the browser (Q1.3.1).
    expect({ commands: r.commands, digest: r.digest, stateHash: r.stateHash, chainHead: r.chainHead }).toEqual(CONFORMANCE_EXPECTED);
  });
  it('gives the same hashes without compression', async () => {
    const a = await runConformance({ ...env(), weeks: 12 });
    const b = await runConformance({ ...env(), weeks: 12, codec: RAW_CODEC });
    expect(b.problems).toEqual([]);
    expect({ ...b }).toEqual({ ...a });
  });
});
