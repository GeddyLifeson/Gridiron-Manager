// Deferred plays of the full set: option (inside veer, midline), trap, wham, pin and pull, a bunch pass, an empty pass
// and a goal-line run (F4.4, F4.7, F6.8, F2). All drawn to the right. Sources: research/scheme-sources/
// deferred-plays-and-packages.md and run-schemes-and-fronts.md through the ids in sources-more.ts and sources.ts.
import type { PlayDef, Slot } from '../starter/types.ts';
import { DESIGN_VALUES, NUMBERED_FROM_SIDELINE, OL, ROUTE_DEPTH, act, clause, cut, not, protect, route, settle, slot, test, through, type Basis } from './kit.ts';

const blockMan = (text: string, type: 'base' | 'reach' | 'down' | 'kickOut' | 'cutOff' | 'combo' | 'lead' = 'base') => clause(text, test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type })]);
const climb = (text: string) => clause(text, test('timeGt', { s: 0 }), [act('climb')]);
const cutOffBackside = (text: string) => clause(text, test('timeGt', { s: 0 }), [act('cutOff', { target: 'nearestDefender' })]);
const mk = (id: string, name: string, kind: PlayDef['kind'], F: string, shotgun: boolean, personnel: string, runDirection: PlayDef['runDirection'], intent: PlayDef['intent'], slots: Slot[], coachingPoints: string[], basis: Basis[]): PlayDef =>
  ({ id, name, kind, personnel, formationId: F, shotgun, runDirection, intent, slots, coachingPoints, basis, drawnTo: 'right' });

const FLEX = 'uc_flexbone_30';
const UC = 'uc_singleback_11';
const I21 = 'uc_i_form_21';

const OPTION_COUNT: Basis = { claim: 'Option count: number one (the dive key) is the first defender on or outside the play-side tackle, number two (the pitch key) the next one outside, number three is run support', status: 'Verified', sources: ['cella-triple', 'coachj-triple', 'donovan-veer'] };
const NO_READ_SELECTOR: Basis = { claim: 'The contract has no "read defender" selector, so each read uses the quarterback\'s man and his inward or outward move; the second read is carried in the parameters', status: 'Assumption', sources: [] };
const TRAP_IDEA: Basis = { claim: 'Trap: a defensive lineman is left unblocked and a lineman pulling from the other side kicks him out from inside; it punishes penetrating, upfield linemen', status: 'Verified', sources: ['streelman-trap', 'yfo-trap', 'kou-trap', 'coyote-wham-iso'] };

const stalk = (F: string, role: string, concept: string, text = 'Block the man over me'): Slot =>
  slot(F, role, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept, rules: [blockMan(text)] });

