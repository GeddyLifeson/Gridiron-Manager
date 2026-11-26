// A unit test for every action in the vocabulary (J4.1.3: "each maps to exactly one implementation").
// Each case fires the action from the first tick and checks the intent, technique or call it produces.
import { describe, expect, it } from 'vitest';
import { VOCABULARY } from '../../src/lang/index.ts';
import { ALWAYS, K, act, assignment, compiled, runAction, viewOf, when, world } from './world.ts';

const covered = new Set<string>();
const A = (name: string, args: Record<string, string | number | boolean> = {}) => { covered.add(name); return act(name, args); };
const D = 11, O = 3;
const pt = (px: number, py: number, kind: 'through' | 'cut' | 'settle' = 'through') => ({ px, py, kind, landmark: null });
const target = (o: { intent: { target: { px: number; py: number } | null } }) => [o.intent.target?.px, o.intent.target?.py];

describe('actions: movement', () => {
  it('runPath: seeks each waypoint in turn, settles at a settle point, and runs on past a last through point', () => {
    const w = world({ self: [0, 0] });
    const c = compiled(assignment({ behavior: { type: 'route', params: {}, path: [pt(5, 0, 'cut'), pt(5, 6, 'settle')] }, rules: [when(ALWAYS, [A('runPath')])] }));
    const v = viewOf(w, O);
    expect(target(c.decide(O, v))).toEqual([5, 0]);
    expect(c.decide(O, v).intent.arrival).toBe('through');
    w.self = [5, 0.2];
    const o = c.decide(O, v);
    expect(target(o)).toEqual([5, 6]);
    expect(o.intent.arrival).toBe('arrive');
    const on = runAction(act('runPath'), world({ self: [9.75, 0] }), O, { behavior: { type: 'route', params: {}, path: [pt(10, 0)] } });
    expect(target(on)).toEqual([10 + K.extend, 0]);
  });

  it('runPath: a point he has run past counts as reached, so traffic that carries him wide does not send him back for it', () => {
    const cross = { behavior: { type: 'route', params: {}, path: [pt(3, -7), pt(3, 0), pt(3.5, 9)] } };
    const w = world({ self: [3, -7] });
    const c = compiled(assignment({ ...cross, rules: [when(ALWAYS, [A('runPath')])] }));
    const v = viewOf(w, O);
    expect(target(c.decide(O, v))).toEqual([3, 0]);
    // Wide of a point he has not reached yet, he still runs to it.
    w.self = [4.5, -1];
    expect(target(c.decide(O, v))).toEqual([3, 0]);
    // A yard and a half wide of the middle point and already past it: on to the next one, not back.
    w.self = [4.5, 0.4];
    expect(target(c.decide(O, v))).toEqual([3.5, 9]);
  });

  it('runPath for a deep zone: stays on top of the deepest receiver coming into his zone while the ball is held', () => {
    const zone = { behavior: { type: 'deepZone', params: {}, path: [pt(14, 0)] } };
    const go = world({ self: [12, 0], seen: { 7: [10, 4, 7, 0], 8: [3, -30, 7, 0], 9: [11, 6, 7, 0] }, rn: { 7: 2, 8: 1 } });
    // Receiver 7 will be at 10 + 7 * lead: he plays a cushion beyond that, between his landmark and the man. Receiver 8
    // is outside his zone and slot 9 is not a receiver.
    expect(target(runAction(act('runPath'), go, D, zone))).toEqual([10 + 7 * K.offLeadS + K.offCushion, 2]);
    // Nobody threatening his depth: he goes to his landmark. With the ball thrown he no longer shades the receiver.
    expect(target(runAction(act('runPath'), world({ self: [12, 0], seen: { 7: [2, 4] }, rn: { 7: 2 } }), D, zone))).toEqual([14, 0]);
    expect(target(runAction(act('runPath'), { ...go, kind: 'passInFlight' }, D, zone))).toEqual([14, 0]);
  });

  it('continue: changes nothing, the current action goes on', () => {
    const o = runAction(A('continue'), world({ self: [0, 0] }), O, { behavior: { type: 'route', params: {}, path: [pt(8, 0)] } });
    expect(target(o)).toEqual([8, 0]);
  });

  it('settleInWindow: stops where he is and faces the ball', () => {
    const o = runAction(A('settleInWindow'), world({ self: [8, 4], ball: [-5, 0] }), O);
    expect(target(o)).toEqual([8, 4]);
    expect(o.intent.faceTarget).toEqual({ px: -5, py: 0 });
  });

  it('convertRoute: replaces the path with the conversion and records it', () => {
    const o = runAction(A('convertRoute', { to: 'hitch', px: 6, py: 9, kind: 'settle' }), world({ self: [4, 8] }), O, { behavior: { type: 'route', params: {}, path: [pt(15, 8)] } });
    expect(target(o)).toEqual([6, 9]);
    expect(o.technique['conversion']).toBe('hitch');
    const rel = runAction(act('convertRoute', { to: 'sitDown', px: 2, py: -1, relative: true }), world({ self: [4, 8] }), O);
    expect(target(rel)).toEqual([6, 7]);
    // A conversion he runs through carries on straight upfield after the point, not along the old route's last leg.
    const seam = { behavior: { type: 'route', params: {}, path: [pt(10, 8), pt(30, -8)] } };
    const on = runAction(act('convertRoute', { to: 'seam', px: 6, py: 8, kind: 'through' }), world({ self: [6.2, 8] }), O, seam);
    expect(target(on)[1]).toBe(8);
    expect(target(on)[0]).toBeGreaterThan(6.2);
  });

  it('scrambleDrill: goes deep, comes back to the passer, or mirrors his movement', () => {
    const w = world({ self: [12, 10], seen: { 0: [-6, 5, 0, 3] } });
    const bound = { behavior: { type: 'route', params: { qb: 'slot:0' }, path: [] } };
    expect(target(runAction(A('scrambleDrill', { rule: 'deep' }), w, O, bound))).toEqual([12 + K.extend, 10]);
    expect(target(runAction(act('scrambleDrill', { rule: 'comeBack' }), w, O, bound))).toEqual([3, 7.5]);
    expect(target(runAction(act('scrambleDrill', { rule: 'mirror' }), w, O, bound))).toEqual([12, 10 + K.extend]);
    expect(runAction(act('scrambleDrill'), w, O, bound).behaviorState).toBe(4);
  });

  it('dropTo: backpedals to the spot with eyes on the ball', () => {
    const o = runAction(A('dropTo', { px: 10, py: 6 }), world({ self: [4, 3], ball: [-5, 0] }));
    expect(target(o)).toEqual([10, 6]);
    expect(o.intent.moveMode).toBe('backpedal');
    expect(o.intent.faceTarget).toEqual({ px: -5, py: 0 });
  });

  it('widen, squeeze and sink: move from where he stood', () => {
    expect(target(runAction(A('widen', { yd: 3 }), world({ self: [6, 5] })))).toEqual([6, 8]);
    expect(target(runAction(act('widen', { yd: 3 }), world({ self: [6, -5] })))).toEqual([6, -8]);
    expect(target(runAction(A('squeeze', { yd: 2 }), world({ self: [6, 5] })))).toEqual([6, 3]);
    expect(target(runAction(act('squeeze', { yd: 9 }), world({ self: [6, 5] })))).toEqual([6, 0]);
    expect(target(runAction(A('sink', { yd: 4 }), world({ self: [6, 5] })))).toEqual([10, 5]);
    expect(target(runAction(act('sink', { yd: 4 }), world({ self: [-2, 5] }), O))).toEqual([-6, 5]);
  });

  it('carry: runs with the receiver to a depth, then is done and the default takes over', () => {
    const a = { behavior: { type: 'zoneDrop', params: {}, path: [pt(10, 6, 'settle')] } };
    const shallow = runAction(A('carry', { target: 'slot:1', toDepth: 12 }), world({ self: [8, 6], seen: { 1: [9, 7] } }), D, a);
    expect(target(shallow)).toEqual([9 + K.shoulderOffset, 7]);
    expect(shallow.behaviorState).toBe(2);
    const deep = runAction(act('carry', { target: 'slot:1', toDepth: 12 }), world({ self: [8, 6], seen: { 1: [13, 7] } }), D, a);
    expect(target(deep)).toEqual([10, 6]);
  });

  it('wall and trail: position on a receiver', () => {
    const w = world({ self: [6, 4], seen: { 1: [7, 8] } });
    expect(target(runAction(A('wall', { target: 'slot:1' }), w))).toEqual([7, 8 - K.trailOffset]);
    expect(target(runAction(A('trail', { target: 'slot:1' }), w))).toEqual([7 - K.trailOffset, 8]);
    expect(target(runAction(act('trail', { target: 'slot:9' }), w))).toEqual([6, 4]);
    // A defender who starts on top of his man stays on top: a cushion ahead of where the man will be, never back toward him.
    const off = world({ self: [9, 8], seen: { 1: [2, 8, 6, 0] } });
    expect(target(runAction(act('trail', { target: 'slot:1' }), off))).toEqual([Math.max(2 + 6 * K.offLeadS + K.offCushion, 9), 8]);
    expect(target(runAction(act('trail', { target: 'slot:1' }), world({ self: [9, 8], seen: { 1: [2, 8, 0, 0] } })))).toEqual([9, 8]);
    // A man still coming who has not reached the lead point yet: he holds his ground and does not run on.
    const coming = runAction(act('trail', { target: 'slot:1' }), world({ t: 1, self: [14, 8], seen: { 1: [2, 8, 6, 0] } }));
    expect(target(coming)).toEqual([14, 8]);
    expect(coming.intent.arrival).toBe('arrive');
    // The man has stopped under him after his release (a curl): he drives down to his cushion.
    const curl = runAction(act('trail', { target: 'slot:1' }), world({ t: 2, self: [18, 8], seen: { 1: [12, 8, 0, 0] } }));
    expect(target(curl)).toEqual([12 + K.offCushion, 8]);
    expect(curl.intent.arrival).toBe('breakdown');
    // Even with his man or behind him, he chases where the man is going, a step behind, not where the man is.
    const beside = runAction(act('trail', { target: 'slot:1' }), world({ t: 2, self: [15, 6], seen: { 1: [15, 8, 8, 0] } }));
    expect(target(beside)).toEqual([15 - K.trailOffset + 8 * K.pursueLeadS, 8]);
    expect(beside.intent.arrival).toBe('through');
  });

  it('pursue: takes the named angle to the carrier', () => {
    // He plays the carrier a step ahead of what he sees. This carrier is going away as fast as he can run, so there
    // is no meeting point and every angle starts from the man himself.
    const w = world({ self: [8, -6], carrier: 5, seen: { 5: [0, 2, 4, 6] } });
    const ex = 4 * K.pursueAnticipateS, ey = 2 + 6 * K.pursueAnticipateS;
    expect(target(runAction(A('pursue', { angle: 'direct' }), w))).toEqual([ex, ey]);
    expect(target(runAction(act('pursue', { angle: 'intercept' }), w))).toEqual([ex, ey]);
    expect(target(runAction(act('pursue', { angle: 'cutback' }), w))).toEqual([ex, ey - K.pursueCutback]);
    const o = runAction(act('pursue', { angle: 'insideOut' }), w);
    expect(target(o)).toEqual([ex, ey - K.shoulderOffset]);
    expect(o.intent.arrival).toBe('breakdown');
    // A carrier coming at him is met where the two arrive together: half way, for two men at the same pace.
    const meet = runAction(act('pursue', { angle: 'intercept' }), world({ self: [0, 10], carrier: 5, seen: { 5: [0, 0, 0, 5] } }));
    expect(target(meet)[0]).toBe(0);
    expect(target(meet)[1]).toBeCloseTo(5 + 2.5 * K.pursueAnticipateS, 9);
    // Inside tackling range he goes through the man instead of gathering.
    expect(runAction(act('pursue', { angle: 'direct' }), world({ self: [1, 2], carrier: 5, seen: { 5: [0, 2, 0, 0] } })).intent.arrival).toBe('through');
    const contain = runAction(act('pursue', { angle: 'contain' }), world({ self: [3, 8], carrier: 5, seen: { 5: [0, 2, 0, 0] } }));
    expect(target(contain)).toEqual([0, 8]);
  });

  it('fit: aims at the named gap between the linemen he sees', () => {
    const line = { 2: [0, 0], 3: [0, 1.2], 4: [0, 2.4], 5: [0, 3.6], 6: [0, -1.2], 7: [0, -2.4] } as Record<number, [number, number]>;
    const w = world({ self: [4, 1], seen: line });
    const gap = (g: string, side = 'left', shoulder = 'inside') => target(runAction(A('fit', { gap: g, side, shoulder }), w))[1]!;
    expect(gap('A')).toBeCloseTo(0.6 - K.shoulderOffset);
    expect(gap('B')).toBeCloseTo(1.8 - K.shoulderOffset);
    expect(gap('C')).toBeCloseTo(3.0 - K.shoulderOffset);
    expect(gap('D')).toBeCloseTo(3.6 + K.gap - K.shoulderOffset);
    expect(gap('force', 'left', 'outside')).toBeCloseTo(3.6 + K.containWidth + K.shoulderOffset);
    expect(gap('A', 'right')).toBeCloseTo(-0.6 + K.shoulderOffset);
    expect(runAction(act('fit', { gap: 'A' }), w, D, { behavior: { type: 'runFit', params: {}, path: [] } }).behaviorState).toBe(3);
  });

  it('spill and box: meet the lead blocker on the inside or the outside shoulder', () => {
    const w = world({ self: [2, 5], seen: { 6: [-1, 4, 5, 1] } });
    const s = runAction(A('spill'), w), b = runAction(A('box'), w);
    expect(target(s)).toEqual([-1, 4 - K.shoulderOffset]);
    expect(s.technique['blockDefeat']).toBe('spill');
    expect(target(b)).toEqual([-1, 4 + K.shoulderOffset]);
    expect(b.technique['blockDefeat']).toBe('box');
  });

  it('contain: stays outside the carrier, never inside where he lined up', () => {
    expect(target(runAction(A('contain'), world({ self: [1, 6], carrier: 0, seen: { 0: [-5, 1] } })))).toEqual([-5, 6]);
    expect(target(runAction(act('contain'), world({ self: [1, 6], carrier: 0, seen: { 0: [-5, 7] } })))).toEqual([-5, 7 + K.containWidth]);
  });
});

