// The twelve base offensive plays, one per OffensePlayKind (G1.1.1). Each play is drawn to the right and
// mirrored by rule (G1.4.2). A play holds no outcome numbers. Every number in a path or alignment that
// no source states is marked Assumption in the play's basis. Sources are listed in sources.ts.
import { FORMATION_BY_ID } from './formations.ts';
import { act, all, clause, cut, not, settle, test, through } from './build.ts';
import type { Basis, FormationDef, PlayDef, Slot } from './types.ts';

type Rest = Omit<Slot, 'role' | 'at' | 'onLine'> & { at?: Slot['at'] };

function spot(f: FormationDef, role: string): { at: [number, number]; onLine: boolean } {
  const p = f.players.find((x) => x.role === role);
  if (p === undefined) throw new Error(`formation ${f.id} has no ${role}`);
  return { at: [p.px, p.py], onLine: p.onLine };
}

/** A slot placed where the formation puts the role. */
function slot(fid: string, role: string, rest: Rest): Slot {
  const f = FORMATION_BY_ID.get(fid);
  if (f === undefined) throw new Error(`unknown formation ${fid}`);
  const s = spot(f, role);
  return { ...rest, role, at: rest.at ?? s.at, onLine: s.onLine, stance: rest.stance ?? (role === 'Q' ? (f.shotgun ? 'shotgun' : 'underCenter') : s.onLine ? 'threePoint' : 'twoPoint') };
}

const OL = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
/** The lineman to the right (play side when the play goes right) of each lineman, null at the end. */
const RIGHT_OF: Readonly<Record<string, string | null>> = { LT: 'LG', LG: 'C', C: 'RG', RG: 'RT', RT: 'Y' };

// Coaching claims shared by several plays.
const ROUTE_DEPTH: Basis = { claim: 'A route is a stem and a break described by depth and angle; the tree numbers are labels (odd out, even in is the common default, not universal)', status: 'Verified', sources: ['bowen-route-tree', 'haddad-routes', 'campbell-routes', 'lieberman'] };
const PERSONNEL_USE: Basis = { claim: 'Splits, backfield depths and path end points not stated by a source are design values', status: 'Assumption', sources: [] };
const ZONE_RULE: Basis = { claim: 'Zone rule: a covered lineman blocks the man on him, an uncovered one works with a neighbour to the linebacker', status: 'Verified', sources: ['gibbs-zone', 'hovorka-iz', 'hk-iz'] };
const SEVEN_PRO: Basis = { claim: 'Deep play action is protected with seven men; the line fakes the run then sets', status: '2 of 3', sources: ['peters-deepcross', 'mays-playaction', 'syed-shanahan'] };

// ---- 1. run: inside zone right ------------------------------------------------------------------
function insideZone(): PlayDef {
  const F = 'uc_singleback_11';
  const lineSlot = (role: (typeof OL)[number]): Slot => {
    const nb = RIGHT_OF[role] ?? 'Y';
    const back = role === 'LT';
    return slot(F, role, {
      behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'insideZoneRight', load: 1,
      rules: back
        ? [clause('Backside: block the man on me, else cut off the first defender inside', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'cutOff' })]),
           clause('Backside: no one on me, cut off', not(test('defenderOn', { where: 'me' })), [act('cutOff', { target: 'nearestDefender' })])]
        : [clause('Covered: block the man on me', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })]),
           clause('Uncovered: combo with my play-side neighbour', not(test('defenderOn', { where: 'me' })), [act('comboTo', { target: `role:${nb}` })]),
           clause('Climb to the linebacker when he shows', test('linebackerWalkedUp'), [act('climb')])],
      technique: { runBlock: 'zoneStep' }, keys: [], gaze: 'key',
    });
  };
  return {
    id: 'run_inside_zone_right', name: 'Inside Zone Right', kind: 'run', personnel: '11', formationId: F, shotgun: false, runDirection: 'right', intent: 'base', drawnTo: 'right',
    slots: [
      ...OL.map(lineSlot),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'insideZoneRight', rules: [clause('Covered: block the man on me, else climb', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })]), clause('Uncovered: climb to the linebacker', not(test('defenderOn', { where: 'me' })), [act('climb')])] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'insideZoneRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', aim: 'playsideGuardOutsideLeg', cuts: 1 }, path: [through(-2, 1.5), through(2, 2.5), cut(8, 3.5)], concept: 'insideZoneRight', load: 1.5, rules: [clause('One cut: read the first down lineman play side of the centre, then the next', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key', keys: ['nearestDefender'] }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'insideZoneRight', rules: [clause('Stalk block the man over me', test('cushion', { target: 'nearestDefender', lt: 8 }), [act('block', { target: 'nearestDefender', type: 'base' })])], load: 0.5 })),
    ],
    coachingPoints: ['Play side steps together; the covered man is blocked, the uncovered man combos to the linebacker.', 'Back makes one cut at the first hole that shows; the backside end is left unblocked and held by the bootleg threat.', 'Complements: bootleg, zone-read keep, run-pass option.'],
    basis: [
      { claim: 'Inside zone: all step play side, covered drives the man, uncovered combos', status: 'Verified', sources: ['gibbs-zone', 'hovorka-iz', 'hk-iz', 'johnston-iz'] },
      ZONE_RULE,
      { claim: 'Running back aiming point is NOT agreed: play-side hip of the centre (Hovorka), guard\'s outside leg or the B gap (Human Kinetics), at least the guard\'s outside leg (Johnston), depends on the bubble (Gibbs). Stored as the guard\'s outside leg, a coach setting', status: 'Conflict', sources: ['gibbs-zone', 'hovorka-iz', 'hk-iz', 'johnston-iz'] },
      { claim: 'One cut only; backside end left unblocked in the base version', status: '2 of 3', sources: ['gibbs-zone', 'haddad-iz'] },
      PERSONNEL_USE,
    ],
  };
}

