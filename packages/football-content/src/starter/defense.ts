// The eight base defensive calls, one per CoverageFamily (G2.1.1). Each is eleven assignments drawn against
// the gun doubles formation (F2) with alignment RULES relative to the offense; the fixed spot is the picture
// against that formation. Alignment rule grammar (read by WP-14, listed in the package README):
//   lineTech:<n>:<left|right>        technique number on the offensive line (F8.1.1, Verified: 1, 3, 5 used here)
//   rcv:<n>:<side>:<yd>:<leverage>   depth in yards off the receiver numbered n from the sideline in (J4.1.2 selectors)
//   hash:<yd>:<yd>                   depth, lateral offset from the hash (landmark hashPlus2 = two yards outside)
//   lb:<over|gap>:<name>             linebacker landmark, depth set by the behavior's parameters
// Depths no source states are design values (Assumption) and are listed in each call's basis.
import { act, clause, not, test } from './build.ts';
import type { Basis, DefenseDef, Slot } from './types.ts';

type D = Omit<Slot, 'concept' | 'at'> & { at: Slot['at'] };
const mk = (concept: string, load = 1) => (s: D): Slot => ({ ...s, concept, load: s.load ?? load });

const NOBODY_HELPS: Basis = { claim: 'Box counts and linebacker depths not given by a source are design values', status: 'Assumption', sources: [] };

/** Four-man rush: each lineman rushes and fits the run when the play reads as one. */
function line(concept: string): Slot[] {
  const m = mk(concept);
  const lineman = (role: string, tech: string, side: 'left' | 'right', at: [number, number], gap: 'A' | 'B' | 'C'): Slot => m({
    role, behavior: 'passRush', params: { track: 'fourMan', tech: Number(tech) }, at, onLine: true, stance: 'threePoint', rule: `lineTech:${tech}:${side}`, gaze: 'key', keys: ['nearestThreat'],
    technique: { rushMove: 'speedRush', rushCounter: 'swim' },
    rules: [clause('Run read: fit my gap and shed', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap, side: 'mine', shoulder: 'inside' })])],
  });
  return [
    lineman('LDE', '5', 'left', [1, -2.7], 'C'),
    lineman('LDT', '3', 'left', [1, -1.5], 'B'),
    lineman('RDT', '1', 'right', [1, 0.5], 'A'),
    lineman('RDE', '5', 'right', [1, 2.7], 'C'),
  ];
}

const man = (role: string, at: [number, number], rule: string, target: string, tech: 'press' | 'off', extra: Partial<D> = {}, concept = ''): Slot =>
  mk(concept)({ role, behavior: 'manCover', params: { man: target, technique: tech }, at, rule, stance: 'backpedal', gaze: 'man', keys: [target], technique: { coverage: tech === 'press' ? 'pressInside' : 'offInside' },
    rules: [clause('Receiver crosses my face: stay with him', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), clause('Ball in the air to my man: play the ball', test('ballThrownToMyArea'), [act('breakOnBall')])], ...extra });

const zone = (concept: string, role: string, at: [number, number], rule: string, behavior: 'zoneDrop' | 'deepZone', params: Record<string, string | number | boolean>, keys: string[] = ['qb']): Slot =>
  mk(concept)({ role, behavior, params, at, rule, stance: 'backpedal', gaze: 'quarterback', keys, technique: { coverage: 'zoneEyes' },
    rules: [clause('Receiver in my zone: play him', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]), clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] });

