// The content port of the tick resolver (WP-23 owed item "real content port"; ports.ts `PlayContentPort`):
// the two calls of a play, as the chart caller or a coach makes them, turned into the eleven-a-side
// assignments, the quarterback's and ball carrier's plays and the pre-snap input the tick resolver runs.
//
// Where the content comes from:
// - Scrimmage plays and defensive calls: the WP-15 starter content (@gm/football-content `starter`), one
//   play per offensive kind and one call per coverage family, with their own sourced bases.
// - Kick, return and free-kick units: the PROVISIONAL alignments below. No shipped content has kicking-unit
//   alignments yet (the special-teams menu names calls, not spots). Every spot here is a design value
//   (Assumption under A5.2.1) except the dynamic-kickoff lines, which are read from the rule set.
//
// Mappings the starter content cannot give and this file fills (each an Assumption, listed in the README of
// this folder and in PROVISIONAL below): a call with no content id gets the starter play of its kind, run
// left mirrors the play; the drop words map onto the J7.1.1 drop table; the read order is the quarterback's
// keys, else the routes as drawn; read values fall 0.6, 0.5, 0.4, ...; an RPO is run as its run branch.
//
// Pure: a function of the calls, the situation and the rule set; no clock, no platform random.
import {
  SLOT_COUNT, SLOTS_PER_TEAM,
  type Assignment, type CoverageFamily, type KickCall, type PlayCalls, type PlayInput, type ReturnCall, type RuleSet,
} from '@gm/schema';
import { perception as perceptionModule, playerAi as playerAiModule, qb as qbModule, tickResolver } from '@gm/engine-core';
import { full, starter } from '@gm/football-content';
import { lang } from '@gm/football-lang';
import { createPresnapCalls } from './presnap-calls.ts';
import { environment } from '@gm/engine-game';

type PlaySetup = tickResolver.PlaySetup;
type QbPlay = qbModule.QbPlay;
type QbRead = qbModule.QbRead;
type DropType = qbModule.DropType;

/** Offensive team-slot order every offensive call uses, so a placeholder roster's player i always plays the same role. */
export const OFFENSE_ROLES = ['LT', 'LG', 'C', 'RG', 'RT', 'Q', 'R', 'X', 'Z', 'Y', 'H'] as const;
/** Defensive team-slot order. */
export const DEFENSE_ROLES = ['LDE', 'LDT', 'RDT', 'RDE', 'MIKE', 'WILL', 'SAM', 'LCB', 'RCB', 'SS', 'FS'] as const;
/** Kicking-unit team-slot order (punt, field goal, try). */
export const KICK_ROLES = ['LS', 'LG', 'RG', 'LT', 'RT', 'LE', 'RE', 'LW', 'RW', 'H', 'K'] as const;
/** Return-unit team-slot order. */
export const RETURN_ROLES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'KR'] as const;
/** Jersey numbers per unit slot (B2.3.1 bands, so the legality checks see linemen where linemen stand). Placeholder rosters only. */
export const UNIT_JERSEYS: Readonly<Record<'offense' | 'defense' | 'kick' | 'return', readonly number[]>> = {
  offense: [72, 66, 62, 64, 76, 12, 26, 11, 14, 85, 83],
  defense: [90, 94, 97, 91, 54, 52, 56, 24, 21, 31, 29],
  kick: [48, 67, 68, 77, 78, 86, 87, 40, 41, 8, 3],
  return: [95, 96, 98, 99, 57, 58, 59, 22, 23, 25, 27],
};

/** The provisional choices of this port, for the run reports. */
export const PROVISIONAL: readonly string[] = [
  'kick, return and free-kick unit spots are design values (Assumption); dynamic-kickoff lines come from the rule set',
  'a call without a content id gets the starter play of its kind (run: inside zone, middle: draw; one play per pass kind); the real game names a play from the level\'s starter book',
  'a defensive call outside its coverage family\'s role order keeps the fixed role order: a nickel back or a fourth linebacker takes the slot of the role the call lacks',
  'run left mirrors the play; passes are always drawn to the right',
  'drop words: threeStepFromGun = gun3, fiveStepFromGun = uc5 (he starts 4.5 yd deep, so five steps from the gun take the time and depth of five from under centre), sevenStep = uc7',
  'read order: the quarterback key roles, else routes as drawn; read values 0.6 falling by 0.1',
  'RPO and the flea flicker run as their run branch and as a play-action pass',
  'off-the-line receivers drawn at 1 yd are set at 1.4 yd so the pre-snap walk tolerance cannot leave them in the neither band',
  'an under-centre quarterback is set 0.9 yd behind the ball (the bodies touch nearer than the drawn 0.6 yd)',
  'a return or block unit sent against an offensive play (or a defense against a kick) plays the snap in its return or block alignment',
  'J4.2.2 rally rule added to every scrimmage defender (first for those with no run read in the starter content)',
  'a defender with no run read in the content comes up on a run read; an underneath zone defender holds 0.5 s before he drops',
  'a zone defender with no drawn path drops to a landmark for his zone name (yards from the ball) at the content depth',
  'package readiness 70 and opponent preparation 0.5 for every unit (neutral rosters carry no knowledge)',
];

const MAN_FAMILIES: ReadonlySet<CoverageFamily> = new Set<CoverageFamily>(['cover0', 'cover1', 'two_man']);

// ------------------------------------------------------------------------------------------ assignments

const swapSide = (v: unknown): unknown => (v === 'right' ? 'left' : v === 'left' ? 'right' : v);
const neg = (y: number): number => (y === 0 ? 0 : -y);

/** The play run the other way: every lateral value and every left or right word swapped. */
function mirror(a: Assignment): Assignment {
  const params: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(a.behavior.params)) params[k] = swapSide(v) as string | number | boolean;
  return {
    ...a,
    behavior: { ...a.behavior, params, path: a.behavior.path.map((p) => ({ ...p, py: neg(p.py) })) },
    preSnap: { ...a.preSnap, align: { ...a.preSnap.align, py: neg(a.preSnap.align.py) }, motion: a.preSnap.motion.map((p) => ({ ...p, py: neg(p.py) })) },
  };
}

/** Reorders a unit's assignments into the fixed role order; a role the play lacks takes the leftover one (H or F). */
function inOrder(as: readonly Assignment[], roles: readonly string[]): Assignment[] {
  const left = [...as];
  const out: (Assignment | null)[] = roles.map((r) => {
    const i = left.findIndex((a) => a.role === r);
    return i < 0 ? null : left.splice(i, 1)[0]!;
  });
  return out.map((a) => a ?? left.shift()!);
}