// ---- 2. dropback_pass: four verticals -----------------------------------------------------------
function fourVerticals(): PlayDef {
  const F = 'gun_2x2_11';
  const pro = (role: string, side: 'left' | 'right' | 'mid'): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'full', side }, concept: 'fourVerticals', technique: { passSet: 'setBase' }, rules: [clause('Block the rusher on me; help inside when uncovered', not(test('ballThrown')), [act('passSet', { type: 'full' })])], gaze: 'key' });
  const vertical = (role: string, py: number, end: number, note?: Partial<Slot>): Slot => slot(F, role, { behavior: 'route', path: [through(10, py), cut(end, py)], concept: 'fourVerticals', load: 1, keys: ['qb'], gaze: 'quarterback', ...note });
  return {
    id: 'dropback_four_verticals', name: 'Four Verticals', kind: 'dropback_pass', personnel: '11', formationId: F, shotgun: true, runDirection: null, intent: 'base', drawnTo: 'right',
    slots: [
      pro('LT', 'left'), pro('LG', 'left'), pro('C', 'mid'), pro('RG', 'right'), pro('RT', 'right'),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'fiveStepFromGun', read: 'safetyThenSeams' }, concept: 'fourVerticals', gaze: 'key', keys: ['deepestReceiver'], load: 2,
        rules: [clause('Two deep safeties: throw the seam', test('safetiesDeep', { cmp: 'ge', n: 2 }), [act('continue')]), clause('One deep safety: throw the fade or the seam away from him', test('safetiesDeep', { cmp: 'le', n: 1 }), [act('continue')])] }),
      slot(F, 'R', { behavior: 'passSet', params: { type: 'back', side: 'right' }, concept: 'fourVerticals', rules: [clause('Check release: block the nearest rusher inside, else release to the flat', not(test('ballThrown')), [act('passSet', { type: 'back' })])], technique: { passSet: 'setBase' } }),
      vertical('X', -17, 30, { path: [through(10, -17), through(30, -16.5, 'numbersBottom')], technique: { release: 'outsideRelease' } }),
      vertical('Z', 17, 30, { path: [through(10, 17), through(30, 16.5, 'numbersBottom')], technique: { release: 'outsideRelease' } }),
      slot(F, 'H', { behavior: 'route', path: [through(10, -7.5), through(12, -5, 'hashPlus4'), through(25, -3, 'hashPlus2')], concept: 'fourVerticals', rules: [clause('Two deep safeties: split them down the middle void', test('safetiesDeep', { cmp: 'ge', n: 2 }), [act('convertRoute', { to: 'seamMiddle', px: 25, py: -1, relative: false, kind: 'through' })])], keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'Y', { behavior: 'route', path: [through(10, 7.5), through(12, 5, 'hashPlus4'), through(25, 3, 'hashPlus2')], concept: 'fourVerticals', rules: [clause('Two deep safeties: split them down the middle void', test('safetiesDeep', { cmp: 'ge', n: 2 }), [act('convertRoute', { to: 'seamMiddle', px: 25, py: 1, relative: false, kind: 'through' })])], keys: ['qb'], gaze: 'quarterback' }),
    ],
    coachingPoints: ['Outside receivers run to the bottom of the numbers and stack the defender.', 'Seams read the safeties: against two deep, split them; against one deep, stay on the hash.', 'Throw on the fifth step from the gun.'],
    basis: [
      { claim: 'Four verticals: two outside go routes at the bottom of the numbers and two seams, one throw per level read from the safeties', status: 'Verified', sources: ['campbell-fourverts', 'brown-gonzalez', 'peters-fourvert', 'leister-fourverts'] },
      { claim: 'Seam receivers bend to the middle void against two-high', status: 'Verified', sources: ['campbell-routes', 'brown-gonzalez', 'leister-fourverts'] },
      { claim: 'Closed-middle answer (stay on the seam or curl off) is not agreed; stored as a coach setting', status: 'Conflict', sources: ['brown-gonzalez', 'peters-fourvert'] },
      { claim: 'Five-step drop from gun is the quick-game pairing; gun 1/3/5 equals under-centre 3/5/7', status: '2 of 3', sources: ['brown-gonzalez', 'campbell-routes'] },
      ROUTE_DEPTH, PERSONNEL_USE,
    ],
  };
}