// ---- Cover 0 ------------------------------------------------------------------------------------
function cover0(): DefenseDef {
  const c = 'cover0';
  const m = mk(c);
  return {
    id: 'def_cover0_six_man', name: 'Cover 0, Six-Man Pressure', coverageFamily: 'cover0', package: '4-3 base, man, no deep safety', rushers: 6, boxCount: 6, drawnAgainst: 'gun_2x2_11', intent: 'Win before the quarterback can throw; known weak spot is any receiver who beats his man, since nobody is deep.',
    slots: [
      ...line(c),
      m({ role: 'MIKE', behavior: 'blitz', params: { gap: 'B', side: 'right' }, at: [4.5, 0.5], rule: 'lb:gap:rightB', stance: 'twoPoint', rules: [clause('Rush the right B gap on the snap', test('timeGt', { s: 0 }), [act('rush', { track: 'inside', plan: 'bGapBlitz' })])] }),
      m({ role: 'WILL', behavior: 'blitz', params: { gap: 'A', side: 'left' }, at: [4.5, -0.5], rule: 'lb:gap:leftA', stance: 'twoPoint', rules: [clause('Rush the left A gap on the snap', test('timeGt', { s: 0 }), [act('rush', { track: 'inside', plan: 'aGapBlitz' })])] }),
      man('SAM', [4, 7.5], 'rcv:2:left:4:inside', 'role:R', 'off', { at: [4, 7.5] }, c),
      man('LCB', [8, -17], 'rcv:1:left:8:inside', '#1:left', 'off', {}, c),
      man('RCB', [8, 17], 'rcv:1:right:8:inside', '#1:right', 'off', {}, c),
      man('SS', [4, 7.5], 'rcv:2:right:4:inside', '#2:right', 'off', {}, c),
      man('FS', [4, -7.5], 'rcv:2:left:4:inside', '#2:left', 'off', {}, c),
    ],
    basis: [
      { claim: 'Cover 0: every back-end defender is on an eligible receiver with no deep help; six rush', status: 'Verified', sources: ['campbell-cover0', 'haddad-cover0', 'bowen-cover0'] },
      { claim: 'Off-man corners align about 8 yd with an inside shade', status: '1 of 3', sources: ['bowen-cover0'] },
      { claim: 'Assignments by role: corners on the outside receivers, strong safety on the tight end, free safety on the slot, Sam on the back, Mike right B gap and Will left A gap', status: '1 of 3', sources: ['campbell-cover0'] },
      NOBODY_HELPS,
    ],
  };
}

// ---- Cover 1 ------------------------------------------------------------------------------------
function cover1(): DefenseDef {
  const c = 'cover1';
  const m = mk(c);
  return {
    id: 'def_cover1_man_free', name: 'Cover 1, Man Free', coverageFamily: 'cover1', package: '4-3 base, man free, hole player', rushers: 4, boxCount: 6, drawnAgainst: 'gun_2x2_11', intent: 'Tight man with a free safety over the top and a hole player under the crossers; weak to rubs and picks.',
    slots: [
      ...line(c),
      m({ role: 'MIKE', behavior: 'zoneDrop', params: { zone: 'hole', depth: 8 }, at: [4.5, 0], rule: 'lb:over:center', stance: 'twoPoint', gaze: 'quarterback', keys: ['qb'], rules: [clause('Wall off the crosser underneath', test('threatInZone'), [act('wall', { target: 'nearestThreat' })])] }),
      man('WILL', [4.5, -2], 'lb:over:backLeft', 'role:R', 'off', {}, c),
      man('SAM', [4, -7.5], 'rcv:2:left:4:inside', '#2:left', 'off', {}, c),
      man('LCB', [7.5, -17], 'rcv:1:left:7.5:outside', '#1:left', 'off', {}, c),
      man('RCB', [7.5, 17], 'rcv:1:right:7.5:outside', '#1:right', 'off', {}, c),
      man('SS', [4, 7.5], 'rcv:2:right:4:outside', '#2:right', 'off', {}, c),
      zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }, ['qb']),
    ],
    basis: [
      { claim: 'Cover 1: each eligible receiver has one defender, one deep safety in the middle, a hole player or a fifth rusher', status: 'Verified', sources: ['bowen-cover1', 'haddad-cover1', 'bullock-man', 'syed-cover1'] },
      { claim: 'Man defenders align with an outside shade; off-man corners at 7 to 8 yd; inside shade against a plus split', status: '1 of 3', sources: ['bowen-cover1'] },
      { claim: 'Hole variants: robber (safety), plug or hole (linebacker), lurk, bandit, double', status: '2 of 3', sources: ['bullock-man', 'syed-cover1', 'haddad-cover1'] },
      { claim: 'The free safety\'s depth (12 yd) is a design value', status: 'Assumption', sources: [] },
      NOBODY_HELPS,
    ],
  };
}

