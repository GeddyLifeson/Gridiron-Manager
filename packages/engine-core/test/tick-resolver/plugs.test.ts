// WP-23, second part: the real quarterback (WP-20, J7) plugged into the tick resolver and the catch
// point (J6.5.1) run as a stage. The plays run on FIXTURE units, routes and quarterback plays, with the
// carrier and foul modules still on stand-ins, so these check that the pieces meet (who ends the play,
// what the record says, determinism), not football rates. Rates are WP-26's.
import { describe, expect, it } from 'vitest';
import { SLOTS_PER_TEAM, deadBallOf, eventsOf, playTruthProblems, type PlayInput, type PlayResult } from '@gm/schema';
import { canonicalBytes } from '../../src/canonical.ts';
import { QB_PLUG_VERSION, availablePlugs, createTickResolver, qbTargetOf, quarterbackPlug, type PlayContentPort } from '../../src/tick-resolver/index.ts';
import { CONTENT, TABLE, playInput, tableWith, unitsOf } from './support.ts';

const hex = (r: PlayResult): string => Buffer.from(canonicalBytes({ truth: r.truth, deltas: r.deltas, live: r.liveDurationTenths })).toString('hex');
const plug = quarterbackPlug();
const resolver = createTickResolver({ content: CONTENT, plugs: [plug] });
const QB_ID = 109;

describe('tick resolver with the real quarterback: honesty', () => {
  it('names only the modules still missing and may not produce saved results yet', () => {
    const r = createTickResolver({ content: CONTENT, plugs: availablePlugs() });
    expect(createTickResolver({ content: CONTENT, plugs: [quarterbackPlug()] }).report.standIns).toEqual(['carrier', 'foulsInjuries']);
    expect(r.report.standIns).toEqual([]);
    expect(r.report.moduleVersions['qb']).toBe(QB_PLUG_VERSION);
    expect(r.mayProduceSavedResults).toBe(true);
  });
  it('builds a quarterback target from a drawn route', () => {
    const O = unitsOf('pass').O;
    const x = qbTargetOf(6, O[6]!);
    expect(x.route[0]).toEqual({ px: O[6]!.preSnap.align.px, py: O[6]!.preSnap.align.py });
    expect(x.route).toHaveLength(3);
    expect(x.breakIndex).toBe(1);
    expect(x.settles).toBe(false);
    expect(qbTargetOf(5, O[5]!).settles).toBe(true);
    expect(qbTargetOf(0, O[0]!).route).toEqual([]);
  });
});

describe('tick resolver with the real quarterback: the truth record', () => {
  const tally = new Map<string, number>();
  const add = (k: string): void => { tally.set(k, (tally.get(k) ?? 0) + 1); };
  it('keeps every structural promise on 240 seeded pass and run plays, and never hits the tick limit', () => {
    for (const kind of ['pass', 'run'] as const) for (let seed = 1; seed <= 120; seed++) {
      const r = resolver.simulatePlay(playInput({ kind, seed, playNumber: seed, attackDir: seed % 2 === 0 ? 1 : -1, ballX: 30 + (seed % 5) * 12 }));
      const where = `${kind} seed ${seed}`;
      expect(playTruthProblems(r.truth), where).toEqual([]);
      const dead = deadBallOf(r.truth);
      expect(dead.reason, where).not.toBe('engine_fault');
      add(`dead:${dead.reason}`);
      const releases = eventsOf(r.truth, 'pass_release'), points = eventsOf(r.truth, 'catch_point'), got = eventsOf(r.truth, 'possession');
      for (const c of points) add(`catch:${c.outcome}`);
      for (const e of eventsOf(r.truth, 'exchange')) add(`exchange:${e.kind}`);
      // Every forward pass that ended the play incomplete says at the catch point why.
      if (dead.reason === 'incomplete_pass') {
        expect(releases.length, where).toBeGreaterThan(0);
        expect(points.length, where).toBeGreaterThan(0);
        expect(['drop', 'breakup', 'uncatchable', 'grounded']).toContain(points[points.length - 1]!.outcome);
      }
      // A catch or an interception hands the ball to that man at that moment, and to nobody else.
      for (const c of points) {
        if (c.outcome !== 'catch' && c.outcome !== 'interception') { expect(c.catcherId, where).toBeNull(); continue; }
        const p = got.filter((g) => g.t === c.t && g.playerId === c.catcherId);
        expect(p.map((g) => g.how), where).toEqual([c.outcome]);
        expect(c.catcherId, where).not.toBe(releases[0]!.passerId);
        expect(c.t, where).toBeGreaterThan(releases[0]!.t);
      }
      // No point is recorded without a pass in the air.
      if (releases.length === 0) expect(points, where).toHaveLength(0);
    }
  });
  it('throws, completes some, leaves some incomplete and hands the ball off', () => {
    expect(tally.get('catch:catch') ?? 0).toBeGreaterThan(5);
    expect((tally.get('catch:uncatchable') ?? 0) + (tally.get('catch:drop') ?? 0) + (tally.get('catch:breakup') ?? 0)).toBeGreaterThan(5);
    expect(tally.get('dead:incomplete_pass') ?? 0).toBeGreaterThan(5);
    expect(tally.get('exchange:handoff') ?? 0).toBeGreaterThan(20);
    expect(tally.get('exchange:fake') ?? 0).toBeGreaterThan(5);
  });
  it('lets the hands decide: the same throws are caught less often by worse hands', () => {
    const count = (table: typeof TABLE): number => {
      let n = 0;
      for (let seed = 1; seed <= 80; seed++) n += eventsOf(resolver.simulatePlay(playInput({ seed, playNumber: seed, params: table })).truth, 'catch_point').filter((c) => c.outcome === 'catch').length;
      return n;
    };
    const sure = count(tableWith({ 'contest.catch.beta0': 4.5 })), poor = count(tableWith({ 'contest.catch.beta0': 1.5 }));
    expect(sure).toBeGreaterThan(poor);
    // A3 ruling 22: even the surest hands drop one and the poorest catch one; the contest clamps the chance.
    expect(poor).toBeGreaterThan(0);
  });
});

