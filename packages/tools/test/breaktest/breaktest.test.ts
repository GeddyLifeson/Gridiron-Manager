import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, fromJson, makeTarget, runTarget, shrink, toJson, type Action, type BreakTarget, type Mode, type Rnd } from '../../src/breaktest/index.ts';

/** TEST DOUBLE: a counter with planted bugs (accepts negatives, breaks an invariant past 50, throws on 13). */
class Toy implements BreakTarget {
  readonly name = 'toy';
  readonly owner = 'test';
  n = 0;
  async reset(): Promise<void> { this.n = 0; }
  propose(mode: Mode, r: Rnd): Action { return { kind: 'add', mode, args: { by: mode === 'legal' ? r.int(1, 3) : r.pick([-5, 13, 7]) } }; }
  expect(a: Action): string | null { return (a.args['by'] as number) < 0 ? 'negative step' : null; }
  async apply(a: Action) { const by = a.args['by'] as number; if (by === 13) throw new Error('unlucky 13'); this.n += by; return { accepted: true as const }; }
  invariants() { return this.n > 50 ? [{ code: 'too_big', message: 'over 50' }] : []; }
  hash() { return String(this.n); }
  unreachable() { return [{ code: 'toy.gap', message: 'a gap' }]; }
  async close(): Promise<void> {}
}

describe('break-test engine', () => {
  it('turns planted bugs into findings and replays deterministically', async () => {
    const r = await runTarget(new Toy(), '00000000000000a1', { ...DEFAULT_RUN, steps: 200 });
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain('accepted:add:negative_step');
    expect(codes).toContain('too_big');
    expect(codes.some((c) => c.startsWith('crash:add:unlucky'))).toBe(true);
    expect(codes).toContain('toy.gap');
    expect(codes).not.toContain('replay.diverged');
    const again = await runTarget(new Toy(), '00000000000000a1', { ...DEFAULT_RUN, steps: 200 });
    expect(again.findings.map((f) => `${f.code}:${f.count}`)).toEqual(r.findings.map((f) => `${f.code}:${f.count}`));
  });

  it('shrinks a crash to the one action that causes it', async () => {
    const r = await runTarget(new Toy(), '00000000000000b2', { ...DEFAULT_RUN, steps: 200 });
    const crash = r.findings.find((f) => f.kind === 'crash');
    expect(crash?.repro).toHaveLength(1);
    expect(crash?.repro?.[0]?.args['by']).toBe(13);
  });

  it('shrinks a state invariant to a short sequence', async () => {
    const acts: Action[] = Array.from({ length: 40 }, () => ({ kind: 'add', mode: 'legal', args: { by: 2 } }));
    const out = await shrink(new Toy(), '00', acts, 'too_big', 200);
    expect(out!.length).toBeLessThan(40);
    expect(out!.length).toBeGreaterThanOrEqual(26);
  });

  it('writes NaN, Infinity, -0 and undefined into run files and reads them back', () => {
    const v = { a: NaN, b: -Infinity, c: -0, d: undefined, e: [1, Infinity] };
    const back = fromJson(JSON.parse(JSON.stringify(toJson(v)))) as typeof v;
    expect(Number.isNaN(back.a)).toBe(true);
    expect(back.b).toBe(-Infinity);
    expect(Object.is(back.c, -0)).toBe(true);
    expect('d' in back && back.d === undefined).toBe(true);
    expect(back.e[1]).toBe(Infinity);
  });
});

describe('break-test targets (short runs)', () => {
  it('cap: legal moves alone keep the books whole until the cap table runs out', async () => {
    const r = await runTarget(makeTarget('cap', ''), '00000000000000c3', { ...DEFAULT_RUN, steps: 80, modeWeights: [1, 0, 0, 0], shrink: false });
    const real = r.findings.filter((f) => f.kind !== 'unreachable' && f.code !== 'team_cap.throws');
    expect(real).toEqual([]);
  });

  it('observer: runs every mode without the rig itself failing', async () => {
    const r = await runTarget(makeTarget('observer', ''), '00000000000000d4', { ...DEFAULT_RUN, steps: 120, shrink: false });
    expect(r.steps).toBe(120);
    expect(r.findings.some((f) => f.code === 'replay.diverged')).toBe(false);
  });

  it('world-service: commands, time skips and reloads replay to the same states', async () => {
    const r = await runTarget(makeTarget('world-service', 'test-results/breaktest-test-saves'), '00000000000000e5', { ...DEFAULT_RUN, steps: 40, reloadChance: 0.2, shrink: false });
    expect(r.reloads).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.code === 'replay.diverged' || f.code === 'reload.state_changed')).toBe(false);
  }, 60_000);
});
