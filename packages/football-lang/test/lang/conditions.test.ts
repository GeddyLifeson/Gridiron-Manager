// A unit test for every condition in the vocabulary (J4.1.2 acceptance: "each vocabulary entry has a
// unit test"). Each case sets a perceived picture and names the expected value: T, F or U (unknown).
// A last test checks that no condition in the file went without a case.
import { describe, expect, it } from 'vitest';
import { VOCABULARY, bindAssignments } from '../../src/lang/index.ts';
import { K, assignment, test, valueOf, valuesOver, world } from './world.ts';

const covered = new Set<string>();
const cond = (name: string, args: Record<string, string | number | boolean> = {}) => { covered.add(name); return test(name, args); };
const D = 11; // a defender's slot
const O = 3; // an offensive player's slot

describe('conditions: play recognition and receivers', () => {
  it('read: kind and direction come from the play read, unknown until there is one', () => {
    expect(valueOf(cond('read', { kind: 'run' }), world())).toBe('U');
    expect(valueOf(cond('read', { kind: 'run' }), world({ read: 'run' }))).toBe('T');
    expect(valueOf(cond('read', { kind: 'pass' }), world({ read: 'run' }))).toBe('F');
    // The defender stands to the offense's left (+py): a run to the left is to him.
    const left = world({ self: [4, 6], read: 'run', readSide: 'left' });
    expect(valueOf(cond('read', { kind: 'run', dir: 'toMe' }), left)).toBe('T');
    expect(valueOf(cond('read', { kind: 'run', dir: 'away' }), left)).toBe('F');
    expect(valueOf(cond('read', { kind: 'run', dir: 'toMe' }), world({ self: [4, 6], read: 'run' }))).toBe('U');
    // Inside and outside are judged from the believed carrier.
    const carried = world({ self: [4, 6], read: 'run', carrier: 5, seen: { 5: [-3, 2] } });
    expect(valueOf(cond('read', { kind: 'run', dir: 'inside' }), carried)).toBe('T');
    expect(valueOf(cond('read', { kind: 'run', dir: 'outside' }), carried)).toBe('F');
    expect(valueOf(cond('read', { kind: 'run', dir: 'inside' }), world({ self: [4, 6], read: 'run' }))).toBe('U');
  });

  it('release: vertical, in, out, flat, under and blocks', () => {
    const rn = { 1: 2 };
    const at = (px: number, py: number, vx: number, vy: number, t = 1) => world({ t, self: [8, 8], seen: { 1: [px, py, vx, vy] }, rn });
    const r = (is: string) => cond('release', { target: '#2', is });
    expect(valueOf(r('vertical'), at(K.verticalDepth + 1, 10, 6, 0))).toBe('T');
    expect(valueOf(r('vertical'), at(K.verticalDepth - 1, 10, 6, 0))).toBe('F');
    expect(valueOf(r('out'), at(K.flatDepth + 2, 10, 0, K.lateralSpeed + 1))).toBe('T');
    expect(valueOf(r('in'), at(K.flatDepth + 2, 10, 0, -(K.lateralSpeed + 1)))).toBe('T');
    expect(valueOf(r('flat'), at(K.flatDepth - 1, 10, 0, K.lateralSpeed + 1))).toBe('T');
    expect(valueOf(r('under'), at(K.flatDepth - 1, 10, 0, -(K.lateralSpeed + 1)))).toBe('T');
    expect(valueOf(r('blocks'), at(0, 10, 0, 0, K.releaseDecideS + 0.1))).toBe('T');
    expect(valueOf(r('blocks'), at(0, 10, 0, 0, K.releaseDecideS / 2))).toBe('F');
    expect(valueOf(r('vertical'), world({ self: [8, 8] }))).toBe('U');
  });

  it('leverage: inside, outside, over and under a man', () => {
    const w = (selfPx: number, selfPy: number) => world({ self: [selfPx, selfPy], seen: { 1: [5, 10] } });
    const l = (is: string) => cond('leverage', { target: 'slot:1', is });
    expect(valueOf(l('inside'), w(7, 10 - K.leverageMargin - 0.2))).toBe('T');
    expect(valueOf(l('inside'), w(7, 10))).toBe('F');
    expect(valueOf(l('outside'), w(7, 10 + K.leverageMargin + 0.2))).toBe('T');
    expect(valueOf(l('over'), w(5 + K.leverageMargin + 0.2, 10))).toBe('T');
    expect(valueOf(l('under'), w(5 - K.leverageMargin - 0.2, 10))).toBe('T');
    expect(valueOf(l('over'), world({ self: [7, 10] }))).toBe('U');
  });

  it('cushion: the depth between him and the man against a number', () => {
    const w = world({ self: [7, 10], seen: { 1: [3, 10] } });
    expect(valueOf(cond('cushion', { target: 'slot:1', lt: 5 }), w)).toBe('T');
    expect(valueOf(cond('cushion', { target: 'slot:1', lt: 3 }), w)).toBe('F');
    expect(valueOf(cond('cushion', { target: 'slot:2', lt: 3 }), w)).toBe('U');
  });

  it('crossesFace: true once the man has changed sides of him', () => {
    const w = (py: number) => world({ self: [5, 5], seen: { 1: [4, py] } });
    expect(valuesOver(cond('crossesFace', { target: 'slot:1' }), [w(8), w(6), w(4), w(3)])).toBe('FFTT');
    expect(valueOf(cond('crossesFace', { target: 'slot:1' }), world())).toBe('U');
  });

  it('inZone and threatInZone: the zone is the end of his drop', () => {
    const a = assignment({ behavior: { type: 'zoneDrop', params: {}, path: [{ px: 10, py: 8, kind: 'settle', landmark: null }] } });
    const inside = world({ self: [10, 8], seen: { 1: [10 + K.zoneHalfDepth - 1, 8] }, rn: { 1: 1 } });
    const outside = world({ self: [10, 8], seen: { 1: [10 + K.zoneHalfDepth + 1, 8] }, rn: { 1: 1 } });
    expect(valueOf(cond('inZone', { target: 'slot:1' }), inside, D, a)).toBe('T');
    expect(valueOf(cond('inZone', { target: 'slot:1' }), outside, D, a)).toBe('F');
    expect(valueOf(cond('inZone', { target: 'slot:2' }), inside, D, a)).toBe('U');
    expect(valueOf(cond('threatInZone'), inside, D, a)).toBe('T');
    expect(valueOf(cond('threatInZone'), outside, D, a)).toBe('F');
    // A man in the zone who is not a receiver is no threat.
    expect(valueOf(cond('threatInZone'), { ...inside, rn: {} }, D, a)).toBe('F');
  });

  it('receiversToSide: counts the receivers he sees on a side', () => {
    const w = world({ self: [-5, 0], seen: { 1: [0, 20], 2: [0, 12], 4: [0, -18] }, rn: { 1: 1, 2: 2, 4: 1 } });
    expect(valueOf(cond('receiversToSide', { side: 'left', cmp: 'eq', n: 2 }), w, O)).toBe('T');
    expect(valueOf(cond('receiversToSide', { side: 'right', cmp: 'ge', n: 2 }), w, O)).toBe('F');
    expect(valueOf(cond('receiversToSide', { side: 'right', cmp: 'lt', n: 2 }), w, O)).toBe('T');
  });
});

