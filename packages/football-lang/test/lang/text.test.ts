// The readable form (J4.1.1 acceptance): "The readable form round-trips to the stored form without loss."
import { describe, expect, it } from 'vitest';
import type { Action, Assignment, Condition } from '@gm/schema';
import { VOCABULARY, parseAssignment, printAssignment, validateAssignment } from '../../src/lang/index.ts';
import { rng } from '../legality/fixtures.ts';
import { act, assignment, test, when } from './world.ts';

const sam: Assignment = assignment({
  role: 'Sam',
  behavior: { type: 'zoneDrop', params: { zoneHalfWidth: 4, man: '#2' }, path: [{ px: 10, py: 6.5, kind: 'settle', landmark: 'curl' }] },
  preSnap: { align: { px: 4, py: 7, rule: 'apex' }, onLine: false, stance: 'two-point', motion: [] },
  keys: ['#2', 'qb'], gaze: 'key', technique: { coverage: 'sky' }, conceptId: 'cover3.curlFlat', teachingLoad: 1.5, calls: ['seam'],
  rules: [
    when(test('read', { kind: 'run', dir: 'toMe' }), [act('fit', { gap: 'force', shoulder: 'outside' })], null, 'when read(run) to me -> fit(force, outside shoulder)'),
    when(test('read', { kind: 'run', dir: 'away' }), [act('pursue', { angle: 'cutback' })]),
    when(test('release', { target: '#2', is: 'flat' }), [act('widen', { yd: 4 })]),
    when(test('release', { target: '#2', is: 'vertical' }), [act('carry', { target: '#2', toDepth: 12 }), act('call', { name: 'seam' })], { op: 'not', of: test('heard', { call: 'switch' }) }),
    when({ op: 'any', of: [test('release', { target: '#3', is: 'flat' }), test('release', { target: 'role:RB', is: 'flat' })] }, [act('continue')]),
    when(test('ballThrown'), [act('breakOnBall')]),
  ],
});