/**
 * B4.1.2: an offensive player off the line must be clearly off it at the snap. The starter content draws slot
 * receivers and wings exactly 1 yd off, the legality line (`legality.line.clearlyOffYd`), and the pre-snap walk
 * stops within `align.arriveYd` of a spot, so he would stand in the "neither" band. Such a man is set at
 * OFF_LINE_DEPTH instead (Assumption: a design value, deep enough for the walk's tolerance).
 */
export const OFF_LINE_DEPTH = 1.4;
/**
 * J1 bodies collide: a quarterback drawn 0.6 yd behind the centre cannot reach the spot (the two bodies touch
 * at about 0.8 yd), keeps walking into the centre and is "moving" at the snap. He is set at UNDER_CENTER_DEPTH.
 */
export const UNDER_CENTER_DEPTH = 0.9;
function clearOfLine(a: Assignment): Assignment {
  if (a.behavior.type === 'quarterback' && a.preSnap.align.px > -UNDER_CENTER_DEPTH) {
    return { ...a, preSnap: { ...a.preSnap, align: { ...a.preSnap.align, px: -UNDER_CENTER_DEPTH } } };
  }
  if (a.preSnap.onLine || a.behavior.type === 'quarterback' || a.preSnap.align.px <= -OFF_LINE_DEPTH || a.preSnap.align.px >= 0) return a;
  return { ...a, preSnap: { ...a.preSnap, align: { ...a.preSnap.align, px: -OFF_LINE_DEPTH } } };
}

/**
 * J4.2.2 universal rule "defenders rally to the ball": when the player sees who has the ball and that he is
 * running with it, he chases him. Appended after the assignment's own rules (first match wins, J4.1.1), except
 * for a defender whose rules have no run read at all (the starter linebackers and defensive backs): for him
 * it goes first, or a zone defender with a receiver in his zone would never leave it for a runner.
 */
const RALLY: Assignment['rules'][number] = {
  when: { op: 'test', name: 'ballCarrierDeclared', args: {} }, guard: null,
  then: [{ name: 'pursue', args: { angle: 'intercept' } }], text: 'Ball carrier declared: rally to the ball (J4.2.2)',
};
/** Zone defenders play with their eyes on the quarterback and the ball, wherever their hips point (J3.4.1). */
const ZONE_EYES: ReadonlySet<string> = new Set(['zoneDrop', 'deepZone']);
/**
 * The run read the starter linebackers and defensive backs do not carry (their content rules cover the pass only):
 * on a run read the player comes up for the ball, and an underneath zone defender holds his ground for a read step
 * before he drops, so a handoff does not find him backing away. The read step is a design value (Assumption).
 */
const RUN_READ: Assignment['rules'][number] = {
  // Only once a runner has declared: a quarterback still holding the ball behind the line (a mesh, a fake, a rollout)
  // holds the defender where he is, it does not send him at the quarterback.
  when: { op: 'all', of: [{ op: 'test', name: 'read', args: { kind: 'run', dir: 'any' } }, { op: 'test', name: 'ballCarrierDeclared', args: {} }] }, guard: null,
  then: [{ name: 'pursue', args: { angle: 'intercept' } }], text: 'Run read: come up and play the ball',
};
export const READ_STEP_S = 1.0;
const readsRun = (a: Assignment): boolean => JSON.stringify(a.rules).includes('"read"');
function withRally(a: Assignment): Assignment {
  return readsRun(a) ? { ...a, rules: [...a.rules, RALLY] } : { ...a, rules: [RALLY, RUN_READ, ...a.rules] };
}

/**
 * Where a zone defender drops to. The starter content names the zone and its depth but draws no path, and the
 * language's zone behaviors follow the drawn path, so without one he stands on his alignment all play. Lateral
 * landmarks are yards from the ball (design values, Assumption): hole 0, hook 4, hook-curl 7, curl-flat 11, flat 14,
 * deep middle 0, deep half 10, deep third and outside quarter 15, inside quarter 6. Depth is the content's `workTo`
 * or `depth`, else 5 for a flat and 15 for a deep zone. A deep defender goes at the snap (a drawn path). An
 * underneath defender holds for the read step and then drops (a rule after the run read, so a run read wins).
 */
const ZONE_LATERAL: readonly (readonly [string, number])[] = [
  ['hookCurl', 7], ['curlFlat', 11], ['hook', 4], ['hole', 0], ['flat', 14],
  ['deepMiddle', 0], ['deepHalf', 10], ['deepThird', 15], ['deepQuarter', 15], ['insideQuarter', 6],
];
function withDropPath(a: Assignment): Assignment {
  const type = a.behavior.type;
  if ((type !== 'zoneDrop' && type !== 'deepZone') || a.behavior.path.length > 0) return a;
  const zone = String(a.behavior.params['zone'] ?? '');
  const row = ZONE_LATERAL.find(([k]) => zone.toLowerCase().includes(k.toLowerCase()));
  if (row === undefined) return a;
  const num = (k: string): number | null => (typeof a.behavior.params[k] === 'number' ? (a.behavior.params[k] as number) : null);
  const depth = num('workTo') ?? num('depth') ?? (type === 'deepZone' ? 15 : 5);
  // The content's left is the assignment frame's positive side (build.ts flips the drawing).
  const side = zone.endsWith('Left') ? 1 : zone.endsWith('Right') ? -1 : 0;
  const px = Math.max(depth, a.preSnap.align.px), py = side * row[1];
  if (type === 'deepZone') return { ...a, behavior: { ...a.behavior, path: [{ px, py, kind: 'settle', landmark: null }] } };
  const drop: Assignment['rules'][number] = {
    // "Not a run read" is part of the condition, not a guard: a guard is asked once, when the condition turns true, and
    // a defender fooled by a fake has to be able to drop later, when his read comes back to pass.
    when: { op: 'all', of: [
      { op: 'any', of: [{ op: 'test', name: 'read', args: { kind: 'pass', dir: 'any' } }, { op: 'test', name: 'timeGt', args: { s: READ_STEP_S } }] },
      { op: 'not', of: { op: 'test', name: 'read', args: { kind: 'run', dir: 'any' } } }] },
    guard: null,
    then: [{ name: 'dropTo', args: { px, py } }], text: 'Pass read, or no read after the read step: drop to my zone',
  };
  const at = a.rules.indexOf(RUN_READ);
  return { ...a, rules: [...a.rules.slice(0, at + 1), drop, ...a.rules.slice(at + 1)] };
}

