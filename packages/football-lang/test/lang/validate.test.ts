// Static validation (J4.6.1): thirty deliberately broken plays each produce the expected error or
// warning; a condition that names true state is refused (J3.1.1, J4.1.2); an illegal formation is a
// warning and every assignment in it still compiles (B4.6.1: flagged "illegal as drawn", never blocked).
import { describe, expect, it } from 'vitest';
import type { Assignment, FieldGeometry, ValidationFinding } from '@gm/schema';
import { createFootballLang, designBounds, validateAssignment, validateAssignments } from '../../src/lang/index.ts';
import { BANDS, FREE, base } from '../legality/fixtures.ts';
import { ALWAYS, act, assignment, test, when } from './world.ts';

const lang = createFootballLang();
const codes = (f: ValidationFinding[]) => f.map((x) => `${x.severity}:${x.code}`);
const pt = (px: number, py: number) => ({ px, py, kind: 'through' as const, landmark: null });
// FIXTURE field: round numbers for the test, not rule data.
const FIELD: FieldGeometry = { lengthYd: 120, widthYd: 50, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 20, hashNorthY: 30, centreY: 25, uprightSouthY: 22, uprightNorthY: 28, crossbarHeightYd: 3 };
const bounded = createFootballLang({ pathBounds: designBounds(FIELD) });

/** Eleven valid assignments, lined up as the legality fixtures' base formation. */
function side(): Assignment[] {
  return base().map((p) => assignment({ role: p.role, behavior: { type: p.onLine ? 'runBlock' : 'route', params: {}, path: [pt(p.px + 5, p.py)] }, preSnap: { align: { px: p.px, py: p.py, rule: null }, onLine: p.onLine } }));
}
const jerseys = Object.fromEntries(base().map((p) => [p.role, p.jersey]));
const withRule = (cond: Parameters<typeof when>[0], action = act('stop')) => assignment({ rules: [when(cond, [action])] });

describe('a valid play', () => {
  it('has no findings and compiles', () => {
    const a = assignment({ rules: [when(test('ballThrown'), [act('breakOnBall')], null, 'when ball thrown, break on it')], keys: ['#2', 'qb'], technique: { coverage: 'sky' }, calls: ['seam'] });
    const r = lang.compile(a);
    expect(r.findings).toEqual([]);
    expect(r.compiled).not.toBeNull();
    expect(r.compiled!.role).toBe('X');
    expect(validateAssignments(side())).toEqual([]);
  });
});

describe('true state is refused (J3.1.1, J4.1.2 acceptance)', () => {
  const refused: [string, Assignment][] = [
    ['a condition named for true position', withRule(test('truePosition', { target: 'man' }))],
    ['a condition reading the world arrays', withRule(test('simArrays.posX', {}))],
    ['a selector for the actual carrier', withRule(test('cushion', { target: 'actualCarrier', lt: 3 }))],
    ['a selector reaching into truth', withRule(test('unknown', { target: 'truth:5' }))],
    ['an argument asking for a hidden attribute', withRule(test('cushion', { target: 'man', lt: 3, attribute: 'speed' }))],
    ['an action aimed at a true-state selector', withRule(ALWAYS, act('trail', { target: 'world.ball' }))],
    ['a key that names true state', assignment({ keys: ['true_qb'] })],
    ['a gaze rule on true state', assignment({ gaze: 'actualBall' })],
    ['a behavior parameter named for true state', assignment({ behavior: { type: 'route', params: { fatigueNow: 1 }, path: [] } })],
    ['a nested condition that names true state', withRule({ op: 'all', of: [test('ballThrown'), { op: 'not', of: test('hasBall', {}) }] })],
  ];
  it.each(refused)('%s is an error and does not compile', (_name, a) => {
    const r = lang.compile(a);
    expect(r.compiled).toBeNull();
    expect(codes(r.findings)).toContain('error:perception.true_state');
  });
});