describe('conditions: counting the defense and the front', () => {
  const box = { 11: [1, -2], 12: [1, 0], 13: [1, 2], 14: [4, 1], 15: [12, 0], 16: [5, K.boxHalfWidth + 6] } as Record<number, [number, number]>;

  it('boxCount: defenders inside the box', () => {
    const w = world({ self: [-5, 0], seen: box });
    expect(valueOf(cond('boxCount', { cmp: 'eq', n: 4 }), w, O)).toBe('T');
    expect(valueOf(cond('boxCount', { cmp: 'gt', n: 4 }), w, O)).toBe('F');
    expect(valueOf(cond('boxCount', { cmp: 'le', n: 4 }), w, O)).toBe('T');
  });

  it('rushersVsBlockers: more rushers than blockers to a side', () => {
    const over = world({ self: [-5, 0], seen: { 11: [1, 1], 12: [1, 2], 13: [2, 3], 1: [0, 1], 2: [0, 2] } });
    expect(valueOf(cond('rushersVsBlockers', { side: 'left' }), over, O)).toBe('T');
    expect(valueOf(cond('rushersVsBlockers', { side: 'right' }), over, O)).toBe('F');
  });

  it('safetiesDeep and shell: defenders at safety depth', () => {
    const two = world({ t: -5, self: [-5, 0], seen: { 20: [K.deepDepth + 2, 8], 21: [K.deepDepth + 2, -8], 12: [3, 0] } });
    expect(valueOf(cond('safetiesDeep', { cmp: 'eq', n: 2 }), two, O)).toBe('T');
    expect(valueOf(cond('shell', { is: 'twoHigh' }), two, O)).toBe('T');
    expect(valueOf(cond('shell', { is: 'oneHigh' }), two, O)).toBe('F');
    expect(valueOf(cond('shell', { is: 'zeroHigh' }), world({ t: -5, self: [-5, 0], seen: { 12: [3, 0] } }), O)).toBe('T');
    // The shell is a pre-snap read: after the snap the condition is false.
    expect(valueOf(cond('shell', { is: 'twoHigh' }), { ...two, t: 1 }, O)).toBe('F');
  });

  it('defenderOn: head up, shaded, or in the gap, inside or outside', () => {
    // A lineman on the offense's left (+py): inside is toward the ball (smaller py).
    const w = (offset: number) => world({ self: [0, 3], seen: { 11: [1, 3 + offset] } });
    const mid = (a: number, b: number) => (a + b) / 2;
    expect(valueOf(cond('defenderOn', { where: 'me' }), w(0), O)).toBe('T');
    expect(valueOf(cond('defenderOn', { where: 'shadeInside' }), w(-mid(K.headUp, K.shade)), O)).toBe('T');
    expect(valueOf(cond('defenderOn', { where: 'shadeOutside' }), w(mid(K.headUp, K.shade)), O)).toBe('T');
    expect(valueOf(cond('defenderOn', { where: 'gapInside' }), w(-mid(K.shade, K.gap)), O)).toBe('T');
    expect(valueOf(cond('defenderOn', { where: 'gapOutside' }), w(mid(K.shade, K.gap)), O)).toBe('T');
    expect(valueOf(cond('defenderOn', { where: 'me' }), w(mid(K.shade, K.gap)), O)).toBe('F');
    // A linebacker off the ball is not "on" anyone.
    expect(valueOf(cond('defenderOn', { where: 'me' }), world({ self: [0, 3], seen: { 11: [K.onLineDepth + 2, 3] } }), O)).toBe('F');
  });

  it('firstDownLineman: where the first down lineman to a side stands', () => {
    const w = (offset: number) => world({ self: [0, 3], seen: { 11: [1, 3 + offset], 12: [1, 9] } });
    expect(valueOf(cond('firstDownLineman', { side: 'left', where: 'on' }), w(0), O)).toBe('T');
    expect(valueOf(cond('firstDownLineman', { side: 'left', where: 'outside' }), w(0.8), O)).toBe('T');
    expect(valueOf(cond('firstDownLineman', { side: 'left', where: 'inside' }), w(0.8), O)).toBe('F');
    expect(valueOf(cond('firstDownLineman', { side: 'right', where: 'on' }), world({ self: [0, 3] }), O)).toBe('F');
  });

  it('linebackerWalkedUp: a defender off the line but up close', () => {
    const depth = (K.onLineDepth + K.walkedUpDepth) / 2;
    expect(valueOf(cond('linebackerWalkedUp'), world({ self: [0, 1], seen: { 14: [depth, 1] } }), O)).toBe('T');
    expect(valueOf(cond('linebackerWalkedUp'), world({ self: [0, 1], seen: { 14: [K.walkedUpDepth + 2, 1] } }), O)).toBe('F');
  });

  it('myManDrops and myManStunts: what the assigned rusher does', () => {
    const a = assignment({ behavior: { type: 'passSet', params: { man: 'slot:12' }, path: [] } });
    const w = (vx: number, vy: number) => world({ self: [0, 2], seen: { 12: [1, 3, vx, vy] } });
    expect(valueOf(cond('myManDrops'), w(K.moveSpeed + 1, 0), O, a)).toBe('T');
    expect(valueOf(cond('myManDrops'), w(-3, 0), O, a)).toBe('F');
    expect(valueOf(cond('myManStunts', { dir: 'in' }), w(-1, -(K.moveSpeed + 1)), O, a)).toBe('T');
    expect(valueOf(cond('myManStunts', { dir: 'out' }), w(-1, K.moveSpeed + 1), O, a)).toBe('T');
    expect(valueOf(cond('myManStunts', { dir: 'out' }), w(-1, -(K.moveSpeed + 1)), O, a)).toBe('F');
    expect(valueOf(cond('myManDrops'), world({ self: [0, 2] }), O, a)).toBe('U');
  });

  it('doubleTeamOnMe and blockTypeOnMe: what the blockers do to a defender', () => {
    const two = world({ self: [1, 2], seen: { 3: [0.2, 1.6], 4: [0.2, 2.6] } });
    expect(valueOf(cond('doubleTeamOnMe'), two)).toBe('T');
    expect(valueOf(cond('doubleTeamOnMe'), world({ self: [1, 2], seen: { 3: [0.2, 1.6] } }))).toBe('F');
    const b = (vx: number, vy: number) => world({ self: [1, 2], seen: { 3: [0, 2, vx, vy] } });
    const type = (is: string) => cond('blockTypeOnMe', { is });
    expect(valueOf(type('base'), b(K.moveSpeed + 1, 0))).toBe('T');
    expect(valueOf(type('passSet'), b(-K.moveSpeed, 0))).toBe('T');
    // Blocker inside him working to his outside shoulder is a reach; from outside working in is a down block.
    expect(valueOf(type('reach'), world({ self: [1, 2], seen: { 3: [0, 1.5, 1, K.moveSpeed + 1] } }))).toBe('T');
    expect(valueOf(type('down'), world({ self: [1, 2], seen: { 3: [0, 2.8, 1, -(K.moveSpeed + 1)] } }))).toBe('T');
    expect(valueOf(type('pullAway'), world({ self: [1, 2], seen: { 3: [0, 1.5, 0, -(K.moveSpeed + 1)] } }))).toBe('T');
    expect(valueOf(type('base'), world({ self: [1, 2] }))).toBe('F');
  });
});

