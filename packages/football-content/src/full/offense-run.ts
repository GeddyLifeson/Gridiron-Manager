// Run plays of the full set (F4, G1). All drawn to the right. Every coaching claim cites the research in
// research/scheme-sources/run-schemes-and-fronts.md through the ids in sources.ts or the starter list.
import type { PlayDef, Slot } from '../starter/types.ts';
import { DESIGN_VALUES, OL, RIGHT_OF, ZONE_RULE, act, clause, cut, not, slot, test, through, type Basis, type OLRole } from './kit.ts';

const blockMan = (text: string, type: 'base' | 'reach' | 'down' | 'kickOut' | 'cutOff' | 'combo' = 'base') => clause(text, test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestDefender', type })]);
const comboClimb = (role: string) => clause('Uncovered: combo with my play-side neighbour, then climb', not(test('defenderOn', { where: 'me' })), [act('comboTo', { target: `role:${RIGHT_OF[role] ?? 'Y'}` }), act('climb')]);

const SCHEME_FIT: Basis = { claim: 'Run schemes are named by blocking rules, not by the formation; the same scheme runs from many looks', status: 'Verified', sources: ['gibbs-zone', 'kuchar-splitzone', 'floden-duo', 'brown-power'] };

// ---- Wide zone -----------------------------------------------------------------------------------
function wideZone(): PlayDef {
  const F = 'uc_singleback_11';
  const line = (role: OLRole): Slot => slot(F, role, {
    behavior: 'runBlock', params: { scheme: 'wideZone', side: 'right' }, concept: 'wideZoneRight', load: 1, technique: { runBlock: 'zoneStep' }, gaze: 'key',
    rules: role === 'LT'
      ? [blockMan('Backside: cut off the man on me or the first defender inside', 'cutOff'), clause('No one on me: cut off', not(test('defenderOn', { where: 'me' })), [act('cutOff', { target: 'nearestDefender' })])]
      : [blockMan('Covered: reach the man on me', 'reach'), comboClimb(role)],
  });
  return {
    id: 'run_wide_zone_right', name: 'Wide Zone Right', kind: 'run', personnel: '11', formationId: F, shotgun: false, runDirection: 'right', intent: 'base', drawnTo: 'right',
    slots: [
      ...OL.map(line),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'wideZone', side: 'right' }, concept: 'wideZoneRight', rules: [blockMan('Reach the defender outside me', 'reach')] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter', toss: 'open' }, concept: 'wideZoneRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'wideZone', aim: 'outsideLegOfTightEnd', cuts: 1, hold: 'press' }, path: [through(-3.5, 3), through(-1, 6), cut(5, 8)], concept: 'wideZoneRight', load: 1.5, rules: [clause('One cut: bounce if reached, next defender inside if he widens, cut back if that one flows', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'wideZoneRight', rules: [clause('Stalk the nearest defender', test('cushion', { target: 'nearestDefender', lt: 8 }), [act('block', { target: 'nearestDefender', type: 'base' })])] })),
    ],
    coachingPoints: ['Everyone steps to the sideline; covered linemen reach, uncovered linemen help then climb to the linebacker over the top.', 'The back presses the line, holds his track and makes one cut.', 'The backside end is held honest by the bootleg that is built off this play.'],
    basis: [
      { claim: 'Wide zone: a covered lineman reaches the man on him; an uncovered one helps then climbs to the linebacker over the top', status: 'Verified', sources: ['kou-widezone', 'byrnes-zone', 'gibbs-zone'] },
      { claim: 'The backside blocker cuts off', status: '2 of 3', sources: ['byrnes-zone', 'kou-widezone'] },
      { claim: 'The back aims at the outside leg of the tight end or the tackle', status: 'Verified', sources: ['gibbs-zone', 'rollins-rundesign', 'kou-widezone'] },
      { claim: 'The back holds his track for several steps; the ball arrives on about the fifth step', status: '1 of 3', sources: ['kou-widezone'] },
      { claim: 'Read: first down lineman from outside in, then the next; bounce, bang or bend, one cut', status: '2 of 3', sources: ['gibbs-zone', 'byrnes-zone'] },
      ZONE_RULE, SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

// ---- Split zone ----------------------------------------------------------------------------------
function splitZone(): PlayDef {
  const F = 'uc_singleback_11';
  const line = (role: OLRole): Slot => slot(F, role, {
    behavior: 'runBlock', params: { scheme: 'splitZone', side: 'right' }, concept: 'splitZoneRight', load: 1, technique: { runBlock: 'zoneStep' }, gaze: 'key',
    rules: role === 'LT'
      ? [blockMan('Backside: block the man on me, else cut off the first defender inside', 'cutOff')]
      : [blockMan('Covered: drive the man on me'), comboClimb(role)],
  });
  return {
    id: 'run_split_zone_right', name: 'Split Zone Right', kind: 'run', personnel: '11', formationId: F, shotgun: false, runDirection: 'right', intent: 'complement', drawnTo: 'right',
    slots: [
      ...OL.map(line),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'slice', side: 'left' }, concept: 'splitZoneRight', load: 1.5, path: [through(-1, 2), through(-1, -2)], rules: [clause('Slice across behind the line and kick out the back-side end man', test('timeGt', { s: 0.2 }), [act('block', { target: 'nearestDefender', type: 'kickOut' })])], gaze: 'key' }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'splitZoneRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'insideZone', aim: 'playsideGuardOutsideLeg', cuts: 1 }, path: [through(-2, 1.5), through(2, 2.5), cut(8, 3.5)], concept: 'splitZoneRight', load: 1.5, rules: [clause('One cut: read the first down lineman play side of the centre, then the next', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'splitZoneRight' })),
    ],
    coachingPoints: ['The line blocks inside zone; the slice player crosses behind it and kicks out the back-side end man.', 'The back runs the same path as inside zone.'],
    basis: [
      { claim: 'Split zone: the line blocks as in inside zone; a slice player crosses the formation and kicks out the back-side end man', status: 'Verified', sources: ['kuchar-splitzone', 'ralph-splitflow', 'svec-splitzone'] },
      { claim: 'The back runs the same path as base zone', status: '2 of 3', sources: ['kuchar-splitzone', 'ralph-splitflow'] },
      ZONE_RULE, SCHEME_FIT,
      { claim: 'The slice player here is the tight end; sources say "slice player" (H-back or tight end) without naming the formation role', status: 'Assumption', sources: [] },
      DESIGN_VALUES,
    ],
  };
}

