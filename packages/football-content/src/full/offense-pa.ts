// Play action, movement passes, screens, RPO and the quarterback run of the full set (F7, F4.7). All drawn to the right.
// Sources: research/scheme-sources/play-action-screens-rpo.md and run-schemes-and-fronts.md (ids in sources.ts).
import type { PlayDef, Slot } from '../starter/types.ts';
import { DESIGN_VALUES, NUMBERED_FROM_SIDELINE, OL, RIGHT_OF, ROUTE_DEPTH, ZONE_RULE, act, clause, cut, not, protect, route, settle, slot, test, through, type Basis, type OLRole } from './kit.ts';

const blockMan = (text: string, type: 'base' | 'reach' | 'down' | 'kickOut' | 'cutOff' | 'combo' = 'base') => clause(text, test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type })]);
const comboClimb = (role: string) => clause('Uncovered: combo then climb', not(test('defenderOn', { where: 'me' })), [act('comboTo', { target: `role:${RIGHT_OF[role] ?? 'Y'}` }), act('climb')]);
const mk = (id: string, name: string, kind: PlayDef['kind'], F: string, shotgun: boolean, personnel: string, runDirection: PlayDef['runDirection'], intent: PlayDef['intent'], slots: Slot[], coachingPoints: string[], basis: Basis[]): PlayDef =>
  ({ id, name, kind, personnel, formationId: F, shotgun, runDirection, intent, slots, coachingPoints, basis, drawnTo: 'right' });

const UC = 'uc_singleback_11';
const UC12 = 'uc_12_singleback';
const G2 = 'gun_2x2_11';

const PA_LOOK: Basis = { claim: 'A play-action pass copies a run\'s look (formation, motion, backfield action) so defenders cannot tell them apart', status: 'Verified', sources: ['mays-playaction', 'rich-sequencing', 'syed-shanahan', 'solak-shanahan'] };
const SCREEN_CLASS: Basis = { claim: 'Screens are taught as the answer to pressure; a rusher who reads the screen and stops can deflect it', status: 'Verified', sources: ['alleman-screen', 'finley-lions-screens', 'karlo-screens', 'nguyen-screens'] };
const RPO_TAG: Basis = { claim: 'The line and back run the run unchanged; the pass is a tag; "when in doubt, hand it off"', status: 'Verified', sources: ['galina-rpo', 'kuchar-rpo', 'lamb-rpo', 'hargitt-rpo'] };

// ---- Naked bootleg -------------------------------------------------------------------------------
function nakedBoot(): PlayDef {
  const F = UC;
  const fakeLeft = (role: OLRole): Slot => slot(F, role, { behavior: 'runBlock', params: { scheme: 'wideZoneFake', side: 'left' }, concept: 'nakedBootRight', technique: { runBlock: 'zoneStep' }, gaze: 'key',
    rules: role === 'RT' ? [clause('Cut off the man on me and let the end go: no protection for the quarterback', test('timeGt', { s: 0.4 }), [act('cutOff', { target: 'nearestDefender' })])]
      : [clause('Sell the wide zone to the left, then block the man on me', test('timeGt', { s: 0.5 }), [act('block', { target: 'nearestDefender', type: 'base' })])] });
  return mk('movement_naked_boot', 'Naked Bootleg Right', 'movement_pass', F, false, '11', null, 'complement', [
    ...OL.map(fakeLeft),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'boot', side: 'right', roll: 'full', read: 'lowToHigh', protection: 'none' }, concept: 'nakedBootRight', load: 2, keys: ['role:Y', 'role:X', 'role:Z'], gaze: 'key' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'wideZone', fake: true, side: 'left' }, path: [through(-3, -3), through(0, -8)], concept: 'nakedBootRight' }),
    slot(F, 'Y', route('nakedBootRight', [through(-1, 6), settle(0, 12)], { params: { route: 'arrowFlat' } })),
    slot(F, 'X', route('nakedBootRight', [through(8, -17), cut(12, -8), through(14, 2), through(14, 9)], { params: { route: 'crosser' } })),
    slot(F, 'Z', route('nakedBootRight', [through(10, 16), cut(15, 22)], { params: { route: 'corner' } })),
    slot(F, 'H', route('nakedBootRight', [through(5, -7.5), settle(12, -4)], { params: { route: 'alertBackside' } })),
  ], ['Naked means nobody blocks the back-side end: the line sells wide zone the other way and the end has to be fooled or forced to stay honest.', 'If the end is not fooled, throw fast, throw away or escape.', 'Pairs with wide zone: if the end crashes, call it.'], [
    { claim: 'Boot has a blocker on the quarterback\'s edge; naked has none and the back-side end must be fooled or forced to stay honest', status: 'Verified', sources: ['haddad-sprintout', 'johnson-naked', 'solak-shanahan', 'evely-boot'] },
    { claim: 'The partner run is usually wide zone', status: 'Verified', sources: ['syed-shanahan', 'solak-shanahan', 'johnson-naked', 'evely-boot'] },
    { claim: 'The pattern has a flat, an intermediate cross, a deep corner and a back-side alert', status: 'Verified', sources: ['syed-shanahan', 'deberry-screens', 'brown-sprintout', 'evely-boot'] },
    { claim: 'If the naked end is not fooled the quarterback must throw fast, throw away or escape', status: 'Verified', sources: ['haddad-sprintout', 'solak-shanahan', 'evely-boot'] },
    { claim: 'If the end crashes, call naked', status: 'Verified', sources: ['evely-boot', 'solak-shanahan', 'coyote-throwback'] },
    { claim: 'Faster quarterbacks suit nakeds', status: '1 of 3', sources: ['haddad-sprintout'] },
    { claim: 'The quarterback\'s roll depth is not sourced (a half roll goes to 5 to 6 yd)', status: '1 of 3', sources: ['brown-sprintout'] },
    PA_LOOK, DESIGN_VALUES]);
}