const BOX_DEPTH_YD = 6, BOX_HALF_WIDTH_YD = 6;
const LINEMEN: ReadonlySet<string> = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
/**
 * A defender's assignment key list (J3.1.2) resolved to slots for the perception system, with the ball last.
 * `qb`, `role:X` and `#n:side` resolve from the offense's alignment; `nearestThreat` is the receiver nearest his
 * spot. Without keys the perception system gives him no primary key, so he reads no run-pass evidence and is
 * slow to the handoff: every defender also tracks the ball (provisional, J3.1.2 names no default).
 */
function defenderKeys(a: Assignment, O: readonly Assignment[], qbSlot: number): number[] {
  const rec = O.map((x, i) => ({ i, py: x.preSnap.align.py, px: x.preSnap.align.px, eligible: !LINEMEN.has(x.role) && i !== qbSlot }));
  const receiver = (n: number, sign: number): number => {
    const side = rec.filter((r) => r.eligible && Math.sign(r.py) === sign).sort((x, y) => Math.abs(y.py) - Math.abs(x.py));
    return side[n - 1]?.i ?? -1;
  };
  const out: number[] = [];
  for (const k of a.keys) {
    let s = -1;
    if (k === 'qb') s = qbSlot;
    else if (k.startsWith('role:')) s = O.findIndex((x) => x.role === k.slice(5));
    else if (k === 'nearestThreat') {
      let best = Infinity;
      for (const r of rec) {
        if (!r.eligible) continue;
        const dy = r.py - a.preSnap.align.py, dx = r.px + a.preSnap.align.px, d = dx * dx + dy * dy;
        if (d < best) { best = d; s = r.i; }
      }
    } else {
      const m = /^#(\d+)(?::(left|right))?$/.exec(k);
      if (m !== null) s = receiver(Number(m[1]), m[2] === 'right' ? -1 : 1);
    }
    if (s >= 0 && !out.includes(s)) out.push(s);
  }
  // A defender whose assignment names no key still has to read run or pass (J3.2.2 reads only from a primary key).
  // Provisional: a man in the box reads the lineman across from him through to the quarterback, anyone else the
  // quarterback. J3.1.2 names no default, so this is a design value until the calls carry their keys.
  if (out.length === 0) {
    if (a.preSnap.align.px <= BOX_DEPTH_YD && Math.abs(a.preSnap.align.py) <= BOX_HALF_WIDTH_YD) {
      let best = -1, bestD = Infinity;
      O.forEach((x, i) => { const d = Math.abs(x.preSnap.align.py - a.preSnap.align.py); if (LINEMEN.has(x.role) && d < bestD) { bestD = d; best = i; } });
      if (best >= 0) out.push(best);
    }
    if (qbSlot >= 0) out.push(qbSlot);
  }
  out.push(perceptionModule.KEY_BALL);
  return out;
}

interface OffensePlay { readonly def: starter.PlayDef; readonly O: Assignment[] }

const PLAY_FOR_KIND: Readonly<Record<string, string>> = {
  run: 'run_inside_zone_right', dropback_pass: 'dropback_four_verticals', quick_pass: 'quick_stick', play_action: 'play_action_deep_cross',
  movement_pass: 'movement_boot_flood', screen: 'screen_slow_rb', rpo: 'rpo_zone_bubble', draw: 'draw_rb', qb_run: 'qb_zone_read',
  trick: 'trick_flea_flicker', kneel: 'kneel_victory', spike: 'spike_clock',
};

// --------------------------------------------------------------------------------------- kicking units

type Clause = NonNullable<starter.Slot['rules']>[number];
type Raw = { role: string; behavior: string; at: [number, number]; onLine?: boolean; params?: Record<string, string | number | boolean>; path?: [number, number][]; rules?: Clause[] };
const slotOf = (r: Raw): Assignment => starter.toAssignment({
  role: r.role, behavior: r.behavior, at: r.at, onLine: r.onLine ?? false, params: r.params ?? {}, concept: `st.${r.behavior}`, gaze: 'key',
  ...(r.path ? { path: r.path.map(([px, py]) => ({ px, py })) } : {}), ...(r.rules ? { rules: r.rules } : {}),
});

// What the kicking units do once the ball is kicked (F12 coverage lanes and returns; provisional design values).
// The language's kicking behaviors stand on their spot until a rule or a drawn path moves them, so without these the
// punt team watched the punt from the line and covered only after the catch.
/** A gunner's path ends this far short of where the punt is expected to come down: the returner's spot, or a normal punt's distance when he stands deeper than that (design values). */
const GUNNER_BREAKDOWN_YD = 6, PUNT_EXPECTED_YD = 48;
const KICKED = { op: 'test', name: 'ballKicked', args: {} } as const;
/** After this long the punt is away (snap 0.75 s plus 1.3 s to the foot, J9.4.3): the protectors count it and release (design value). */
const PUNT_RELEASE_S = 2.2;
const RELEASED = { op: 'test', name: 'timeGt', args: { s: PUNT_RELEASE_S } } as const;
const RETURNER = `slot:${SLOTS_PER_TEAM + 10}`;
/** A protector lets go of his block and runs his coverage lane; at the catch the behavior's own table sends him to the returner. */
const COVER_LANE: Clause = { when: RELEASED, then: [{ name: 'switchBehavior', args: { to: 'kickCoverage' } }, { name: 'runPath', args: {} }], text: 'Punt away: release and cover the lane' };
/** The snapper has no lane: he goes down the middle at the returner. */
const COVER_MIDDLE: Clause = { when: RELEASED, then: [{ name: 'switchBehavior', args: { to: 'kickCoverage' } }, { name: 'carry', args: { target: RETURNER, toDepth: 60 } }], text: 'Punt away: release down the middle to the returner' };
/**
 * A gunner releases at the snap down his drawn path, past the jammer and in to a spot short of where the returner lines
 * up. He holds there for the tackle at the catch (the behavior's own table) or goes to a ball on the ground (its fumble
 * event). He does not run at the returner himself: a man that far away drops in and out of what he can follow.
 */