// ---- Duo -----------------------------------------------------------------------------------------
function duo(): PlayDef {
  const F = 'uc_singleback_11';
  const line = (role: OLRole): Slot => slot(F, role, {
    behavior: 'runBlock', params: { scheme: 'duo', side: 'right' }, concept: 'duoRight', load: 1, technique: { runBlock: 'doubleTeam' }, gaze: 'key',
    rules: role === 'LT' ? [blockMan('Backside: block the man on me')]
      : [blockMan('Double team the down lineman with my neighbour, then one of us climbs to the linebacker', 'combo'), comboClimb(role)],
  });
  return {
    id: 'run_duo_right', name: 'Duo Right', kind: 'run', personnel: '11', formationId: F, shotgun: false, runDirection: 'right', intent: 'base', drawnTo: 'right',
    slots: [
      ...OL.map(line),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'duo', side: 'right' }, concept: 'duoRight', rules: [blockMan('Block down on the man inside me', 'down')] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'duoRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'duo', aim: 'behindDoubleTeams', cuts: 1, read: 'playsideLinebacker' }, path: [through(-2, 1), through(1, 2), cut(6, 2.5)], concept: 'duoRight', load: 1.5, rules: [clause('Downhill; bounce if the linebacker fills, cut inside if he scrapes', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'duoRight' })),
    ],
    coachingPoints: ['Duo is power without the puller: play-side linemen double team and climb to the back-side linebacker.', 'The back reads the play-side linebacker.'],
    basis: [
      { claim: 'Duo: the play side double teams to the back-side linebacker with no pullers', status: 'Verified', sources: ['floden-duo', 'boyd-duo', 'kuchar-westler-duo'] },
      { claim: 'The back reads the play-side linebacker: bounce if he fills, cut inside if he scrapes', status: '2 of 3', sources: ['floden-duo', 'boyd-duo'] },
      { claim: 'The back\'s aiming point: the playside guard (Floden), directly behind the double teams (Boyd), the back-side leg of the centre (Kuchar and Westler)', status: 'Conflict', sources: ['floden-duo', 'boyd-duo', 'kuchar-westler-duo'] },
      SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

// ---- Power ---------------------------------------------------------------------------------------
function power(): PlayDef {
  const F = 'uc_i_form_21';
  return {
    id: 'run_power_right', name: 'Power Right', kind: 'run', personnel: '21', formationId: F, shotgun: false, runDirection: 'right', intent: 'base', drawnTo: 'right',
    slots: [
      slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'power', job: 'hinge' }, concept: 'powerRight', rules: [blockMan('Hinge: protect the back side')] }),
      slot(F, 'LG', { behavior: 'pull', params: { scheme: 'power', type: 'wrap' }, concept: 'powerRight', load: 1.5, rules: [clause('Pull behind the line and wrap to the play-side linebacker', test('timeGt', { s: 0.1 }), [act('pull', { type: 'wrap' })])] }),
      slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'power', job: 'blockBack' }, concept: 'powerRight', rules: [blockMan('Block back on the man to the pulling side')] }),
      slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'power', job: 'doubleDown' }, concept: 'powerRight', rules: [blockMan('Block down: double the down lineman with my tackle', 'down')] }),
      slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'power', job: 'doubleDown' }, concept: 'powerRight', rules: [blockMan('Block down: double the down lineman, one of us peels to the linebacker', 'combo')] }),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'power', job: 'blockDown' }, concept: 'powerRight', rules: [blockMan('Block down on the man inside me', 'down')] }),
      slot(F, 'F', { behavior: 'runBlock', params: { scheme: 'power', job: 'kickOut' }, path: [through(-3, 1.5), through(0, 3)], concept: 'powerRight', load: 1.5, rules: [clause('Kick out the end man on the line', test('timeGt', { s: 0.2 }), [act('block', { target: 'nearestDefender', type: 'kickOut' })])] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'powerRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'power', follow: 'puller', cuts: 1 }, path: [through(-6, 1.5), through(-1, 3), cut(6, 4)], concept: 'powerRight', load: 1.5, rules: [clause('Follow the puller and read the kick-out block, cut off it', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'powerRight' }),
      slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'powerRight' }),
    ],
    coachingPoints: ['Play-side linemen block down; the back-side guard pulls and wraps to the linebacker; the fullback kicks out the end man.', 'The back follows the puller and reads the kick-out.'],
    basis: [
      { claim: 'Power: play-side linemen block down, guard and tackle double the down lineman, one peels to the linebacker', status: 'Verified', sources: ['brown-power', 'nguyen-power-option', 'rollins-rundesign'] },
      { claim: 'The back-side guard pulls and wraps to the play-side linebacker; the fullback or a wing kicks out the end man', status: 'Verified', sources: ['brown-power', 'nguyen-power-option', 'rollins-rundesign', 'bowen-readoption'] },
      { claim: 'The back-side tackle hinges and the centre blocks back', status: '1 of 3', sources: ['brown-power'] },
      { claim: 'The back follows the puller and reads whether he kicks or logs; Brown says read the gaps A to D with patience', status: '1 of 3', sources: ['brown-power'] },
      SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

// ---- Counter -------------------------------------------------------------------------------------
function counter(): PlayDef {
  const F = 'uc_i_form_21';
  return {
    id: 'run_counter_right', name: 'Counter Right', kind: 'run', personnel: '21', formationId: F, shotgun: false, runDirection: 'right', intent: 'complement', drawnTo: 'right',
    slots: [
      slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'counter', job: 'hinge' }, concept: 'counterRight', rules: [blockMan('Block the man on me or hinge to the play side')] }),
      slot(F, 'LG', { behavior: 'pull', params: { scheme: 'counter', type: 'kick' }, concept: 'counterRight', load: 1.5, rules: [clause('Pull and kick out the end man', test('timeGt', { s: 0.1 }), [act('pull', { type: 'kick' })])] }),
      slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'counter', job: 'down' }, concept: 'counterRight', rules: [blockMan('Block down the play side', 'down')] }),
      slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'counter', job: 'down' }, concept: 'counterRight', rules: [blockMan('Block down', 'down')] }),
      slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'counter', job: 'down' }, concept: 'counterRight', rules: [blockMan('Block down', 'down')] }),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'counter', job: 'seal' }, concept: 'counterRight', rules: [blockMan('Seal the end side', 'down')] }),
      slot(F, 'F', { behavior: 'pull', params: { scheme: 'counter', type: 'wrap' }, path: [through(-2, -1), through(0, 3)], concept: 'counterRight', load: 1.5, rules: [clause('Second puller: wrap behind the kick-out to the linebacker', test('timeGt', { s: 0.3 }), [act('pull', { type: 'wrap' })])] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter', counterStep: true }, concept: 'counterRight', load: 1.5, gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'counter', follow: 'secondPuller', cuts: 1 }, path: [through(-6, -1.5), through(-3, 1), cut(2, 3), through(7, 4)], concept: 'counterRight', load: 1.5, rules: [clause('Step away first, then follow the second puller', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'counterRight' }),
      slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'counterRight' }),
    ],
    coachingPoints: ['The back-side guard pulls first and kicks out; a second puller wraps; the back steps away then follows.', 'The play looks like power, so it pays when linebackers flow fast.'],
    basis: [
      { claim: 'Counter: the back-side guard pulls first and kicks; a second puller (tackle, tight end or back) wraps', status: 'Verified', sources: ['brown-counter', 'coyote-wham-iso', 'rollins-rundesign'] },
      { claim: 'The back steps away first, then follows the second puller', status: '1 of 3', sources: ['coyote-wham-iso'] },
      { claim: 'If linebackers flow fast, call counter or boot', status: 'Verified', sources: ['rich-sequencing', 'davidson-sequences', 'dunn-chiefs-pa'] },
      { claim: 'The second puller here is the fullback (the Gibbs version); the guard-and-tackle version is the other sourced form', status: '1 of 3', sources: ['brown-counter'] },
      SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

// ---- Iso -----------------------------------------------------------------------------------------
function iso(): PlayDef {
  const F = 'uc_i_form_21';
  return {
    id: 'run_iso_right', name: 'Iso Right', kind: 'run', personnel: '21', formationId: F, shotgun: false, runDirection: 'right', intent: 'situational', drawnTo: 'right',
    slots: [
      ...OL.map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'iso', side: 'right' }, concept: 'isoRight', rules: [blockMan('Block the man in front of me')] })),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'iso', side: 'right' }, concept: 'isoRight', rules: [blockMan('Block the man on me or inside me')] }),
      slot(F, 'F', { behavior: 'runBlock', params: { scheme: 'iso', job: 'leadOnLinebacker' }, path: [through(-3, 1), through(1, 2.5)], concept: 'isoRight', load: 1.5, rules: [clause('Take the play-side linebacker', test('timeGt', { s: 0.2 }), [act('block', { target: 'nearestDefender', type: 'lead' })])] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'isoRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'iso', aim: 'playsideGuardOutsideHip', cuts: 1 }, path: [through(-6, 0.5), through(-1, 1.5), cut(5, 2)], concept: 'isoRight', load: 1.5, rules: [clause('Follow the fullback to the linebacker, cut off his block', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'isoRight' }),
      slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'isoRight' }),
    ],
    coachingPoints: ['Linemen block the man in front; the fullback takes the play-side linebacker; the back follows him.', 'Slants and linebackers who meet the fullback early beat it.'],
    basis: [
      { claim: 'Iso: linemen block the man in front, the fullback takes the play-side linebacker, the back follows', status: 'Verified', sources: ['coyote-wham-iso', 'forbes-iso', 'kuchar-iso'] },
      { claim: 'The fullback\'s first step is the outside leg of the guard; the back aims at the guard\'s outside hip', status: '1 of 3', sources: ['coyote-wham-iso'] },
      { claim: 'Whether the back has a read: Forbes says the path is set; Space Coyote says he reads the play-side tackle then the fullback', status: 'Conflict', sources: ['forbes-iso', 'coyote-wham-iso'] },
      { claim: 'Weakness: slants and linebackers who meet the fullback early', status: '1 of 3', sources: ['coyote-wham-iso'] },
      SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

// ---- Buck sweep ----------------------------------------------------------------------------------
function buckSweep(): PlayDef {
  const F = 'uc_i_form_21';
  return {
    id: 'run_buck_sweep_right', name: 'Buck Sweep Right', kind: 'run', personnel: '21', formationId: F, shotgun: false, runDirection: 'right', intent: 'complement', drawnTo: 'right',
    slots: [
      slot(F, 'LT', { behavior: 'runBlock', params: { scheme: 'buck', job: 'hinge' }, concept: 'buckSweepRight', rules: [blockMan('Hinge: block the man inside me')] }),
      slot(F, 'LG', { behavior: 'pull', params: { scheme: 'buck', type: 'wrap' }, path: [through(-1, 0), through(0, 4)], concept: 'buckSweepRight', load: 1.5, rules: [clause('Pull and wrap behind the kick-out to the alley', test('timeGt', { s: 0.2 }), [act('pull', { type: 'wrap' })])] }),
      slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'buck', job: 'reach' }, concept: 'buckSweepRight', rules: [blockMan('Reach the nose', 'reach')] }),
      slot(F, 'RG', { behavior: 'pull', params: { scheme: 'buck', type: 'kick' }, path: [through(-1, 2), through(0, 5)], concept: 'buckSweepRight', load: 1.5, rules: [clause('Pull and kick out the end man', test('timeGt', { s: 0.1 }), [act('pull', { type: 'kick' })])] }),
      slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'buck', job: 'down' }, concept: 'buckSweepRight', rules: [blockMan('Block down on the man inside me', 'down')] }),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'buck', job: 'seal' }, concept: 'buckSweepRight', rules: [blockMan('Seal the man inside me', 'down')] }),
      slot(F, 'F', { behavior: 'runBlock', params: { scheme: 'buck', job: 'lead' }, path: [through(-3, 3), through(2, 7)], concept: 'buckSweepRight', load: 1.5, rules: [clause('Lead through the alley', test('timeGt', { s: 0.3 }), [act('block', { target: 'nearestDefender', type: 'lead' })])] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'buckSweepRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'buckSweep', follow: 'pullers', cuts: 1 }, path: [through(-6, 3), through(-3, 8), cut(2, 11)], concept: 'buckSweepRight', load: 1.5, rules: [clause('Follow the pullers and run off the wrap block', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      slot(F, 'X', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'buckSweepRight' }),
      slot(F, 'Z', { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'buckSweepRight' }),
    ],
    coachingPoints: ['Both guards pull: the first kicks out the end man, the second wraps behind him.', 'The line blocks down and reaches; the tackle on the back side hinges.'],
    basis: [
      { claim: 'Buck sweep: both guards pull, the first kicks out the end man, the second wraps behind', status: 'Verified', sources: ['forbes-iso', 'weeklyspiral-buck', 'glazier-gunsweep'] },
      { claim: 'The centre and tackles down-block inside defenders; the back-side tackle hinges (the book\'s "block back" is imprecise)', status: 'Verified', sources: ['weeklyspiral-buck', 'glazier-gunsweep', 'forbes-iso'] },
      { claim: 'Buck sweep is a Wing-T base run', status: '1 of 3', sources: ['weeklyspiral-buck'] },
      SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

// ---- Dart ----------------------------------------------------------------------------------------
function dart(): PlayDef {
  const F = 'uc_singleback_11';
  return {
    id: 'run_dart_right', name: 'Dart Right', kind: 'run', personnel: '11', formationId: F, shotgun: false, runDirection: 'right', intent: 'complement', drawnTo: 'right',
    slots: [
      slot(F, 'LT', { behavior: 'pull', params: { scheme: 'dart', type: 'wrap', gap: 'B' }, path: [through(-1, 0), through(0, 4)], concept: 'dartRight', load: 1.5, rules: [clause('Pull through the B gap to the play-side linebacker', test('timeGt', { s: 0.1 }), [act('pull', { type: 'wrap' })])] }),
      slot(F, 'LG', { behavior: 'runBlock', params: { scheme: 'dart', job: 'down' }, concept: 'dartRight', rules: [blockMan('Block down to the play side', 'down')] }),
      slot(F, 'C', { behavior: 'runBlock', params: { scheme: 'dart', job: 'down' }, concept: 'dartRight', rules: [blockMan('Block down to the play side', 'down')] }),
      slot(F, 'RG', { behavior: 'runBlock', params: { scheme: 'dart', job: 'down' }, concept: 'dartRight', rules: [blockMan('Block down on the man inside me', 'down')] }),
      slot(F, 'RT', { behavior: 'runBlock', params: { scheme: 'dart', job: 'down' }, concept: 'dartRight', rules: [blockMan('Block down on the man inside me', 'down')] }),
      slot(F, 'Y', { behavior: 'runBlock', params: { scheme: 'dart', job: 'seal' }, concept: 'dartRight', rules: [blockMan('Block the end man on the line', 'base')] }),
      slot(F, 'Q', { behavior: 'quarterback', params: { action: 'handoff', side: 'right', exchange: 'underCenter' }, concept: 'dartRight', gaze: 'ball' }),
      slot(F, 'R', { behavior: 'ballCarrier', params: { track: 'dart', follow: 'tacklePuller', cuts: 1 }, path: [through(-4, 1.5), through(0, 3), cut(6, 4)], concept: 'dartRight', load: 1.5, rules: [clause('Follow the pulling tackle and cut off his block', test('read', { kind: 'run', dir: 'any' }), [act('runPath')])], gaze: 'key' }),
      ...(['X', 'H', 'Z'] as const).map((r) => slot(F, r, { behavior: 'runBlock', params: { scheme: 'stalk' }, concept: 'dartRight' })),
    ],
    coachingPoints: ['The back-side tackle pulls to the play-side linebacker; the line blocks down.'],
    basis: [
      { claim: 'Dart: the back-side tackle pulls to the play-side linebacker', status: 'Verified', sources: ['ellis-dart', 'streelman-dart', 'steelersdepot-dart'] },
      { claim: 'The pull runs through the A gap (short) or B gap (long); a C-gap pull is not sourced', status: '1 of 3', sources: ['ellis-dart'] },
      { claim: 'The back\'s track: no source read describes it; one-back power track is a design value', status: 'Assumption', sources: [] },
      SCHEME_FIT, DESIGN_VALUES,
    ],
  };
}

export const FULL_RUNS: readonly PlayDef[] = [wideZone(), splitZone(), duo(), power(), counter(), iso(), buckSweep(), dart()];