// ---- Inside veer (triple option) -----------------------------------------------------------------
function insideVeer(): PlayDef {
  const F = FLEX;
  const c = 'veerRight';
  return mk('run_inside_veer_right', 'Inside Veer (Triple Option) Right', 'qb_run', F, false, '30', 'right', 'base', [
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'veer', job: 'scoop' }, concept: c, rules: [cutOffBackside('Back side: scoop to the play side')] }),
    slot(F, 'LG', { behavior: 'runBlock', params: { scheme: 'veer', job: 'scoop' }, concept: c, rules: [cutOffBackside('Back side: scoop to the play side')] }),
    slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'veer', job: 'actionKey' }, concept: c, rules: [clause('Help the guard move the action key off the ball', test('timeGt', { s: 0 }), [act('comboTo', { target: 'role:RG' }), act('climb')])] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'veer', job: 'actionKey' }, concept: c, rules: [blockMan('Drive the action key (the first man inside number one) straight back; my block sets the fullback\'s track')] }),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'veer', job: 'veerRelease', leave: 'diveKey' }, concept: c, rules: [climb('Veer release past number one to the linebacker; number one is left for the quarterback')] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'tripleOption', exchange: 'underCenter', read1: 'diveKey', read2: 'pitchKey', dive: 'role:F', pitch: 'role:H', give: 'diveKeyStays', pull: 'diveKeyTakesDive', pitchWhen: 'pitchKeyTakesQb' }, path: [through(-1, 1.5), through(0, 4)], concept: c, load: 2.5, gaze: 'key',
      rules: [clause('Dive key takes the fullback: pull the ball and attack the pitch key', test('myManStunts', { dir: 'in' }), [act('continue')]), clause('Dive key sits or widens: give to the fullback by the front hip', test('myManStunts', { dir: 'out' }), [act('continue')])] }),
    slot(F, 'F', { behavior: 'ballCarrier', params: { track: 'veer', aim: 'insideLegOfGuard', cuts: 1 }, path: [through(-2, 0.7), through(0, 0.8), cut(5, 1)], concept: c, load: 1.5, rules: [clause('Run the track the guard\'s block sets', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
    slot(F, 'H', { behavior: 'ballCarrier', params: { track: 'pitch', relation: 'parallel' }, motion: [through(-2, -1.5)], path: [through(-3.5, 1), through(-3.5, 6), through(2, 9)], concept: c, load: 1.5,
      rules: [clause('Keep the pitch relationship with the quarterback', test('timeGt', { s: 0 }), [act('runPath')])] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'veer', job: 'arc' }, path: [through(-2, 4.5), through(1, 7)], concept: c, rules: [clause('Drop step and arc to number three, the run-support player', test('timeGt', { s: 0 }), [act('block', { target: 'nearestDefender', type: 'lead' })])] }),
    slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk', target: 'deepDefender' }, concept: c, rules: [clause('Push off the ball and block the deep defender on my side', test('timeGt', { s: 0 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
    stalk(F, 'X', c, 'Run off or block the deep defender on my side'),
  ], ['The fullback aims at the inside leg of the guard; the quarterback gives unless the dive key can tackle the fullback.', 'If he pulls, the quarterback attacks the pitch key and pitches when that man takes him.', 'The play-side slotback arcs to the run-support player; the play-side end blocks the deep defender; the back side scoops.'], [
    OPTION_COUNT,
    { claim: 'The fullback aims at the inside leg of the guard ("the guard\'s butt") and stays on the track the guard\'s block sets', status: '2 of 3', sources: ['donovan-veer', 'coachj-triple'] },
    { claim: 'The quarterback gives unless the dive key can tackle the fullback (decision by the front hip); on a pull, pitch when the pitch key takes the quarterback', status: '2 of 3', sources: ['donovan-veer', 'coachj-triple'] },
    { claim: 'The play-side tackle veers past number one; guard and centre move the action key vertically; the back side always scoops', status: '1 of 3', sources: ['donovan-veer'] },
    { claim: 'The play-side slotback drop-steps and arcs to number three; the play-side split end blocks the deep defender (the Cover 3 corner or the Cover 2 half safety)', status: '2 of 3', sources: ['donovan-veer', 'coachj-triple'] },
    { claim: 'The back-side slotback goes in motion on the cadence, through the fullback\'s heels, and keeps a parallel pitch relationship', status: '1 of 3', sources: ['donovan-veer'] },
    { claim: 'The back-side split end\'s job is a design value; no page gives it', status: 'Assumption', sources: [] },
    NO_READ_SELECTOR, DESIGN_VALUES]);
}