// ---- Leak ----------------------------------------------------------------------------------------
function leak(): PlayDef {
  const F = UC12;
  return mk('movement_leak', 'Leak (Boot Left Off Wide Zone Right)', 'movement_pass', F, false, '12', null, 'complement', [
    ...OL.map((role) => slot(F, role, { behavior: 'runBlock', params: { scheme: 'wideZoneFake', side: 'right' }, concept: 'leakLeft', technique: { runBlock: 'zoneStep' }, gaze: 'key', rules: [clause('Sell the wide zone right, then block the man on me', test('timeGt', { s: 0.5 }), [act('block', { target: 'nearestDefender', type: 'base' })])] })),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'boot', side: 'left', roll: 'full', read: 'highToLow' }, concept: 'leakLeft', load: 2, keys: ['role:H', 'role:X', 'role:Z'], gaze: 'key' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'wideZone', fake: true }, path: [through(-3, 3), through(0, 8)], concept: 'leakLeft' }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'wideZoneFake', side: 'right' }, concept: 'leakLeft', rules: [blockMan('Sell the zone and block the end', 'reach')] }),
    slot(F, 'H', route('leakLeft', [through(-0.5, -4), through(1, -6), through(3, -12)], { params: { route: 'leak', sell: 'blockDown' }, rules: [clause('Sell the back-side block, then slip out across the flow', test('timeGt', { s: 0.6 }), [act('runPath')])] })),
    slot(F, 'X', route('leakLeft', [through(10, -17), cut(18, -17), through(32, -17)], { params: { route: 'go' } })),
    slot(F, 'Z', route('leakLeft', [through(8, 16), cut(12, 4), through(12, -6)], { params: { route: 'dragBack' } })),
  ], ['The back-side tight end sells a block, then leaks out across the flow behind linebackers who chased the run.', 'The quarterback boots away from the fake.'], [
    { claim: 'Leak: the tight end blocks down then slips out across the flow', status: 'Verified', sources: ['syed-shanahan', 'coiner-boot', 'coyote-throwback'] },
    { claim: 'The leak runs off wide zone, with the centre peeling in one version', status: '1 of 3', sources: ['coyote-throwback'] },
    { claim: 'If linebackers flow fast, call counter or boot', status: 'Verified', sources: ['rich-sequencing', 'davidson-sequences', 'coyote-throwback'] },
    PA_LOOK, DESIGN_VALUES]);
}