describe('conditions: ball, quarterback, time and position', () => {
  it('ballThrown, ballOut and ballKicked follow the ball state he perceives', () => {
    expect(valueOf(cond('ballThrown'), world({ kind: 'passInFlight' }))).toBe('T');
    expect(valueOf(cond('ballThrown'), world({ kind: 'held' }))).toBe('F');
    expect(valueOf(cond('ballThrown'), world({ kind: 'unknown' }))).toBe('U');
    expect(valueOf(cond('ballOut'), world({ kind: 'loose' }))).toBe('T');
    expect(valueOf(cond('ballOut'), world({ kind: 'held' }))).toBe('F');
    expect(valueOf(cond('ballKicked'), world({ kind: 'kickInFlight' }))).toBe('T');
    expect(valueOf(cond('ballKicked'), world({ kind: 'unknown' }))).toBe('U');
  });

  it('ballThrownToMyArea: the landing estimate, or the line of the ball, near him', () => {
    const c = cond('ballThrownToMyArea');
    expect(valueOf(c, world({ kind: 'passInFlight', self: [10, 5], landing: [11, 6] }))).toBe('T');
    expect(valueOf(c, world({ kind: 'passInFlight', self: [10, 5], landing: [11, 6 + K.ballArea + 3] }))).toBe('F');
    expect(valueOf(c, world({ kind: 'passInFlight', self: [10, 0], ball: [-5, 0, 20, 0] }))).toBe('T');
    expect(valueOf(c, world({ kind: 'passInFlight', self: [10, 0], ball: [-5, 0, 0, 20] }))).toBe('F');
    expect(valueOf(c, world({ kind: 'passInFlight', self: [10, 0] }))).toBe('U');
    expect(valueOf(c, world({ kind: 'held', self: [10, 5], landing: [11, 6] }))).toBe('F');
  });

  it('ballCarrierDeclared: a held ball with a known carrier on a run or past the line', () => {
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5, seen: { 5: [2, 0] } }))).toBe('T');
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5, seen: { 5: [-4, 0] } }))).toBe('F');
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5, seen: { 5: [-4, 0] }, read: 'run' }))).toBe('T');
    // A quarterback behind the line who is not coming downhill has not declared a run, whatever the read: a fake or a rollout.
    const qbBound = assignment({ behavior: { type: 'zoneDrop', params: { qb: 'slot:5' }, path: [] } });
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5, seen: { 5: [-5, 4, 0, 5] }, read: 'run' }), D, qbBound)).toBe('F');
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5, seen: { 5: [-2, 1, 5, 1] }, read: 'run' }), D, qbBound)).toBe('T');
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 6, seen: { 6: [-4, 0], 5: [-5, 0] }, read: 'run' }), D, qbBound)).toBe('T');
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5, seen: { 5: [1, 4, 0, 5] } }), D, qbBound)).toBe('T');
    expect(valueOf(cond('ballCarrierDeclared'), world({ carrier: 5 }))).toBe('U');
    expect(valueOf(cond('ballCarrierDeclared'), world())).toBe('F');
  });

  it('timeGt: the snap clock against a number', () => {
    expect(valueOf(cond('timeGt', { s: 2 }), world({ t: 2.5 }))).toBe('T');
    expect(valueOf(cond('timeGt', { s: 2 }), world({ t: 1.5 }))).toBe('F');
  });

  it('stemComplete and atLandmark follow his own path', () => {
    const a = assignment({ behavior: { type: 'route', params: {}, path: [{ px: 5, py: 0, kind: 'cut', landmark: null }, { px: 5, py: 6, kind: 'settle', landmark: null }] } });
    const at = (px: number, py: number) => world({ self: [px, py] });
    expect(valuesOver(cond('stemComplete'), [at(0, 0), at(3, 0), at(5, 0), at(5, 3)], O, a)).toBe('FFFT');
    expect(valuesOver(cond('atLandmark'), [at(0, 0), at(5, 0), at(5, 3), at(5, 6), at(5, 6)], O, a)).toBe('FFFFT');
  });

  it('blockPointReached: at the block point of a kick rush', () => {
    const a = assignment({ behavior: { type: 'rushKick', params: { blockPx: -7, blockPy: 0 }, path: [] } });
    expect(valueOf(cond('blockPointReached'), world({ self: [-6.5, 0] }), D, a)).toBe('T');
    expect(valueOf(cond('blockPointReached'), world({ self: [-2, 0] }), D, a)).toBe('F');
    expect(valueOf(cond('blockPointReached'), world({ self: [-2, 0] }))).toBe('U');
  });

  it('unknown: true when the entity is not perceived', () => {
    expect(valueOf(cond('unknown', { target: 'slot:5' }), world())).toBe('T');
    expect(valueOf(cond('unknown', { target: 'slot:5' }), world({ seen: { 5: [0, 0] } }))).toBe('F');
  });

  it('heard: a call he has heard this play', () => {
    expect(valueOf(cond('heard', { call: 'seam' }), world({ heard: ['seam'] }))).toBe('T');
    expect(valueOf(cond('heard', { call: 'seam' }), world())).toBe('F');
  });
});

