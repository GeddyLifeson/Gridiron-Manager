// Defensive calls of the full set (F8, F10, F11, G2). Same conventions as the starter calls: eleven assignments drawn
// against gun doubles, alignment rules read by WP-14 (lineTech, rcv, hash, lb), depths no source states are Assumption.
// Roles beyond the 4-3 names: NB (nickel back), DB (dime back), NT (nose), LOLB/ROLB/LILB/RILB (3-4 linebackers).
import { DEFENSE as STARTER_DEFENSE } from '../starter/index.ts';
import type { Basis, DefenseDef, Slot } from '../starter/types.ts';
import { act, clause, not, test } from '../starter/build.ts';
import { MORE_DEFENSE } from './defense-more.ts';

type D = Omit<Slot, 'concept' | 'at'> & { at: Slot['at'] };
const mk = (concept: string, load = 1) => (s: D): Slot => ({ ...s, concept, load: s.load ?? load });

const NOBODY_HELPS: Basis = { claim: 'Box counts, linebacker depths and any alignment that no source states are design values', status: 'Assumption', sources: [] };
const RUN_FIT = (gap: 'A' | 'B' | 'C') => clause('Run read: fit my gap and shed', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap, side: 'mine', shoulder: 'inside' })]);

const lineman = (c: string, role: string, tech: string, side: 'left' | 'right', at: [number, number], gap: 'A' | 'B' | 'C'): Slot => mk(c)({
  role, behavior: 'passRush', params: { track: 'fourMan', tech: Number(tech) }, at, onLine: true, stance: 'threePoint', rule: `lineTech:${tech}:${side}`, gaze: 'key', keys: ['nearestThreat'],
  technique: { rushMove: 'speedRush', rushCounter: 'swim' }, rules: [RUN_FIT(gap)],
});
const fourMan = (c: string, skip: string[] = []): Slot[] => [
  lineman(c, 'LDE', '5', 'left', [1, -2.7], 'C'), lineman(c, 'LDT', '3', 'left', [1, -1.5], 'B'),
  lineman(c, 'RDT', '1', 'right', [1, 0.5], 'A'), lineman(c, 'RDE', '5', 'right', [1, 2.7], 'C'),
].filter((s) => !skip.includes(s.role));

const man = (c: string, role: string, at: [number, number], rule: string, target: string, tech: 'press' | 'off'): Slot =>
  mk(c)({ role, behavior: 'manCover', params: { man: target, technique: tech }, at, rule, stance: 'backpedal', gaze: 'man', keys: [target], technique: { coverage: tech === 'press' ? 'pressInside' : 'offInside' },
    rules: [clause('Receiver crosses my face: stay with him', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), clause('Ball in the air to my man: play the ball', test('ballThrownToMyArea'), [act('breakOnBall')])] });

const zone = (c: string, role: string, at: [number, number], rule: string, behavior: 'zoneDrop' | 'deepZone', params: Record<string, string | number | boolean>, keys: string[] = ['qb']): Slot =>
  mk(c)({ role, behavior, params, at, rule, stance: 'backpedal', gaze: 'quarterback', keys, technique: { coverage: 'zoneEyes' },
    rules: [clause('Receiver in my zone: play him', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]), clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] });

const rusher = (c: string, role: string, at: [number, number], rule: string, gap: 'A' | 'B' | 'C', plan: string): Slot =>
  mk(c)({ role, behavior: 'blitz', params: { gap: gap, side: 'mine' }, at, rule, stance: 'twoPoint', rules: [clause(`Rush the ${gap} gap on the snap`, test('timeGt', { s: 0 }), [act('rush', { track: 'inside', plan })])] });

const deepThird = (c: string, role: string, side: 'left' | 'right'): Slot => {
  const y = side === 'left' ? -17 : 17;
  return mk(c)({ role, behavior: 'deepZone', params: { zone: `deepThird${side === 'left' ? 'Left' : 'Right'}`, bail: true }, at: [7.5, y], rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'quarterback', keys: [`#1:${side}`], technique: { coverage: 'pressBail' },
    rules: [clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] });
};

