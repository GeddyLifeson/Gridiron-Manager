// The Decide stage (J4.4.1) and the behavior catalogue (J4.2.1): rule order, the debounce, universal
// events, the whistle, and the fallback to a behavior's default. Also the J4.4.1 acceptance: a
// player's decision reads only his own perceived view, so the order players are evaluated in cannot matter.
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, MOVE_MODES, type Assignment } from '@gm/schema';
import { UNIVERSAL_EVENTS, VOCABULARY, attentionOf, createFootballLang } from '../../src/lang/index.ts';
import { ALWAYS, K, act, assignment, compiled, test, viewOf, when, world, type World } from './world.ts';

const pt = (px: number, py: number, kind: 'through' | 'cut' | 'settle' = 'through') => ({ px, py, kind, landmark: null });
const EV = (c: { eventBase: number }, name: (typeof UNIVERSAL_EVENTS)[number]) => c.eventBase + UNIVERSAL_EVENTS.indexOf(name);

describe('behavior catalogue (J4.2.1)', () => {
  it('a zero-rule assignment of every behavior runs a whole play: stance, snap, pass, catch, fumble, turnover, whistle', () => {
    for (const type of BEHAVIORS) {
      for (const slot of [3, 14]) {
        const c = compiled(assignment({ behavior: { type, params: {}, path: [pt(5, 2, 'cut'), pt(9, 6, 'settle')] } }));
        const w = world({ t: -2, self: [0, 2], kind: 'deadPreSnap', ball: [0, 0], seen: { 0: [-5, 0], 5: [-5, 1], 12: [1, 2], 16: [8, 3] }, rn: { 5: 1 } });
        const v = viewOf(w, slot);
        const script: Partial<World>[] = [
          {}, { t: 0, kind: 'snapInFlight' }, { t: 0.5, kind: 'held', carrier: 0 }, { t: 1.5, kind: 'passInFlight', carrier: -1, ball: [2, 2, 15, 3] },
          { t: 2, kind: 'held', carrier: 5 }, { t: 2.5, kind: 'loose', carrier: -1 }, { t: 3, kind: 'held', carrier: 16 }, { t: 4, kind: 'dead' }, { t: 4.1 },
        ];
        for (const step of script) {
          Object.assign(w, step);
          const o = c.decide(slot, v);
          expect(BEHAVIORS).toContain(o.behavior);
          expect(MOVE_MODES).toContain(o.intent.moveMode);
          expect(o.intent.effort).toBeGreaterThanOrEqual(0);
          expect(o.intent.effort).toBeLessThanOrEqual(1);
          expect(o.intent.target === null || (Number.isFinite(o.intent.target.px) && Number.isFinite(o.intent.target.py))).toBe(true);
          expect(o.behaviorState).toBeGreaterThanOrEqual(0);
          expect(o.behaviorState).toBeLessThan(VOCABULARY.behaviors.find((b) => b.name === o.behavior)!.states.length);
        }
        // After the whistle every behavior has stopped.
        expect(c.decide(slot, v).intent.effort).toBe(0);
      }
    }
  });

  it('a route with no rules reports release, stem, break and post-break as the path is run', () => {
    const c = compiled(assignment({ behavior: { type: 'route', params: {}, path: [pt(5, 0, 'cut'), pt(5, 8)] } }));
    const w = world({ t: 0.1, self: [0, 0] }), v = viewOf(w, 3);
    const states: number[] = [];
    for (const [t, px, py] of [[0.1, 0, 0], [1, 3, 0], [1.5, 5, 0.1], [2, 5, 3], [2.5, 5, 5]] as const) { w.t = t; w.self = [px, py]; states.push(c.decide(3, v).behaviorState); }
    expect(states).toEqual([0, 1, 2, 3, 3]);
  });

  it('before the snap a player holds his stance, or runs his drawn motion', () => {
    const still = compiled(assignment()).decide(3, viewOf(world({ t: -3, self: [-1, 8], kind: 'deadPreSnap' }), 3));
    expect(still.intent.moveMode).toBe('stance');
    expect(still.intent.target).toEqual({ px: -1, py: 8 });
    const moving = compiled(assignment({ preSnap: { motion: [pt(-1, 2), pt(-1, -6, 'settle')] } }));
    const w = world({ t: -3, self: [-1, 8], kind: 'deadPreSnap' }), v = viewOf(w, 3);
    expect(moving.decide(3, v).intent.target).toEqual({ px: -1, py: 2 });
    w.self = [-1, 2.2];
    const o = moving.decide(3, v);
    expect(o.intent.target).toEqual({ px: -1, py: -6 });
    expect(o.intent.arrival).toBe('arrive');
  });
});