describe('readable form', () => {
  it('reads as coaching sentences', () => {
    const text = printAssignment(sam);
    expect(text).toContain('role: Sam');
    expect(text).toContain('behavior: zoneDrop(zoneHalfWidth=4, man=#2)');
    expect(text).toContain('path: (10, 6.5) settle @curl');
    expect(text).toContain('align: (4, 7) off line stance two-point rule apex');
    expect(text).toContain('keys: #2, qb');
    expect(text).toContain('  when read(kind=run, dir=toMe) -> fit(gap=force, shoulder=outside) // "when read(run) to me -> fit(force, outside shoulder)"');
    expect(text).toContain('  when release(target=#2, is=vertical) if not[heard(call=switch)] -> carry(target=#2, toDepth=12); call(name=seam)');
    expect(text).toContain('  when any[release(target=#3, is=flat), release(target=role:RB, is=flat)] -> continue()');
  });

  it('round-trips the example without loss, and the result is still a valid assignment', () => {
    expect(parseAssignment(printAssignment(sam))).toEqual(sam);
    expect(validateAssignment(parseAssignment(printAssignment(sam)))).toEqual([]);
  });

  it('round-trips awkward values: empty strings, quotes, spaces, words that look like numbers or booleans, negative and tiny numbers', () => {
    const odd = assignment({
      role: 'left guard', gaze: '', conceptId: 'a "quoted" id', teachingLoad: 0,
      behavior: { type: 'route', params: { tag: 'true', n: '42', flag: false, depth: -0.125, note: 'x, y = z; (w) // c', big: 1e21, small: 1.5e-7 }, path: [{ px: -3.25, py: 0, kind: 'through', landmark: 'the numbers' }, { px: 1e-7, py: -12, kind: 'cut', landmark: null }] },
      preSnap: { align: { px: -1, py: -0.5, rule: '' }, onLine: true, stance: '', motion: [{ px: -1, py: 4, kind: 'settle', landmark: null }] },
      keys: ['role:left tackle', '#1:away'], technique: { rushMove: 'rip->swim', passSet: '' }, calls: ['', 'on line', 'rule'],
      rules: [
        when({ op: 'all', of: [] }, [act('call', { name: 'if' })], { op: 'any', of: [{ op: 'not', of: { op: 'all', of: [test('all', {}), test('not', { a: 'b' })] } }] }, 'text with "quotes" and \\ and // and -> and\nnew line'),
        when(test('odd name!', { 'odd key': 'when', 'x=y': '' }), [act('then', {}), act('a;b', { v: true })]),
      ],
    });
    expect(parseAssignment(printAssignment(odd))).toEqual(odd);
  });

  it('round-trips generated assignments built from the whole vocabulary', () => {
    const r = rng(20261126);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
    const value = (type: string, options: readonly string[] | undefined): string | number | boolean =>
      type === 'number' ? Math.round((r() * 40 - 10) * 100) / 100 : type === 'boolean' ? r() < 0.5 : type === 'enum' ? pick(options ?? ['x']) : type === 'entity' ? pick(['man', '#2:left', 'slot:14', 'role:Mike', 'final#3', 'qb']) : type === 'behavior' ? pick(VOCABULARY.behaviors).name : pick(['seam', 'bull', 'sky.weak', 'x-1']);
    const leaf = (): Condition => { const d = pick(VOCABULARY.conditions); return test(d.name, Object.fromEntries(Object.entries(d.args).filter(() => r() < 0.8).map(([k, s]) => [k, value(s.type, s.options)]))); };
    const cond = (depth: number): Condition => {
      const roll = r();
      if (depth === 0 || roll < 0.5) return leaf();
      if (roll < 0.65) return { op: 'not', of: cond(depth - 1) };
      return { op: roll < 0.85 ? 'all' : 'any', of: Array.from({ length: 1 + Math.floor(r() * 3) }, () => cond(depth - 1)) };
    };
    const action = (): Action => { const d = pick(VOCABULARY.actions); return act(d.name, Object.fromEntries(Object.entries(d.args).filter(() => r() < 0.8).map(([k, s]) => [k, value(s.type, s.options)]))); };
    for (let i = 0; i < 300; i++) {
      const a = assignment({
        role: `R${i}`,
        behavior: { type: pick(VOCABULARY.behaviors).name, params: r() < 0.5 ? { man: '#1', playside: pick(['left', 'right']) } : {}, path: Array.from({ length: Math.floor(r() * 4) }, () => ({ px: Math.round(r() * 200) / 10, py: Math.round((r() - 0.5) * 400) / 10, kind: pick(['through', 'cut', 'settle'] as const), landmark: r() < 0.3 ? pick(['hash', 'numbers', 'curl']) : null })) },
        rules: Array.from({ length: Math.floor(r() * 6) }, () => when(cond(3), Array.from({ length: 1 + Math.floor(r() * 3) }, action), r() < 0.3 ? cond(2) : null, r() < 0.5 ? `rule ${i}` : '')),
        keys: r() < 0.5 ? ['#2', 'qb'] : [], technique: r() < 0.5 ? { coverage: 'press', release: 'speed' } : {}, calls: r() < 0.3 ? ['seam', 'switch'] : [],
      });
      expect(parseAssignment(printAssignment(a))).toEqual(a);
    }
  });

  it('a malformed line is reported with its place', () => {
    const text = printAssignment(sam);
    expect(() => parseAssignment(text.replace('-> breakOnBall()', '-> breakOnBall('))).toThrow(/line 17/);
    expect(() => parseAssignment(text.replace('keys: #2, qb', 'keys: #2 qb'))).toThrow(/keys/);
    expect(() => parseAssignment(text.replace('gaze: key\n', ''))).toThrow(/gaze/);
    expect(() => parseAssignment(text.replace('settle @curl', 'wiggle @curl'))).toThrow(/path/);
  });
});