describe('conditions: the quarterback', () => {
  // Binding writes the quarterback's slot into the assignment (J4.3.1); until then "the quarterback" is nobody.
  const bound = bindAssignments({ assignments: [assignment({ behavior: { type: 'zoneDrop', params: {}, path: [] } })], slotOfRole: {}, qbSlot: 0 }).bound[0]!;
  const q = (name: string, args: Record<string, string | number | boolean>, w: ReturnType<typeof world>, a = bound) => valueOf(cond(name, args), w, D, a);

  it('qbOutOfPocket and qbScrambles read his position and movement', () => {
    expect(q('qbOutOfPocket', {}, world({ seen: { 0: [-5, K.pocketHalfWidth + 2] } }))).toBe('T');
    expect(q('qbOutOfPocket', {}, world({ seen: { 0: [-5, 0] } }))).toBe('F');
    expect(q('qbOutOfPocket', {}, world())).toBe('U');
    expect(q('qbScrambles', {}, world({ seen: { 0: [-5, K.pocketHalfWidth + 2, 0, K.scrambleSpeed + 1] }, carrier: 0 }))).toBe('T');
    expect(q('qbScrambles', {}, world({ seen: { 0: [-5, 0, 0, 0] }, carrier: 0 }))).toBe('F');
  });

  it('qbEyes: where he is looking, when that can be seen', () => {
    // Looking straight downfield (0 radians) at a defender straight downfield of him.
    expect(q('qbEyes', { dir: 'toMe' }, world({ self: [10, 0], seen: { 0: [-5, 0] }, gaze: { 0: 0 } }))).toBe('T');
    expect(q('qbEyes', { dir: 'away' }, world({ self: [10, 0], seen: { 0: [-5, 0] }, gaze: { 0: 0 } }))).toBe('F');
    expect(q('qbEyes', { dir: 'toMe' }, world({ self: [10, 0], seen: { 0: [-5, 0] }, gaze: { 0: 3 } }))).toBe('F');
    expect(q('qbEyes', { dir: 'toMe' }, world({ self: [10, 0], seen: { 0: [-5, 0] } }))).toBe('U');
  });

  it('an unbound quarterback is unknown, never a guess', () => {
    expect(q('qbOutOfPocket', {}, world({ seen: { 0: [-5, K.pocketHalfWidth + 2] } }), assignment())).toBe('U');
  });
});