// ---- 3. quick_pass: stick -----------------------------------------------------------------------
function stick(): PlayDef {
  const F = 'gun_trips_right_11';
  const pro = (role: string): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'quick' }, concept: 'stick', technique: { passSet: 'setBase' }, gaze: 'key' });
  return {
    id: 'quick_stick', name: 'Stick', kind: 'quick_pass', personnel: '11', formationId: F, shotgun: true, runDirection: null, intent: 'base', drawnTo: 'right',
    slots: [
      ...OL.map(pro),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'threeStepFromGun', read: 'flatDefender' }, concept: 'stick', load: 1.5, keys: ['role:H'], gaze: 'key',
        rules: [clause('Flat defender widens or takes the flat: throw the stick', test('cushion', { target: 'role:Y', lt: 3 }), [act('continue')]), clause('Flat defender sits on the stick: throw the flat', test('inZone', { target: 'role:H' }), [act('continue')])] }),
      slot(F, 'R', { behavior: 'passSet', params: { type: 'back', side: 'left' }, concept: 'stick' }),
      slot(F, 'Y', { behavior: 'route', path: [through(4.5, 6.5), settle(5, 7.5)], concept: 'stick', keys: ['qb'], gaze: 'quarterback',
        rules: [clause('Man coverage: break away from the defender', test('myManDrops'), [act('convertRoute', { to: 'stickBreakOut', px: 5, py: 13, relative: false, kind: 'cut' })])] }),
      slot(F, 'H', { behavior: 'route', path: [through(0.5, 11), through(1, 15), settle(2, 18)], concept: 'stick', keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'Z', { behavior: 'route', path: [through(10, 17), through(20, 16.5, 'numbersBottom')], concept: 'stick', keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'X', { behavior: 'route', path: [through(3, -17), cut(5, -14)], concept: 'stick', keys: ['qb'], gaze: 'quarterback', technique: { release: 'insideRelease' } }),
    ],
    coachingPoints: ['The tight end sticks at about five yards and sits between the zone defenders; against man he breaks away.', 'The inside receiver runs to the flat; the outside receiver clears.', 'The quarterback reads the flat defender and throws on the third step from the gun.'],
    basis: [
      { claim: 'Stick: tight end runs about 5 yd and sits, back or receiver to the flat, outside clears, quarterback reads the flat defender', status: 'Verified', sources: ['campbell-stick', 'sampath-stick', 'weeklyspiral', 'corrill-stick'] },
      { claim: 'Stick depth: 3 to 7 yd or set by the first-down marker; sources say about 5 yd for the base', status: 'Conflict', sources: ['campbell-stick', 'sampath-stick', 'weeklyspiral', 'campbell-routes'] },
      { claim: 'Stick sits between zone defenders and breaks away against man', status: '1 of 3', sources: ['campbell-routes'] },
      ROUTE_DEPTH, PERSONNEL_USE,
    ],
  };
}

