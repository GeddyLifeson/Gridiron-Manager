// Pressure calls for the starter books (F11, G2): creepers, simulated pressures and two more five-man pressures, so
// a protection set against the wrong picture is punished (F5.2.2, J5.4.2). Same conventions as defense.ts.
//
// What the words mean here, as the pages read 2026-11-26 state them (research/tuning/pass-protection.md, section 6):
// - Both rush four: a linebacker or defensive back rushes and a defensive lineman drops in his place.
// - A creeper comes from a base look that shows no pressure. A simulated pressure shows pressure before the snap
//   (linebackers walked up in the A gaps) and then rushes only four.
// - A fire zone rushes five with three deep and three under.
// Which gap, which dropper and which zone are stated per call below; depths and box counts no page gives are
// Assumption. `isSimulatedPressure` reads the call itself, so the engine never needs a typed flag.
import type { Basis, DefenseDef, Slot, Source } from '../starter/index.ts';
import { act, clause, test } from '../starter/build.ts';

type D = Omit<Slot, 'concept' | 'at'> & { at: Slot['at'] };
const mk = (concept: string, load = 1) => (s: D): Slot => ({ ...s, concept, load: s.load ?? load });

const RD = 'read 2026-11-26 (research/tuning/pass-protection.md, section 6)';
const s = (id: string, group: string, citation: string, url: string, how: Source['how'] = 'primary'): Source => ({ id, group, citation, url, how });
/** One author or staff is one independence group (A5.1.2). */
export const PRESSURE_SOURCES: readonly Source[] = [
  s('hoover-creeper-sim', 'hoover', `Barry Hoover, "Creepers vs. Simulated Pressures," 2019-08-10 (${RD}): both rush four with a lineman dropping; a creeper shows no pressure, a simulated pressure shows it`, 'https://coachhoover.blogspot.com/2019/08/creepers-vs-simulated-pressures.html'),
  s('hoover-sim-origin', 'hoover', `Barry Hoover, "Origin of Simulated Pressures," 2019-06-10 (${RD}): the 1997 Jets zone dog table (blitzer, gap, dropper, zone), mug looks, Cover 1 Rat and Cover 3 behind them`, 'https://coachhoover.blogspot.com/2019/06/origin-of-simulated-pressures.html'),
  s('alexander-passing-strength', 'alexander', `Cody Alexander, MatchQuarters, "Attacking the Passing Strength," 2022-09-12, free part (${RD}): a creeper is a replacement pressure, usually at the B gap or the edge; field and boundary creepers; simulated pressures attack the A gaps or show pressure`, 'https://www.matchquarters.com/p/attacking-the-passing-strength'),
  s('nix-creepers', 'nix', `Brian Nix (Alcoa HS), Glazier Clinics, "Confuse the Offense with Creepers Pressure Package," 2024-06-17 (${RD}): one of four declared rushers drops and an undeclared rusher comes; a simulated pressure shows five or six`, 'https://www.glazierclinics.com/football-coach-resources/confuse-the-offense-with-creepers-pressure-package'),
  s('gaylor-creepers-sims', 'gaylor', `Adam Gaylor (Jenks HS) relayed by Keith Grabowski, CoachTube, "Win Passing Downs with Creepers and Sims" (${RD}): creepers are zone-replace four-man pressures with the middle of the field closed, from the field or the boundary; a double A gap pressure`, 'https://coachtube.com/football/articles/win-passing-downs-with-creepers-and-sims', 'secondary'),
  s('ruiz-creepers', 'ruiz', `Steven Ruiz, USA Today Sports, "The next big thing in defense..." and "Getting Home, Part 4" (${RD}): four rush with a traditional rusher dropping, seven in coverage; a fire zone sends five`, 'https://www.inkl.com/news/the-next-big-thing-in-defense-could-end-the-nfl-s-pass-rush-v-coverage-debate', 'secondary'),
  s('sis-sim-definition', 'sis', `Brad Beatson, Sports Info Solutions, "Brian Flores The Bogeyman," 2024-10-31 (${RD}): a simulated pressure is a four-man rush with a usual rusher dropping and a usual dropper rushing`, 'https://www.sportsinfosolutions.com/2024/10/31/brian-flores-the-bogeyman/', 'secondary'),
];

