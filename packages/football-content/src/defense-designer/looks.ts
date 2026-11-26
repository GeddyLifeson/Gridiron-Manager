// The formation switcher set (O3.2.1: "2 by 2, 3 by 1, bunch, empty, heavy sets, and motion across") built
// from the starter formations (WP-15) plus the looks G2.2.2 and G2.5.1 name (tight end and wing, unbalanced
// line, heavy package). Splits and depths are DESIGN VALUES (Assumption), as in starter/formations.ts:
// sources agree on where coaches align but give no exact yardage.
import { FORMATIONS } from '../starter/formations.ts';
import type { OffLook, OffMotion, OffPlayer } from './types.ts';

const OL = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
const P = (role: string, px: number, py: number, onLine: boolean): OffPlayer => ({ role, px, py, onLine, eligible: !OL.has(role) && role !== 'Q' });
const LINE: OffPlayer[] = [P('LT', 0, -2, true), P('LG', 0, -1, true), P('C', 0, 0, true), P('RG', 0, 1, true), P('RT', 0, 2, true)];
const look = (id: string, name: string, personnel: string, players: OffPlayer[], motion: OffMotion | null = null): OffLook => ({ id, name, personnel, players, motion });

const fromStarter: OffLook[] = FORMATIONS.map((f) => look(f.id, f.name, f.personnel, f.players.map((p) => P(p.role, p.px, p.py, p.onLine))));

export const LOOKS: readonly OffLook[] = [
  ...fromStarter,
  look('gun_bunch_right_11', 'Gun Bunch Right, 11 personnel', '11', [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, -2.2, false), P('X', 0, -17, true), P('Y', 0, 9, true), P('H', -1.5, 10.5, false), P('Z', -1, 12, false)]),
  look('gun_empty_3x2_10', 'Gun Empty (3x2), 10 personnel', '10', [...LINE, P('Q', -5, 0, false), P('X', 0, -17, true), P('H', -1, -9, false), P('Z', 0, 17, true), P('Y', -1, 11, false), P('R', -1, 6, false)]),
  look('gun_stack_left_11', 'Gun Doubles, stack left, 11 personnel', '11', [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, 2.2, false), P('X', 0, -12, true), P('H', -2, -12.5, false), P('Y', 0, 3, true), P('Z', -1, 16, false)]),
  look('uc_te_wing_12', 'Singleback, tight end and wing right, 12 personnel', '12', [...LINE, P('Q', -0.6, 0, false), P('R', -6, 0, false), P('X', 0, -17, true), P('Y', 0, 3, true), P('H', -1, 4.2, false), P('Z', -1, 14, false)]),
  look('uc_heavy_13', 'Heavy, three tight ends, 13 personnel', '13', [...LINE, P('Q', -0.6, 0, false), P('R', -6, 0, false), P('Y', 0, 3, true), P('H', 0, -3, true), P('F', -1, 4.2, false), P('X', 0, -15, true)]),
  look('uc_i_22', 'I-formation, two tight ends, 22 personnel', '22', [...LINE, P('Q', -0.6, 0, false), P('F', -4, 0, false), P('R', -7, 0, false), P('Y', 0, 3, true), P('H', 0, -3, true), P('X', 0, -16, true)]),
  look('uc_unbalanced_right_12', 'Unbalanced right (tackle over), 12 personnel', '12', [
    P('LT', 0, 3, true), P('LG', 0, -1, true), P('C', 0, 0, true), P('RG', 0, 1, true), P('RT', 0, 2, true), P('Y', 0, -2, true),
    P('Q', -0.6, 0, false), P('R', -6, 0, false), P('H', 0, 4, true), P('X', -1, -16, false), P('Z', -1, 15, false)]),
  look('gun_2x2_jet_left_11', 'Gun Doubles, jet motion across to the left, 11 personnel', '11',
    [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, 2.2, false), P('X', 0, -17, true), P('H', -1, -7.5, false), P('Y', -1, 7.5, false), P('Z', 0, 17, true)],
    { role: 'Z', toPy: -11, kind: 'jet', timeS: 1.5 }),
  look('gun_2x2_motion_trips_11', 'Gun Doubles, slot motion to trips right, 11 personnel', '11',
    [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, 2.2, false), P('X', 0, -17, true), P('H', -1, -7.5, false), P('Y', -1, 7.5, false), P('Z', 0, 17, true)],
    { role: 'H', toPy: 11, kind: 'normal', timeS: 2.5 }),
];

export const LOOK_BY_ID: ReadonlyMap<string, OffLook> = new Map(LOOKS.map((l) => [l.id, l]));

/** The look after its motion: the moving player at his end spot. */
export function afterMotion(l: OffLook): OffLook {
  if (l.motion === null) return l;
  const m = l.motion;
  return { ...l, id: `${l.id}@set`, motion: null, players: l.players.map((p) => (p.role === m.role ? { ...p, py: m.toPy, onLine: false } : p)) };
}
