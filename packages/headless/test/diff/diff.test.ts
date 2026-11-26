// WP-24 diff runner tests (Q1.3.2). FIXTURE factory only: the fake resolver's `fake.rushSpeed` touches
// only pass plays, `fake.runPower` only runs, and `fake.streamShift` reorders its random draws.
import { describe, expect, it } from 'vitest';
import { BALL_STATES, SLOT_COUNT, type PlayResult, type PlayTruth, type TickWorld, type TruthEvent } from '@gm/schema';
import { tick } from '@gm/engine-core';
import { runDiff, type DiffSpec } from '../../src/diff/run.ts';
import { firstTrajectoryTick, playDivergence, ticksOf } from '../../src/diff/divergence.ts';
import { formatDiffReport } from '../../src/diff/report.ts';
import { PARAMS, diffParam } from '../../src/diff/params.ts';
import { FAKE_FACTORY_MODULE } from '../batch/fake-factory.ts';

const SEED = '0badcafe00000001';
const spec = (over: Partial<DiffSpec> = {}): DiffSpec => ({
  factory: { module: FAKE_FACTORY_MODULE, options: { stats: true } },
  base: { label: 'base', resolverId: 'reference' }, variant: { label: 'same', resolverId: 'reference' },
  masterSeedHex: SEED, games: 6, playSample: 2000, ...over,
});

