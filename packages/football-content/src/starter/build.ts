// Builders for authored slots (data only) and the loader that turns a slot into the contract's Assignment.
import type { Action, Assignment, Condition, WhenClause } from '@gm/schema';
import type { Arg, Clause, Pt, Slot } from './types.ts';

export const test = (name: string, args: Record<string, Arg> = {}): Condition => ({ op: 'test', name, args });
export const all = (...of: Condition[]): Condition => ({ op: 'all', of });
export const not = (of: Condition): Condition => ({ op: 'not', of });
export const act = (name: string, args: Record<string, Arg> = {}): Action => ({ name, args });
export const clause = (text: string, when: Condition, then: Action[], guard?: Condition): Clause => (guard === undefined ? { when, then, text } : { when, guard, then, text });

export const through = (px: number, py: number, landmark?: string): Pt => (landmark === undefined ? { px, py } : { px, py, landmark });
export const cut = (px: number, py: number, landmark?: string): Pt => (landmark === undefined ? { px, py, kind: 'cut' } : { px, py, kind: 'cut', landmark });
export const settle = (px: number, py: number): Pt => ({ px, py, kind: 'settle' });

/** Authored lateral is right-positive; the play frame is left-positive. No negative zero. */
const flip = (py: number): number => (py === 0 ? 0 : -py);
const point = (p: Pt): Assignment['behavior']['path'][number] => ({ px: p.px, py: flip(p.py), kind: p.kind ?? 'through', landmark: p.landmark ?? null });
const when = (c: Clause): WhenClause => ({ when: c.when, guard: c.guard ?? null, then: [...c.then], text: c.text });

export function toAssignment(s: Slot): Assignment {
  return {
    role: s.role,
    behavior: { type: s.behavior, params: { ...(s.params ?? {}) }, path: (s.path ?? []).map(point) },
    preSnap: {
      align: { px: s.at[0], py: flip(s.at[1]), rule: s.rule ?? null },
      onLine: s.onLine ?? false,
      stance: s.stance ?? '',
      motion: (s.motion ?? []).map(point),
    },
    rules: (s.rules ?? []).map(when),
    keys: [...(s.keys ?? [])],
    gaze: s.gaze ?? '',
    technique: { ...(s.technique ?? {}) },
    conceptId: s.concept,
    teachingLoad: s.load ?? 1,
    calls: [...(s.calls ?? [])],
  };
}

/** Jersey numbers the legality checks need for each offensive role (B2.3.1 bands; fixtures, not rule data). */
export const JERSEYS: Readonly<Record<string, number>> = {
  Q: 12, LT: 72, LG: 66, C: 62, RG: 64, RT: 76, X: 11, Z: 14, Y: 85, H: 83, F: 44, R: 26,
};