const COVER3_BASE: Basis = { claim: 'Cover 3: three-deep, four-under zone; both corners take the outside thirds, a safety the deep middle', status: 'Verified', sources: ['bowen-cover3', 'schalter-cover2', 'steelersdepot-coverages', '33rd-coverage'] };
const COVER1_BASE: Basis = { claim: 'Cover 1: each eligible receiver has one defender, one deep safety in the middle, a hole player or a fifth rusher', status: 'Verified', sources: ['bowen-cover1', 'haddad-cover1', 'bullock-man', 'syed-cover1'] };
const NICKEL: Basis = { claim: 'Nickel is five defensive backs; the 4-2-5 swaps a linebacker for the nickel back (the slot corner)', status: 'Verified', sources: ['dudko-nickel', 'haddad-nickel', 'mascolo-nickel'] };

const call = (id: string, name: string, coverageFamily: DefenseDef['coverageFamily'], pkg: string, rushers: number, boxCount: number, intent: string, slots: Slot[], basis: Basis[]): DefenseDef =>
  ({ id, name, coverageFamily, package: pkg, rushers, boxCount, drawnAgainst: 'gun_2x2_11', intent, slots, basis });

// ---- Cover 1 Robber ------------------------------------------------------------------------------
function cover1Robber(): DefenseDef {
  const c = 'cover1Robber';
  return call('def_cover1_robber', 'Cover 1 Robber', 'cover1', '4-3 base, man free, strong safety as robber', 4, 7,
    'Man everywhere with the strong safety dropping into the hole to take crossers and the deep safety in the middle; it looks like a two-high shell before the snap. Weak spot: the robber can leave number one open.', [
      ...fourMan(c),
      man(c, 'MIKE', [4.5, 0.5], 'lb:over:center', 'role:R', 'off'),
      man(c, 'WILL', [4, -7.5], 'rcv:2:left:4:inside', '#2:left', 'off'),
      man(c, 'SAM', [4, 7.5], 'rcv:2:right:4:inside', '#2:right', 'off'),
      man(c, 'LCB', [7.5, -17], 'rcv:1:left:7.5:outside', '#1:left', 'off'),
      man(c, 'RCB', [7.5, 17], 'rcv:1:right:7.5:outside', '#1:right', 'off'),
      mk(c)({ role: 'SS', behavior: 'zoneDrop', params: { zone: 'hole', depth: 8, robber: true }, at: [11, 5], rule: 'hash:11:2', stance: 'twoPoint', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' },
        rules: [clause('Crosser or number three in the middle: take him', test('threatInZone'), [act('wall', { target: 'nearestThreat' })]), clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] }),
      zone(c, 'FS', [13, -2], 'hash:13:-2', 'deepZone', { zone: 'deepMiddle', depth: 13 }),
    ], [
      COVER1_BASE,
      { claim: 'Robber: the strong safety drops into the hole and the deep safety drifts to the deep middle; man coverage across the board with corners on an outside shade', status: '2 of 3', sources: ['hicks-robber', 'kou-manfree'] },
      { claim: 'The hole safety takes crossers, number three or the tight end; a hole defender can leave number one open', status: '1 of 3', sources: ['kou-manfree'] },
      { claim: 'Hole variants: robber (safety), plug or hole (linebacker), lurk, bandit, double', status: '2 of 3', sources: ['bullock-man', 'syed-cover1', 'haddad-cover1'] },
      { claim: 'The robber\'s depth (8 yd) and the deep safety\'s depth (13 yd) are design values; no page gives yards', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Cover 3 with flipped safeties ---------------------------------------------------------------
function cover3Flip(): DefenseDef {
  const c = 'cover3Flip';
  return call('def_cover3_flip', 'Cover 3, Safeties Flipped', 'cover3', '4-3 base, three-deep, free safety rolled to the weak flat', 4, 7,
    'Cover 3 with the free safety rolled down to the weak flat and the strong safety deep in the middle third; the strong outside linebacker takes the strong curl-flat. Weak spots: the strong flat and a quick throw over the weak flat.', [
      ...fourMan(c),
      zone(c, 'MIKE', [4.5, 1], 'lb:over:centerRight', 'zoneDrop', { zone: 'hookCurlRight', depth: 11 }),
      zone(c, 'WILL', [4.5, -3], 'lb:over:left', 'zoneDrop', { zone: 'hookCurlLeft', depth: 11 }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:rightCurlFlat', 'zoneDrop', { zone: 'curlFlatRight', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'FS', [5, -9], 'rcv:2:left:5:inside', 'zoneDrop', { zone: 'flatLeft', depth: 5, rolled: true }),
      zone(c, 'SS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }),
      deepThird(c, 'LCB', 'left'), deepThird(c, 'RCB', 'right'),
    ], [
      COVER3_BASE,
      { claim: 'Flip your safeties: the free safety rolls to the weak flat, the strong safety stays high in the deep third, the strong outside linebacker takes the strong curl-flat, Mike and Will take hook and curl', status: '1 of 3', sources: ['campbell-cover3'] },
      { claim: 'Cover 3 comes in named variations (Cloud, Sky, Buzz), each aimed at certain concepts; the page gives the concepts but not the assignments', status: '1 of 3', sources: ['ruley-cover3'] },
      { claim: 'Hashes are the landmark for the thirds and corners play "deeper than the deepest"; no depths in yards are given', status: '1 of 3', sources: ['campbell-cover3'] },
      NOBODY_HELPS]);
}

// ---- Cover 3 fire zone ---------------------------------------------------------------------------
function cover3FireZone(): DefenseDef {
  const c = 'cover3FireZone';
  return call('def_cover3_fire_zone', 'Cover 3 Fire Zone (Under Smash)', 'cover3', '4-3 under, five rush, three deep and three under', 5, 6,
    'Five rush and six drop: Sam and Mike blitz to the closed side, the open-side end drops to the seam-flat, the Will takes the middle hook. Weak spot: only five rush and one man short in coverage if the blitz shows early.', [
      lineman(c, 'LDT', '3', 'left', [1, -1.5], 'B'), lineman(c, 'RDT', '1', 'right', [1, 0.5], 'A'), lineman(c, 'RDE', '5', 'right', [1, 2.7], 'C'),
      mk(c)({ role: 'LDE', behavior: 'zoneDrop', params: { zone: 'seamFlatLeft', depth: 5, match: 'no2', fromLine: true }, at: [1, -2.7], onLine: true, stance: 'threePoint', rule: 'lineTech:5:left', gaze: 'quarterback', keys: ['#2:left'], technique: { coverage: 'zoneEyes' },
        rules: [clause('Receiver in the seam or flat: match number two and drive on the flat', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]), clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] }),
      rusher(c, 'MIKE', [4.5, 0.5], 'lb:gap:rightB', 'B', 'bGapBlitz'),
      rusher(c, 'SAM', [4.5, 4], 'lb:gap:rightC', 'C', 'edgeBlitz'),
      zone(c, 'WILL', [4.5, -1], 'lb:over:leftHook', 'zoneDrop', { zone: 'middleHook', depth: 10, match: 'no3' }),
      zone(c, 'SS', [5, 7.5], 'rcv:2:right:5:inside', 'zoneDrop', { zone: 'seamFlatRight', depth: 5, match: 'no2' }),
      zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }),
      deepThird(c, 'LCB', 'left'), deepThird(c, 'RCB', 'right'),
    ], [
      { claim: 'The zone blitz is a five-man pressure with six dropping into three-deep, three-under coverage', status: '1 of 3', sources: ['bowen-zoneblitz'] },
      { claim: 'Under Smash: Sam and Mike blitz to the closed side; the open-side end drops to the seam-flat matching number two; the Will takes the middle hook matching number three; the strong safety takes the closed seam-flat; the free safety the deep middle; corners bail to the deep thirds', status: '1 of 3', sources: ['bowen-zoneblitz'] },
      { claim: 'Fire zones run on base Cover 3 principles with no new techniques, so the eyes stay on the quarterback', status: '1 of 3', sources: ['hancock-firezone'] },
      COVER3_BASE,
      { claim: 'The defense is one man short in coverage and can be exposed if the blitz shows early; the page gives no depths', status: '1 of 3', sources: ['bowen-zoneblitz'] },
      NOBODY_HELPS]);
}

// ---- Cover 3 fire 3 (simulated pressure) ---------------------------------------------------------
function cover3Fire3(): DefenseDef {
  const c = 'cover3Fire3';
  return call('def_cover3_fire3_sim', 'Cover 3 Fire 3 (Simulated Pressure)', 'cover3', '4-3 base, four rush with the strong safety, end dropping', 4, 6,
    'Four rush, but the strong safety comes off the edge and the boundary end drops, so the blocking is wrong while coverage keeps three deep and four under. Weak spot: the strong safety\'s hook is empty.', [
      lineman(c, 'LDT', '3', 'left', [1, -1.5], 'B'), lineman(c, 'RDT', '1', 'right', [1, 0.5], 'A'), lineman(c, 'RDE', '5', 'right', [1, 2.7], 'C'),
      mk(c)({ role: 'LDE', behavior: 'zoneDrop', params: { zone: 'curlFlatLeft', depth: 8, fromLine: true }, at: [1, -2.7], onLine: true, stance: 'threePoint', rule: 'lineTech:5:left', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' },
        rules: [clause('Receiver in my zone: play him', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]), clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])] }),
      rusher(c, 'SS', [5, 5], 'lb:gap:rightC', 'C', 'edgeBlitz'),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'hookMiddle', depth: 11 }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:rightCurlFlat', 'zoneDrop', { zone: 'curlFlatRight', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12, carries: 'no2Vertical' }),
      deepThird(c, 'LCB', 'left'), deepThird(c, 'RCB', 'right'),
    ], [
      { claim: 'Fire 3 is run with Cover 3: a defensive back or linebacker rushes from the edge in exchange for a lineman dropping, so the pressure is simulated with four', status: '1 of 3', sources: ['hoover-fire3'] },
      { claim: 'The corner on number one plays rip-liz rules, the free safety carries number two\'s vertical, the Will is the curl-flat player', status: '1 of 3', sources: ['hoover-fire3'] },
      { claim: 'Fire 3 is an "extra safe" pressure that keeps three deep and four under', status: '1 of 3', sources: ['hoover-fire3'] },
      COVER3_BASE, NOBODY_HELPS]);
}