// ---- 4. play_action: deep cross off inside zone -------------------------------------------------
function playActionCross(): PlayDef {
  const F = 'uc_singleback_11';
  const fake = (role: string): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'sevenMan', sell: 'insideZone' }, concept: 'playActionDeepCross', technique: { passSet: 'zoneStepThenSet' }, gaze: 'key',
    rules: [clause('Sell the run for two steps then set', timeGtSell(), [act('passSet', { type: 'full' })])] });
  return {
    id: 'play_action_deep_cross', name: 'Inside Zone Fake, Deep Cross', kind: 'play_action', personnel: '11', formationId: F, shotgun: false, runDirection: null, intent: 'complement', drawnTo: 'right',
    slots: [
      ...OL.map(fake),
      slot(F, 'Y', { behavior: 'passSet', params: { type: 'sevenMan', sell: 'insideZone' }, concept: 'playActionDeepCross' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', fake: true }, path: [through(-2, 1.5), through(1, 2.5)], concept: 'playActionDeepCross', load: 1 }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'playAction', drop: 'sevenStep', read: 'postThenCrosserThenBack' }, concept: 'playActionDeepCross', load: 2, gaze: 'key', keys: ['role:X', 'role:H', 'role:R'] }),
      slot(F, 'X', { behavior: 'route', path: [through(8, -17), cut(18, -9), through(30, -2)], concept: 'playActionDeepCross', keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'H', { behavior: 'route', path: [through(5, -7.5), cut(20, 4), through(21, 14)], concept: 'playActionDeepCross', keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'Z', { behavior: 'route', path: [through(10, 16), through(30, 16, 'numbersBottom')], concept: 'playActionDeepCross', keys: ['qb'], gaze: 'quarterback' }),
    ],
    coachingPoints: ['Run the inside zone look: same formation, same backfield action, same first steps.', 'The crosser works behind the linebackers who stepped up; the post lures the safety.'],
    basis: [
      { claim: 'Play action copies the run\'s look so second-level defenders step to the run and open lanes behind them', status: 'Verified', sources: ['mays-playaction', 'rich-sequencing', 'syed-shanahan', 'nguyen-screens'] },
      { claim: 'Deep over: crosser behind linebackers who stepped up, shot over the top, seven in protection', status: 'Verified', sources: ['peters-deepcross', 'syed-shanahan', 'rich-sequencing'] },
      { claim: 'The crosser runs at 18 to 22 yd', status: '1 of 3', sources: ['peters-deepcross'] },
      SEVEN_PRO, PERSONNEL_USE,
    ],
  };
}
function timeGtSell() { return test('timeGt', { s: 0.6 }); }

// ---- 5. movement_pass: boot flood ---------------------------------------------------------------
function bootFlood(): PlayDef {
  const F = 'uc_singleback_11';
  return {
    id: 'movement_boot_flood', name: 'Boot Right, Flood', kind: 'movement_pass', personnel: '11', formationId: F, shotgun: false, runDirection: null, intent: 'complement', drawnTo: 'right',
    slots: [
      ...OL.map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'wideZoneFake', side: 'right' }, concept: 'bootFlood', technique: { runBlock: 'zoneStep' }, rules: [clause('Sell the zone run then protect the quarterback\'s edge', test('timeGt', { s: 0.5 }), [act('block', { target: 'nearestDefender', type: 'base' })])] })),
      slot(F, 'Y', { behavior: 'passSet', params: { type: 'edge', side: 'right', job: 'blockBackside' }, concept: 'bootFlood', rules: [clause('Keep in to block the end', not(test('ballThrown')), [act('block', { target: 'nearestRusher', type: 'kickOut' })])] }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'wideZone', fake: true }, path: [through(-3, 3), through(0, 8)], concept: 'bootFlood' }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'boot', side: 'right', roll: 'full', read: 'highToLow' }, concept: 'bootFlood', load: 2, keys: ['role:Z', 'role:H', 'role:R'], gaze: 'key' }),
      slot(F, 'Z', { behavior: 'route', path: [through(10, 16), cut(15, 22)], concept: 'bootFlood', keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'H', { behavior: 'route', path: [through(5, -7.5), cut(12, 6), settle(12, 12)], concept: 'bootFlood', keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'X', { behavior: 'route', path: [through(8, -17), cut(18, -10), through(18, -3)], concept: 'bootFlood', keys: ['qb'], gaze: 'quarterback' }),
    ],
    coachingPoints: ['The tight end stays in to block the backside end so the quarterback has an edge.', 'Flood puts a deep, an intermediate and a flat route on one side; read from deep to shallow on a clean look.', 'Back side: a crosser as the alert.'],
    basis: [
      { claim: 'Boot has a blocker on the quarterback\'s edge; the partner run is usually wide zone', status: 'Verified', sources: ['syed-shanahan', 'evely-boot', 'johnson-naked', 'haddad-sprintout'] },
      { claim: 'Flood off boot: high, middle and low to one side plus a back-side crosser', status: 'Verified', sources: ['syed-shanahan', 'evely-boot', 'coiner-boot'] },
      { claim: 'Quarterback reads low to high or high to low depending on the play', status: 'Verified', sources: ['evely-boot', 'coiner-boot', 'deberry-screens'] },
      { claim: 'A half roll goes to a 5 to 6 yd depth; the 7 to 9 yd full-roll depth is not sourced', status: '1 of 3', sources: ['brown-sprintout'] },
      PERSONNEL_USE,
    ],
  };
}