// ---- Midline -------------------------------------------------------------------------------------
function midline(): PlayDef {
  const F = FLEX;
  const c = 'midlineRight';
  return mk('run_midline_right', 'Midline Option Right', 'qb_run', F, false, '30', 'middle', 'complement', [
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'midline', job: 'cutOff' }, concept: c, rules: [cutOffBackside('Cut off the back side')] }),
    slot(F, 'LG', { behavior: 'runBlock', params: { scheme: 'midline', job: 'down' }, concept: c, rules: [blockMan('Block the man on me or back toward the centre', 'down')] }),
    slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'midline', job: 'down' }, concept: c, rules: [blockMan('Block down inside the hole', 'down')] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'midline', job: 'release', leave: 'readKey' }, concept: c, rules: [climb('Release inside the read key to the linebacker; the read key is left for the quarterback')] }),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'midline', job: 'release' }, concept: c, rules: [climb('Release to the next linebacker')] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'midlineOption', exchange: 'underCenter', read1: 'firstOnOrOutsidePlaySideGuard', dive: 'role:F', give: 'readStays', pull: 'readTakesDive' }, path: [through(-1.5, 0.3), through(-1, 2.5), through(2, 3.5)], concept: c, load: 2, gaze: 'key',
      rules: [clause('Read crashes on the fullback: pull and run outside him', test('myManStunts', { dir: 'in' }), [act('continue')]), clause('Read sits or widens: give to the fullback', test('myManStunts', { dir: 'out' }), [act('continue')])] }),
    slot(F, 'F', { behavior: 'ballCarrier', params: { track: 'midline', aim: 'centreHip', cuts: 1 }, path: [through(-2, 0.3), through(0, 0.4), cut(5, 0.5)], concept: c, load: 1.5, rules: [clause('Dive straight up the centre\'s midline', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'midline', job: 'lead' }, path: [through(-1, 3), through(2, 3.5)], concept: c, rules: [clause('Lead through the hole for the quarterback', test('timeGt', { s: 0 }), [act('block', { target: 'nearestDefender', type: 'lead' })])] }),
    slot(F, 'H', { behavior: 'runBlock', params: { scheme: 'midline', job: 'fake' }, motion: [through(-2, -1.5)], path: [through(-3, 2), through(-3, 6)], concept: c, rules: [clause('Fake the pitch to hold the edge', test('timeGt', { s: 0 }), [act('runPath')])] }),
    stalk(F, 'X', c), stalk(F, 'Z', c),
  ], ['The fullback dives at the centre\'s midline; the quarterback steps back out of his path.', 'The read is the first defender on or outside the play-side guard, usually a 3 technique; linemen block down inside the hole and leave him.'], [
    { claim: 'Midline: the read is the first defender on or outside the play-side guard (often a 3 technique); the fullback dives in the A gap at the centre\'s hip or midline', status: 'Verified', sources: ['coachj-triple', 'cella-triple', 'forbes-wham-pinpull'] },
    { claim: 'The quarterback backs out of the fullback\'s path; linemen block down inside the hole and leave the read unblocked', status: '1 of 3', sources: ['coachj-triple'] },
    { claim: 'The slotbacks\' jobs (play-side lead, back-side pitch fake) and the tackle\'s release are design values', status: 'Assumption', sources: [] },
    NO_READ_SELECTOR, DESIGN_VALUES]);
}

// ---- Trap ----------------------------------------------------------------------------------------
function trap(): PlayDef {
  const F = UC;
  const c = 'trapRight';
  return mk('run_trap_right', 'Trap Right', 'run', F, false, '11', 'right', 'complement', [
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'trap', job: 'cutOff' }, concept: c, rules: [cutOffBackside('Cut off the back-side 3 technique or linebacker: the key back-side block')] }),
    slot(F, 'LG', { behavior: 'pull', params: { scheme: 'trap', type: 'kick', technique: 'squarePull' }, path: [through(-1, -0.5), through(-1, 1), through(0, 1.6)], concept: c, load: 1.5,
      rules: [clause('Pull flat behind the centre and kick out the first lineman past the centre, inside out', test('timeGt', { s: 0.1 }), [act('pull', { type: 'kick' })])] }),
    slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'trap', job: 'nose' }, concept: c, rules: [blockMan('Handle the nose; block back toward the pulling side', 'down')] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'trap', job: 'release', leave: 'trapKey' }, concept: c, rules: [climb('Release inside to the linebacker; leave the man on me for the trap')] }),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'trap', job: 'release' }, concept: c, rules: [climb('Release inside to the linebacker')] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'trap', job: 'base' }, concept: c, rules: [blockMan('Block the end man')] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: c, gaze: 'ball' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'trap', aim: 'insideLegOfTackle', cuts: 1 }, path: [through(-5, 0.3), through(-1, 1.2), cut(5, 1.5)], concept: c, load: 1.5, rules: [clause('Hit the hole downhill off the trap block', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
    stalk(F, 'X', c), stalk(F, 'H', c), stalk(F, 'Z', c),
  ], ['The play-side lineman is left alone; the back-side guard pulls flat and kicks him out from the inside.', 'Play-side linemen release inside to the linebackers; the centre handles the nose; the back-side tackle cuts off.'], [
    TRAP_IDEA,
    { claim: 'The back-side guard pulls flat, tight behind the centre, aiming at the inside shoulder or near hip of the trapped man, a square pull', status: 'Verified', sources: ['streelman-trap', 'yfo-trap', 'grabowski-pull'] },
    { claim: 'Play-side tackle releases inside to the linebacker; the centre handles the nose; the back-side tackle\'s cut-off is the key back-side block', status: '1 of 3', sources: ['streelman-trap'] },
    { claim: 'The back\'s aiming point is the inside leg of the tackle (on the H-back trap)', status: '1 of 3', sources: ['kou-trap'] },
    { claim: 'Variants: tackle pulls instead of the guard against a back-side 3 technique; long trap on a wider lineman; influence trap pulls both guards', status: '2 of 3', sources: ['kou-trap', 'yfo-trap'] },
    { claim: 'The play-side guard\'s release and the tight end\'s block on the end man are design values', status: 'Assumption', sources: [] },
    DESIGN_VALUES]);
}