// ---- Pop pass ------------------------------------------------------------------------------------
function popPass(): PlayDef {
  const F = UC;
  const set = (role: OLRole): Slot => slot(F, role, { behavior: 'runBlock', params: { scheme: 'insideZoneFake', side: 'right' }, concept: 'popPass', technique: { runBlock: 'zoneStep' }, gaze: 'key', rules: [blockMan('Block the man on me as in inside zone'), comboClimb(role)] });
  return mk('pa_pop_pass', 'Pop Pass', 'play_action', F, false, '11', null, 'complement', [
    ...OL.map(set),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'playAction', drop: 'quickPop', read: 'seamBehindLinebacker' }, concept: 'popPass', load: 1.5, keys: ['role:Y'], gaze: 'key' }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', fake: true }, path: [through(-2, 1.5), through(1, 2.5)], concept: 'popPass' }),
    slot(F, 'Y', route('popPass', [through(7, 3), through(11, 3)], { params: { route: 'seam' } })),
    slot(F, 'X', route('popPass', [through(12, -17), through(25, -17)], { params: { route: 'go' } })),
    slot(F, 'Z', route('popPass', [through(8, 16), settle(8, 12)], { params: { route: 'hitch' } })),
    slot(F, 'H', route('popPass', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
  ], ['The line and back show inside zone; the linebacker steps to the run and the tight end pops up the seam behind him.', 'Call it when linebackers are quick to fit the run.'], [
    { claim: 'Pop pass: a quick throw to the tight end up the seam behind a linebacker stepping to an inside run', status: '2 of 3', sources: ['nguyen-pop', 'hargitt-pop'] },
    { claim: 'From the gun, a pop pass adds a pulling guard to move the linebacker; a token fake alone is not enough', status: '1 of 3', sources: ['nguyen-pop'] },
    PA_LOOK, DESIGN_VALUES]);
}