describe('actions: rush', () => {
  const qb = { behavior: { type: 'passRush', params: { qb: 'slot:0' }, path: [] } };
  it('rush: takes a track to the quarterback and sets the move plan', () => {
    const w = world({ self: [1, 4], seen: { 0: [-7, 0] } });
    const straight = runAction(A('rush', { track: 'straight', plan: 'bull' }), w, D, qb);
    expect(target(straight)).toEqual([-7, 0]);
    expect(straight.technique['rushMove']).toBe('bull');
    expect(straight.intent.moveMode).toBe('sprint');
    expect(target(runAction(act('rush', { track: 'outside' }), w, D, qb))).toEqual([-7, K.rushTrackOffset]);
    expect(target(runAction(act('rush', { track: 'inside' }), w, D, qb))).toEqual([-7, -K.rushTrackOffset]);
    // With no quarterback in sight he still comes upfield.
    expect(target(runAction(act('rush'), world({ self: [1, 4] }), D, qb))).toEqual([1 - K.extend, 4]);
  });

  it('stuntPath: runs the drawn path, then rushes', () => {
    const a = { behavior: { type: 'passRush', params: { qb: 'slot:0' }, path: [pt(0, 2)] } };
    expect(target(runAction(A('stuntPath'), world({ self: [1, 4], seen: { 0: [-7, 0] } }), D, a))).toEqual([0, 2]);
    expect(target(runAction(act('stuntPath'), world({ self: [0, 2], seen: { 0: [-7, 0] } }), D, a))).toEqual([-7, 0]);
  });

  it('peelToBack: leaves the rush to take a back releasing', () => {
    const w = world({ self: [-2, 4], carrier: 0, seen: { 0: [-7, 0], 5: [-3, 6, 2, 4] } });
    const o = runAction(A('peelToBack'), w, D, { behavior: { type: 'blitz', params: { qb: 'slot:0' }, path: [] } });
    expect(target(o)).toEqual([-3, 6]);
    expect(o.behaviorState).toBe(4);
    // Nobody releasing: the action is done at once and the blitz goes on.
    expect(target(runAction(act('peelToBack'), world({ self: [-2, 4], carrier: 0, seen: { 0: [-7, 0] } }), D, { behavior: { type: 'blitz', params: { qb: 'slot:0' }, path: [] } }))).toEqual([-7, 0]);
  });

  it('greenDog: covers his man, and rushes when the man stays in to block', () => {
    const a = { behavior: { type: 'manCover', params: { man: 'slot:5', qb: 'slot:0' }, path: [] } };
    const blocks = world({ t: K.releaseDecideS + 0.2, self: [4, 2], seen: { 0: [-7, 0], 5: [-4, 1, 0, 0] } });
    expect(target(runAction(A('greenDog'), blocks, D, a))).toEqual([-7, 0]);
    const releases = world({ t: K.releaseDecideS + 0.2, self: [4, 2], seen: { 0: [-7, 0], 5: [3, 5, 4, 3] } });
    expect(target(runAction(act('greenDog'), releases, D, a))).toEqual([3 + K.trailOffset, 5]);
  });

  it('spy: mirrors the quarterback at depth', () => {
    const a = { behavior: { type: 'spy', params: { qb: 'slot:0' }, path: [] } };
    const w = world({ self: [5, 0], seen: { 0: [-6, 3] } });
    expect(target(runAction(A('spy'), w, D, a))).toEqual([K.spyDepth, 3]);
    expect(target(runAction(act('spy', { depth: 7 }), w, D, a))).toEqual([7, 3]);
  });
});