const gunnerPath = (returnerPx: number, side: 1 | -1): [number, number][] => [[5, 18 * side], [Math.min(returnerPx, PUNT_EXPECTED_YD) - GUNNER_BREAKDOWN_YD, 3 * side]];
/** A man on the return team turns from the rush to block the first cover man near him. */
const HOLD_UP: Clause = { when: KICKED, then: [{ name: 'switchBehavior', args: { to: 'kickReturnBlock' } }, { name: 'block', args: { target: 'nearestDefender', type: 'base' } }], text: 'Ball kicked: block the nearest cover man' };
const jam = (slot: number): Clause => ({ when: { op: 'test', name: 'timeGt', args: { s: 0 } }, then: [{ name: 'block', args: { target: `slot:${slot}`, type: 'base' } }], text: 'Snap: hold up the gunner' });
/** How deep the punt team's lanes run before the men hold them and wait for the returner (design value). */
const PUNT_LANE_DEPTH_YD = 40;
/** Where the punt returner stands: this deep from the line, but not behind the yard line inside which he lets a punt go (design values; I4.5 default card "never field a punt inside the 10"). */
const PUNT_RETURNER_DEPTH_YD = 52, PUNT_LET_GO_INSIDE_YD = 10;
const puntReturnerPx = (input: PlayInput): number => Math.max(15, Math.min(PUNT_RETURNER_DEPTH_YD, 100 - Math.round(ownYard(input)) - PUNT_LET_GO_INSIDE_YD));

/** Spread punt: seven on the line (snapper, guards, tackles, two gunners), two wings, the personal protector, the punter. */
function puntUnit(returnerPx: number): Assignment[] {
  const cover = (role: string, at: [number, number], laneY: number, onLine = true, behavior = 'protectKick'): Assignment =>
    slotOf({ role, behavior, at, onLine, path: [[PUNT_LANE_DEPTH_YD, laneY]], rules: [COVER_LANE] });
  return [
    slotOf({ role: 'LS', behavior: 'snapper', at: [-0.4, 0], onLine: true, rules: [COVER_MIDDLE] }),
    cover('LG', [-0.4, -1.3], -6), cover('RG', [-0.4, 1.3], 6),
    cover('LT', [-0.4, -2.6], -12), cover('RT', [-0.4, 2.6], 12),
    slotOf({ role: 'LE', behavior: 'gunner', at: [-0.4, -18], onLine: true, path: gunnerPath(returnerPx, -1) }),
    slotOf({ role: 'RE', behavior: 'gunner', at: [-0.4, 18], onLine: true, path: gunnerPath(returnerPx, 1) }),
    cover('LW', [-1.2, -3.6], -18, false), cover('RW', [-1.2, 3.6], 18, false),
    cover('H', [-5, 0.5], 3, false),
    slotOf({ role: 'K', behavior: 'kicker', at: [-14, 0] }),
  ];
}

/** Field goal and try kick: seven on the line, two wings, the holder at seven yards, the kicker behind him. */
function placeKickUnit(): Assignment[] {
  return [
    slotOf({ role: 'LS', behavior: 'snapper', at: [-0.4, 0], onLine: true }),
    slotOf({ role: 'LG', behavior: 'protectKick', at: [-0.4, -1.2], onLine: true }),
    slotOf({ role: 'RG', behavior: 'protectKick', at: [-0.4, 1.2], onLine: true }),
    slotOf({ role: 'LT', behavior: 'protectKick', at: [-0.4, -2.4], onLine: true }),
    slotOf({ role: 'RT', behavior: 'protectKick', at: [-0.4, 2.4], onLine: true }),
    slotOf({ role: 'LE', behavior: 'protectKick', at: [-0.4, -3.6], onLine: true }),
    slotOf({ role: 'RE', behavior: 'protectKick', at: [-0.4, 3.6], onLine: true }),
    slotOf({ role: 'LW', behavior: 'protectKick', at: [-1.2, -4.6] }),
    slotOf({ role: 'RW', behavior: 'protectKick', at: [-1.2, 4.6] }),
    slotOf({ role: 'H', behavior: 'holder', at: [-7, 0] }),
    slotOf({ role: 'K', behavior: 'kicker', at: [-9.5, -2] }),
  ];
}

/** Punt return: six at the line, two jammers on the gunners, two set up the wall, the returner deep. */
function puntReturnUnit(returnerPx: number): Assignment[] {
  const out: Assignment[] = [];
  for (let i = 0; i < 6; i++) out.push(slotOf({ role: RETURN_ROLES[i]!, behavior: 'rushKick', at: [1, (i - 2.5) * 1.6], onLine: true, rules: [HOLD_UP] }));
  // The jammers line up across from the gunners (kicking-unit slots 5 and 6: the left and right ends).
  out.push(slotOf({ role: 'R7', behavior: 'kickReturnBlock', at: [1, -18], rules: [jam(KICK_ROLES.indexOf('LE'))] }), slotOf({ role: 'R8', behavior: 'kickReturnBlock', at: [1, 18], rules: [jam(KICK_ROLES.indexOf('RE'))] }));
  out.push(slotOf({ role: 'R9', behavior: 'kickReturnBlock', at: [12, -4], rules: [HOLD_UP] }), slotOf({ role: 'R10', behavior: 'kickReturnBlock', at: [12, 4], rules: [HOLD_UP] }));
  out.push(slotOf({ role: 'KR', behavior: 'returner', at: [returnerPx, 0] }));
  return out;
}

/** Field-goal and try block: nine across the line, one off it, one deep for a short kick. */
function kickBlockUnit(): Assignment[] {
  const out: Assignment[] = [];
  for (let i = 0; i < 9; i++) out.push(slotOf({ role: RETURN_ROLES[i]!, behavior: 'rushKick', at: [1, (i - 4) * 1.3], onLine: true }));
  out.push(slotOf({ role: 'R10', behavior: 'rushKick', at: [3, 0] }), slotOf({ role: 'KR', behavior: 'returner', at: [20, 0] }));
  return out;
}

/**
 * Free kick, kicking team: the kicker at the ball and ten in coverage across the field. `coverPx` is how far
 * beyond the ball the coverage stands (traditional kickoff: just behind it; dynamic kickoff: on the receiving
 * team's line from the rule set).
 */
function freeKickUnit(coverPx: number, halfWidth: number): Assignment[] {
  const out: Assignment[] = [];
  const step = (2 * halfWidth - 4) / 9;
  for (let i = 0; i < 10; i++) out.push(slotOf({ role: KICK_ROLES[i]!, behavior: 'kickCoverage', at: [coverPx, -halfWidth + 2 + i * step] }));
  out.push(slotOf({ role: 'K', behavior: 'kicker', at: [-1, 0] }));
  return out;
}