// ---- Cover 2 ------------------------------------------------------------------------------------
const C2_BASIS: Basis[] = [
  { claim: 'Cover 2: two deep halves and five underneath defenders; corners take the flats, outside linebackers the hook and curl, the middle linebacker the middle hole', status: 'Verified', sources: ['schalter-cover2', 'haddad-cover2', 'steelersdepot-coverages', '33rd-coverage'] },
  { claim: 'Safeties play two yards outside the hash (the landmark of pure Cover 2) at about 15 yd, working to 18 at the snap', status: '2 of 3', sources: ['kuchar-cooke-twoman', 'rb-bowen-cover2'] },
  { claim: 'Corners jam or reroute at the line, then take away the curls and drive on the flat', status: '1 of 3', sources: ['steelersdepot-coverages'] },
];
function cover2(): DefenseDef {
  const c = 'cover2';
  const m = mk(c);
  return {
    id: 'def_cover2_zone', name: 'Cover 2', coverageFamily: 'cover2', package: '4-3 base, two-deep zone', rushers: 4, boxCount: 7, drawnAgainst: 'gun_2x2_11', intent: 'Two safeties over the top and five short zones; weak spot is the seam between the safeties and the deep flat-to-corner window.',
    slots: [
      ...line(c),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'middleHole', depth: 10 }),
      zone(c, 'WILL', [4.5, -3], 'lb:over:left', 'zoneDrop', { zone: 'hookCurlLeft', depth: 10 }),
      zone(c, 'SAM', [4.5, 3], 'lb:over:right', 'zoneDrop', { zone: 'hookCurlRight', depth: 10 }),
      m({ role: 'LCB', behavior: 'zoneDrop', params: { zone: 'flatLeft', jam: true }, at: [5, -17], rule: 'rcv:1:left:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:left'], technique: { coverage: 'jamReroute' }, rules: [clause('Receiver releases vertical: reroute then sink under the safety', test('release', { target: '#1:left', is: 'vertical' }), [act('sink', { yd: 2 })]), clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      m({ role: 'RCB', behavior: 'zoneDrop', params: { zone: 'flatRight', jam: true }, at: [5, 17], rule: 'rcv:1:right:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:right'], technique: { coverage: 'jamReroute' }, rules: [clause('Receiver releases vertical: reroute then sink under the safety', test('release', { target: '#1:right', is: 'vertical' }), [act('sink', { yd: 2 })]), clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      zone(c, 'FS', [15, -5], 'hash:15:-2', 'deepZone', { zone: 'deepHalfLeft', depth: 15, workTo: 18 }),
      zone(c, 'SS', [15, 5], 'hash:15:2', 'deepZone', { zone: 'deepHalfRight', depth: 15, workTo: 18 }),
    ],
    basis: [...C2_BASIS, NOBODY_HELPS],
  };
}

// ---- Cover 3 ------------------------------------------------------------------------------------
function cover3(): DefenseDef {
  const c = 'cover3';
  const m = mk(c);
  return {
    id: 'def_cover3_sky', name: 'Cover 3', coverageFamily: 'cover3', package: '4-3 base, three-deep four-under zone', rushers: 4, boxCount: 7, drawnAgainst: 'gun_2x2_11', intent: 'Rush four and drop seven; weak spot is the seam between the curl-flat and hook defenders and the sideline-to-numbers flat.',
    slots: [
      ...line(c),
      zone(c, 'MIKE', [4.5, -1.5], 'lb:over:leftHook', 'zoneDrop', { zone: 'hookLeft', depth: 11, landmark: 'hashOutside' }),
      m({ role: 'SS', behavior: 'zoneDrop', params: { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }, at: [5, 4], rule: 'lb:over:rightHook', stance: 'twoPoint', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [clause('Run read: fit the force', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap: 'force', side: 'mine', shoulder: 'outside' })]), clause('Threat in my hook: play him', test('threatInZone'), [act('breakOnBall')])] }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:rightCurlFlat', 'zoneDrop', { zone: 'curlFlatRight', depth: 11, landmark: 'numbersTop' }),
      m({ role: 'LCB', behavior: 'deepZone', params: { zone: 'deepThirdLeft', bail: true }, at: [7.5, -17], rule: 'rcv:1:left:7.5:outside', stance: 'backpedal', gaze: 'quarterback', keys: ['#1:left'], technique: { coverage: 'pressBail' }, rules: [clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] }),
      m({ role: 'RCB', behavior: 'deepZone', params: { zone: 'deepThirdRight', bail: true }, at: [7.5, 17], rule: 'rcv:1:right:7.5:outside', stance: 'backpedal', gaze: 'quarterback', keys: ['#1:right'], technique: { coverage: 'pressBail' }, rules: [clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] }),
      zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }),
    ],
    basis: [
      { claim: 'Cover 3: three-deep, four-under zone; rush four, drop seven; both corners take the outside thirds, the free safety the deep middle', status: 'Verified', sources: ['bowen-cover3', 'schalter-cover2', 'steelersdepot-coverages', '33rd-coverage'] },
      { claim: 'Corners align 7 to 8 yd or press-bail; curl-flat defenders drop 10 to 12 yd to the top of the numbers; middle hooks sink 10 to 12 yd outside the hash marks', status: '1 of 3', sources: ['bowen-cover3'] },
      { claim: 'Which defenders are the hooks and the curl-flats in a 4-3 (strong safety down as a hook, Sam and Will curl-flat) follows the buzz description', status: '1 of 3', sources: ['bowen-cover3'] },
      { claim: 'The deep-middle depth of the free safety (12 yd) is a design value; the source only says tighter on short yardage and deeper on long', status: 'Assumption', sources: ['bowen-cover3'] },
      NOBODY_HELPS,
    ],
  };
}