describe('conditions: pre-snap picture and the kicking game', () => {
  it('formationIs: trips, bunch, empty, two by two, three by one', () => {
    const f = (is: string) => cond('formationIs', { is });
    const pre = (seen: Record<number, [number, number]>, rn: Record<number, number>) => world({ t: -3, self: [5, 0], seen, rn });
    const trips = pre({ 1: [0, 20], 2: [0, 14], 3: [0, 9], 4: [0, -18], 5: [-5, 0] }, { 1: 1, 2: 2, 3: 3, 4: 1 });
    expect(valueOf(f('trips'), trips)).toBe('T');
    expect(valueOf(f('threeByOne'), trips)).toBe('T');
    expect(valueOf(f('twoByTwo'), trips)).toBe('F');
    expect(valueOf(f('bunch'), trips)).toBe('F');
    expect(valueOf(f('bunch'), pre({ 1: [0, 10], 2: [0, 9], 3: [-1, 8] }, { 1: 1, 2: 2, 3: 3 }))).toBe('T');
    expect(valueOf(f('twoByTwo'), pre({ 1: [0, 20], 2: [0, 14], 3: [0, -9], 4: [0, -18] }, { 1: 1, 2: 2, 3: 2, 4: 1 }))).toBe('T');
    // Empty: nobody but the quarterback behind the line in the box.
    expect(valueOf(f('empty'), pre({ 0: [-5, 0], 1: [0, 20] }, { 1: 1 }))).toBe('T');
    expect(valueOf(f('empty'), pre({ 0: [-5, 0], 5: [-5, 1], 1: [0, 20] }, { 1: 1 }))).toBe('F');
  });

  it('motion: a man crossing the formation, or moving toward or away from him', () => {
    const w = (py: number, vy: number) => world({ t: -3, self: [5, 4], seen: { 5: [-2, py, 0, vy] } });
    expect(valuesOver(cond('motion', { dir: 'across' }), [w(-6, 3), w(-2, 3), w(2, 3)])).toBe('FFT');
    expect(valueOf(cond('motion', { dir: 'toward' }), w(-6, 3))).toBe('T');
    expect(valueOf(cond('motion', { dir: 'away' }), w(-6, 3))).toBe('F');
    expect(valueOf(cond('motion', { dir: 'away' }), w(-6, -3))).toBe('T');
    expect(valueOf(cond('motion', { dir: 'toward' }), w(-6, 0))).toBe('F');
  });

  it('strengthChanged: the side with more receivers changes before the snap', () => {
    const w = (py3: number) => world({ t: -3, self: [5, 0], seen: { 1: [0, 20], 2: [0, -20], 3: [-1, py3] }, rn: { 1: 1, 2: 1, 3: 2 } });
    expect(valuesOver(cond('strengthChanged'), [w(8), w(8), w(-8)])).toBe('FFT');
  });

  it('kickType and landingPointInside: unknown until he has seen the kick', () => {
    expect(valueOf(cond('kickType', { is: 'punt' }), world({ kick: 'punt' }))).toBe('T');
    expect(valueOf(cond('kickType', { is: 'onside' }), world({ kick: 'punt' }))).toBe('F');
    expect(valueOf(cond('kickType', { is: 'punt' }), world())).toBe('U');
    expect(valueOf(cond('landingPointInside', { yd: 5 }), world({ self: [40, 0], landing: [42, 1] }))).toBe('T');
    expect(valueOf(cond('landingPointInside', { yd: 5 }), world({ self: [40, 0], landing: [50, 1] }))).toBe('F');
    expect(valueOf(cond('landingPointInside', { yd: 5 }), world({ self: [40, 0] }))).toBe('U');
  });

  it('fairCatchSignal, ballTouchedByReceivers and kickState read facts he has perceived', () => {
    expect(valueOf(cond('fairCatchSignal'), world({ facts: ['fairCatchSignal'] }))).toBe('T');
    expect(valueOf(cond('fairCatchSignal'), world())).toBe('F');
    expect(valueOf(cond('ballTouchedByReceivers'), world({ facts: ['kickTouchedByReceivers'] }))).toBe('T');
    expect(valueOf(cond('ballTouchedByReceivers'), world())).toBe('F');
    expect(valueOf(cond('kickState', { is: 'rolling' }), world({ facts: ['kickRolling'] }))).toBe('T');
    expect(valueOf(cond('kickState', { is: 'deadByRule' }), world({ facts: ['kickRolling'] }))).toBe('F');
    expect(valueOf(cond('kickState', { is: 'deadByRule' }), world({ facts: ['kickDeadByRule'] }))).toBe('T');
  });
});