const NOBODY_HELPS: Basis = { claim: 'Box counts, depths, landmarks and any alignment that no source states are design values', status: 'Assumption', sources: [] };
const FOUR_FOR_ONE: Basis = { claim: 'A creeper or simulated pressure rushes four: a linebacker or defensive back rushes and a defensive lineman drops into coverage in his place, so seven still cover', status: 'Verified', sources: ['hoover-creeper-sim', 'alexander-passing-strength', 'nix-creepers', 'gaylor-creepers-sims', 'ruiz-creepers', 'sis-sim-definition'] };
const CREEPER_LOOK: Basis = { claim: 'A creeper comes from a base look that shows four known rushers and no pressure before the snap', status: '2 of 3', sources: ['hoover-creeper-sim', 'nix-creepers'] };
const SIM_LOOK: Basis = { claim: 'A simulated pressure shows pressure before the snap (five or six at the line, linebackers walked up in the A gaps) and rushes only four', status: 'Verified', sources: ['hoover-creeper-sim', 'nix-creepers', 'alexander-passing-strength'] };
const COVER3_BEHIND: Basis = { claim: 'Creepers and simulated pressures are run with zone behind them and the middle of the field closed (three deep), among other coverages', status: '2 of 3', sources: ['hoover-sim-origin', 'gaylor-creepers-sims'] };
const FIRE_ZONE: Basis = { claim: 'A fire zone rushes five and leaves the coverage one man short', status: 'Verified', sources: ['hoover-sim-origin', 'ruiz-creepers', 'bowen-zoneblitz'] };
const COVER1_BASE: Basis = { claim: 'Cover 1: each eligible receiver has one defender, one deep safety in the middle, a hole player or a fifth rusher', status: 'Verified', sources: ['bowen-cover1', 'haddad-cover1', 'bullock-man', 'syed-cover1'] };

const RUN_FIT = (gap: 'A' | 'B' | 'C') => clause('Run read: fit my gap and shed', test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap, side: 'mine', shoulder: 'inside' })]);
const BREAK = clause('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')]);
const IN_ZONE = clause('Receiver in my zone: play him', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]);

const lineman = (c: string, role: string, tech: string, side: 'left' | 'right', at: [number, number], gap: 'A' | 'B' | 'C'): Slot => mk(c)({
  role, behavior: 'passRush', params: { track: 'fourMan', tech: Number(tech) }, at, onLine: true, stance: 'threePoint', rule: `lineTech:${tech}:${side}`, gaze: 'key', keys: ['nearestThreat'],
  technique: { rushMove: 'speedRush', rushCounter: 'swim' }, rules: [RUN_FIT(gap)],
});
const LINE: Readonly<Record<string, (c: string) => Slot>> = {
  LDE: (c) => lineman(c, 'LDE', '5', 'left', [1, -2.7], 'C'), LDT: (c) => lineman(c, 'LDT', '3', 'left', [1, -1.5], 'B'),
  RDT: (c) => lineman(c, 'RDT', '1', 'right', [1, 0.5], 'A'), RDE: (c) => lineman(c, 'RDE', '5', 'right', [1, 2.7], 'C'),
};
/** The four down linemen, with `drop` replaced by a lineman who drops off the line into `zone`. */
const front = (c: string, drop: string | null, zone: string, depth: number): Slot[] => Object.keys(LINE).map((role) => role !== drop ? LINE[role]!(c) : mk(c)({
  ...LINE[role]!(c), behavior: 'zoneDrop', params: { zone, depth, fromLine: true }, gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [IN_ZONE, BREAK],
}));
const zone = (c: string, role: string, at: [number, number], rule: string, behavior: 'zoneDrop' | 'deepZone', params: Record<string, string | number | boolean>): Slot =>
  mk(c)({ role, behavior, params, at, rule, stance: 'backpedal', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [IN_ZONE, BREAK] });
const deepThird = (c: string, role: string, side: 'left' | 'right'): Slot =>
  mk(c)({ role, behavior: 'deepZone', params: { zone: `deepThird${side === 'left' ? 'Left' : 'Right'}`, bail: true }, at: [7.5, side === 'left' ? -17 : 17], rule: `rcv:1:${side}:7.5:outside`, stance: 'backpedal', gaze: 'quarterback', keys: [`#1:${side}`], technique: { coverage: 'pressBail' }, rules: [BREAK] });