// ---- Cover 4 ------------------------------------------------------------------------------------
function cover4(): DefenseDef {
  const c = 'cover4';
  const m = mk(c);
  const quarter = (role: string, side: 'left' | 'right', at: [number, number]): Slot => m({ role, behavior: 'deepZone', params: { zone: `deepQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'mod' }, at, rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'key', keys: [`#1:${side}`],
    technique: { coverage: 'patternMatch' },
    rules: [clause('Number one goes vertical: cover him', test('release', { target: `#1:${side}`, is: 'vertical' }), [act('trail', { target: `#1:${side}` })]), clause('Number one goes short or inside: sink to my quarter and help inside', not(test('release', { target: `#1:${side}`, is: 'vertical' })), [act('sink', { yd: 3 })])] });
  const safety = (role: string, side: 'left' | 'right', at: [number, number]): Slot => m({ role, behavior: 'deepZone', params: { zone: `insideQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'no2' }, at, rule: `rcv:2:${side}:11:inside`, stance: 'flatFoot', gaze: 'key', keys: [`#2:${side}`],
    technique: { coverage: 'flatFootRead' },
    rules: [clause('Number two goes vertical: cover him', test('release', { target: `#2:${side}`, is: 'vertical' }), [act('trail', { target: `#2:${side}` })]), clause('Number two breaks in or out: help the corner', not(test('release', { target: `#2:${side}`, is: 'vertical' })), [act('squeeze', { yd: 2 })]), clause('Run read: fill downhill', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap: 'D', side: 'mine', shoulder: 'outside' })])] });
  return {
    id: 'def_cover4_quarters', name: 'Cover 4 (Quarters)', coverageFamily: 'cover4', package: '4-3 base, quarters, safeties on number two', rushers: 4, boxCount: 7, drawnAgainst: 'gun_2x2_11', intent: 'Four deep fourths with the safeties reading number two; the flats are the weakness and the safeties fit the run.',
    slots: [
      ...line(c),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'middleHook', depth: 10, wall: true }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:left', 'zoneDrop', { zone: 'flatLeft', depth: 5, buzz: true }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:right', 'zoneDrop', { zone: 'flatRight', depth: 5, buzz: true }),
      quarter('LCB', 'left', [7.5, -17]), quarter('RCB', 'right', [7.5, 17]),
      safety('FS', 'left', [11, -6]), safety('SS', 'right', [11, 6]),
    ],
    basis: [
      { claim: 'Cover 4: two safeties and two corners split the deep field into fourths; Mike takes the middle hook and the outside linebackers the flats', status: 'Verified', sources: ['bowen-cover4', 'haddad-cover4', 'bullock-quarters', 'cason-quarters'] },
      { claim: 'Corners align 7 to 8 yd, safeties 10 to 12 yd', status: '1 of 3', sources: ['bowen-cover4'] },
      { claim: 'Match rules: safeties take number two (vertical: cover him; in or out: support the corner); corners play man-off-deep on number one and zone off to the quarter if he goes short', status: '2 of 3', sources: ['haddad-cover4', 'bowen-cover4', 'cason-quarters'] },
      { claim: 'Safeties fit the run from flat-foot keys; the flats are the weakness of the coverage', status: '2 of 3', sources: ['bowen-cover4', 'bullock-quarters', 'haddad-cover4'] },
      NOBODY_HELPS,
    ],
  };
}