// ---- Wham ----------------------------------------------------------------------------------------
function wham(): PlayDef {
  const F = I21;
  const c = 'whamRight';
  return mk('run_wham_right', 'Wham Right', 'run', F, false, '21', 'right', 'complement', [
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'wham', job: 'cutOff' }, concept: c, rules: [cutOffBackside('Cut off the back side')] }),
    slot(F, 'LG', { behavior: 'runBlock', params: { scheme: 'wham', job: 'cutOff' }, concept: c, rules: [cutOffBackside('Cut off the back side')] }),
    slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'wham', job: 'back' }, concept: c, rules: [blockMan('Block the nose or back side', 'down')] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'wham', job: 'release', leave: 'whamKey' }, concept: c, rules: [climb('Release to the play-side linebacker; leave the tackle for the wham')] }),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'wham', job: 'release' }, concept: c, rules: [climb('Release to the next linebacker')] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'wham', job: 'base' }, concept: c, rules: [blockMan('Block the end man')] }),
    slot(F, 'F', { behavior: 'runBlock', params: { scheme: 'wham', job: 'kickOut', target: 'firstLinemanOutsideCentre' }, path: [through(-2.5, 0.3), through(-0.5, 1.2)], concept: c, load: 1.5,
      rules: [clause('Kick out the first down lineman outside the centre from the side', test('timeGt', { s: 0.1 }), [act('block', { target: 'nearestDefender', type: 'kickOut' })])] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: c, gaze: 'ball' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'wham', cuts: 1 }, path: [through(-6, 0.3), through(-1, 1), cut(5, 1.2)], concept: c, load: 1.5, rules: [clause('Hit inside the wham block', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
    stalk(F, 'X', c), stalk(F, 'Z', c),
  ], ['The defensive tackle is left alone and the fullback kicks him out from the side.', 'Play-side linemen climb to the linebackers.'], [
    { claim: 'Wham: a tight end or fullback kicks out the first down lineman outside the centre from the side; the linemen leave him', status: 'Verified', sources: ['forbes-wham-pinpull', 'coyote-wham-iso', 'kou-trap'] },
    { claim: 'The wham blocker often goes in short motion first; here the fullback starts behind the quarterback so no motion is needed', status: '1 of 3', sources: ['forbes-wham-pinpull'] },
    { claim: 'Both trap and wham work best against upfield one-gap linemen', status: '2 of 3', sources: ['coyote-wham-iso', 'forbes-wham-pinpull'] },
    { claim: 'Line assignments other than leaving the wham key (climb, cut-off, centre back) and the back\'s track are design values', status: 'Assumption', sources: [] },
    DESIGN_VALUES]);
}