/** Free kick, receiving team: a front line, a second line and two returners, or the hands team for an onside kick. */
function receivingUnit(frontPx: number, secondPx: number, deepPx: number, halfWidth: number, hands: boolean): Assignment[] {
  const out: Assignment[] = [];
  const front = hands ? 9 : 5, step = (2 * halfWidth - 8) / (front - 1);
  for (let i = 0; i < front; i++) out.push(slotOf({ role: RETURN_ROLES[i]!, behavior: 'kickReturnBlock', at: [frontPx, -halfWidth + 4 + i * step] }));
  if (!hands) for (let i = 0; i < 4; i++) out.push(slotOf({ role: RETURN_ROLES[front + i]!, behavior: 'kickReturnBlock', at: [secondPx, (i - 1.5) * 8] }));
  if (hands) out.push(slotOf({ role: 'R10', behavior: 'kickReturnBlock', at: [secondPx, 0] }), slotOf({ role: 'KR', behavior: 'returner', at: [deepPx, 0] }));
  else out.push(slotOf({ role: 'R10', behavior: 'returner', at: [deepPx, -5] }), slotOf({ role: 'KR', behavior: 'returner', at: [deepPx, 5] }));
  return out;
}

// --------------------------------------------------------------------------------------- the play setup

const ROUTE = 'route';

/** Boot launch point (provisional design values): depth behind the line, and width as a multiple of the tackle's split. */
export const BOOT_DEPTH_YD = 6;
export const BOOT_WIDTH = 2.5;
/** The pop pass's token fake, seconds (provisional design value). */
export const POP_FAKE_S = 0.3;

function dropOf(word: unknown, shotgun: boolean): DropType {
  if (word === 'threeStepFromGun') return 'gun3';
  if (word === 'sevenStep') return 'uc7';
  if (word === 'fiveStep' || word === 'fiveStepFromGun') return 'uc5';
  if (word === 'threeStep') return 'uc3';
  // One step and throw: the quick screens from the gun, and the pop pass off a run fake.
  if (word === 'oneStepFromGun' || word === 'quickPop') return 'gunQuick';
  return shotgun ? 'gun3' : 'uc5';
}

/** Share of the back's run to a spot that the quarterback may use to get there himself (he turns first). Design value (Assumption). */
const MESH_QB_SHARE = 0.8;
const MESH_STEP_YD = 0.5;

/**
 * Where a handoff happens (F4): walking the back's drawn path from his alignment, the first spot behind the line
 * that is nearer to the quarterback than `MESH_QB_SHARE` of the back's run to it; the last spot behind the line
 * when there is none. Null when the path never goes behind the line.
 */
export function meshPoint(qb: { px: number; py: number }, back: { px: number; py: number }, path: readonly { px: number; py: number }[]): { px: number; py: number } | null {
  let fromX = back.px, fromY = back.py, run = 0, last: { px: number; py: number } | null = null;
  for (const pt of path) {
    const dx = pt.px - fromX, dy = pt.py - fromY, len = Math.sqrt(dx * dx + dy * dy), steps = Math.max(1, Math.ceil(len / MESH_STEP_YD));
    for (let i = 1; i <= steps; i++) {
      const x = fromX + dx * i / steps, y = fromY + dy * i / steps;
      if (x >= 0) return last;
      last = { px: x, py: y };
      const qx = x - qb.px, qy = y - qb.py;
      if (Math.sqrt(qx * qx + qy * qy) <= MESH_QB_SHARE * (run + len * i / steps)) return last;
    }
    run += len; fromX = pt.px; fromY = pt.py;
  }
  return last;
}

/** The quarterback's play from the starter quarterback slot (J7 inputs). Team slots are the fixed order. */
function qbPlayOf(def: starter.PlayDef, O: readonly Assignment[], defenseSlotOf: (role: string) => number): QbPlay | null {
  const qbSlot = O.findIndex((a) => a.behavior.type === 'quarterback');
  if (qbSlot < 0) return null;
  const q = O[qbSlot]!, action = q.behavior.params['action'];
  const backSlot = O.findIndex((a) => a.role === 'R');
  const routes = O.map((a, s) => ({ a, s })).filter((x) => x.a.behavior.type === ROUTE && x.s !== qbSlot);
  // Read order: the receivers the quarterback's keys name, in that order (a bound key is `slot:n`), then the rest
  // from the shortest route to the deepest and, at one depth, from the inside out. The starter plays name only the
  // first read, and slot order alone made the outside clear-out the second read of every quick-game play.
  // Provisional until the content carries a progression.
  const keyed = q.keys.map((k) => (k.startsWith('role:') ? O.findIndex((a) => a.role === k.slice(5)) : k.startsWith('slot:') ? Number(k.slice(5)) : -1)).filter((n) => n >= 0);
  const depthOf = (a: Assignment): number => a.behavior.path.reduce((m, p) => Math.max(m, p.px), 0);
  const ordered = [...routes].sort((x, y) => {
    const ix = keyed.indexOf(x.s), iy = keyed.indexOf(y.s);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || depthOf(x.a) - depthOf(y.a) || Math.abs(x.a.preSnap.align.py) - Math.abs(y.a.preSnap.align.py) || x.s - y.s;
  });
  // A play whose quarterback reads only the back (the screen) has one read. With the clear-out routes behind it as
  // later reads he held the ball for a better throw than a screen ever looks like, and took the sack.
  const only = q.behavior.params['read'] === 'back' ? ordered.filter((x) => x.s === backSlot) : [];
  const reads: QbRead[] = (only.length > 0 ? only : ordered).map((x, i) => ({ kind: 'receiver', target: tickResolver.qbTargetOf(x.s, x.a), priorValue: Math.max(0.1, 0.6 - 0.1 * i) }));
  const eligible = routes.map((x) => x.s);
  const base = qbModule.basePlay(qbSlot, dropOf(q.behavior.params['drop'], def.shotgun), reads);
  const pocket = { leftPy: O[0]!.preSnap.align.py, rightPy: O[4]!.preSnap.align.py };
  switch (action) {
    case 'kneel': return { ...base, kind: 'kneel', reads: [], eligible: [], pocket };
    case 'spike': return { ...base, kind: 'spike', reads: [], eligible: [], pocket };
    case 'handoff': case 'rpo': case 'fakeDrop': {
      // F4 the mesh point: the first spot on the back's drawn path behind the line that the quarterback can get to
      // before the back does. The first drawn point alone was wrong for deep backs: on power and pin and pull it
      // sits a yard in front of the back, six yards behind the centre, and the back was past it before the
      // quarterback had turned, so every one of those calls ended as a quarterback keep.
      const back = O[backSlot]!;
      const meet = meshPoint(q.preSnap.align, back.preSnap.align, back.behavior.path);
      return { ...base, kind: 'handoff', reads: [], eligible, handoff: { backSlot, meet }, pocket };
    }
    case 'zoneRead': {
      const keep = q.behavior.params['keep'];
      return { ...base, kind: 'mesh', reads: [], eligible, pocket, mesh: { keySlot: defenseSlotOf(keep === 'left' ? 'LDE' : 'RDE'), backSlot, startS: 0, endS: 0.5, onCrash: 'keep' } };
    }
    case 'playAction': case 'boot': case 'handoffThenReceiveBack': {
      const back = O[backSlot];
      const checkdown = back && back.behavior.type === ROUTE ? tickResolver.qbTargetOf(backSlot, back) : null;
      const quick = q.behavior.params['drop'] === 'quickPop';
      // A boot is thrown from outside the tackle on the side he rolls to, not from the pocket: standing in it
      // behind run blocks he was sacked on two plays in three. Design value until the content draws his path.
      const side = q.behavior.params['side'];
      const roll = action === 'boot' && (side === 'left' || side === 'right')
        ? { launchPx: -BOOT_DEPTH_YD, launchPy: (side === 'right' ? O[4]! : O[0]!).preSnap.align.py * BOOT_WIDTH }
        : {};
      return { ...base, underCenter: !def.shotgun, playActionS: quick ? POP_FAKE_S : 0.5, checkdown, eligible, pocket, ...roll };
    }
    default: {
      const back = O[backSlot];
      const checkdown = back && back.behavior.type === ROUTE && !reads.some((r) => r.target.slot === backSlot) ? tickResolver.qbTargetOf(backSlot, back) : null;
      return { ...base, checkdown, eligible, pocket };
    }
  }
}