// ---- Cover 6 ------------------------------------------------------------------------------------
function cover6(): DefenseDef {
  const c = 'cover6';
  const m = mk(c);
  return {
    id: 'def_cover6_qqh', name: 'Cover 6 (Quarter-Quarter-Half)', coverageFamily: 'cover6', package: '4-3 base, quarters to the field, Cover 2 to the boundary', rushers: 4, boxCount: 7, drawnAgainst: 'gun_2x2_11', intent: 'Quarters to the passing strength (right, the field), Cover 2 to the boundary; the single-receiver side frees the safety to play the half.',
    slots: [
      ...line(c),
      zone(c, 'MIKE', [4.5, 1], 'lb:over:centerRight', 'zoneDrop', { zone: 'middleHook', depth: 10, controls: 'no3' }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:right', 'zoneDrop', { zone: 'flatRight', depth: 5 }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:left', 'zoneDrop', { zone: 'hookCurlLeft', depth: 10 }),
      // Quarters side (right): corner on number one by match rule, strong safety on number two.
      m({ role: 'RCB', behavior: 'deepZone', params: { zone: 'deepQuarterRight', match: 'mod' }, at: [7.5, 17], rule: 'rcv:1:right:7.5:outside', stance: 'backpedal', gaze: 'key', keys: ['#1:right'], technique: { coverage: 'patternMatch' }, rules: [clause('Number one goes vertical: cover him', test('release', { target: '#1:right', is: 'vertical' }), [act('trail', { target: '#1:right' })]), clause('Number one goes short: sink to my quarter', not(test('release', { target: '#1:right', is: 'vertical' })), [act('sink', { yd: 3 })])] }),
      m({ role: 'SS', behavior: 'deepZone', params: { zone: 'insideQuarterRight', match: 'no2' }, at: [11, 6], rule: 'rcv:2:right:11:inside', stance: 'flatFoot', gaze: 'key', keys: ['#2:right'], technique: { coverage: 'flatFootRead' }, rules: [clause('Number two goes vertical: cover him', test('release', { target: '#2:right', is: 'vertical' }), [act('trail', { target: '#2:right' })]), clause('Run read: fill', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap: 'D', side: 'mine', shoulder: 'outside' })])] }),
      // Cover 2 side (left): corner takes the flat, safety the half.
      m({ role: 'LCB', behavior: 'zoneDrop', params: { zone: 'flatLeft', jam: true }, at: [5, -17], rule: 'rcv:1:left:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:left'], technique: { coverage: 'jamReroute' }, rules: [clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      zone(c, 'FS', [15, -5], 'hash:15:-2', 'deepZone', { zone: 'deepHalfLeft', depth: 15, workTo: 18 }),
    ],
    basis: [
      { claim: 'Cover 6 is quarters to the strength and two-deep (Cover 2) to the weak side', status: 'Verified', sources: ['coiner-boot', 'haddad-splitfield', 'loose-cover6', 'alexander-cover6'] },
      { claim: 'The field side plays quarters, the boundary side plays Cover 2 principles with the corner given help inside; the boundary safety plays the deep half', status: '2 of 3', sources: ['loose-cover6', 'haddad-splitfield', 'coiner-boot'] },
      { claim: 'No source gives yard depths for Cover 6; depths here reuse the Cover 4 and Cover 2 values of their half of the field', status: 'Assumption', sources: [] },
      NOBODY_HELPS,
    ],
  };
}