// ---- 6. screen: running back slow screen --------------------------------------------------------
function slowScreen(): PlayDef {
  const F = 'gun_2x2_11';
  const sell = (role: string, job: string): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'screenSell', job }, concept: 'slowScreen', technique: { passSet: 'setBase' }, load: 1,
    rules: [clause('Hold the set for the sell count then release to my landmark', timeGtSellScreen(), [act('switchBehavior', { to: 'runBlock' }), act('block', { target: 'nearestDefender', type: 'lead' })])] });
  return {
    id: 'screen_slow_rb', name: 'Slow Screen Right', kind: 'screen', personnel: '11', formationId: F, shotgun: true, runDirection: null, intent: 'constraint', drawnTo: 'right',
    slots: [
      sell('LT', 'sell'), sell('LG', 'rat'), sell('C', 'alley'), sell('RG', 'kickOut'), sell('RT', 'sell'),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'slowScreen', rules: [clause('Stalk the force defender', test('cushion', { target: 'nearestDefender', lt: 8 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'threeStepFromGun', sell: 'deepSink', read: 'back' }, concept: 'slowScreen', load: 1.5, keys: ['role:R'], gaze: 'key' }),
      slot(F, 'R', { behavior: 'route', params: { job: 'blockThenSlip' }, path: [through(-2, 3), through(-1, 7), cut(-1, 9)], concept: 'slowScreen', load: 1.5, rules: [clause('Set to block, then slip out to the screen side', test('timeGt', { s: 0.9 }), [act('runPath')])], keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'Z', { behavior: 'route', path: [through(8, 17), through(15, 17)], concept: 'slowScreen', rules: [clause('Block the corner', test('timeGt', { s: 0.6 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
      slot(F, 'H', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'slowScreen' }),
      slot(F, 'X', { behavior: 'route', path: [through(10, -17), through(18, -17)], concept: 'slowScreen' }),
    ],
    coachingPoints: ['Linemen pass-set to sell, then release to landmarks: first man kicks out, second leads up the alley, third turns back inside.', 'The back sets to block then slips out; the quarterback sinks and sells with eyes.', 'It beats a hard upfield rush and the blitz; it fails when rushers read it.'],
    basis: [
      { claim: 'Linemen pass-set to sell, then release to landmarks', status: 'Verified', sources: ['karlo-screens', 'alleman-screen', 'nguyen-screens', 'deberry-screens'] },
      { claim: 'Slow screen: back sets to block then slips out; punishes a hard upfield rush and the blitz', status: 'Verified', sources: ['deberry-screens', 'coiner-boot', 'nguyen-screens', 'karlo-screens'] },
      { claim: 'Blocking order is out, up, in: first man kicks out, second leads up the alley, third looks back inside', status: '2 of 3', sources: ['karlo-screens', 'alleman-screen'] },
      { claim: 'Sell time: sources give about 2 s or three steps; the bible\'s 1.0 to 1.5 s is not supported', status: 'Conflict', sources: ['karlo-screens', 'alleman-screen', 'nguyen-screens'] },
      PERSONNEL_USE,
    ],
  };
}
function timeGtSellScreen() { return test('timeGt', { s: 1.4 }); }

// ---- 7. rpo: zone with a bubble ----------------------------------------------------------------
function zoneBubbleRpo(): PlayDef {
  const F = 'gun_2x2_11';
  const zoneLine = (role: (typeof OL)[number]): Slot => slot(F, role, { behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'zoneBubbleRpo', technique: { runBlock: 'zoneStep' },
    rules: [clause('Covered: block the man on me', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })]), clause('Uncovered: combo then climb', not(test('defenderOn', { where: 'me' })), [act('comboTo', { target: `role:${RIGHT_OF[role] ?? 'Y'}` })])] });
  return {
    id: 'rpo_zone_bubble', name: 'Zone, Bubble Tag', kind: 'rpo', personnel: '11', formationId: F, shotgun: true, runDirection: 'right', intent: 'constraint', drawnTo: 'right',
    slots: [
      ...OL.map(zoneLine),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'rpo', read: 'boxCount', run: 'handoff', pass: 'bubble' }, concept: 'zoneBubbleRpo', load: 2, gaze: 'key',
        rules: [clause('Box is loaded: throw the bubble', test('boxCount', { cmp: 'ge', n: 7 }), [act('continue')]), clause('Box is light: hand off', test('boxCount', { cmp: 'le', n: 6 }), [act('continue')])] }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', aim: 'playsideGuardOutsideLeg', cuts: 1 }, path: [through(-1, -1), through(2, 1.5), cut(7, 3)], concept: 'zoneBubbleRpo', load: 1.5 }),
      slot(F, 'Y', { behavior: 'route', path: [through(-1, 8.5), through(-1.5, 12)], concept: 'zoneBubbleRpo', params: { route: 'bubble' }, keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'zoneBubbleRpo', rules: [clause('Block the corner', test('cushion', { target: 'nearestDefender', lt: 8 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
      slot(F, 'H', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'zoneBubbleRpo' }),
      slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'zoneBubbleRpo' }),
    ],
    coachingPoints: ['The line and back run the zone play unchanged; the pass is a tag.', 'Count the defenders outside against the receivers: when there are fewer, throw the bubble; when in doubt, hand it off.', 'Linemen stay in their run fits so no one is downfield.'],
    basis: [
      { claim: 'The line and back run the run unchanged; the pass is a tag', status: 'Verified', sources: ['galina-rpo', 'kuchar-rpo', 'lamb-rpo', 'hargitt-rpo'] },
      { claim: 'A pre-snap RPO decides by count or leverage; "when in doubt, hand it off"', status: 'Verified', sources: ['kuchar-rpo', 'lamb-rpo', 'galina-rpo', 'hargitt-rpo'] },
      { claim: 'Bubble punishes fewer defenders outside than receivers (three on two)', status: 'Verified', sources: ['bowen-packaged', 'nguyen-screens', 'lamb-rpo', 'kuchar-rpo'] },
      { claim: 'The numeric box thresholds (throw at seven or more, hand off at six or fewer) are a design value; sources say count against blockers', status: 'Assumption', sources: [] },
      PERSONNEL_USE,
    ],
  };
}

// ---- 8. draw ------------------------------------------------------------------------------------
function draw(): PlayDef {
  const F = 'gun_2x2_11';
  const passSet = (role: string): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'full', turn: 'washTheRusher' }, concept: 'draw', technique: { passSet: 'setBase' },
    rules: [clause('Wash the rusher the way he goes once he is past', test('read', { kind: 'draw', dir: 'any' }), [act('block', { target: 'nearestRusher', type: 'base' })])] });
  return {
    id: 'draw_rb', name: 'Draw', kind: 'draw', personnel: '11', formationId: F, shotgun: true, runDirection: 'middle', intent: 'situational', drawnTo: 'right',
    slots: [
      ...OL.map(passSet),
      slot(F, 'Y', { behavior: 'passSet', params: { type: 'tight' }, concept: 'draw' }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'fakeDrop', drop: 'threeStepFromGun', exchange: 'delayedHandoff' }, concept: 'draw', load: 1.5 }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'draw', delay: 'late', read: 'nose' }, path: [through(-3, 1), through(0, 1), cut(6, 0)], concept: 'draw', load: 1.5, keys: ['nearestDefender'], gaze: 'key' }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'route', path: [through(8, r === 'X' ? -17 : r === 'Z' ? 17 : -7.5), through(15, r === 'X' ? -17 : r === 'Z' ? 17 : -7.5)], concept: 'draw', rules: [clause('Block downfield when the back has the ball', test('ballCarrierDeclared'), [act('block', { target: 'nearestDefender', type: 'base' })])] })),
    ],
    coachingPoints: ['Linemen show pass set and invite the rush, then wash rushers the way they run.', 'The back delays, takes the ball late and reads the block on the nose or centre.', 'Best in long yardage; weak to interior twists and the blitz.'],
    basis: [
      { claim: 'Draw: linemen pass set, invite rushers, then wash them the way they go; back delays and takes the ball late', status: '2 of 3', sources: ['forbes-draw', 'weeklyspiral-draw'] },
      { claim: 'Draw works in long yardage and is weak to interior twists and the blitz', status: '2 of 3', sources: ['forbes-draw', 'weeklyspiral-draw'] },
      PERSONNEL_USE,
    ],
  };
}

