// G-90 test bench (O3.1.4, G1.6.2). Runs on the reference resolver here; the tick resolver (WP-23)
// plugs into the same `resolverFor`. Teams, field and rules are the reference resolver's FIXTURES.
import { describe, expect, it } from 'vitest';
import type { PlayResult, Resolver } from '@gm/schema';
import { resolver as ref } from '@gm/resolver-reference';
import { runBench, benchInput, summarise, type BenchContent, type BenchDeps, type BenchRequest } from '../../src/play-bench/index.ts';
import { BASE as base, defenseCall, offenseCall, situation, OFFENSE_ROLES } from './fixtures.ts';

const call = offenseCall();
const ids = call.players.map((p) => p.playerId);
// Stand-in for the designer's assignments: the bench passes them through untouched.
const assignments = OFFENSE_ROLES.map((role) => ({ role }) as never);
/** Canonical JSON, keys sorted (same form the designer and editor core use). */
const canonical = (v: unknown): string => (v === null || typeof v !== 'object' ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`);

function request(over: Partial<BenchRequest> = {}): BenchRequest {
  return {
    subject: { label: 'draft', call, assignments },
    opponents: [{ label: 'cover3', call: defenseCall(), assignments: [] }, { label: 'cover1', call: defenseCall({ coverageFamily: 'cover1', rushers: 5 }), assignments: [] }],
    situation: situation(), runs: 120, seed: 7, knowledge: 'fully_installed',
    teamValues: { own: 'staff_graded', opponent: 'scouted' }, inGame: false, ...over,
  };
}
const seen: BenchContent[] = [];
const deps = (over: Partial<BenchDeps> = {}): BenchDeps => ({ resolverFor: (c) => { seen.push(c); return ref.REFERENCE_RESOLVER; }, base, ...over });

describe('test bench (O3.1.4)', () => {
  it('completes 500 runs and the counts add up', () => {
    const r = runBench(request({ runs: 500 }), deps());
    expect(r.refusedBecause).toBeNull();
    expect(r.runsDone).toBe(500);
    expect(r.byOpponent.reduce((a, b) => a + b.runs, 0)).toBe(500);
    expect(r.overall!.histogram.counts.reduce((a, b) => a + b, 0)).toBe(500);
    expect(r.overall!.yards.n).toBe(500);
    expect(r.hourCharge).toEqual({ actionClass: 'bench_session', hours: 0.5 });
    // The reference resolver may never produce saved results; the report says which resolver ran.
    expect(r.resolver.id).toBe('reference');
  });
  it('the same batch and seed gives identical results; another seed differs (acceptance 2)', () => {
    const a = runBench(request(), deps()), b = runBench(request(), deps()), c = runBench(request({ seed: 8 }), deps());
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).not.toBe(canonical(c));
  });
  it('every rate and mean carries its sample size and an interval', () => {
    const r = runBench(request(), deps());
    for (const b of [r.overall!, ...r.byOpponent]) {
      expect(b.yards.n).toBe(b.runs);
      expect(b.yards.low! <= b.yards.mean! && b.yards.mean! <= b.yards.high!).toBe(true);
      if (b.completion.of > 0) expect(b.completion.low! <= b.completion.rate! && b.completion.rate! <= b.completion.high!).toBe(true);
    }
  });
  it('no output field exposes a player id or an attribute (acceptance 3)', () => {
    const text = canonical(runBench(request(), deps()));
    for (const banned of ['playerId', 'attributes', 'iss', 'catcherId', 'rusherId']) expect(text).not.toContain(`"${banned}"`);
    const keys = new Set<string>();
    const walk = (v: unknown): void => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!Array.isArray(v)) keys.add(k); walk(x); } };
    walk(JSON.parse(text));
    expect([...keys].filter((k) => /id$|ids$/i.test(k) && k !== 'id')).toEqual([]);
    expect(Object.keys(runBench(request({ runs: 1 }), deps()).runsList[0]!).sort()).toEqual(['fouls', 'index', 'lostContests', 'opponent', 'outcome', 'passPlay', 'pressured', 'targetRole', 'yards']);
  });
  it('hands the resolver the subject side\'s assignments by its content id and hash', () => {
    seen.length = 0;
    runBench(request({ runs: 1 }), deps());
    expect(seen[0]!.sides[0]).toEqual({ contentId: 'draft:bench-play', contentHash: '0123456789abcdef', assignments });
    expect(seen[0]!.knowledge).toBe('fully_installed');
  });
  it('a cancelled batch keeps the runs so far, marked partial', () => {
    const r = runBench(request({ runs: 200 }), deps({ shouldCancel: (n) => n >= 50 }));
    expect(r.partial).toBe(true);
    expect(r.runsDone).toBe(50);
  });
  it('is unavailable during a game, and refuses true values or no opponent', () => {
    expect(runBench(request({ inGame: true }), deps()).refusedBecause).toBe('in_game');
    expect(runBench(request({ teamValues: { own: 'true' as 'staff_graded', opponent: 'scouted' } }), deps()).refusedBecause).toBe('not_graded_values');
    expect(runBench(request({ opponents: [] }), deps()).refusedBecause).toBe('no_opponents');
    expect(runBench(request({ inGame: true }), deps()).hourCharge.hours).toBe(0);
  });
  it('re-running one sample at full detail reproduces its result (viewer, O2.6)', () => {
    const req = request();
    const r = runBench(req, deps());
    const i = r.overall!.samples[2]!;
    const again = summarise(req, i, benchInput(req, deps(), i), ref.REFERENCE_RESOLVER.simulatePlay(benchInput(req, deps(), i, 'full')));
    expect(again).toEqual(r.runsList[i]);
  });
  it('an illegal play run on the engine shows its flag; a defensive subject sees the gain from its side', () => {
    const req = request();
    const inp = benchInput(req, deps(), 0);
    const fake: PlayResult = {
      truth: {
        resolverId: 'tick', resolverVersion: 't', gameId: 1, playNumber: 1, originX: 35, originY: 26, attackDir: 1, liveDurationTenths: 0, endZoneImpetus: null,
        events: [
          { type: 'foul_committed', t: 0, foulId: 'illegal_formation', side: 0, playerId: ids[6]!, spot: { x: 35, y: 26 }, timing: 'live', phase: 'pass_play', severity: 0.5, visibility: 'open', atPointOfAttack: false, flagrant: false, borderline: false, ordered: false },
          { type: 'dead_ball', t: 4, judged: false, reason: 'runner_tackled', spot: { x: 41, y: 20 }, side: 0, carrierId: ids[8]! } as never,
        ],
      },
      deltas: [], liveDurationTenths: 40, trajectory: null, explain: null,
    };
    const s = summarise(req, 0, inp, fake);
    expect(s.fouls).toEqual(['illegal_formation']);
    expect(s.yards).toBe(6);
    const asDefense = summarise({ ...req, subject: req.opponents[0]!, opponents: [req.subject] }, 0, inp, fake);
    expect(asDefense.yards).toBe(-6);
    expect(asDefense.fouls).toEqual([]);
  });
});

// Keeps the Resolver type in use so a contract change to it breaks this file loudly.
export const _contract: Resolver = ref.REFERENCE_RESOLVER;