describe('actions: blocking', () => {
  it('block: goes to the target with the named block, aiming at the playside shoulder on a reach', () => {
    const w = world({ self: [0, 2], seen: { 12: [1, 3] } });
    const base = runAction(A('block', { target: 'slot:12', type: 'base' }), w, O);
    expect(target(base)).toEqual([1, 3]);
    expect(base.technique['runBlock']).toBe('base');
    const reach = runAction(act('block', { target: 'slot:12', type: 'reach' }), w, O, { behavior: { type: 'runBlock', params: { playside: 'left' }, path: [] } });
    expect(target(reach)).toEqual([1, 3 + K.shoulderOffset]);
    expect(reach.behaviorState).toBe(1);
    expect(target(runAction(act('block', { target: 'slot:19' }), w, O))).toEqual([0, 2]);
  });

  it('comboTo: helps on the down lineman first, then climbs to the target', () => {
    const w = world({ t: 0.1, self: [0, 2], seen: { 12: [1, 1.5], 15: [4, 3] } });
    const c = compiled(assignment({ behavior: { type: 'runBlock', params: {}, path: [] }, rules: [when(ALWAYS, [A('comboTo', { target: 'slot:15' })])] }));
    const v = viewOf(w, O);
    expect(target(c.decide(O, v))).toEqual([1, 1.5]);
    w.t = 0.1 + K.comboHoldS + 0.1;
    const o = c.decide(O, v);
    expect(target(o)).toEqual([4, 3]);
    expect(o.technique['runBlock']).toBe('combo');
  });

  it('pull: follows the path, then finds the first defender to show', () => {
    const a = { behavior: { type: 'pull', params: {}, path: [pt(-1, 5), pt(1, 7)] } };
    expect(target(runAction(A('pull', { type: 'kick' }), world({ self: [0, -1] }), O, a))).toEqual([-1, 5]);
    const shows = runAction(act('pull', { type: 'kick' }), world({ self: [-1, 4], seen: { 13: [0.5, 5.5] } }), O, a);
    expect(target(shows)).toEqual([0.5, 5.5]);
    expect(shows.technique['runBlock']).toBe('kickOut');
    expect(runAction(act('pull', { type: 'lead' }), world({ self: [0, -1] }), O, a).technique['runBlock']).toBe('lead');
  });

  it('passSet: sets back off the line between his man and the passer', () => {
    const a = { behavior: { type: 'passSet', params: { man: 'slot:12' }, path: [] } };
    const o = runAction(A('passSet', { type: 'vertical' }), world({ self: [0, 3], seen: { 12: [1, 3.6] } }), O, a);
    // He waits at the set depth on the rusher's line to the middle of the pocket.
    expect(target(o)[0]).toBe(-K.passSetDepth);
    expect(target(o)[1]).toBeCloseTo(3.6 - 3.6 * (1 + K.passSetDepth) / (1 + K.passSetPocketDepth), 9);
    expect(o.technique['passSet']).toBe('vertical');
    expect(target(runAction(act('passSet'), world({ self: [0, 3] }), O, a))).toEqual([-K.passSetDepth, 3]);
    // Once the rusher is at the set depth he gives ground with him, at arm's length on that same line.
    const deep = target(runAction(act('passSet'), world({ self: [0, 3], seen: { 12: [-2.5, 3] } }), O, a)) as [number, number];
    const lx = -K.passSetPocketDepth + 2.5, ly = -3, len = Math.hypot(lx, ly);
    expect(deep[0]).toBeCloseTo(-2.5 + (lx / len) * K.passSetMirrorGap, 9);
    expect(deep[1]).toBeCloseTo(3 + (ly / len) * K.passSetMirrorGap, 9);
  });

  it('passSet: a man on the line takes the rusher no teammate on the line is nearer to, and stays on the man he is locked up with', () => {
    // Left tackle at 2, guard at 1: the defensive tackle between them is the guard's (a tie goes inside), the end is the tackle's.
    const seen = { 1: [0, 1] as [number, number], 12: [0.9, 1.5] as [number, number], 11: [1, 2.8] as [number, number] };
    const lt = runAction(A('passSet'), world({ self: [0, 2], seen }), 0);
    expect(lt.intent.faceTarget).toEqual({ px: 1, py: 2.8 });
    const lg = runAction(act('passSet'), world({ self: [0, 1], seen: { 0: [0, 2], 12: [0.9, 1.5], 11: [1, 2.8] } }), 1);
    expect(lg.intent.faceTarget).toEqual({ px: 0.9, py: 1.5 });
    // With no rusher of his own he helps on the nearest.
    expect(runAction(act('passSet'), world({ self: [0, 2], seen: { 1: [0, 1], 12: [0.9, 1.5] } }), 0).intent.faceTarget).toEqual({ px: 0.9, py: 1.5 });
    // A back sees the nearest rusher, as before.
    expect(runAction(act('passSet'), world({ self: [-5, 2], seen }), 6).intent.faceTarget).toEqual({ px: 0.9, py: 1.5 });
    // Locked up with the tackle, he stays between him and the pocket at arm's length, whoever else is nearer.
    const held = target(runAction(act('passSet'), world({ self: [0, 2], seen, locked: 12 }), 0)) as [number, number];
    const lx = -K.passSetPocketDepth - 0.9, ly = -1.5, len = Math.hypot(lx, ly);
    expect(held[0]).toBeCloseTo(0.9 + (lx / len) * K.passSetMirrorGap, 9);
    expect(held[1]).toBeCloseTo(1.5 + (ly / len) * K.passSetMirrorGap, 9);
  });

  it('a run blocker locked up with a defender sustains the block instead of following his rule elsewhere', () => {
    const a = { behavior: { type: 'runBlock', params: {}, path: [pt(6, 0)] } };
    const free = runAction(act('climb'), world({ self: [0, 1], seen: { 12: [0.9, 1.5] } }), 1, a);
    expect(target(free)).not.toEqual([0.9, 1.5]);
    const held = runAction(act('climb'), world({ self: [0, 1], seen: { 12: [0.9, 1.5] }, locked: 12 }), 1, a);
    expect(target(held)).toEqual([0.9, 1.5]);
    expect(held.intent.arrival).toBe('through');
  });

  it('slide: sets toward the called side and picks up what shows there', () => {
    expect(target(runAction(A('slide', { dir: 'left' }), world({ self: [0, 1] }), O))).toEqual([-K.passSetDepth, 1 + K.gap]);
    expect(target(runAction(act('slide', { dir: 'right' }), world({ self: [0, 1] }), O))).toEqual([-K.passSetDepth, 1 - K.gap]);
    expect(target(runAction(act('slide', { dir: 'left' }), world({ self: [0, 1], seen: { 12: [1, 1.5] } }), O))).toEqual([-K.passSetDepth, 1.5]);
  });

  it('chipThenRelease: hits the rusher, then runs the route', () => {
    const w = world({ t: 0.1, self: [0, 4], seen: { 12: [1, 4.5, -3, 0] } });
    const c = compiled(assignment({ behavior: { type: 'route', params: {}, path: [pt(6, 6)] }, rules: [when(ALWAYS, [A('chipThenRelease')])] }));
    const v = viewOf(w, O);
    expect(target(c.decide(O, v))).toEqual([1, 4.5]);
    w.t = 0.1 + K.chipHoldS + 0.1;
    expect(target(c.decide(O, v))).toEqual([6, 6]);
  });

  it('scan: takes the most dangerous rusher coming, inside first', () => {
    const w = world({ self: [-4, 0], seen: { 14: [-1, 3, -5, 0], 15: [-1, -1, -5, 0], 16: [5, 0, 1, 0] } });
    const o = runAction(A('scan'), w, O, { behavior: { type: 'passSet', params: {}, path: [] } });
    expect(target(o)).toEqual([-1, -1]);
    expect(o.behaviorState).toBe(3);
  });

  it('cutOff and climb: backside cut-off and the climb to the second level', () => {
    const cut = runAction(A('cutOff', { target: 'slot:12' }), world({ self: [0, -2], seen: { 12: [1, -1] } }), O, { behavior: { type: 'runBlock', params: { playside: 'left' }, path: [] } });
    expect(target(cut)).toEqual([1, -1 + K.shoulderOffset]);
    expect(cut.technique['runBlock']).toBe('cutOff');
    expect(target(runAction(A('climb'), world({ self: [1, 2], seen: { 12: [1, 2.5], 15: [K.climbMinDepth + 1, 3] } }), O))).toEqual([K.climbMinDepth + 1, 3]);
    expect(target(runAction(act('climb'), world({ self: [1, 2] }), O))).toEqual([1 + K.extend, 2]);
  });
});