// ---- 9. qb_run: zone read, quarterback keep ------------------------------------------------------
function zoneRead(): PlayDef {
  const F = 'gun_2x2_11';
  const zoneLine = (role: (typeof OL)[number]): Slot => slot(F, role, { behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'zoneReadKeep', technique: { runBlock: 'zoneStep' },
    rules: [clause('Covered: block the man on me', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })]), clause('Uncovered: combo then climb', not(test('defenderOn', { where: 'me' })), [act('comboTo', { target: `role:${RIGHT_OF[role] ?? 'Y'}` })])] });
  return {
    id: 'qb_zone_read', name: 'Zone Read, Keep', kind: 'qb_run', personnel: '11', formationId: F, shotgun: true, runDirection: 'right', intent: 'constraint', drawnTo: 'right',
    slots: [
      ...OL.map((r) => (r === 'LT' ? slot(F, r, { behavior: 'runBlock', params: { scheme: 'insideZone', job: 'leaveBackEndUnblocked' }, concept: 'zoneReadKeep', rules: [clause('Block the man on me; the backside end is left for the quarterback to read', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })])] }) : zoneLine(r))),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'zoneReadKeep' }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'zoneRead', man: 'nearestRusher', give: 'right', keep: 'left' }, concept: 'zoneReadKeep', load: 2, gaze: 'key',
        rules: [clause('End crashes down: pull the ball and keep', test('myManStunts', { dir: 'in' }), [act('continue')]), clause('End stays wide or comes upfield: give', test('myManStunts', { dir: 'out' }), [act('continue')])] }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', aim: 'playsideGuardOutsideLeg', cuts: 1 }, path: [through(-1, -1), through(2, 1.5), cut(7, 3)], concept: 'zoneReadKeep', load: 1.5 }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'zoneReadKeep' })),
    ],
    coachingPoints: ['Inside zone blocking with the backside end left unblocked; the quarterback reads him.', 'Crash means keep; wide or upfield means give. Tags can add an arc, a bubble or a slant as a third option.'],
    basis: [
      { claim: 'Zone read: inside zone blocking, backside end unblocked, quarterback reads him: crash means keep, stays wide or upfield means give', status: 'Verified', sources: ['bowen-readoption', 'hovorka-iz', 'haddad-iz'] },
      { claim: 'The quarterback\'s read man is the nearest rusher on the backside; the contract has no "read defender" selector, a contract request is open', status: 'Assumption', sources: [] },
      PERSONNEL_USE,
    ],
  };
}