describe('WP-24 diff runner (Q1.3.2)', () => {
  it('reports nothing changed for the same build on the same seeds (J13)', async () => {
    const r = await runDiff(spec());
    expect(r.plays.compared).toBe(6 * 24);
    expect(r.plays.changed).toBe(0);
    expect(r.plays.impure).toBe(0);
    expect(r.gamesChanged).toBe(0);
    expect(r.games.every((g) => g.sameEvents && g.firstChangedPlay === null)).toBe(true);
    expect(r.playByPlayMeaningful).toBe(true);
  });

  it('a one-parameter pass-rush change changes only pass plays, each traced to the pass-block contest', async () => {
    const r = await runDiff(spec({ variant: { label: 'rush', resolverId: 'reference', paramOverrides: { 'fake.rushSpeed': 0.8 } } }));
    expect(r.plays.changed).toBeGreaterThan(0);
    expect(r.plays.byCall.run!.changed).toBe(0);
    expect(r.plays.byCall.dropback_pass!.changed).toBe(r.plays.changed);
    expect(r.plays.list.every((p) => p.call === 'dropback_pass' && p.contest === 'passBlock')).toBe(true);
    // The fake contest is decided at t = 1.2 s, tick 12; the report must name that tick.
    expect(r.plays.list.every((p) => p.firstTick === 12 && p.tickSource === 'event')).toBe(true);
    expect(Object.keys(r.plays.byContest)).toEqual(['passBlock']);
    expect(r.gamesChanged).toBeGreaterThan(0);
    expect(r.notes.filter((n) => !n.startsWith('compared'))).toEqual([]);
  });

  it('a run-power change changes only runs', async () => {
    const r = await runDiff(spec({ variant: { label: 'run', resolverId: 'reference', paramOverrides: { 'fake.runPower': 0.2 } } }));
    expect(r.plays.changed).toBeGreaterThan(0);
    expect(r.plays.byCall.dropback_pass!.changed).toBe(0);
    expect(r.plays.list.every((p) => p.contest === 'runBlock')).toBe(true);
  });

  it('isolates plays: a play that only changed because an earlier play changed is not counted', async () => {
    const r = await runDiff(spec({ variant: { label: 'rush', resolverId: 'reference', paramOverrides: { 'fake.rushSpeed': 0.8 } } }));
    // In-game, every play after the first changed one sees a different ball spot; isolated replay does not.
    const firstChanged = r.games.find((g) => g.firstChangedPlay !== null)!;
    expect(firstChanged.firstChangedPlay).not.toBeNull();
    expect(r.plays.byCall.run!.changed).toBe(0);
  });

  it('says the stream order probably changed when nearly every play differs, and falls back to distributions', async () => {
    const r = await runDiff(spec({ variant: { label: 'shift', resolverId: 'reference', paramOverrides: { 'fake.streamShift': 1000 } }, filters: ['rush.yardsPerCarry'] }));
    expect(r.plays.share).toBeGreaterThanOrEqual(diffParam('diff.streamOrderShare'));
    expect(r.streamOrderSuspected).toBe(true);
    expect(r.playByPlayMeaningful).toBe(false);
    expect(r.notes.some((n) => n.includes('stream order'))).toBe(true);
    expect(r.distribution).not.toBeNull();
  });

  it('compares the reference and tick resolvers by distribution, not play by play', async () => {
    const r = await runDiff(spec({ variant: { label: 'tick', resolverId: 'tick' }, filters: ['pass.sackRate', 'rush.yardsPerCarry'] }));
    expect(r.sameResolver).toBe(false);
    expect(r.playByPlayMeaningful).toBe(false);
    expect(r.notes[0]).toMatch(/different resolvers/);
    expect(r.variant.resolverVersion).toBe('tick@fake-tick-1');
    expect(r.distribution!.map((d) => d.filter)).toEqual(['pass.sackRate', 'rush.yardsPerCarry']);
  });

  it('measures the distribution shift per target row the way calibration does', async () => {
    const r = await runDiff(spec({
      games: 30, variant: { label: 'rush', resolverId: 'reference', paramOverrides: { 'fake.rushSpeed': 0.95 } },
      filters: ['pass.sackRate', 'rush.yardsPerCarry', 'no.such.measure', 'none'],
    }));
    const by = new Map(r.distribution!.map((d) => [d.filter, d]));
    expect(by.get('pass.sackRate')!.shifted).toBe(true);
    expect(by.get('pass.sackRate')!.delta!).toBeGreaterThan(0);
    expect(by.get('rush.yardsPerCarry')!.delta).toBe(0);
    expect(by.get('rush.yardsPerCarry')!.shifted).toBe(false);
    expect(by.get('no.such.measure')!.note).toMatch(/unknown measure/);
    expect(by.get('none')!.note).toMatch(/not measurable/);
  });

  it('flags a resolver that gives two answers for one input as a determinism fault', async () => {
    const r = await runDiff(spec({ factory: { module: FAKE_FACTORY_MODULE, options: { impure: true } }, games: 1 }));
    expect(r.plays.impure).toBeGreaterThan(0);
    expect(r.notes.some((n) => n.includes('determinism fault'))).toBe(true);
  });

  it('stops replaying at the play sample and says so', async () => {
    const r = await runDiff(spec({ playSample: 30 }));
    expect(r.plays.compared).toBe(30);
    const r2 = await runDiff(spec({ games: 1 }));
    expect(r2.notes.some((n) => n.startsWith('compared 24 plays'))).toBe(true);
  });

  it('writes a report with counts, the changed plays and the distribution table', async () => {
    const r = await runDiff(spec({ variant: { label: 'rush', resolverId: 'reference', paramOverrides: { 'fake.rushSpeed': 0.8 } }, filters: ['pass.sackRate'] }));
    const text = formatDiffReport(r, { maxPlays: 3 });
    expect(text).toContain('# Diff report (Q1.3.2)');
    expect(text).toContain(`changed ${r.plays.changed}`);
    expect(text).toContain('fake.rushSpeed=0.8');
    expect(text).toContain('| dropback_pass |');
    expect(text).toContain('## Distribution shift per target row');
    expect(text).toContain(`first ${Math.min(3, r.plays.list.length)} of ${r.plays.list.length}`);
  });

  it('keeps the bible play sample as its starting value', () => {
    expect(diffParam('diff.playSample')).toBe(2000);
    expect(PARAMS.params.find((p) => p.name === 'diff.playSample')!.basis).toBe('bible');
    expect(() => diffParam('diff.nope')).toThrow();
  });
});

