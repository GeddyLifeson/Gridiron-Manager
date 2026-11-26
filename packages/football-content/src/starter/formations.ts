// Offensive formations of the starter set (F2, G1.2.2). Positions are authored right-positive, play-frame
// depth. Line spacing, skill splits and backfield depths are DESIGN VALUES (Assumption): the sources agree
// that coaches align near the numbers and hash but none gives an exact yardage (research/scheme-sources/
// receiver-technique-and-timing.md section 4.4). Real split values arrive with the rule-set landmarks (J1.1.3).
import type { Basis, FormationDef, FormationPlayer } from './types.ts';

const P = (role: string, px: number, py: number, onLine: boolean): FormationPlayer => ({ role, px, py, onLine });
/** Five linemen, one yard apart, as a design value. */
const LINE: FormationPlayer[] = [P('LT', 0, -2, true), P('LG', 0, -1, true), P('C', 0, 0, true), P('RG', 0, 1, true), P('RT', 0, 2, true)];

const PERSONNEL: Basis = { claim: 'Personnel code is backs then tight ends; receivers are the remainder of five', status: 'Verified', sources: ['frenz-personnel', 'kozora-personnel', 'rollins-personnel'] };
const SPLITS: Basis = { claim: 'Exact splits and depths are design values; coaches align receivers at or near the numbers and slots just outside the hashes', status: 'Assumption', sources: [] };
const NEAR_NUMBERS: Basis = { claim: 'Outside receivers align up the numbers (about 4 to 5 yd from the sideline) in Air Raid style; slots just outside the hashes', status: '2 of 3', sources: ['brown-gonzalez', 'drinkall', 'lieberman'] };
const ROLES: Basis = { claim: 'X is the split end on the line, Z the flanker off the line, Y the tight end', status: 'Verified', sources: ['haddad-lettering', 'jones-lettering', 'kelly-lettering'] };

export const FORMATIONS: readonly FormationDef[] = [
  {
    id: 'gun_2x2_11', name: 'Gun Doubles (2x2), 11 personnel', personnel: '11', shotgun: true, structure: '2x2',
    players: [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, 2.2, false), P('X', 0, -17, true), P('H', -1, -7.5, false), P('Y', -1, 7.5, false), P('Z', 0, 17, true)],
    basis: [PERSONNEL, SPLITS, NEAR_NUMBERS],
  },
  {
    id: 'gun_trips_right_11', name: 'Gun Trips Right, 11 personnel', personnel: '11', shotgun: true, structure: '3x1',
    players: [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, -2.2, false), P('X', 0, -17, true), P('Z', 0, 17, true), P('H', -1, 11, false), P('Y', -1, 6.5, false)],
    basis: [PERSONNEL, SPLITS, NEAR_NUMBERS],
  },
  {
    id: 'uc_singleback_11', name: 'Singleback Doubles, 11 personnel, under center', personnel: '11', shotgun: false, structure: '2x2 with a tight end',
    players: [...LINE, P('Q', -0.6, 0, false), P('R', -6, 0, false), P('X', 0, -17, true), P('H', -1, -7.5, false), P('Y', 0, 3, true), P('Z', -1, 16, false)],
    basis: [PERSONNEL, SPLITS, ROLES],
  },
  {
    id: 'uc_i_form_21', name: 'I-formation, 21 personnel, under center', personnel: '21', shotgun: false, structure: '2x1 with a tight end',
    players: [...LINE, P('Q', -0.6, 0, false), P('F', -4, 0, false), P('R', -7, 0, false), P('X', 0, -17, true), P('Y', 0, 3, true), P('Z', -1, 16, false)],
    basis: [PERSONNEL, SPLITS, ROLES],
  },
];

export const FORMATION_BY_ID: ReadonlyMap<string, FormationDef> = new Map(FORMATIONS.map((f) => [f.id, f]));
