// Plays added with the starter books (books.ts): concepts the research had sourced but the set did not yet draw.
// All drawn to the right (G1.4.2). Sources: research/scheme-sources/pass-concepts-and-reads.md (Y-cross, spacing,
// levels) and play-action-screens-rpo.md (now screen, stick RPO); ids in sources.ts and sources-book.ts.
import type { PlayDef, Slot } from '../starter/types.ts';
import { DESIGN_VALUES, NUMBERED_FROM_SIDELINE, OL, RIGHT_OF, ROUTE_DEPTH, ZONE_RULE, act, clause, cut, not, protect, route, settle, slot, test, through, type Basis, type OLRole } from './kit.ts';

const G2 = 'gun_2x2_11';
const TR = 'gun_trips_right_11';

const mk = (id: string, name: string, kind: PlayDef['kind'], F: string, runDirection: PlayDef['runDirection'], intent: PlayDef['intent'], slots: Slot[], coachingPoints: string[], basis: Basis[]): PlayDef =>
  ({ id, name, kind, personnel: '11', formationId: F, shotgun: true, runDirection, intent, slots, coachingPoints, basis, drawnTo: 'right' });
const lineProtect = (F: string, c: string): Slot[] => OL.map((r) => slot(F, r, protect(c)));
const backPickup = (F: string, c: string): Slot => slot(F, 'R', { behavior: 'passSet', params: { type: 'back', job: 'blitzPickup' }, concept: c, rules: [clause('Block the first rusher who shows outside the tackles', test('rushersVsBlockers', { side: 'mine' }), [act('block', { target: 'nearestRusher', type: 'base' })])] });
const qb = (F: string, c: string, drop: string, read: string, keys: string[], load = 1.5): Slot =>
  slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop, read }, concept: c, load, keys, gaze: 'key' });
const blockMan = (text: string) => clause(text, test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })]);
const comboClimb = (role: string) => clause('Uncovered: combo then climb', not(test('defenderOn', { where: 'me' })), [act('comboTo', { target: `role:${RIGHT_OF[role] ?? 'Y'}` }), act('climb')]);
const RPO_TAG: Basis = { claim: 'The line and back run the run unchanged; the pass is a tag; "when in doubt, hand it off"', status: 'Verified', sources: ['galina-rpo', 'kuchar-rpo', 'lamb-rpo', 'hargitt-rpo'] };
const SCREEN_CLASS: Basis = { claim: 'Screens are taught as the answer to pressure; a rusher who reads the screen and stops can deflect it', status: 'Verified', sources: ['alleman-screen', 'finley-lions-screens', 'karlo-screens', 'nguyen-screens'] };