// ---- Pin and pull --------------------------------------------------------------------------------
function pinPull(): PlayDef {
  const F = UC;
  const c = 'pinPullRight';
  const pinOrPull = (text: string) => clause(text, test('defenderOn', { where: 'gapInside' }), [act('switchBehavior', { to: 'runBlock' }), act('block', { target: 'nearestDefender', type: 'down' })]);
  return mk('run_pin_pull_right', 'Pin and Pull Right', 'run', F, false, '11', 'right', 'base', [
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'pinPull', job: 'cutOff' }, concept: c, rules: [cutOffBackside('Cut off the back side')] }),
    slot(F, 'LG', { behavior: 'runBlock', params: { scheme: 'pinPull', job: 'cutOff' }, concept: c, rules: [cutOffBackside('Cut off the back side')] }),
    slot(F, 'C', { behavior: 'pull', params: { scheme: 'pinPull', type: 'lead', order: 2 }, path: [through(-1, 1), through(-1, 4), through(1, 6)], concept: c, load: 1.5,
      rules: [clause('Second puller: lead up to the point, the linebacker inside the kick-out', test('timeGt', { s: 0.2 }), [act('pull', { type: 'lead' })])] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'pinPull', job: 'pin' }, concept: c, rules: [blockMan('Pin: block down on the man inside or on me', 'down')] }),
    slot(F, 'RT', { behavior: 'pull', params: { scheme: 'pinPull', type: 'kick', order: 1 }, path: [through(-1, 3), through(-0.5, 6), through(1, 8)], concept: c, load: 1.5,
      rules: [pinOrPull('A defender in my inside gap: pin him instead of pulling'), clause('First puller: kick out the force player', not(test('defenderOn', { where: 'gapInside' })), [act('pull', { type: 'kick' })])] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'pinPull', job: 'pin' }, concept: c, rules: [blockMan('Pin the end man down', 'down')] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: c, gaze: 'ball' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'pinPull', follow: 'secondPuller', cuts: 1 }, path: [through(-6, 2), through(-4, 7), cut(2, 9)], concept: c, load: 1.5, rules: [clause('Flat path; read the second puller\'s block and cut off it', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
    stalk(F, 'X', c), stalk(F, 'H', c), stalk(F, 'Z', c),
  ], ['Each play-side lineman pins down or pulls by whether a defender is in his inside gap.', 'Drawn against no play-side 3 technique: the tackle pulls first and kicks, the centre pulls second and leads to the point.', 'The back runs a flat path and reads the second puller.'], [
    { claim: 'Pin and pull: a play-side blocker pins (blocks down) when a defender is in his inside gap, otherwise he pulls', status: '2 of 3', sources: ['davis-pinpull', 'forbes-wham-pinpull'] },
    { claim: 'If the play-side tackle blocks down the guard is the first puller; with no 3 technique the tackle pulls first; the centre pulls second; the first puller kicks, the second takes the point', status: '1 of 3', sources: ['davis-pinpull'] },
    { claim: 'The back runs a flat path and reads the second puller\'s block', status: '1 of 3', sources: ['forbes-wham-pinpull'] },
    { claim: 'The back-side cut-offs and the drawn front (no play-side 3 technique) are design values', status: 'Assumption', sources: [] },
    DESIGN_VALUES]);
}

// ---- Bunch trail ---------------------------------------------------------------------------------
function bunchTrail(): PlayDef {
  const F = 'gun_bunch_right_11';
  const c = 'bunchTrail';
  return mk('quick_bunch_trail', 'Bunch Trail', 'quick_pass', F, true, '11', null, 'complement', [
    ...OL.map((r) => slot(F, r, protect(c))),
    slot(F, 'R', { behavior: 'passSet', params: { type: 'back', side: 'right' }, concept: c }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'threeStepFromGun', read: 'insideOut' }, concept: c, load: 1.5, keys: ['role:Y'], gaze: 'key',
      rules: [clause('Slants are open: throw the first one clear', test('ballThrown'), [act('continue')])] }),
    slot(F, 'Y', route(c, [through(2, 6.5), cut(6, 4)], { technique: { release: 'flatSlant' } })),
    slot(F, 'Z', route(c, [through(2, 7.8), cut(7, 5)], { technique: { release: 'skinnySlant' } })),
    slot(F, 'H', route(c, [through(-0.5, 5.6), through(1.5, 4.8), cut(5, 3)])),
    slot(F, 'X', route(c, [through(10, -17), through(20, -16.5)])),
  ], ['The point man runs a flatter slant and the outside man a skinnier one; the inside man plants on his third step and trails back along their path.'], [
    { claim: 'Bunch trail: point man and outside receiver run slants (point flatter, outside skinnier); the inside receiver plants on his third step and trails along the same path', status: '1 of 3', sources: ['yfo-trail'] },
    { claim: 'Bunch concepts are rubs that make man coverage pay; mesh, snag and switch verticals come from bunch too', status: '2 of 3', sources: ['kuchar-bunch-rub', 'heck-bunch'] },
    { claim: 'The quarterback\'s drop and read and the back-side receiver\'s clear-out are design values', status: 'Assumption', sources: [] },
    ROUTE_DEPTH, NUMBERED_FROM_SIDELINE, DESIGN_VALUES]);
}

