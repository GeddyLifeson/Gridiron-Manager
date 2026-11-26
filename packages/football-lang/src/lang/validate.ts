// Static validation of assignments (J4.6.1). Errors mean the engine cannot run the play: a role
// with no behavior, unknown vocabulary, a reference to true state (J3.1.1), a path outside the
// field. Warnings mean the play can be saved and called: the wrong number of roles, an illegal
// formation, two defenders on the same man. Nothing is repaired: finding and accepting holes is coaching.
import { Assignment, SLOTS_PER_TEAM, type Condition, type FieldGeometry, type RuleSet, type ValidationFinding } from '@gm/schema';
import type { AlignedPlayer } from '../legality/index.ts';
import type { Args } from './conditions.ts';
import { isSelector } from './runtime.ts';
import { ACTION_DEFS, BEHAVIOR_DEFS, CONDITION_DEFS, VOCABULARY, isBehavior, isName, namesTrueState, type ArgSpec } from './vocabulary.ts';

/** A play-frame box. A waypoint outside it is outside the field. */
export interface PathBounds { readonly minPx: number; readonly maxPx: number; readonly minPy: number; readonly maxPy: number }

export interface ValidateOptions {
  /** When given, paths and motions are checked against it (J4.6.1 "a path outside the field"). */
  readonly pathBounds?: PathBounds | null;
  /** When given, the role count is checked against `substitution.max_players`; otherwise against the engine's slot count. */
  readonly rules?: RuleSet | null;
}

/**
 * The widest box a play-frame point can lie in wherever the ball is spotted: a point outside it is
 * outside the field on every snap. The play designer uses it; a game uses the exact box for the spot.
 */
export function designBounds(field: FieldGeometry): PathBounds {
  const south = field.centreY - field.widthYd / 2, north = field.centreY + field.widthYd / 2;
  const reach = Math.max(field.hashNorthY - south, north - field.hashSouthY);
  return { minPx: -field.lengthYd, maxPx: field.lengthYd, minPy: -reach, maxPy: reach };
}

function make(severity: 'error' | 'warning', code: string, role: string | null, ruleKey: string | null = null): ValidationFinding {
  return { severity, code, ruleKey, role, messageKey: `lang.${code}` };
}

function checkSelector(text: string, role: string, out: ValidationFinding[]): void {
  if (isSelector(text)) return;
  out.push(make('error', namesTrueState(text) ? 'perception.true_state' : 'vocabulary.unknown_selector', role));
}

function checkArgs(specs: Readonly<Record<string, ArgSpec>>, given: Args, role: string, out: ValidationFinding[]): void {
  for (const key of Object.keys(given)) {
    if (specs[key] !== undefined) continue;
    out.push(make('error', namesTrueState(key) ? 'perception.true_state' : 'vocabulary.unknown_arg', role));
  }
  for (const [key, spec] of Object.entries(specs)) {
    const v = given[key];
    if (v === undefined) { if (spec.default === undefined) out.push(make('error', 'vocabulary.missing_arg', role)); continue; }
    switch (spec.type) {
      case 'number':
        if (typeof v !== 'number') out.push(make('error', 'vocabulary.arg_type', role));
        else if ((spec.min !== undefined && v < spec.min) || (spec.max !== undefined && v > spec.max)) out.push(make('error', 'vocabulary.arg_range', role));
        break;
      case 'boolean':
        if (typeof v !== 'boolean') out.push(make('error', 'vocabulary.arg_type', role));
        break;
      case 'enum':
        if (typeof v !== 'string') out.push(make('error', 'vocabulary.arg_type', role));
        else if (!(spec.options ?? []).includes(v)) out.push(make('error', namesTrueState(v) ? 'perception.true_state' : 'vocabulary.arg_value', role));
        break;
      case 'entity':
        if (typeof v !== 'string') out.push(make('error', 'vocabulary.arg_type', role)); else checkSelector(v, role, out);
        break;
      case 'behavior':
        if (typeof v !== 'string' || !isBehavior(v)) out.push(make('error', 'vocabulary.unknown_behavior', role));
        break;
      default:
        if (typeof v !== 'string') out.push(make('error', 'vocabulary.arg_type', role));
        else if (!(v === '' && spec.default === '') && !isName(v)) out.push(make('error', 'vocabulary.bad_name', role));
        break;
    }
  }
}

function checkCondition(cond: Condition, role: string, out: ValidationFinding[]): void {
  if (cond.op === 'not') { checkCondition(cond.of, role, out); return; }
  if (cond.op !== 'test') {
    if (cond.of.length === 0) out.push(make('error', 'rule.empty_condition', role));
    for (const x of cond.of) checkCondition(x, role, out);
    return;
  }
  const def = CONDITION_DEFS.get(cond.name);
  if (def === undefined) {
    // A name that reaches for true state is refused as such (J3.1.1, J4.1.2); any other unknown name is unknown vocabulary.
    out.push(make('error', namesTrueState(cond.name) ? 'perception.true_state' : 'vocabulary.unknown_condition', role));
    return;
  }
  checkArgs(def.args, cond.args, role, out);
}