/** The ball carrier's designed run (J8): aim at the play-side guard's outside leg, or the centre on a draw. */
function carrierOf(def: starter.PlayDef, O: readonly Assignment[], dir: 'left' | 'right' | 'middle'): tickResolver.PlaySetup['carrier'] {
  const slot = O.findIndex((a) => a.behavior.type === 'ballCarrier');
  if (slot < 0) return null;
  const guard = dir === 'left' ? O[1]! : O[3]!;
  const aimPy = dir === 'middle' ? 0 : guard.preSnap.align.py + (dir === 'left' ? 0.5 : -0.5);
  return { designed: { slot, aimPx: 1, aimPy, readSlot: -1, kind: 'zone', conceptId: O[slot]!.conceptId } };
}

/** Yards from the kicking team's own goal line to the ball. */
function ownYard(input: PlayInput): number {
  const g = input.geometry, s = input.situation;
  return s.attackDir === 1 ? s.ballX - g.goalLineWestX : g.goalLineEastX - s.ballX;
}

export interface StarterContentPort extends tickResolver.PlayContentPort {
  /** Which starter play an offensive call ran (for reports and tests). */
  playIdOf(calls: PlayCalls): string | null;
}

/** The content port over the starter content and the provisional kicking units. One per game runner; it caches by object. */
/**
 * J4.3.1 binding for the fixed slot orders of this port: `role:X` and `qb` selectors become slots (offense 0 to
 * 10, defense 11 to 21). Without it they resolve to nobody: a man defender keyed to `role:R` has no man, and a
 * rusher or a zone defender who reads the quarterback has nobody to read. Mirroring is done before this.
 */
const SLOT_OF_ROLE: Readonly<Record<string, number>> = Object.fromEntries([
  ...OFFENSE_ROLES.map((r, i) => [r, i] as const), ...DEFENSE_ROLES.map((r, i) => [r, SLOTS_PER_TEAM + i] as const),
]);
function bound(as: Assignment[]): Assignment[] {
  return lang.bindAssignments({ assignments: as, slotOfRole: SLOT_OF_ROLE, qbSlot: OFFENSE_ROLES.indexOf('Q') }).bound;
}

/** Spoken length of a starter call, in words (I2.4.2). PROVISIONAL: the starter content carries no call sheet wording. */
const CALL_WORDS = 6;

/**
 * K1.5.1 communicators of the fixed slot orders: the centre makes the line's calls and the quarterback the skill
 * players'; the middle linebacker sets the front and the free safety the coverage. PROVISIONAL (Assumption): who
 * wears the green dot and who makes the line calls is a depth-chart choice (I6, G5.5.2) that no caller makes yet.
 */
const unitSlotOf = (roles: readonly string[], side: 0 | 1) => (role: string): number => side * SLOTS_PER_TEAM + roles.indexOf(role);
const oSlot = unitSlotOf(OFFENSE_ROLES, 0), dSlot = unitSlotOf(DEFENSE_ROLES, 1);
const OFFENSE_UNITS: readonly playerAiModule.CommUnit[] = [
  { communicator: oSlot('C'), members: ['LT', 'LG', 'RG', 'RT'].map(oSlot) },
  { communicator: oSlot('Q'), members: ['R', 'X', 'Z', 'Y', 'H'].map(oSlot) },
];
const SCRIMMAGE_UNITS: readonly playerAiModule.CommUnit[] = [
  ...OFFENSE_UNITS,
  { communicator: dSlot('MIKE'), members: ['LDE', 'LDT', 'RDT', 'RDE', 'WILL', 'SAM'].map(dSlot) },
  { communicator: dSlot('FS'), members: ['LCB', 'RCB', 'SS'].map(dSlot) },
];

export interface StarterContentOptions {
  /** Where the game is played (J12.8.1): at side 0's venue (the default) or at a neutral site. */
  readonly site?: environment.Site;
}