const threeDeep = (c: string): Slot[] => [zone(c, 'FS', [12, 0], 'hash:12:0', 'deepZone', { zone: 'deepMiddle', depth: 12 }), deepThird(c, 'LCB', 'left'), deepThird(c, 'RCB', 'right')];
const rusher = (c: string, role: string, at: [number, number], rule: string, gap: 'A' | 'B' | 'C', side: 'left' | 'right', plan: string, mugged = false): Slot =>
  mk(c)({ role, behavior: 'blitz', params: { gap, side }, at, rule, stance: 'twoPoint', ...(mugged ? { onLine: true } : {}), rules: [clause(`Rush the ${side} ${gap} gap on the snap`, test('timeGt', { s: 0 }), [act('rush', { track: 'inside', plan })])] });
const man = (c: string, role: string, at: [number, number], rule: string, target: string, tech: 'press' | 'off'): Slot =>
  mk(c)({ role, behavior: 'manCover', params: { man: target, technique: tech }, at, rule, stance: 'backpedal', gaze: 'man', keys: [target], technique: { coverage: tech === 'press' ? 'pressInside' : 'offInside' },
    rules: [clause('Receiver crosses my face: stay with him', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), clause('Ball in the air to my man: play the ball', test('ballThrownToMyArea'), [act('breakOnBall')])] });
const call = (id: string, name: string, coverageFamily: DefenseDef['coverageFamily'], pkg: string, rushers: number, boxCount: number, intent: string, slots: Slot[], basis: Basis[]): DefenseDef =>
  ({ id, name, coverageFamily, package: pkg, rushers, boxCount, drawnAgainst: 'gun_2x2_11', intent, slots, basis });