describe('actions: the ball', () => {
  it('runPath: past his last point a receiver heading for the sideline turns up the field inside it', () => {
    const flat = { behavior: { type: 'route', params: {}, path: [pt(3, 18.5), pt(3.2, 19)] } };
    // Well inside: he aims at the spot short of the sideline on his line.
    const far = runAction(act('runPath'), world({ self: [3.2, 19], sidelines: [-26, 26] }), O, flat);
    expect(target(far)[1]).toBeCloseTo(26 - K.sidelineRoom, 9);
    expect(target(far)[0]).toBeGreaterThan(3.2);
    // There: he goes straight up the field along it.
    const there = runAction(act('runPath'), world({ self: [3.2, 26 - K.sidelineRoom], sidelines: [-26, 26] }), O, { behavior: { type: 'route', params: {}, path: [pt(3, 25.5 - K.sidelineRoom), pt(3.2, 26 - K.sidelineRoom)] } });
    expect(target(there)).toEqual([3.2 + K.extend, 26 - K.sidelineRoom]);
    // A view with no sidelines leaves the old behaviour: he keeps his heading.
    expect(target(runAction(act('runPath'), world({ self: [3.2, 19] }), O, flat))[1]).toBeGreaterThan(26);
  });
  it('breakOnBall: a receiver who knows the ball is up but not yet where it comes down keeps running his route', () => {
    const o = runAction(act('breakOnBall'), world({ self: [10, 8], kind: 'passInFlight', ball: [0, 0, 20, 4] }), O, { behavior: { type: 'route', params: {}, path: [pt(30, 8)] } });
    expect(target(o)).toEqual([30, 8]);
  });
  it('breakOnBall: goes where the ball is coming down', () => {
    expect(target(runAction(A('breakOnBall'), world({ self: [10, 0], kind: 'passInFlight', landing: [14, 5] })))).toEqual([14, 5]);
    expect(target(runAction(act('breakOnBall'), world({ self: [10, 0], kind: 'passInFlight', ball: [0, 0, 20, 4] })))).toEqual([20 * K.pursueLeadS, 4 * K.pursueLeadS]);
    expect(target(runAction(act('breakOnBall'), world({ self: [10, 0], kind: 'loose', ball: [3, 2, 5, 5] })))).toEqual([3, 2]);
    // A passer still holding the ball behind the line is not a ball to run at: the defender covers the nearest receiver from on top.
    const held = world({ self: [6, 2], kind: 'held', carrier: 5, seen: { 5: [-6, 0], 7: [9, 5], 8: [14, -12] }, rn: { 7: 1, 8: 1 } });
    expect(target(runAction(act('breakOnBall'), held))).toEqual([9 + K.trailOffset, 5]);
    // A pass in the air he has not picked up yet: a man defender stays with his man, and a zone defender breaks to the
    // line of the throw at his own depth. Neither runs at the ball itself, which is back toward the passer.
    const man = { behavior: { type: 'manCover', params: { man: 'slot:1' }, path: [] } };
    const air = { kind: 'passInFlight' as const, ball: [-4, 0, 16, 4] as [number, number, number, number] };
    expect(target(runAction(act('breakOnBall'), world({ self: [20, 6], seen: { 1: [22, 8, 8, 0] }, ...air }), D, man))).toEqual([22 - K.trailOffset + 8 * K.pursueLeadS, 8]);
    expect(target(runAction(act('breakOnBall'), world({ self: [20, 0], ...air }), D))).toEqual([20, 6]);
    // Once he has the landing point he goes to it.
    expect(target(runAction(act('breakOnBall'), world({ self: [20, 0], landing: [30, 9], ...air }), D))).toEqual([30, 9]);
    // A runner past the line is a ball to get to, and so is the ball for the offense.
    expect(target(runAction(act('breakOnBall'), world({ self: [6, 2], kind: 'held', carrier: 6, ball: [3, 1], seen: { 6: [3, 1], 7: [9, 5] }, rn: { 7: 1 } })))).toEqual([3, 1]);
  });

  it('playHands, strip, secure and getDown set the ball technique', () => {
    const cover = { behavior: { type: 'manCover', params: { man: 'slot:1' }, path: [] } };
    const hands = runAction(A('playHands'), world({ self: [12, 5], seen: { 1: [13, 6] }, ball: [0, 0] }), D, cover);
    expect(target(hands)).toEqual([13 - K.trailOffset, 6]);
    // He plays the hands running with his man, led the same way as before the throw.
    const running = runAction(A('playHands'), world({ self: [12, 5], seen: { 1: [13, 6, 8, 0] }, ball: [0, 0] }), D, cover);
    expect(target(running)).toEqual([13 - K.trailOffset + 8 * K.pursueLeadS, 6]);
    expect(hands.technique['ballPlay']).toBe('playHands');
    expect(hands.behaviorState).toBe(3);
    const strip = runAction(A('strip'), world({ self: [5, 1], carrier: 5, seen: { 5: [4, 2] } }));
    expect(target(strip)).toEqual([4, 2]);
    expect(strip.technique['ballPlay']).toBe('strip');
    const secure = runAction(A('secure'), world({ self: [5, 1] }), O);
    expect(secure.technique['ballPlay']).toBe('secure');
    expect(secure.intent.effort).toBe(K.secureEffort);
    const down = runAction(A('getDown'), world({ self: [5, 1] }), O);
    expect(down.intent.moveMode).toBe('down');
    expect(down.technique['ballPlay']).toBe('getDown');
    const slide = runAction(A('slideDown'), world({ self: [5, 1] }), O);
    expect(slide.intent.moveMode).toBe('down');
    expect(slide.technique['ballPlay']).toBe('slide');
  });

  it('getOutOfBounds and stayInBounds: toward the near sideline, or away from it', () => {
    expect(target(runAction(A('getOutOfBounds'), world({ self: [20, 22] }), O))).toEqual([20 + K.arriveRadius, 22 + K.sidelineRun]);
    expect(target(runAction(A('stayInBounds'), world({ self: [20, 22] }), O))).toEqual([20 + K.extend, 22 - K.containWidth]);
    expect(target(runAction(act('stayInBounds'), world({ self: [20, -22] }), D))).toEqual([20 - K.extend, -22 + K.containWidth]);
  });
});