// ---- Tunnel screen -------------------------------------------------------------------------------
function tunnel(): PlayDef {
  const F = G2;
  const sell = (role: OLRole, release: boolean): Slot => slot(F, role, { behavior: 'passSet', params: { type: 'screenSell', job: release ? 'release' : 'sell' }, concept: 'tunnelScreen', technique: { passSet: 'setBase' }, gaze: 'key',
    rules: release ? [clause('Hold the set for the sell count, then release outside to the corner', test('timeGt', { s: 1.4 }), [act('switchBehavior', { to: 'runBlock' }), act('block', { target: 'nearestDefender', type: 'kickOut' })])]
      : [clause('Pass set and hold', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestRusher', type: 'base' })])] });
  return mk('screen_tunnel', 'Tunnel Screen Right', 'screen', F, true, '11', null, 'constraint', [
    sell('LT', false), sell('LG', false), sell('C', false), sell('RG', true), sell('RT', true),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'threeStepFromGun', sell: 'verticalLook', read: 'tunnel' }, concept: 'tunnelScreen', load: 1.5, keys: ['role:Z'], gaze: 'key' }),
    slot(F, 'Z', { behavior: 'route', params: { route: 'tunnel', sell: 'vertical' }, path: [through(3, 16), through(-0.5, 13)], concept: 'tunnelScreen', load: 1.5, keys: ['qb'], gaze: 'quarterback', rules: [clause('Sell the vertical three steps, then pivot back to the ball', test('timeGt', { s: 0.7 }), [act('runPath')])] }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'tunnelScreen', rules: [clause('Block the corner', test('cushion', { target: 'nearestDefender', lt: 8 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
    slot(F, 'X', route('tunnelScreen', [through(12, -17), through(25, -17)], { params: { route: 'go' } })),
    slot(F, 'H', route('tunnelScreen', [through(5, -7.5), settle(6, -7)], { params: { route: 'check' } })),
    slot(F, 'R', { behavior: 'passSet', params: { type: 'back', job: 'blitzPickup' }, concept: 'tunnelScreen' }),
  ], ['The outside receiver sells a vertical for three steps, pivots back and catches behind the line; the right tackle and guard release to block.', 'The slot blocks the corner.', 'Good against a hard-rushing, aggressive front.'], [
    { claim: 'Tunnel: the outside receiver sells vertical then comes back to the ball behind the line; the tackle and guard release; the slot blocks the corner', status: 'Verified', sources: ['dudley-screens', 'kuchar-tunnel', 'finley-lions-screens', 'nguyen-screens'] },
    { claim: 'Blocker detail differs: out, up, in with a guard kick-out (Dudley); guard-tackle tunnel with the guard kicking out the force (Kuchar); the verticals become lead blockers and the tackle cuts the rusher (Finley)', status: 'Conflict', sources: ['dudley-screens', 'kuchar-tunnel', 'finley-lions-screens'] },
    { claim: 'Sell time: sources give about 2 s or three steps; 1.4 s here is a design value inside the research range', status: 'Conflict', sources: ['karlo-screens', 'alleman-screen', 'dudley-screens'] },
    SCREEN_CLASS, DESIGN_VALUES]);
}

// ---- Bubble screen -------------------------------------------------------------------------------
function bubble(): PlayDef {
  const F = G2;
  return mk('screen_bubble', 'Bubble Screen Right', 'screen', F, true, '11', null, 'constraint', [
    ...OL.map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'screenStep', side: 'right' }, concept: 'bubbleScreen', technique: { runBlock: 'zoneStep' }, gaze: 'key', rules: [blockMan('Block the man on me as in zone'), comboClimb(r)] })),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'dropback', drop: 'oneStepFromGun', read: 'countOutside', throw: 'bubble' }, concept: 'bubbleScreen', load: 1, keys: ['role:Y'], gaze: 'key' }),
    slot(F, 'Y', { behavior: 'route', params: { route: 'bubble' }, path: [through(-1.5, 9.5), through(-1.5, 12.5)], concept: 'bubbleScreen', load: 1, keys: ['qb'], gaze: 'quarterback' }),
    slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'bubbleScreen', rules: [clause('Block the corner', test('cushion', { target: 'nearestDefender', lt: 8 }), [act('block', { target: 'nearestDefender', type: 'base' })])] }),
    slot(F, 'R', { behavior: 'runBlock', params: { scheme: 'lead' }, path: [through(-2, 5), through(0, 10)], concept: 'bubbleScreen', rules: [clause('Lead to the force defender', test('timeGt', { s: 0.3 }), [act('block', { target: 'nearestDefender', type: 'lead' })])] }),
    slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'bubbleScreen' }),
    slot(F, 'H', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'bubbleScreen' }),
  ], ['The slot bows back and out behind the outside receiver\'s block on the corner.', 'Count the defenders outside against the receivers: it works when there are fewer defenders than receivers.'], [
    { claim: 'Bubble: the slot bows back and out behind the outside receiver\'s block', status: 'Verified', sources: ['finley-lions-screens', 'karlo-screens', 'bowen-packaged', 'nguyen-screens', 'kuchar-rpo'] },
    { claim: 'The bubble punishes fewer defenders outside than receivers (three on two)', status: 'Verified', sources: ['bowen-packaged', 'nguyen-screens', 'lamb-rpo', 'kuchar-rpo'] },
    { claim: 'Against zone the bubble is tied to inside zone and the receiver takes two steps up before blocking', status: '1 of 3', sources: ['karlo-screens'] },
    SCREEN_CLASS, DESIGN_VALUES]);
}