export function createStarterContentPort(opts: StarterContentOptions = {}): StarterContentPort {
  const site: environment.Site = opts.site ?? 'home';
  const offense = new Map<string, OffensePlay>();
  const defense = new Map<string, Assignment[]>();
  const units = new Map<string, { O: Assignment[]; D: Assignment[] }>();
  const playByKind = new Map(starter.PLAYS.map((p) => [p.kind as string, p]));
  // Content ids resolve over the full set (WP-25 plus the starter books), so a caller that names a play from a book
  // gets that play; a call without an id still gets the starter play of its kind.
  const playById = new Map(full.FULL_PLAYS.map((p) => [p.id, p]));
  const defenseByFamily = new Map(starter.DEFENSE.map((d) => [d.coverageFamily as string, d]));
  const defenseById = new Map(full.FULL_DEFENSE.map((d) => [d.id, d]));
  const defenseSlotOf = (role: string): number => SLOTS_PER_TEAM + DEFENSE_ROLES.indexOf(role as (typeof DEFENSE_ROLES)[number]);
  // J5.5 the defense's checks and disguise, from the designer call of the coverage family (presnap-calls.ts).
  let keysFor: { O: readonly Assignment[]; qbSlot: number } = { O: [], qbSlot: -1 };
  const presnapCalls = createPresnapCalls((a) => bound([withDropPath(withRally(a))])[0]!, (a) => ({
    readsKeys: true, boxDefender: DEFENSE_ROLES.indexOf(a.role as (typeof DEFENSE_ROLES)[number]) < 7, keys: defenderKeys(a, keysFor.O, keysFor.qbSlot),
    ...(ZONE_EYES.has(a.behavior.type) ? { gaze: 'ball' as const } : {}),
  }));

  // Route tags on the call ("Z post") re-lay that receiver's route from a shape already in the content (route-tags.ts).
  const playDefOf = (calls: PlayCalls): starter.PlayDef | null => {
    const def = basePlayDefOf(calls);
    const c = calls.snapping;
    return def && c.unit === 'offense' && c.tags.some((t) => t.startsWith('route:')) ? full.withRouteTags(def, c.tags) : def;
  };
  const basePlayDefOf = (calls: PlayCalls): starter.PlayDef | null => {
    const c = calls.snapping;
    if (c.unit !== 'offense') return null;
    if (c.playContentId !== null && playById.has(c.playContentId)) return playById.get(c.playContentId)!;
    if (c.kind === 'run' && c.runDirection === 'middle') return playById.get('draw_rb')!;
    const id = PLAY_FOR_KIND[c.kind];
    return (id !== undefined ? playById.get(id) : undefined) ?? playByKind.get(c.kind) ?? null;
  };

  const offenseOf = (def: starter.PlayDef, left: boolean): OffensePlay => {
    const key = `${def.id}|${left ? 'L' : 'R'}`;
    let p = offense.get(key);
    if (p === undefined) {
      const raw = starter.assignmentsOf(def).map(clearOfLine);
      p = { def, O: bound(inOrder(left ? raw.map(mirror) : raw, OFFENSE_ROLES)) };
      offense.set(key, p);
    }
    return p;
  };
  const defenseOf = (family: string, callId: string | null): Assignment[] => {
    const named = callId !== null ? defenseById.get(callId) : undefined;
    const key = named !== undefined ? `id|${named.id}` : family;
    let d = defense.get(key);
    if (d === undefined) {
      const def = named ?? defenseByFamily.get(family) ?? defenseByFamily.get('cover3')!;
      d = bound(inOrder(starter.assignmentsOf(def).map(withRally).map(withDropPath), DEFENSE_ROLES));
      defense.set(key, d);
    }
    return d;
  };

  const returnUnitsOf = (kind: 'punt' | 'field_goal', input: PlayInput): Assignment[] => {
    const px = kind === 'punt' ? puntReturnerPx(input) : 0, key = `ret|${kind}|${px}`;
    let u = units.get(key);
    if (u === undefined) { u = { O: [], D: kind === 'punt' ? puntReturnUnit(px) : kickBlockUnit() }; units.set(key, u); }
    return u.D;
  };
  const kickUnitsOf = (input: PlayInput, kick: KickCall, ret: ReturnCall | null): { O: Assignment[]; D: Assignment[] } => {
    const rules: RuleSet = input.rules, halfWidth = input.geometry.widthYd / 2 - 3;
    const kind = kick.kickKind;
    const free = kind === 'kickoff' || kind === 'onside_kick' || kind === 'safety_kick' || kind === 'fair_catch_kick';
    if (!free) {
      const px = kind === 'punt' ? puntReturnerPx(input) : 0, key = `${kind}|${ret?.returnKind ?? ''}|${px}`;
      let u = units.get(key);
      if (u === undefined) {
        u = kind === 'punt' ? { O: puntUnit(px), D: puntReturnUnit(px) } : { O: placeKickUnit(), D: kickBlockUnit() };
        units.set(key, u);
      }
      return u;
    }
    const own = Math.round(ownYard(input));
    const dynamic = kind === 'kickoff' && rules.opt('kickoff.format') === 'dynamic';
    const hands = kind === 'onside_kick' || ret?.returnKind === 'hands_team';
    const key = `${kind}|${hands}|${dynamic}|${own}|${halfWidth}`;
    let u = units.get(key);
    if (u === undefined) {
      const toGoal = 100 - own;
      if (dynamic) {
        // B6 dynamic kickoff: coverage on the receiving team's line, the receivers in the set-up zone, returners in the landing zone.
        const coverPx = toGoal - rules.num('kickoff.kicking_team_line_yardline');
        const frontPx = toGoal - rules.num('kickoff.receiving_line_yardline') + 1;
        const secondPx = toGoal - rules.num('kickoff.setup_zone_back_yardline') - 1;
        const deepPx = Math.max(secondPx + 10, toGoal - 3);
        u = { O: freeKickUnit(coverPx, halfWidth), D: receivingUnit(frontPx, secondPx, deepPx, halfWidth, false) };
      } else {
        const deepPx = Math.max(25, toGoal - 3);
        u = { O: freeKickUnit(-1, halfWidth), D: hands ? receivingUnit(11, 20, 30, halfWidth, true) : receivingUnit(12, Math.min(28, deepPx - 15), deepPx, halfWidth, false) };
      }
      units.set(key, u);
    }
    return u;
  };

  return {
    playIdOf: (calls) => playDefOf(calls)?.id ?? null,
    setup(input: PlayInput): PlaySetup | null {
      const { calls, situation: sit } = input;
      const s = calls.snapping, o = calls.opposing;
      let O: Assignment[], D: Assignment[];
      let qb: QbPlay | null = null, carrier: PlaySetup['carrier'] = null, shotgun = false;
      let phase: 'pass_play' | 'running_play' | 'scrimmage_kick' = 'pass_play';
      let manMatch: Record<number, number> = {}, coverage: 'man' | 'zone' = 'zone';
      if (s.unit === 'offense') {
        const def = playDefOf(calls);
        if (def === null) return null;
        const left = def.runDirection !== null && def.runDirection !== 'middle' && s.runDirection === 'left';
        const p = offenseOf(def, left);
        O = p.O; shotgun = def.shotgun;
        const runDir = def.runDirection === null ? 'middle' : def.runDirection === 'middle' ? 'middle' : left ? 'left' : 'right';
        qb = qbPlayOf(def, O, defenseSlotOf);
        const ran = def.kind === 'run' || def.kind === 'draw' || def.kind === 'qb_run' || def.kind === 'rpo' || def.kind === 'kneel';
        phase = ran ? 'running_play' : 'pass_play';
        if (ran) carrier = carrierOf(def, O, runDir);
        if (o.unit !== 'defense') {
          // The other side read the down as a kick (the chart predicts the kick from its side) and sent its
          // return or block unit out against an offensive play: those eleven play the snap as they stand.
          D = o.returnKind === 'punt_return' || o.returnKind === 'punt_block' ? returnUnitsOf('punt', input) : returnUnitsOf('field_goal', input);
        } else D = defenseOf(o.coverageFamily, o.callContentId);
        if (o.unit === 'defense' && MAN_FAMILIES.has(o.coverageFamily)) {
          coverage = 'man';
          D.forEach((a, i) => {
            const m = a.behavior.params['man'];
            if (typeof m === 'string' && m.startsWith('role:')) { const t = O.findIndex((x) => x.role === m.slice(5)); if (t >= 0) manMatch[t] = i; }
          });
        }
      } else {
        // A defensive call against a kick (the defense expected the offense to go for it) lines up as the
        // kick's own return or block unit: the same men, in the alignment the kick asks of them.
        const u = kickUnitsOf(input, s, o.unit === 'return' ? o : null);
        O = u.O; D = u.D; phase = 'scrimmage_kick';
        if (o.unit === 'return') carrier = { returnPlan: { side: 'middle', fairCatchAllowed: true, ...(s.kickKind === 'punt' ? { letGoInsideYd: PUNT_LET_GO_INSIDE_YD } : {}) } };
      }
      const qbSlot = qb === null ? -1 : qb.qbSlot;
      keysFor = { O, qbSlot };
      const defCalls = s.unit === 'offense' && o.unit === 'defense' ? presnapCalls.of(o.callContentId ?? o.coverageFamily, o.coverageFamily, D, O, qbSlot, input.rules) : null;
      const tempo = s.unit === 'offense' ? s.tempo : 'huddle';
      const slots: PlaySetup['slots'] = Array.from({ length: SLOT_COUNT }, (_, w) => ({ conceptId: (w < SLOTS_PER_TEAM ? O[w]! : D[w - SLOTS_PER_TEAM]!).conceptId }));
      // Eyes (J3.4.1): a zone defender plays with his on the ball, a man defender with his on his man (his first key):
      // with his eyes on his hips he lost the man the moment he turned to run with him. Receivers turn to look when the ball is thrown
      // (the quarterback plug does that), not before: looking back all route long costs them speed.
      const perception: PlaySetup['perception'] = Array.from({ length: SLOT_COUNT }, (_, w) => {
        if (s.unit !== 'offense') return {};
        if (w < SLOTS_PER_TEAM) return {};
        const a = D[w - SLOTS_PER_TEAM]!;
        return { readsKeys: true, boxDefender: w < SLOTS_PER_TEAM + 7, keys: defenderKeys(a, O, qbSlot), ...(ZONE_EYES.has(a.behavior.type) ? { gaze: 'ball' as const } : a.behavior.type === 'manCover' ? { gaze: 'key' as const } : {}) };
      });
      // The crowd on this play (J12.6.1, J12.8.1): noise each unit hears, the J5.7.1 venue, the road silent count,
      // the D9.4.1 noise factor and the residual familiarity term, all from the snapshot and the scoreboard.
      const crowd = environment.crowdForPlay(input.environment, { offense: sit.offense, down: sit.down, score: sit.score }, site, input.rules, input.params);
      const P = (name: string): number => input.params.num(name);
      // I2.1.1 stages 1 to 3 for a play called from the sideline: spotting, the caller's decision, and the relay by
      // helmet radio into a huddle (2 s plus the spoken call) or by signal without one (I2.4.1). They run on the play
      // clock before the huddle, and noise garbles the relay. A hurry-up call is made at the line, and a kneel or a
      // spike needs no call from the sideline; a kicking unit's time on is its own (I4.1.1).
      const scrimmage = s.unit === 'offense' && sit.down !== null;
      const called = scrimmage && tempo !== 'hurry_up' && s.kind !== 'kneel' && s.kind !== 'spike';
      const relay = !called ? null : {
        spottingS: P('presnap.relay.spottingS'), decisionS: P('presnap.relay.decisionS'),
        methodS: tempo === 'huddle' ? P('presnap.relay.radioS') : P('presnap.relay.signalS'),
        spokenS: tempo === 'huddle' ? CALL_WORDS * P('presnap.relay.perWordS') : 0,
      };
      // D9.4.1: what a player with no install record knows of his assignment (a placeholder roster holds none).
      const knowledge = P('environment.gate.knowledge');
      return {
        presnap: {
          tempo, playClockStartTenths: input.rules.num('clock.play_clock_s') * 10, relay, callWords: CALL_WORDS, hardCount: false, silentCount: s.unit === 'offense' && crowd.silentCount, longCount: false,
          snapsOnSameCount: 0, shotgun, venue: crowd.venue, snapFoulPhase: phase,
          offense: { assignments: O, substituted: [], callLateS: 0, packageReadiness: 70, signalCaller: qbSlot >= 0 ? qbSlot : 0, noise: crowd.unitNoise[0], familiarityZ: crowd.familiarityZ[0], shift: null, motion: null, audibles: [], canRedirect: true, prepared: 0.5 },
          defense: { assignments: D, substituted: [], callLateS: 0, packageReadiness: 70, signalCaller: s.unit === 'offense' ? 4 : 0, noise: crowd.unitNoise[1], familiarityZ: crowd.familiarityZ[1], coverage, manMatch, bluff: false, checks: defCalls?.checks ?? [], disguise: defCalls?.disguise ?? [], simulatedPressure: false, aggressiveGetOff: false },
        },
        slots,
        context: {
          ...(qbSlot >= 0 ? { qbSlot } : {}), tempo: tempo === 'huddle' ? 0 : tempo === 'no_huddle' ? 0.5 : 1, secondHalf: sit.period > 2,
          noise: crowd.unitNoise, noiseFactor: crowd.noiseFactor, familiarityZ: crowd.familiarityZ,
          knowledgeDefault: [knowledge, knowledge],
          // D4.3.1 pressure of the moment, from the scoreboard, the clock, the down and the crowd.
          pressure: environment.pressureOfMoment({ period: sit.period, clockTenths: sit.clockTenths, down: sit.down, goalToGo: sit.goalToGo, score: sit.score }, crowd.noise, input.rules, input.params),
          // K1.5.1: the players who make a unit's calls. Kicking units carry none here.
          ...(scrimmage && o.unit === 'defense' ? { units: SCRIMMAGE_UNITS } : scrimmage ? { units: OFFENSE_UNITS } : {}),
        },
        perception, qb, carrier,
      };
    },
  };
}
