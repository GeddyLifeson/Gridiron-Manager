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

/** Starting spots by default letter (drawn axes): a picture to draw from, not a formation from F2. */
const START: Readonly<Record<string, readonly [number, number, boolean]>> = {
  X: [0, -12, true], Y: [0, 6, true], Z: [-1, 12, false], H: [-1, -8, false], R: [-5, 0, false], F: [-3, 0, false], U: [-1, 7, false], W: [-1, -15, false],
};

/** One slot at its starting spot. */
export function defaultSlot(role: string, index: number): DesignSlot {
  const line: Record<string, number> = { LT: -4, LG: -2, C: 0, RG: 2, RT: 4 };
  const base = { role, letter: role, stance: 'two_point', reportsEligible: false, extraTackle: false, assignment: EMPTY_ASSIGNMENT };
  if (role in line) return { ...base, at: [0, line[role]!], onLine: true, stance: 'three_point' };
  if (role === 'Q') return { ...base, at: [-1, 0], onLine: false };
  const [d, l, on] = START[role] ?? [-2, -6 - index, false];
  return { ...base, at: [d, l], onLine: on };
}

/**
 * The group's eleven slots in a legal starting picture: seven on the line with an eligible slot at
 * each end (G1.5.1). When the letters leave a side with no skill slot on the line, the widest
 * off-line skill slot steps up on that side (moved across when no slot stands there).
 */
export function startingSlots(roles: readonly string[]): DesignSlot[] {
  const slots = roles.map((r, i) => defaultSlot(r, i));
  const skill = (s: DesignSlot) => s.role !== 'Q' && !isLineSlot(s.role);
  for (const sign of [-1, 1]) {
    if (slots.some((s) => skill(s) && s.onLine && Math.sign(s.at[1]) === sign)) continue;
    const off = slots.filter((s) => skill(s) && !s.onLine).sort((a, b) => sign * (b.at[1] - a.at[1]));
    const c = off[0];
    if (!c) continue;
    const lat = Math.sign(c.at[1]) === sign && Math.abs(c.at[1]) > 4 ? c.at[1] : sign * 8;
    slots[slots.indexOf(c)] = { ...c, at: [0, lat], onLine: true };
  }
  return slots;
}