describe('decide stage (J4.4.1)', () => {
  it('first match wins when two rules become true on the same tick, and the other does not fire later', () => {
    const c = compiled(assignment({ rules: [when(test('timeGt', { s: 1 }), [act('call', { name: 'first' })]), when(test('timeGt', { s: 1 }), [act('call', { name: 'second' })])] }));
    const w = world({ t: 0.5 }), v = viewOf(w, 11);
    expect(c.decide(11, v).firedRule).toBe(-1);
    w.t = 1.2;
    const o = c.decide(11, v);
    expect(o.firedRule).toBe(0);
    expect(o.calls).toEqual(['first']);
    w.t = 1.3;
    expect(c.decide(11, v).firedRule).toBe(-1);
  });

  it('a trigger fires on the tick its condition becomes true, once, and the action persists', () => {
    const c = compiled(assignment({ rules: [when(test('ballThrown'), [act('dropTo', { px: 9, py: 9 })])] }));
    const w = world({ t: 1 }), v = viewOf(w, 11);
    expect(c.decide(11, v).firedRule).toBe(-1);
    w.kind = 'passInFlight';
    expect(c.decide(11, v).firedRule).toBe(0);
    const later = c.decide(11, v);
    expect(later.firedRule).toBe(-1);
    expect(later.intent.target).toEqual({ px: 9, py: 9 });
  });

  it('hysteresis: after a flip, the reverse must hold for the set number of ticks before the rule can fire again', () => {
    const c = compiled(assignment({ rules: [when(test('cushion', { target: 'slot:1', lt: 5 }), [act('call', { name: 'tight' })])] }));
    const w = world({ self: [10, 0], seen: { 1: [4, 0] } }), v = viewOf(w, 11);
    const tick = (targetPx: number) => { w.seen[1] = [targetPx, 0]; return c.decide(11, v).firedRule; };
    expect(tick(4)).toBe(-1); // cushion 6
    expect(tick(6)).toBe(0); // cushion 4: fires at once
    // Flicker at the threshold: one tick false, then true again. The flip back never held, so nothing fires.
    expect(tick(4)).toBe(-1);
    expect(tick(6)).toBe(-1);
    // False for the full period, then true for the full period: fires again.
    for (let i = 0; i < K.hysteresisTicks; i++) expect(tick(4)).toBe(-1);
    for (let i = 0; i < K.hysteresisTicks - 1; i++) expect(tick(6)).toBe(-1);
    expect(tick(6)).toBe(0);
  });

  it('a guard that is false on the trigger tick stops the rule', () => {
    const rule = (lt: number) => assignment({ rules: [when(ALWAYS, [act('call', { name: 'go' })], test('cushion', { target: 'slot:1', lt }))] });
    const w = world({ self: [10, 0], seen: { 1: [4, 0] } });
    expect(compiled(rule(8)).decide(11, viewOf(w, 11)).firedRule).toBe(0);
    expect(compiled(rule(3)).decide(11, viewOf(w, 11)).firedRule).toBe(-1);
    // An unknown guard is not true.
    expect(compiled(rule(8)).decide(11, viewOf(world({ self: [10, 0] }), 11)).firedRule).toBe(-1);
  });

  it('several actions in one rule all run: the call is made and the movement goes on', () => {
    const c = compiled(assignment({ rules: [when(ALWAYS, [act('call', { name: 'seam' }), act('dropTo', { px: 12, py: 4 })])] }));
    const o = c.decide(11, viewOf(world(), 11));
    expect(o.calls).toEqual(['seam']);
    expect(o.intent.target).toEqual({ px: 12, py: 4 });
  });

  it('universal events answer from the behavior table when no rule speaks', () => {
    const c = compiled(assignment({ behavior: { type: 'zoneDrop', params: {}, path: [pt(10, 5, 'settle')] } }));
    const w = world({ t: 1, self: [8, 5], ball: [-5, 0] }), v = viewOf(w, 14);
    expect(c.decide(14, v).firedRule).toBe(-1);
    Object.assign(w, { kind: 'passInFlight', landing: [15, 0] });
    const thrown = c.decide(14, v);
    expect(thrown.firedRule).toBe(EV(c, 'ballThrown'));
    expect(thrown.intent.target).toEqual({ px: 15, py: 0 });
    expect(thrown.behaviorState).toBe(3);
    Object.assign(w, { kind: 'held', carrier: 5, seen: { 5: [15, 0] } });
    expect(c.decide(14, v).firedRule).toBe(EV(c, 'ballCaught'));
    Object.assign(w, { kind: 'loose', carrier: -1, ball: [14, 1] });
    expect(c.decide(14, v).firedRule).toBe(EV(c, 'fumble'));
    Object.assign(w, { kind: 'held', carrier: 16, seen: { 16: [14, 1] } });
    const turnover = c.decide(14, v);
    expect(turnover.firedRule).toBe(EV(c, 'changeOfPossession'));
    expect(turnover.behavior).toBe('returnBlock');
  });

  it('a rule beats the behavior table on the same tick', () => {
    const c = compiled(assignment({ behavior: { type: 'zoneDrop', params: {}, path: [] }, rules: [when(test('ballThrown'), [act('stop')])] }));
    const w = world({ t: 1 }), v = viewOf(w, 14);
    c.decide(14, v);
    w.kind = 'passInFlight';
    const o = c.decide(14, v);
    expect(o.firedRule).toBe(0);
    expect(o.intent.effort).toBe(0);
  });

  it('the whistle is checked first and ends every action; rules do not fire after it', () => {
    const c = compiled(assignment({ rules: [when(test('timeGt', { s: 2 }), [act('call', { name: 'late' })])] }));
    const w = world({ t: 1 }), v = viewOf(w, 11);
    c.decide(11, v);
    Object.assign(w, { t: 3, kind: 'dead' });
    const o = c.decide(11, v);
    expect(o.firedRule).toBe(EV(c, 'whistle'));
    expect(o.calls).toEqual([]);
    expect(o.intent.effort).toBe(0);
    expect(c.decide(11, v).firedRule).toBe(-1);
  });

  it('a man who believes he has the ball becomes the ball carrier (J4.2.2)', () => {
    const c = compiled(assignment({ behavior: { type: 'route', params: {}, path: [pt(8, 4)] } }));
    const w = world({ t: 2, self: [8, 4] }), v = viewOf(w, 3);
    expect(c.decide(3, v).behavior).toBe('route');
    w.carrier = 3;
    const o = c.decide(3, v);
    expect(o.behavior).toBe('ballCarrier');
    expect(o.intent.target).toEqual({ px: 8 + K.extend, py: 4 });
  });

  it('an action fired before the snap starts at the snap; calls made before the snap go out at once', () => {
    const c = compiled(assignment({ rules: [when(test('formationIs', { is: 'trips' }), [act('call', { name: 'trips' }), act('dropTo', { px: 12, py: 4 })])] }));
    const w = world({ t: -2, self: [5, 0], kind: 'deadPreSnap', seen: { 1: [0, 20], 2: [0, 14], 3: [0, 9] }, rn: { 1: 1, 2: 2, 3: 3 } }), v = viewOf(w, 14);
    const pre = c.decide(14, v);
    expect(pre.calls).toEqual(['trips']);
    expect(pre.intent.moveMode).toBe('stance');
    Object.assign(w, { t: 0.05, kind: 'held' });
    expect(c.decide(14, v).intent.target).toEqual({ px: 12, py: 4 });
  });

  it('a new play resets everything: the compiled assignment is reused from snap to snap', () => {
    const c = compiled(assignment({ rules: [when(test('timeGt', { s: 1 }), [act('switchBehavior', { to: 'pursue' })])] }));
    const w = world({ t: 2 }), v = viewOf(w, 11);
    expect(c.decide(11, v).behavior).toBe('pursue');
    w.t = -3; w.kind = 'deadPreSnap';
    const o = c.decide(11, v);
    expect(o.behavior).toBe('route');
    expect(o.firedRule).toBe(-1);
  });

  it('decide returns the same objects every tick: nothing is allocated per decision (P6.3.1)', () => {
    const c = compiled(assignment({ rules: [when(test('ballThrown'), [act('breakOnBall')])] }));
    const w = world(), v = viewOf(w, 11);
    const a = c.decide(11, v), b = c.decide(11, v);
    expect(b).toBe(a);
    expect(b.intent).toBe(a.intent);
    expect(b.calls).toBe(a.calls);
  });

  it('evaluating players in a shuffled order changes nothing (J4.4.1 acceptance)', () => {
    // Twenty-two players, each with rules, over a scripted play. Every view is built from the same
    // snapshot, as the Perceive stage does. The run is repeated with the Decide order reversed and interleaved.
    const plays: Assignment[] = [];
    for (let s = 0; s < 22; s++) {
      plays.push(assignment({
        role: `P${s}`,
        behavior: { type: s < 11 ? (s < 5 ? 'passSet' : 'route') : s < 15 ? 'passRush' : 'zoneDrop', params: { qb: 'slot:0', man: `slot:${(s + 11) % 22}` }, path: [pt(s < 11 ? 6 : 10, s - 5, 'cut'), pt(12, s - 8)] },
        rules: [
          when(test('ballThrown'), [act('breakOnBall')]),
          when(test('cushion', { target: 'man', lt: 4 }), [act('call', { name: `c${s}` }), act('trail', { target: 'man' })]),
          when(test('read', { kind: 'run' }), [act('pursue', { angle: 'insideOut' })]),
        ],
      }));
    }
    const run = (order: number[]): string => {
      const cs = plays.map((p) => compiled(p));
      const pos: [number, number][] = plays.map((_p, s) => [s < 11 ? -1 : 3, (s % 11) * 2 - 10]);
      const log: string[] = [];
      for (let tick = 0; tick < 40; tick++) {
        const t = tick * 0.1;
        const snapshot = pos.map((p) => [p[0], p[1]] as [number, number]);
        const outs: string[] = new Array<string>(22).fill('');
        const next: [number, number][] = snapshot.map((p) => [p[0], p[1]]);
        for (const s of order) {
          const seen: World['seen'] = {};
          snapshot.forEach((p, i) => { if (i !== s) seen[i] = [p[0], p[1]]; });
          const w = world({ t, self: snapshot[s]!, seen, kind: tick > 25 ? 'passInFlight' : 'held', carrier: tick > 25 ? -1 : 0, ball: [-5, 0, 10, 2], read: tick > 12 ? 'pass' : 'unknown' });
          const o = cs[s]!.decide(s, viewOf(w, s));
          outs[s] = `${o.behavior}/${o.behaviorState}/${o.firedRule}/${o.calls.join(',')}/${o.intent.target?.px ?? 'n'},${o.intent.target?.py ?? 'n'}/${o.intent.moveMode}`;
          // Each player steps a little toward his target; the step is applied after everyone has decided.
          const tx = o.intent.target?.px ?? snapshot[s]![0], ty = o.intent.target?.py ?? snapshot[s]![1];
          next[s] = [snapshot[s]![0] + Math.max(-0.5, Math.min(0.5, tx - snapshot[s]![0])), snapshot[s]![1] + Math.max(-0.5, Math.min(0.5, ty - snapshot[s]![1]))];
        }
        next.forEach((p, i) => { pos[i] = p; });
        log.push(outs.join('|'));
      }
      return log.join('\n');
    };
    const inOrder = Array.from({ length: 22 }, (_x, i) => i);
    const reference = run(inOrder);
    expect(run([...inOrder].reverse())).toBe(reference);
    expect(run([...inOrder].sort((a, b) => ((a * 7) % 22) - ((b * 7) % 22)))).toBe(reference);
    expect(reference).toContain('c'); // rules did fire in the run
  });
});

describe('attention set (J4.1.2, J3.1.2)', () => {
  it('lists the keys first, then what the conditions and actions read, without repeats', () => {
    const a = assignment({
      behavior: { type: 'manCover', params: { man: '#1' }, path: [] }, keys: ['#2', 'qb'],
      rules: [
        when(test('release', { target: '#2', is: 'vertical' }), [act('carry', { target: '#2', toDepth: 12 })]),
        when({ op: 'all', of: [test('ballThrown'), { op: 'not', of: test('cushion', { target: '#3', lt: 5 }) }] }, [act('breakOnBall')], test('boxCount', { cmp: 'ge', n: 7 })),
      ],
    });
    expect(attentionOf(a)).toEqual(['#2', 'qb', 'ball', '#3', 'defense', '#1']);
    expect(createFootballLang().compile(a).compiled?.attention).toEqual(['#2', 'qb', 'ball', '#3', 'defense', '#1']);
  });
});