describe('actions: the kicking game', () => {
  it('signalFairCatch: makes the signal and goes to the ball', () => {
    const o = runAction(A('signalFairCatch'), world({ self: [45, 0], kind: 'kickInFlight', landing: [47, 3] }), 21);
    expect(o.calls).toEqual(['signal.fairCatch']);
    expect(target(o)).toEqual([47, 3]);
  });

  it('fieldTheKick, letTheKickGo and downThePunt', () => {
    const w = world({ self: [45, 0], kind: 'kickInFlight', landing: [47, 3], ball: [20, 0, 20, 1] });
    const field = runAction(A('fieldTheKick'), w, 21);
    expect(target(field)).toEqual([47, 3]);
    expect(field.intent.arrival).toBe('arrive');
    const away = runAction(A('letTheKickGo'), world({ self: [47, 9], landing: [47, 3] }), 21);
    expect(target(away)).toEqual([47, 9 + K.kickClearance]);
    expect(target(runAction(act('letTheKickGo'), world({ self: [47, 3 + K.kickClearance + 2], landing: [47, 3] }), 21))).toEqual([47, 3 + K.kickClearance + 2]);
    expect(target(runAction(A('downThePunt'), world({ self: [40, 0], ball: [50, 4] }), 4))).toEqual([50, 4]);
  });
});

