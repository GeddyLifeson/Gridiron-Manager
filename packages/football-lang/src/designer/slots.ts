// Role slots for a personnel group (G1.1.2). The letters are naming defaults the user can rename.
import type { DesignSlot, SlotAssignment } from './types.ts';

export const LINE_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
const BACKS = ['R', 'F', 'H'];
const TIGHT_ENDS = ['Y', 'U', 'F'];
const RECEIVERS = ['X', 'Z', 'H', 'Y', 'F', 'W'];

export interface PersonnelSplit { readonly backs: number; readonly tightEnds: number; readonly receivers: number }

/** "11" = 1 back, 1 tight end, receivers fill the rest of the five skill slots (G1.1.1). Null for a code that cannot be met. */
export function splitPersonnel(code: string): PersonnelSplit | null {
  if (!/^\d\d$/.test(code)) return null;
  const backs = Number(code[0]), tightEnds = Number(code[1]);
  const receivers = 5 - backs - tightEnds;
  return receivers < 0 ? null : { backs, tightEnds, receivers };
}

/** The eleven slot ids the group defines: Q, five line slots, five skill slots (G1.1.2 acceptance). */
export function slotsForPersonnel(code: string): string[] | null {
  const s = splitPersonnel(code);
  if (!s) return null;
  const used = new Set<string>(['Q', ...LINE_SLOTS]);
  const take = (pool: readonly string[]): string => {
    for (const l of pool) if (!used.has(l)) { used.add(l); return l; }
    let n = 2;
    while (used.has(`${pool[0]}${n}`)) n++;
    used.add(`${pool[0]}${n}`);
    return `${pool[0]}${n}`;
  };
  const skill: string[] = [];
  for (let i = 0; i < s.backs; i++) skill.push(take(BACKS));
  for (let i = 0; i < s.tightEnds; i++) skill.push(take(TIGHT_ENDS));
  for (let i = 0; i < s.receivers; i++) skill.push(take(RECEIVERS));
  return ['Q', ...LINE_SLOTS, ...skill];
}

export function isLineSlot(role: string): boolean { return (LINE_SLOTS as readonly string[]).includes(role); }

export const EMPTY_ASSIGNMENT: SlotAssignment = {
  behavior: 'stand', params: {}, path: [], rules: [], keys: [], gaze: 'default', technique: {}, concept: '', load: 0, calls: [],
};

/** A neutral starting spot so a fresh draft is a legal under-center set; the user then draws. */
export function defaultSlot(role: string, index: number): DesignSlot {
  const line: Record<string, number> = { LT: -4, LG: -2, C: 0, RG: 2, RT: 4 };
  const base = { role, letter: role, stance: 'two_point', reportsEligible: false, extraTackle: false, assignment: EMPTY_ASSIGNMENT };
  if (role in line) return { ...base, at: [0, line[role]!], onLine: true, stance: 'three_point' };
  if (role === 'Q') return { ...base, at: [-1, 0], onLine: false };
  // Skill slots: two on the line at the ends, the rest behind (a starting picture, not a formation).
  const spots: readonly [number, number, boolean][] = [[0, -12, true], [-1, 12, false], [0, 6, true], [-5, 0, false], [-1, -8, false]];
  const [d, l, on] = spots[index % spots.length]!;
  return { ...base, at: [d, l], onLine: on };
}