// ---- Empty stick ---------------------------------------------------------------------------------
function emptyStick(): PlayDef {
  const F = 'gun_empty_3x2_11';
  const c = 'emptyStick';
  return mk('quick_empty_stick', 'Empty Stick', 'quick_pass', F, true, '11', null, 'complement', [
    ...OL.map((r) => slot(F, r, { ...protect(c), calls: ['pointMike'] })),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'threeStepFromGun', read: 'flatDefender', hot: 'role:X' }, concept: c, load: 2, keys: ['role:H'], gaze: 'key',
      rules: [clause('More rushers than blockers: throw hot to the outside receiver', test('rushersVsBlockers'), [act('continue')]), clause('Flat defender sits on the stick: throw the flat', test('inZone', { target: 'role:Y' }), [act('continue')])] }),
    slot(F, 'H', route(c, [through(4.5, 6.5), settle(5, 7.5)])),
    slot(F, 'Y', route(c, [through(0.5, 15), settle(2, 18)])),
    slot(F, 'Z', route(c, [through(10, 17), through(20, 16.5)])),
    slot(F, 'X', route(c, [through(2, -17), cut(6, -13)])),
    slot(F, 'R', route(c, [through(5, -8), settle(4.5, -8)])),
  ], ['Five linemen protect and the quarterback or centre points out the linebacker they block; the quarterback owns the rest and throws hot.', 'Trips side runs stick; the two-man side gives a quick hot answer.'], [
    { claim: 'Empty leaves no back to protect: the five linemen block and the centre or quarterback points out the linebacker they take; hot throws go outside', status: '2 of 3', sources: ['coiner-empty', 'fourverts-empty'] },
    { claim: 'Stick is a standard empty concept (with mesh, spacing, shallow and the quarterback draw)', status: '1 of 3', sources: ['cfbtrack-empty'] },
    { claim: 'Stick: tight end or inside receiver runs about 5 yd and sits, a receiver to the flat, outside clears, quarterback reads the flat defender', status: 'Verified', sources: ['campbell-stick', 'sampath-stick', 'weeklyspiral', 'corrill-stick'] },
    { claim: 'The two-receiver side (slant and hitch) is a design value', status: 'Assumption', sources: [] },
    ROUTE_DEPTH, DESIGN_VALUES]);
}

// ---- Goal-line power -----------------------------------------------------------------------------
function goalLinePower(): PlayDef {
  const F = 'uc_goal_line_23';
  const c = 'goalLinePower';
  return mk('run_goal_line_power', 'Goal Line Power Right', 'run', F, false, '23', 'right', 'situational', [
    slot(F, 'H', { behavior: 'runBlock', params: { scheme: 'power', job: 'hinge' }, concept: c, rules: [blockMan('Hinge: protect the back side')] }),
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'power', job: 'hinge' }, concept: c, rules: [blockMan('Hinge: protect the back side')] }),
    slot(F, 'LG', { behavior: 'pull', params: { scheme: 'power', type: 'wrap' }, concept: c, load: 1.5, rules: [clause('Pull and wrap to the play-side linebacker', test('timeGt', { s: 0.1 }), [act('pull', { type: 'wrap' })])] }),
    slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'power', job: 'blockBack' }, concept: c, rules: [blockMan('Block back on the man to the pulling side')] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'power', job: 'doubleDown' }, concept: c, rules: [blockMan('Block down with my tackle', 'combo')] }),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'power', job: 'doubleDown' }, concept: c, rules: [blockMan('Block down; one of us peels to the linebacker', 'combo')] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'power', job: 'blockDown' }, concept: c, rules: [blockMan('Block down on the man inside me', 'down')] }),
    slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'power', job: 'blockDown' }, concept: c, rules: [blockMan('Wing: block down on the end man', 'down')] }),
    slot(F, 'F', { behavior: 'runBlock', params: { scheme: 'power', job: 'kickOut' }, path: [through(-2.5, 2), through(0, 5)], concept: c, load: 1.5, rules: [clause('Kick out the end man on the line', test('timeGt', { s: 0.2 }), [act('block', { target: 'nearestDefender', type: 'kickOut' })])] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: c, gaze: 'ball' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'power', follow: 'puller', cuts: 1 }, path: [through(-5, 1.5), through(-1, 3.5), cut(3, 4)], concept: c, load: 1.5, rules: [clause('Follow the puller; get downhill', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
  ], ['Power from three tight ends: the extra blockers on the line meet a six- or seven-man front.'], [
    { claim: 'Power: play-side linemen block down, guard and tackle double, the back-side guard wraps, the fullback kicks out the end man', status: 'Verified', sources: ['brown-power', 'nguyen-power-option', 'rollins-rundesign'] },
    { claim: 'On the goal line offenses bring heavy personnel (23, seven on the line); defenses answer with a 6-2 or 5-3 front, five or six hands down', status: '2 of 3', sources: ['coiner-goalline', 'fdpb-goalline'] },
    { claim: 'The wing\'s down block and the back-side tight end\'s hinge are design values', status: 'Assumption', sources: [] },
    DESIGN_VALUES]);
}

