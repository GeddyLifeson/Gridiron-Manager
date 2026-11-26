// Dropback and quick-game passes of the full set (F6, G1). All drawn to the right (G1.4.2). Route depths come from
// the sources in research/scheme-sources/pass-concepts-and-reads.md; where sources disagree the basis says Conflict.
import type { PlayDef, Slot } from '../starter/types.ts';
import { DESIGN_VALUES, NUMBERED_FROM_SIDELINE, OL, ROUTE_DEPTH, act, clause, cut, protect, route, settle, slot, test, through, type Basis } from './kit.ts';

const lineProtect = (F: string, c: string): Slot[] => OL.map((r) => slot(F, r, protect(c)));
const backPickup = (F: string, c: string): Slot => slot(F, 'R', { behavior: 'passSet', params: { type: 'back', job: 'blitzPickup' }, concept: c, rules: [clause('Block the first rusher who shows outside the tackles', test('rushersVsBlockers', { side: 'mine' }), [act('block', { target: 'nearestRusher', type: 'base' })])] });
const qb = (F: string, c: string, drop: string, read: string, keys: string[], extra: Record<string, string | number | boolean> = {}, load = 1.5): Slot =>
  slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop, read, ...extra }, concept: c, load, keys, gaze: 'key' });
const PICK_SIDE: Basis = { claim: 'The quarterback picks the side by leverage, numbers and the shell', status: 'Verified', sources: ['klatt-quickgame', 'drinkall', 'stein-spacing', 'kuchar-rpo'] };

const pass = (id: string, name: string, kind: PlayDef['kind'], F: string, shotgun: boolean, personnel: string, intent: PlayDef['intent'], slots: Slot[], coachingPoints: string[], basis: Basis[]): PlayDef =>
  ({ id, name, kind, personnel, formationId: F, shotgun, runDirection: null, intent, slots, coachingPoints, basis, drawnTo: 'right' });

const G2 = 'gun_2x2_11';
const TR = 'gun_trips_right_11';
const UC = 'uc_singleback_11';

