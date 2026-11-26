// Deferred defensive calls of the full set: Cover 3 Sky, Cover 3 Cloud, Cover 3 match, a goal-line 6-5 and a prevent
// (F10, F13, G2). Same conventions as defense.ts; helpers are local copies so the WP-25 file stays untouched.
// Sources: research/scheme-sources/deferred-plays-and-packages.md through the ids in sources-more.ts.
import type { Basis, DefenseDef, Slot } from '../starter/types.ts';
import { act, clause, not, test } from '../starter/build.ts';

type D = Omit<Slot, 'concept' | 'at'> & { at: Slot['at'] };
const mk = (concept: string, load = 1) => (s: D): Slot => ({ ...s, concept, load: s.load ?? load });

const NOBODY_HELPS: Basis = { claim: 'Box counts, linebacker depths and any alignment that no source states are design values', status: 'Assumption', sources: [] };
const COVER3_BASE: Basis = { claim: 'Cover 3: three-deep, four-under zone; both corners take the outside thirds, a safety the deep middle', status: 'Verified', sources: ['bowen-cover3', 'schalter-cover2', 'steelersdepot-coverages', '33rd-coverage'] };
const RUN_FIT = (gap: 'A' | 'B' | 'C') => clause('Run read: fit my gap and shed', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap, side: 'mine', shoulder: 'inside' })]);
const BREAK = clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')]);

const lineman = (c: string, role: string, tech: string, side: 'left' | 'right', at: [number, number], gap: 'A' | 'B' | 'C'): Slot => mk(c)({
  role, behavior: 'passRush', params: { track: 'fourMan', tech: Number(tech) }, at, onLine: true, stance: 'threePoint', rule: `lineTech:${tech}:${side}`, gaze: 'key', keys: ['nearestThreat'],
  technique: { rushMove: 'speedRush', rushCounter: 'swim' }, rules: [RUN_FIT(gap)],
});
const fourMan = (c: string): Slot[] => [
  lineman(c, 'LDE', '5', 'left', [1, -2.7], 'C'), lineman(c, 'LDT', '3', 'left', [1, -1.5], 'B'),
  lineman(c, 'RDT', '1', 'right', [1, 0.5], 'A'), lineman(c, 'RDE', '5', 'right', [1, 2.7], 'C'),
];
const zone = (c: string, role: string, at: [number, number], rule: string, behavior: 'zoneDrop' | 'deepZone', params: Record<string, string | number | boolean>, keys: string[] = ['qb']): Slot =>
  mk(c)({ role, behavior, params, at, rule, stance: 'backpedal', gaze: 'quarterback', keys, technique: { coverage: 'zoneEyes' },
    rules: [clause('Receiver in my zone: play him', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]), BREAK] });
const deepThird = (c: string, role: string, side: 'left' | 'right', at: [number, number] = [7.5, side === 'left' ? -17 : 17], rule = `rcv:1:${side}:7.5:outside`): Slot =>
  mk(c)({ role, behavior: 'deepZone', params: { zone: `deepThird${side === 'left' ? 'Left' : 'Right'}`, bail: true }, at, rule, stance: 'backpedal', gaze: 'quarterback', keys: [`#1:${side}`], technique: { coverage: 'pressBail' }, rules: [BREAK] });
const call = (id: string, name: string, coverageFamily: DefenseDef['coverageFamily'], pkg: string, rushers: number, boxCount: number, drawnAgainst: string, intent: string, slots: Slot[], basis: Basis[]): DefenseDef =>
  ({ id, name, coverageFamily, package: pkg, rushers, boxCount, drawnAgainst, intent, slots, basis });