describe('conditions: coverage of the vocabulary', () => {
  it('every condition in the vocabulary file has a unit test above', () => {
    expect(VOCABULARY.conditions.map((c) => c.name).filter((n) => !covered.has(n))).toEqual([]);
  });

  it('a live condition is false before the snap and a pre-snap condition is false after it', () => {
    expect(valueOf(test('ballThrown'), world({ t: -1, kind: 'passInFlight' }))).toBe('F');
    expect(valueOf(test('formationIs', { is: 'trips' }), world({ t: 1, seen: { 1: [0, 20], 2: [0, 14], 3: [0, 9] }, rn: { 1: 1, 2: 2, 3: 3 } }))).toBe('F');
  });

  it('combinators carry unknown: all, any and not', () => {
    const t = test('timeGt', { s: -40 }), f = test('timeGt', { s: 50 }), u = test('cushion', { target: 'slot:9', lt: 3 });
    const v = (c: Parameters<typeof valueOf>[0]) => valueOf(c, world());
    expect(v({ op: 'all', of: [t, t] })).toBe('T');
    expect(v({ op: 'all', of: [t, u] })).toBe('U');
    expect(v({ op: 'all', of: [u, f] })).toBe('F');
    expect(v({ op: 'any', of: [f, u] })).toBe('U');
    expect(v({ op: 'any', of: [u, t] })).toBe('T');
    expect(v({ op: 'any', of: [f, f] })).toBe('F');
    expect(v({ op: 'not', of: u })).toBe('U');
    expect(v({ op: 'not', of: f })).toBe('T');
  });
});