/** Validates one assignment on its own. `input` may be any value: a wrong shape is one `assignment.schema` error. */
export function validateAssignment(input: unknown, opts: ValidateOptions = {}): ValidationFinding[] {
  const parsed = Assignment.safeParse(input);
  if (!parsed.success) {
    const role = typeof input === 'object' && input !== null && typeof (input as { role?: unknown }).role === 'string' ? (input as { role: string }).role : null;
    return [make('error', 'assignment.schema', role)];
  }
  const a = parsed.data, role = a.role, out: ValidationFinding[] = [];
  if (role === '') out.push(make('error', 'assignment.no_role', null));

  const type = a.behavior.type;
  if (type === '' || type === 'none') out.push(make('error', 'assignment.no_behavior', role));
  else if (!BEHAVIOR_DEFS.has(type) || !isBehavior(type)) out.push(make('error', namesTrueState(type) ? 'perception.true_state' : 'vocabulary.unknown_behavior', role));
  const man = a.behavior.params['man'];
  if (man !== undefined) { if (typeof man === 'string') checkSelector(man, role, out); else out.push(make('error', 'vocabulary.arg_type', role)); }
  for (const key of Object.keys(a.behavior.params)) if (namesTrueState(key)) out.push(make('error', 'perception.true_state', role));

  const bounds = opts.pathBounds ?? null;
  if (bounds !== null) {
    for (const p of [...a.behavior.path, ...a.preSnap.motion]) {
      if (p.px < bounds.minPx || p.px > bounds.maxPx || p.py < bounds.minPy || p.py > bounds.maxPy) { out.push(make('error', 'path.outside_field', role)); break; }
    }
  }
  for (const p of [...a.behavior.path, ...a.preSnap.motion]) if (p.landmark !== null && !isName(p.landmark)) out.push(make('error', 'vocabulary.bad_name', role));

  const seen = new Set<string>();
  for (const r of a.rules) {
    checkCondition(r.when, role, out);
    if (r.guard !== null) checkCondition(r.guard, role, out);
    for (const act of r.then) {
      const def = ACTION_DEFS.get(act.name);
      if (def === undefined) { out.push(make('error', namesTrueState(act.name) ? 'perception.true_state' : 'vocabulary.unknown_action', role)); continue; }
      checkArgs(def.args, act.args, role, out);
    }
    // The same trigger and guard as an earlier clause can never fire: the earlier one always wins (J4.4.1 edge case).
    const key = JSON.stringify([r.when, r.guard]);
    if (seen.has(key)) out.push(make('warning', 'rule.unreachable', role));
    seen.add(key);
  }

  for (const key of a.keys) checkSelector(key, role, out);
  if (a.gaze !== '' && !VOCABULARY.gaze.includes(a.gaze)) out.push(make('error', namesTrueState(a.gaze) ? 'perception.true_state' : 'vocabulary.unknown_gaze', role));
  for (const [slot, name] of Object.entries(a.technique)) {
    if (!VOCABULARY.techniqueSlots.includes(slot)) out.push(make('error', 'vocabulary.unknown_technique_slot', role));
    if (!isName(name)) out.push(make('error', 'vocabulary.bad_name', role));
  }
  for (const call of a.calls) if (!isName(call)) out.push(make('error', 'vocabulary.bad_name', role));
  if (a.preSnap.stance !== '' && !isName(a.preSnap.stance)) out.push(make('error', 'vocabulary.bad_name', role));
  return out;
}

/** Validates one side's assignments together (J4.6.1): each one, then the checks that need all of them. */
export function validateAssignments(assignments: readonly unknown[], opts: ValidateOptions = {}): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const roles = new Set<string>(), men = new Map<string, string>();
  let count = 0;
  for (const input of assignments) {
    out.push(...validateAssignment(input, opts));
    const parsed = Assignment.safeParse(input);
    if (!parsed.success) continue;
    const a = parsed.data;
    count++;
    if (roles.has(a.role)) out.push(make('error', 'assignment.duplicate_role', a.role));
    roles.add(a.role);
    const man = a.behavior.params['man'];
    if (a.behavior.type === 'manCover' && typeof man === 'string') {
      if (men.has(man)) out.push(make('warning', 'assignment.same_man', a.role));
      else men.set(man, a.role);
    }
  }
  const rules = opts.rules ?? null;
  const most = rules === null ? SLOTS_PER_TEAM : rules.num('substitution.max_players');
  // More than the limit draws a too-many-men flag; fewer is legal (J4.6.1). Both are shown, neither is refused.
  if (count > most) out.push(make('warning', 'assignment.too_many_roles', null, 'substitution.max_players'));
  else if (count < most) out.push(make('warning', 'assignment.fewer_roles', null));
  return out;
}

/** The formation a set of assignments draws, in the shape the legality checker reads (B4.6.1). Jerseys come from the roster. */
export function alignmentOf(assignments: readonly Assignment[], jerseyOf: (role: string) => number, reported: (role: string) => boolean = () => false): AlignedPlayer[] {
  return assignments.map((a) => ({
    role: a.role, px: a.preSnap.align.px, py: a.preSnap.align.py, onLine: a.preSnap.onLine, jersey: jerseyOf(a.role), inMotion: false, reported: reported(a.role),
  }));
}