// ---- Speed option --------------------------------------------------------------------------------
function speedOption(): PlayDef {
  const F = 'gun_2x2_11';
  const c = 'speedOptionRight';
  const reach = (role: string) => slot(F, role, { behavior: 'runBlock', params: { scheme: 'outsideZone', job: 'reach' }, concept: c, rules: [blockMan('Reach the man on my play-side shoulder; climb if uncovered', 'reach')] });
  return mk('qb_speed_option_right', 'Speed Option Right', 'qb_run', F, true, '11', 'right', 'constraint', [
    reach('LT'), reach('LG'), reach('C'), reach('RG'),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'outsideZone', job: 'arc', leave: 'endMan' }, concept: c, rules: [climb('Leave the end man for the quarterback; arc to the second level')] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'speedOption', read1: 'endManOnLine', pitch: 'role:R', attack: 'outsideShoulder', pitchWhen: 'readTakesQb', keep: 'readTakesPitch' }, path: [through(-3.5, 2), through(-1.5, 3.5), through(2, 4.5)], concept: c, load: 2, gaze: 'key',
      rules: [clause('End man takes me: pitch and drift toward the pitch man', test('myManStunts', { dir: 'in' }), [act('continue')]), clause('End man widens to the pitch: keep and turn up', test('myManStunts', { dir: 'out' }), [act('continue')])] }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'pitch', relation: 'fiveByOne' }, path: [through(-5, 4), through(-4.5, 8), through(1, 11)], concept: c, load: 1.5,
      rules: [clause('Keep the pitch relationship; outflank the last man on the line, then get vertical', test('timeGt', { s: 0 }), [act('runPath')])] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'speedOption', job: 'arc' }, path: [through(1, 8.5), through(4, 9)], concept: c, rules: [clause('Arc release to block for the pitch back; climb to the safety if nobody comes', test('timeGt', { s: 0 }), [act('block', { target: 'nearestDefender', type: 'lead' })])] }),
    stalk(F, 'Z', c, 'Stalk: attack the defender\'s outside shoulder'), stalk(F, 'X', c), stalk(F, 'H', c),
  ], ['The quarterback attacks the outside shoulder of the end man and pitches the moment he takes the quarterback; keeps if he widens to the pitch.', 'The line zone-blocks and leaves the end man; the slot arcs for the pitch back; the receivers stalk.'], [
    { claim: 'Speed option: no dive; the quarterback attacks the end man on the line and pitches if he takes the quarterback, keeps if he takes the pitch back', status: 'Verified', sources: ['brinkley-speed', 'annese-speed', 'richters-veer'] },
    { claim: 'The quarterback attacks the end man\'s outside shoulder and plants the instant he widens or goes upfield', status: '1 of 3', sources: ['brinkley-speed'] },
    { claim: 'The pitch back keeps about a five-yard pitch relationship (5x1), outflanks the last man on the line, then gets vertical', status: 'Verified', sources: ['richters-veer', 'psu-drills', 'annese-speed'] },
    { claim: 'Zone blocking leaves the last man on the line; play-side linemen arc to the second level', status: 'Verified', sources: ['brinkley-speed', 'annese-speed', 'richters-veer'] },
    { claim: 'The slot or tight end arc-releases for the pitch back, the receivers stalk', status: '2 of 3', sources: ['brinkley-speed', 'psu-drills'] },
    { claim: 'Running it from gun doubles with the back beside the quarterback is a design choice (the pages use gun, pro and empty sets)', status: 'Assumption', sources: [] },
    NO_READ_SELECTOR, DESIGN_VALUES]);
}

export const MORE_PLAYS: readonly PlayDef[] = [insideVeer(), midline(), trap(), wham(), pinPull(), bunchTrail(), emptyStick(), goalLinePower(), speedOption()];