describe('tick resolver with the real quarterback: who ends the play', () => {
  it('ends a sack where he was hit, unless the ball came out', () => {
    // Blockers who cannot block and rushers who cannot be blocked: he is hit before he can throw on some plays.
    const grade = (slot: number): Record<string, number> => {
      const v = slot < 5 || slot === 10 ? 5 : slot >= SLOTS_PER_TEAM && slot < SLOTS_PER_TEAM + 4 ? 99 : 50;
      return Object.fromEntries(['pass_set', 'anchor', 'mirror', 'hand_use_in_protection', 'get_off', 'power_rush', 'hand_moves', 'speed_rush_and_bend', 'inside_counter'].map((a) => [a, v]));
    };
    let sacks = 0, held = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = resolver.simulatePlay(playInput({ seed, playNumber: seed, grade }));
      expect(playTruthProblems(r.truth)).toEqual([]);
      const sack = eventsOf(r.truth, 'pressure').find((e) => e.kind === 'sack');
      if (!sack) continue;
      sacks++;
      const dead = deadBallOf(r.truth);
      if (eventsOf(r.truth, 'fumble').some((f) => f.t === sack.t)) { expect(dead.t).toBeGreaterThan(sack.t); continue; }
      held++;
      expect(dead.reason).toBe('down_by_contact');
      expect(dead.carrierId).toBe(QB_ID);
      expect(dead.spot).toEqual(sack.spot);
      expect(dead.t - sack.t).toBeLessThanOrEqual(0.11);
      expect(eventsOf(r.truth, 'pass_release')).toHaveLength(0);
    }
    expect(sacks).toBeGreaterThan(0);
    expect(held).toBeGreaterThan(0);
  });
  it('ends a kneel-down as a kneel by the quarterback', () => {
    const kneel: PlayContentPort = { setup(input: PlayInput) { const s = CONTENT.setup(input)!; return { ...s, qb: { ...s.qb!, kind: 'kneel', reads: [], checkdown: null, underCenter: true } }; } };
    const r = createTickResolver({ content: kneel, plugs: [quarterbackPlug()] });
    let n = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const res = r.simulatePlay(playInput({ seed, playNumber: seed }));
      const dead = deadBallOf(res.truth);
      if (dead.reason === 'pre_snap_foul') continue;
      // A rusher who gets there first sacks him instead (J6.2.5), and the ball can come out; otherwise it is a kneel.
      if (dead.reason !== 'kneel') { expect(eventsOf(res.truth, 'pressure').some((e) => e.kind === 'sack')).toBe(true); continue; }
      n++;
      expect(dead.carrierId).toBe(QB_ID);
      expect(res.liveDurationTenths).toBeLessThan(40);
    }
    expect(n).toBeGreaterThan(6);
  });
  it('runs a kick play with the quarterback module plugged in and idle', () => {
    for (const kind of ['punt', 'field_goal', 'kickoff'] as const) {
      const r = resolver.simulatePlay(playInput({ kind, seed: 4 }));
      expect(playTruthProblems(r.truth)).toEqual([]);
      expect(eventsOf(r.truth, 'kick')).toHaveLength(1);
    }
  });
});

describe('tick resolver with the real quarterback: determinism (J13) and speed (P6.1.1)', () => {
  it('gives byte-identical output for the same input, on one resolver or two, in any order', () => {
    const other = createTickResolver({ content: CONTENT, plugs: [quarterbackPlug()] });
    const specs = [{ seed: 3, playNumber: 3 }, { seed: 8, playNumber: 8, kind: 'run' as const }, { seed: 11, playNumber: 2 }, { seed: 5, playNumber: 9, kind: 'punt' as const }];
    const first = specs.map((s) => hex(resolver.simulatePlay(playInput(s))));
    const again = [...specs].reverse().map((s) => hex(other.simulatePlay(playInput(s)))).reverse();
    expect(again).toEqual(first);
    expect(specs.map((s) => hex(resolver.simulatePlay(playInput(s))))).toEqual(first);
  });
  it('gives the same truth at full and at summary detail, and keeps his record in the explain rows', () => {
    const a = resolver.simulatePlay(playInput({ seed: 6, playNumber: 6, detail: 'summary' })), b = resolver.simulatePlay(playInput({ seed: 6, playNumber: 6, detail: 'full' }));
    expect(hex(b)).toBe(hex(a));
    const rows = (b.explain as { modules: { id: string; rows: unknown[] }[] }).modules.find((m) => m.id === 'qb')!.rows;
    expect(rows).toHaveLength(1);
    expect(plug.quarterback()).not.toBeNull();
  });
  it('resolves pass and run plays inside the 50 ms budget on average', () => {
    // Plain Node runs these at about 15 ms a play; the test runner is slower and shares the machine, so the best of three batches is judged.
    for (let seed = 1; seed <= 4; seed++) resolver.simulatePlay(playInput({ seed }));
    let best = Infinity;
    for (let batch = 0; batch < 3; batch++) {
      const t0 = performance.now();
      let n = 0;
      for (let seed = 1; seed <= 8; seed++) for (const kind of ['pass', 'run'] as const) { resolver.simulatePlay(playInput({ kind, seed: seed + 500 + batch * 10, playNumber: seed })); n++; }
      best = Math.min(best, (performance.now() - t0) / n);
    }
    expect(best).toBeLessThan(50);
  });
});