// ---- Cover 4 palms -------------------------------------------------------------------------------
function cover4Palms(): DefenseDef {
  const c = 'cover4Palms';
  const corner = (role: string, side: 'left' | 'right'): Slot => {
    const y = side === 'left' ? -17 : 17;
    return mk(c)({ role, behavior: 'deepZone', params: { zone: `deepQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'palms', read: 'no2' }, at: [7.5, y], rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'key', keys: [`#2:${side}`], technique: { coverage: 'patternMatch' },
      rules: [clause('Number two goes out or to the flat: break toward him', test('release', { target: `#2:${side}`, is: 'out' }), [act('widen', { yd: 3 })]),
        clause('Number two breaks in: revert to number one', test('release', { target: `#2:${side}`, is: 'in' }), [act('trail', { target: `#1:${side}` })]),
        clause('Number two goes vertical: stay deep', test('release', { target: `#2:${side}`, is: 'vertical' }), [act('sink', { yd: 3 })])] });
  };
  const safety = (role: string, side: 'left' | 'right'): Slot => mk(c)({ role, behavior: 'deepZone', params: { zone: `insideQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'palms', read: 'no2' }, at: [11, side === 'left' ? -6 : 6], rule: `rcv:2:${side}:11:inside`, stance: 'flatFoot', gaze: 'key', keys: [`#2:${side}`], technique: { coverage: 'flatFootRead' },
    rules: [clause('Number two breaks out: play number one', test('release', { target: `#2:${side}`, is: 'out' }), [act('trail', { target: `#1:${side}` })]),
      clause('Number two breaks in: work my eyes back to number one', not(test('release', { target: `#2:${side}`, is: 'out' })), [act('squeeze', { yd: 2 })])] });
  return call('def_cover4_palms', 'Cover 4 Palms (2-Read)', 'cover4', '4-3 base, quarters family, corner and safety both read number two', 4, 7,
    'The corner and the safety both read number two: out or flat and the corner jumps it while the safety takes number one; in and the corner reverts to number one. Beats bubbles and flat games; weak to comeback-out combinations and the double post.', [
      ...fourMan(c),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'middleHook', depth: 10, wall: true }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:left', 'zoneDrop', { zone: 'flatLeft', depth: 5 }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:right', 'zoneDrop', { zone: 'flatRight', depth: 5 }),
      corner('LCB', 'left'), corner('RCB', 'right'), safety('FS', 'left'), safety('SS', 'right'),
    ], [
      { claim: 'Palms (also called trap, bait or jump): in a 2x2 the corner reads number two; a bubble or out and the corner breaks toward him, an in-break and he reverts to number one, a vertical and he stays deep', status: '1 of 3', sources: ['haddad-palms'] },
      { claim: 'The safety also reads number two: if number two breaks out the safety plays number one; if he breaks in, the safety\'s eyes work back to number one', status: '1 of 3', sources: ['haddad-palms'] },
      { claim: 'Palms beats the bubble and flat games; it loses to the comeback-out combination, the double post and the smash', status: '1 of 3', sources: ['haddad-palms'] },
      { claim: 'Palms (2-Read) is treated as a member of the quarters family; the page is an episode outline and gives no rules', status: '1 of 3', sources: ['alexander-palms'] },
      { claim: 'The linebackers\' flats and hook, and all depths, are the quarters values reused (no source gives them for palms)', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Nickel Cover 1 ------------------------------------------------------------------------------
function nickelCover1(): DefenseDef {
  const c = 'nickelCover1';
  return call('def_nickel_cover1', 'Nickel Cover 1 (4-2-5, Man Free)', 'cover1', '4-2-5 nickel, man free, deep middle safety', 4, 6,
    'The nickel back covers the slot in man with a deep safety over the top; the base answer to a three-receiver set. Weak spot: rubs and picks against tight man.', [
      ...fourMan(c),
      man(c, 'MIKE', [4.5, 0.5], 'lb:over:center', 'role:R', 'off'),
      man(c, 'WILL', [4, -7.5], 'rcv:2:left:4:inside', '#2:left', 'off'),
      man(c, 'NB', [4, 7.5], 'rcv:2:right:4:inside', '#2:right', 'off'),
      man(c, 'LCB', [7.5, -17], 'rcv:1:left:7.5:outside', '#1:left', 'off'),
      man(c, 'RCB', [7.5, 17], 'rcv:1:right:7.5:outside', '#1:right', 'off'),
      man(c, 'SS', [6, 5], 'hash:6:2', 'role:Y', 'off'),
      zone(c, 'FS', [13, 0], 'hash:13:0', 'deepZone', { zone: 'deepMiddle', depth: 13 }),
    ], [
      NICKEL, COVER1_BASE,
      { claim: 'The Giants\' 4-2-5 is a Cover 1 shell: strict man underneath and a deep safety', status: '1 of 3', sources: ['dudko-nickel'] },
      { claim: 'Man defenders align with an outside shade; off-man corners at 7 to 8 yd', status: '1 of 3', sources: ['bowen-cover1'] },
      { claim: 'Which man covers whom (the strong safety on the second slot, the back on the Mike) is a design value', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Nickel Cover 4 -----------------------------------------------------------------------------
function nickelCover4(): DefenseDef {
  const c = 'nickelCover4';
  const quarter = (role: string, side: 'left' | 'right', at: [number, number]): Slot => mk(c)({ role, behavior: 'deepZone', params: { zone: `deepQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'mod' }, at, rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'key', keys: [`#1:${side}`], technique: { coverage: 'patternMatch' },
    rules: [clause('Number one goes vertical: cover him', test('release', { target: `#1:${side}`, is: 'vertical' }), [act('trail', { target: `#1:${side}` })]), clause('Number one goes short or inside: sink to my quarter and help inside', not(test('release', { target: `#1:${side}`, is: 'vertical' })), [act('sink', { yd: 3 })])] });
  const safety = (role: string, side: 'left' | 'right'): Slot => mk(c)({ role, behavior: 'deepZone', params: { zone: `insideQuarter${side === 'left' ? 'Left' : 'Right'}`, match: 'no2' }, at: [11, side === 'left' ? -6 : 6], rule: `rcv:2:${side}:11:inside`, stance: 'flatFoot', gaze: 'key', keys: [`#2:${side}`], technique: { coverage: 'flatFootRead' },
    rules: [clause('Number two goes vertical: cover him', test('release', { target: `#2:${side}`, is: 'vertical' }), [act('trail', { target: `#2:${side}` })]), clause('Number two breaks in or out: help the corner', not(test('release', { target: `#2:${side}`, is: 'vertical' })), [act('squeeze', { yd: 2 })])] });
  return call('def_nickel_cover4', 'Nickel Cover 4 (Quarters)', 'cover4', '4-2-5 nickel, quarters, nickel back on the flat', 4, 6,
    'Quarters with the nickel back in the flat on the strong side: four deep fourths and three underneath. Strong against four-wide sets and the deep pass; the flats are the weakness.', [
      ...fourMan(c),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'middleHook', depth: 10, wall: true }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:left', 'zoneDrop', { zone: 'flatLeft', depth: 5, buzz: true }),
      zone(c, 'NB', [4.5, 6], 'rcv:2:right:4.5:inside', 'zoneDrop', { zone: 'flatRight', depth: 5 }),
      quarter('LCB', 'left', [7.5, -17]), quarter('RCB', 'right', [7.5, 17]), safety('FS', 'left'), safety('SS', 'right'),
    ], [
      NICKEL,
      { claim: 'Cover 4: two safeties and two corners split the deep field into fourths; the safeties take number two and support the corners', status: 'Verified', sources: ['bowen-cover4', 'haddad-cover4', 'bullock-quarters', 'cason-quarters'] },
      { claim: 'Match rules: corners play man-off-deep on number one and zone off to the quarter if he goes short; safeties take number two, vertical or support', status: '2 of 3', sources: ['haddad-cover4', 'bowen-cover4', 'cason-quarters'] },
      { claim: 'Cover 4 is named among the coverages run from the dime defense; the nickel-to-quarters pairing here is an adaptation', status: '1 of 3', sources: ['haddad-nickel'] },
      NOBODY_HELPS]);
}

// ---- Dime Cover 2 -------------------------------------------------------------------------------
function dimeCover2(): DefenseDef {
  const c = 'dimeCover2';
  return call('def_dime_cover2', 'Dime Cover 2 (4-1-6)', 'cover2', '4-1-6 dime, two-deep zone, six defensive backs', 4, 5,
    'Six defensive backs in two-deep zone on obvious passing downs; the corners take the flats and the nickel and dime backs the hooks. Weak spot: the run and the deep middle seam.', [
      ...fourMan(c),
      zone(c, 'MIKE', [4.5, 0], 'lb:over:center', 'zoneDrop', { zone: 'middleHole', depth: 10 }),
      zone(c, 'NB', [4.5, 4.5], 'rcv:2:right:4.5:inside', 'zoneDrop', { zone: 'hookCurlRight', depth: 10 }),
      zone(c, 'DB', [4.5, -4.5], 'rcv:2:left:4.5:inside', 'zoneDrop', { zone: 'hookCurlLeft', depth: 10 }),
      mk(c)({ role: 'LCB', behavior: 'zoneDrop', params: { zone: 'flatLeft', jam: true }, at: [5, -17], rule: 'rcv:1:left:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:left'], technique: { coverage: 'jamReroute' }, rules: [clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      mk(c)({ role: 'RCB', behavior: 'zoneDrop', params: { zone: 'flatRight', jam: true }, at: [5, 17], rule: 'rcv:1:right:5:outside', stance: 'press', gaze: 'quarterback', keys: ['#1:right'], technique: { coverage: 'jamReroute' }, rules: [clause('Threat in the flat: drive on it', test('threatInZone'), [act('breakOnBall')])] }),
      zone(c, 'FS', [15, -5], 'hash:15:-2', 'deepZone', { zone: 'deepHalfLeft', depth: 15, workTo: 18 }),
      zone(c, 'SS', [15, 5], 'hash:15:2', 'deepZone', { zone: 'deepHalfRight', depth: 15, workTo: 18 }),
    ], [
      { claim: 'Dime is six defensive backs, shown as a 4-1-6 (or 3-2-6), used on passing downs', status: '2 of 3', sources: ['haddad-nickel', 'mascolo-nickel'] },
      { claim: 'Cover 1, Cover 2 and Cover 4 are named among the coverages run from dime', status: '1 of 3', sources: ['haddad-nickel'] },
      { claim: 'Cover 2: two deep halves and five underneath defenders; corners on the flats, the middle linebacker in the middle hole', status: 'Verified', sources: ['schalter-cover2', 'haddad-cover2', 'steelersdepot-coverages', '33rd-coverage'] },
      { claim: 'Safeties play two yards outside the hash at about 15 yd, working to 18 at the snap', status: '2 of 3', sources: ['kuchar-cooke-twoman', 'rb-bowen-cover2'] },
      { claim: 'Which dime back takes which hook is a design value', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- 3-4 Cover 3 ---------------------------------------------------------------------------------
function threeFourCover3(): DefenseDef {
  const c = 'threeFourCover3';
  const lb = (role: string, at: [number, number], rule: string, behavior: 'blitz' | 'zoneDrop', params: Record<string, string | number | boolean>): Slot =>
    behavior === 'blitz' ? rusher(c, role, at, rule, 'C', 'edgeBlitz') : zone(c, role, at, rule, 'zoneDrop', params);
  return call('def_34_cover3', '3-4 Cover 3', 'cover3', '3-4 base, three linemen, four linebackers, three deep', 4, 7,
    'Three down linemen and four linebackers: one outside linebacker rushes, the other drops to the curl-flat; the inside backers take the hooks. Weak spot: the same seams as any Cover 3.', [
      lineman(c, 'LDE', '5', 'left', [1, -2.7], 'C'),
      mk(c)({ role: 'NT', behavior: 'passRush', params: { track: 'twoGap' }, at: [1, 0], onLine: true, stance: 'threePoint', gaze: 'key', keys: ['nearestThreat'], technique: { rushMove: 'bullRush', rushCounter: 'swim' }, rules: [RUN_FIT('A')] }),
      lineman(c, 'RDE', '5', 'right', [1, 2.7], 'C'),
      lb('ROLB', [1.5, 4], 'lb:gap:rightC', 'blitz', {}),
      lb('LOLB', [4.5, -4], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }),
      lb('LILB', [4.5, -1.5], 'lb:over:leftHook', 'zoneDrop', { zone: 'hookLeft', depth: 11, landmark: 'hashOutside' }),
      lb('RILB', [4.5, 1.5], 'lb:over:rightHook', 'zoneDrop', { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'SS', [6, 7.5], 'rcv:2:right:6:inside', 'zoneDrop', { zone: 'curlFlatRight', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }),
      deepThird(c, 'LCB', 'left'), deepThird(c, 'RCB', 'right'),
    ], [
      { claim: 'The 3-4 has three down linemen and four linebackers, two inside and two outside; the outside linebackers rush or drop', status: 'Verified', sources: ['bowen-34', 'carasik-34', 'kirby-tite'] },
      COVER3_BASE,
      { claim: 'Which outside linebacker rushes and which drops, and the strong safety\'s curl-flat, are design values; the pages describe the front, not a Cover 3 assignment sheet', status: 'Assumption', sources: [] },
      { claim: 'The nose is a fixed spot over the centre (technique 0); the lineTech rule grammar has no centre value', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

export const ADDED_DEFENSE: readonly DefenseDef[] = [cover1Robber(), cover3Flip(), cover3FireZone(), cover3Fire3(), cover4Palms(), nickelCover1(), nickelCover4(), dimeCover2(), threeFourCover3(), ...MORE_DEFENSE];
export const FULL_DEFENSE: readonly DefenseDef[] = [...STARTER_DEFENSE, ...ADDED_DEFENSE];