// ---- Two-man ------------------------------------------------------------------------------------
function twoMan(): DefenseDef {
  const c = 'two_man';
  const m = mk(c);
  return {
    id: 'def_two_man_under', name: '2-Man (Two Deep, Man Under)', coverageFamily: 'two_man', package: '4-3 base, two-deep halves, man under', rushers: 4, boxCount: 6, drawnAgainst: 'gun_2x2_11', intent: 'Man coverage underneath with two safeties over the top; a third-down call. Weak spots: the light box, the deep middle and crossing routes.',
    slots: [
      ...line(c),
      man('MIKE', [4.5, 0], 'lb:over:center', 'role:R', 'off', { rules: [clause('Back stays in to block: look for work and wall crossers', test('myManDrops'), [act('trail', { target: 'man' })])] }, c),
      man('WILL', [5, -7.5], 'rcv:2:left:5:inside', '#2:left', 'press', {}, c),
      man('SAM', [5, 7.5], 'rcv:2:right:5:inside', '#2:right', 'press', {}, c),
      man('LCB', [1, -17], 'rcv:1:left:1:inside', '#1:left', 'press', {}, c),
      man('RCB', [1, 17], 'rcv:1:right:1:inside', '#1:right', 'press', {}, c),
      m({ role: 'FS', behavior: 'deepZone', params: { zone: 'deepHalfLeft', depth: 15, squeeze: true }, at: [15, -5], rule: 'hash:15:-2', stance: 'backpedal', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [clause('A receiver breaks shallow: squeeze to the remaining threat', test('threatInZone'), [act('squeeze', { yd: 2 })])] }),
      m({ role: 'SS', behavior: 'deepZone', params: { zone: 'deepHalfRight', depth: 15, squeeze: true }, at: [15, 5], rule: 'hash:15:2', stance: 'backpedal', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [clause('A receiver breaks shallow: squeeze to the remaining threat', test('threatInZone'), [act('squeeze', { yd: 2 })])] }),
    ],
    basis: [
      { claim: '2-man: two deep zone defenders over the top and man coverage underneath; corners on number one, linebackers or nickel on number two, the middle linebacker on the back', status: 'Verified', sources: ['haddad-cover5', 'svec-twoman', 'kuchar-cooke-twoman', '33rd-coverage'] },
      { claim: 'Safeties use the Cover 2 landmark, two yards outside the hash; they are quarterback readers with trail help on verticals', status: '1 of 3', sources: ['kuchar-cooke-twoman'] },
      { claim: 'Defenders may jam or press knowing it is fine to end up trailing; weaknesses are the light box, the deep middle and crossers', status: '1 of 3', sources: ['svec-twoman'] },
      NOBODY_HELPS,
    ],
  };
}

// ---- Other: Tampa 2 -----------------------------------------------------------------------------
function tampa2(): DefenseDef {
  const c = 'tampa2';
  const m = mk(c);
  return {
    id: 'def_tampa2', name: 'Tampa 2', coverageFamily: 'other', package: '4-3 under, two-deep shell with the middle linebacker deep', rushers: 4, boxCount: 6, drawnAgainst: 'gun_2x2_11', intent: 'A two-high shell that plays three deep zones: the Mike drops to the deep middle. It has no J15.8.1 target row of its own, so it is tagged other; WP-13 and the integrator decide whether it joins Cover 2.',
    slots: [
      ...line(c),
      m({ role: 'MIKE', behavior: 'deepZone', params: { zone: 'deepMiddle', depth: 18, fromLinebacker: true }, at: [4.5, 0], rule: 'lb:over:center', stance: 'twoPoint', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [clause('Run read: stay home and fit', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap: 'A', side: 'mine', shoulder: 'inside' })]), clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:left', 'zoneDrop', { zone: 'hookCurlLeft', depth: 10 }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:right', 'zoneDrop', { zone: 'hookCurlRight', depth: 10 }),
      m({ role: 'LCB', behavior: 'zoneDrop', params: { zone: 'flatLeft', jam: true }, at: [5, -17], rule: 'rcv:1:left:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:left'], technique: { coverage: 'jamReroute' }, rules: [clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      m({ role: 'RCB', behavior: 'zoneDrop', params: { zone: 'flatRight', jam: true }, at: [5, 17], rule: 'rcv:1:right:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:right'], technique: { coverage: 'jamReroute' }, rules: [clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      zone(c, 'FS', [15, -5], 'hash:15:-2', 'deepZone', { zone: 'deepHalfLeft', depth: 15, workTo: 18 }),
      zone(c, 'SS', [15, 5], 'hash:15:2', 'deepZone', { zone: 'deepHalfRight', depth: 15, workTo: 18 }),
    ],
    basis: [
      { claim: 'Tampa 2: the middle linebacker drops to the deep middle like a third safety, splitting the downfield coverage into thirds', status: 'Verified', sources: ['schalter-cover2', 'haddad-cover2', '33rd-coverage', 'steelersdepot-coverages'] },
      { claim: 'Origin: Bud Carson\'s Steelers (Jack Lambert), refined by Dungy and Kiffin with a one-gap 4-3 under', status: '1 of 3', sources: ['schalter-cover2'] },
      { claim: 'The Mike\'s drop depth (18 yd) is a design value; no source states it', status: 'Assumption', sources: [] },
      NOBODY_HELPS,
    ],
  };
}

export const DEFENSE: readonly DefenseDef[] = [cover0(), cover1(), cover2(), cover3(), cover4(), cover6(), twoMan(), tampa2()];