// ---- Glance RPO ----------------------------------------------------------------------------------
function glance(): PlayDef {
  const F = G2;
  const zoneLine = (role: OLRole): Slot => slot(F, role, { behavior: 'runBlock', params: { scheme: 'insideZone', side: 'right' }, concept: 'glanceRpo', technique: { runBlock: 'zoneStep' }, gaze: 'key', rules: [blockMan('Covered: block the man on me'), comboClimb(role)] });
  return mk('rpo_glance', 'Inside Zone, Glance Tag', 'rpo', F, true, '11', 'right', 'constraint', [
    ...OL.map(zoneLine),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'rpo', read: 'safetyOrOutsideLinebacker', run: 'handoff', pass: 'glance' }, concept: 'glanceRpo', load: 2, gaze: 'key',
      rules: [clause('Two high: read the boundary safety; if he fills the run, throw the glance behind him', test('safetiesDeep', { cmp: 'ge', n: 2 }), [act('continue')]), clause('One high: read the outside linebacker; if he fills, throw the glance behind him', test('safetiesDeep', { cmp: 'le', n: 1 }), [act('continue')])] }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', aim: 'playsideGuardOutsideLeg', cuts: 1 }, path: [through(-1, -1), through(2, 1.5), cut(7, 3)], concept: 'glanceRpo', load: 1.5 }),
    slot(F, 'Y', route('glanceRpo', [through(5, 7.5), cut(10, 4)], { params: { route: 'glance', stem: 'fiveStepSkinnyPost' } })),
    slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'glanceRpo' }),
    slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'glanceRpo' }),
    slot(F, 'H', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'glanceRpo' }),
  ], ['Run inside zone; the quarterback reads one defender who has both a run fit and a pass zone, and the glance (a skinny post) goes behind him if he fills the run.', 'Linemen stay in their run fits so no one is downfield.'], [
    { claim: 'Glance: read off a safety (two-high) or outside linebacker (one-high); throw behind him if he fills; a five-step skinny post', status: 'Verified', sources: ['sampath-glance', 'weeklyspiral-glance', 'kuchar-glance'] },
    { claim: 'The glance depth (8 to 12 yd in the book) is not stated by any source read; only the five-step skinny post is', status: 'Assumption', sources: [] },
    { claim: 'A post-snap RPO reads one defender with both a run fit and a pass zone', status: 'Verified', sources: ['kuchar-rpo', 'galina-rpo', 'lamb-rpo', 'wilhite-rpo'] },
    RPO_TAG, ZONE_RULE, DESIGN_VALUES]);
}

// ---- Power read ----------------------------------------------------------------------------------
function powerRead(): PlayDef {
  const F = G2;
  return mk('qb_power_read', 'Power Read Right', 'qb_run', F, true, '11', 'right', 'constraint', [
    slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'power', job: 'hinge' }, concept: 'powerReadRight', rules: [blockMan('Hinge: protect the back side')] }),
    slot(F, 'LG', { behavior: 'pull', params: { scheme: 'power', type: 'wrap' }, concept: 'powerReadRight', load: 1.5, rules: [clause('Pull and wrap to the play-side linebacker', test('timeGt', { s: 0.1 }), [act('pull', { type: 'wrap' })])] }),
    slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'power', job: 'blockBack' }, concept: 'powerReadRight', rules: [blockMan('Block back on the man to the pulling side')] }),
    slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'power', job: 'doubleDown' }, concept: 'powerReadRight', rules: [blockMan('Block down with my tackle', 'combo')] }),
    slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'power', job: 'doubleDown', leave: 'playSideEnd' }, concept: 'powerReadRight', rules: [blockMan('Block down; the play-side end is left unblocked for the quarterback to read', 'down')] }),
    slot(F, 'Q', { behavior: 'quarterback', params: { action: 'zoneRead', man: 'nearestRusher', give: 'crash', keep: 'widen' }, concept: 'powerReadRight', load: 2, gaze: 'key',
      rules: [clause('End widens: keep and follow the guard', test('myManStunts', { dir: 'out' }), [act('continue')]), clause('End crashes: give inside to the back', test('myManStunts', { dir: 'in' }), [act('continue')])] }),
    slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'power', follow: 'puller', cuts: 1 }, path: [through(-2, 3), through(1, 4), cut(6, 5)], concept: 'powerReadRight', load: 1.5 }),
    slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'powerReadRight' }),
    ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'powerReadRight' })),
  ], ['Power blocking with the end left unblocked: the quarterback keeps and follows the guard if the end widens and gives if he crashes.', 'In the inverted version the back runs the sweep part and the quarterback runs the inside part.'], [
    { claim: 'Power read: power blocking, end unblocked; the quarterback keeps and follows the guard if the end widens, gives if he crashes', status: 'Verified', sources: ['rollins-rundesign', 'nguyen-power-option', 'bowen-readoption'] },
    { claim: 'The inverted version is separate: the back runs the sweep part and the quarterback the inside part', status: '2 of 3', sources: ['nguyen-power-option', 'bowen-readoption'] },
    { claim: 'The read man is the play-side end; the contract has no "read defender" selector, so the move uses the quarterback\'s man', status: 'Assumption', sources: [] },
    DESIGN_VALUES]);
}

export const FULL_PA: readonly PlayDef[] = [nakedBoot(), leak(), popPass(), tunnel(), bubble(), glance(), powerRead()];