describe('thirty deliberately broken plays (J4.6.1 acceptance)', () => {
  const eleven = side();
  const formation = (change: (players: Assignment[]) => Assignment[]) => change(side());
  const broken: [string, string, () => ValidationFinding[]][] = [
    ['a role with no behavior', 'error:assignment.no_behavior', () => validateAssignment(assignment({ behavior: { type: '', params: {}, path: [] } }))],
    ['a role with behavior none', 'error:assignment.no_behavior', () => validateAssignment(assignment({ behavior: { type: 'none', params: {}, path: [] } }))],
    ['an unknown behavior', 'error:vocabulary.unknown_behavior', () => validateAssignment(assignment({ behavior: { type: 'wander', params: {}, path: [] } }))],
    ['an unknown condition', 'error:vocabulary.unknown_condition', () => validateAssignment(withRule(test('feelsLikeRain')))],
    ['an unknown action', 'error:vocabulary.unknown_action', () => validateAssignment(withRule(ALWAYS, act('teleport')))],
    ['an unknown argument', 'error:vocabulary.unknown_arg', () => validateAssignment(withRule(test('ballThrown', { hard: true })))],
    ['a missing argument', 'error:vocabulary.missing_arg', () => validateAssignment(withRule(test('cushion', { target: 'man' })))],
    ['an argument of the wrong type', 'error:vocabulary.arg_type', () => validateAssignment(withRule(test('cushion', { target: 'man', lt: 'five' })))],
    ['a value outside the menu', 'error:vocabulary.arg_value', () => validateAssignment(withRule(test('read', { kind: 'trick' })))],
    ['a number outside its range', 'error:vocabulary.arg_range', () => validateAssignment(withRule(ALWAYS, act('widen', { yd: 400 })))],
    ['a malformed selector', 'error:vocabulary.unknown_selector', () => validateAssignment(withRule(test('cushion', { target: '#9', lt: 3 })))],
    ['a key that is not a selector', 'error:vocabulary.unknown_selector', () => validateAssignment(assignment({ keys: ['the fast one'] }))],
    ['an unknown gaze rule', 'error:vocabulary.unknown_gaze', () => validateAssignment(assignment({ gaze: 'crowd' }))],
    ['an unknown technique slot', 'error:vocabulary.unknown_technique_slot', () => validateAssignment(assignment({ technique: { juke: 'spin' } }))],
    ['a call that is not a name', 'error:vocabulary.bad_name', () => validateAssignment(assignment({ calls: ['go go go!'] }))],
    ['a switch to an unknown behavior', 'error:vocabulary.unknown_behavior', () => validateAssignment(withRule(ALWAYS, act('switchBehavior', { to: 'nap' })))],
    ['an empty all-of condition', 'error:rule.empty_condition', () => validateAssignment(withRule({ op: 'all', of: [] }))],
    ['a rule with no action', 'error:assignment.schema', () => validateAssignment({ ...assignment(), rules: [{ when: ALWAYS, guard: null, then: [], text: '' }] })],
    ['a clause that is executable code, not data', 'error:assignment.schema', () => validateAssignment({ ...assignment(), rules: [{ when: 'world.posX[3] > 5', guard: null, then: [act('stop')], text: '' }] })],
    ['an assignment missing its behavior', 'error:assignment.schema', () => validateAssignment({ role: 'X' })],
    ['a route into the bench', 'error:path.outside_field', () => bounded.compile(assignment({ behavior: { type: 'route', params: {}, path: [pt(10, 45)] } })).findings],
    ['a motion that leaves the field', 'error:path.outside_field', () => bounded.compile(assignment({ preSnap: { motion: [pt(-2, -60)] } })).findings],
    ['a path beyond the end line', 'error:path.outside_field', () => bounded.compile(assignment({ behavior: { type: 'route', params: {}, path: [pt(130, 0)] } })).findings],
    ['a second rule that can never fire', 'warning:rule.unreachable', () => validateAssignment(assignment({ rules: [when(test('ballThrown'), [act('breakOnBall')]), when(test('ballThrown'), [act('stop')])] }))],
    ['two roles with the same label', 'error:assignment.duplicate_role', () => validateAssignments([...eleven.slice(0, 10), eleven[0]!])],
    ['twelve roles', 'warning:assignment.too_many_roles', () => validateAssignments([...eleven, assignment({ role: 'extra' })])],
    ['ten roles', 'warning:assignment.fewer_roles', () => validateAssignments(eleven.slice(0, 10))],
    ['two defenders on the same man', 'warning:assignment.same_man', () => validateAssignments([
      assignment({ role: 'CB1', behavior: { type: 'manCover', params: { man: '#1:left' }, path: [] } }),
      assignment({ role: 'CB2', behavior: { type: 'manCover', params: { man: '#1:left' }, path: [] } }),
    ])],
    ['six men on the line', 'warning:formation.line_min', () => createFootballLang({ rules: BANDS, jerseyOf: (r) => jerseys[r]! })
      .validateAssignments(formation((ps) => ps.map((a) => (a.role === 'Z' || a.role === 'X' ? { ...a, preSnap: { ...a.preSnap, align: { ...a.preSnap.align, px: -2 }, onLine: false } } : a)).slice(0, 11)), { side: 'offense' })],
    ['five men in the backfield', 'warning:formation.backfield_max', () => createFootballLang({ rules: FREE, jerseyOf: (r) => jerseys[r]! })
      .validateAssignments(formation((ps) => ps.map((a) => (a.role === 'X' ? { ...a, preSnap: { ...a.preSnap, align: { ...a.preSnap.align, px: -2 }, onLine: false } } : a))), { side: 'offense' })],
  ];

  it('there are thirty', () => expect(broken.length).toBe(30));
  it.each(broken)('%s gives %s', (_name, expected, run) => {
    expect(codes(run())).toContain(expected);
  });

  it('every error stops compilation and no warning does', () => {
    for (const [name, expected, run] of broken) {
      const findings = run();
      const hasError = findings.some((f) => f.severity === 'error');
      expect(hasError, name).toBe(expected.startsWith('error:'));
    }
    const unreachable = assignment({ rules: [when(test('ballThrown'), [act('breakOnBall')]), when(test('ballThrown'), [act('stop')])] });
    expect(lang.compile(unreachable).compiled).not.toBeNull();
    expect(lang.compile(withRule(test('feelsLikeRain'))).compiled).toBeNull();
  });

  it('every finding carries a message key, and the role it belongs to when there is one', () => {
    for (const [, , run] of broken) for (const f of run()) { expect(f.messageKey).toMatch(/^(lang|legality)\./); expect(f.role === null || typeof f.role === 'string').toBe(true); }
  });
});