describe('actions: communication and control', () => {
  it('call: emits the call once, on the tick it fires', () => {
    const w = world();
    const c = compiled(assignment({ rules: [when(ALWAYS, [A('call', { name: 'seam' })])] }));
    expect(c.decide(D, viewOf(w, D)).calls).toEqual(['seam']);
    expect(c.decide(D, viewOf(w, D)).calls).toEqual([]);
  });

  it('switchBehavior: changes behavior and runs its default', () => {
    const o = runAction(A('switchBehavior', { to: 'pursue' }), world({ self: [5, 0], carrier: 5, seen: { 5: [0, 3] } }));
    expect(o.behavior).toBe('pursue');
    expect(target(o)).toEqual([0, 3]);
  });

  it('handOffMan and takeMan: pass a man off with a call, and take a new one', () => {
    const a = { behavior: { type: 'manCover', params: { man: 'slot:1' }, path: [] } };
    const w = world({ self: [8, 5], seen: { 1: [9, 6], 2: [7, 2] } });
    const off = runAction(A('handOffMan', { to: 'FS' }), w, D, a);
    expect(off.calls).toEqual(['passOff.FS']);
    expect(target(off)).toEqual([8, 5]);
    const take = runAction(A('takeMan', { from: 'CB', target: 'slot:2' }), w, D, a);
    expect(target(take)).toEqual([7 - K.trailOffset, 2]);
  });

  it('stop: stands still with no effort', () => {
    const o = runAction(A('stop'), world({ self: [3, 3] }));
    expect(target(o)).toEqual([3, 3]);
    expect(o.intent.effort).toBe(0);
    expect(o.intent.moveMode).toBe('stance');
  });

  it('every action in the vocabulary file has a unit test above', () => {
    expect(VOCABULARY.actions.map((a) => a.name).filter((n) => !covered.has(n))).toEqual([]);
  });
});