export const FULL_PASSES: readonly PlayDef[] = [
  pass('pass_slant_flat', 'Slant-Flat Right', 'quick_pass', G2, true, '11', 'base', [
    ...lineProtect(G2, 'slantFlat'),
    qb(G2, 'slantFlat', 'threeStepFromGun', 'flatDefender', ['role:Y', 'role:Z']),
    slot(G2, 'Z', route('slantFlat', [through(2, 16), cut(6, 11)], { params: { route: 'slant' } })),
    slot(G2, 'Y', route('slantFlat', [through(0, 10), settle(0.5, 14)], { params: { route: 'flat' } })),
    slot(G2, 'X', route('slantFlat', [through(12, -17), through(25, -17)], { params: { route: 'go' } })),
    slot(G2, 'H', route('slantFlat', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
    backPickup(G2, 'slantFlat'),
  ], ['Read the flat defender: if he widens with the flat route throw the slant; if he sits or chases inside throw the flat.', 'Strong against Cover 2, where the corner holds the flat.'], [
    { claim: 'Slant-flat: read the flat defender; he widens, throw the slant; he sits or chases inside, throw the flat', status: 'Verified', sources: ['bowen-slantflat', 'dunn-slantflat', 'hewitt-reads'] },
    { claim: 'Slant-flat is a strong answer to Cover 2 and the quarterback reads high to low on the flat defender', status: '2 of 3', sources: ['bowen-slantflat', 'dunn-slantflat'] },
    PICK_SIDE, NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_curl_flat', 'Curl-Flat Right', 'dropback_pass', G2, true, '11', 'base', [
    ...lineProtect(G2, 'curlFlat'),
    qb(G2, 'curlFlat', 'fiveStepFromGun', 'curlFlatDefenderHighToLow', ['role:Z', 'role:Y']),
    slot(G2, 'Z', route('curlFlat', [through(13, 17), settle(11, 17)], { params: { route: 'curl' } })),
    slot(G2, 'Y', route('curlFlat', [through(0, 10), settle(0.5, 14)], { params: { route: 'flat' } })),
    slot(G2, 'X', route('curlFlat', [through(13, -17), settle(11, -17)], { params: { route: 'curl' } })),
    slot(G2, 'H', route('curlFlat', [through(0, -10), settle(0.5, -14)], { params: { route: 'flat' } })),
    backPickup(G2, 'curlFlat'),
  ], ['Read the curl-flat defender from high to low: if he takes the flat, throw the curl; if he sits on the curl, throw the flat.', 'Strong against three-deep, four-under zone.'], [
    { claim: 'Curl-flat reads the curl-flat defender from high to low', status: 'Verified', sources: ['bowen-curlflat', 'dunn-slantflat', 'hewitt-reads'] },
    { claim: 'Curl-flat is strong against three-deep, four-under coverage', status: '2 of 3', sources: ['bowen-curlflat', 'dunn-slantflat'] },
    { claim: 'The curl breaks at 12 to 15 yd (Bowen); 12 yd here is the low end', status: '1 of 3', sources: ['bowen-curlflat'] },
    ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_snag', 'Snag Right', 'quick_pass', TR, true, '11', 'base', [
    ...lineProtect(TR, 'snag'),
    qb(TR, 'snag', 'threeStepFromGun', 'flatThenSnagThenCorner', ['role:Y', 'role:H', 'role:Z']),
    slot(TR, 'Z', route('snag', [through(9, 17), cut(12, 21)], { params: { route: 'corner' } })),
    slot(TR, 'H', route('snag', [through(6, 11), settle(6, 11.5)], { params: { route: 'snag' } })),
    slot(TR, 'Y', route('snag', [through(1, 9), settle(1, 13)], { params: { route: 'flat' } })),
    slot(TR, 'X', route('snag', [through(12, -17), through(25, -17)], { params: { route: 'go' } })),
    backPickup(TR, 'snag'),
  ], ['Corner, snag and flat form a triangle on the flat defender and the corner.', 'Read the flat defender first, then the snag, with the corner as the alert.'], [
    { claim: 'Snag (spot): corner, snag and flat; stress on the flat defender and the corner', status: 'Verified', sources: ['kuchar-snag', 'weeklyspiral-snag', 'steelersdepot-sail', 'bowen-curlflat'] },
    { claim: 'Read order is the flat defender first, then the snag, with the corner as the alert; with the middle open high-low the flat defender, with the middle closed high-low the corner', status: '2 of 3', sources: ['weeklyspiral-snag', 'kuchar-snag'] },
    NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_smash', 'Smash Right', 'quick_pass', G2, true, '11', 'base', [
    ...lineProtect(G2, 'smash'),
    qb(G2, 'smash', 'threeStepFromGun', 'cornerOrFlatDefenderHighToLow', ['role:Z', 'role:Y']),
    slot(G2, 'Z', route('smash', [through(6, 17), settle(5, 17)], { params: { route: 'hitch' } })),
    slot(G2, 'Y', route('smash', [through(9, 8.5), cut(13, 14)], { params: { route: 'corner' } })),
    slot(G2, 'X', route('smash', [through(12, -17), through(25, -17)], { params: { route: 'go' } })),
    slot(G2, 'H', route('smash', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
    backPickup(G2, 'smash'),
  ], ['The outside hitch and the inside corner put a high-low on the corner (two-deep) or the flat defender.', 'Throw the corner when the corner sits on the hitch; throw the hitch when he bails.'], [
    { claim: 'Smash: outside hitch, inside corner, high-low on the corner or flat defender in two-deep', status: 'Verified', sources: ['campbell-smash', 'weeklyspiral-smash', 'glazier-smash', 'wilhite-smash'] },
    { claim: 'Hitch depth: 5 yd (Campbell) or 6 yd (Weekly Spiral); corner at 10 to 12 yd', status: 'Conflict', sources: ['campbell-smash', 'weeklyspiral-smash'] },
    { claim: 'Against three-deep: whether the corner sinks and the hitch opens, the sources disagree', status: 'Conflict', sources: ['campbell-smash', 'weeklyspiral-smash', 'glazier-smash'] },
    NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_sail', 'Sail Right', 'dropback_pass', G2, true, '11', 'complement', [
    ...lineProtect(G2, 'sail'),
    qb(G2, 'sail', 'fiveStepFromGun', 'highToLowThreeLevels', ['role:Z', 'role:Y', 'role:R']),
    slot(G2, 'Z', route('sail', [through(10, 17), through(30, 17)], { params: { route: 'go' } })),
    slot(G2, 'Y', route('sail', [through(12, 8), cut(14, 16)], { params: { route: 'sail' } })),
    slot(G2, 'R', { behavior: 'route', params: { route: 'flat' }, path: [through(-2, 6), settle(1, 12)], concept: 'sail', keys: ['qb'], gaze: 'quarterback' }),
    slot(G2, 'X', route('sail', [through(12, -17), cut(12, -9), through(13, -2)], { params: { route: 'cross' } })),
    slot(G2, 'H', route('sail', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
  ], ['Go, deep out and flat put three levels on one side and strain the deep-third corner and the flat defender.', 'Read from deep to shallow on a clean look; a back-side crosser is the alert.'], [
    { claim: 'Flood (sail): a go, a deep out or sail at 12 to 15 yd and a flat; three levels strain the deep-third corner and the flat defender', status: 'Verified', sources: ['ita-sail', 'kou-sail', 'steelersdepot-sail', 'bowen-curlflat'] },
    { claim: 'The quarterback reads deep to shallow on a clean look', status: '2 of 3', sources: ['evely-boot', 'coiner-boot'] },
    NUMBERED_FROM_SIDELINE, ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_mesh', 'Mesh Right', 'quick_pass', G2, true, '11', 'base', [
    ...lineProtect(G2, 'mesh'),
    qb(G2, 'mesh', 'threeStepFromGun', 'wheelThenShallowThenSit', ['role:R', 'role:H', 'role:Y']),
    slot(G2, 'H', route('mesh', [through(2, -7.5), through(3, 0), through(4, 8)], { params: { route: 'shallow' } })),
    slot(G2, 'Y', route('mesh', [through(2, 7.5), through(3, 0), through(4, -8)], { params: { route: 'shallow' } })),
    slot(G2, 'Z', route('mesh', [through(10, 17), cut(15, 22)], { params: { route: 'corner' } })),
    slot(G2, 'X', route('mesh', [through(10, -17), settle(10, -14)], { params: { route: 'sit' } })),
    slot(G2, 'R', { behavior: 'route', params: { route: 'wheel' }, path: [through(-2, 6), through(2, 13), through(14, 15)], concept: 'mesh', keys: ['qb'], gaze: 'quarterback' }),
  ], ['Two shallow crossers pass within a yard of each other; man defenders fight the traffic and zone crossers sit in a window.', 'A corner or wheel over the top is the shot; read wheel, then the shallow routes, then the sit.'], [
    { claim: 'Mesh: two shallow crossers, a corner or wheel over the top; man defenders fight traffic, zone crossers sit', status: 'Verified', sources: ['campbell-mesh', 'kolste-mesh', 'fox-mesh', 'kuchar-rub'] },
    { claim: 'Crosser depth: 3 to 5 yd (Campbell) or 5 to 6 yd (Fox)', status: 'Conflict', sources: ['campbell-mesh', 'fox-mesh'] },
    { claim: 'The crossers pass "low-five, no space between"', status: '1 of 3', sources: ['kolste-mesh'] },
    { claim: 'Read order: Holgorsen wheel, shallow, sit; Eagles wheel, under shallow, over shallow; Campbell flare, shallow, deep drag, arrow', status: 'Conflict', sources: ['fox-mesh', 'kolste-mesh', 'campbell-mesh'] },
    { claim: 'Mesh is weak to Cover 2 and the zone blitz', status: '2 of 3', sources: ['kolste-mesh', 'campbell-mesh'] },
    ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_shallow_cross', 'Shallow Cross Right', 'dropback_pass', G2, true, '11', 'base', [
    ...lineProtect(G2, 'shallowCross'),
    qb(G2, 'shallowCross', 'fiveStepFromGun', 'shallowThenDigThenPostThenBack', ['role:H', 'role:Y', 'role:Z']),
    slot(G2, 'H', route('shallowCross', [through(3, -7), through(3, 0), through(3.5, 9)], { params: { route: 'shallow' } })),
    slot(G2, 'Y', route('shallowCross', [through(11, 8), cut(11, -4), through(11, -12)], { params: { route: 'dig' } })),
    slot(G2, 'Z', route('shallowCross', [through(10, 17), cut(22, 10)], { params: { route: 'post' } })),
    slot(G2, 'X', route('shallowCross', [through(12, -17), through(25, -17)], { params: { route: 'clear' } })),
    backPickup(G2, 'shallowCross'),
  ], ['One shallow crosser near the line and a dig behind from the other side; too deep a shallow lets the Will or nickel cover both.', 'A post from the far side holds the safety.'], [
    { claim: 'Shallow cross: one shallow and a dig behind from the other side', status: 'Verified', sources: ['campbell-shallow', 'fox-mesh', 'wilhite-smash', 'streelman-shallow'] },
    { claim: 'The shallow is at 1 to 3 yd (Fox) or 2 yd on the linemen\'s heels (Streelman); the dig at 10 to 12 yd', status: '2 of 3', sources: ['fox-mesh', 'streelman-shallow'] },
    { claim: 'The shallow is drawn at 3 yd, the top of the sourced range, so it clears the line it crosses', status: 'Assumption', sources: [] },
    { claim: 'Read order: shallow, dig, post, back (Streelman); post, drag, basic, back (Campbell)', status: 'Conflict', sources: ['streelman-shallow', 'campbell-shallow'] },
    ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_dagger', 'Dagger Right', 'dropback_pass', G2, true, '11', 'complement', [
    ...lineProtect(G2, 'dagger'),
    qb(G2, 'dagger', 'fiveStepFromGun', 'linebackerHighLow', ['role:Y', 'role:Z']),
    slot(G2, 'Y', route('dagger', [through(10, 7.5), through(25, 7.5)], { params: { route: 'seamClear' } })),
    slot(G2, 'Z', route('dagger', [through(15, 17), cut(16, 5), through(16, -4)], { params: { route: 'dig' } })),
    slot(G2, 'X', route('dagger', [through(2, -17), through(2.5, -6), through(3, 2)], { params: { route: 'drag' } })),
    slot(G2, 'H', route('dagger', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
    backPickup(G2, 'dagger'),
  ], ['The inside vertical clears the safety; the outside dig breaks behind him at 15 to 18 yd.', 'The vertical bends inside against two-high and stays on the seam against one-high.'], [
    { claim: 'Dagger: inside clear-out vertical with an outside dig behind it', status: 'Verified', sources: ['ita-dagger', 'weeklyspiral-dagger', 'kou-dagger'] },
    { claim: 'The dig breaks at 15 yd (Scouting Academy) or 16 to 18 yd (Weekly Spiral); the drag is at 2 to 3 yd', status: '2 of 3', sources: ['ita-dagger', 'weeklyspiral-dagger'] },
    { claim: 'The vertical bends inside against two-high and stays on the seam against one-high', status: '1 of 3', sources: ['weeklyspiral-dagger'] },
    ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_yankee', 'Yankee Right', 'dropback_pass', UC, false, '11', 'shot', [
    ...lineProtect(UC, 'yankee'),
    qb(UC, 'yankee', 'sevenStep', 'postThenCrosserThenFlat', ['role:X', 'role:Y', 'role:Z'], {}, 2),
    slot(UC, 'X', route('yankee', [through(10, -17), cut(22, -9), through(35, -4)], { params: { route: 'skinnyPost' } })),
    slot(UC, 'Y', route('yankee', [through(8, 3), cut(19, -3), through(20, -12)], { params: { route: 'deepOver' } })),
    slot(UC, 'Z', route('yankee', [through(0, 18), settle(2, 21)], { params: { route: 'flat' } })),
    slot(UC, 'H', route('yankee', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
    backPickup(UC, 'yankee'),
  ], ['A deep over from one side and a deep post from the other bind a single-high safety: he cannot protect the post and drive on the cross.', 'Against two-high, go underneath.'], [
    { claim: 'Yankee: a deep over on one side, a deep post on the other, a flat for control; binds the single-high safety', status: 'Verified', sources: ['campbell-yankee', 'kolste-yankee', 'ita-yankee'] },
    { claim: 'Read order: post, over, flat; the safety cannot protect the post and drive on the over', status: '1 of 3', sources: ['kolste-yankee'] },
    { claim: 'A shot into the wrong coverage ends in a check-down; against two-high, go underneath', status: '1 of 3', sources: ['campbell-yankee'] },
    ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_post_wheel', 'Post-Wheel Right', 'dropback_pass', TR, true, '11', 'shot', [
    ...lineProtect(TR, 'postWheel'),
    qb(TR, 'postWheel', 'fiveStepFromGun', 'postThenWheel', ['role:Z', 'role:H'], {}, 2),
    slot(TR, 'Z', route('postWheel', [through(10, 17), cut(22, 8)], { params: { route: 'post' } })),
    slot(TR, 'H', route('postWheel', [through(0, 13), through(3, 19), through(25, 20)], { params: { route: 'wheel' } })),
    slot(TR, 'Y', route('postWheel', [through(2, 8), settle(5, 9)], { params: { route: 'check' } })),
    slot(TR, 'X', route('postWheel', [through(12, -17), through(25, -17)], { params: { route: 'go' } })),
    backPickup(TR, 'postWheel'),
  ], ['The outside receiver\'s post clears the corner; the inside receiver wheels up the sideline.', 'Four-load post-wheel attacks Cover 3 into the boundary; the nickel must carry the wheel.'], [
    { claim: 'Post-wheel: the post clears and the wheel runs the sideline; the pair cross at about 5 yd', status: 'Verified', sources: ['ita-wheel', 'kou-postwheel', 'alexander-wheel'] },
    { claim: 'The four-load double post-wheel attacks Cover 3 into the boundary; the nickel carries the wheel with a squat or trail technique', status: '2 of 3', sources: ['alexander-wheel', 'kou-postwheel'] },
    ROUTE_DEPTH, DESIGN_VALUES]),

  pass('pass_mills', 'Mills Right', 'dropback_pass', G2, true, '11', 'shot', [
    ...lineProtect(G2, 'mills'),
    qb(G2, 'mills', 'fiveStepFromGun', 'digThenPost', ['role:H', 'role:X'], {}, 2),
    slot(G2, 'H', route('mills', [through(12, -7.5), cut(13, -1), through(13, 6)], { params: { route: 'dig' } })),
    slot(G2, 'X', route('mills', [through(10, -17), cut(20, -8)], { params: { route: 'post' } })),
    slot(G2, 'Z', route('mills', [through(10, 17), through(30, 17)], { params: { route: 'go' } })),
    slot(G2, 'Y', route('mills', [through(5, 7.5), settle(6, 8)], { params: { route: 'check' } })),
    backPickup(G2, 'mills'),
  ], ['The dig pulls the safety down and the post goes over him.', 'It works best against Cover 4 and quarters.'], [
    { claim: 'Mills: the dig pulls the safety down and the post goes over him', status: 'Verified', sources: ['ita-mills', 'weeklyspiral-mills', 'coyote-switch'] },
    { claim: 'Mills works best against Cover 4 and quarters', status: 'Verified', sources: ['ita-mills', 'weeklyspiral-mills', 'coyote-switch'] },
    ROUTE_DEPTH, DESIGN_VALUES]),
];