// ---- Field edge creeper ---------------------------------------------------------------------------
function creeperFieldEdge(): DefenseDef {
  const c = 'creeperFieldEdge';
  return call('def_creeper_field_edge', 'Field Edge Creeper (Cover 3)', 'cover3', '4-3 base look, four rush with the Sam off the field edge, boundary end dropping', 4, 7,
    'A base look. The Sam comes off the field edge and the end away from him drops to the weak hook, so four rush and seven cover with three deep. Weak spot: a lineman is a hook defender, and the Sam has left the field curl to the strong safety.', [
      ...front(c, 'LDE', 'hookLeft', 8),
      rusher(c, 'SAM', [4.5, 4], 'lb:over:rightCurlFlat', 'C', 'right', 'edgeBlitz'),
      zone(c, 'MIKE', [4.5, 0.5], 'lb:over:center', 'zoneDrop', { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'WILL', [4.5, -4], 'lb:over:leftCurlFlat', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'SS', [6, 7.5], 'rcv:2:right:6:inside', 'zoneDrop', { zone: 'curlFlatRight', depth: 11, landmark: 'numbersTop', rotated: true }),
      ...threeDeep(c),
    ], [
      FOUR_FOR_ONE, CREEPER_LOOK, COVER3_BEHIND,
      { claim: 'A field creeper: an off-ball defender blitzes off the edge to the field and a first-level defender opposite him replaces him in coverage', status: '2 of 3', sources: ['alexander-passing-strength', 'gaylor-creepers-sims'] },
      { claim: 'The Sam is the rusher, the boundary end drops to the weak hook and the strong safety takes the field curl-flat: design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Boundary creeper (1997 Jets "Lightning Sky") --------------------------------------------------
function creeperBoundary(): DefenseDef {
  const c = 'creeperBoundary';
  return call('def_creeper_boundary', 'Boundary Creeper (Weak Backer Edge, Tackle Drops)', 'cover3', '4-3 base look, four rush with the Will off the weak edge, weak tackle dropping', 4, 7,
    'A base look. The Will comes off the weak edge and the tackle to his side drops to the weak hook; the end to that side rushes inside him. Weak spot: a tackle in the hook zone and no weak curl-flat defender until the corner sinks.', [
      ...front(c, 'LDT', 'hookLeft', 6).map((x) => x.role === 'LDE' ? { ...x, params: { ...x.params, gap: 'B' } } : x),
      rusher(c, 'WILL', [4.5, -4], 'lb:over:leftCurlFlat', 'C', 'left', 'edgeBlitz'),
      zone(c, 'MIKE', [4.5, 0.5], 'lb:over:center', 'zoneDrop', { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'SAM', [4.5, 4], 'lb:over:rightCurlFlat', 'zoneDrop', { zone: 'curlFlatRight', depth: 11, landmark: 'numbersTop' }),
      zone(c, 'SS', [6, -7.5], 'rcv:2:left:6:inside', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop', rotated: true }),
      ...threeDeep(c),
    ], [
      FOUR_FOR_ONE, CREEPER_LOOK, COVER3_BEHIND,
      { claim: 'Zone dog "Lightning Sky" (1997 Jets): the weak outside linebacker blitzes the edge and a defensive tackle drops to the weak hook', status: '1 of 3', sources: ['hoover-sim-origin'] },
      { claim: 'A boundary creeper is a named family beside the field creeper', status: '2 of 3', sources: ['alexander-passing-strength', 'gaylor-creepers-sims'] },
      { claim: 'The end rushing inside the Will and the strong safety rotating to the weak curl-flat are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Double A gap mug, simulated pressure, Cover 3 ---------------------------------------------------
function simMugCover3(): DefenseDef {
  const c = 'simMugCover3';
  return call('def_sim_mug_cover3', 'Double A Gap Mug, Simulated Pressure (Cover 3)', 'cover3', '4-3, both inside backers walked up in the A gaps: six at the line, four rush, three deep', 4, 6,
    'Mike and Will stand in the A gaps so six threaten. At the snap the Mike rushes his A gap, the Will drops to the middle hook and the end to the Mike\'s side drops to the curl-flat, so only four come. Weak spot: the walked-up backers start a long way from their zones.', [
      ...front(c, 'RDE', 'curlFlatRight', 8),
      rusher(c, 'MIKE', [1.5, 1.2], 'lb:gap:rightA', 'A', 'right', 'aGapBlitz', true),
      mk(c)({ role: 'WILL', behavior: 'zoneDrop', params: { zone: 'middleHook', depth: 10, fromLine: true }, at: [1.5, -0.6], onLine: true, rule: 'lb:gap:leftA', stance: 'twoPoint', gaze: 'quarterback', keys: ['qb'], technique: { coverage: 'zoneEyes' }, rules: [IN_ZONE, BREAK] }),
      zone(c, 'SAM', [4.5, 4.5], 'lb:over:rightCurlFlat', 'zoneDrop', { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }),
      zone(c, 'SS', [6, -7.5], 'rcv:2:left:6:inside', 'zoneDrop', { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop', rotated: true }),
      ...threeDeep(c),
    ], [
      FOUR_FOR_ONE, SIM_LOOK, COVER3_BEHIND,
      { claim: 'The mug look: inside linebackers walked up in the A gaps threaten six and four rush ("the illusion of bringing six and only rushing four")', status: 'Verified', sources: ['hoover-creeper-sim', 'alexander-passing-strength', 'gaylor-creepers-sims'] },
      { claim: 'After the snap a simulated pressure drops one or both ends', status: '1 of 3', sources: ['alexander-passing-strength'] },
      { claim: 'Which backer rushes, which drops, and the end\'s curl-flat are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Mug look, Cover 1 Rat ---------------------------------------------------------------------------
function simMugCover1Rat(): DefenseDef {
  const c = 'simMugCover1Rat';
  return call('def_sim_mug_cover1_rat', 'Double A Gap Mug, Cover 1 Rat', 'cover1', '4-3, both inside backers walked up in the A gaps: six at the line, four rush, man free with a rat', 4, 6,
    'Six threaten from the mug look. The Will rushes his A gap, the Mike takes the back in man from the line, and the end away from the rush drops into the hole as the rat. Weak spot: a lineman is the hole player and every other defender is in man.', [
      ...front(c, 'RDE', 'hole', 7),
      rusher(c, 'WILL', [1.5, -0.6], 'lb:gap:leftA', 'A', 'left', 'aGapBlitz', true),
      mk(c)({ ...man(c, 'MIKE', [1.5, 1.2], 'lb:gap:rightA', 'role:R', 'off'), onLine: true, stance: 'twoPoint' }),
      man(c, 'SAM', [4, 7.5], 'rcv:2:right:4:inside', '#2:right', 'off'),
      man(c, 'SS', [5, -7.5], 'rcv:2:left:5:inside', '#2:left', 'off'),
      man(c, 'LCB', [7.5, -17], 'rcv:1:left:7.5:outside', '#1:left', 'off'),
      man(c, 'RCB', [7.5, 17], 'rcv:1:right:7.5:outside', '#1:right', 'off'),
      zone(c, 'FS', [13, 0], 'hash:13:0', 'deepZone', { zone: 'deepMiddle', depth: 13 }),
    ], [
      FOUR_FOR_ONE, SIM_LOOK, COVER1_BASE,
      { claim: 'Simulated pressures from a mug look are run with Cover 1 Rat behind them ("Show Blow 1 Rat")', status: '1 of 3', sources: ['hoover-sim-origin'] },
      { claim: 'Which backer rushes, the Mike on the back and the end as the rat are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Weak fire zone ------------------------------------------------------------------------------------
function fireZoneWeak(): DefenseDef {
  const c = 'fireZoneWeak';
  return call('def_cover3_fire_zone_weak', 'Cover 3 Fire Zone, Weak', 'cover3', '4-3, five rush to the open side, three deep and three under', 5, 6,
    'Five rush and six drop: Will and Mike blitz to the open side and the closed-side end drops to the seam-flat. Weak spot: one man short underneath if the blitz shows early.', [
      ...front(c, 'RDE', 'seamFlatRight', 5),
      rusher(c, 'MIKE', [4.5, -0.5], 'lb:gap:leftA', 'A', 'left', 'aGapBlitz'),
      rusher(c, 'WILL', [4.5, -4], 'lb:gap:leftC', 'C', 'left', 'edgeBlitz'),
      zone(c, 'SAM', [4.5, 1.5], 'lb:over:rightHook', 'zoneDrop', { zone: 'middleHook', depth: 10, match: 'no3' }),
      zone(c, 'SS', [5, -7.5], 'rcv:2:left:5:inside', 'zoneDrop', { zone: 'seamFlatLeft', depth: 5, match: 'no2' }),
      ...threeDeep(c),
    ], [
      FIRE_ZONE,
      { claim: 'The zone blitz is a five-man pressure with six dropping into three-deep, three-under coverage; an end drops to the seam-flat', status: '1 of 3', sources: ['bowen-zoneblitz'] },
      { claim: 'This call mirrors Under Smash to the open side; which backers come and who drops are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

// ---- Cover 1 with a fifth rusher --------------------------------------------------------------------------
function cover1FiveMan(): DefenseDef {
  const c = 'cover1FiveMan';
  return call('def_cover1_five_man', 'Cover 1, Five-Man Pressure', 'cover1', '4-3 base, man free, the Mike as a fifth rusher', 5, 6,
    'Man free with no hole player: the Mike blitzes the B gap as the fifth rusher and the Will takes the back. Weak spot: crossers have no hole defender to run into.', [
      ...front(c, null, '', 0),
      rusher(c, 'MIKE', [4.5, 0.5], 'lb:gap:rightB', 'B', 'right', 'bGapBlitz'),
      man(c, 'WILL', [4.5, -1.5], 'lb:over:leftHook', 'role:R', 'off'),
      man(c, 'SAM', [4, 7.5], 'rcv:2:right:4:inside', '#2:right', 'off'),
      man(c, 'SS', [5, -7.5], 'rcv:2:left:5:inside', '#2:left', 'off'),
      man(c, 'LCB', [7.5, -17], 'rcv:1:left:7.5:outside', '#1:left', 'off'),
      man(c, 'RCB', [7.5, 17], 'rcv:1:right:7.5:outside', '#1:right', 'off'),
      zone(c, 'FS', [13, 0], 'hash:13:0', 'deepZone', { zone: 'deepMiddle', depth: 13 }),
    ], [
      COVER1_BASE,
      { claim: 'Which linebacker is the fifth rusher and his gap are design values', status: 'Assumption', sources: [] },
      NOBODY_HELPS]);
}

export const PRESSURE_DEFENSE: readonly DefenseDef[] = [creeperFieldEdge(), creeperBoundary(), simMugCover3(), simMugCover1Rat(), fireZoneWeak(), cover1FiveMan()];

const LINE_ROLES: ReadonlySet<string> = new Set(['LDE', 'LDT', 'RDT', 'RDE', 'NT']);
const RUSH: ReadonlySet<string> = new Set(['passRush', 'blitz']);
/** A creeper or simulated pressure by its own assignments: four or fewer rush, a lineman drops, a backer or back rushes. */
export function isSimulatedPressure(def: DefenseDef): boolean {
  const rush = def.slots.filter((x) => RUSH.has(x.behavior));
  return rush.length <= 4 && rush.some((x) => !LINE_ROLES.has(x.role)) && def.slots.some((x) => LINE_ROLES.has(x.role) && !RUSH.has(x.behavior));
}