describe('an illegal formation is flagged, never blocked (B4.6.1, WP-10 acceptance)', () => {
  it.each([['bands fixture', BANDS], ['free fixture', FREE]] as const)('%s: the findings are warnings, each rests on a rule key, and all eleven assignments still compile', (_n, rules) => {
    const l = createFootballLang({ rules, jerseyOf: (r) => jerseys[r]! });
    // Both ends step off the line and a twelfth man joins: several fouls at once.
    const illegal = [...side().map((a) => (a.role === 'X' || a.role === 'Z' ? { ...a, preSnap: { ...a.preSnap, align: { ...a.preSnap.align, px: -2 }, onLine: false } } : a)),
      assignment({ role: 'extra', behavior: { type: 'route', params: {}, path: [] }, preSnap: { align: { px: -6, py: 3, rule: null }, onLine: false } })];
    const findings = l.validateAssignments(illegal, { side: 'offense' });
    const legality = findings.filter((f) => f.ruleKey !== null);
    expect(legality.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.severity).toBe('warning');
    for (const f of legality) expect(rules.keys()).toContain(f.ruleKey);
    for (const a of illegal) expect(l.compile(a).compiled).not.toBeNull();
    // The contract's own entry point agrees, and a legal formation draws nothing.
    const drawn = illegal.map((a) => ({ role: a.role, px: a.preSnap.align.px, py: a.preSnap.align.py, onLine: a.preSnap.onLine, jersey: jerseys[a.role] ?? 40, inMotion: false }));
    expect(l.checkAlignment(drawn, rules).every((f) => f.severity === 'warning')).toBe(true);
    expect(l.validateAssignments(side(), { side: 'offense' })).toEqual([]);
  });

  it('the defense is not held to offensive formation rules', () => {
    const l = createFootballLang({ rules: BANDS, jerseyOf: () => 55 });
    expect(l.validateAssignments(side(), { side: 'defense' })).toEqual([]);
  });
});
