// Binding (J4.3.1): turning a play's role-level assignments into this snap's assignments. Roles
// become slots, the play is mirrored when it is called to the other side, and landmark names
// become lateral positions on this field. The defense's check tables (J4.3.1 rule 3) are content
// and are applied by the play-call layer before binding; this file does the mechanical part.
import type { Action, Assignment, Condition, ValidationFinding } from '@gm/schema';
import { parseReceiver } from './runtime.ts';
import { ACTION_DEFS, CONDITION_DEFS, type ArgSpec } from './vocabulary.ts';

type Value = string | number | boolean;

export interface BindInput {
  readonly assignments: readonly Assignment[];
  /** Slot of each role on the field, both teams (0 to 10 offense, 11 to 21 defense). */
  readonly slotOfRole: Readonly<Record<string, number>>;
  /** The quarterback's slot, so the `qb` selector resolves. */
  readonly qbSlot?: number | null;
  /** True when the play is flipped: left and right swap, lateral positions change sign. */
  readonly mirror?: boolean;
  /** Lateral play-frame position of a landmark on this field for this ball spot (J1.1.3), or null when unknown. */
  readonly landmarkPy?: ((name: string) => number | null) | null;
  /** Roles on the field that must have an assignment. */
  readonly roles?: readonly string[];
  /** The position's default assignment for a role the play forgot (J4.1.1 edge case). */
  readonly fallback?: ((role: string) => Assignment | null) | null;
}

export interface BindResult { readonly bound: Assignment[]; readonly findings: ValidationFinding[] }

const SWAP: Readonly<Record<string, string>> = { left: 'right', right: 'left' };

export function bindAssignments(input: BindInput): BindResult {
  const findings: ValidationFinding[] = [];
  const mirror = input.mirror === true, qbSlot = input.qbSlot ?? null, landmarkPy = input.landmarkPy ?? null;
  const flipY = (y: number): number => (mirror && y !== 0 ? -y : y);

  const bindOne = (a: Assignment): Assignment => {
    const selector = (text: string): string => {
      if (text === 'qb') return qbSlot === null ? text : `slot:${qbSlot}`;
      if (text.startsWith('role:')) {
        const slot = input.slotOfRole[text.slice(5)];
        if (slot === undefined) { findings.push({ severity: 'warning', code: 'bind.unknown_role', ruleKey: null, role: a.role, messageKey: 'lang.bind.unknown_role' }); return text; }
        return `slot:${slot}`;
      }
      if (!mirror) return text;
      const r = parseReceiver(text);
      if (r === null || SWAP[r.side] === undefined) return text;
      return `${r.final ? 'final' : ''}#${r.n}:${SWAP[r.side]}`;
    };
    const args = (specs: Readonly<Record<string, ArgSpec>> | undefined, given: Readonly<Record<string, Value>>): Record<string, Value> => {
      const out: Record<string, Value> = { ...given };
      if (specs === undefined) return out;
      const relative = given['relative'] === true;
      for (const [key, spec] of Object.entries(specs)) {
        const v = out[key];
        if (v === undefined) continue;
        if (spec.type === 'entity' && typeof v === 'string') out[key] = selector(v);
        else if (mirror && spec.type === 'enum' && typeof v === 'string' && SWAP[v] !== undefined && (spec.options ?? []).includes(SWAP[v])) out[key] = SWAP[v];
        else if (key === 'py' && typeof v === 'number') out[key] = flipY(v);
      }
      // A named landmark replaces the lateral value (J1.1.3), unless the point is relative to the player.
      const name = out['landmark'];
      if (!relative && landmarkPy !== null && typeof name === 'string' && name !== '' && specs['py'] !== undefined) {
        const y = landmarkPy(name);
        if (y !== null) out['py'] = y;
      }
      return out;
    };
    const condition = (c: Condition): Condition => {
      if (c.op === 'not') return { op: 'not', of: condition(c.of) };
      if (c.op !== 'test') return { op: c.op, of: c.of.map(condition) };
      return { op: 'test', name: c.name, args: args(CONDITION_DEFS.get(c.name)?.args, c.args) };
    };
    const action = (x: Action): Action => ({ name: x.name, args: args(ACTION_DEFS.get(x.name)?.args, x.args) });
    const point = (p: Assignment['behavior']['path'][number]): Assignment['behavior']['path'][number] => {
      let py = flipY(p.py);
      if (p.landmark !== null && landmarkPy !== null) { const y = landmarkPy(p.landmark); if (y !== null) py = y; }
      return { px: p.px, py, kind: p.kind, landmark: p.landmark };
    };
    const params: Record<string, Value> = { ...a.behavior.params };
    if (typeof params['man'] === 'string') params['man'] = selector(params['man']);
    // Conditions and actions that speak of "the quarterback" read this parameter (qbEyes, rush, spy).
    if (qbSlot !== null) params['qb'] = `slot:${qbSlot}`;
    if (mirror) {
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === 'string' && SWAP[v] !== undefined) params[k] = SWAP[v];
        else if (typeof v === 'number' && k.endsWith('Py')) params[k] = flipY(v);
      }
    }
    return {
      role: a.role,
      behavior: { type: a.behavior.type, params, path: a.behavior.path.map(point) },
      preSnap: {
        align: { px: a.preSnap.align.px, py: flipY(a.preSnap.align.py), rule: a.preSnap.align.rule },
        onLine: a.preSnap.onLine, stance: a.preSnap.stance, motion: a.preSnap.motion.map(point),
      },
      rules: a.rules.map((r) => ({ when: condition(r.when), guard: r.guard === null ? null : condition(r.guard), then: r.then.map(action), text: r.text })),
      keys: a.keys.map(selector),
      gaze: a.gaze,
      technique: { ...a.technique },
      conceptId: a.conceptId,
      teachingLoad: a.teachingLoad,
      calls: [...a.calls],
    };
  };

  const bound = input.assignments.map(bindOne);
  const have = new Set(input.assignments.map((a) => a.role));
  for (const role of input.roles ?? []) {
    if (have.has(role)) continue;
    // A role the play gives no job: a content warning, and the position's default behavior when the caller has one.
    findings.push({ severity: 'warning', code: 'bind.role_without_assignment', ruleKey: null, role, messageKey: 'lang.bind.role_without_assignment' });
    const fallback = input.fallback?.(role) ?? null;
    if (fallback !== null) bound.push(bindOne(fallback));
  }
  return { bound, findings };
}