export const BOOK_PLAYS: readonly PlayDef[] = [
  // ---- Y-cross: the Air Raid deep cross from 2x2 ----
  mk('pass_y_cross', 'Y-Cross', 'dropback_pass', G2, null, 'base', [
    ...lineProtect(G2, 'yCross'),
    qb(G2, 'yCross', 'fiveStepFromGun', 'postThenCrosserThenBack', ['role:X', 'role:Y', 'role:R']),
    slot(G2, 'X', route('yCross', [through(10, -16), cut(14, -15), through(28, -6)], { params: { route: 'post' } })),
    slot(G2, 'Y', route('yCross', [through(6, 6.5), through(12, 2), cut(18, -4), through(20, -15)], { params: { route: 'deepCross' } })),
    slot(G2, 'Z', route('yCross', [through(12, 17), through(30, 17)], { params: { route: 'go' } })),
    slot(G2, 'H', route('yCross', [through(5, -9), cut(5, -15)], { params: { route: 'quickOut' } })),
    slot(G2, 'R', route('yCross', [through(-3, 5), settle(2, 9)], { params: { route: 'check' } })),
  ], ['The slot crosses the field at about 18 to 22 yd, under the post and over the linebackers.', 'Read the post first, then the crosser, then the back; it struggles against single-high and Tampa 2 caps the crosser.'], [
    { claim: 'Y-cross: deep cross at 18 to 22 yd from the tight end or slot, a post or go clears, a flat or check underneath', status: 'Verified', sources: ['campbell-ycross', 'fox-ycross', 'sampath-ycross'] },
    { claim: 'Read order: post, crosser, back (Campbell) against vertical, crosser, quick out (Fox)', status: 'Conflict', sources: ['campbell-ycross', 'fox-ycross'] },
    { claim: 'Y-cross struggles against Cover 3 or one-high; Tampa 2 caps the crosser', status: '2 of 3', sources: ['campbell-ycross', 'fox-ycross'] },
    NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  // ---- Spacing: five receivers across the field at quick-game depth ----
  mk('quick_spacing', 'Spacing Right', 'quick_pass', TR, null, 'base', [
    ...lineProtect(TR, 'spacing'),
    qb(TR, 'spacing', 'threeStepFromGun', 'oneOnOneThenInOut', ['role:Y', 'role:H', 'role:Z'], 1.5),
    slot(TR, 'Z', route('spacing', [through(5, 17), settle(5, 16)], { params: { route: 'hitch' } })),
    slot(TR, 'H', route('spacing', [through(5, 11), settle(5.5, 10.5)], { params: { route: 'sit' } })),
    slot(TR, 'Y', route('spacing', [through(1, 5), through(2, 2)], { params: { route: 'flatIn' } })),
    slot(TR, 'X', route('spacing', [through(5, -17), settle(5, -16)], { params: { route: 'hitch' } })),
    slot(TR, 'R', route('spacing', [through(-3, -6), through(0, -10)], { params: { route: 'swing' } })),
  ], ['Receivers about 6 to 8 yd apart sideways stretch the flat and hook defenders.', 'Take any one-on-one first; otherwise read in-out or out-in in quick-game time.'], [
    { claim: 'Spacing: a horizontal stretch of the flat and hook defenders in zone, in quick-game timing', status: 'Verified', sources: ['stein-spacing', 'zitnik-spacing', 'bowen-combos'] },
    { claim: 'Spacing read: full field, in-out or out-in, one-on-one first', status: '2 of 3', sources: ['stein-spacing', 'zitnik-spacing'] },
    { claim: 'Spacing routes at 4 to 6 yd; receivers 6 to 8 yd apart sideways', status: '1 of 3', sources: ['zitnik-spacing'] },
    NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  // ---- Levels: an in-breaker under a deeper dig, high-low on the hook defender ----
  mk('pass_levels', 'Levels Right', 'dropback_pass', G2, null, 'complement', [
    ...lineProtect(G2, 'levels'),
    qb(G2, 'levels', 'fiveStepFromGun', 'hookDefenderHighToLow', ['role:Z', 'role:Y']),
    slot(G2, 'Z', route('levels', [through(12, 17), cut(12, 13), through(12, 2)], { params: { route: 'dig' } })),
    slot(G2, 'Y', route('levels', [through(5, 7.5), cut(5, 4), through(5, -2)], { params: { route: 'in' } })),
    slot(G2, 'X', route('levels', [through(12, -17), through(28, -17)], { params: { route: 'go' } })),
    slot(G2, 'H', route('levels', [through(10, -7.5), through(25, -6)], { params: { route: 'seam' } })),
    backPickup(G2, 'levels'),
  ], ['A short in-breaker under a deeper dig from the same side puts the hook defender in a high-low.'], [
    { claim: 'Levels: a short in-breaker under a deeper dig, high-low on the hook defender', status: '1 of 3', sources: ['bowen-combos'] },
    { claim: 'The dig depth (12 yd) and the in depth (5 yd); dig 10 to 12 yd is sourced for the shallow-cross family only', status: 'Assumption', sources: [] },
    NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  // ---- Now screen: the outside receiver takes the ball at once against an off corner ----
  mk('screen_now', 'Now Screen Right', 'screen', G2, null, 'constraint', [
    ...OL.map((r) => slot(G2, r, { behavior: 'passSet', params: { type: 'quick' }, concept: 'nowScreen', gaze: 'key', rules: [blockMan('Quick set: block the man on me')] })),
    slot(G2, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'oneStepFromGun', read: 'cornerCushion', throw: 'now' }, concept: 'nowScreen', load: 1, keys: ['role:Z'], gaze: 'key' }),
    slot(G2, 'Z', { behavior: 'route', params: { route: 'now' }, path: [through(-0.5, 17), settle(-0.5, 17.5)], concept: 'nowScreen', load: 1, keys: ['qb'], gaze: 'quarterback' }),
    slot(G2, 'Y', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'nowScreen', rules: [clause('Block the nearest defender outside', test('timeGt', { s: 0.2 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
    slot(G2, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'nowScreen' }),
    slot(G2, 'H', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'nowScreen' }),
    slot(G2, 'R', { behavior: 'passSet', params: { type: 'back', side: 'right' }, concept: 'nowScreen' }),
  ], ['Against an off corner (6 yd or more) the outside receiver turns for the ball at once; the slot blocks the nearest defender.'], [
    { claim: 'Now (smoke, hitch) screen: an immediate throw to the outside receiver against soft coverage', status: '2 of 3', sources: ['lamb-rpo', 'hargitt-rpo'] },
    { claim: 'Off corner 6 yd or more: three-step Now; within 5 yd: one-step; pressed: tunnel instead', status: '1 of 3', sources: ['lamb-rpo'] },
    SCREEN_CLASS, DESIGN_VALUES]),

  // ---- Stick RPO: inside zone with the stick as the pass tag, reading the middle linebacker ----
  mk('rpo_stick', 'Inside Zone, Stick Tag', 'rpo', G2, 'right', 'constraint', [
    ...OL.map((role: OLRole) => slot(G2, role, { behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'stickRpo', technique: { runBlock: 'zoneStep' }, gaze: 'key', rules: [blockMan('Covered: block the man on me'), comboClimb(role)] })),
    slot(G2, 'Q', { behavior: 'quarterback', params: { action: 'rpo', read: 'middleLinebacker', run: 'handoff', pass: 'stick' }, concept: 'stickRpo', load: 2, gaze: 'key',
      rules: [clause('Middle linebacker comes downhill: pull and throw the stick', test('read', { kind: 'run', dir: 'any' }), [act('continue')])] }),
    slot(G2, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', aim: 'playsideGuardOutsideLeg', cuts: 1 }, path: [through(-1, -1), through(2, 1.5), cut(7, 3)], concept: 'stickRpo', load: 1.5 }),
    slot(G2, 'Y', route('stickRpo', [through(4.5, 6.5), settle(5, 7)], { params: { route: 'stick' } })),
    slot(G2, 'Z', route('stickRpo', [through(10, 17), through(20, 17)], { params: { route: 'go' } })),
    slot(G2, 'H', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'stickRpo' }),
    slot(G2, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'stickRpo' }),
  ], ['The line locks on inside zone; the quarterback reads the middle linebacker: downhill, pull and throw the stick; widening to take the stick, hand off.'], [
    { claim: 'Stick RPO: the line blocks inside zone, the quarterback reads the middle linebacker; downhill means pull and throw, expanding means hand off', status: '1 of 3', sources: ['hargitt-rpo'] },
    { claim: 'Stick: about 5 yd and sits between zone defenders', status: 'Verified', sources: ['campbell-stick', 'sampath-stick', 'weeklyspiral', 'corrill-stick'] },
    RPO_TAG, ZONE_RULE, DESIGN_VALUES]),
];