// ---- 10. trick: flea flicker --------------------------------------------------------------------
function fleaFlicker(): PlayDef {
  const F = 'uc_i_form_21';
  return {
    id: 'trick_flea_flicker', name: 'Flea Flicker', kind: 'trick', personnel: '21', formationId: F, shotgun: false, runDirection: null, intent: 'shot', drawnTo: 'right',
    slots: [
      ...OL.map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'insideZoneFake', side: 'right' }, concept: 'fleaFlicker', load: 2, technique: { runBlock: 'zoneStep' }, rules: [clause('Sell the run, then set to protect when the ball goes back', test('timeGt', { s: 1.2 }), [act('passSet', { type: 'full' })])] })),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'insideZoneFake' }, concept: 'fleaFlicker', load: 2 }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoffThenReceiveBack', read: 'deepPost', exchanges: 2 }, concept: 'fleaFlicker', load: 3, gaze: 'key', keys: ['role:Z'] }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', toss: 'backToQuarterback', tossAfterSteps: 3 }, path: [through(-5, 2), through(0, 3)], concept: 'fleaFlicker', load: 3 }),
      slot(F, 'F', { behavior: 'runBlock', params: { scheme: 'lead' }, concept: 'fleaFlicker', load: 2 }),
      slot(F, 'Z', { behavior: 'route', params: { sell: 'blockFirst' }, path: [through(3, 16), through(12, 14), cut(25, 4)], concept: 'fleaFlicker', load: 3, rules: [clause('Show run block, then release deep once the safety steps down', test('timeGt', { s: 1.0 }), [act('runPath')])], keys: ['qb'], gaze: 'quarterback' }),
      slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'fleaFlicker', load: 2 }),
    ],
    coachingPoints: ['Everything shows run: the handoff, the line steps, the receivers block.', 'The back sells the run to the line, turns and pitches the ball back; the receiver then takes off.', 'Teaching load is doubled (G1.8.2); the exchange raises the fumble hazard.'],
    basis: [
      { claim: 'Flea flicker: quarterback hands to the back, the back tosses it back, the quarterback throws deep; receivers first show as blockers', status: 'Verified', sources: ['campbell-flea', 'rothstein-flea', 'fdpb-flea'] },
      { claim: 'The back had "two jobs: sell the run and throw a good pass back"; he planned three steps before throwing back', status: '1 of 3', sources: ['rothstein-flea'] },
      { claim: 'Deep post to the Z receiver is the FirstDown PlayBook version; the Lions version was a deep route by the lone receiver', status: '2 of 3', sources: ['fdpb-flea', 'rothstein-flea'] },
      PERSONNEL_USE,
    ],
  };
}