// ---- Cover 3 Sky ---------------------------------------------------------------------------------
function cover3Sky(): DefenseDef {
  const c = 'cover3SkyFlat';
  return call('def_cover3_sky_flat', 'Cover 3 Sky (strong safety to the flat)', 'cover3', '4-3 base, three-deep, strong safety rotated to the flat', 4, 7, 'gun_2x2_11',
    'Corners and the free safety take the deep thirds; the strong safety rotates down and takes the strong flat. Weak spot: the seam behind the rotated safety and the weak flat against a quick throw.', [
      ...fourMan(c),
      zone(c, 'SS', [6, 7.5], 'rcv:2:right:6:outside', 'zoneDrop', { zone: 'curlFlatRight', depth: 10, landmark: 'numbersTop', rotated: true }),
      zone(c, 'SAM', [4.5, 3], 'lb:over:rightHook', 'zoneDrop', { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'MIKE', [4.5, -1], 'lb:over:leftHook', 'zoneDrop', { zone: 'hookLeft', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'WILL', [4.5, -4.5], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }),
      deepThird(c, 'LCB', 'left'), deepThird(c, 'RCB', 'right'),
      zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }),
    ], [
      COVER3_BASE,
      { claim: 'Sky: the two corners and a safety take the deep thirds; the other (strong) safety rotates down and takes the flat', status: '2 of 3', sources: ['xsos-cloudsky', 'fantasypoints-cover3'] },
      { claim: 'Cloud, Sky and Buzz are named Cover 3 variants used against RPOs and receiver screens', status: '1 of 3', sources: ['ruley-cover3'] },
      { claim: 'The hook and weak curl-flat assignments of the linebackers and all depths are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Cover 3 Cloud -------------------------------------------------------------------------------
function cover3Cloud(): DefenseDef {
  const c = 'cover3Cloud';
  return call('def_cover3_cloud', 'Cover 3 Cloud (corner to the flat)', 'cover3', '4-3 base, two-high look rotated to three-deep, strong-side corner in the flat', 4, 7, 'gun_2x2_11',
    'From a two-high shell the strong-side corner jams number one and sits in the flat while the strong safety rolls to the deep outside third and the free safety to the middle. Weak spot: the hole-shot between the corner and the rolling safety.', [
      ...fourMan(c),
      mk(c)({ role: 'RCB', behavior: 'zoneDrop', params: { zone: 'cloudFlatRight', depth: 5, jam: true }, at: [1, 17], rule: 'rcv:1:right:1:outside', stance: 'press', gaze: 'key', keys: ['#1:right'], technique: { coverage: 'pressInside' },
        rules: [clause('Jam number one, then sink to cushion the corner route', test('timeGt', { s: 0 }), [act('sink', { yd: 5 })]), BREAK] }),
      mk(c)({ role: 'SS', behavior: 'deepZone', params: { zone: 'deepThirdRight', rotated: true }, at: [12, 9], rule: 'hash:12:9', stance: 'backpedal', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [BREAK] }),
      zone(c, 'FS', [12, -9], 'hash:12:-9', 'deepZone', { zone: 'deepMiddle', depth: 12, rotated: true }),
      deepThird(c, 'LCB', 'left'),
      zone(c, 'SAM', [4.5, 3], 'lb:over:rightHook', 'zoneDrop', { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'MIKE', [4.5, -1], 'lb:over:leftHook', 'zoneDrop', { zone: 'hookLeft', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'WILL', [4.5, -4.5], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }),
    ], [
      COVER3_BASE,
      { claim: 'Cloud: one corner and both safeties take the deep thirds; the other corner jams number one and plays the flat', status: 'Verified', sources: ['bowen-cover3', 'fantasypoints-cover3', 'xsos-cloudsky'] },
      { claim: 'From two high, the closed-side safety rolls to the deep outside third and the free safety to the deep middle; the open-side corner bails; the cloud corner sinks to cushion the corner route; the inside linebackers take the middle hooks', status: '1 of 3', sources: ['bowen-cover3'] },
      { claim: 'The open-side curl-flat (Bowen uses a nickel back) is the Will here, and all depths are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Cover 3 match -------------------------------------------------------------------------------
function cover3Match(): DefenseDef {
  const c = 'cover3Match';
  const corner = (role: string, side: 'left' | 'right'): Slot => mk(c)({ role, behavior: 'deepZone', params: { zone: `deepThird${side === 'left' ? 'Left' : 'Right'}`, match: 'no1Vertical' }, at: [7.5, side === 'left' ? -17 : 17], rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'key', keys: [`#1:${side}`], technique: { coverage: 'patternMatch' },
    rules: [clause('Number one goes vertical: man him deep', test('release', { target: `#1:${side}`, is: 'vertical' }), [act('trail', { target: `#1:${side}` })]), clause('Number one goes short or crosses: drop to my third as a zone player', not(test('release', { target: `#1:${side}`, is: 'vertical' })), [act('sink', { yd: 4 })]), BREAK] });
  const overhang = (role: string, side: 'left' | 'right', at: [number, number]): Slot => mk(c)({ role, behavior: 'zoneDrop', params: { zone: `curlFlat${side === 'left' ? 'Left' : 'Right'}`, depth: 10, match: 'no2Vertical' }, at, rule: `rcv:2:${side}:5:outside`, stance: 'twoPoint', gaze: 'key', keys: [`#2:${side}`], technique: { coverage: 'patternMatch' },
    rules: [clause('Number two goes vertical: carry him up the seam', test('release', { target: `#2:${side}`, is: 'vertical' }), [act('carry', { target: `#2:${side}`, toDepth: 18 })]), clause('Number two goes to the flat: wall him and take the flat', test('release', { target: `#2:${side}`, is: 'flat' }), [act('wall', { target: `#2:${side}` })]), BREAK] });
  return call('def_cover3_match', 'Cover 3 Match (Rip/Liz style)', 'cover3', '4-3 base, single-high pattern match', 4, 7, 'gun_2x2_11',
    'Cover 3 that turns to man by route: corners man a vertical number one and play zone if he crosses, the overhangs carry a vertical number two up the seam, a hook player robs number three, the middle safety takes the fourth vertical. Weak spot: crossers against the matching underneath players and a long-developing double move.', [
      ...fourMan(c),
      corner('LCB', 'left'), corner('RCB', 'right'),
      overhang('SS', 'right', [5, 7.5]), overhang('WILL', 'left', [5, -7]),
      mk(c)({ role: 'MIKE', behavior: 'zoneDrop', params: { zone: 'hookLeft', depth: 10, robber: true }, at: [4.5, -1], rule: 'lb:over:leftHook', stance: 'twoPoint', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' },
        rules: [clause('Number three releases inside: pick him up', test('threatInZone'), [act('wall', { target: 'nearestThreat' })]), BREAK] }),
      zone(c, 'SAM', [4.5, 2.5], 'lb:over:rightHook', 'zoneDrop', { zone: 'hookRight', depth: 10, undercut: true }),
      zone(c, 'FS', [14, 0], 'hash:14:0', 'deepZone', { zone: 'deepMiddle', depth: 14, match: 'fourthVertical' }),
    ], [
      COVER3_BASE,
      { claim: 'Pattern-match Cover 3 (credited to Saban): corners play man only if number one goes vertical and drop to zone if receivers cross', status: 'Verified', sources: ['elevenwarriors-match', 'bowen-cover3', 'cogan-ripliz'] },
      { claim: 'The underneath defender reads number two vertical and carries him up the seam; a robber picks up number three released inside', status: '2 of 3', sources: ['steelersdepot-ripliz', 'cogan-ripliz'] },
      { claim: 'Against 2x2: overhangs match number two if he is vertical after three steps; the middle safety starts at 14 yd and backpedals to about 20', status: '1 of 3', sources: ['cogan-ripliz'] },
      { claim: 'What "Rip" and "Liz" mean: strength calls that say which safety rolls down, or the name of the match coverage itself', status: 'Conflict', sources: ['elevenwarriors-match', 'cogan-ripliz', 'steelersdepot-ripliz'] },
      { claim: 'Which defenders are the overhangs and the robber in a 4-3 and the carry depth (18 yd) are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Goal line 6-5 -------------------------------------------------------------------------------
function goalLine65(): DefenseDef {
  const c = 'goalLine65';
  const dl = (role: string, at: [number, number], rule: string, gap: 'A' | 'B' | 'C', text: string, contain = false): Slot => mk(c)({
    role, behavior: 'passRush', params: { track: contain ? 'contain' : 'penetrate' }, at, onLine: true, stance: 'fourPoint', rule, gaze: 'key', keys: ['nearestThreat'], technique: { rushMove: 'bullRush', rushCounter: 'rip' },
    rules: [clause(text, test('timeGt', { s: 0 }), [act('rush', { track: contain ? 'outside' : 'straight' })]), ...(contain ? [clause('Ball comes my way: keep outside containment', test('read', { kind: 'run', dir: 'toMe' }), [act('contain')])] : [RUN_FIT(gap)])],
  });
  const lb = (role: string, side: 'left' | 'right', at: [number, number]): Slot => mk(c)({ role, behavior: 'runFit', params: { gap: 'C', side: 'mine' }, at, rule: `lb:over:${side}Guard`, stance: 'twoPoint', gaze: 'key', keys: ['role:R'],
    rules: [clause('Run my way: fit the C gap', test('read', { kind: 'run', dir: 'any' }), [act('fit', { gap: 'C', side: 'mine', shoulder: 'inside' })]), clause('Pass: take the back out to my side', test('read', { kind: 'pass', dir: 'any' }), [act('switchBehavior', { to: 'manCover' })])] });
  const man = (role: string, target: string, at: [number, number], rule: string): Slot => mk(c)({ role, behavior: 'manCover', params: { man: target, technique: 'press' }, at, rule, stance: 'twoPoint', gaze: 'man', keys: [target], technique: { coverage: 'pressInside' },
    rules: [clause('Receiver crosses my face: stay with him', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), BREAK] });
  return call('def_goal_line_65', 'Goal Line 6-5', 'cover0', 'goal line, six down linemen, two linebackers, three defensive backs in man', 6, 11, 'uc_goal_line_23',
    'Six down linemen penetrate gaps, the ends keep contain, two linebackers fit the C gaps, and three defensive backs play man on the tight ends. Aim: negative plays, no touchdowns. Weak spot: a pick or crossing route against the man defenders and a pass to the flat.', [
      dl('LDE', [1, -5.5], 'lineTech:9:left', 'C', 'End: 1.5 yd outside the last man, rush but keep contain', true),
      dl('LDT', [1, -2.5], 'lineTech:4:left', 'B', 'Tackle: penetrate the B gap'),
      dl('LNT', [1, -0.5], 'lineTech:1:left', 'A', 'Nose: penetrate the A gap'),
      dl('RNT', [1, 0.5], 'lineTech:1:right', 'A', 'Nose: penetrate the A gap'),
      dl('RDT', [1, 2.5], 'lineTech:4:right', 'B', 'Tackle: penetrate the B gap'),
      dl('RDE', [1, 5.5], 'lineTech:9:right', 'C', 'End: 1.5 yd outside the last man, rush but keep contain', true),
      lb('MIKE', 'right', [3, 1.5]), lb('WILL', 'left', [3, -1.5]),
      man('LCB', 'role:H', [2, -3], 'rcv:1:left:2:outside'),
      man('RCB', 'role:Z', [2, 4.5], 'rcv:2:right:2:outside'),
      man('SS', 'role:Y', [2, 3], 'rcv:1:right:2:inside'),
    ], [
      { claim: 'Goal-line fronts put six (or five) linemen down with two linebackers and three defensive backs (6-5, 6-2, 5-3)', status: 'Verified', sources: ['schrader-goalline', 'mitchell-gorilla', 'coiner-goalline'] },
      { claim: '6-5: two noses in the A gaps; tackles penetrate the B gap (4i with a tight end, 5 technique without); ends 1.5 yd outside the last man, blitz but keep contain; linebackers 3 yd deep on the guard\'s outside shoulder, C gap with a tight end', status: '1 of 3', sources: ['schrader-goalline'] },
      { claim: 'The defensive backs play man (head up on the tight ends); the goal is negative plays and forcing field goals', status: '2 of 3', sources: ['schrader-goalline', 'mitchell-gorilla'] },
      { claim: 'Each linebacker takes the back out to his side on a pass; the man targets against three tight ends are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Prevent -------------------------------------------------------------------------------------
function prevent(): DefenseDef {
  const c = 'prevent';
  const deep = (role: string, at: [number, number], rule: string, zoneName: string): Slot => mk(c)({ role, behavior: 'deepZone', params: { zone: zoneName, depth: at[0], keepEverythingInFront: true }, at, rule, stance: 'backpedal', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' },
    rules: [clause('Stay deeper than the deepest receiver in my zone', test('threatInZone'), [act('sink', { yd: 3 })]), BREAK] });
  const end = (role: string, side: 'left' | 'right', at: [number, number]): Slot => mk(c)({ role, behavior: 'passRush', params: { track: 'contain' }, at, onLine: true, stance: 'threePoint', rule: `lineTech:5:${side}`, gaze: 'key', keys: ['qb'], technique: { rushMove: 'speedRush', rushCounter: 'swim' },
    rules: [clause('Rush and contain the quarterback', test('timeGt', { s: 0 }), [act('rush', { track: 'outside' }), act('contain')])] });
  const tackle = (role: string, side: 'left' | 'right', at: [number, number]): Slot => mk(c)({ role, behavior: 'passRush', params: { track: 'upfield' }, at, onLine: true, stance: 'threePoint', rule: `lineTech:3:${side}`, gaze: 'key', keys: ['nearestThreat'], technique: { rushMove: 'speedRush', rushCounter: 'swim' },
    rules: [clause('Rush up the field', test('timeGt', { s: 0 }), [act('rush', { track: 'straight' })])] });
  return call('def_prevent', 'Prevent', 'other', 'prevent, four rush, layered deep zones', 4, 5, 'gun_2x2_11',
    'Late in a half when the offense must score: rush four with the ends containing, keep corners, safeties and two linebackers deep and the Sam in the wide flat against screens and a running quarterback. Gives up the short throw to keep everything in front.', [
      end('LDE', 'left', [1, -2.7]), tackle('LDT', 'left', [1, -1.5]), tackle('RDT', 'right', [1, 1.5]), end('RDE', 'right', [1, 2.7]),
      deep('LCB', [15, -17], 'rcv:1:left:15:outside', 'deepThirdLeft'),
      deep('RCB', [15, 17], 'rcv:1:right:15:outside', 'deepThirdRight'),
      deep('FS', [20, -6], 'hash:20:-6', 'deepHalfLeft'),
      deep('SS', [20, 6], 'hash:20:6', 'deepHalfRight'),
      deep('MIKE', [10, 2], 'hash:10:2', 'deepMiddle'),
      deep('WILL', [10, -2], 'hash:10:-2', 'deepMiddle'),
      zone(c, 'SAM', [5, 9], 'rcv:2:right:5:outside', 'zoneDrop', { zone: 'flatRight', depth: 5, screenAndQb: true }),
    ], [
      { claim: 'Prevent is used when little time is left in a half or game and the offense must score, and on third or fourth and long; most defenders drop deep', status: '2 of 3', sources: ['yfo-prevent', 'hernandez-goalline'] },
      { claim: 'Ends contain the quarterback, tackles rush up the field; safeties 20+ yd, corners 15+ yd on the deep thirds, Mike and Will 10+ yd in the deep middle, the Sam in the wide-side flat for screens and a mobile quarterback', status: '1 of 3', sources: ['yfo-prevent'] },
      { claim: 'The page calls it "cover 4" but describes corners on deep thirds and layered safeties; the call is filed under "other" and the exact depths are the page\'s minimums', status: 'Assumption', sources: ['yfo-prevent'] },
      { claim: 'The page builds it from a 5-3 by swapping the nose for an extra cover man; this version starts from the 4-3 and the linebackers\' lateral spots are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Short-yardage bear, Cover 0 -----------------------------------------------------------------
function shortYardageBear(): DefenseDef {
  const c = 'shortYardageBear';
  const manUp = (role: string, target: string, at: [number, number], rule: string, stance = 'press'): Slot => mk(c)({ role, behavior: 'manCover', params: { man: target, technique: 'press' }, at, rule, stance, gaze: 'man', keys: [target], technique: { coverage: 'pressInside' },
    rules: [clause('Receiver crosses my face: stay with him', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), BREAK] });
  const force = (role: string, side: 'left' | 'right', at: [number, number], rule: string): Slot => mk(c)({ role, behavior: 'blitz', params: { gap: 'force', side: 'mine' }, at, rule, onLine: true, stance: 'twoPoint', gaze: 'key', keys: ['nearestThreat'],
    rules: [clause('Force: keep outside leverage and turn the ball inside', test('read', { kind: 'run', dir: 'any' }), [act('fit', { gap: 'force', side: 'mine', shoulder: 'outside' })]), clause('Pass: rush and contain', test('read', { kind: 'pass', dir: 'any' }), [act('rush', { track: 'outside' }), act('contain')])] });
  return call('def_short_yardage_bear', 'Short Yardage Bear, Cover 0', 'cover0', '46 bear: nose two-gap, both guards covered by 3 techniques, outside linebackers walked up as force, man behind with no deep safety', 5, 9, 'uc_i_form_21',
    'Third or fourth and two or less: cover both guards and the centre so nobody can climb, walk the outside linebackers up as force players and play man with everyone. Weak spot: no deep help, so a play-action shot or a pick beats it.', [
      lineman(c, 'LDT', '3', 'left', [1, -1.5], 'B'),
      mk(c)({ role: 'NT', behavior: 'passRush', params: { track: 'twoGap' }, at: [1, 0], onLine: true, stance: 'fourPoint', gaze: 'key', keys: ['role:C'], technique: { rushMove: 'bullRush', rushCounter: 'rip' }, rules: [RUN_FIT('A')] }),
      lineman(c, 'RDT', '3', 'right', [1, 1.5], 'B'),
      force('LOLB', 'left', [1, -3], 'lineTech:5:left'),
      force('ROLB', 'right', [1, 4], 'lineTech:9:right'),
      mk(c)({ role: 'SAM', behavior: 'runFit', params: { gap: 'C', side: 'mine' }, at: [3, 2.5], rule: 'lb:gap:rightC', stance: 'twoPoint', gaze: 'key', keys: ['role:R'], rules: [clause('Run: fit the C gap', test('read', { kind: 'run', dir: 'any' }), [act('fit', { gap: 'C', side: 'mine', shoulder: 'inside' })])] }),
      manUp('MIKE', 'role:F', [4, 0.5], 'lb:over:center', 'twoPoint'),
      manUp('WILL', 'role:R', [4, -2], 'lb:over:left', 'twoPoint'),
      manUp('LCB', 'role:X', [1, -17], 'rcv:1:left:1:inside'),
      manUp('RCB', 'role:Z', [1, 16], 'rcv:1:right:1:inside'),
      manUp('FS', 'role:Y', [3, 3.5], 'rcv:2:right:3:outside', 'twoPoint'),
    ], [
      { claim: 'Short yardage: defenses load the box (eight, nine or more) with run-stopping linemen against heavy sets', status: 'Verified', sources: ['smalley-bear', 'coiner-oregon', 'davidson-shortyardage'] },
      { claim: 'The bear front is a preferred goal-line and short-yardage defense', status: '2 of 3', sources: ['long-bear', 'smalley-bear'] },
      { claim: 'Short yardage (third or fourth and two or less) is a separate situation from goal line (inside the two regardless of down)', status: '1 of 3', sources: ['davidson-shortyardage'] },
      { claim: '46 bear: the nose two-gaps off the centre; tackle and end are heavy 3 techniques keying the guard; outside linebackers walk up outside the weak tackle and the tight end as force players; the Sam is a C-gap player; Mike takes number three strong and Will number two weak; Cover 0 with corners in tight man and the free safety close on the tight end', status: '1 of 3', sources: ['smalley-bear'] },
      { claim: 'Who the Mike and Will man up on against an I-formation (fullback and tailback) and all depths are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Cover 4 MEG ---------------------------------------------------------------------------------
function cover4Meg(): DefenseDef {
  const c = 'cover4Meg';
  const corner = (role: string, side: 'left' | 'right'): Slot => mk(c)({ role, behavior: 'manCover', params: { man: `#1:${side}`, technique: 'off', call: 'meg' }, at: [7.5, side === 'left' ? -17 : 17], rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'man', keys: [`#1:${side}`], technique: { coverage: 'offInside' },
    rules: [clause('Man everywhere he goes: stay on number one', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), BREAK] });
  const safety = (role: string, side: 'left' | 'right'): Slot => mk(c)({ role, behavior: 'deepZone', params: { zone: `insideQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'no2' }, at: [11, side === 'left' ? -5 : 5], rule: `rcv:2:${side}:11:inside`, stance: 'flatFoot', gaze: 'key', keys: [`#2:${side}`], technique: { coverage: 'flatFootRead' },
    rules: [clause('Number two goes vertical: take him', test('release', { target: `#2:${side}`, is: 'vertical' }), [act('trail', { target: `#2:${side}` })]), clause('Number two stays short: double number one over the top', not(test('release', { target: `#2:${side}`, is: 'vertical' })), [act('squeeze', { yd: 3 })]), BREAK] });
  return call('def_cover4_meg', 'Cover 4 MEG', 'cover4', '4-3 base, quarters with the corners locked in man', 4, 7, 'gun_2x2_11',
    'Quarters where the corners take number one everywhere he goes; the safeties take number two if he goes vertical and otherwise double number one. Weak spot: a corner beaten one on one when number two holds the safety.', [
      ...fourMan(c),
      corner('LCB', 'left'), corner('RCB', 'right'), safety('FS', 'left'), safety('SS', 'right'),
      zone(c, 'WILL', [4.5, -4.5], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 8, wall: '#2' }),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'hookMiddle', depth: 10 }),
      zone(c, 'SAM', [4.5, 4.5], 'lb:over:rightCurlFlat', 'zoneDrop', { zone: 'curlFlatRight', depth: 8, wall: '#2' }),
    ], [
      { claim: 'Quarters: corners take the outside quarter over number one, safeties read number two', status: 'Verified', sources: ['bowen-cover4', 'haddad-cover4', 'bullock-quarters', 'coyote-cover4'] },
      { claim: 'MEG: the corner takes number one in man everywhere he goes', status: '2 of 3', sources: ['cason-quarters', 'coyote-cover4'] },
      { claim: 'In MEG the safeties take number two vertical (5-7 yd) and otherwise double number one', status: '1 of 3', sources: ['coyote-cover4'] },
      { claim: 'Corners 7-8 yd and safeties 10-12 yd off the ball', status: '2 of 3', sources: ['bowen-cover4', 'bullock-quarters'] },
      { claim: 'The linebackers\' underneath zones are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Cover 4 Solo (3x1) --------------------------------------------------------------------------
function cover4Solo(): DefenseDef {
  const c = 'cover4Solo';
  return call('def_cover4_solo', 'Cover 4 Solo (vs trips)', 'cover4', '4-3 base, quarters against 3x1 with the back-side corner alone on the single receiver', 4, 7, 'gun_trips_right_11',
    'Against trips the back-side corner is left alone on the single receiver, the free safety slides over to take number three to the trips side, and the strong safety widens over number two. Weak spot: the single receiver one on one, and number three crossing under the safety.', [
      ...fourMan(c),
      mk(c)({ role: 'LCB', behavior: 'manCover', params: { man: '#1:left', technique: 'off', call: 'solo' }, at: [7.5, -17], rule: 'rcv:1:left:7.5:outside', stance: 'backpedal', gaze: 'man', keys: ['#1:left'], technique: { coverage: 'offInside' },
        rules: [clause('Solo: man on the single receiver with no help', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), BREAK] }),
      mk(c)({ role: 'RCB', behavior: 'deepZone', params: { zone: 'deepQuarterRight', match: 'mod' }, at: [7.5, 17], rule: 'rcv:1:right:7.5:outside', stance: 'backpedal', gaze: 'key', keys: ['#1:right'], technique: { coverage: 'patternMatch' },
        rules: [clause('Number one goes vertical: cover him', test('release', { target: '#1:right', is: 'vertical' }), [act('trail', { target: '#1:right' })]), clause('Number one goes short or inside: sink to my quarter', not(test('release', { target: '#1:right', is: 'vertical' })), [act('sink', { yd: 3 })])] }),
      mk(c)({ role: 'SS', behavior: 'deepZone', params: { zone: 'insideQuarterRight', match: 'no2' }, at: [11, 11], rule: 'rcv:2:right:11:inside', stance: 'flatFoot', gaze: 'key', keys: ['#2:right'], technique: { coverage: 'flatFootRead' },
        rules: [clause('Number two goes vertical: take him', test('release', { target: '#2:right', is: 'vertical' }), [act('trail', { target: '#2:right' })]), BREAK] }),
      mk(c)({ role: 'FS', behavior: 'deepZone', params: { zone: 'deepMiddle', match: 'no3' }, at: [11, 3], rule: 'rcv:3:right:11:inside', stance: 'flatFoot', gaze: 'key', keys: ['#3:right'], technique: { coverage: 'flatFootRead' },
        rules: [clause('Number three goes vertical: take him', test('release', { target: '#3:right', is: 'vertical' }), [act('trail', { target: '#3:right' })]), BREAK] }),
      zone(c, 'SAM', [4.5, 9], 'rcv:2:right:4.5:inside', 'zoneDrop', { zone: 'curlFlatRight', depth: 8, wall: '#2' }),
      zone(c, 'MIKE', [4.5, 2.5], 'lb:over:rightHook', 'zoneDrop', { zone: 'hookRight', depth: 10, relate: '#3' }),
      zone(c, 'WILL', [4.5, -2.5], 'lb:over:leftHook', 'zoneDrop', { zone: 'hookLeft', depth: 10 }),
    ], [
      { claim: 'Quarters: corners take the outside quarter over number one, safeties read number two', status: 'Verified', sources: ['bowen-cover4', 'haddad-cover4', 'bullock-quarters', 'coyote-cover4'] },
      { claim: 'Against 3x1 the back-side corner plays the single receiver in man without help', status: '2 of 3', sources: ['bowen-cover4', 'kou-trips'] },
      { claim: 'Solo: the free safety overlaps number three to the closed side and the strong safety widens over number two', status: '1 of 3', sources: ['bowen-cover4'] },
      { claim: 'What "Solo" means: the back-side corner alone (Bowen) or the boundary safety freed from number three for the run fit (Lehigh)', status: 'Conflict', sources: ['bowen-cover4', 'kuchar-solo'] },
      { claim: 'The trips-side Mike relates to number three', status: '1 of 3', sources: ['cason-quarters'] },
      { claim: 'The Sam\'s wall on number two, the Will\'s hook and all depths are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

export const MORE_DEFENSE: readonly DefenseDef[] = [cover3Sky(), cover3Cloud(), cover3Match(), goalLine65(), prevent(), shortYardageBear(), cover4Meg(), cover4Solo()];