describe('WP-24 first divergence of one play', () => {
  const ev = (type: string, t: number, extra: Record<string, unknown> = {}) => ({ type, t, ...extra }) as unknown as TruthEvent;
  const truth = (events: TruthEvent[], over: Partial<PlayTruth> = {}): PlayTruth => ({
    resolverId: 'reference', resolverVersion: '1', gameId: 1, playNumber: 1, originX: 35, originY: 26, attackDir: 1,
    liveDurationTenths: 40, endZoneImpetus: null, events, ...over,
  });
  const res = (tr: PlayTruth, over: Partial<PlayResult> = {}): PlayResult => ({ truth: tr, deltas: [], liveDurationTenths: tr.liveDurationTenths as PlayResult['liveDurationTenths'], trajectory: null, explain: null, ...over });
  const spot = { x: 40, y: 26 };

  it('returns null for equal plays, even under a different resolver id', () => {
    const a = truth([ev('dead_ball', 4, { reason: 'runner_down', spot })]);
    expect(playDivergence(res(a), res({ ...a, resolverId: 'tick', resolverVersion: '9' }))).toBeNull();
  });

  it('names the last contest before the first differing event', () => {
    const shared = [ev('snap', 0), ev('contest', 0.8, { contest: 'release', winnerId: 1, loserId: 2, spot })];
    const a = truth([...shared, ev('catch_point', 2.5, { outcome: 'catch' }), ev('dead_ball', 4, { reason: 'runner_down', spot })]);
    const b = truth([...shared, ev('catch_point', 2.5, { outcome: 'breakup' }), ev('dead_ball', 2.6, { reason: 'incomplete_pass', spot })]);
    const d = playDivergence(res(a), res(b))!;
    expect(d.eventIndex).toBe(2);
    expect(d.firstTick).toBe(25);
    expect(d.contest).toBe('release');
    expect(d.contestSource).toBe('contest_event');
    expect(d.baseDeadBall).toBe('runner_down');
    expect(d.variantDeadBall).toBe('incomplete_pass');
  });

  it('falls back to the contest the differing event stands for', () => {
    const a = truth([ev('snap', 0), ev('tackle_attempt', 3, { outcome: 'made' })]);
    const b = truth([ev('snap', 0), ev('tackle_attempt', 3, { outcome: 'broken' })]);
    const d = playDivergence(res(a), res(b))!;
    expect(d.contest).toBe('tackle');
    expect(d.contestSource).toBe('event_type');
  });

  it('prefers the explain record when one is given (Q2.6.1)', () => {
    const a = truth([ev('snap', 0), ev('tackle_attempt', 3, { outcome: 'made' })]);
    const b = truth([ev('snap', 0), ev('tackle_attempt', 3, { outcome: 'missed' })]);
    const d = playDivergence(res(a, { explain: { at30: 'pile' } }), res(b), (x, t) => (x as Record<string, string> | null)?.[`at${t}`] ?? null)!;
    expect(d.contest).toBe('pile');
    expect(d.contestSource).toBe('explain');
  });

  it('reports a deltas-only difference with no tick', () => {
    const a = truth([ev('dead_ball', 4, { reason: 'runner_down', spot })]);
    const d = playDivergence(res(a), res(a, { deltas: [{ playerId: 1, energyCost: 0.1, hitLoad: 0, onField: true }] }))!;
    expect(d.differs).toEqual({ truth: false, deltas: true, liveDuration: false });
    expect(d.firstTick).toBeNull();
    expect(d.tickSource).toBe('none');
  });

  it('reads the first differing tick off two trajectories (tick engine film, J1.6.2)', () => {
    // FIXTURE world: only the fields the recorder reads. Slot 3 starts moving at tick `moveFrom`.
    const film = (moveFrom: number) => {
      const z = () => Array.from({ length: SLOT_COUNT }, (_, i) => i);
      const w = {
        tick: 0, contests: [], officials: [],
        players: { posX: z().map((i) => 20 + i), posY: z().map((i) => 2 + 2 * i), headingRad: z().map(() => 0), gazeRad: z().map(() => 0), moveMode: z().map(() => 0), engagement: z().map(() => -1) },
        ball: { kind: BALL_STATES[0], x: 35, y: 26, heightYd: 0, carrierSlot: -1 },
      } as unknown as TickWorld;
      const rec = tick.createTrajectoryRecorder();
      rec.begin(w);
      for (let k = 1; k <= 20; k++) {
        w.tick = k;
        if (k >= moveFrom) w.players.posX[3] = w.players.posX[3]! + 0.05;
        rec.afterTick(w);
      }
      return rec.finish();
    };
    expect(firstTrajectoryTick(film(99), film(99))).toBeNull();
    const t = firstTrajectoryTick(film(99), film(7));
    expect(t).toBe(7);
    expect(firstTrajectoryTick(null, film(1))).toBeNull();
    // The trajectory tick wins over a later event tick.
    const a = truth([ev('snap', 0), ev('dead_ball', 2, { reason: 'runner_down', spot })]);
    const b = truth([ev('snap', 0), ev('dead_ball', 2, { reason: 'out_of_bounds', spot })]);
    const d = playDivergence(res(a, { trajectory: film(99) }), res(b, { trajectory: film(7) }))!;
    expect(d.tickSource).toBe('trajectory');
    expect(d.firstTick).toBe(t);
  });

  it('turns seconds into ticks of a tenth', () => {
    expect(ticksOf(1.2)).toBe(12);
    expect(ticksOf(-0.5)).toBe(-5);
  });
});