// ---- 11. kneel and 12. spike --------------------------------------------------------------------
function kneel(): PlayDef {
  const F = 'uc_i_form_21';
  const hold = (role: string): Slot => slot(F, role, { behavior: 'runBlock', params: { scheme: 'hold' }, concept: 'kneel', load: 0.5, rules: [clause('Stay in the stance and block the man on me', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type: 'base' })])] });
  return {
    id: 'kneel_victory', name: 'Victory Kneel', kind: 'kneel', personnel: '21', formationId: F, shotgun: false, runDirection: null, intent: 'situational', drawnTo: 'right',
    slots: [
      ...OL.map(hold), hold('Y'), hold('F'), hold('R'), hold('X'), hold('Z'),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'kneel' }, concept: 'kneel', load: 0.5, rules: [clause('Take the snap and drop to a knee at once', test('timeGt', { s: 0.0 }), [act('getDown')])] }),
    ],
    coachingPoints: ['The ball is dead when the quarterback drops to a knee behind or beyond the line (Rule 7-2-1(c)).'],
    basis: [
      { claim: 'The ball is dead when a quarterback immediately drops to his knee behind or beyond the line of scrimmage', status: 'Rulebook only', sources: ['rulebook-2026'] },
      PERSONNEL_USE,
    ],
  };
}

function spike(): PlayDef {
  const F = 'gun_2x2_11';
  const hold = (role: string): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'spike' }, concept: 'spike', load: 0.5 });
  return {
    id: 'spike_clock', name: 'Spike', kind: 'spike', personnel: '11', formationId: F, shotgun: true, runDirection: null, intent: 'situational', drawnTo: 'right',
    slots: [
      ...OL.map(hold), hold('R'),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'spike', immediately: true }, concept: 'spike', load: 0.5 }),
      ...(['X', 'H', 'Y', 'Z'] as const).map((r) => slot(F, r, { behavior: 'route', path: [through(2, r === 'X' ? -17 : r === 'Z' ? 17 : r === 'H' ? -7.5 : 7.5)], concept: 'spike', load: 0.5 })),
    ],
    coachingPoints: ['The quarterback must begin a continuous throwing motion right on the snap and throw the ball into the ground; a delayed spike is a foul (Rule 8-2-1).'],
    basis: [
      { claim: 'A quarterback may stop the clock by throwing the ball into the ground immediately on receiving the snap; a delayed spike is illegal', status: 'Rulebook only', sources: ['rulebook-2026'] },
      PERSONNEL_USE,
    ],
  };
}

export const PLAYS: readonly PlayDef[] = [insideZone(), fourVerticals(), stick(), playActionCross(), bootFlood(), slowScreen(), zoneBubbleRpo(), draw(), zoneRead(), fleaFlicker(), kneel(), spike()];
